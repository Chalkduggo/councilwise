'use strict';
// Builds a format-neutral document (a list of blocks) for each report type.
// The same blocks are rendered to PDF (via HTML), Word, plain text and Markdown.

const V = { go: 'Go', go_with_conditions: 'Go with conditions', revise: 'Revise', no_go: 'No-go' };
const R = { pass: 'Pass', weak: 'Weak', at_risk: 'At risk', unproven: 'Unproven' };
const cap = s => (s ? s[0].toUpperCase() + s.slice(1) : '');
const dur = ms => { const s = Math.round((ms || 0) / 1000); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return h ? `${h}h ${m}m` : `${m}m ${String(x).padStart(2, '0')}s`; };

function nameOf(session, letter) {
  const m = session.members.find(x => x.letter === letter);
  return m ? m.name : letter;
}
function refsToNames(session, refs) {
  return (refs || []).map(r => { const [l] = r.split('.'); return `${nameOf(session, l)} ${r.split('.')[1] || ''}`.trim(); }).join(', ');
}

function header(session, title) {
  const r = session.result;
  return [
    { t: 'cover', title, docName: session.file.name, sessionTitle: session.title, date: new Date(r.builtAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }), demo: r.demo },
    { t: 'verdict', verdict: V[r.verdict], verdictId: r.verdict, score: r.confidence.score, label: r.confidence.label, stated: cap(r.statedConfidence), headline: r.final.headline }
  ];
}

function confidenceBlock(r) {
  const p = r.confidence.parts, w = r.confidence.weights;
  const row = (name, key, what) => [name, p[key] == null ? 'n/a' : p[key] + '%', Math.round(w[key] * 100) + '%', what];
  return [
    { t: 'h2', text: 'How the confidence score is built' },
    { t: 'p', text: `Confidence score ${r.confidence.score}/100 (${r.confidence.label}). It is calculated by the app from the council's own data, not given by any one model. The moderator separately rated confidence as ${cap(r.statedConfidence)}.` },
    { t: 'table', head: ['Part', 'Result', 'Weight', 'What it measures'], widths: [18, 12, 10, 60], rows: [
      row('Agreement', 'agreement', 'Members whose final verdict matches the council verdict (one step away counts half).'),
      row('Evidence', 'evidence', 'Findings that cite the document and were not flagged as unsupported by two or more peers.'),
      row('Facts', 'facts', 'Checked facts that were verified (n/a when no fact check ran).'),
      row('Resolution', 'resolution', 'Peer-review disputes the Council Head explicitly ruled on.')
    ] }
  ];
}

function membersBlock(session) {
  const r = session.result;
  const tag = m => [m.isHead && 'Head', m.isModerator && 'Moderator', m.isFactChecker && 'Fact-checker'].filter(Boolean).join(', ');
  return [
    { t: 'h2', text: 'The council' },
    { t: 'p', text: `During the council the members saw each other only as Reviewer A, B, C… so they judged evidence, not names. ${r.mostUseful ? `Peers ranked ${r.members.find(m => m.id === r.mostUseful).name} the most useful reviewer.` : ''}` },
    { t: 'table', head: ['Member', 'As', 'Role', 'Plan', 'First verdict', 'Final verdict', 'Findings', 'Peer rank'], widths: [17, 6, 17, 10, 15, 15, 9, 11],
      rows: r.members.map(m => [m.name + (tag(m) ? ` (${tag(m)})` : ''), m.letter, m.roleName, m.plan || '—',
        m.participated ? `${V[m.verdict]} · ${m.confidence}` : cap(m.status), m.participated ? `${V[m.finalVerdict]} · ${m.finalConfidence}` : '—',
        String(m.findings || 0), m.peerRank != null ? String(m.peerRank) : '—']) },
    { t: 'tally', items: Object.entries(r.tally).map(([k, n]) => ({ label: V[k], n, id: k })) }
  ];
}

