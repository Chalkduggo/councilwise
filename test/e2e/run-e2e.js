'use strict';
// End-to-end test: launches the real Electron app, runs a full demo council,
// handles the "needs you" step, pauses and resumes, opens the report, exports
// PDF/Word/Text/Markdown, and saves screenshots to docs/screenshots.
// Run with:  npm run test:e2e   (on Linux CI: xvfb-run -a npm run test:e2e)
const { _electron: electron } = require('playwright');
const path = require('path');
const fs = require('fs');
const os = require('os');
const assert = require('assert');

const ROOT = path.join(__dirname, '..', '..');
const SHOTS = path.join(ROOT, 'docs', 'screenshots');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cw-e2e-'));
  const args = [ROOT, `--data-dir=${dataDir}`, '--demo'];
  if (process.platform === 'linux') args.push('--no-sandbox');
  const app = await electron.launch({ args, env: { ...process.env, ELECTRON_ENABLE_LOGGING: '1', CW_TEST_NO_EXTERNAL: '1' } });
  const win = await app.firstWindow();
  const errors = [];
  win.on('pageerror', e => errors.push(e.message));
  win.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await win.setViewportSize({ width: 1440, height: 920 });
  await win.waitForSelector('.hero');
  await sleep(3600); // let the first-run toast fade
  await win.screenshot({ path: path.join(SHOTS, '01-home.png') });

  // Optional frame recorder for a demo video (set CW_FRAMES to a folder).
  let recording = false, frameNo = 0;
  const framesDir = process.env.CW_FRAMES;
  const recorder = (async () => {
    if (!framesDir) return;
    fs.mkdirSync(framesDir, { recursive: true });
    recording = true;
    while (recording) {
      try { await win.screenshot({ path: path.join(framesDir, `f${String(frameNo++).padStart(5, '0')}.png`) }); } catch { /* window busy */ }
      await sleep(350);
    }
  })();
  const hold = ms => (framesDir ? sleep(ms) : Promise.resolve());
  await hold(1500);

  // Members screen
  await win.click('nav a[data-nav="members"]');
  await win.waitForSelector('text=Connect your models');
  await win.screenshot({ path: path.join(SHOTS, '02-members.png') });

  // New council screen with the sample document
  await win.click('nav a[data-nav="new"]');
  await win.waitForSelector('#drop');
  await win.click('[data-act="sample"]');
  await win.waitForSelector('.drop.has');
  await win.click('[data-tpl="business-plan"]');
  await win.waitForSelector('[data-tpl="business-plan"].on');
  await win.fill('#brief', 'Is this launch plan ready to take to the board? What must change first?');
  await win.click('label.toggle:has([data-tg="demo"]) .sw');
  await win.waitForSelector('[data-tg="demo"]:checked', { state: 'attached' });
  await sleep(700);
  await win.screenshot({ path: path.join(SHOTS, '03-new-council.png'), fullPage: false });
  await hold(800);
  await win.evaluate(() => { document.getElementById('view').scrollTop = 0; });
  await hold(1200);

  await win.click('[data-act="start"]');
  await win.waitForSelector('#runroot');

  // Wait for the simulated "needs you" (Grok sign-in hiccup), screenshot, then Retry
  await win.waitForSelector('.attn', { timeout: 60000 });
  await sleep(400);
  await win.screenshot({ path: path.join(SHOTS, '04-run-needs-you.png') });
  await hold(2500);
  await win.click('.attn [data-retry]');

  // Pause, check the paused state, resume
  await sleep(1500);
  const pauseBtn = await win.$('[data-act="pause"]');
  if (pauseBtn) {
    await pauseBtn.click();
    await win.waitForSelector('[data-act="resume"]', { timeout: 30000 });
    await win.waitForSelector('.st-paused', { timeout: 30000 });
    await sleep(600);
    await win.screenshot({ path: path.join(SHOTS, '05-run-paused.png') });
    await win.click('[data-act="resume"]');
  }
  await sleep(2500);
  await win.screenshot({ path: path.join(SHOTS, '06-run-working.png') });

  // Wait for completion
  await win.waitForSelector('[data-act="report"]', { timeout: 240000 });
  await sleep(500);
  await win.screenshot({ path: path.join(SHOTS, '07-run-complete.png') });
  await win.click('[data-act="report"]');
  await win.waitForSelector('.vhero');
  await sleep(600);
  await win.screenshot({ path: path.join(SHOTS, '08-report-top.png') });
  await hold(3000);
  if (framesDir) {
    for (let y = 0; y < 14; y++) { await win.evaluate(() => { document.getElementById('view').scrollBy({ top: 260 }); }); await sleep(450); }
    await hold(1000);
    await win.evaluate(() => { document.getElementById('view').scrollTop = 0; });
    await hold(1500);
  }
  recording = false; await recorder;
  await win.evaluate(() => { document.querySelector('.heat').scrollIntoView(); });
  await sleep(300);
  await win.screenshot({ path: path.join(SHOTS, '09-report-scorecard.png') });
  await win.evaluate(() => { document.querySelector('.finding').scrollIntoView(); });
  await sleep(300);
  await win.screenshot({ path: path.join(SHOTS, '10-report-findings.png') });

  // Export every report in every format through the app's own IPC
  const sessionId = await win.evaluate(() => App.views.report.s.id);
  const outputs = [];
  for (const kind of ['full', 'summary', 'changes', 'raw']) {
    for (const fmt of ['pdf', 'docx', 'txt', 'md']) {
      const p = await win.evaluate(([id, k, f]) => cw.call('report:export', id, k, f), [sessionId, kind, fmt]);
      assert.ok(fs.existsSync(p) && fs.statSync(p).size > 400, `${kind}.${fmt} should exist`);
      outputs.push(p);
    }
  }
  const exportDir = process.env.CW_EXPORT_DIR;
  if (exportDir) { fs.mkdirSync(exportDir, { recursive: true }); for (const p of outputs) fs.copyFileSync(p, path.join(exportDir, path.basename(p))); }

  // History, templates, settings
  await win.click('nav a[data-nav="history"]');
  await win.waitForSelector('text=Every council you have run');
  await win.screenshot({ path: path.join(SHOTS, '11-sessions.png') });
  await win.click('nav a[data-nav="templates"]');
  await win.waitForSelector('text=Role library');
  await win.screenshot({ path: path.join(SHOTS, '12-templates.png') });
  await win.click('nav a[data-nav="settings"]');
  await win.waitForSelector('text=Report branding');
  await win.screenshot({ path: path.join(SHOTS, '13-settings.png') });

  // Contact & maintainer: addresses, mailto links, attribution, sidebar footer.
  const contact = await win.evaluate(() => ({
    official: document.getElementById('mail-official').getAttribute('href'),
    officialText: document.getElementById('mail-official').textContent,
    personal: document.getElementById('mail-personal').getAttribute('href'),
    personalText: document.getElementById('mail-personal').textContent,
    attribution: document.getElementById('attribution').textContent,
    side: [...document.querySelectorAll('#sidecontact a')].map(a => a.getAttribute('href'))
  }));
  assert.strictEqual(contact.official, 'mailto:suman.mondal.8@loopwise.pro');
  assert.strictEqual(contact.officialText, 'suman.mondal.8@loopwise.pro');
  assert.strictEqual(contact.personal, 'mailto:sumanmondaljobs2022@gmail.com');
  assert.strictEqual(contact.personalText, 'sumanmondaljobs2022@gmail.com');
  assert.strictEqual(contact.attribution, 'Councilwise is an open-source software product developed and maintained by LoopWise, created by Suman Mondal.');
  assert.deepStrictEqual(contact.side, ['mailto:suman.mondal.8@loopwise.pro', 'mailto:sumanmondaljobs2022@gmail.com']);
  for (const href of contact.side) {
    const opened = await win.evaluate(h => cw.call('shell:open', h), href);
    assert.strictEqual(opened, href, 'mailto link accepted by the app');
  }
  const urlBefore = win.url();
  await win.click('#mail-official');
  await sleep(300);
  assert.strictEqual(win.url(), urlBefore, 'clicking a mailto link must not navigate the app window');
  const bad = await win.evaluate(() => cw.call('shell:open', 'file:///C:/Windows/system32/calc.exe').then(() => 'allowed', () => 'blocked'));
  assert.strictEqual(bad, 'blocked', 'non-http/mailto links are refused');
  await win.evaluate(() => document.querySelector('#attribution').scrollIntoView({ block: 'center' }));
  await sleep(200);
  await win.screenshot({ path: path.join(SHOTS, '14-about-contact.png') });
  console.log('Contact links verified: both mailto links open through the app, attribution shown, sidebar footer correct');

  const snap = await win.evaluate(id => cw.call('session:get', id), sessionId);

  // Web-path council: real login windows, real engine, mock websites.
  // Three mock "websites" as custom connectors, to test the real login-window path.
  fs.mkdirSync(path.join(dataDir, 'adapters'), { recursive: true });
  for (const n of [1, 2, 3]) {
    fs.writeFileSync(path.join(dataDir, 'adapters', `mock${n}.json`), JSON.stringify({
      id: `mock${n}`, name: `Mock site ${n}`, maker: 'Test', monogram: `M${n}`, version: 'test',
      url: 'file://' + path.join(ROOT, 'test', 'fixtures', 'mock-chat.html'),
      selectors: { input: ['#editor'], send: ['button[aria-label="Send message"]'], busy: ['button[aria-label*="Stop" i]'], response: ['.msg.assistant'], fileInput: ['#file'], loggedOut: [] },
      plan: { fixed: 'Free' }, upload: { supported: true, maxMB: 10 }, pasteLimit: 8000, webAccess: n === 1
    }));
  }
  await win.evaluate(() => cw.call('adapters:reload'));
  const sample = await win.evaluate(() => cw.call('sample:path'));
  const webSnap = await win.evaluate(async (fp) => {
    const s = await cw.call('session:create', { title: 'Web path test', brief: 'test', templateId: 'document-review', filePath: fp,
      members: [{ id: 'mock1' }, { id: 'mock2' }, { id: 'mock3' }], headId: 'mock2', moderatorId: 'mock3', mode: 'auto', peerReview: true, factCheck: true });
    await cw.call('session:start', s.id);
    for (let i = 0; i < 240; i++) {
      await new Promise(r => setTimeout(r, 1000));
      const x = await cw.call('session:get', s.id);
      if (['completed', 'failed', 'stopped'].includes(x.status)) return x;
    }
    return cw.call('session:get', s.id);
  }, sample);
  assert.strictEqual(webSnap.status, 'completed', 'web-path council: ' + (webSnap.error || webSnap.log.map(l => l.msg).join(' | ')));
  console.log(`Web-path council passed · ${webSnap.stats.messages} messages through the engine (document sent in parts)`);
  await app.close();
  const realErrors = errors.filter(e => !/Autofill|DevTools|GPU|gpu/.test(e));
  assert.deepStrictEqual(realErrors, [], 'renderer errors: ' + realErrors.join('\n'));
  assert.strictEqual(snap.status, 'completed');
  console.log(`E2E passed · verdict ${snap.result.verdict} · score ${snap.result.confidence.score} · ${outputs.length} files exported`);
})().catch(e => { console.error('E2E FAILED:', e); process.exit(1); });
