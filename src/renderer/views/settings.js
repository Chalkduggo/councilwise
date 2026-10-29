'use strict';
/* global App, esc, go, call, toast */

App.views.settings = {
  async load() { App.settings = await call('settings:get'); },
  render() {
    const s = App.settings, i = App.info;
    const num = (k, label, help, min, max) => `<label class="f">${label} <span class="h">${help}</span><input type="number" data-num="${k}" value="${esc(s[k])}" min="${min}" max="${max}"></label>`;
    const tg = (k, title, help) => `<label class="toggle"><input type="checkbox" data-tg="${k}" ${s[k] ? 'checked' : ''}><span class="sw"></span><span><b>${title}</b><small>${help}</small></span></label>`;
    return `<div class="ph"><div><div class="eyebrow">Settings</div><h1>Settings</h1><p>Report branding, defaults and how runs behave.</p></div></div>
    <div class="grid2">
      <section class="card">
        <h2>Report branding</h2>
        <div class="stack" style="gap:10px">
          <label class="f">Your name <span class="h">Printed on every report</span><input type="text" data-txt="authorName" value="${esc(s.authorName)}"></label>
          <label class="f">Title<input type="text" data-txt="authorTitle" value="${esc(s.authorTitle)}" placeholder="e.g. Head of Strategy"></label>
          <label class="f">Organisation<input type="text" data-txt="organisation" value="${esc(s.organisation)}"></label>
          <div class="row">${s.logoDataUrl ? `<img src="${esc(s.logoDataUrl)}" alt="Your logo" style="height:40px;border:1px solid #E4E4E7;border-radius:8px;padding:4px">` : '<span class="muted small">No logo — the Councilwise mark is used.</span>'}
            <button class="btn sm" data-act="logo">Choose logo</button>${s.logoDataUrl ? '<button class="btn sm ghost" data-act="nologo">Remove</button>' : ''}</div>
          <button class="btn primary" data-act="save" style="align-self:flex-start">Save branding</button>
        </div>
      </section>
      <section class="card">
        <h2>Defaults</h2>
        <label class="f">Default report format<div class="seg" id="deffmt">${['pdf', 'docx', 'txt', 'md'].map(f => `<button data-v="${f}" class="${s.defaultFormat === f ? 'on' : ''}">${{ pdf: 'PDF', docx: 'Word', txt: 'Text', md: 'Markdown' }[f]}</button>`).join('')}</div></label>
        ${tg('attachOriginalWhenPossible', 'Attach the original file by default', 'Otherwise the text is pasted, which is more reliable.')}
        ${tg('showWindowsInAuto', 'Show model windows during automatic runs', 'Turn on if a site seems stuck when its window is hidden.')}
        ${tg('demoHiccup', 'Demo: simulate one sign-in problem', 'Shows how the "Needs you" step works during the demo.')}
        <div class="grid3" style="margin-top:8px">
          ${num('concurrency', 'Members at once', 'Default 4', 1, 8)}
          ${num('responseTimeoutMin', 'Answer timeout (min)', 'Per message', 2, 60)}
          ${num('retries', 'Automatic retries', 'Before asking you', 0, 5)}
        </div>
      </section>
      <section class="card">
        <h2>Privacy &amp; data</h2>
        <ul style="margin:0;padding-left:18px;line-height:1.7">
          <li>Everything is stored on this PC in <span class="kbd">${esc(i.userData)}</span>.</li>
          <li>Sign-ins live in separate browser profiles per model${i.encryption ? ', encrypted with Windows DPAPI' : ''}. Councilwise never sees or stores passwords.</li>
          <li>API keys are encrypted the same way. Nothing is sent anywhere except to the models you choose.</li>
          <li>No analytics, no telemetry, no account.</li>
          <li>For confidential documents, turn off training in each model's privacy settings.</li>
        </ul>
      </section>
      <section class="card">
        <h2>About</h2>
        <p><b>Councilwise ${esc(i.version)}</b> · open source under the MIT licence.</p>
        <p class="muted small">Inspired by the LLM-council idea of independent answers, anonymous peer review and a chairman's synthesis, extended for documents with roles, a Council Head ruling, moderation, fact checks and transparent scoring.</p>
        <p class="muted small">Automating consumer chat websites may conflict with some providers' terms. Use Assisted mode or API keys where that matters to you.</p>
      </section>
    </div>`;
  },
  mount(root) {
    const s = App.settings;
    const save = async (patch, msg) => { App.settings = await call('settings:save', patch); if (msg) toast(msg); };
    root.querySelector('[data-act="save"]').onclick = () => {
      const patch = {};
      root.querySelectorAll('[data-txt]').forEach(el => { patch[el.dataset.txt] = el.value.trim(); });
      save(patch, 'Branding saved.');
    };
    root.querySelector('[data-act="logo"]').onclick = async () => { const r = await call('settings:chooseLogo'); if (r) { App.settings = r; go('settings'); } };
    const nl = root.querySelector('[data-act="nologo"]'); if (nl) nl.onclick = async () => { await save({ logoDataUrl: '' }); go('settings'); };
    root.querySelectorAll('#deffmt button').forEach(b => b.onclick = async () => { await save({ defaultFormat: b.dataset.v }, 'Default format saved.'); go('settings'); });
    root.querySelectorAll('[data-tg]').forEach(el => el.onchange = () => save({ [el.dataset.tg]: el.checked }, 'Saved.'));
    root.querySelectorAll('[data-num]').forEach(el => el.onchange = () => {
      const v = Math.max(+el.min, Math.min(+el.max, parseInt(el.value, 10) || s[el.dataset.num]));
      el.value = v; save({ [el.dataset.num]: v }, 'Saved.');
    });
  }
};
