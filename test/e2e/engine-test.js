'use strict';
// Drives a realistic mock chat page with the real web engine inside Electron.
// Run: npx electron test/e2e/engine-test.js   (Linux CI: xvfb-run -a npx electron --no-sandbox test/e2e/engine-test.js)
const { app, BrowserWindow } = require('electron');
const path = require('path');
const assert = require('assert');
const engine = require('../../src/main/adapters/engine');
const parse = require('../../src/main/council/parse');
const docs = require('../../src/main/docs');
const prompts = require('../../src/main/council/prompts');

const adapter = {
  id: 'mock', name: 'Mock', url: 'file://' + path.join(__dirname, '..', 'fixtures', 'mock-chat.html'),
  selectors: { input: ['#editor'], send: ['button[aria-label="Send message"]'], busy: ['button[aria-label*="Stop" i]'], response: ['.msg.assistant'], fileInput: ['#file'], loggedOut: [] },
  plan: { free: ['Upgrade'], pro: ['Pro plan'] }
};
const generic = { ...adapter, selectors: { input: [], send: [], busy: ['button[aria-label*="Stop" i]'], response: [], loggedOut: [] } };

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 1000, height: 800, webPreferences: { sandbox: true, backgroundThrottling: false } });
  try {
    await engine.open(win.webContents, adapter.url);
    const probe = await engine.probe(win.webContents, adapter);
    assert.strictEqual(probe.signedIn, true, 'probe should find the message box');

    // 1. short message (typed with insertText)
    const a1 = await engine.send(win.webContents, adapter, 'Hello council, short message test.', { mode: 'auto', timeoutMs: 60000 });
    assert.ok(parse.extractJson(a1), 'short answer should contain JSON');

    // 2. long message (clipboard paste path) — a real round-1 prompt with an inline document
    const doc = 'Section 1. ' + 'The plan has many details. '.repeat(400);
    const tpl = { name: 'General', dimensions: [{ id: 'clarity' }], sections: ['Verdict'] };
    const p1 = prompts.round1({ template: tpl, role: { name: 'Skeptic', brief: 'Question everything.' }, brief: 'test', fileName: 'x.md', docMode: 'inline', docText: doc });
    const a2 = await engine.send(win.webContents, adapter, p1, { mode: 'auto', timeoutMs: 120000 });
    const j2 = parse.extractJson(a2);
    assert.ok(j2, 'long answer should contain JSON');
    const got = await win.webContents.executeJavaScript('window.__received[window.__received.length-1].length');
    assert.ok(got > p1.length * 0.97, `site should receive the whole long prompt (${got} of ${p1.length})`);

    // 3. multi-part delivery
    const parts = docs.split(doc + doc, 6000);
    for (let i = 0; i < parts.length; i++) {
      const r = await engine.send(win.webContents, adapter, prompts.docPart(i + 1, parts.length, parts[i]), { mode: 'auto', timeoutMs: 60000 });
      assert.ok(r.includes(`RECEIVED ${i + 1}/${parts.length}`), 'part acknowledgement');
    }

    // 4. generic fallback (no selectors at all, only page structure)
    const a4 = await engine.send(win.webContents, generic, 'Generic selector fallback test.', { mode: 'auto', timeoutMs: 60000 });
    assert.ok(parse.extractJson(a4), 'generic fallback should still return the answer');

    // 5. file attach through DevTools protocol
    const ok = await engine.attachFile(win.webContents, adapter, __filename);
    assert.strictEqual(ok, true, 'file attach');

    console.log(`ENGINE TEST PASSED · ${parts.length} parts · long prompt ${p1.length} chars delivered`);
    app.exit(0);
  } catch (e) {
    console.error('ENGINE TEST FAILED:', e);
    app.exit(1);
  }
});
