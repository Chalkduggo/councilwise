'use strict';
// Member registry: the built-in models, any custom ones the user adds, how each is
// connected (website login, API, or demo), and the embedded login windows.
const fs = require('fs');
const path = require('path');
const store = require('./store');
const engine = require('./adapters/engine');
const api = require('./api');
const demo = require('./demo');
const browser = require('./browser');

let BrowserWindow = null, app = null, shell = null;
const windows = new Map();
let adapters = {};
let userAdapterDir = null;

const ORDER = ['claude', 'gemini', 'chatgpt', 'perplexity', 'grok', 'deepseek', 'mistral', 'cohere'];

function init(electron) {
  BrowserWindow = electron.BrowserWindow; app = electron.app; shell = electron.shell;
  browser.init({ dataDir: store.p(), getSettings: store.getSettings });
  userAdapterDir = store.p('adapters');
  fs.mkdirSync(userAdapterDir, { recursive: true });
  loadAdapters();
}

// Built-in adapters, overridden by any JSON file of the same id in the user's
// adapters folder. That lets people fix a broken site without a new release.
function loadAdapters() {
  adapters = {};
  const builtIn = path.join(__dirname, 'adapters', 'sites');
  for (const dir of [builtIn, userAdapterDir]) {
    if (!dir || !fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.json'))) {
      try {
        const a = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
        if (a && a.id && a.url && a.selectors) adapters[a.id] = { ...a, source: dir === builtIn ? 'built-in' : 'custom' };
      } catch { /* skip bad file */ }
    }
  }
}

function genericAdapter({ id, name, url, monogram }) {
  return {
    id, name, maker: 'Custom', monogram: (monogram || name.slice(0, 2)).toUpperCase().slice(0, 2), url,
    selectors: { input: ['textarea', '[contenteditable="true"]'], send: ['button[aria-label*="Send" i]', 'button[type="submit"]'], busy: ['button[aria-label*="Stop" i]'], response: [], fileInput: ['input[type="file"]'], loggedOut: [] },
    plan: {}, upload: { supported: false, maxMB: 0 }, pasteLimit: 30000, webAccess: false, custom: true, version: 'custom'
  };
}

function allAdapters() {
  const o = store.getMemberOverrides();
  const list = { ...adapters };
  for (const c of (o.__custom || [])) if (!list[c.id]) list[c.id] = genericAdapter(c);
  return list;
}

function adapterFor(id) { return allAdapters()[id]; }

function list() {
  const o = store.getMemberOverrides();
  const ads = allAdapters();
  const ids = [...ORDER.filter(id => ads[id]), ...Object.keys(ads).filter(id => !ORDER.includes(id))];
  return ids.map(id => describe(id, ads[id], o[id] || {}));
}

function describe(id, a, ov) {
  const apiCfg = { baseUrl: (ov.api && ov.api.baseUrl) || (a.api && a.api.baseUrl) || '', model: (ov.api && ov.api.model) || (a.api && a.api.model) || '' };
  const plan = ov.planManual || ov.planDetected || ((a.plan && a.plan.fixed) || 'Unknown');
  return {
    id, name: ov.name || a.name, maker: a.maker || '', monogram: a.monogram, url: a.url,
    connection: ov.connection || (browser.available() ? 'browser' : 'web'),
    plan, planSource: ov.planManual ? 'manual' : ov.planDetected ? 'detected' : 'unknown',
    signedIn: ov.signedIn == null ? null : ov.signedIn, lastChecked: ov.lastChecked || null,
    api: { ...apiCfg, hasKey: store.hasSecret('api:' + id) },
    privacyUrl: a.privacyUrl || a.url, privacyHint: a.privacyHint || '',
    webAccess: !!a.webAccess, upload: a.upload || { supported: false },
    pasteLimit: a.pasteLimit || 30000, custom: !!a.custom, adapterVersion: a.version || '', adapterSource: a.source || 'custom'
  };
}

