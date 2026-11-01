'use strict';
const electron = require('electron');
const { app, BrowserWindow, ipcMain, dialog, shell, Notification, safeStorage, Menu, nativeImage } = electron;
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const store = require('./store');
const members = require('./members');
const reports = require('./reports');
const docs = require('./docs');
const { Council, snapshot } = require('./council/orchestrator');

const ROOT = path.join(__dirname, '..', '..');
const DEMO_FLAG = process.argv.includes('--demo');
const DATA_DIR_FLAG = (process.argv.find(a => a.startsWith('--data-dir=')) || '').split('=')[1];
if (DATA_DIR_FLAG) app.setPath('userData', path.resolve(DATA_DIR_FLAG));

if (!app.requestSingleInstanceLock()) { app.quit(); }

let mainWin = null;
const councils = new Map(); // sessionId -> Council
let templates = {}, roles = [];

function loadTemplates() {
  templates = {};
  const dirs = [path.join(ROOT, 'templates'), store.p('templates')];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.json'))) {
      try {
        const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
        if (f === 'roles.json' && Array.isArray(j)) { roles = j; continue; }
        if (j.id && Array.isArray(j.dimensions)) templates[j.id] = { ...j, sections: j.sections || ['Overall verdict', 'Critical issues', 'Recommended changes', 'Scorecard'], defaultRoles: j.defaultRoles || {} };
      } catch { /* skip */ }
    }
  }
}

