'use strict';
/* global App, esc, go, call, badge, planChip, toast, refreshMembers, CONN, fmtDate */

App.views.members = {
  busy: {},
  async load() { await refreshMembers(); App.browserStatus = await call('browser:status'); },
  render() {
    const enc = App.info && App.info.encryption;
    return `<div class="ph"><div><div class="eyebrow">Members &amp; logins</div><h1>Connect your models</h1>
      <p>Sign in to each model's own website inside Councilwise. Your password goes only to that website; Councilwise keeps the signed-in session on this PC${enc ? ', encrypted by Windows' : ''}.</p></div>
      <div class="row"><button class="btn" data-act="checkall">Check all</button><button class="btn" data-act="folder">Connector folder</button><button class="btn" data-act="reload">Reload connectors</button></div></div>

    <div class="note" style="margin-bottom:16px"><span>Ways to connect each member: <b>My Chrome/Edge</b> (recommended: a real browser window with its own profile, so Google and other sign-ins work), <b>Built-in window</b>, <b>API key</b> (steadier, billed by the provider) or <b>Demo</b> (simulated). If a site changes and stops working, switch that member to API or update its connector file.</span></div>
    <div class="card" style="margin-bottom:16px;border-color:#111113">
      <h3 style="margin:0 0 6px">Tip: use a separate Google account</h3>
      <p class="small" style="margin:0">Create a fresh Gmail account just for Councilwise and use <b>Continue with Google</b> on every model. It's quick, keeps your everyday account separate, and signs you in to all members in a few clicks. During a council, one browser window opens per model and the prompts are typed in automatically — that's normal, just leave them open.</p>
    </div>
    ${App.browserStatus && !App.browserStatus.available ? '<div class="warn" style="margin-bottom:16px">Chrome or Edge was not found, so "My Chrome/Edge" is unavailable. Install Google Chrome, or set the browser path in Settings.</div>' : ''}

    <div class="grid2">${App.members.map(m => this.card(m)).join('')}
      <section class="card" style="border-style:dashed">
        <h2>Add a custom member</h2>
        <p class="small muted">Any chat website. Councilwise uses generic detection for the message box and answers; you can fine-tune it with a connector file.</p>
        <div class="stack" style="gap:10px">
          <label class="f">Name<input type="text" id="cname" placeholder="e.g. Kimi"></label>
          <label class="f">Chat address (https://)<input type="url" id="curl" placeholder="https://"></label>
          <button class="btn primary" data-act="addcustom">Add member</button>
        </div>
      </section>
    </div>`;
  },
  card(m) {
    const state = m.connection === 'demo' ? '<span class="chip redo">Demo</span>'
      : m.signedIn ? `<span class="chip ok"><span class="d"></span>${m.connection === 'api' ? 'API working' : 'Signed in'}</span>`
      : m.signedIn === false ? `<span class="chip red">${m.connection === 'api' ? 'API not working' : 'Not signed in'}</span>` : '<span class="chip">Not checked</span>';
    const busy = this.busy[m.id];
    return `<section class="card">
      <div class="row between" style="align-items:flex-start">
        <div class="row" style="flex-wrap:nowrap">${badge(m, 'lg')}<div><h2 style="margin:0">${esc(m.name)}</h2><div class="small muted">${esc(m.maker)} · connector ${esc(m.adapterVersion)} (${esc(m.adapterSource)})</div></div></div>
        <div class="row">${state}${planChip(m.plan)}</div>
      </div>
      <div class="row" style="margin-top:14px">
        <span class="seg" data-conn="${esc(m.id)}">${['browser', 'web', 'api', 'demo'].map(c => `<button data-v="${c}" class="${m.connection === c ? 'on' : ''}">${CONN[c]}</button>`).join('')}</span>
        <label class="small muted">Plan:
          <select data-plan="${esc(m.id)}" style="width:auto;padding:5px 8px">${['', 'Free', 'Pro', 'Team'].map(p => `<option value="${p}" ${(m.planSource === 'manual' && m.plan === p) ? 'selected' : ''}>${p || 'Auto-detect'}</option>`).join('')}</select></label>
      </div>
      ${m.connection === 'web' || m.connection === 'browser' ? `<div class="row" style="margin-top:12px">
          <button class="btn sm primary" data-open="${esc(m.id)}">Open &amp; sign in</button>
          <button class="btn sm" data-check="${esc(m.id)}" ${busy ? 'disabled' : ''}>${busy ? 'Checking…' : 'Check sign-in & plan'}</button>
          <button class="btn sm" data-privacy="${esc(m.id)}">Privacy settings</button>
          <button class="btn sm ghost" data-signout="${esc(m.id)}">Sign out</button>
          ${m.custom ? `<button class="btn sm ghost" data-remove="${esc(m.id)}">Remove</button>` : ''}
        </div>
        ${m.connection === 'browser' ? `<p class="small" style="margin:10px 0 0">Opens in a separate ${esc(App.browserStatus && App.browserStatus.name || 'Chrome/Edge')} window with its own Councilwise profile (not your everyday one). Google sign-in works here. Keep that window open while a council runs.</p>` : '<p class="small" style="margin:10px 0 0">Built-in window. If Google says "This browser or app may not be secure", switch to <b>My Chrome/Edge</b>.</p>'}
        <p class="small muted" style="margin:10px 0 0">${m.upload && m.upload.supported ? `Accepts file uploads up to ${m.upload.maxMB} MB.` : 'No file upload; the text is pasted in.'} Long documents are sent in parts of about ${Math.round(m.pasteLimit / 1000)}k characters.${m.webAccess ? ' Has web search (can fact-check).' : ''}${m.privacyHint ? ' ' + esc(m.privacyHint) : ''}${m.lastChecked ? ` Last checked ${esc(fmtDate(m.lastChecked))}.` : ''}</p>`
      : m.connection === 'api' ? `<div class="stack" style="gap:10px;margin-top:12px">
          <div class="grid2"><label class="f">Base URL<input type="text" data-apibase="${esc(m.id)}" value="${esc(m.api.baseUrl)}"></label>
          <label class="f">Model<input type="text" data-apimodel="${esc(m.id)}" value="${esc(m.api.model)}"></label></div>
          <label class="f">API key <span class="h">${m.api.hasKey ? 'A key is saved (encrypted). Type a new one to replace it.' : 'Stored encrypted on this PC. Leave empty for local models (Ollama).'}</span><input type="password" data-apikey="${esc(m.id)}" placeholder="${m.api.hasKey ? '••••••••••••' : 'sk-…'}"></label>
          <div class="row"><button class="btn sm primary" data-apisave="${esc(m.id)}">Save</button><button class="btn sm" data-check="${esc(m.id)}" ${busy ? 'disabled' : ''}>${busy ? 'Testing…' : 'Test connection'}</button></div>
          <p class="small muted" style="margin:0">Any OpenAI-compatible endpoint works, including OpenRouter and a local Ollama server (http://localhost:11434/v1).</p></div>`
      : '<p class="small muted" style="margin:12px 0 0">Demo answers are simulated locally and labelled as demo data in every report.</p>'}
    </section>`;
  },
  mount(root) {
    const rerender = () => { const sc = document.getElementById('view').scrollTop; go('members').then(() => { document.getElementById('view').scrollTop = sc; }); };
    const on = (sel, fn) => root.querySelectorAll(sel).forEach(el => el.addEventListener('click', () => fn(el)));
    root.querySelectorAll('[data-conn] button').forEach(b => b.onclick = async () => { await call('members:update', b.closest('[data-conn]').dataset.conn, { connection: b.dataset.v, signedIn: null }); rerender(); });
    root.querySelectorAll('[data-plan]').forEach(s => s.onchange = async () => { await call('members:update', s.dataset.plan, { planManual: s.value || null }); rerender(); });
    on('[data-open]', el => call('members:open', el.dataset.open));
    on('[data-privacy]', el => call('members:privacy', el.dataset.privacy));
    on('[data-signout]', async el => { await call('members:signOut', el.dataset.signout); toast('Signed out and cleared this member\'s saved session.'); rerender(); });
    on('[data-remove]', async el => { await call('members:removeCustom', el.dataset.remove); rerender(); });
    on('[data-check]', async el => {
      const id = el.dataset.check; this.busy[id] = true; rerender();
      try { const m = await call('members:check', id); toast(`${m.name}: ${m.signedIn ? 'ready' : 'not ready'} · plan ${m.plan}`); } catch { /* toast shown */ }
      this.busy[id] = false; rerender();
    });
    on('[data-apisave]', async el => {
      const id = el.dataset.apisave;
      const patch = { api: { baseUrl: root.querySelector(`[data-apibase="${id}"]`).value.trim(), model: root.querySelector(`[data-apimodel="${id}"]`).value.trim() } };
      const key = root.querySelector(`[data-apikey="${id}"]`).value.trim();
      if (key) patch.apiKey = key;
      await call('members:update', id, patch); toast('Saved.'); rerender();
    });
    on('[data-act="checkall"]', async () => {
      for (const m of App.members.filter(x => x.connection !== 'demo')) {
        this.busy[m.id] = true; rerender();
        try { await call('members:check', m.id); } catch { /* keep going */ }
        this.busy[m.id] = false;
      }
      rerender();
    });
    on('[data-act="folder"]', () => call('adapters:openFolder'));
    on('[data-act="reload"]', async () => { await call('adapters:reload'); toast('Connectors reloaded.'); rerender(); });
    on('[data-act="addcustom"]', async () => {
      const name = root.querySelector('#cname').value.trim(), url = root.querySelector('#curl').value.trim();
      await call('members:addCustom', { name, url }); toast(`${name} added. Open it and sign in.`); rerender();
    });
  }
};
