'use strict';
const test = require('node:test');
const assert = require('node:assert');
const parse = require('../../src/main/council/parse');
const tpl = { dimensions: [{ id: 'clarity', name: 'Clarity' }, { id: 'risks', name: 'Risks' }] };

test('extracts the last fenced JSON block', () => {
  const t = 'prose\n```json\n{"a":1}\n```\nmore\n```json\n{"a":2}\n```';
  assert.deepStrictEqual(parse.extractJson(t), { a: 2 });
});

test('repairs smart quotes and trailing commas', () => {
  const t = 'Here:\n```json\n{“verdict”: “go”, "findings": [1,2,],}\n```';
  assert.deepStrictEqual(parse.extractJson(t), { verdict: 'go', findings: [1, 2] });
});

test('finds unfenced JSON at the end', () => {
  const t = 'Overall fine. {"verdict":"revise","note":"has } brace"}';
  assert.strictEqual(parse.extractJson(t).verdict, 'revise');
});

test('returns null when there is no JSON', () => {
  assert.strictEqual(parse.extractJson('no json here'), null);
});

test('normalises a review and fills missing dimensions', () => {
  const r = parse.normalizeReview({ verdict: 'Go with conditions', confidence: 'Med', scores: [{ dimension: 'Clarity', rating: 'Pass' }], findings: [{ title: 'x', severity: 'High' }] }, tpl);
  assert.strictEqual(r.verdict, 'go_with_conditions');
  assert.strictEqual(r.confidence, 'medium');
  assert.strictEqual(r.scores.length, 2);
  assert.strictEqual(r.scores[0].rating, 'pass');
  assert.strictEqual(r.scores[1].rating, 'unproven');
  assert.strictEqual(r.findings[0].id, 'F1');
});

test('enum mapping covers common wording', () => {
  assert.strictEqual(parse.enumOf('No-Go', ['go', 'go_with_conditions', 'revise', 'no_go'], 'x'), 'no_go');
  assert.strictEqual(parse.enumOf('at risk', ['pass', 'weak', 'at_risk', 'unproven'], 'x'), 'at_risk');
});

test('peer refs are validated', () => {
  const p = parse.normalizePeer({ disputes: [{ ref: 'b.f2', reason: 'r' }, { ref: 'nonsense' }], unsupported: ['C.F1', 'bad'] });
  assert.deepStrictEqual(p.disputes.map(d => d.ref), ['B.F2']);
  assert.deepStrictEqual(p.unsupported, ['C.F1']);
});