function update(id, patch) {
  const o = store.getMemberOverrides();
  const cur = o[id] || {};
  if (patch.apiKey !== undefined) { store.setSecret('api:' + id, patch.apiKey); delete patch.apiKey; }
  if (patch.api) patch.api = { ...(cur.api || {}), ...patch.api };
  o[id] = { ...cur, ...patch };
  store.saveMemberOverrides(o);
  return list().find(m => m.id === id);
}

function addCustom({ name, url, monogram }) {
  if (!name || !/^https:\/\//.test(url || '')) throw new Error('A custom member needs a name and an https:// address.');
  const o = store.getMemberOverrides();
  const id = 'custom-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 24) + '-' + Date.now().toString(36).slice(-4);
  o.__custom = [...(o.__custom || []), { id, name, url, monogram }];
  store.saveMemberOverrides(o);
  return id;
}

function removeCustom(id) {
  const o = store.getMemberOverrides();
  o.__custom = (o.__custom || []).filter(c => c.id !== id);
  delete o[id];
  store.saveMemberOverrides(o);
}

function chromeUA() {
  const major = (process.versions.chrome || '140').split('.')[0];
  return `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36`;
}

function getWindow(id, { show = false } = {}) {
  let win = windows.get(id);
  if (win && !win.isDestroyed()) { if (show) { win.show(); win.focus(); } return win; }
  const a = adapterFor(id);
  if (!a) throw new Error('Unknown member ' + id);
  win = new BrowserWindow({
    width: 1180, height: 860, show, autoHideMenuBar: true,
    title: `${a.name} · Councilwise`,
    backgroundColor: '#FFFFFF',
    webPreferences: { partition: 'persist:cw-' + id, contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false, spellcheck: false }
  });
  win.webContents.setUserAgent(chromeUA());
  // Sign-in pop-ups (e.g. "Continue with Google") open in the same private session.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) return { action: 'allow', overrideBrowserWindowOptions: { autoHideMenuBar: true, webPreferences: { partition: 'persist:cw-' + id } } };
    return { action: 'deny' };
  });
  win.on('close', (e) => { if (!app.__quitting) { e.preventDefault(); win.hide(); } });
  // F12 opens developer tools in a member window, to inspect a site when fixing its connector.
  win.webContents.on('before-input-event', (_e, input) => { if (input.type === 'keyDown' && input.key === 'F12') win.webContents.toggleDevTools(); });
  win.loadURL(a.url).catch(() => {});
  windows.set(id, win);
  return win;
}

function showWindow(id) {
  const m = list().find(x => x.id === id);
  if (m && m.connection === 'browser') { browser.show(id, m.url).catch(() => {}); return; }
  getWindow(id, { show: true });
}

// The page a member runs in: a built-in window, or a window in the user's Chrome/Edge.
async function surface(id, { show = false } = {}) {
  const m = list().find(x => x.id === id);
  const a = adapterFor(id);
  if (m.connection === 'browser') return browser.tab(id, a.url, { show });
  return getWindow(id, { show }).webContents;
}
function hideWindow(id) { const w = windows.get(id); if (w && !w.isDestroyed()) w.hide(); }

async function check(id) {
  const m = list().find(x => x.id === id);
  if (!m) throw new Error('Unknown member');
  if (m.connection === 'demo') return update(id, { signedIn: true, lastChecked: new Date().toISOString(), planDetected: 'Demo' });
  if (m.connection === 'api') {
    const key = store.getSecret('api:' + id);
    const local = /localhost|127\.0\.0\.1/.test(m.api.baseUrl);
    if (!m.api.baseUrl || !m.api.model || (!key && !local)) return update(id, { signedIn: false, lastChecked: new Date().toISOString() });
    try {
      await api.test({ baseUrl: m.api.baseUrl, model: m.api.model, apiKey: key });
      return update(id, { signedIn: true, lastChecked: new Date().toISOString(), planDetected: 'API' });
    } catch (e) {
      update(id, { signedIn: false, lastChecked: new Date().toISOString() });
      throw e;
    }
  }
  const a = adapterFor(id);
  const wc = await surface(id);
  const cur = wc.getURL();
  if (!cur || cur === 'about:blank') await engine.open(wc, a.url);
  const res = await engine.probe(wc, a);
  return update(id, { signedIn: res.signedIn, lastChecked: new Date().toISOString(), ...(res.plan !== 'Unknown' ? { planDetected: res.plan } : {}) });
}

