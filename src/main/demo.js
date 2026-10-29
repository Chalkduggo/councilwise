'use strict';
// Demo connection: simulated council members, so anyone can try the full app
// (and see every screen and report) without signing in to anything.
// Answers are generated locally and are clearly labelled as demo data.

const { NeedsUserError } = require('./adapters/engine');

function rng(seedStr) {
  let h = 2166136261;
  for (const c of seedStr) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 100000) / 100000; };
}
const pick = (r, list) => list[Math.floor(r() * list.length)];
const sleep = ms => new Promise(res => setTimeout(res, ms));

const POOL = [
  ['Revenue forecast outruns the sales funnel', 'The forecast needs roughly four times the customers the funnel in the go-to-market section can produce.', 'Section 6, revenue table', 'Rebuild the forecast from the funnel, or show where the extra customers come from.'],
  ['Team capacity does not cover the delivery load', 'Planned delivery hours in month 9 exceed what the stated team can deliver by about 40%.', 'Section 8, staffing plan', 'Add a hire or cut scope for the first two quarters.'],
  ['Key dates disagree between sections', 'The launch is in Q2 in the summary but Q3 in the milestone table.', 'Executive summary vs Section 9', 'Pick one date and update every section that refers to it.'],
  ['The riskiest milestone has no owner', 'The integration milestone is on the critical path but no person or team owns it.', 'Section 9, milestone 4', 'Name an owner and a fallback plan.'],
  ['Pricing assumptions are not sourced', 'Competitor prices are quoted without a date or source and may be out of date.', 'Section 5, pricing table', 'Add sources and dates, and re-check current prices.'],
  ['Compliance is mentioned but not planned', 'Data-protection obligations are listed but there is no task, owner or budget for them.', 'Section 11', 'Add a compliance workstream with an owner and budget.'],
  ['Success metrics are not measurable', 'Goals such as "strong adoption" have no number or date attached.', 'Section 3, goals', 'Turn each goal into a number with a deadline.'],
  ['Budget has no contingency', 'The budget is fully allocated with no reserve for overruns.', 'Section 7, budget', 'Hold back 10–15% as contingency.'],
  ['Relies on a third-party service nearing end of life', 'A core dependency is scheduled for retirement before the plan finishes.', 'Section 10, technology', 'Plan the migration now and budget for it.'],
  ['Summary contradicts the detailed plan', 'The summary promises a feature the detailed plan defers to phase two.', 'Executive summary vs Section 4', 'Align the summary with the detailed plan.'],
  ['Customer evidence is anecdotal', 'Demand is supported by three quotes rather than data from real buyers.', 'Section 2, market', 'Add survey or pilot data, or call it a hypothesis.'],
  ['Security review happens after launch', 'The security review is scheduled two weeks after go-live.', 'Section 9, milestone 7', 'Move the security review before launch.']
];
const FACTS = [
  ['The cloud provider\'s standard tier costs $0.12 per GB of storage', 'Section 7'],
  ['The data-protection regulation takes effect on 1 January 2027', 'Section 11'],
  ['The main competitor charges $49 per user per month', 'Section 5'],
  ['The third-party video API is supported until at least late 2027', 'Section 10'],
  ['The target market is worth $2.1 billion a year', 'Section 2']
];
const VERDICT_BY_ROLE = { skeptic: 'revise', redteam: 'revise', finance: 'go_with_conditions' };

const hiccups = new Set();

async function send(member, text, ctx) {
  const r = rng(member.id + ':' + text.slice(0, 120) + ':' + text.length);
  await sleep(ctx.fast ? 120 : 900 + r() * 2600);
  if (ctx.shouldAbort && ctx.shouldAbort()) throw new NeedsUserError('aborted', 'Stopped by user.');

  const part = text.match(/PART (\d+) OF (\d+)/);
  if (part && /Do not (review it|answer) yet/.test(text)) return `RECEIVED ${part[1]}/${part[2]}`;
  if (/All \d+ parts have arrived/.test(text)) return demoForRound(member, ctx.lastLongText || '', r, ctx);
  return demoForRound(member, text, r, ctx);
}

