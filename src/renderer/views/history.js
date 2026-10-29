'use strict';
/* global App, esc, go, call, statusChip, SESSION_STATUS, VERDICT, fmtDate, toast */

App.views.history = {
  list: [],
  async load() { this.list = await call('session:list'); },
  render() {
    return `<div class="ph"><div><div class="eyebrow">Sessions &amp; reports</div><h1>Every council you have run</h1><p>Open a report, resume a stopped council, or delete old sessions. Everything is stored on this PC only.</p></div>
      <button class="btn primary" data-goto="new">New council</button></div>
    <section class="card">${this.list.length ? `<table class="t"><thead><tr><th>Session</th><th>Template</th><th>Members</th><th>Status</th><th>Verdict</th><th>Score</th><th></th></tr></thead><tbody>
      ${this.list.map(s => `<tr>
        <td><b>${esc(s.title)}</b><div class="small muted">${esc(s.fileName)} · ${esc(fmtDate(s.createdAt))}</div></td>
        <td class="small">${esc((App.templates.find(t => t.id === s.templateId) || {}).name || s.templateId)}</td>
        <td class="mono">${s.members}</td>
        <td>${statusChip(s.status, SESSION_STATUS[s.status])}</td>
        <td>${s.verdict ? `<b>${esc(VERDICT[s.verdict])}</b>` : '—'}</td>
        <td class="mono">${s.score != null ? s.score + '/100' : '—'}</td>
        <td><div class="row" style="justify-content:flex-end">
          ${s.status === 'completed' ? `<button class="btn sm primary" data-report="${esc(s.id)}">Report</button>` : ''}
          ${['stopped', 'failed'].includes(s.status) ? `<button class="btn sm primary" data-resume="${esc(s.id)}">Resume</button>` : ''}
          ${s.status === 'ready' ? `<button class="btn sm primary" data-resume="${esc(s.id)}">Start</button>` : ''}
          <button class="btn sm" data-run="${esc(s.id)}">Timeline</button>
          <button class="btn sm ghost" data-del="${esc(s.id)}">Delete</button></div></td>
      </tr>`).join('')}</tbody></table>` : '<div class="empty">No sessions yet.</div>'}</section>`;
  },
  mount(root) {
    root.querySelectorAll('[data-report]').forEach(b => b.onclick = () => go('report', { id: b.dataset.report }));
    root.querySelectorAll('[data-run]').forEach(b => b.onclick = () => { App.liveId = b.dataset.run; App.live = null; go('run', { id: b.dataset.run }); });
    root.querySelectorAll('[data-resume]').forEach(b => b.onclick = async () => {
      const id = b.dataset.resume;
      App.liveId = id; App.live = null;
      await call(b.textContent === 'Start' ? 'session:start' : 'session:resume', id);
      go('run', { id });
    });
    root.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
      if (b.dataset.armed) { await call('session:delete', b.dataset.del); toast('Session deleted.'); go('history'); return; }
      b.dataset.armed = '1'; b.textContent = 'Confirm delete'; b.classList.add('red');
    });
  }
};