async function signOut(id) {
  const m = list().find(x => x.id === id);
  if (m && m.connection === 'browser') { await browser.clearSite(m.url); return update(id, { signedIn: false, planDetected: null }); }
  const { session } = require('electron');
  await session.fromPartition('persist:cw-' + id).clearStorageData();
  return update(id, { signedIn: false, planDetected: null });
}

function openPrivacy(id) {
  const m = list().find(x => x.id === id);
  if (!m) return;
  if (m.connection === 'web') { const w = getWindow(id, { show: true }); w.loadURL(m.privacyUrl).catch(() => {}); }
  else if (m.connection === 'browser') { browser.tab(id, m.url, { show: true }).then(t => t.loadURL(m.privacyUrl)).catch(() => {}); }
  else shell.openExternal(m.privacyUrl);
}

// A uniform client for one member in one council session.
function client(memberId, sessionCtx) {
  const m = list().find(x => x.id === memberId);
  const a = adapterFor(memberId);
  const conn = sessionCtx.forceDemo ? 'demo' : m.connection;
  const ms = sessionCtx.memberState(memberId);
  const limit = conn === 'api' ? 400000 : conn === 'demo' ? 60000 : (a.pasteLimit || 30000);

  async function newThread() {
    if (conn === 'web' || conn === 'browser') {
      const wc = await surface(memberId, { show: sessionCtx.showWindows });
      await engine.open(wc, a.url);
      ms.threadUrl = '';
    } else if (conn === 'api') {
      ms.apiMessages = [];
    }
  }

  async function ensureThread() {
    if (conn !== 'web' && conn !== 'browser') return;
    const wc = await surface(memberId);
    const url = wc.getURL();
    if (ms.threadUrl && url !== ms.threadUrl) await engine.open(wc, ms.threadUrl);
  }

  async function send(text, opts = {}) {
    if (conn === 'demo') {
      return demo.send({ id: memberId, name: m.name, roleId: opts.roleId }, text, {
        sessionId: sessionCtx.id, hiccup: sessionCtx.demoHiccup, fast: sessionCtx.fastDemo,
        shouldAbort: opts.shouldAbort, lastLongText: opts.lastLongText
      });
    }
    if (conn === 'api') {
      ms.apiMessages = ms.apiMessages || [];
      ms.apiMessages.push({ role: 'user', content: text });
      try {
        const out = await api.chat({ baseUrl: m.api.baseUrl, model: m.api.model, apiKey: store.getSecret('api:' + memberId), messages: ms.apiMessages, timeoutMs: opts.timeoutMs });
        ms.apiMessages.push({ role: 'assistant', content: out });
        return out;
      } catch (e) { ms.apiMessages.pop(); throw e; }
    }
    const wc = await surface(memberId, { show: opts.mode === 'assisted' });
    if (opts.mode === 'assisted' && conn === 'web') getWindow(memberId).show();
    const out = await engine.send(wc, a, text, opts);
    ms.threadUrl = wc.getURL();
    return out;
  }

  return { conn, limit, newThread, ensureThread, send, adapter: a, member: m };
}

module.exports = { browser, init, loadAdapters, list, update, addCustom, removeCustom, getWindow, showWindow, hideWindow, check, signOut, openPrivacy, client, adapterFor, userAdapterDir: () => userAdapterDir };
