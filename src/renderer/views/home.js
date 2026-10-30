'use strict';
/* global App, esc, go, call, badge, planChip, statusChip, VERDICT, SESSION_STATUS, fmtDate, toast, refreshMembers */

App.views.home = {
  sessions: [],
  render() {
    const ms = App.members;
    const ready = ms.filter(m => m.signedIn).length;
    const done = this.sessions.filter(s => s.status === 'completed');
    const last = done[0];
    const avg = done.length ? Math.round(done.reduce((n, s) => n + (s.score || 0), 0) / done.length) : null;
    return `
    <section class="hero">
      <div>
        <div class="eyebrow" style="color:#A1A1AA">Councilwise · LLM council for documents</div>
        <h1>Eight models.<br><b>One verdict.</b></h1>
        <p>Upload one document and a short brief. Several AI models review it independently, review each other anonymously, a Council Head rules and a moderator writes the final report — with a confidence score you can see inside. You sign in to each model's own website; no API keys needed.</p>
        <div class="row">
          <button class="btn lg red" data-act="new">Start a council</button>
          <button class="btn lg out" data-act="demo">Try the demo (no sign-in)</button>
        </div>
      </div>
      <div class="steps">
        <div><span>1</span>Independent reviews — each member gets a role</div>
        <div><span>2</span>Anonymous peer review and live fact check</div>
        <div><span>3</span>Council Head rules on every dispute</div>
        <div><span>4</span>Moderator fixes contradictions and writes the report</div>
      </div>
    </section>

    <div class="grid4" style="margin-top:16px">
      <div class="kpi"><div class="v">${ready}/${ms.length}</div><div class="k">Members ready</div></div>
      <div class="kpi"><div class="v">${this.sessions.length}</div><div class="k">Councils run</div></div>
      <div class="kpi"><div class="v">${last ? esc(VERDICT[last.verdict] || '—') : '—'}</div><div class="k">Last verdict</div></div>
      <div class="kpi"><div class="v">${avg != null ? avg : '—'}</div><div class="k">Average confidence score</div></div>
    </div>

    <div class="grid2" style="margin-top:16px">
      <section class="card">
        <div class="row between"><h2>Your council</h2><button class="btn sm" data-act="members">Manage logins</button></div>
        <div class="mstrip">
          ${ms.map(m => `<div class="mtile">${badge(m)}<div><div class="n">${esc(m.name)}</div><div class="s">${['web', 'browser'].includes(m.connection) ? (m.signedIn ? 'Signed in' : m.signedIn === false ? 'Not signed in' : 'Not checked yet') : esc(m.connection === 'api' ? 'API key' : 'Demo')}${m.plan && m.plan !== 'Unknown' ? ' · ' + esc(m.plan) : ''}</div></div></div>`).join('')}
        </div>
        <p class="muted small" style="margin:12px 0 0">Sign in once per model in <b>Members &amp; logins</b>. Councilwise remembers the session on this PC (encrypted by Windows) and never sees or stores your passwords.</p>
      </section>
      <section class="card">
        <div class="row between"><h2>Recent sessions</h2><button class="btn sm" data-act="history">See all</button></div>
        ${this.sessions.length ? `<table class="t"><tbody>${this.sessions.slice(0, 6).map(s => `
          <tr class="click" data-open="${esc(s.id)}" data-status="${esc(s.status)}">
            <td><b>${esc(s.title)}</b><div class="small muted">${esc(fmtDate(s.createdAt))}</div></td>
            <td>${statusChip(s.status, SESSION_STATUS[s.status])}</td>
            <td>${s.verdict ? esc(VERDICT[s.verdict]) : '—'}</td>
            <td class="mono">${s.score != null ? s.score + '/100' : ''}</td>
          </tr>`).join('')}</tbody></table>` : '<div class="empty">No councils yet. Start one, or try the demo.</div>'}
      </section>
    </div>`;
  },
  async load() {
    this.sessions = await call('session:list');
    await refreshMembers();
  },
  mount(root) {
    root.querySelector('[data-act="new"]').onclick = () => go('new');
    root.querySelector('[data-act="demo"]').onclick = () => startDemo();
    root.querySelector('[data-act="members"]').onclick = () => go('members');
    root.querySelector('[data-act="history"]').onclick = () => go('history');
    root.querySelectorAll('[data-open]').forEach(tr => tr.onclick = () => {
      const st = tr.dataset.status;
      go(st === 'completed' ? 'report' : 'run', { id: tr.dataset.open });
    });
  }
};

async function startDemo() {
  const samplePath = await call('sample:path');
  const ids = App.members.filter(m => !m.custom).map(m => m.id).slice(0, 8);
  const tpl = App.templates.find(t => t.id === 'business-plan') || App.templates[0];
  const cfg = {
    title: 'Demo · Brightline launch plan', brief: 'Is this launch plan ready to take to the board? What must change first?',
    templateId: tpl.id, filePath: samplePath,
    members: ids.map(id => ({ id, roleId: tpl.defaultRoles[id] })),
    headId: ids.includes('gemini') ? 'gemini' : ids[0], moderatorId: ids.includes('claude') ? 'claude' : ids[1],
    mode: 'auto', peerReview: true, factCheck: true, demo: true, format: App.settings.defaultFormat || 'pdf'
  };
  const snap = await call('session:create', cfg);
  await call('session:start', snap.id);
  App.liveId = snap.id; App.live = snap;
  toast('Demo council started with simulated members.');
  go('run', { id: snap.id });
}
