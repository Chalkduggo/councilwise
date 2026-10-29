'use strict';
// Runs a council session end to end:
//   Preflight → Round 1 independent reviews → Round 2 anonymous peer review →
//   Fact check → Round 3 Council Head ruling → Round 4 moderation → Reports.
// The session is checkpointed after every step, so a crash, restart or Stop can
// always be resumed from where it left off.

const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');
const prompts = require('./prompts');
const parse = require('./parse');
const score = require('./score');
const docs = require('../docs');
const { NeedsUserError } = require('../adapters/engine');

const STAGES = [
  { id: 'preflight', name: 'Preflight' },
  { id: 'r1', name: 'Independent reviews' },
  { id: 'r2', name: 'Peer review' },
  { id: 'fc', name: 'Fact check' },
  { id: 'head', name: 'Council Head ruling' },
  { id: 'mod', name: 'Moderation' },
  { id: 'reports', name: 'Reports' }
];

const sleep = ms => new Promise(r => setTimeout(r, ms));

class Council extends EventEmitter {
  constructor(session, deps) {
    super();
    this.s = session;
    this.d = deps; // { members, store, templates, roles, settings, reports }
    this.pauseRequested = false;
    this.stopRequested = false;
    this.decisions = new Map(); // memberId -> resolver for needs_you
    this.saveTimer = null;
    this.running = false;
  }

  // ---------- public controls ----------
  pause() { if (this.running) { this.pauseRequested = true; this.s.pauseRequested = true; this.log(null, 'info', 'Pause requested. Members finish their current message, then wait.'); this.emitUpdate(); } }
  resumeFromPause() { this.pauseRequested = false; this.s.pauseRequested = false; if (this._pauseResolve) this._pauseResolve(); this.log(null, 'info', 'Resumed.'); }
  stop() {
    this.stopRequested = true;
    this.pauseRequested = false;
    this.s.pauseRequested = false;
    if (this._pauseResolve) this._pauseResolve();
    for (const [, res] of this.decisions) res('stop');
    this.log(null, 'warn', 'Stop requested.');
  }
  memberAction(memberId, action) {
    const res = this.decisions.get(memberId);
    if (res) { this.decisions.delete(memberId); res(action); }
  }

