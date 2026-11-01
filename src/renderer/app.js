'use strict';
/* global cw */
// Councilwise renderer: tiny router, shared helpers, live session state.

const App = {
  view: 'home', params: {}, views: {},
  info: null, members: [], templates: [], roles: [], settings: {},
  live: null,          // latest snapshot of the session currently shown on Live run
  liveId: null,
  draft: null          // the New council form, kept while you move between screens
};

const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const VERDICT = { go: 'Go', go_with_conditions: 'Go with conditions', revise: 'Revise', no_go: 'No-go' };
const RATING = { pass: 'Pass', weak: 'Weak', at_risk: 'At risk', unproven: 'Unproven' };
const STATUS = {
  idle: 'Idle', checking: 'Checking', ready: 'Ready', waiting: 'Waiting', working: 'Working', paused: 'Paused',
  needs_you: 'Needs you', retrying: 'Retrying', stopped: 'Stopped', skipped: 'Skipped', done: 'Done', failed: 'Failed',
  running: 'Running', completed: 'Completed'
};
const SESSION_STATUS = { ready: 'Ready', running: 'Running', paused: 'Paused', stopped: 'Stopped', completed: 'Completed', failed: 'Failed' };
const CONTACT = {
  attribution: 'Councilwise is an open-source software product developed and maintained by LoopWise, created by Suman Mondal.',
  personal: 'sumanmondaljobs2022@gmail.com',
  official: 'suman.mondal.8@loopwise.pro'
};
const CONN = { browser: 'My Chrome/Edge', web: 'Built-in window', api: 'API key', demo: 'Demo' };

function statusChip(s, label) { return `<span class="st st-${esc(s)}"><i></i>${esc(label || STATUS[s] || s)}</span>`; }
function badge(m, extra = '') { return `<span class="badge ${extra}">${esc(m.monogram || (m.name || '?').slice(0, 2).toUpperCase())}</span>`; }
function planChip(plan) {
  if (!plan || plan === 'Unknown') return '<span class="chip">Plan unknown</span>';
  if (plan === 'Pro' || plan === 'API') return `<span class="chip ink">${esc(plan)}</span>`;
  if (plan === 'Demo') return '<span class="chip redo">Demo</span>';
  return `<span class="chip">${esc(plan)}</span>`;
}
function fmtDur(ms) {
  const s = Math.max(0, Math.round((ms || 0) / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  return (h ? h + ':' + String(m).padStart(2, '0') : String(m).padStart(2, '0')) + ':' + String(x).padStart(2, '0');
}
function fmtDate(iso) { try { return new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return iso; } }
function fmtTime(t) { return new Date(t).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' }); }

let toastTimer = null;
function toast(msg, isErr) {
  const el = $('#toast');
  el.textContent = msg;
  el.className = 'toast' + (isErr ? ' err' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), isErr ? 6000 : 3200);
}

function modal(html) {
  const el = $('#modal');
  el.innerHTML = `<div class="box">${html}</div>`;
  el.classList.remove('hidden');
  el.onclick = (e) => { if (e.target === el || e.target.closest('[data-close]')) closeModal(); };
}
function closeModal() { $('#modal').classList.add('hidden'); $('#modal').innerHTML = ''; }

async function call(ch, ...args) {
  try { return await cw.call(ch, ...args); }
  catch (e) { toast(e.message, true); throw e; }
}

async function go(view, params = {}) {
  App.view = view; App.params = params;
  $$('#nav a').forEach(a => a.classList.toggle('on', a.dataset.nav === view || (view === 'report' && a.dataset.nav === 'history')));
  const v = App.views[view];
  if (v && v.load) {
    try { await v.load(params); } catch (e) { toast(e.message, true); }
    if (App.view !== view) return; // user moved on while loading
  }
  render();
  $('#view').scrollTop = 0;
}

function render() {
  const v = App.views[App.view];
  if (!v) return;
  $('#view').innerHTML = `<div class="page">${v.render()}</div>`;
  if (v.mount) v.mount($('#view'));
}

async function refreshMembers() { App.members = await cw.call('members:list'); return App.members; }

function updateLiveMini() {
  const el = $('#liveMini');
  const s = App.live;
  const dot = $('#nav a[data-nav="run"]');
  if (!s || !['running', 'paused'].includes(s.status)) {
    el.classList.add('hidden');
    if (dot) dot.innerHTML = 'Live run';
    return;
  }
  const states = Object.values(s.memberState);
  const need = states.filter(x => x.status === 'needs_you').length;
  const done = states.filter(x => x.status === 'done').length;
  el.classList.remove('hidden');
  el.innerHTML = `<b>${esc(s.title)}</b>${s.status === 'paused' ? 'Paused' : 'Running'} · ${done}/${states.length} done${need ? ` · <span style="color:#FF6B7A">${need} need you</span>` : ''}`;
  el.onclick = () => go('run', { id: s.id });
  if (dot) dot.innerHTML = 'Live run' + (need ? '<span class="dot"></span>' : '');
}

async function boot() {
  App.info = await cw.call('app:info');
  $('#ver').textContent = `v${App.info.version} · MIT`;
  $('#sidecontact').innerHTML = `<div class="sc-by">By LoopWise · Suman Mondal</div>
    <span class="sc-l">Official</span><a href="mailto:${CONTACT.official}" title="Official LoopWise contact">${CONTACT.official}</a>
    <span class="sc-l">Personal</span><a href="mailto:${CONTACT.personal}" title="Personal contact">${CONTACT.personal}</a>`;
  App.settings = await cw.call('settings:get');
  const t = await cw.call('templates:list');
  App.templates = t.templates; App.roles = t.roles;
  await refreshMembers();
  $$('#nav a').forEach(a => a.addEventListener('click', () => go(a.dataset.nav, a.dataset.nav === 'run' && App.liveId ? { id: App.liveId } : {})));
  document.addEventListener('click', e => { const g = e.target.closest('[data-goto]'); if (g) go(g.dataset.goto, App.liveId ? { id: App.liveId } : {}); });
  // mailto: and https: links open in the user's email app / browser, never inside Councilwise.
  document.addEventListener('click', e => {
    const a = e.target.closest('a[href^="mailto:"], a[href^="https://"]');
    if (!a) return;
    e.preventDefault();
    cw.call('shell:open', a.getAttribute('href')).catch(() => toast('Could not open the link.', true));
  });

  cw.on('session:update', snap => {
    if (!App.liveId || snap.id === App.liveId) { App.live = snap; App.liveId = snap.id; }
    updateLiveMini();
    if (App.view === 'run' && App.views.run.update && (!App.params.id || App.params.id === snap.id)) App.views.run.update(snap);
  });
  cw.on('session:attention', ({ memberId, note }) => {
    const m = App.members.find(x => x.id === memberId);
    if (App.view !== 'run') toast(`${m ? m.name : memberId} needs you: ${note}`, true);
  });
  go('home');
  if (App.info.demoFlag && !App.settings.firstRunDone) toast('Demo mode: try a council with simulated members from Home.');
}

window.addEventListener('DOMContentLoaded', () => { boot().catch(e => { document.body.innerHTML = `<pre style="padding:20px">${esc(e.stack || e)}</pre>`; }); });
