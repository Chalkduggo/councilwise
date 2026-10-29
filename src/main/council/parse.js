'use strict';
// Robust extraction of the JSON block at the end of a model's answer, and
// normalisation into the shapes the app relies on. Models format JSON in many
// slightly-wrong ways; we repair the common ones before giving up.

const { VERDICTS, CONF, RATINGS } = require('./prompts');

function candidates(text) {
  const out = [];
  const fence = /```(?:json|JSON)?\s*([\s\S]*?)```/g;
  let m;
  while ((m = fence.exec(text))) out.push(m[1]);
  // Last balanced {...} in the text (models sometimes drop the fence, or the
  // chat UI strips it when copying the code block).
  const end = text.lastIndexOf('}');
  if (end > 0) {
    let depth = 0, inStr = false, esc = false;
    for (let i = end; i >= 0; i--) {
      const c = text[i];
      if (inStr) { if (c === '"' && text[i - 1] !== '\\') inStr = false; continue; }
      if (c === '"') { inStr = true; continue; }
      if (c === '}') depth++;
      else if (c === '{') { depth--; if (depth === 0) { out.push(text.slice(i, end + 1)); break; } }
      void esc;
    }
  }
  return out.reverse(); // prefer the last block
}

function repairJson(s) {
  return s
    .replace(/^﻿/, '')
    .replace(/[“”„‟″]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\/\/[^\n"]*$/gm, '')
    .replace(/,\s*([}\]])/g, '$1')
    .replace(/^\s*json\s*/i, '')
    .trim();
}

function extractJson(text) {
  if (!text) return null;
  for (const c of candidates(String(text))) {
    for (const attempt of [c, repairJson(c)]) {
      try {
        const v = JSON.parse(attempt);
        if (v && typeof v === 'object') return v;
      } catch { /* try next */ }
    }
  }
  return null;
}

const str = (v, n = 4000) => (v == null ? '' : String(v)).slice(0, n);
const arr = v => (Array.isArray(v) ? v : v ? [v] : []);
function enumOf(v, allowed, fallback) {
  const s = String(v || '').toLowerCase().trim().replace(/[\s-]+/g, '_');
  if (allowed.includes(s)) return s;
  if (s.includes('no_go') || s === 'nogo' || s === 'reject') return allowed.includes('no_go') ? 'no_go' : fallback;
  if (s.includes('condition')) return allowed.includes('go_with_conditions') ? 'go_with_conditions' : fallback;
  if (s.includes('revis') || s.includes('rework')) return allowed.includes('revise') ? 'revise' : fallback;
  if (s.startsWith('risk') || s.includes('at_risk') || s === 'fail' || s === 'red') return allowed.includes('at_risk') ? 'at_risk' : fallback;
  if (s.startsWith('weak') || s === 'amber' || s === 'partial') return allowed.includes('weak') ? 'weak' : fallback;
  if (s.startsWith('pass') || s === 'green' || s === 'strong') return allowed.includes('pass') ? 'pass' : fallback;
  if (s.startsWith('unprov') || s === 'unknown' || s === 'n/a') return allowed.includes('unproven') ? 'unproven' : fallback;
  if (s.startsWith('hi')) return allowed.includes('high') ? 'high' : fallback;
  if (s.startsWith('med')) return allowed.includes('medium') ? 'medium' : fallback;
  if (s.startsWith('lo')) return allowed.includes('low') ? 'low' : fallback;
  return fallback;
}
const SEV = ['critical', 'major', 'minor'];

function normalizeReview(raw, template) {
  if (!raw || typeof raw !== 'object') return null;
  const dimIds = template.dimensions.map(d => d.id);
  const scoresIn = arr(raw.scores || raw.scorecard);
  const scores = dimIds.map(id => {
    const found = scoresIn.find(s => s && (String(s.dimension || s.id || '').toLowerCase() === id.toLowerCase()));
    return found
      ? { dimension: id, rating: enumOf(found.rating || found.score, RATINGS, 'unproven'), note: str(found.note || found.reason, 300) }
      : { dimension: id, rating: 'unproven', note: 'Not rated' };
  });
  const findings = arr(raw.findings).filter(f => f && typeof f === 'object').slice(0, 15).map((f, i) => ({
    id: /^F\d+$/i.test(String(f.id || '')) ? String(f.id).toUpperCase() : `F${i + 1}`,
    title: str(f.title || f.issue || 'Finding', 200),
    severity: enumOf(f.severity, SEV, 'major'),
    detail: str(f.detail || f.description, 1200),
    evidence: str(f.evidence || 'not stated', 400),
    recommendation: str(f.recommendation || f.fix, 600)
  }));
  return {
    verdict: enumOf(raw.verdict, VERDICTS, 'revise'),
    confidence: enumOf(raw.confidence, CONF, 'medium'),
    summary: str(raw.summary, 1500),
    strengths: arr(raw.strengths).map(s => str(s, 300)).slice(0, 10),
    scores,
    findings,
    facts_to_check: arr(raw.facts_to_check).filter(Boolean).slice(0, 15).map(f => typeof f === 'string'
      ? { claim: str(f, 300), where: '' } : { claim: str(f.claim, 300), where: str(f.where, 120) }).filter(f => f.claim),
    changes: arr(raw.changes).filter(Boolean).slice(0, 20).map(c => typeof c === 'string'
      ? { where: '', change: str(c, 500) } : { where: str(c.where, 160), change: str(c.change, 500) }),
    questions: arr(raw.questions).map(q => str(q, 300)).slice(0, 10)
  };
}

