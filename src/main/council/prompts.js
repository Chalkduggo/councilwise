'use strict';
// Prompt builders for every round of the council.
// Each prompt asks for readable prose AND a final JSON block, so the app can
// compare members precisely while still keeping the full human-readable answer.

const VERDICTS = ['go', 'go_with_conditions', 'revise', 'no_go'];
const CONF = ['high', 'medium', 'low'];
const RATINGS = ['pass', 'weak', 'at_risk', 'unproven'];

const HEADER = 'COUNCILWISE';

function today() { return new Date().toISOString().slice(0, 10); }

function docPart(i, n, text) {
  return `${HEADER} · DOCUMENT PART ${i} OF ${n}
You will receive a document in ${n} parts. Do not review it yet.
Reply with only: RECEIVED ${i}/${n}

<<<PART ${i}
${text}
PART ${i}>>>`;
}

function messagePart(i, n, text) {
  return `${HEADER} · LONG MESSAGE PART ${i} OF ${n}
The next instruction is long, so it arrives in ${n} parts. Do not answer yet.
Reply with only: RECEIVED ${i}/${n}

<<<PART ${i}
${text}
PART ${i}>>>`;
}

function afterParts(n) {
  return `All ${n} parts have arrived. Join them in order and treat them as one message. Now follow the instructions it contains.`;
}

function round1({ template, role, brief, fileName, docMode, docText, partCount }) {
  const dims = template.dimensions.map(d => d.id).join(', ');
  let docRef;
  if (docMode === 'inline') docRef = `The document "${fileName}" is included below between <<<DOCUMENT and DOCUMENT>>>.`;
  else if (docMode === 'parts') docRef = `The document "${fileName}" was sent to you in the previous ${partCount} messages (parts 1 to ${partCount}). Treat the parts as one document.`;
  else docRef = `The document "${fileName}" is attached to this message.`;

  const example = {
    verdict: 'go_with_conditions',
    confidence: 'medium',
    summary: 'Two or three sentences with your overall view.',
    strengths: ['...'],
    scores: template.dimensions.slice(0, 2).map(d => ({ dimension: d.id, rating: 'weak', note: 'one line why' })),
    findings: [{ id: 'F1', title: 'Short title', severity: 'critical', detail: 'What is wrong and why it matters.', evidence: 'Section 4.2: "quote"', recommendation: 'What to change.' }],
    facts_to_check: [{ claim: 'A time-sensitive fact stated in the document', where: 'Section 3' }],
    changes: [{ where: 'Section 4.2', change: 'Exact change to make' }],
    questions: ['...']
  };

  return `${HEADER} · ROUND 1 · INDEPENDENT REVIEW
You are one member of a review council of several AI models. Other models are reviewing the same document separately and will later check your work, so be candid, specific and evidence-based. Do not flatter the author.

Your role on this council: ${role.name}. ${role.brief}
Review type: ${template.name}.
What the author wants from this review: ${brief || 'A rigorous, honest review with clear recommended changes.'}
Today's date: ${today()}.

${docRef}

Rules
1. Every finding must point to evidence in the document: a section, heading, page or a short quote. If the document is silent, write "not in document".
2. Put anything time-sensitive or checkable (prices, dates, laws, product versions, market figures, current events) in facts_to_check instead of assuming it is right.
3. Rate every scorecard dimension as pass, weak, at_risk or unproven. Dimensions: ${dims}.
4. Severity is critical, major or minor. Give at most 12 findings, most important first.
5. Verdict is one of: go, go_with_conditions, revise, no_go. Confidence is high, medium or low.

Write your review under these headings: ${template.sections.join(' · ')}.
Then finish with ONE fenced JSON block in exactly this shape (valid JSON, double quotes, no comments, include every dimension):
\`\`\`json
${JSON.stringify(example, null, 1)}
\`\`\`${docMode === 'inline' ? `

<<<DOCUMENT
${docText}
DOCUMENT>>>` : ''}`;
}

function compactReviews(reviews, { maxDetail = 360 } = {}) {
  // reviews: [{ letter, parsed }]
  return reviews.map(({ letter, parsed }) => {
    const lines = [`REVIEWER ${letter} · verdict ${parsed.verdict} · confidence ${parsed.confidence}`,
      `Summary: ${parsed.summary}`];
    for (const f of parsed.findings) {
      lines.push(`${letter}.${f.id} [${f.severity}] ${f.title} — ${trim(f.detail, maxDetail)} (evidence: ${trim(f.evidence, 160)}) → ${trim(f.recommendation, 200)}`);
    }
    const weak = parsed.scores.filter(s => s.rating !== 'pass').map(s => `${s.dimension}=${s.rating}`);
    if (weak.length) lines.push(`Scorecard concerns: ${weak.join(', ')}`);
    return lines.join('\n');
  }).join('\n\n');
}

function trim(s, n) { s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; }

function round2({ others }) {
  return `${HEADER} · ROUND 2 · ANONYMOUS PEER REVIEW
Below are the reviews of the other council members, anonymised as Reviewer A, B, C and so on (order shuffled). Your own review is not included. Judge them on evidence only.

1. Rank the reviewers from most to least useful.
2. For each finding you disagree with, give the reason. Refer to findings as "B.F2".
3. List findings that make claims without real evidence from the document.
4. Name anything important that everyone missed.
5. After reading the others, give your updated verdict and confidence (you may keep your original ones).

${compactReviews(others)}

Finish with ONE fenced JSON block in exactly this shape:
\`\`\`json
{"rankings":[{"reviewer":"A","rank":1,"reason":"..."}],"agreements":["A.F1"],"disputes":[{"ref":"B.F2","reason":"..."}],"unsupported":["C.F1"],"missed":["..."],"verdict_after_reading":"go_with_conditions","confidence_after_reading":"medium"}
\`\`\``;
}

