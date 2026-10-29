'use strict';
/* global App, esc, go, call, badge, VERDICT, RATING, fmtDur, toast */

const KINDS = [
  ['full', 'Full council report', 'Everything: verdict, score, members, scorecard, findings, changes, fact check, ruling, minority report.'],
  ['summary', 'Executive summary', 'One or two pages for decision makers.'],
  ['changes', 'Change list', 'Prioritised edits to make, with conditions and corrected facts.'],
  ['raw', 'Raw answers', 'Every member\'s full answer, for your records.']
];
const FMT = { pdf: 'PDF', docx: 'Word', txt: 'Text', md: 'MD' };

App.views.report = {
  s: null, fmt: {},
  async load(params) {
    this.s = await call('session:get', params.id);
    const def = this.s.config.format || 'pdf';
    this.fmt = { full: def, summary: def, changes: def, raw: 'txt' };
  },
  render() {
    const s = this.s;
    if (!s || !s.result) return `<div class="ph"><div><div class="eyebrow">Report</div><h1>No result yet</h1><p>This council has not finished.</p></div><button class="btn primary" data-goto="run">Back to the live run</button></div>`;
    const r = s.result, f = r.final, c = r.confidence;
    const bad = ['revise', 'no_go'].includes(r.verdict);
    const memberById = id => r.members.find(m => m.id === id);
    const parts = [
      ['Agreement', c.parts.agreement, 'Members ending on the council verdict'],
      ['Evidence', c.parts.evidence, 'Findings backed by the document'],
      ['Facts', c.parts.facts, 'Checked facts that were verified'],
      ['Resolution', c.parts.resolution, 'Disputes the Head ruled on']
    ];
    const verdictsOrder = ['go', 'go_with_conditions', 'revise', 'no_go'];
    const answered = r.members.filter(m => m.participated);
    return `
    <div class="ph">
      <div><div class="eyebrow">Council report · ${esc(s.templateName || '')} ${r.demo ? '· <span class="demoflag">DEMO DATA</span>' : ''}</div><h1>${esc(s.title)}</h1>
        <p>${esc(s.file.name)} · finished ${esc(new Date(r.builtAt).toLocaleString())} · ${r.stats.membersAnswered} of ${r.stats.membersTotal} members answered</p></div>
      <div class="row"><button class="btn" data-act="run">Timeline</button><button class="btn" data-act="folder">Open reports folder</button></div>
    </div>

    <section class="vhero">
      <div>
        <div class="eyebrow" style="color:#A1A1AA">Final verdict</div>
        <div class="vv ${bad ? 'bad' : ''}">${esc(VERDICT[r.verdict])}</div>
        <p style="font-weight:600;color:#fff;margin-bottom:8px">${esc(f.headline)}</p>
        <p>${esc(f.executive_summary)}</p>
      </div>
      <div>${gauge(c.score, c.label)}<div class="small" style="text-align:center;color:#A1A1AA;margin-top:6px">Moderator's own rating: ${esc(cap(r.statedConfidence))}</div></div>
      <div class="parts">
        <div class="eyebrow" style="color:#A1A1AA">How the score is built</div>
        ${parts.map(([n, v, h]) => `<div class="part"><div class="row"><span><b>${n}</b> <span style="color:#A1A1AA">· ${Math.round(c.weights[n.toLowerCase()] * 100)}%</span></span><b>${v == null ? 'n/a' : v + '%'}</b></div><div class="bar"><i style="width:${v == null ? 0 : v}%"></i></div><div class="small" style="color:#A1A1AA;margin-top:3px">${h}</div></div>`).join('')}
      </div>
    </section>

    ${(f.conditions.length || r.ruling.conditions.length) ? `<section class="card" style="margin-top:16px"><h2>Conditions</h2><ol style="margin:0;padding-left:20px;line-height:1.7">${(f.conditions.length ? f.conditions : r.ruling.conditions).map(x => `<li>${esc(x)}</li>`).join('')}</ol></section>` : ''}

    <section class="card" style="margin-top:16px">
      <div class="row between"><h2 style="margin:0">Downloads</h2><span class="small muted">Saved on this PC. Pick a format, then Save as or Open.</span></div>
      <div class="grid4" style="margin-top:12px">${KINDS.map(([k, name, help]) => `<div class="dl">
        <b>${name}</b><span>${help}</span>
        <div class="seg" data-kind="${k}">${Object.entries(FMT).map(([fk, fl]) => `<button data-fmt="${fk}" class="${this.fmt[k] === fk ? 'on' : ''}">${fl}</button>`).join('')}</div>
        <div class="row"><button class="btn sm primary" data-save="${k}">Save as…</button><button class="btn sm" data-open="${k}">Open</button></div>
      </div>`).join('')}</div>
    </section>

    <div class="grid2" style="margin-top:16px">
      <section class="card">
        <h2>Verdict tally</h2>
        <div class="tally">${verdictsOrder.map(v => `<div class="${v === r.verdict ? 'win' : ''}"><b>${r.tally[v] || 0}</b><span>${VERDICT[v]}</span>
          <div class="dots">${answered.filter(m => m.finalVerdict === v).map(m => `<i title="${esc(m.name)}">${esc(m.monogram)}</i>`).join('')}</div></div>`).join('')}</div>
        <p class="small muted" style="margin:10px 0 0">Final verdicts after anonymous peer review. ${r.mostUseful ? `Peers ranked <b>${esc(memberById(r.mostUseful).name)}</b> the most useful reviewer.` : ''}</p>
      </section>
      <section class="card">
        <h2>Council statistics</h2>
        <div class="statgrid" style="grid-template-columns:repeat(3,minmax(0,1fr))">${[
          ['Members', `${r.stats.membersAnswered}/${r.stats.membersTotal}`], ['Findings', r.stats.findings], ['Disputes', r.stats.disputes],
          ['Rulings', r.stats.rulings], ['Changes', r.stats.changes], ['Facts checked', r.stats.factsChecked + (r.stats.factsWrong ? ` · ${r.stats.factsWrong} wrong` : '')],
          ['Moderator fixes', r.stats.contradictionsFixed], ['Words read', Number(r.stats.words).toLocaleString()], ['Run time', fmtDur(r.stats.durationMs)]
        ].map(([k, v]) => `<div class="kpi"><div class="v" style="font-size:20px">${esc(v)}</div><div class="k">${k}</div></div>`).join('')}</div>
      </section>
    </div>

    <section class="card" style="margin-top:16px">
      <h2>The council</h2>
      <table class="t"><thead><tr><th>Member</th><th>As</th><th>Role</th><th>Plan</th><th>First verdict</th><th>Final verdict</th><th>Findings</th><th>Peer rank</th></tr></thead><tbody>
      ${r.members.map(m => `<tr><td><div class="row" style="flex-wrap:nowrap">${badge(m, m.isHead ? 'head' : '')}<div><b>${esc(m.name)}</b><div class="small muted">${[m.isHead && 'Council Head', m.isModerator && 'Moderator', m.isFactChecker && 'Fact-checker'].filter(Boolean).join(' · ')}</div></div></div></td>
        <td class="mono">${esc(m.letter)}</td><td>${esc(m.roleName)}</td><td>${esc(m.plan || '—')}</td>
        <td>${m.participated ? `${esc(VERDICT[m.verdict])} <span class="muted small">· ${esc(m.confidence)}</span>` : `<span class="muted">${esc(cap(m.status))}</span>`}</td>
        <td>${m.participated ? `<b>${esc(VERDICT[m.finalVerdict])}</b> <span class="muted small">· ${esc(m.finalConfidence)}</span>` : '—'}</td>
        <td class="mono">${m.findings}</td><td class="mono">${m.peerRank != null ? m.peerRank : '—'}</td></tr>`).join('')}
      </tbody></table>
    </section>

    <section class="card" style="margin-top:16px">
      <div class="row between"><h2 style="margin:0">Scorecard · disagreement map</h2>
        <div class="legendrow"><span class="chip ink">Pass</span><span class="chip">Weak</span><span class="chip redo">Unproven</span><span class="chip red">At risk</span></div></div>
      <p class="small muted">The outlined column is the council's rating (majority; ties go to the more cautious rating). Rows marked “split” had three or more different ratings.</p>
      <table class="heat"><thead><tr><th>Dimension</th><th>Council</th>${answered.map(m => `<th title="${esc(m.name)}">${esc(m.monogram)}</th>`).join('')}</tr></thead><tbody>
      ${r.scorecard.map(d => `<tr><td class="lbl">${esc(d.name)}${d.split ? ' <span class="chip" style="height:18px">split</span>' : ''}</td><td class="h-${d.rating} council">${esc(RATING[d.rating])}</td>${answered.map(m => { const v = d.byMember[m.id] || 'unproven'; return `<td class="h-${v}" title="${esc(m.name)}: ${esc(RATING[v])}">${esc(RATING[v])}</td>`; }).join('')}</tr>`).join('')}
      </tbody></table>
    </section>

    ${f.key_findings.length ? `<section class="card" style="margin-top:16px"><h2>Key findings</h2><div class="stack" style="gap:10px">${f.key_findings.map((x, i) => `
      <div class="finding ${esc(x.severity)}"><div class="t"><span class="badge" style="width:24px;height:24px;border-radius:50%;font-size:11px">${i + 1}</span>${x.severity === 'critical' ? '<span class="chip red">Critical</span>' : x.severity === 'major' ? '<span class="chip ink">Major</span>' : '<span class="chip">Minor</span>'}${esc(x.title)}</div>
      <p>${esc(x.detail)}</p>${x.recommendation ? `<p><b>Recommendation:</b> ${esc(x.recommendation)}</p>` : ''}
      ${x.refs.length ? `<div class="by">Raised by ${esc(refNames(s, x.refs))}</div>` : ''}</div>`).join('')}</div></section>` : ''}

    ${f.changes.length ? `<section class="card" style="margin-top:16px"><h2>Change list</h2><table class="t"><thead><tr><th>#</th><th>Priority</th><th>Where</th><th>Change</th><th>Why</th></tr></thead><tbody>
      ${f.changes.map((x, i) => `<tr><td class="mono">${i + 1}</td><td>${x.priority === 'P1' ? '<span class="chip red">P1</span>' : x.priority === 'P2' ? '<span class="chip ink">P2</span>' : '<span class="chip">P3</span>'}</td><td>${esc(x.where)}</td><td>${esc(x.change)}</td><td class="small muted">${esc(x.reason)}</td></tr>`).join('')}
      </tbody></table></section>` : ''}

    ${r.facts.length ? `<section class="card" style="margin-top:16px"><h2>Fact check</h2><table class="t"><thead><tr><th>#</th><th>Claim</th><th>Result</th><th>Correct value</th><th>Source</th></tr></thead><tbody>
      ${r.facts.map(x => `<tr><td class="mono">${esc(x.id)}</td><td>${esc(x.claim)}</td><td>${x.status === 'verified' ? '<span class="chip ink">Verified</span>' : x.status === 'unverifiable' ? '<span class="chip">Unverifiable</span>' : `<span class="chip red">${esc(cap(x.status))}</span>`}</td><td>${esc(x.correct_value || '—')}</td><td class="small" style="word-break:break-all">${x.source ? esc(x.source) : '—'}</td></tr>`).join('')}
      </tbody></table></section>` : ''}

    <div class="grid2" style="margin-top:16px">
      <section class="card"><h2>Council Head ruling</h2><p>${esc(r.ruling.summary)}</p>
        ${r.ruling.rulings.length ? `<table class="t"><thead><tr><th>Issue</th><th>Decision</th></tr></thead><tbody>${r.ruling.rulings.slice(0, 20).map(x => `<tr><td><b>${esc(x.issue)}</b><div class="small muted">${esc(x.ruling)}</div></td><td>${x.decision === 'upheld' ? '<span class="chip ink">Upheld</span>' : x.decision === 'rejected' ? '<span class="chip">Rejected</span>' : '<span class="chip redo">Modified</span>'}</td></tr>`).join('')}</tbody></table>` : ''}</section>
      <section class="card"><h2>Moderator corrections &amp; minority report</h2>
        ${f.contradictions_fixed.length ? f.contradictions_fixed.map(x => `<div class="note" style="margin-bottom:8px"><span><b>${esc(x.issue)}</b><br>${esc(x.fix)}</span></div>`).join('') : '<p class="muted">The moderator found no contradictions to fix.</p>'}
        ${(f.minority_report.length ? f.minority_report : r.ruling.minority).map(x => `<div class="warn" style="margin-top:8px"><span><b>Minority view:</b> ${esc(x.position)}${x.held_by && x.held_by.length ? ` — ${esc(x.held_by.map(l => letterName(s, l)).join(', '))}` : ''}</span></div>`).join('')}
        ${f.next_steps.length ? `<h3 style="margin-top:14px">Next steps</h3><ul style="margin:0;padding-left:18px">${f.next_steps.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
      </section>
    </div>`;
  },
  mount(root) {
    const s = this.s;
    if (!s || !s.result) return;
    root.querySelector('[data-act="run"]').onclick = () => go('run', { id: s.id });
    root.querySelector('[data-act="folder"]').onclick = async () => { const p = await this.export('full'); call('report:show', p); };
    root.querySelectorAll('.seg[data-kind] button').forEach(b => b.onclick = () => {
      const k = b.closest('.seg').dataset.kind; this.fmt[k] = b.dataset.fmt;
      b.closest('.seg').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
    });
    root.querySelectorAll('[data-save]').forEach(b => b.onclick = async () => {
      const p = await this.export(b.dataset.save);
      const saved = await call('report:saveAs', p);
      if (saved) toast('Saved: ' + saved);
    });
    root.querySelectorAll('[data-open]').forEach(b => b.onclick = async () => { const p = await this.export(b.dataset.open); call('report:open', p); });
  },
  async export(kind) {
    toast('Preparing ' + KINDS.find(k => k[0] === kind)[1] + '…');
    return call('report:export', this.s.id, kind, this.fmt[kind]);
  }
};

function cap(s) { return s ? s[0].toUpperCase() + s.slice(1).replace(/_/g, ' ') : ''; }
function letterName(s, l) { const m = s.members.find(x => x.letter === l); return m ? m.name : l; }
function refNames(s, refs) { return refs.map(r => { const [l, f] = r.split('.'); return `${letterName(s, l)} ${f || ''}`.trim(); }).join(', '); }

function gauge(score, label) {
  const r = 92, c = 2 * Math.PI * r, v = Math.max(0, Math.min(100, score));
  return `<div class="gauge"><svg width="220" height="220" viewBox="0 0 220 220" aria-hidden="true">
    <circle cx="110" cy="110" r="${r}" fill="none" stroke="#27272A" stroke-width="16"/>
    <circle cx="110" cy="110" r="${r}" fill="none" stroke="#EF233C" stroke-width="16" stroke-linecap="round" stroke-dasharray="${(c * v / 100).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 110 110)"/></svg>
    <div class="num"><b>${v}</b><span>Confidence score · ${esc(label)}</span></div></div>`;
}
