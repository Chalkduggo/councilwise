'use strict';
/* global App, esc, go, call, badge, statusChip, planChip, STATUS, SESSION_STATUS, fmtDur, fmtTime, toast, modal */

const STAGES = [
  ['preflight', 'Preflight'], ['r1', 'Independent reviews'], ['r2', 'Peer review'], ['fc', 'Fact check'],
  ['head', 'Head ruling'], ['mod', 'Moderation'], ['reports', 'Reports']
];

App.views.run = {
  s: null, timer: null,
  async load(params) {
    const id = (params && params.id) || App.liveId;
    if (!id) { this.s = null; return; }
    this.s = (App.live && App.live.id === id) ? App.live : await call('session:get', id);
    App.liveId = id; App.live = this.s;
  },
  render() {
    const s = this.s;
    if (!s) return `<div class="ph"><div><div class="eyebrow">Live run</div><h1>No council running</h1><p>Start a council, or open one from Sessions &amp; reports.</p></div></div>
      <div class="card empty"><button class="btn primary" data-goto="new">New council</button></div>`;
    return `<div id="runroot">${this.body(s)}</div>`;
  },
  elapsed(s) {
    const base = (s.timing && s.timing.activeMs) || 0;
    return s.timing && s.timing.runStartedAt ? base + (Date.now() - s.timing.runStartedAt) : base;
  },
  body(s) {
    const st = s.status;
    const doneStages = s.stageDone || {};
    const mstates = s.memberState || {};
    const need = s.members.filter(m => (mstates[m.id] || {}).status === 'needs_you');
    const running = st === 'running' || st === 'paused';
    const pausing = s.pauseRequested && st === 'running';
    return `
    <div class="ph">
      <div><div class="eyebrow">Live run · ${esc(s.templateName || '')}${s.config.demo ? ' · <span class="demoflag">DEMO</span>' : ''}</div>
        <div class="runhead"><h1>${esc(s.title)}</h1>${statusChip(pausing ? 'paused' : st, pausing ? 'Pausing…' : SESSION_STATUS[st])}</div>
        <p>${esc(s.file.name)} · ${Number(s.file.words || 0).toLocaleString()} words · ${s.config.mode === 'assisted' ? 'Assisted' : 'Automatic'} mode</p></div>
      <div class="row">
        <span class="timer" id="timer">${fmtDur(this.elapsed(s))}</span>
        ${st === 'running' && !pausing ? '<button class="btn" data-act="pause">Pause</button>' : ''}
        ${st === 'paused' || pausing ? '<button class="btn primary" data-act="resume">Resume</button>' : ''}
        ${running ? '<button class="btn" data-act="stop">Stop</button>' : ''}
        ${st === 'stopped' || st === 'failed' ? '<button class="btn primary" data-act="restart">Resume from checkpoint</button>' : ''}
        ${st === 'completed' ? '<button class="btn red lg" data-act="report">View the report</button>' : ''}
      </div>
    </div>
    ${need.map(m => `<div class="attn">${badge(m)}<div style="flex:1"><b>${esc(m.name)} needs you</b><span>${esc(mstates[m.id].note)}</span></div>
      ${m.connection === 'web' && !s.config.demo ? `<button class="btn sm" data-show="${esc(m.id)}">Show window</button>` : ''}
      <button class="btn sm primary" style="background:#fff;color:#111113" data-retry="${esc(m.id)}">Retry</button>
      <button class="btn sm" style="background:transparent;color:#fff" data-skip="${esc(m.id)}">Skip member</button></div>`).join('')}
    ${st === 'failed' ? `<div class="warn" style="margin-bottom:14px"><b>The council stopped with an error.</b>&nbsp;${esc((s.error || '').split('\n')[0])}</div>` : ''}
    ${st === 'stopped' ? '<div class="note" style="margin-bottom:14px">Stopped. Everything finished so far is saved. Resume continues from the last completed step.</div>' : ''}

    <div class="stepper">${STAGES.map(([id, name], i) => {
      const cls = doneStages[id] || st === 'completed' ? 'done' : s.stage === id ? 'now' : '';
      return `<div class="${cls}"><small>${String(i + 1).padStart(2, '0')}</small>${esc(name)}</div>`;
    }).join('')}</div>

    <div class="grid2">
      <section class="card">
        <div class="row between"><h2 style="margin:0">Council ring</h2><span class="small muted">Click a member to see its answer</span></div>
        <div class="ringwrap" style="margin-top:8px">${this.ring(s)}</div>
        <div class="legendrow" style="margin-top:10px">${['working', 'waiting', 'paused', 'needs_you', 'retrying', 'stopped', 'skipped', 'done'].map(x => statusChip(x)).join('')}</div>
      </section>
      <section class="card">
        <h2>Members</h2>
        <div class="stack" style="gap:8px">${s.members.map(m => this.mcard(s, m)).join('')}</div>
      </section>
    </div>

    <section class="card" style="margin-top:16px">
      <div class="row between"><h2 style="margin:0">Timeline</h2><span class="small muted">${s.log.length} events · saved after every step</span></div>
      <div class="log" style="margin-top:10px">${s.log.slice().reverse().map(l => {
        const m = s.members.find(x => x.id === l.memberId);
        return `<div class="${l.level === 'warn' ? 'warn2' : l.level === 'error' ? 'err' : l.level === 'ok' ? 'okk' : ''}"><span>${esc(fmtTime(l.t))}</span><span>${esc(m ? m.name : 'Council')}</span><span>${esc(l.msg)}</span></div>`;
      }).join('')}</div>
    </section>`;
  },
  ring(s) {
    const ms = s.memberState || {};
    const mod = s.members.find(m => m.id === s.moderatorId) || s.members[0];
    const others = s.members.filter(m => m.id !== mod.id);
    const n = others.length, R = 158, C = 200;
    const pos = others.map((m, i) => {
      const a = -Math.PI / 2 + (2 * Math.PI * i) / n;
      return { m, x: C + R * Math.cos(a), y: C + R * Math.sin(a) };
    });
    const lines = pos.map(p => {
      const special = p.m.id === s.headId || p.m.id === s.factCheckerId;
      const active = ['working', 'needs_you', 'retrying'].includes((ms[p.m.id] || {}).status);
      return `<line x1="${C}" y1="${C}" x2="${p.x}" y2="${p.y}" stroke="${special ? '#D7192F' : active ? '#111113' : '#D4D4D8'}" stroke-width="${special ? 2.5 : active ? 2 : 1.5}" ${active ? 'stroke-dasharray="5 5"' : ''}/>`;
    }).join('');
    const modState = (ms[mod.id] || {}).status || 'idle';
    return `<div class="ring">
      <svg class="lines" width="400" height="400" viewBox="0 0 400 400" aria-hidden="true"><circle cx="200" cy="200" r="158" fill="none" stroke="#E4E4E7" stroke-width="2"/>${lines}</svg>
      ${pos.map(p => {
        const stt = (ms[p.m.id] || {}).status || 'idle';
        const tag = p.m.id === s.headId ? 'HEAD' : p.m.id === s.factCheckerId ? 'FACTS' : '';
        return `<div class="node ${esc(stt)}" style="left:${p.x - 36}px;top:${p.y - 36}px" data-member="${esc(p.m.id)}" title="${esc(p.m.name)} · ${esc(STATUS[stt] || stt)}">${tag ? `<span class="tag">${tag}</span>` : ''}<span>${esc(p.m.monogram)}</span><small>${esc(STATUS[stt] || stt)}</small></div>`;
      }).join('')}
      <div class="core" data-member="${esc(mod.id)}" title="Moderator: ${esc(mod.name)}"><span>${esc(mod.monogram)}</span><small>Moderator</small><small>${esc(STATUS[modState] || modState)}</small></div>
    </div>`;
  },
  mcard(s, m) {
    const ms = (s.memberState || {})[m.id] || { status: 'idle', note: '' };
    const tags = [m.id === s.headId && '<span class="chip red">Council Head</span>', m.id === s.moderatorId && '<span class="chip ink">Moderator</span>', m.id === s.factCheckerId && '<span class="chip">Fact-checker</span>'].filter(Boolean).join('');
    const role = (App.roles.find(r => r.id === m.roleId) || {}).name || '';
    const canShow = m.connection === 'web' && !s.config.demo;
    return `<div class="mcard ${esc(ms.status)}">
      ${badge(m, m.id === s.headId ? 'head' : '')}
      <div><div class="nm">${esc(m.name)} ${tags} ${planChip(m.plan)}</div><div class="nt">${esc(role)} · Reviewer ${esc(m.letter)}${ms.note ? ' — ' + esc(ms.note) : ''}</div></div>
      <div class="act">${statusChip(ms.status)}
        ${canShow ? `<button class="btn sm ghost" data-show="${esc(m.id)}">Window</button>` : ''}
        ${s.steps['r1:' + m.id] && s.steps['r1:' + m.id].chars ? `<button class="btn sm ghost" data-member="${esc(m.id)}">Answers</button>` : ''}
      </div></div>`;
  },
  update(snap) {
    this.s = snap;
    const root = document.getElementById('runroot');
    if (!root) return;
    const sc = document.getElementById('view').scrollTop;
    root.innerHTML = this.body(snap);
    this.bind(document.getElementById('view'));
    document.getElementById('view').scrollTop = sc;
  },
  mount(root) {
    this.bind(root);
    clearInterval(this.timer);
    this.timer = setInterval(() => {
      if (App.view !== 'run') { clearInterval(this.timer); return; }
      const el = document.getElementById('timer');
      if (el && this.s) el.textContent = fmtDur(this.elapsed(this.s));
    }, 1000);
  },
  bind(root) {
    const s = this.s;
    if (!s) return;
    const act = (sel, fn) => { const el = root.querySelector(sel); if (el) el.onclick = fn; };
    act('[data-act="pause"]', () => call('session:pause', s.id));
    act('[data-act="resume"]', () => call('session:resume', s.id));
    act('[data-act="restart"]', () => call('session:resume', s.id));
    act('[data-act="stop"]', () => { if (confirmStop()) call('session:stop', s.id); });
    act('[data-act="report"]', () => go('report', { id: s.id }));
    root.querySelectorAll('[data-show]').forEach(b => b.onclick = (e) => { e.stopPropagation(); call('session:memberAction', s.id, b.dataset.show, 'show'); });
    root.querySelectorAll('[data-retry]').forEach(b => b.onclick = () => call('session:memberAction', s.id, b.dataset.retry, 'retry'));
    root.querySelectorAll('[data-skip]').forEach(b => b.onclick = () => call('session:memberAction', s.id, b.dataset.skip, 'skip'));
    root.querySelectorAll('[data-member]').forEach(b => b.onclick = () => showAnswers(s, b.dataset.member));
  }
};

function confirmStop() {
  // A real dialog would block the window; a second click within 4 seconds confirms.
  const now = Date.now();
  if (App._stopArmed && now - App._stopArmed < 4000) { App._stopArmed = 0; return true; }
  App._stopArmed = now;
  toast('Click Stop again to confirm. Finished work is kept and you can resume later.');
  return false;
}

async function showAnswers(s, memberId) {
  const m = s.members.find(x => x.id === memberId);
  const keys = Object.keys(s.steps).filter(k => k.endsWith(':' + memberId) && s.steps[k].chars);
  if (!keys.length) { toast(`${m.name} has not answered yet.`); return; }
  const names = { r1: 'Independent review', r2: 'Peer review', fc: 'Fact check', head: 'Council Head ruling', mod: 'Moderation' };
  const parts = [];
  for (const k of keys) {
    const r = await call('session:raw', s.id, k);
    parts.push(`<h3>${esc(names[k.split(':')[0]] || k)}</h3><pre>${esc(r.response)}</pre>`);
  }
  modal(`<div class="row between"><h2 style="margin:0">${esc(m.name)} · answers</h2><button class="btn sm" data-close>Close</button></div>${parts.join('')}`);
}
