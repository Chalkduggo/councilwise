'use strict';
// "My Chrome/Edge" connection.
//
// Some sign-in pages (Google above all) refuse to work inside windows embedded in
// another app. For those, Councilwise opens the user's real Chrome or Edge with a
// separate, dedicated profile (never the user's everyday profile). The user signs in
// there by hand, exactly as in any browser. Councilwise then talks to that browser
// through the Chrome DevTools Protocol to type messages and read answers.
//
// Each member gets its own window. The objects returned by tab() mimic the small
// part of Electron's webContents API that the engine uses, so the same engine
// drives both the built-in windows and the real browser.

const fs = require('fs');
const path = require('path');
const net = require('net');
const { spawn } = require('child_process');
const EventEmitter = require('events');
const WebSocket = require('ws');

let profileDir = null;
let stateFile = null;
let settingsFn = () => ({});
let conn = null;          // CdpConnection
let child = null;
const tabs = new Map();   // memberId -> Tab

function init({ dataDir, getSettings }) {
  profileDir = path.join(dataDir, 'browser-profile');
  stateFile = path.join(dataDir, 'browser.json');
  settingsFn = getSettings || settingsFn;
  fs.mkdirSync(profileDir, { recursive: true });
}

// ---------- finding the browser ----------
function candidates() {
  const s = settingsFn();
  const list = [];
  if (s.browserPath) list.push(s.browserPath);
  if (process.platform === 'win32') {
    const pf = process.env.ProgramFiles || 'C:\\Program Files';
    const pf86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
    const local = process.env.LOCALAPPDATA || '';
    const chrome = [path.join(pf, 'Google\\Chrome\\Application\\chrome.exe'), path.join(pf86, 'Google\\Chrome\\Application\\chrome.exe'), path.join(local, 'Google\\Chrome\\Application\\chrome.exe')];
    const edge = [path.join(pf86, 'Microsoft\\Edge\\Application\\msedge.exe'), path.join(pf, 'Microsoft\\Edge\\Application\\msedge.exe')];
    if (s.browserChoice === 'edge') list.push(...edge, ...chrome);
    else list.push(...chrome, ...edge);
  }
  return list;
}

function findBrowser() {
  for (const p of candidates()) { try { if (p && fs.statSync(p).isFile()) return p; } catch { /* next */ } }
  return null;
}
function available() { return !!findBrowser(); }
function browserName(p) { return /msedge/i.test(p || '') ? 'Microsoft Edge' : /chrome/i.test(p || '') ? 'Google Chrome' : 'Browser'; }

// ---------- CDP connection ----------
class CdpConnection extends EventEmitter {
  constructor(wsUrl) {
    super();
    this.id = 0;
    this.pending = new Map();
    this.ws = new WebSocket(wsUrl, { perMessageDeflate: false, maxPayload: 256 * 1024 * 1024 });
    this.ready = new Promise((resolve, reject) => {
      this.ws.once('open', resolve);
      this.ws.once('error', reject);
    });
    this.ws.on('message', (data) => {
      let msg;
      try { msg = JSON.parse(data.toString()); } catch { return; }
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message || 'CDP error'));
        else resolve(msg.result || {});
      } else if (msg.method) {
        this.emit('event', msg);
      }
    });
    this.ws.on('close', () => {
      this.closed = true;
      for (const { reject } of this.pending.values()) reject(new Error('The browser was closed.'));
      this.pending.clear();
      this.emit('closed');
    });
  }
  send(method, params = {}, sessionId) {
    if (this.closed) return Promise.reject(new Error('The browser was closed.'));
    const id = ++this.id;
    const msg = { id, method, params };
    if (sessionId) msg.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify(msg));
    });
  }
  close() { try { this.ws.close(); } catch { /* ignore */ } }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => { const { port } = srv.address(); srv.close(() => resolve(port)); });
  });
}

async function versionInfo(port) {
  const res = await fetch(`http://127.0.0.1:${port}/json/version`);
  if (!res.ok) throw new Error('no browser');
  return res.json();
}

async function connectToPort(port) {
  const info = await versionInfo(port);
  const c = new CdpConnection(info.webSocketDebuggerUrl);
  await c.ready;
  c.port = port;
  c.product = info.Browser;
  c.on('event', onEvent);
  c.on('closed', () => { if (conn === c) { conn = null; tabs.clear(); } });
  await c.send('Target.setDiscoverTargets', { discover: true });
  return c;
}

async function ensureBrowser() {
  if (conn && !conn.closed) return conn;
  // Reconnect to a Councilwise browser that is still open from before.
  try {
    const saved = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    if (saved.port) { conn = await connectToPort(saved.port); return conn; }
  } catch { /* start a new one */ }

  const exe = findBrowser();
  if (!exe) throw new Error('Chrome or Edge was not found. Install Google Chrome, or set the browser path in Settings.');
  const port = await freePort();
  const args = [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
    '--no-first-run', '--no-default-browser-check',
    // Keep member windows working while they are behind other windows.
    '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling',
    'about:blank'
  ];
  if (process.platform === 'linux' && process.getuid && process.getuid() === 0) args.unshift('--no-sandbox');
  child = spawn(exe, args, { detached: true, stdio: 'ignore' });
  child.unref();
  for (let i = 0; i < 60; i++) {
    await sleep(500);
    try { conn = await connectToPort(port); break; } catch { /* still starting */ }
  }
  if (!conn) throw new Error(`${browserName(exe)} did not start. If a Councilwise browser window is already open, close it and try again.`);
  fs.writeFileSync(stateFile, JSON.stringify({ port, exe }));
  return conn;
}

