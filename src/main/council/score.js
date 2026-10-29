'use strict';
// Transparent confidence score (0–100). Every part is shown in the report, so the
// number is never a black box.
//
//  Agreement   35%  How many members ended on the council's final verdict (neighbouring verdicts get half credit).
//  Evidence    25%  Share of findings that cite real evidence and were not flagged as unsupported by peers.
//  Facts       20%  Share of checked facts that were verified (skipped if no fact check ran).
//  Resolution  20%  Share of peer-review disputes that the Council Head explicitly ruled on.

const ORDER = ['go', 'go_with_conditions', 'revise', 'no_go'];
const RANK = { pass: 0, weak: 1, unproven: 2, at_risk: 3 };
const WEIGHTS = { agreement: 0.35, evidence: 0.25, facts: 0.20, resolution: 0.20 };

function agreement(memberVerdicts, finalVerdict) {
  if (!memberVerdicts.length) return 0;
  const fi = ORDER.indexOf(finalVerdict);
  let s = 0;
  for (const v of memberVerdicts) {
    const d = Math.abs(ORDER.indexOf(v) - fi);
    s += d === 0 ? 1 : d === 1 ? 0.5 : 0;
  }
  return s / memberVerdicts.length;
}

const NO_EVIDENCE = /^(|none|n\/a|not stated|not in document|no evidence|-)$/i;

function evidence(findingsByLetter, unsupportedCounts) {
  let total = 0, ok = 0;
  for (const [letter, findings] of Object.entries(findingsByLetter)) {
    for (const f of findings) {
      total++;
      const flagged = (unsupportedCounts[`${letter}.${f.id}`] || 0) >= 2;
      if (!NO_EVIDENCE.test(String(f.evidence || '').trim()) && !flagged) ok++;
    }
  }
  return total ? ok / total : 0;
}

function facts(checks) {
  const decided = checks.filter(c => c.status !== 'unverifiable');
  if (!decided.length) return null;
  return decided.filter(c => c.status === 'verified').length / decided.length;
}

function resolution(disputedRefs, rulings) {
  if (!disputedRefs.length) return 1;
  const ruled = new Set(rulings.flatMap(r => r.refs));
  return disputedRefs.filter(r => ruled.has(r)).length / disputedRefs.length;
}

function compute({ memberVerdicts, finalVerdict, findingsByLetter, unsupportedCounts, checks, disputedRefs, rulings }) {
  const parts = {
    agreement: agreement(memberVerdicts, finalVerdict),
    evidence: evidence(findingsByLetter, unsupportedCounts || {}),
    facts: facts(checks || []),
    resolution: resolution(disputedRefs || [], rulings || [])
  };
  let wsum = 0, total = 0;
  for (const [k, w] of Object.entries(WEIGHTS)) {
    if (parts[k] == null) continue;
    wsum += w; total += w * parts[k];
  }
  const score = Math.round((wsum ? total / wsum : 0) * 100);
  const label = score >= 75 ? 'High' : score >= 50 ? 'Medium' : 'Low';
  const pct = v => (v == null ? null : Math.round(v * 100));
  return {
    score, label,
    parts: {
      agreement: pct(parts.agreement), evidence: pct(parts.evidence),
      facts: pct(parts.facts), resolution: pct(parts.resolution)
    },
    weights: WEIGHTS
  };
}

// Council scorecard: majority rating per dimension; ties go to the more cautious rating.
function scorecard(template, reviews) {
  return template.dimensions.map(d => {
    const counts = {};
    const byMember = {};
    for (const r of reviews) {
      const s = r.parsed.scores.find(x => x.dimension === d.id);
      const rating = s ? s.rating : 'unproven';
      counts[rating] = (counts[rating] || 0) + 1;
      byMember[r.memberId] = rating;
    }
    let best = 'unproven', bestN = -1;
    for (const [rating, n] of Object.entries(counts)) {
      if (n > bestN || (n === bestN && RANK[rating] > RANK[best])) { best = rating; bestN = n; }
    }
    const spread = Object.keys(counts).length;
    return { id: d.id, name: d.name, rating: best, counts, byMember, split: spread >= 3 };
  });
}

function tally(memberVerdicts) {
  const t = { go: 0, go_with_conditions: 0, revise: 0, no_go: 0 };
  for (const v of memberVerdicts) if (t[v] != null) t[v]++;
  return t;
}

module.exports = { compute, scorecard, tally, agreement, evidence, facts, resolution, WEIGHTS };
