import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { renderHtml } from '../src/commands/report.ts';
import { loadUsage } from '../src/report/load.ts';
import { emptyTokens, type Row } from '../src/types.ts';

const row = (costUsd: number, extra: Partial<Row> = {}): Row => ({
  agent: 'claude-code', model: 'claude-opus-5-5', repo: 'github.com/acme/shop-api', branch: 'main',
  calls: 1, subagentCalls: 0, tokens: { ...emptyTokens(), output: 10 }, costUsd, unpricedCalls: 0, ...extra,
});

function folder(files: Record<string, unknown>): string {
  const dir = mkdtempSync(join(tmpdir(), 'agent-bill-report-'));
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), typeof body === 'string' ? body : JSON.stringify(body));
  }
  return dir;
}
const file = (handle: string, device: string, date: string, rows: Row[], schema = 1) =>
  ({ schema, handle, device, date, collector: 'agent-bill/0.1.0', prices: '2026-10-19', rows });

test('report data: one person\'s devices are summed per day; unreadable files are skipped, not fatal', () => {
  const dir = folder({
    'usage/ada/d-1/2026-10-19.json': file('ada', 'd-1', '2026-10-19', [row(1.5)]),
    'usage/ada/d-2/2026-10-19.json': file('ada', 'd-2', '2026-10-19', [row(2.25), row(1, { model: 'claude-haiku-5-5' })]),
    'usage/ben/d-3/2026-10-18.json': file('ben', 'd-3', '2026-10-18', [row(4)]),
    'usage/ben/d-3/2026-10-17.json': file('ben', 'd-3', '2026-10-17', [row(9)], 2),
    'usage/ben/d-3/broken.json': '{',
  });
  const { rows, skipped, prices } = loadUsage(dir);
  assert.deepEqual(skipped.sort(), ['usage/ben/d-3/2026-10-17.json', 'usage/ben/d-3/broken.json']);
  assert.deepEqual(prices, ['2026-10-19']);
  assert.equal(rows.length, 3);
  const opus = rows.find((r) => r.handle === 'ada' && r.model === 'claude-opus-5-5')!;
  assert.equal(opus.costUsd, 3.75);
  assert.equal(opus.calls, 2);
  assert.equal(opus.tokens.output, 20);
  assert.equal(rows[0].date, '2026-10-18');
});

test('report page: data is inlined and cannot close the script tag', () => {
  const html = renderHtml({ rows: [{ branch: '</script><script>alert(1)</script>' }] });
  assert.ok(!html.includes('/*DATA*/'));
  assert.ok(!html.includes('</script><script>alert(1)'));
  assert.ok(html.includes('\\u003c/script>'));
  assert.equal(html.match(/<\/script>/g)!.length, 2);  // only the page's own two script tags
});
