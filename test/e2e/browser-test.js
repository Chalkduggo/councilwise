'use strict';
// Tests the "My Chrome/Edge" connection: launches a real Chromium with its own
// profile, opens a mock chat site, and runs the engine through the DevTools protocol.
// Run: node test/e2e/browser-test.js   (needs Chrome/Chromium; CI uses Playwright's)
const path = require('path');
const fs = require('fs');
const os = require('os');
const assert = require('assert');
const browser = require('../../src/main/browser');
const engine = require('../../src/main/adapters/engine');
const parse = require('../../src/main/council/parse');
const prompts = require('../../src/main/council/prompts');

const exe = process.env.CW_BROWSER || require('playwright').chromium.executablePath();
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cw-browser-'));
browser.init({ dataDir, getSettings: () => ({ browserPath: exe }) });

const url = 'file://' + path.join(__dirname, '..', 'fixtures', 'mock-chat.html');
const adapter = {
  id: 'mock', name: 'Mock', url,
  selectors: { input: ['#editor'], send: ['button[aria-label="Send message"]'], busy: ['button[aria-label*="Stop" i]'], response: ['.msg.assistant'], fileInput: ['#file'], loggedOut: [] },
  plan: { fixed: 'Free' }
};

(async () => {
  try {
    const t1 = await browser.tab('m1', url);
    const t2 = await browser.tab('m2', url);
    assert.notStrictEqual(t1.targetId, t2.targetId, 'each member gets its own window');
    const probe = await engine.probe(t1, adapter);
    assert.strictEqual(probe.signedIn, true);
    const a1 = await engine.send(t1, adapter, 'Hello from the real browser.', { mode: 'auto', timeoutMs: 60000 });
    assert.ok(parse.extractJson(a1), 'short answer');
    const doc = 'Section 1. ' + 'Plenty of plan detail here. '.repeat(500);
    const p = prompts.round1({ template: { name: 'G', dimensions: [{ id: 'x' }], sections: ['V'] }, role: { name: 'Skeptic', brief: 'b' }, brief: 'b', fileName: 'x', docMode: 'inline', docText: doc });
    const [a2, a3] = await Promise.all([
      engine.send(t1, adapter, p, { mode: 'auto', timeoutMs: 120000 }),
      engine.send(t2, adapter, 'Parallel member message.', { mode: 'auto', timeoutMs: 60000 })
    ]);
    assert.ok(parse.extractJson(a2) && parse.extractJson(a3), 'parallel answers');
    const got = await t1.executeJavaScript('window.__received[window.__received.length-1].length');
    assert.ok(got > p.length * 0.97, `long prompt delivered (${got}/${p.length})`);
    assert.strictEqual(await engine.attachFile(t1, adapter, __filename), true, 'file attach');
    // reconnect: a fresh lookup re-uses the open window
    const again = await browser.tab('m1', url);
    assert.strictEqual(again.targetId, t1.targetId);
    console.log(`BROWSER TEST PASSED · ${browser.status().name} · long prompt ${p.length} chars`);
    await t1.cmd('Browser.close').catch(() => {});
    process.exit(0);
  } catch (e) {
    console.error('BROWSER TEST FAILED:', e);
    process.exit(1);
  }
})();