function scorecardBlock(session) {
  const r = session.result;
  const ms = r.members.filter(m => m.participated);
  return [
    { t: 'h2', text: 'Scorecard' },
    { t: 'p', text: 'Council rating is the majority view; ties go to the more cautious rating. Rows marked "split" had three or more different ratings, so treat them as open questions.' },
    { t: 'grid', head: ['Dimension', 'Council', ...ms.map(m => m.monogram)], rows: r.scorecard.map(d => [d.name + (d.split ? ' (split)' : ''), d.rating, ...ms.map(m => d.byMember[m.id] || 'unproven')]) }
  ];
}

function findingsBlock(session, limit) {
  const f = session.result.final.key_findings.slice(0, limit || 99);
  if (!f.length) return [];
  return [
    { t: 'h2', text: 'Key findings' },
    ...f.flatMap((x, i) => [
      { t: 'finding', n: i + 1, title: x.title, severity: x.severity, detail: x.detail, recommendation: x.recommendation, raisedBy: refsToNames(session, x.refs) }
    ])
  ];
}

function changesBlock(session, onlyP1) {
  const c = session.result.final.changes.filter(x => !onlyP1 || x.priority === 'P1');
  if (!c.length) return [];
  return [
    { t: 'h2', text: onlyP1 ? 'Must-do changes (P1)' : 'Change list' },
    { t: 'table', head: ['#', 'Priority', 'Where', 'Change', 'Why'], widths: [5, 9, 18, 40, 28], rows: c.map((x, i) => [String(i + 1), x.priority, x.where || '—', x.change, x.reason || '']) }
  ];
}

function listBlock(title, items) { return items && items.length ? [{ t: 'h2', text: title }, { t: 'list', items }] : []; }

function factsBlock(session) {
  const f = session.result.facts;
  if (!f.length) return [];
  const fc = session.result.members.find(m => m.isFactChecker);
  return [
    { t: 'h2', text: 'Fact check' },
    { t: 'p', text: `${fc ? fc.name : 'The fact-checker'} checked ${f.length} claims against live sources. Wrong or outdated facts are corrected in the change list where they matter.` },
    { t: 'table', head: ['#', 'Claim', 'Result', 'Correct value', 'Source'], widths: [6, 38, 12, 22, 22], rows: f.map(x => [x.id, x.claim, cap(x.status), x.correct_value || '—', x.source || '—']) }
  ];
}

function rulingBlock(session) {
  const r = session.result.ruling;
  const head = session.result.members.find(m => m.isHead);
  return [
    { t: 'h2', text: `Council Head ruling${head ? ' · ' + head.name : ''}` },
    { t: 'p', text: r.summary || '' },
    ...(r.rulings.length ? [{ t: 'table', head: ['Issue', 'Decision', 'Ruling', 'Raised by'], widths: [26, 12, 40, 22], rows: r.rulings.map(x => [x.issue, cap(x.decision), x.ruling + (x.rationale ? ` — ${x.rationale}` : ''), refsToNames(session, x.refs)]) }] : [])
  ];
}

function moderationBlock(session) {
  const c = session.result.final.contradictions_fixed;
  const mod = session.result.members.find(m => m.isModerator);
  if (!c.length) return [];
  return [
    { t: 'h2', text: `Moderator corrections${mod ? ' · ' + mod.name : ''}` },
    { t: 'p', text: 'Places where the moderator found the ruling contradicted the evidence or the fact check, and what was changed.' },
    { t: 'table', head: ['Issue', 'Fix'], widths: [45, 55], rows: c.map(x => [x.issue, x.fix]) }
  ];
}

function minorityBlock(session) {
  const m = session.result.final.minority_report.length ? session.result.final.minority_report : session.result.ruling.minority;
  if (!m || !m.length) return [];
  return [
    { t: 'h2', text: 'Minority report' },
    { t: 'p', text: 'Credible positions the council did not adopt. They are kept so the dissent is not averaged away.' },
    { t: 'list', items: m.map(x => `${x.position}${x.held_by && x.held_by.length ? ` — held by ${x.held_by.map(l => nameOf(session, l)).join(', ')}` : ''}`) }
  ];
}

