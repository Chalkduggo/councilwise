'use strict';
const test = require('node:test');
const assert = require('node:assert');
const score = require('../../src/main/council/score');

test('agreement gives half credit to neighbouring verdicts', () => {
  assert.strictEqual(score.agreement(['go_with_conditions', 'go', 'no_go'], 'go_with_conditions'), (1 + 0.5 + 0) / 3);
});

test('score skips facts when none were checked and labels it', () => {
  const r = score.compute({ memberVerdicts: ['go', 'go'], finalVerdict: 'go', findingsByLetter: { A: [{ id: 'F1', evidence: 'Sec 1' }] }, unsupportedCounts: {}, checks: [], disputedRefs: [], rulings: [] });
  assert.strictEqual(r.parts.facts, null);
  assert.strictEqual(r.score, 100);
  assert.strictEqual(r.label, 'High');
});

test('unsupported findings lower the evidence score', () => {
  const e = score.evidence({ A: [{ id: 'F1', evidence: 'Sec 1' }, { id: 'F2', evidence: 'not in document' }] }, { 'A.F1': 2 });
  assert.strictEqual(e, 0);
});

test('resolution counts disputes the head ruled on', () => {
  assert.strictEqual(score.resolution(['A.F1', 'B.F2'], [{ refs: ['A.F1'] }]), 0.5);
});

test('scorecard majority with cautious tie-break', () => {
  const tpl = { dimensions: [{ id: 'x', name: 'X' }] };
  const reviews = [
    { memberId: 'a', parsed: { scores: [{ dimension: 'x', rating: 'pass' }] } },
    { memberId: 'b', parsed: { scores: [{ dimension: 'x', rating: 'at_risk' }] } }
  ];
  assert.strictEqual(score.scorecard(tpl, reviews)[0].rating, 'at_risk');
});
