'use strict';
// Web automation engine. Drives a chat site that the user is already signed in to,
// inside an embedded Chromium window. It never sees or stores passwords.
//
// Every site is described by a small JSON adapter (selectors for the input box,
// send button, "still generating" indicator and the answer). When a selector
// stops working, the engine falls back to generic strategies so a site redesign
// degrades gracefully instead of breaking the whole council.

const { clipboard } = require('electron');

class NeedsUserError extends Error {
  constructor(reason, detail) { super(detail || reason); this.reason = reason; }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

let clipChain = Promise.resolve();
function acquireClipboard() {
  let release;
  const next = new Promise(r => { release = r; });
  const wait = clipChain;
  clipChain = clipChain.then(() => next);
  return wait.then(() => release);
}

// Helper code injected into the page. Kept small and dependency free.
const HELPER = `
(() => {
  if (window.__cw) return;
  const safeAll = (sel) => { try { return Array.from(document.querySelectorAll(sel)); } catch { return []; } };
  const visible = (el) => {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    const st = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && st.visibility !== 'hidden' && st.display !== 'none';
  };
  const first = (list) => {
    for (const sel of list || []) {
      const els = safeAll(sel).filter(visible);
      if (els.length) return els[els.length - 1];
    }
    return null;
  };
  const genericInput = () => {
    const cands = safeAll('textarea, [contenteditable="true"]').filter(visible);
    cands.sort((a, b) => (b.getBoundingClientRect().width * 1) - (a.getBoundingClientRect().width * 1));
    return cands[0] || null;
  };
  const responses = (list) => {
    for (const sel of list || []) {
      const els = safeAll(sel);
      if (els.length) return els.map(e => e.innerText || '');
    }
    return null;
  };
  window.__cw = {
    input(list) { return first(list) || genericInput(); },
    hasInput(list) { return !!(first(list) || genericInput()); },
    any(list) { return !!first(list); },
    focusInput(list) {
      const el = first(list) || genericInput();
      if (!el) return false;
      el.focus();
      if (el.tagName === 'TEXTAREA') { el.value = ''; el.dispatchEvent(new Event('input', { bubbles: true })); }
      else { document.execCommand('selectAll', false, null); document.execCommand('delete', false, null); }
      return true;
    },
    inputLength(list) {
      const el = first(list) || genericInput();
      if (!el) return -1;
      return (el.tagName === 'TEXTAREA' ? el.value : el.innerText).length;
    },
    clickSend(list) {
      const el = first(list);
      if (!el || el.disabled || el.getAttribute('aria-disabled') === 'true') return false;
      el.click();
      return true;
    },
    responses(list) { return responses(list); },
    bodyText() { return (document.querySelector('main') || document.body).innerText || ''; },
    pageText() { return document.body ? document.body.innerText : ''; }
  };
})();
`;

async function run(wc, expr) {
  await wc.executeJavaScript(HELPER, true);
  return wc.executeJavaScript(expr, true);
}
const J = v => JSON.stringify(v);

async function waitForLoad(wc, timeoutMs = 45000) {
  if (!wc.isLoading()) return;
  await Promise.race([
    new Promise(r => wc.once('did-stop-loading', r)),
    sleep(timeoutMs)
  ]);
}

async function open(wc, url) {
  try { await wc.loadURL(url); } catch (e) { /* redirects can reject; we check state below */ }
  await waitForLoad(wc);
  await sleep(1500);
}

// Detect whether the user is signed in and which plan the page shows.
async function probe(wc, adapter) {
  await waitForLoad(wc);
  const s = adapter.selectors;
  let hasInput = false, loggedOutHint = false, text = '';
  for (let i = 0; i < 10; i++) {
    hasInput = await run(wc, `window.__cw.hasInput(${J(s.input)})`).catch(() => false);
    loggedOutHint = await run(wc, `window.__cw.any(${J(s.loggedOut || [])})`).catch(() => false);
    if (hasInput || loggedOutHint) break;
    await sleep(1000);
  }
  text = await run(wc, 'window.__cw.pageText()').catch(() => '');
  const signedIn = hasInput && !loggedOutHint;
  return { signedIn, plan: detectPlan(adapter, text), url: wc.getURL() };
}

function detectPlan(adapter, pageText) {
  const plan = adapter.plan || {};
  if (plan.fixed) return plan.fixed;
  const t = pageText || '';
  if ((plan.pro || []).some(w => t.includes(w))) return 'Pro';
  if ((plan.free || []).some(w => t.includes(w))) return 'Free';
  return 'Unknown';
}

async function pressEnter(wc) {
  wc.sendInputEvent({ type: 'keyDown', keyCode: 'Enter' });
  wc.sendInputEvent({ type: 'char', keyCode: '\r' });
  wc.sendInputEvent({ type: 'keyUp', keyCode: 'Enter' });
}

async function typeInto(wc, adapter, text) {
  const s = adapter.selectors;
  const ok = await run(wc, `window.__cw.focusInput(${J(s.input)})`);
  if (!ok) throw new NeedsUserError('no_input', 'Could not find the message box. Is the site signed in?');
  if (text.length <= 1500) {
    await wc.insertText(text);
  } else {
    // Large text: paste through the clipboard (much faster for rich editors),
    // then restore whatever the user had on their clipboard. A lock stops two
    // members pasting at the same moment.
    const release = await acquireClipboard();
    try {
      let saved = '';
      try { const r = clipboard.readText(); if (typeof r === 'string') saved = r; } catch { /* no clipboard */ }
      clipboard.writeText(text);
      wc.paste();
      await sleep(900);
      clipboard.writeText(saved);
    } finally { release(); }
    // If the paste did not land (no clipboard access), type it instead.
    const pasted = await run(wc, `window.__cw.inputLength(${J(s.input)})`);
    if (pasted < text.length * 0.5) {
      await run(wc, `window.__cw.focusInput(${J(s.input)})`);
      await wc.insertText(text);
    }
  }
  await sleep(700);
  const len = await run(wc, `window.__cw.inputLength(${J(s.input)})`);
  return len;
}

// Attach the original file through the Chrome DevTools protocol.
async function attachFile(wc, adapter, filePath) {
  const dbg = wc.debugger;
  let attachedHere = false;
  try {
    if (!dbg.isAttached()) { dbg.attach('1.3'); attachedHere = true; }
    const { root } = await dbg.sendCommand('DOM.getDocument', { depth: -1, pierce: true });
    const sel = (adapter.selectors.fileInput && adapter.selectors.fileInput[0]) || 'input[type="file"]';
    const { nodeIds } = await dbg.sendCommand('DOM.querySelectorAll', { nodeId: root.nodeId, selector: sel });
    if (!nodeIds || !nodeIds.length) return false;
    await dbg.sendCommand('DOM.setFileInputFiles', { nodeId: nodeIds[0], files: [filePath] });
    await sleep(6000); // give the site time to upload
    return true;
  } catch {
    return false;
  } finally {
    if (attachedHere) { try { dbg.detach(); } catch { /* ignore */ } }
  }
}

/**
 * Send one message and wait for the full answer.
 * opts: { mode: 'auto'|'assisted', timeoutMs, onWaitingForUser(msg), shouldAbort(), attachPath }
 */
async function send(wc, adapter, text, opts = {}) {
  const s = adapter.selectors;
  const timeoutMs = opts.timeoutMs || 12 * 60000;
  const before = await run(wc, `window.__cw.responses(${J(s.response)})`).catch(() => null);
  const countBefore = before ? before.length : 0;
  const bodyBefore = await run(wc, 'window.__cw.bodyText()').catch(() => '');

  if (opts.attachPath) await attachFile(wc, adapter, opts.attachPath);

  const len = await typeInto(wc, adapter, text);
  if (len === 0) throw new NeedsUserError('type_failed', 'The message box stayed empty after typing.');

  if (opts.mode === 'assisted') {
    if (opts.onWaitingForUser) opts.onWaitingForUser('Check the prompt in the window, then press Send.');
  } else {
    const clicked = await run(wc, `window.__cw.clickSend(${J(s.send)})`).catch(() => false);
    if (!clicked) await pressEnter(wc);
  }

  // Wait for the answer to start, then to finish (no "stop" button and text stable).
  const start = Date.now();
  let lastText = '', stableTicks = 0, started = false;
  while (Date.now() - start < timeoutMs) {
    if (opts.shouldAbort && opts.shouldAbort()) throw new NeedsUserError('aborted', 'Stopped by user.');
    await sleep(1000);
    const busy = await run(wc, `window.__cw.any(${J(s.busy || [])})`).catch(() => false);
    const list = await run(wc, `window.__cw.responses(${J(s.response)})`).catch(() => null);
    let current = '';
    if (list && list.length > countBefore) {
      current = list[list.length - 1];
    } else if (!list || !list.length) {
      // Generic fallback: whatever text appeared on the page since we sent.
      const body = await run(wc, 'window.__cw.bodyText()').catch(() => '');
      if (body.length > bodyBefore.length + 20) current = tailAfterPrompt(body, text);
    }
    if (current || busy) started = true;
    if (!started) {
      if (opts.mode === 'auto' && Date.now() - start > 20000 && !opts._resent) {
        // The send click may have missed; try Enter once.
        opts._resent = true; await pressEnter(wc);
      }
      continue;
    }
    if (!busy && current && current === lastText) {
      stableTicks++;
      if (stableTicks >= 4) return current.trim();
    } else {
      stableTicks = 0;
    }
    lastText = current;
  }
  if (lastText) return lastText.trim();
  throw new NeedsUserError('timeout', 'No answer arrived in time.');
}

function tailAfterPrompt(body, prompt) {
  const key = prompt.trim().slice(-60);
  const idx = body.lastIndexOf(key);
  return idx >= 0 ? body.slice(idx + key.length) : '';
}

module.exports = { open, probe, send, detectPlan, attachFile, NeedsUserError, HELPER };