function demoForRound(member, text, r, ctx) {
  if (/ROUND 1 · INDEPENDENT REVIEW/.test(text)) {
    const key = ctx.sessionId + ':' + member.id;
    if (ctx.hiccup && member.id === 'grok' && !hiccups.has(key)) {
      hiccups.add(key);
      throw new NeedsUserError('login_expired', 'Demo: the session looks signed out. Press Retry to continue.');
    }
    return round1(member, text, r);
  }
  if (/ROUND 2 · ANONYMOUS PEER REVIEW/.test(text)) return round2(member, text, r);
  if (/ROUND 3 · COUNCIL HEAD RULING/.test(text)) return head(text, r);
  if (/ROUND 4 · MODERATION/.test(text)) return moderation(text, r);
  if (/^COUNCILWISE · FACT CHECK/.test(text)) return factCheck(text, r);
  if (/FORMAT FIX/.test(text)) return '```json\n{}\n```';
  return 'Demo member ready.';
}

function wrap(prose, obj) { return `${prose}\n\n\`\`\`json\n${JSON.stringify(obj, null, 1)}\n\`\`\``; }

function round1(member, text, r) {
  const dims = ((text.match(/Dimensions: ([^\n]+)\./) || [])[1] || 'clarity, accuracy').split(',').map(s => s.trim());
  const roleId = member.roleId;
  const n = 4 + Math.floor(r() * 4);
  const chosen = [...POOL].sort(() => r() - 0.5).slice(0, n);
  const findings = chosen.map((f, i) => ({
    id: `F${i + 1}`, title: f[0], severity: i === 0 ? 'critical' : pick(r, ['major', 'major', 'minor']),
    detail: f[1], evidence: r() < 0.88 ? f[2] : 'not in document', recommendation: f[3]
  }));
  const verdict = VERDICT_BY_ROLE[roleId] && r() < 0.8 ? VERDICT_BY_ROLE[roleId] : (r() < 0.82 ? 'go_with_conditions' : pick(r, ['go', 'revise']));
  const obj = {
    verdict, confidence: pick(r, ['medium', 'medium', 'high', 'low']),
    summary: `Demo review by ${member.name}. The plan is promising but the numbers and timeline need work before it is approved.`,
    strengths: ['Clear problem statement', 'Sensible phased rollout'],
    scores: dims.map(d => {
      // Members mostly agree per dimension (shared seed), with some individual variation.
      const base = pick(rng('dim:' + d), ['pass', 'pass', 'weak', 'weak', 'at_risk', 'unproven']);
      return { dimension: d, rating: r() < 0.72 ? base : pick(r, ['pass', 'weak', 'at_risk', 'unproven']), note: 'Demo rating' };
    }),
    findings,
    facts_to_check: [...FACTS].sort(() => r() - 0.5).slice(0, 2).map(f => ({ claim: f[0], where: f[1] })),
    changes: findings.slice(0, 3).map(f => ({ where: f.evidence, change: f.recommendation })),
    questions: ['What is the fallback if the launch date slips?']
  };
  return wrap('## Overall verdict\n(Demo answer) ' + obj.summary, obj);
}

function round2(member, text, r) {
  const letters = [...text.matchAll(/^REVIEWER ([A-Z]) /gm)].map(m => m[1]);
  const refs = [...text.matchAll(/^([A-Z]\.F\d+) /gm)].map(m => m[1]);
  const shuffled = [...letters].sort(() => r() - 0.5);
  const obj = {
    rankings: shuffled.map((l, i) => ({ reviewer: l, rank: i + 1, reason: 'Demo ranking' })),
    agreements: refs.filter(() => r() < 0.3).slice(0, 5),
    disputes: refs.filter(() => r() < 0.12).slice(0, 3).map(ref => ({ ref, reason: 'The evidence cited does not support how severe this is.' })),
    unsupported: refs.filter(() => r() < 0.06).slice(0, 2),
    missed: r() < 0.5 ? ['No one checked whether the support team can handle launch-week volume.'] : [],
    verdict_after_reading: r() < 0.85 ? 'go_with_conditions' : 'revise',
    confidence_after_reading: pick(r, ['medium', 'medium', 'high'])
  };
  return wrap('(Demo peer review)', obj);
}

