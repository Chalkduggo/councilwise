'use strict';
/* global App, esc, go, call, badge, planChip, toast, refreshMembers, CONN, cw */

function defaultDraft() {
  const tpl = App.templates.find(t => t.id === 'document-review') || App.templates[0];
  const members = {};
  for (const m of App.members) members[m.id] = { on: !m.custom, roleId: (tpl.defaultRoles || {})[m.id] || 'strategist' };
  const ids = App.members.map(m => m.id);
  return {
    file: null, title: '', brief: '', templateId: tpl.id, members,
    headId: ids.includes('gemini') ? 'gemini' : ids[0], moderatorId: ids.includes('claude') ? 'claude' : ids[1],
    factCheckerId: 'auto', mode: 'auto', peerReview: true, factCheck: true, attachOriginal: !!App.settings.attachOriginalWhenPossible,
    demo: false, format: App.settings.defaultFormat || 'pdf'
  };
}

App.views.new = {
  est: null,
  async load() {
    await refreshMembers();
    if (!App.draft) App.draft = defaultDraft();
    for (const m of App.members) if (!App.draft.members[m.id]) App.draft.members[m.id] = { on: false, roleId: 'strategist' };
  },
  render() {
    const d = App.draft;
    const tpl = App.templates.find(t => t.id === d.templateId) || App.templates[0];
    const roleOpts = sel => App.roles.map(r => `<option value="${esc(r.id)}"${r.id === sel ? ' selected' : ''}>${esc(r.name)}</option>`).join('');
    const on = App.members.filter(m => d.members[m.id] && d.members[m.id].on);
    return `
    <div class="ph"><div><div class="eyebrow">New council</div><h1>Set up a review</h1><p>One file, a short brief, your members and their roles. Councilwise does the rest.</p></div>
      <button class="btn ghost" data-act="reset">Reset form</button></div>
    <div class="split">
      <div class="stack">
        <section class="card">
          <h2>1 · Document</h2>
          <div class="drop ${d.file ? 'has' : ''}" id="drop">
            ${d.file ? `<div class="fileicon">${esc((d.file.ext || '').replace('.', '').toUpperCase())}</div>
              <div style="flex:1"><b>${esc(d.file.name)}</b><div class="small muted">${d.file.words.toLocaleString()} words · ${(d.file.size / 1024).toFixed(0)} KB · Councilwise works on a copy; your original is never changed.</div></div>
              <button class="btn sm" data-act="choose">Change</button>`
            : `<b>Drop a file here or click to choose</b><div class="small muted" style="margin-top:6px">Word (.docx), PDF, text or Markdown · one file per council</div>
              <div style="margin-top:12px"><button class="btn sm" data-act="sample">Use the sample document</button></div>`}
          </div>
        </section>

        <section class="card">
          <h2>2 · Brief</h2>
          <div class="grid2">
            <label class="f">Session name <span class="h">Shown on the reports</span><input type="text" id="title" value="${esc(d.title)}" placeholder="${esc(d.file ? d.file.name.replace(/\.[^.]+$/, '') : 'e.g. 2027 launch plan review')}"></label>
            <label class="f">Output format <span class="h">You can export the others later too</span>
              <div class="seg" id="fmt">${['pdf', 'docx', 'txt', 'md'].map(f => `<button data-v="${f}" class="${d.format === f ? 'on' : ''}">${{ pdf: 'PDF', docx: 'Word', txt: 'Text', md: 'Markdown' }[f]}</button>`).join('')}</div></label>
          </div>
          <label class="f" style="margin-top:12px">What do you want from this review? <span class="h">Your idea, worries, audience, or the decision you need to make</span>
            <textarea id="brief" placeholder="e.g. We present this to investors next week. Is it credible? What are the three biggest risks and what must change first?">${esc(d.brief)}</textarea></label>
        </section>

        <section class="card">
          <h2>3 · Review type</h2>
          <div class="tpls">${App.templates.map(t => `<div class="tpl ${t.id === d.templateId ? 'on' : ''}" data-tpl="${esc(t.id)}"><b>${esc(t.name)}</b><span>${esc(t.description)}</span><span style="margin-top:6px">${t.dimensions.length} scorecard dimensions</span></div>`).join('')}</div>
          <p class="small muted" style="margin:10px 0 0">Scorecard: ${tpl.dimensions.map(x => esc(x.name)).join(' · ')}</p>
        </section>

        <section class="card">
          <div class="row between"><h2 style="margin:0">4 · Council</h2><div class="row"><span class="small muted">${on.length} members</span><button class="btn sm" data-act="all">All</button><button class="btn sm" data-act="ready">Ready only</button></div></div>
          <div class="mrow mhead" style="margin-top:8px"><span></span><span></span><span>Member</span><span>Role</span><span>Status</span><span>Head</span><span>Moderator</span></div>
          ${App.members.map(m => {
            const mm = d.members[m.id] || {};
            const st = d.demo ? '<span class="chip redo">Demo</span>' : m.connection === 'demo' ? '<span class="chip redo">Demo</span>' : m.signedIn ? '<span class="chip ok"><span class="d"></span>Ready</span>' : m.signedIn === false ? '<span class="chip redo">Sign in needed</span>' : '<span class="chip">Not checked</span>';
            return `<div class="mrow ${mm.on ? '' : 'off'}">
              <input type="checkbox" class="chk" data-on="${esc(m.id)}" ${mm.on ? 'checked' : ''} aria-label="Include ${esc(m.name)}">
              ${badge(m, d.headId === m.id ? 'head' : '')}
              <div><div class="nm">${esc(m.name)}</div><div class="sub">${esc(CONN[d.demo ? 'demo' : m.connection])}${d.demo ? '' : ' · ' + planChip(m.plan)}${m.webAccess ? ' · web search' : ''}</div></div>
              <select data-role="${esc(m.id)}" ${mm.on ? '' : 'disabled'}>${roleOpts(mm.roleId)}</select>
              <div>${st}</div>
              <input type="radio" class="radio" name="head" data-head="${esc(m.id)}" ${d.headId === m.id ? 'checked' : ''} ${mm.on ? '' : 'disabled'} aria-label="Council Head">
              <input type="radio" class="radio" name="mod" data-mod="${esc(m.id)}" ${d.moderatorId === m.id ? 'checked' : ''} ${mm.on ? '' : 'disabled'} aria-label="Moderator">
            </div>`;
          }).join('')}
          <div class="row" style="margin-top:12px">
            <label class="f" style="flex:1">Fact-checker <span class="h">Checks dates, prices and facts with live search</span>
              <select id="fc"><option value="auto">Automatic (a member with web search)</option>${on.map(m => `<option value="${esc(m.id)}" ${d.factCheckerId === m.id ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select></label>
          </div>
        </section>

        <section class="card">
          <h2>5 · How it runs</h2>
          <div class="row" style="margin-bottom:6px"><span class="seg" id="mode"><button data-v="auto" class="${d.mode === 'auto' ? 'on' : ''}">Automatic</button><button data-v="assisted" class="${d.mode === 'assisted' ? 'on' : ''}">Assisted</button></span>
            <span class="small muted">${d.mode === 'auto' ? 'Councilwise types and sends every message for you.' : 'Councilwise fills in each message; you check it and press Send in each window.'}</span></div>
          ${toggle('peerReview', 'Anonymous peer review', 'Members rank each other\'s findings as Reviewer A, B, C… and flag unsupported claims.', d.peerReview)}
          ${toggle('factCheck', 'Live fact check', 'Time-sensitive claims (prices, dates, laws, versions) are checked by a member with web search.', d.factCheck)}
          ${toggle('attachOriginal', 'Attach the original file where the site allows it', 'Off: the text is pasted (most reliable). On: uploads the file to sites that accept uploads.', d.attachOriginal)}
          ${toggle('demo', 'Demo mode', 'Use simulated members instead of real sites. Good for trying the app or recording a walkthrough.', d.demo)}
        </section>
      </div>

      <aside class="stack sticky">
        <section class="card dark est" id="est">${this.estHtml()}</section>
        <button class="btn lg red wide" data-act="start">Start the council</button>
        <div class="note">🔒 Confidential document? Turn off model training in each site's privacy settings first (Members &amp; logins → Privacy settings).</div>
      </aside>
    </div>`;
  },
  estHtml() {
    const d = App.draft, e = this.est;
    const warns = this.warnings();
    return `<div class="eyebrow" style="color:#A1A1AA">Estimate</div>
      <div class="big">${e ? `${e.minutes.low}–${e.minutes.high} min` : '—'}</div>
      <div class="small" style="color:#D4D4D8">${e ? `${e.totalMessages} messages across ${e.members.length} members` : 'Choose a file and members'}</div>
      ${e ? `<table class="t" style="margin-top:12px;color:#fff"><tbody>${e.members.map(x => {
        const m = App.members.find(y => y.id === x.id) || {};
        return `<tr><td style="border-color:#27272A;padding:6px 4px">${esc(m.name)}${x.id === d.headId ? ' <span class="chip red" style="height:18px">Head</span>' : ''}${x.id === d.moderatorId ? ' <span class="chip" style="height:18px">Mod</span>' : ''}</td><td style="border-color:#27272A;padding:6px 4px;color:#A1A1AA" class="small">${esc(x.docMode)} · ${x.messages} msgs</td></tr>`;
      }).join('')}</tbody></table>` : ''}
      ${warns.length ? `<div class="stack" style="gap:8px;margin-top:12px">${warns.map(w => `<div class="warn">${esc(w)}</div>`).join('')}</div>` : ''}`;
  },
  warnings() {
    const d = App.draft, w = [];
    const on = App.members.filter(m => d.members[m.id] && d.members[m.id].on);
    if (!d.file) w.push('Choose a document to review.');
    if (on.length < 2) w.push('Pick at least two members (three or more for peer review).');
    if (!on.find(m => m.id === d.headId)) w.push('Choose a Council Head from the selected members.');
    if (!on.find(m => m.id === d.moderatorId)) w.push('Choose a moderator from the selected members.');
    if (d.headId === d.moderatorId && on.length > 1) w.push('Head and moderator are the same model. It works, but a second model makes the moderation an independent check.');
    if (!d.demo) {
      const notReady = on.filter(m => (m.connection === 'web' || m.connection === 'browser') && !m.signedIn);
      if (notReady.length) w.push(`Not signed in yet: ${notReady.map(m => m.name).join(', ')}. You can sign in now in Members & logins, or during the run when the app asks.`);
      const free = on.filter(m => m.plan === 'Free');
      if (free.length && d.file && d.file.words > 15000) w.push(`${free.map(m => m.name).join(', ')} ${free.length > 1 ? 'are' : 'is'} on a Free plan; long documents may hit message limits.`);
    }
    return w;
  },
  async refreshEstimate() {
    const d = App.draft;
    if (!d.file) { this.est = null; } else {
      this.est = await call('session:estimate', this.cfg());
    }
    const el = document.getElementById('est');
    if (el) el.innerHTML = this.estHtml();
  },
  cfg() {
    const d = App.draft;
    const ids = App.members.filter(m => d.members[m.id] && d.members[m.id].on).map(m => m.id);
    return {
      title: d.title, brief: d.brief, templateId: d.templateId, filePath: d.file && d.file.path, chars: d.file && d.file.chars,
      members: ids.map(id => ({ id, roleId: d.members[id].roleId })), headId: d.headId, moderatorId: d.moderatorId,
      factCheckerId: d.factCheckerId === 'auto' ? null : d.factCheckerId, mode: d.mode,
      peerReview: d.peerReview, factCheck: d.factCheck, attachOriginal: d.attachOriginal, demo: d.demo, format: d.format
    };
  },
  mount(root) {
    const d = App.draft;
    const rerender = () => { App.views.new.mountScroll = document.getElementById('view').scrollTop; go('new').then(() => { document.getElementById('view').scrollTop = App.views.new.mountScroll; }); };
    const setFile = f => { d.file = f; if (!d.title && f) d.title = f.name.replace(/\.[^.]+$/, ''); rerender(); };
    const drop = root.querySelector('#drop');
    drop.onclick = async (e) => {
      if (e.target.closest('[data-act="sample"]')) { const p = await call('sample:path'); setFile(await call('file:inspect', p)); return; }
      const f = await call('file:choose'); if (f) setFile(f);
    };
    drop.ondragover = e => { e.preventDefault(); drop.classList.add('over'); };
    drop.ondragleave = () => drop.classList.remove('over');
    drop.ondrop = async e => {
      e.preventDefault(); drop.classList.remove('over');
      const file = e.dataTransfer.files[0];
      if (!file) return;
      try { setFile(await call('file:inspect', cw.pathForFile(file))); } catch { /* toast shown */ }
    };
    root.querySelector('#title').oninput = e => { d.title = e.target.value; };
    root.querySelector('#brief').oninput = e => { d.brief = e.target.value; };
    root.querySelectorAll('#fmt button').forEach(b => b.onclick = () => { d.format = b.dataset.v; rerender(); });
    root.querySelectorAll('#mode button').forEach(b => b.onclick = () => { d.mode = b.dataset.v; rerender(); });
    root.querySelectorAll('[data-tpl]').forEach(el => el.onclick = () => {
      d.templateId = el.dataset.tpl;
      const tpl = App.templates.find(t => t.id === d.templateId);
      for (const id of Object.keys(d.members)) if (tpl.defaultRoles && tpl.defaultRoles[id]) d.members[id].roleId = tpl.defaultRoles[id];
      rerender();
    });
    root.querySelectorAll('[data-on]').forEach(el => el.onchange = () => { d.members[el.dataset.on].on = el.checked; rerender(); });
    root.querySelectorAll('[data-role]').forEach(el => el.onchange = () => { d.members[el.dataset.role].roleId = el.value; });
    root.querySelectorAll('[data-head]').forEach(el => el.onchange = () => { d.headId = el.dataset.head; rerender(); });
    root.querySelectorAll('[data-mod]').forEach(el => el.onchange = () => { d.moderatorId = el.dataset.mod; rerender(); });
    root.querySelector('#fc').onchange = e => { d.factCheckerId = e.target.value; };
    root.querySelectorAll('[data-tg]').forEach(el => el.onchange = () => { d[el.dataset.tg] = el.checked; rerender(); });
    root.querySelector('[data-act="all"]').onclick = () => { for (const m of App.members) d.members[m.id].on = true; rerender(); };
    root.querySelector('[data-act="ready"]').onclick = () => { for (const m of App.members) d.members[m.id].on = !!m.signedIn || !['web', 'browser'].includes(m.connection); rerender(); };
    root.querySelector('[data-act="reset"]').onclick = () => { App.draft = defaultDraft(); rerender(); };
    root.querySelector('[data-act="start"]').onclick = async (e) => {
      const blocking = this.warnings().filter(w => /^(Choose|Pick)/.test(w));
      if (blocking.length) { toast(blocking[0], true); return; }
      e.target.disabled = true; e.target.textContent = 'Starting…';
      try {
        const snap = await call('session:create', this.cfg());
        await call('session:start', snap.id);
        App.liveId = snap.id; App.live = snap;
        App.draft = null;
        go('run', { id: snap.id });
      } catch { e.target.disabled = false; e.target.textContent = 'Start the council'; }
    };
    this.refreshEstimate();
  }
};

function toggle(key, title, help, value) {
  return `<label class="toggle"><input type="checkbox" data-tg="${key}" ${value ? 'checked' : ''}><span class="sw"></span><span><b>${esc(title)}</b><small>${esc(help)}</small></span></label>`;
}
