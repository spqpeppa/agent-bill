import assert from 'node:assert/strict';
import { test } from 'node:test';
import { demoData } from '../src/demo.ts';
import { loadPrices } from '../src/pricing.ts';

const prices = loadPrices();

test('demo: four made-up people over the requested days, same data every time', () => {
  const a = demoData(prices, '2026-10-19');
  assert.deepEqual(a, demoData(prices, '2026-10-19'));
  assert.deepEqual(Object.keys(a.handles.people).sort(), ['ada', 'ben', 'chloe', 'dmitri']);
  const dates = new Set(a.files.map((f) => f.file.date));
  assert.equal([...dates].sort()[0], '2026-10-06');
  assert.equal([...dates].sort().at(-1), '2026-10-19');
});

test('demo: files follow the data format, and PR branches have usage', () => {
  const { files, prs } = demoData(prices, '2026-10-19');
  for (const { path, file } of files) {
    assert.equal(path, `usage/${file.handle}/${file.device}/${file.date}.json`);
    assert.equal(file.schema, 1);
    for (const r of file.rows) {
      assert.ok(r.calls > 0 && r.costUsd >= 0 && r.unpricedCalls === 0, JSON.stringify(r));
      assert.match(r.repo, /^(github\.com\/acme\/|local:)/);
    }
  }
  for (const pr of prs) {
    assert.ok(files.some((f) => f.file.rows.some((r) => r.repo === pr.repo && r.branch === pr.branch)), pr.branch);
    assert.match(pr.mergedAt, /^2026-10-\d\dT15:00:00Z$/);
  }
});