function statsBlock(session) {
  const s = session.result.stats;
  return [
    { t: 'h2', text: 'Council statistics' },
    { t: 'stats', items: [
      ['Members answered', `${s.membersAnswered} of ${s.membersTotal}`], ['Findings', String(s.findings)], ['Disputes', String(s.disputes)],
      ['Rulings', String(s.rulings)], ['Changes', String(s.changes)], ['Facts checked', `${s.factsChecked}${s.factsWrong ? ` (${s.factsWrong} wrong/outdated)` : ''}`],
      ['Moderator fixes', String(s.contradictionsFixed)], ['Messages', String(s.messages)], ['Words read', s.words.toLocaleString('en-US')], ['Run time', dur(s.durationMs)]
    ] }
  ];
}

function methodBlock(session) {
  return [
    { t: 'h2', text: 'Method' },
    { t: 'list', items: [
      `Template: ${session.templateName}. Brief: ${session.config.brief || 'none given'}.`,
      'Round 1 — every member reviewed the document independently, with its own role.',
      session.config.options.peerReview ? 'Round 2 — members reviewed each other\'s findings anonymously, ranked them and flagged unsupported claims.' : 'Round 2 — peer review was turned off.',
      session.config.options.factCheck ? 'Fact check — time-sensitive claims were checked with live search.' : 'Fact check — turned off.',
      'Round 3 — the Council Head ruled on every disputed issue.',
      'Round 4 — the moderator checked the ruling against the evidence, fixed contradictions and wrote the final content.',
      `Mode: ${session.config.mode === 'assisted' ? 'Assisted (the user pressed Send for each message)' : 'Automatic'}.`
    ] },
    ...confidenceBlock(session.result)
  ];
}

function build(session, kind) {
  const r = session.result;
  const f = r.final;
  if (kind === 'summary') {
    return [
      ...header(session, 'Executive summary'),
      { t: 'h2', text: 'Summary' }, { t: 'p', text: f.executive_summary },
      ...listBlock('Conditions', f.conditions.length ? f.conditions : r.ruling.conditions),
      ...findingsBlock(session, 5),
      ...changesBlock(session, true),
      ...membersBlock(session).slice(-1),
      ...statsBlock(session)
    ];
  }
  if (kind === 'changes') {
    return [
      ...header(session, 'Change list'),
      ...listBlock('Conditions to meet', f.conditions.length ? f.conditions : r.ruling.conditions),
      ...changesBlock(session, false),
      ...factsBlock(session).length ? factsBlock(session) : []
    ];
  }
  if (kind === 'raw') {
    const blocks = [{ t: 'cover', title: 'Raw answers', docName: session.file.name, sessionTitle: session.title, date: new Date().toLocaleDateString('en-GB'), demo: r.demo }];
    for (const [key, st] of Object.entries(session.steps)) {
      if (!st.response) continue;
      const [stage, id] = key.split(':');
      const m = session.members.find(x => x.id === id);
      const names = { r1: 'Round 1 · Independent review', r2: 'Round 2 · Peer review', fc: 'Fact check', head: 'Round 3 · Council Head ruling', mod: 'Round 4 · Moderation' };
      blocks.push({ t: 'h2', text: `${names[stage] || stage} — ${m ? m.name : id}` });
      blocks.push({ t: 'pre', text: st.response });
    }
    return blocks;
  }
  // full report
  return [
    ...header(session, 'Council report'),
    { t: 'h2', text: 'Executive summary' }, { t: 'p', text: f.executive_summary },
    ...listBlock('Conditions', f.conditions.length ? f.conditions : r.ruling.conditions),
    ...membersBlock(session),
    ...scorecardBlock(session),
    ...findingsBlock(session),
    ...changesBlock(session, false),
    ...factsBlock(session),
    ...rulingBlock(session),
    ...moderationBlock(session),
    ...minorityBlock(session),
    ...listBlock('Open questions', f.open_questions),
    ...listBlock('Next steps', f.next_steps),
    ...statsBlock(session),
    ...methodBlock(session)
  ];
}

module.exports = { build, V, R, dur, cap };