function factCheck(text, r) {
  const ids = [...text.matchAll(/^(K\d+)\. /gm)].map(m => m[1]);
  const obj = { checks: ids.map(id => {
    const s = pick(r, ['verified', 'verified', 'verified', 'outdated', 'wrong', 'unverifiable']);
    return { id, status: s, correct_value: s === 'verified' || s === 'unverifiable' ? '' : 'Demo corrected value', source: s === 'unverifiable' ? '' : 'https://example.com/demo-source' };
  }) };
  return wrap('(Demo fact check)', obj);
}

function head(text, r) {
  const refs = [...text.matchAll(/^([A-Z]\.F\d+) \[(\w+)\] ([^—]+)—/gm)].map(m => ({ ref: m[1], sev: m[2], title: m[3].trim() }));
  const groups = {};
  for (const f of refs) (groups[f.title] = groups[f.title] || []).push(f);
  const disputed = [...text.matchAll(/^([A-Z]\.F\d+) disputed by/gm)].map(m => m[1]);
  const rulings = Object.entries(groups).map(([title, fs]) => ({
    issue: title, refs: fs.map(f => f.ref),
    decision: fs.length >= 2 ? 'upheld' : pick(r, ['upheld', 'modified', 'rejected']),
    ruling: fs.length >= 2 ? 'Raised by several members; must be fixed.' : 'Single-member finding; adjusted on review.',
    rationale: 'Demo rationale based on evidence and peer review.'
  }));
  // make sure every disputed ref is ruled on (normally true for a good Head)
  for (const d of disputed) if (!rulings.some(x => x.refs.includes(d))) rulings.push({ issue: 'Disputed finding ' + d, refs: [d], decision: 'modified', ruling: 'Severity lowered.', rationale: 'Peer review showed weak evidence.' });
  return wrap('(Demo Council Head ruling)', {
    verdict: 'go_with_conditions', confidence: 'medium',
    summary: 'The council supports going ahead once the forecast, capacity and dates are fixed.',
    rulings,
    conditions: ['Rebuild the revenue forecast from the funnel', 'Close the capacity gap before month 9', 'Make all dates consistent'],
    minority: [{ position: 'The plan should be revised before any approval.', held_by: ['B'] }],
    priorities: ['Forecast', 'Capacity', 'Dates']
  });
}

function moderation(text, r) {
  let ruling = {};
  const m = text.match(/COUNCIL HEAD RULING\n([\s\S]*?)\n\nFINDINGS/);
  try { ruling = JSON.parse(m[1]); } catch { /* ignore */ }
  const upheld = (ruling.rulings || []).filter(x => x.decision !== 'rejected');
  const info = {};
  for (const mm of text.matchAll(/^([A-Z]\.F\d+) \[(\w+)\] (.+?) — (.+?) \(evidence: (.+?)\) → (.+)$/gm)) info[mm[1]] = { title: mm[3], detail: mm[4], evidence: mm[5], rec: mm[6] };
  const pickInfo = u => (u.refs || []).map(ref => info[ref]).find(Boolean) || {};
  return wrap('(Demo moderation)', {
    final_verdict: 'go_with_conditions', final_confidence: 'medium',
    headline: 'Good plan, wrong numbers: fix the forecast and capacity before you commit money.',
    executive_summary: 'This is demo output. The council found the direction sound but the forecast, team capacity and timeline do not yet support each other. Three conditions must be met before approval. One member argued for a full revision first; that view is recorded in the minority report.',
    key_findings: upheld.slice(0, 6).map((u, i) => ({ title: u.issue, severity: i === 0 ? 'critical' : 'major', detail: (pickInfo(u).detail || u.ruling) + ' ' + u.ruling, recommendation: pickInfo(u).rec || 'See change list.', refs: u.refs })),
    changes: upheld.slice(0, 8).map((u, i) => ({ priority: i < 3 ? 'P1' : i < 6 ? 'P2' : 'P3', where: pickInfo(u).evidence || 'Document', change: pickInfo(u).rec || 'Fix: ' + u.issue, reason: u.issue })),
    contradictions_fixed: [{ issue: 'The ruling upheld a price the fact check marked outdated.', fix: 'Replaced with the current value and flagged for the author.' }],
    conditions: ruling.conditions || [],
    minority_report: ruling.minority || [],
    open_questions: ['Who owns the integration milestone?'],
    next_steps: ['Update the document', 'Run a second council on the revised version']
  });
}

module.exports = { send };