function factCheck({ claims }) {
  const list = claims.map(c => `${c.id}. ${c.claim}${c.where ? ` (document: ${c.where})` : ''}`).join('\n');
  return `${HEADER} · FACT CHECK
You are the council's fact-checker. Today's date is ${today()}. Use live web search. For each claim below, decide whether it is verified, wrong, outdated or unverifiable, give the correct current value when it is wrong or outdated, and cite a source URL.

${list}

Finish with ONE fenced JSON block in exactly this shape:
\`\`\`json
{"checks":[{"id":"K1","status":"verified","correct_value":"","source":"https://..."}]}
\`\`\``;
}

function headRuling({ reviews, peer, facts, template, brief }) {
  const tally = reviews.map(r => `${r.letter}: ${r.final.verdict} (${r.final.confidence})`).join(' · ');
  const disputes = peer.disputes.slice(0, 60).map(d => `${d.ref} disputed by ${d.by}: ${trim(d.reason, 220)}`).join('\n') || 'none';
  const unsupported = peer.unsupported.length ? peer.unsupported.map(u => `${u.ref} (flagged by ${u.count})`).join(', ') : 'none';
  const missed = peer.missed.slice(0, 15).map(m => `- ${trim(m, 220)}`).join('\n') || 'none';
  const fc = facts.length ? facts.map(f => `${f.id} ${f.status.toUpperCase()}: ${trim(f.claim, 160)}${f.correct_value ? ` → ${f.correct_value}` : ''}${f.source ? ` [${f.source}]` : ''}`).join('\n') : 'No fact check was run.';
  return `${HEADER} · ROUND 3 · COUNCIL HEAD RULING
You are the Council Head. The council reviewed a document (${template.name}). The author asked for: ${brief || 'a rigorous review'}.
Below are every reviewer's findings (anonymised), the peer-review disputes, and the fact check. Your job is to rule, not to re-review.

1. Group overlapping findings into issues. For each issue decide: upheld, rejected or modified, with a short rationale. Cite the finding refs (e.g. "A.F1").
2. Where the fact check contradicts a finding or the document, the fact check wins unless you explain why.
3. Give the council's verdict and confidence, the conditions that must be met, and a minority report for credible positions you did not adopt.

Verdicts after peer review: ${tally}

FINDINGS
${compactReviews(reviews.map(r => ({ letter: r.letter, parsed: r.parsed })))}

PEER-REVIEW DISPUTES
${disputes}

FLAGGED AS UNSUPPORTED: ${unsupported}

MISSED BY EVERYONE
${missed}

FACT CHECK
${fc}

Finish with ONE fenced JSON block in exactly this shape:
\`\`\`json
{"verdict":"go_with_conditions","confidence":"medium","summary":"...","rulings":[{"issue":"...","refs":["A.F1","C.F3"],"decision":"upheld","ruling":"...","rationale":"..."}],"conditions":["..."],"minority":[{"position":"...","held_by":["B"]}],"priorities":["..."]}
\`\`\``;
}

function moderation({ ruling, reviews, facts, template }) {
  const fc = facts.length ? facts.map(f => `${f.id} ${f.status}: ${trim(f.claim, 140)}${f.correct_value ? ` → ${f.correct_value}` : ''}`).join('\n') : 'none';
  return `${HEADER} · ROUND 4 · MODERATION AND FINAL REPORT
You are the moderator. Check the Council Head's ruling against the findings and the fact check, fix anything that contradicts the evidence, and write the final report content. Be precise and practical. Mark each fix you make in contradictions_fixed.

COUNCIL HEAD RULING
${JSON.stringify(ruling, null, 1)}

FINDINGS (anonymised)
${compactReviews(reviews.map(r => ({ letter: r.letter, parsed: r.parsed })), { maxDetail: 240 })}

FACT CHECK
${fc}

Scorecard dimensions: ${template.dimensions.map(d => d.id).join(', ')}.

Finish with ONE fenced JSON block in exactly this shape:
\`\`\`json
{"final_verdict":"go_with_conditions","final_confidence":"medium","headline":"One line the author will remember.","executive_summary":"Three to six sentences.","key_findings":[{"title":"...","severity":"critical","detail":"...","recommendation":"...","refs":["A.F1"]}],"changes":[{"priority":"P1","where":"Section 4.2","change":"...","reason":"..."}],"contradictions_fixed":[{"issue":"...","fix":"..."}],"conditions":["..."],"minority_report":[{"position":"...","held_by":["B"]}],"open_questions":["..."],"next_steps":["..."]}
\`\`\``;
}

function repair(kind) {
  return `${HEADER} · FORMAT FIX
Your last answer did not end with a valid JSON block in the required shape for ${kind}. Reply with ONLY that JSON block now, in a \`\`\`json fence, with no other text.`;
}

module.exports = {
  VERDICTS, CONF, RATINGS, docPart, messagePart, afterParts,
  round1, round2, factCheck, headRuling, moderation, repair, compactReviews, trim
};