const REF = /^[A-Z]\.F\d+$/;
function normRef(r) { const s = String(r || '').trim().toUpperCase().replace(/\s+/g, ''); return REF.test(s) ? s : null; }

function normalizePeer(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return {
    rankings: arr(raw.rankings).filter(Boolean).map(r => ({ reviewer: str(r.reviewer, 2).toUpperCase(), rank: Number(r.rank) || 0, reason: str(r.reason, 300) })),
    agreements: arr(raw.agreements).map(normRef).filter(Boolean),
    disputes: arr(raw.disputes).filter(Boolean).map(d => ({ ref: normRef(d.ref), reason: str(d.reason, 500) })).filter(d => d.ref),
    unsupported: arr(raw.unsupported).map(normRef).filter(Boolean),
    missed: arr(raw.missed).map(m => str(m, 400)).filter(Boolean).slice(0, 8),
    verdict_after_reading: raw.verdict_after_reading ? enumOf(raw.verdict_after_reading, VERDICTS, null) : null,
    confidence_after_reading: raw.confidence_after_reading ? enumOf(raw.confidence_after_reading, CONF, null) : null
  };
}

const FC = ['verified', 'wrong', 'outdated', 'unverifiable'];
function normalizeFacts(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return {
    checks: arr(raw.checks).filter(Boolean).map(c => ({
      id: str(c.id, 6).toUpperCase(),
      status: (() => { const s = String(c.status || '').toLowerCase(); return FC.find(f => s.startsWith(f.slice(0, 4))) || 'unverifiable'; })(),
      correct_value: str(c.correct_value || c.correction, 300),
      source: str(c.source, 400)
    }))
  };
}

function normalizeRuling(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return {
    verdict: enumOf(raw.verdict, VERDICTS, 'revise'),
    confidence: enumOf(raw.confidence, CONF, 'medium'),
    summary: str(raw.summary, 2000),
    rulings: arr(raw.rulings).filter(Boolean).slice(0, 40).map(r => ({
      issue: str(r.issue, 300), refs: arr(r.refs).map(normRef).filter(Boolean),
      decision: (() => { const s = String(r.decision || '').toLowerCase(); return s.startsWith('rej') ? 'rejected' : s.startsWith('mod') ? 'modified' : 'upheld'; })(),
      ruling: str(r.ruling, 800), rationale: str(r.rationale, 800)
    })),
    conditions: arr(raw.conditions).map(c => str(c, 400)).slice(0, 15),
    minority: arr(raw.minority).filter(Boolean).map(m => typeof m === 'string' ? { position: str(m, 500), held_by: [] }
      : { position: str(m.position, 500), held_by: arr(m.held_by).map(h => str(h, 2).toUpperCase()) }).slice(0, 10),
    priorities: arr(raw.priorities).map(p => str(p, 300)).slice(0, 10)
  };
}

function normalizeFinal(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return {
    final_verdict: enumOf(raw.final_verdict || raw.verdict, VERDICTS, 'revise'),
    final_confidence: enumOf(raw.final_confidence || raw.confidence, CONF, 'medium'),
    headline: str(raw.headline, 300),
    executive_summary: str(raw.executive_summary || raw.summary, 3000),
    key_findings: arr(raw.key_findings).filter(Boolean).slice(0, 20).map(f => ({
      title: str(f.title, 200), severity: enumOf(f.severity, SEV, 'major'), detail: str(f.detail, 1200),
      recommendation: str(f.recommendation, 800), refs: arr(f.refs).map(normRef).filter(Boolean)
    })),
    changes: arr(raw.changes).filter(Boolean).slice(0, 40).map(c => ({
      priority: /^P[123]$/i.test(String(c.priority)) ? String(c.priority).toUpperCase() : 'P2',
      where: str(c.where, 200), change: str(c.change, 800), reason: str(c.reason, 500)
    })),
    contradictions_fixed: arr(raw.contradictions_fixed).filter(Boolean).map(c => ({ issue: str(c.issue, 400), fix: str(c.fix, 600) })).slice(0, 20),
    conditions: arr(raw.conditions).map(c => str(c, 400)).slice(0, 15),
    minority_report: arr(raw.minority_report).filter(Boolean).map(m => typeof m === 'string' ? { position: str(m, 500), held_by: [] }
      : { position: str(m.position, 500), held_by: arr(m.held_by).map(h => str(h, 2).toUpperCase()) }).slice(0, 10),
    open_questions: arr(raw.open_questions).map(q => str(q, 400)).slice(0, 12),
    next_steps: arr(raw.next_steps).map(q => str(q, 400)).slice(0, 12)
  };
}

module.exports = { extractJson, repairJson, normalizeReview, normalizePeer, normalizeFacts, normalizeRuling, normalizeFinal, enumOf };
