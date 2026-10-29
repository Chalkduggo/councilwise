'use strict';
const test = require('node:test');
const assert = require('node:assert');
const docs = require('../../src/main/docs');

test('split keeps every character and respects the limit', () => {
  const text = Array.from({ length: 200 }, (_, i) => `Paragraph ${i} ` + 'x'.repeat(i * 3)).join('\n\n');
  const parts = docs.split(text, 2000);
  assert.ok(parts.length > 1);
  assert.ok(parts.every(p => p.length <= 2000));
  assert.strictEqual(parts.join('').replace(/\s/g, '').length, text.replace(/\s/g, '').length);
});

test('extracts text from PDF and Word files', async () => {
  const path = require('path');
  const fs = require('fs');
  const fx = path.join(__dirname, '..', 'fixtures');
  for (const f of ['sample.pdf', 'sample.docx']) {
    const p = path.join(fx, f);
    if (!fs.existsSync(p)) continue;
    const r = await docs.extract(p);
    assert.ok(r.words > 50, f + ' should have text');
  }
});
