'use strict';
// Runs a complete council in-process with simulated (demo) members and checks
// every stage, pause/resume, a user Retry, checkpoints and the reports.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const store = require('../../src/main/store');
const demo = require('../../src/main/demo');
const { Council } = require('../../src/main/council/orchestrator');
const model = require('../../src/main/reports/model');
const render = require('../../src/main/reports/render');

const ROOT = path.join(__dirname, '..', '..');
const tpl = JSON.parse(fs.readFileSync(path.join(ROOT, 'templates', 'business-plan.json'), 'utf8'));
const roles = JSON.parse(fs.readFileSync(path.join(ROOT, 'templates', 'roles.json'), 'utf8'));

function fakeMembers(limit = 60000) {
  return {
    list: () => [{ id: 'perplexity', webAccess: true }],
    check: async () => ({ signedIn: true, plan: 'Pro' }),
    showWindow() {},
    client: (id, ctx) => ({
      conn: 'demo', limit, adapter: {},
      newThread: async () => {}, ensureThread: async () => {},
      send: (text, opts) => demo.send({ id, name: id, roleId: opts.roleId }, text, { sessionId: ctx.id, hiccup: ctx.demoHiccup, fast: true, shouldAbort: opts.shouldAbort, lastLongText: opts.lastLongText })
    })
  };
}

function makeSession(dir, ids, extra = {}) {
  const textPath = path.join(dir, 'doc.txt');
  fs.writeFileSync(textPath, 'Launch plan\n\n' + 'Some content. '.repeat(extra.big ? 9000 : 200));
  const letters = 'ABCDEFGH'.split('');
  return {
    id: 'test-' + Math.random().toString(36).slice(2, 7), title: 'Test plan', createdAt: new Date().toISOString(), status: 'ready', stage: 'preflight', stageDone: {},
    templateId: tpl.id, templateName: tpl.name,
    config: { brief: 'Is it ready?', templateId: tpl.id, mode: 'auto', options: { peerReview: true, factCheck: true }, format: 'txt', demo: true, fastDemo: true, demoHiccup: !!extra.hiccup },
    file: { name: 'plan.md', path: textPath, textPath, size: 1000, chars: 1000, words: 200 },
    members: ids.map((id, i) => ({ id, name: id, monogram: id.slice(0, 2).toUpperCase(), connection: 'demo', plan: 'Demo', roleId: tpl.defaultRoles[id], letter: letters[i] })),
    headId: ids[1], moderatorId: ids[0], factCheckerId: null,
    steps: {}, memberState: {}, log: [], timing: {}, stats: { messages: 0, words: 0 }, outputs: []
  };
}

const IDS = ['claude', 'gemini', 'chatgpt', 'perplexity', 'grok', 'deepseek', 'mistral', 'cohere'];

function deps(members) {
  return { members, store, templates: { [tpl.id]: tpl }, roles, settings: { retries: 1, concurrency: 4 }, reports: { generate: async (s, kind, fmt) => { const p = path.join(store.sessionDir(s.id), `${kind}.${fmt}`); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, render.text(model.build(s, kind))); return p; } } };
}

test('full council run produces a scored result and reports', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cw-'));
  store.init(dir, null);
  const s = makeSession(dir, IDS);
  const c = new Council(s, deps(fakeMembers()));
  await c.run();
  assert.strictEqual(s.status, 'completed', s.error || s.log.map(l => l.msg).join('\n'));
  const r = s.result;
  assert.ok(r.confidence.score >= 0 && r.confidence.score <= 100);
  assert.strictEqual(r.members.filter(m => m.participated).length, 8);
  assert.ok(r.scorecard.length === tpl.dimensions.length);
  assert.ok(r.final.changes.length > 0);
  assert.strictEqual(s.factCheckerId, 'perplexity');
  assert.ok(r.facts.length > 0);
  assert.strictEqual(s.outputs.length, 4);
  for (const kind of ['full', 'summary', 'changes', 'raw']) {
    const blocks = model.build(s, kind);
    assert.ok(render.text(blocks).length > 100);
    assert.ok(render.md(blocks).length > 100);
    assert.ok(render.html(blocks).includes('Council'));
  }
  const buf = await render.docx(model.build(s, 'full'));
  assert.ok(buf.length > 5000);
  fs.writeFileSync(path.join(dir, 'report.docx'), buf);
  process.env.CW_TEST_OUT && fs.copyFileSync(path.join(dir, 'report.docx'), process.env.CW_TEST_OUT);
});

test('needs-you, retry, pause, stop and resume', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cw-'));
  store.init(dir, null);
  const s = makeSession(dir, IDS.slice(0, 5), { hiccup: true });
  const c = new Council(s, deps(fakeMembers()));
  let sawNeedsYou = false, sawPaused = false;
  c.on('attention', ({ memberId }) => { sawNeedsYou = true; setTimeout(() => c.memberAction(memberId, 'retry'), 50); });
  c.on('update', snap => { if (snap.status === 'paused') sawPaused = true; });
  const run = c.run();
  setTimeout(() => c.pause(), 30);
  setTimeout(() => c.resumeFromPause(), 400);
  await run;
  assert.ok(sawNeedsYou, 'grok hiccup should ask the user');
  assert.ok(sawPaused, 'pause should be visible');
  assert.strictEqual(s.status, 'completed');

  // stop mid-run, then resume from checkpoint
  const s2 = makeSession(dir, IDS.slice(0, 4));
  const c2 = new Council(s2, deps(fakeMembers()));
  const run2 = c2.run();
  setTimeout(() => c2.stop(), 200);
  await run2;
  assert.strictEqual(s2.status, 'stopped');
  const saved = store.loadSession(s2.id);
  const c3 = new Council(saved, deps(fakeMembers()));
  await c3.run();
  assert.strictEqual(saved.status, 'completed');
});

test('long documents are sent in parts', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cw-'));
  store.init(dir, null);
  const s = makeSession(dir, IDS.slice(0, 3), { big: true });
  const c = new Council(s, deps(fakeMembers(30000)));
  await c.run();
  assert.strictEqual(s.status, 'completed', s.error);
  assert.ok(s.log.length > 0);
  assert.ok(s.stats.messages > 3 * 4);
});

test('skipping a member still completes and head falls back', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cw-'));
  store.init(dir, null);
  const s = makeSession(dir, ['claude', 'gemini', 'chatgpt']);
  const fm = fakeMembers();
  const orig = fm.client;
  fm.client = (id, ctx) => { const cl = orig(id, ctx); if (id === 'gemini') cl.send = async () => { const { NeedsUserError } = require('../../src/main/adapters/engine'); throw new NeedsUserError('login_expired', 'signed out'); }; return cl; };
  const c = new Council(s, deps(fm));
  c.on('attention', ({ memberId }) => setTimeout(() => c.memberAction(memberId, 'skip'), 10));
  await c.run();
  assert.strictEqual(s.status, 'completed', s.error);
  assert.notStrictEqual(s.headId, 'gemini');
});
