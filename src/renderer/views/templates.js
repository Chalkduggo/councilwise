'use strict';
/* global App, esc, call, badge */

App.views.templates = {
  render() {
    const memberName = id => (App.members.find(m => m.id === id) || { name: id }).name;
    const roleName = id => (App.roles.find(r => r.id === id) || { name: id }).name;
    return `<div class="ph"><div><div class="eyebrow">Templates &amp; roles</div><h1>What the council looks for</h1>
      <p>A template sets the scorecard and the default role of each member. Add your own by dropping a JSON file into the templates folder.</p></div>
      <button class="btn" data-act="folder">Open templates folder</button></div>
    <div class="grid2">${App.templates.map(t => `<section class="card">
      <h2>${esc(t.name)}</h2><p class="muted" style="margin-top:-6px">${esc(t.description)}</p>
      <h3>Scorecard (${t.dimensions.length})</h3>
      <div class="row" style="gap:6px">${t.dimensions.map(d => `<span class="chip">${esc(d.name)}</span>`).join('')}</div>
      <h3 style="margin-top:14px">Default roles</h3>
      <table class="t"><tbody>${Object.entries(t.defaultRoles || {}).map(([id, r]) => `<tr><td style="padding:6px 4px">${esc(memberName(id))}</td><td style="padding:6px 4px" class="muted">${esc(roleName(r))}</td></tr>`).join('')}</tbody></table>
    </section>`).join('')}</div>
    <section class="card" style="margin-top:16px">
      <h2>Role library</h2>
      <div class="grid3">${App.roles.map(r => `<div class="kpi"><b>${esc(r.name)}</b><div class="small muted" style="margin-top:4px">${esc(r.brief)}</div></div>`).join('')}</div>
    </section>`;
  },
  mount(root) { root.querySelector('[data-act="folder"]').onclick = () => call('templates:openFolder'); void badge; }
};