function createWindow() {
  mainWin = new BrowserWindow({
    width: 1440, height: 920, minWidth: 1100, minHeight: 720,
    backgroundColor: '#F4F4F5', title: 'Councilwise', show: false, autoHideMenuBar: true,
    icon: path.join(ROOT, 'assets', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, '..', 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  mainWin.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  mainWin.once('ready-to-show', () => mainWin.show());
  // Never let the app window navigate away from Councilwise; open links outside instead.
  mainWin.webContents.on('will-navigate', (e, url) => {
    if (url.startsWith('file:')) return;
    e.preventDefault();
    if (/^(https:|mailto:)/.test(url)) shell.openExternal(url).catch(() => {});
  });
  mainWin.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  mainWin.on('closed', () => { mainWin = null; });
}

function send(channel, payload) { if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send(channel, payload); }

// ---------- sessions ----------
const LETTERS = 'ABCDEFGHIJKLMNOP'.split('');

async function createSession(cfg) {
  if (!cfg.filePath || !fs.existsSync(cfg.filePath)) throw new Error('Choose a file to review.');
  if (!cfg.members || cfg.members.length < 2) throw new Error('Pick at least two members.');
  const tpl = templates[cfg.templateId] || templates['document-review'];
  const id = new Date().toISOString().slice(0, 10) + '-' + crypto.randomBytes(3).toString('hex');
  const dir = store.sessionDir(id);
  fs.mkdirSync(path.join(dir, 'doc'), { recursive: true });
  const name = path.basename(cfg.filePath);
  const copy = path.join(dir, 'doc', name);
  fs.copyFileSync(cfg.filePath, copy); // work on a copy, never the original
  const ext = await docs.extract(copy);
  const textPath = path.join(dir, 'doc', 'document.txt');
  fs.writeFileSync(textPath, ext.text);

  const all = members.list();
  const letters = [...LETTERS.slice(0, cfg.members.length)];
  for (let i = letters.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [letters[i], letters[j]] = [letters[j], letters[i]]; }
  const sessionMembers = cfg.members.map((m, i) => {
    const info = all.find(x => x.id === m.id) || { name: m.id, monogram: m.id.slice(0, 2).toUpperCase(), connection: 'web', plan: 'Unknown' };
    return { id: m.id, name: info.name, monogram: info.monogram, connection: cfg.demo ? 'demo' : info.connection, plan: cfg.demo ? 'Demo' : info.plan, roleId: m.roleId || tpl.defaultRoles[m.id] || 'strategist', letter: letters[i] };
  });
  const ids = sessionMembers.map(m => m.id);
  const session = {
    id, version: 1, title: (cfg.title || '').trim() || path.parse(name).name,
    createdAt: new Date().toISOString(), status: 'ready', stage: 'preflight', stageDone: {},
    templateId: tpl.id, templateName: tpl.name,
    config: {
      brief: cfg.brief || '', templateId: tpl.id, mode: cfg.mode === 'assisted' ? 'assisted' : 'auto',
      options: { peerReview: cfg.peerReview !== false, factCheck: cfg.factCheck !== false },
      attachOriginal: !!cfg.attachOriginal, format: cfg.format || store.getSettings().defaultFormat || 'pdf',
      demo: !!cfg.demo, fastDemo: !!cfg.fastDemo, demoHiccup: cfg.demoHiccup
    },
    file: { name, path: copy, textPath, size: fs.statSync(copy).size, chars: ext.chars, words: ext.words },
    members: sessionMembers,
    headId: ids.includes(cfg.headId) ? cfg.headId : ids[0],
    moderatorId: ids.includes(cfg.moderatorId) ? cfg.moderatorId : ids[ids.length > 1 ? 1 : 0],
    factCheckerId: ids.includes(cfg.factCheckerId) ? cfg.factCheckerId : null,
    steps: {}, memberState: Object.fromEntries(ids.map(i => [i, { status: 'idle', note: 'Waiting to start' }])),
    log: [], timing: {}, stats: { messages: 0, words: 0 }, outputs: []
  };
  store.saveSession(session);
  return session;
}

function getCouncil(id) {
  let c = councils.get(id);
  if (c) return c;
  const s = store.loadSession(id);
  if (!s) throw new Error('Session not found.');
  c = new Council(s, { members, store, templates, roles, settings: store.getSettings(), reports });
  c.on('update', snap => send('session:update', snap));
  c.on('attention', ({ memberId, note }) => {
    const m = s.members.find(x => x.id === memberId);
    send('session:attention', { sessionId: id, memberId, note });
    if (Notification.isSupported() && !(mainWin && mainWin.isFocused())) new Notification({ title: `Councilwise · ${m ? m.name : memberId} needs you`, body: note }).show();
    if (mainWin && !mainWin.isFocused()) mainWin.flashFrame(true);
  });
  c.on('finished', status => {
    if (Notification.isSupported() && status === 'completed') new Notification({ title: 'Councilwise · council complete', body: `${s.title}: the reports are ready.` }).show();
  });
  councils.set(id, c);
  return c;
}

function estimate(cfg) {
  const all = members.list();
  let chars = 0;
  try { if (cfg.filePath) chars = cfg.chars || fs.statSync(cfg.filePath).size; } catch { /* ignore */ }
  const per = (cfg.members || []).map(m => {
    const info = all.find(x => x.id === m.id) || {};
    const conn = cfg.demo ? 'demo' : info.connection;
    const limit = conn === 'api' ? 400000 : conn === 'demo' ? 60000 : (info.pasteLimit || 30000);
    const parts = chars + 9000 > limit ? Math.ceil(chars / (limit - 600)) : 0;
    const msgs = parts + 1 + (cfg.peerReview !== false ? 1 : 0) + (m.id === cfg.headId ? 1 : 0) + (m.id === cfg.moderatorId ? 1 : 0);
    const minPer = conn === 'demo' ? 0.05 : conn === 'api' ? 1.2 : 2.5;
    return { id: m.id, conn, docMode: parts ? `${parts} parts` : 'in one message', messages: msgs, minutes: +(msgs * minPer).toFixed(1), plan: info.plan };
  });
  const maxOf = k => Math.max(0, ...per.map(p => p[k]));
  const reviewMin = Math.max(0, ...per.map(p => p.minutes - (p.id === cfg.headId || p.id === cfg.moderatorId ? 2 * (p.conn === 'web' ? 3 : 1) : 0)));
  const allDemo = per.length && per.every(p => p.conn === 'demo');
  const low = allDemo ? 1 : Math.round(reviewMin + (cfg.factCheck !== false ? 2 : 0) + 4);
  return { members: per, minutes: { low, high: allDemo ? 2 : Math.round(low * 1.7 + 3) }, totalMessages: per.reduce((n, p) => n + p.messages, 0), maxMessages: maxOf('messages') };
}

// ---------- IPC ----------
function handle(ch, fn) {
  ipcMain.handle(ch, async (_e, ...args) => {
    try { return { ok: true, data: await fn(...args) }; }
    catch (e) { return { ok: false, error: String((e && e.message) || e) }; }
  });
}

function registerIpc() {
  handle('app:info', () => ({ version: app.getVersion(), name: 'Councilwise', demoFlag: DEMO_FLAG, platform: process.platform, userData: app.getPath('userData'), encryption: safeStorage.isEncryptionAvailable() }));
  handle('settings:get', () => store.getSettings());
  handle('settings:save', patch => store.saveSettings(patch));
  handle('settings:chooseLogo', async () => {
    const r = await dialog.showOpenDialog(mainWin, { properties: ['openFile'], filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg'] }] });
    if (r.canceled || !r.filePaths[0]) return null;
    const f = r.filePaths[0];
    if (fs.statSync(f).size > 1.5e6) throw new Error('Please choose a logo under 1.5 MB.');
    const ext = path.extname(f).slice(1).toLowerCase().replace('jpg', 'jpeg');
    return store.saveSettings({ logoDataUrl: `data:image/${ext};base64,` + fs.readFileSync(f).toString('base64') });
  });

  handle('members:list', () => members.list());
  handle('browser:status', () => members.browser.status());
  handle('members:update', (id, patch) => members.update(id, patch));
  handle('members:check', id => members.check(id));
  handle('members:open', id => { members.showWindow(id); return true; });
  handle('members:hide', id => { members.hideWindow(id); return true; });
  handle('members:signOut', id => members.signOut(id));
  handle('members:privacy', id => { members.openPrivacy(id); return true; });
  handle('members:addCustom', cfg => members.addCustom(cfg));
  handle('members:removeCustom', id => { members.removeCustom(id); return true; });

  handle('templates:list', () => ({ templates: Object.values(templates), roles }));
  handle('templates:openFolder', () => { fs.mkdirSync(store.p('templates'), { recursive: true }); shell.openPath(store.p('templates')); return true; });
  handle('adapters:openFolder', () => { shell.openPath(members.userAdapterDir()); return true; });
  handle('adapters:reload', () => { members.loadAdapters(); loadTemplates(); return members.list(); });

  handle('file:choose', async () => {
    const r = await dialog.showOpenDialog(mainWin, { properties: ['openFile'], filters: [{ name: 'Documents', extensions: docs.SUPPORTED.map(e => e.slice(1)) }] });
    if (r.canceled || !r.filePaths[0]) return null;
    return inspect(r.filePaths[0]);
  });
  handle('file:inspect', p => inspect(p));

  handle('session:estimate', cfg => estimate(cfg));
  handle('session:create', async cfg => snapshot(await createSession(cfg)));
  handle('session:start', id => { const c = getCouncil(id); c.d.settings = store.getSettings(); c.run(); return snapshot(c.s); });
  handle('session:pause', id => { getCouncil(id).pause(); return true; });
  handle('session:resume', id => {
    const c = getCouncil(id);
    if (c.running) { c.resumeFromPause(); return true; }
    c.s.timing.resumedCount = (c.s.timing.resumedCount || 0) + 1;
    c.d.settings = store.getSettings();
    c.run();
    return true;
  });
  handle('session:stop', id => { getCouncil(id).stop(); return true; });
  handle('session:memberAction', (id, memberId, action) => {
    if (action === 'show') { members.showWindow(memberId); return true; }
    getCouncil(id).memberAction(memberId, action); return true;
  });
  handle('session:get', id => { const c = councils.get(id); return snapshot(c ? c.s : store.loadSession(id)); });
  handle('session:list', () => store.listSessions());
  handle('session:delete', id => { const c = councils.get(id); if (c && c.running) throw new Error('Stop the council before deleting it.'); councils.delete(id); store.deleteSession(id); return true; });
  handle('session:raw', (id, key) => { const s = (councils.get(id) || {}).s || store.loadSession(id); const st = s.steps[key]; return st ? { prompt: st.prompt || '', response: st.response || '' } : null; });

  handle('report:export', async (id, kind, format) => {
    const s = (councils.get(id) || {}).s || store.loadSession(id);
    if (!s || !s.result) throw new Error('This session has no results yet.');
    const out = await reports.generate(s, kind, format);
    s.outputs = (s.outputs || []).filter(o => !(o.kind === kind && o.format === format)).concat([{ kind, format, path: out }]);
    store.saveSession(s);
    return out;
  });
  handle('report:open', p => shell.openPath(p));
  handle('report:show', p => { shell.showItemInFolder(p); return true; });
  handle('report:saveAs', async p => {
    const r = await dialog.showSaveDialog(mainWin, { defaultPath: path.join(app.getPath('documents'), path.basename(p)) });
    if (r.canceled || !r.filePath) return null;
    fs.copyFileSync(p, r.filePath);
    return r.filePath;
  });
  handle('report:preview', (id, kind) => { const s = (councils.get(id) || {}).s || store.loadSession(id); return reports.previewHtml(s, kind); });
  handle('shell:open', async url => {
    const ok = /^https:\/\/[^\s]+$/.test(url) || /^mailto:[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(url);
    if (!ok) throw new Error('This link type is not allowed.');
    if (process.env.CW_TEST_NO_EXTERNAL) return url; // tests: validate only
    await shell.openExternal(url);
    return url;
  });
  handle('sample:path', () => path.join(ROOT, 'assets', 'sample', 'Sample-Launch-Plan.md'));
}

async function inspect(p) {
  const st = fs.statSync(p);
  const ext = await docs.extract(p);
  return { path: p, name: path.basename(p), size: st.size, words: ext.words, chars: ext.chars, ext: ext.ext };
}

// Sessions that were running when the app closed are marked as interrupted, ready to resume.
function markInterrupted() {
  for (const it of store.listSessions()) {
    if (['running', 'paused'].includes(it.status)) {
      const s = store.loadSession(it.id);
      s.status = 'stopped';
      s.log.push({ t: Date.now(), level: 'warn', msg: 'The app closed while this council was running. Press Resume to continue from the last checkpoint.' });
      for (const ms of Object.values(s.memberState)) if (!['done', 'skipped', 'failed'].includes(ms.status)) { ms.status = 'stopped'; ms.note = 'Interrupted'; }
      store.saveSession(s);
    }
  }
}

app.on('second-instance', () => { if (mainWin) { if (mainWin.isMinimized()) mainWin.restore(); mainWin.focus(); } });
app.on('before-quit', () => { app.__quitting = true; });
app.on('window-all-closed', () => app.quit());

app.whenReady().then(() => {
  app.setAppUserModelId('io.github.councilwise');
  Menu.setApplicationMenu(null);
  store.init(app.getPath('userData'), safeStorage);
  members.init(electron);
  reports.init(electron);
  loadTemplates();
  markInterrupted();
  registerIpc();
  createWindow();
  void nativeImage;
});

module.exports = { createSession, estimate };
