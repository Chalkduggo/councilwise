'use strict';
// Local storage for settings, member configs, secrets and sessions.
// Everything lives in the user's own app-data folder. Nothing is sent anywhere.
const fs = require('fs');
const path = require('path');

let baseDir = null;
let safeStorage = null;

function init(dir, electronSafeStorage) {
  baseDir = dir;
  safeStorage = electronSafeStorage || null;
  fs.mkdirSync(path.join(baseDir, 'sessions'), { recursive: true });
}

function p(...parts) { return path.join(baseDir, ...parts); }

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

// Write atomically so a crash mid-write never corrupts a checkpoint.
function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

const DEFAULT_SETTINGS = {
  authorName: '',
  authorTitle: '',
  organisation: '',
  logoDataUrl: '',
  defaultFormat: 'pdf',
  showWindowsInAuto: false,
  concurrency: 4,
  responseTimeoutMin: 12,
  retries: 2,
  demoHiccup: true,
  attachOriginalWhenPossible: false,
  firstRunDone: false
};

function getSettings() { return { ...DEFAULT_SETTINGS, ...readJson(p('settings.json'), {}) }; }
function saveSettings(patch) {
  const next = { ...getSettings(), ...patch };
  writeJson(p('settings.json'), next);
  return next;
}

// Secrets (API keys) are encrypted with Windows DPAPI via Electron safeStorage.
function readSecrets() { return readJson(p('secrets.json'), {}); }
function setSecret(name, value) {
  const all = readSecrets();
  if (!value) { delete all[name]; }
  else if (safeStorage && safeStorage.isEncryptionAvailable()) {
    all[name] = { enc: true, v: safeStorage.encryptString(value).toString('base64') };
  } else {
    all[name] = { enc: false, v: Buffer.from(value, 'utf8').toString('base64') };
  }
  writeJson(p('secrets.json'), all);
}
function getSecret(name) {
  const item = readSecrets()[name];
  if (!item) return '';
  try {
    if (item.enc) return safeStorage.decryptString(Buffer.from(item.v, 'base64'));
    return Buffer.from(item.v, 'base64').toString('utf8');
  } catch { return ''; }
}
function hasSecret(name) { return !!readSecrets()[name]; }

function getMemberOverrides() { return readJson(p('members.json'), {}); }
function saveMemberOverrides(obj) { writeJson(p('members.json'), obj); }

function sessionDir(id) { return p('sessions', id); }
function saveSession(session) { writeJson(path.join(sessionDir(session.id), 'session.json'), session); }
function loadSession(id) { return readJson(path.join(sessionDir(id), 'session.json'), null); }
function listSessions() {
  const dir = p('sessions');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .map(id => loadSession(id))
    .filter(Boolean)
    .map(s => ({
      id: s.id, title: s.title, createdAt: s.createdAt, status: s.status,
      templateId: s.templateId, verdict: s.result ? s.result.verdict : null,
      score: s.result ? s.result.confidence.score : null,
      members: s.members.length, fileName: s.file ? s.file.name : ''
    }))
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
}
function deleteSession(id) {
  fs.rmSync(sessionDir(id), { recursive: true, force: true });
}

module.exports = {
  init, p, readJson, writeJson, getSettings, saveSettings,
  setSecret, getSecret, hasSecret, getMemberOverrides, saveMemberOverrides,
  sessionDir, saveSession, loadSession, listSessions, deleteSession, DEFAULT_SETTINGS
};