function onEvent(msg) {
  if (msg.method === 'Target.targetDestroyed' || msg.method === 'Target.detachedFromTarget') {
    for (const [id, t] of tabs) if (t.targetId === msg.params.targetId || t.sessionId === msg.params.sessionId) { t.dead = true; tabs.delete(id); }
    return;
  }
  if (msg.method === 'Target.targetInfoChanged') {
    for (const t of tabs.values()) if (t.targetId === msg.params.targetInfo.targetId) t.url = msg.params.targetInfo.url;
    return;
  }
  if (msg.sessionId) {
    for (const t of tabs.values()) if (t.sessionId === msg.sessionId) t._event(msg);
  }
}

// ---------- a member's window, with a webContents-like API ----------
class Tab extends EventEmitter {
  constructor(c, targetId, sessionId, url) {
    super();
    this.c = c; this.targetId = targetId; this.sessionId = sessionId; this.url = url || '';
    this.loading = false;
    const self = this;
    this.debugger = {
      isAttached: () => true,
      attach() { /* already attached */ },
      detach() { /* keep the session */ },
      sendCommand: (method, params) => self.cmd(method, params)
    };
  }
  cmd(method, params) { return this.c.send(method, params, this.sessionId); }
  _event(msg) {
    if (msg.method === 'Page.frameStartedLoading') this.loading = true;
    if (msg.method === 'Page.frameStoppedLoading' || msg.method === 'Page.loadEventFired') { this.loading = false; this.emit('did-stop-loading'); }
    if (msg.method === 'Page.frameNavigated' && msg.params.frame && !msg.params.frame.parentId) this.url = msg.params.frame.url;
  }
  getURL() { return this.url; }
  isLoading() { return this.loading; }
  isDestroyed() { return !!this.dead; }
  async loadURL(url) {
    this.loading = true;
    const done = new Promise(r => this.once('did-stop-loading', r));
    await this.cmd('Page.navigate', { url });
    this.url = url;
    await Promise.race([done, sleep(45000)]);
  }
  async executeJavaScript(expression) {
    const r = await this.cmd('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
    if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text || 'Script error');
    return r.result ? r.result.value : undefined;
  }
  insertText(text) { return this.cmd('Input.insertText', { text }); }
  sendInputEvent(ev) {
    if (ev.type === 'char') return Promise.resolve(); // insertText/keyDown already cover it
    const base = { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 };
    return this.cmd('Input.dispatchKeyEvent', ev.type === 'keyDown' ? { type: 'keyDown', text: '\r', ...base } : { type: 'keyUp', ...base });
  }
  async show() {
    try { await this.c.send('Target.activateTarget', { targetId: this.targetId }); } catch { /* ignore */ }
    try { await this.cmd('Page.bringToFront'); } catch { /* ignore */ }
  }
}

async function attach(c, targetId, url) {
  const { sessionId } = await c.send('Target.attachToTarget', { targetId, flatten: true });
  const t = new Tab(c, targetId, sessionId, url);
  await t.cmd('Page.enable');
  try { await t.cmd('Emulation.setFocusEmulationEnabled', { enabled: true }); } catch { /* older browsers */ }
  return t;
}

function hostOf(u) { try { return new URL(u).host; } catch { return ''; } }

// Get (or open) the window for a member. Re-uses a window that is already showing
// that member's site, so sign-ins and conversations survive an app restart.
async function tab(memberId, url, { show = false } = {}) {
  const c = await ensureBrowser();
  let t = tabs.get(memberId);
  if (t && !t.dead) { if (show) await t.show(); return t; }
  const { targetInfos } = await c.send('Target.getTargets');
  const taken = new Set([...tabs.values()].map(x => x.targetId));
  const host = hostOf(url);
  const existing = targetInfos.find(ti => ti.type === 'page' && !taken.has(ti.targetId) && host && hostOf(ti.url) === host);
  if (existing) {
    t = await attach(c, existing.targetId, existing.url);
  } else {
    const blank = targetInfos.find(ti => ti.type === 'page' && ti.url === 'about:blank' && !taken.has(ti.targetId));
    let targetId;
    if (blank && tabs.size === 0) targetId = blank.targetId;
    else ({ targetId } = await c.send('Target.createTarget', { url: 'about:blank', newWindow: true }));
    t = await attach(c, targetId, 'about:blank');
    await t.loadURL(url);
  }
  tabs.set(memberId, t);
  if (show) await t.show();
  return t;
}

async function show(memberId, url) { const t = await tab(memberId, url); await t.show(); return t; }

async function clearSite(url) {
  const c = await ensureBrowser();
  try { await c.send('Storage.clearDataForOrigin', { origin: new URL(url).origin, storageTypes: 'all' }); } catch { /* ignore */ }
}

function status() {
  const exe = findBrowser();
  return { available: !!exe, path: exe || '', name: browserName(exe), running: !!(conn && !conn.closed), profileDir };
}

async function shutdown() {
  try { if (conn) conn.close(); } catch { /* ignore */ }
}

module.exports = { init, findBrowser, available, status, ensureBrowser, tab, show, clearSite, shutdown, _test: { CdpConnection, Tab } };