  // ---------- state helpers ----------
  memberState(id) { this.s.memberState[id] = this.s.memberState[id] || { status: 'idle', note: '' }; return this.s.memberState[id]; }
  setMember(id, status, note = '') {
    const ms = this.memberState(id);
    ms.status = status; ms.note = note; ms.updatedAt = Date.now();
    this.emitUpdate();
  }
  step(key) { this.s.steps[key] = this.s.steps[key] || { status: 'pending', attempts: 0 }; return this.s.steps[key]; }
  log(memberId, level, msg) {
    this.s.log.push({ t: Date.now(), memberId, level, msg });
    if (this.s.log.length > 2000) this.s.log.splice(0, this.s.log.length - 2000);
    this.emitUpdate();
  }
  save() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.d.store.saveSession(this.s), 250);
  }
  saveNow() { clearTimeout(this.saveTimer); this.d.store.saveSession(this.s); }
  emitUpdate() { this.save(); this.emit('update', snapshot(this.s)); }
  member(id) { return this.s.members.find(m => m.id === id); }
  activeMembers() { return this.s.members.filter(m => !['skipped', 'failed'].includes(this.memberState(m.id).status) || this.step('r1:' + m.id).status === 'done'); }
  template() { return this.d.templates[this.s.config.templateId] || this.d.templates['document-review']; }
  role(id) { return this.d.roles.find(r => r.id === id) || { id, name: 'Reviewer', brief: 'Give an honest, rigorous review.' }; }

  async checkpoint() {
    if (this.stopRequested) throw new NeedsUserError('aborted', 'Stopped by user.');
    if (this.pauseRequested) {
      this.s.status = 'paused';
      for (const m of this.s.members) {
        const ms = this.memberState(m.id);
        if (['working', 'waiting', 'retrying', 'ready'].includes(ms.status)) { ms.prevStatus = ms.status; ms.status = 'paused'; }
      }
      this.emitUpdate();
      await new Promise(r => { this._pauseResolve = r; });
      this._pauseResolve = null;
      if (this.stopRequested) throw new NeedsUserError('aborted', 'Stopped by user.');
      this.s.status = 'running';
      for (const m of this.s.members) {
        const ms = this.memberState(m.id);
        if (ms.status === 'paused') ms.status = ms.prevStatus === 'working' ? 'waiting' : (ms.prevStatus || 'waiting');
      }
      this.emitUpdate();
    }
  }

  // Ask the user what to do when a member is stuck. Resolves 'retry' | 'skip' | 'stop'.
  async askUser(memberId, note) {
    this.setMember(memberId, 'needs_you', note);
    this.log(memberId, 'warn', note);
    this.emit('attention', { memberId, note });
    const choice = await new Promise(r => this.decisions.set(memberId, r));
    if (choice === 'stop') throw new NeedsUserError('aborted', 'Stopped by user.');
    return choice;
  }

  // Run fn with automatic retries for temporary errors, then hand over to the user.
  async withRetry(memberId, label, fn) {
    const retries = this.d.settings.retries == null ? 2 : this.d.settings.retries;
    let attempt = 0;
    for (;;) {
      await this.checkpoint();
      try {
        return await fn();
      } catch (e) {
        if (this.stopRequested || (e instanceof NeedsUserError && e.reason === 'aborted')) throw new NeedsUserError('aborted', 'Stopped by user.');
        const needsUser = e instanceof NeedsUserError && ['no_input', 'login_expired', 'type_failed'].includes(e.reason);
        if (!needsUser && attempt < retries) {
          attempt++;
          const wait = Math.min(30000, 3000 * 2 ** (attempt - 1));
          this.setMember(memberId, 'retrying', `${label}: ${shortErr(e)} — retry ${attempt} of ${retries}`);
          this.log(memberId, 'warn', `${label} failed (${shortErr(e)}). Retrying in ${Math.round(wait / 1000)}s.`);
          await sleep(wait);
          continue;
        }
        const choice = await this.askUser(memberId, `${label}: ${shortErr(e)}`);
        if (choice === 'skip') return SKIP;
        if (choice === 'show') { this.d.members.showWindow(memberId); }
        attempt = 0;
        this.setMember(memberId, 'working', `Retrying ${label.toLowerCase()}…`);
      }
    }
  }

  // Send text to a member, splitting into parts if it is longer than the member's limit.
  async sendLong(client, memberId, text, extra = {}) {
    const ms = this.memberState(memberId);
    const opts = {
      mode: this.s.config.mode, timeoutMs: (this.d.settings.responseTimeoutMin || 12) * 60000,
      shouldAbort: () => this.stopRequested, roleId: this.member(memberId).roleId,
      onWaitingForUser: (note) => { this.setMember(memberId, 'needs_you', note); this.emit('attention', { memberId, note }); },
      ...extra
    };
    const reply = async (t, o) => {
      const out = await client.send(t, o);
      this.s.stats.messages++;
      this.s.stats.words += docs.countWords(out);
      if (ms.status === 'needs_you') this.setMember(memberId, 'working', 'Answer received.');
      return out;
    };
    if (text.length <= client.limit) return reply(text, opts);
    const parts = docs.split(text, client.limit - 400);
    for (let i = 0; i < parts.length; i++) {
      this.setMember(memberId, 'working', `Sending long message, part ${i + 1} of ${parts.length}`);
      await reply(prompts.messagePart(i + 1, parts.length, parts[i]), opts);
    }
    return reply(prompts.afterParts(parts.length), { ...opts, lastLongText: text });
  }

  // Send, parse, and ask once for a format fix if the JSON is missing.
  async ask(client, memberId, key, text, normalize, kind) {
    const st = this.step(key);
    st.status = 'working'; st.startedAt = st.startedAt || Date.now(); st.prompt = text;
    this.save();
    let response = await this.sendLong(client, memberId, text);
    let parsed = normalize(parse.extractJson(response));
    if (!parsed && !this.stopRequested) {
      this.log(memberId, 'warn', `Answer for ${kind} had no readable JSON; asking for a format fix.`);
      const fix = await client.send(prompts.repair(kind), { mode: this.s.config.mode, shouldAbort: () => this.stopRequested, timeoutMs: 5 * 60000, roleId: this.member(memberId).roleId });
      this.s.stats.messages++;
      parsed = normalize(parse.extractJson(fix));
      if (parsed) response = response + '\n\n[format fix]\n' + fix;
    }
    st.response = response; st.parsed = parsed; st.endedAt = Date.now(); st.attempts++;
    st.status = parsed ? 'done' : 'unreadable';
    this.save();
    return parsed;
  }

  // ---------- main run ----------
  async run() {
    if (this.running) return;
    this.running = true;
    this.stopRequested = false;
    this.s.status = 'running';
    this.s.timing.startedAt = this.s.timing.startedAt || Date.now();
    this._runStart = Date.now();
    this.s.timing.runStartedAt = this._runStart;
    this.s.pauseRequested = false;
    this.log(null, 'info', this.s.timing.resumedCount ? 'Resuming the council from its last checkpoint.' : 'Council started.');
    try {
      for (const stage of STAGES) {
        if (this.s.stageDone[stage.id]) continue;
        this.s.stage = stage.id;
        this.emitUpdate();
        await this.checkpoint();
        await this['stage_' + stage.id]();
        this.s.stageDone[stage.id] = true;
        this.saveNow();
      }
      this.s.status = 'completed';
      this.s.stage = 'done';
      this.s.timing.endedAt = Date.now();
      this.log(null, 'ok', 'Council complete. Reports are ready.');
    } catch (e) {
      if (e instanceof NeedsUserError && e.reason === 'aborted') {
        this.s.status = 'stopped';
        for (const m of this.s.members) {
          const ms = this.memberState(m.id);
          if (!['done', 'skipped', 'failed'].includes(ms.status)) { ms.status = 'stopped'; ms.note = 'Stopped. Resume to continue from the last checkpoint.'; }
        }
        this.log(null, 'warn', 'Council stopped. Everything finished so far is saved; press Resume to continue.');
      } else {
        this.s.status = 'failed';
        this.s.error = String(e && e.stack || e);
        this.log(null, 'error', 'Council failed: ' + shortErr(e));
      }
    } finally {
      this.s.timing.activeMs = (this.s.timing.activeMs || 0) + (Date.now() - this._runStart);
      this.s.timing.runStartedAt = null;
      this.running = false;
      this.saveNow();
      this.emitUpdate();
      this.emit('finished', this.s.status);
    }
  }

  ctx() {
    const st = this.d.settings;
    return {
      id: this.s.id, forceDemo: !!this.s.config.demo, showWindows: !!st.showWindowsInAuto,
      demoHiccup: this.s.config.demoHiccup != null ? this.s.config.demoHiccup : st.demoHiccup,
      fastDemo: !!this.s.config.fastDemo, memberState: id => this.memberState(id)
    };
  }
  client(id) { return this.d.members.client(id, this.ctx()); }

  async pool(items, fn) {
    const n = Math.max(1, Math.min(8, this.d.settings.concurrency || 4));
    const queue = [...items];
    const errors = [];
    const worker = async () => {
      while (queue.length) {
        const it = queue.shift();
        try { await fn(it); } catch (e) { errors.push(e); }
      }
    };
    await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
    const abort = errors.find(e => e instanceof NeedsUserError && e.reason === 'aborted');
    if (abort) throw abort;
    if (errors.length) throw errors[0];
  }

  // ---------- stages ----------
  async stage_preflight() {
    await this.pool(this.s.members, async (m) => {
      if (this.step('pre:' + m.id).status === 'done') return;
      this.setMember(m.id, 'checking', 'Checking sign-in and plan…');
      const res = await this.withRetry(m.id, 'Sign-in check', async () => {
        if (this.s.config.demo) return { signedIn: true, plan: 'Demo' };
        const info = await this.d.members.check(m.id);
        if (!info.signedIn) throw new NeedsUserError('login_expired', info.connection === 'api' ? 'API key or model missing or rejected. Fix it in Members, then Retry.' : 'Not signed in. Sign in inside the window, then press Retry.');
        return info;
      });
      if (res === SKIP) { this.setMember(m.id, 'skipped', 'Skipped by you.'); this.step('pre:' + m.id).status = 'skipped'; return; }
      m.plan = res.plan || m.plan;
      this.step('pre:' + m.id).status = 'done';
      this.setMember(m.id, 'ready', `Ready · ${m.plan || 'Unknown'} plan`);
    });
    const ready = this.s.members.filter(m => this.step('pre:' + m.id).status === 'done');
    if (ready.length < 2) throw new Error('A council needs at least two members who are ready.');
    this.ensureLeaders();
  }

  ensureLeaders() {
    const ok = id => id && this.step('pre:' + id).status === 'done' && this.memberState(id).status !== 'skipped';
    const ready = this.s.members.filter(m => ok(m.id));
    if (!ok(this.s.headId)) { const n = ready.find(m => m.id !== this.s.moderatorId) || ready[0]; this.log(null, 'warn', `Council Head unavailable; ${n.name} takes over.`); this.s.headId = n.id; }
    if (!ok(this.s.moderatorId)) { const n = ready.find(m => m.id !== this.s.headId) || ready[0]; this.log(null, 'warn', `Moderator unavailable; ${n.name} takes over.`); this.s.moderatorId = n.id; }
  }

  async stage_r1() {
    const tpl = this.template();
    const docText = fs.readFileSync(this.s.file.textPath, 'utf8');
    const ready = this.s.members.filter(m => this.step('pre:' + m.id).status === 'done');
    for (const m of ready) if (this.step('r1:' + m.id).status !== 'done') this.setMember(m.id, 'waiting', 'Waiting for a free slot…');
    await this.pool(ready, async (m) => {
      if (this.step('r1:' + m.id).status === 'done') { this.setMember(m.id, 'done', 'Review complete'); return; }
      const c = this.client(m.id);
      const res = await this.withRetry(m.id, 'Independent review', async () => {
        this.setMember(m.id, 'working', 'Opening a new chat…');
        await c.newThread();
        const role = this.role(m.roleId);
        let docMode = 'inline', partCount = 0, attachPath;
        const promptSize = 9000;
        const canAttach = this.s.config.attachOriginal && c.conn === 'web' && c.adapter.upload && c.adapter.upload.supported && (this.s.file.size / 1e6) < (c.adapter.upload.maxMB || 0);
        if (canAttach) { docMode = 'attach'; attachPath = this.s.file.path; }
        else if (docText.length + promptSize > c.limit) {
          docMode = 'parts';
          const parts = docs.split(docText, c.limit - 600);
          partCount = parts.length;
          for (let i = 0; i < parts.length; i++) {
            await this.checkpoint();
            this.setMember(m.id, 'working', `Sending the document, part ${i + 1} of ${parts.length}`);
            await this.sendLong(c, m.id, prompts.docPart(i + 1, parts.length, parts[i]));
          }
        }
        this.setMember(m.id, 'working', docMode === 'attach' ? 'Uploading the file and writing the review…' : 'Writing the independent review…');
        const text = prompts.round1({ template: tpl, role, brief: this.s.config.brief, fileName: this.s.file.name, docMode, docText, partCount });
        return this.ask(c, m.id, 'r1:' + m.id, text, raw => parse.normalizeReview(raw, tpl), 'the review');
      });
      if (res === SKIP) { this.step('r1:' + m.id).status = 'skipped'; this.setMember(m.id, 'skipped', 'Skipped by you.'); return; }
      if (!res) { this.setMember(m.id, 'done', 'Answered, but not in a readable format. Kept in raw answers.'); this.log(m.id, 'warn', 'Review kept as raw text only.'); return; }
      this.setMember(m.id, 'done', `Review complete · ${res.findings.length} findings · ${labelVerdict(res.verdict)}`);
      this.log(m.id, 'ok', `Review in: ${labelVerdict(res.verdict)}, ${res.confidence} confidence, ${res.findings.length} findings.`);
    });
    if (this.parsedReviews().length < 2) throw new Error('Fewer than two readable reviews came back, so the council cannot continue. Check the raw answers and try again.');
    this.ensureLeaders();
  }

  parsedReviews() {
    return this.s.members
      .filter(m => this.step('r1:' + m.id).status === 'done' && this.step('r1:' + m.id).parsed)
      .map(m => ({ memberId: m.id, letter: m.letter, parsed: this.step('r1:' + m.id).parsed }));
  }

  async stage_r2() {
    const reviews = this.parsedReviews();
    if (!this.s.config.options.peerReview || reviews.length < 3) {
      this.log(null, 'info', reviews.length < 3 ? 'Peer review skipped: fewer than three readable reviews.' : 'Peer review turned off for this session.');
      return;
    }
    for (const r of reviews) this.setMember(r.memberId, 'waiting', 'Waiting for peer review…');
    await this.pool(reviews, async (r) => {
      const key = 'r2:' + r.memberId;
      if (this.step(key).status === 'done') { this.setMember(r.memberId, 'done', 'Peer review complete'); return; }
      const others = shuffle(reviews.filter(o => o.memberId !== r.memberId), this.s.id + r.memberId);
      const c = this.client(r.memberId);
      const res = await this.withRetry(r.memberId, 'Peer review', async () => {
        await c.ensureThread();
        this.setMember(r.memberId, 'working', `Reviewing ${others.length} anonymous reviews…`);
        return this.ask(c, r.memberId, key, prompts.round2({ others }), parse.normalizePeer, 'the peer review');
      });
      if (res === SKIP) { this.step(key).status = 'skipped'; this.setMember(r.memberId, 'done', 'Peer review skipped'); return; }
      this.setMember(r.memberId, 'done', res ? `Peer review complete · ${res.disputes.length} disputes` : 'Peer review unreadable; ignored');
    });
  }

  claims() {
    const seen = new Set();
    const out = [];
    for (const r of this.parsedReviews()) {
      for (const f of r.parsed.facts_to_check) {
        const k = f.claim.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 70);
        if (!k || seen.has(k)) continue;
        seen.add(k);
        out.push({ id: 'K' + (out.length + 1), claim: f.claim, where: f.where, raisedBy: r.letter });
        if (out.length >= 20) return out;
      }
    }
    return out;
  }

  pickFactChecker() {
    const ok = this.s.members.filter(m => this.step('r1:' + m.id).status === 'done');
    const ml = this.d.members.list();
    const web = id => (ml.find(x => x.id === id) || {}).webAccess;
    return ok.find(m => m.id === this.s.factCheckerId)
      || ok.find(m => m.roleId === 'factchecker' && web(m.id))
      || ok.find(m => m.id === 'perplexity')
      || ok.find(m => web(m.id) && m.id !== this.s.headId && m.id !== this.s.moderatorId)
      || ok[0];
  }

  async stage_fc() {
    const claims = this.claims();
    this.s.claims = claims;
    if (!this.s.config.options.factCheck || !claims.length) {
      this.log(null, 'info', claims.length ? 'Fact check turned off for this session.' : 'No facts were flagged for checking.');
      return;
    }
    const fc = this.pickFactChecker();
    this.s.factCheckerId = fc.id;
    const key = 'fc:' + fc.id;
    if (this.step(key).status === 'done') return;
    const c = this.client(fc.id);
    const res = await this.withRetry(fc.id, 'Fact check', async () => {
      await c.ensureThread();
      this.setMember(fc.id, 'working', `Fact-checking ${claims.length} claims with live search…`);
      return this.ask(c, fc.id, key, prompts.factCheck({ claims }), parse.normalizeFacts, 'the fact check');
    });
    if (res === SKIP) { this.step(key).status = 'skipped'; this.setMember(fc.id, 'done', 'Fact check skipped'); return; }
    this.setMember(fc.id, 'done', res ? `Fact check complete · ${res.checks.length} claims` : 'Fact check unreadable');
  }

  factResults() {
    const claims = this.s.claims || [];
    const st = this.s.factCheckerId ? this.step('fc:' + this.s.factCheckerId) : null;
    const checks = (st && st.parsed && st.parsed.checks) || [];
    return claims.map(c => {
      const k = checks.find(x => x.id === c.id);
      return { ...c, status: k ? k.status : 'unchecked', correct_value: k ? k.correct_value : '', source: k ? k.source : '' };
    }).filter(c => c.status !== 'unchecked');
  }

  peerAggregate() {
    const disputes = [], unsupportedCounts = {}, missed = [], ranks = {};
    for (const m of this.s.members) {
      const st = this.step('r2:' + m.id);
      if (!st.parsed) continue;
      for (const d of st.parsed.disputes) disputes.push({ ...d, by: m.letter });
      for (const u of st.parsed.unsupported) unsupportedCounts[u] = (unsupportedCounts[u] || 0) + 1;
      missed.push(...st.parsed.missed);
      for (const r of st.parsed.rankings) if (r.reviewer && r.rank) (ranks[r.reviewer] = ranks[r.reviewer] || []).push(r.rank);
    }
    const unsupported = Object.entries(unsupportedCounts).map(([ref, count]) => ({ ref, count })).sort((a, b) => b.count - a.count);
    return { disputes, unsupported, unsupportedCounts, missed, ranks };
  }

  reviewsWithFinal() {
    return this.parsedReviews().map(r => {
      const p2 = this.step('r2:' + r.memberId).parsed;
      return { ...r, final: { verdict: (p2 && p2.verdict_after_reading) || r.parsed.verdict, confidence: (p2 && p2.confidence_after_reading) || r.parsed.confidence } };
    });
  }

  async stage_head() {
    const head = this.member(this.s.headId);
    const key = 'head:' + head.id;
    if (this.step(key).status === 'done') return;
    const c = this.client(head.id);
    const reviews = this.reviewsWithFinal();
    const text = prompts.headRuling({ reviews, peer: this.peerAggregate(), facts: this.factResults(), template: this.template(), brief: this.s.config.brief });
    const res = await this.withRetry(head.id, 'Council Head ruling', async () => {
      await c.ensureThread();
      this.setMember(head.id, 'working', 'Writing the Council Head ruling…');
      return this.ask(c, head.id, key, text, parse.normalizeRuling, 'the ruling');
    });
    if (!res || res === SKIP) {
      this.step(key).status = 'fallback';
      this.step(key).parsed = fallbackRuling(reviews);
      this.log(head.id, 'warn', 'No usable ruling from the Council Head; using the majority verdict instead.');
      this.setMember(head.id, 'done', 'Ruling unavailable; majority verdict used');
      return;
    }
    this.setMember(head.id, 'done', `Ruling complete · ${labelVerdict(res.verdict)} · ${res.rulings.length} rulings`);
    this.log(head.id, 'ok', `Council Head ruled: ${labelVerdict(res.verdict)}, ${res.confidence} confidence.`);
  }

  ruling() { const st = this.step('head:' + this.s.headId); return st.parsed; }

  async stage_mod() {
    const mod = this.member(this.s.moderatorId);
    const key = 'mod:' + mod.id;
    if (this.step(key).status === 'done' || this.step(key).status === 'fallback') { this.buildResult(); return; }
    const c = this.client(mod.id);
    const text = prompts.moderation({ ruling: this.ruling(), reviews: this.reviewsWithFinal(), facts: this.factResults(), template: this.template() });
    const res = await this.withRetry(mod.id, 'Moderation', async () => {
      await c.ensureThread();
      this.setMember(mod.id, 'working', 'Moderating: checking the ruling and writing the final report…');
      return this.ask(c, mod.id, key, text, parse.normalizeFinal, 'the final report');
    });
    if (!res || res === SKIP) {
      this.step(key).status = 'fallback';
      this.step(key).parsed = fallbackFinal(this.ruling(), this.reviewsWithFinal());
      this.log(mod.id, 'warn', 'No usable moderation; the final report is built from the Council Head ruling.');
    }
    this.setMember(mod.id, 'done', 'Moderation complete');
    this.buildResult();
  }

  buildResult() {
    const tpl = this.template();
    const reviews = this.reviewsWithFinal();
    const final = this.step('mod:' + this.s.moderatorId).parsed || fallbackFinal(this.ruling(), reviews);
    const ruling = this.ruling() || fallbackRuling(reviews);
    const peer = this.peerAggregate();
    const facts = this.factResults();
    const findingsByLetter = Object.fromEntries(reviews.map(r => [r.letter, r.parsed.findings]));
    const disputedRefs = [...new Set(peer.disputes.map(d => d.ref))];
    const confidence = score.compute({
      memberVerdicts: reviews.map(r => r.final.verdict), finalVerdict: final.final_verdict,
      findingsByLetter, unsupportedCounts: peer.unsupportedCounts, checks: facts, disputedRefs, rulings: ruling.rulings
    });
    const avg = l => { const a = peer.ranks[l]; return a && a.length ? +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(2) : null; };
    const members = this.s.members.map(m => {
      const r = reviews.find(x => x.memberId === m.id);
      const ms = this.memberState(m.id);
      return {
        id: m.id, name: m.name, monogram: m.monogram, letter: m.letter, roleName: this.role(m.roleId).name, plan: m.plan,
        connection: m.connection, isHead: m.id === this.s.headId, isModerator: m.id === this.s.moderatorId, isFactChecker: m.id === this.s.factCheckerId,
        participated: !!r, status: ms.status,
        verdict: r ? r.parsed.verdict : null, confidence: r ? r.parsed.confidence : null,
        finalVerdict: r ? r.final.verdict : null, finalConfidence: r ? r.final.confidence : null,
        findings: r ? r.parsed.findings.length : 0, peerRank: avg(m.letter)
      };
    });
    const ranked = members.filter(m => m.peerRank != null).sort((a, b) => a.peerRank - b.peerRank);
    this.s.result = {
      verdict: final.final_verdict, statedConfidence: final.final_confidence, confidence,
      tally: score.tally(reviews.map(r => r.final.verdict)),
      scorecard: score.scorecard(tpl, reviews),
      final, ruling, facts, members,
      disputes: peer.disputes, unsupported: peer.unsupported, missed: peer.missed,
      mostUseful: ranked[0] ? ranked[0].id : null,
      stats: {
        membersTotal: this.s.members.length, membersAnswered: reviews.length,
        findings: reviews.reduce((n, r) => n + r.parsed.findings.length, 0),
        disputes: disputedRefs.length, rulings: ruling.rulings.length,
        changes: final.changes.length, factsChecked: facts.length,
        factsWrong: facts.filter(f => f.status === 'wrong' || f.status === 'outdated').length,
        contradictionsFixed: final.contradictions_fixed.length,
        words: this.s.stats.words, messages: this.s.stats.messages,
        durationMs: (this.s.timing.activeMs || 0) + (Date.now() - (this._runStart || Date.now()))
      },
      demo: !!this.s.config.demo,
      builtAt: new Date().toISOString()
    };
    this.save();
  }

  async stage_reports() {
    if (!this.s.result) this.buildResult();
    this.s.result.stats.durationMs = (this.s.timing.activeMs || 0) + (Date.now() - this._runStart);
    const fmt = this.s.config.format || 'pdf';
    const kinds = ['full', 'summary', 'changes'];
    this.s.outputs = [];
    for (const kind of kinds) {
      await this.checkpoint();
      const out = await this.d.reports.generate(this.s, kind, fmt);
      this.s.outputs.push({ kind, format: fmt, path: out });
    }
    this.s.outputs.push({ kind: 'raw', format: 'txt', path: await this.d.reports.generate(this.s, 'raw', 'txt') });
    this.log(null, 'ok', `Reports saved to ${path.dirname(this.s.outputs[0].path)}`);
  }
}

const SKIP = Symbol('skip');

function shortErr(e) { return String((e && e.message) || e).split('\n')[0].slice(0, 200); }
function labelVerdict(v) { return { go: 'Go', go_with_conditions: 'Go with conditions', revise: 'Revise', no_go: 'No-go' }[v] || v; }

function shuffle(list, seed) {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) { h = (h * 1103515245 + 12345) >>> 0; const j = h % (i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

function majority(reviews) {
  const t = score.tally(reviews.map(r => r.final.verdict));
  return Object.entries(t).sort((a, b) => b[1] - a[1])[0][0];
}

function fallbackRuling(reviews) {
  return {
    verdict: majority(reviews), confidence: 'low', summary: 'No ruling was available from the Council Head; the majority verdict is shown.',
    rulings: [], conditions: [], minority: [], priorities: []
  };
}

function fallbackFinal(ruling, reviews) {
  ruling = ruling || fallbackRuling(reviews);
  const findings = reviews.flatMap(r => r.parsed.findings.map(f => ({ ...f, ref: `${r.letter}.${f.id}` })))
    .sort((a, b) => ['critical', 'major', 'minor'].indexOf(a.severity) - ['critical', 'major', 'minor'].indexOf(b.severity));
  return {
    final_verdict: ruling.verdict, final_confidence: ruling.confidence,
    headline: ruling.summary.slice(0, 200), executive_summary: ruling.summary,
    key_findings: findings.slice(0, 10).map(f => ({ title: f.title, severity: f.severity, detail: f.detail, recommendation: f.recommendation, refs: [f.ref] })),
    changes: findings.slice(0, 15).map((f, i) => ({ priority: i < 3 ? 'P1' : 'P2', where: f.evidence, change: f.recommendation, reason: f.title })),
    contradictions_fixed: [], conditions: ruling.conditions, minority_report: ruling.minority, open_questions: [], next_steps: []
  };
}

// What the UI needs, without the large prompt/answer texts.
function snapshot(s) {
  const steps = {};
  for (const [k, v] of Object.entries(s.steps)) steps[k] = { status: v.status, startedAt: v.startedAt, endedAt: v.endedAt, chars: v.response ? v.response.length : 0 };
  return {
    id: s.id, title: s.title, status: s.status, stage: s.stage, pauseRequested: !!s.pauseRequested, templateName: s.templateName, stageDone: s.stageDone, createdAt: s.createdAt,
    config: s.config, file: { name: s.file.name, words: s.file.words, chars: s.file.chars },
    members: s.members, headId: s.headId, moderatorId: s.moderatorId, factCheckerId: s.factCheckerId,
    memberState: Object.fromEntries(Object.entries(s.memberState).map(([k, v]) => [k, { status: v.status, note: v.note, updatedAt: v.updatedAt }])),
    steps, log: s.log.slice(-300), timing: s.timing, stats: s.stats, result: s.result || null, outputs: s.outputs || [], error: s.error || null
  };
}

module.exports = { Council, STAGES, snapshot, fallbackFinal, fallbackRuling, shuffle, labelVerdict, SKIP };
