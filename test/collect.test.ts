import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { baseModel, collect, toRows } from '../src/collect.ts';
import { candidates, cost, loadPrices } from '../src/pricing.ts';
import { normalizeRemote } from '../src/repo.ts';
import { claudeCode } from '../src/sources/claude-code.ts';
import { codex } from '../src/sources/codex.ts';
import { emptyTokens } from '../src/types.ts';

const prices = loadPrices();
const fixture = (p: string) => new URL(`./fixtures/${p}`, import.meta.url).pathname;
const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≠ ${b}`);
const both = {
  sources: [claudeCode, codex],
  roots: { 'claude-code': [fixture('claude/projects')], codex: [fixture('codex/sessions'), fixture('codex-v2/sessions')] },
};

test('claude code: dedups streamed lines, splits cache TTLs, prices fast mode, flags unknown models', async () => {
  const r = await collect({ prices, sources: [claudeCode], roots: { 'claude-code': [fixture('claude/projects')] } });
  assert.equal(r.calls.length, 3);        // msg_a (twice in the log), msg_b, msg_d; synthetic and the torn line dropped
  assert.equal(r.duplicates, 1);
  assert.deepEqual(r.unpricedModels, ['some-new-model']);

  const rows = toRows(r.calls);
  const opus = rows.find((x) => x.model === 'claude-opus-5-5')!;
  assert.equal(opus.agent, 'claude-code');
  assert.equal(opus.repo, 'local:demo');
  assert.equal(opus.branch, 'main');
  assert.equal(opus.calls, 2);
  assert.equal(opus.subagentCalls, 1);
  assert.deepEqual(opus.tokens, { input: 15, output: 1100, cacheRead: 1000, cacheWrite5m: 1000, cacheWrite1h: 2000, reasoning: 0 });
  // msg_a: 10×$4 + 100×$20 + 1000×$0.20 + 1000×$5 + 2000×$8 per MTok = $0.02324
  // msg_b: (5×$4 + 1000×$20) per MTok × 2 for fast = $0.04004
  close(opus.costUsd, Math.round((0.02324 + 0.04004) * 1e4) / 1e4);
  assert.equal(rows.find((x) => x.model === 'some-new-model')!.unpricedCalls, 1);
});

test('codex, older logs: per-call deltas from running totals, cached input split out, remote from session meta', async () => {
  const r = await collect({ prices, sources: [codex], roots: { codex: [fixture('codex/sessions')] } });
  assert.equal(r.calls.length, 2);        // the repeated total is not a call
  const [row] = toRows(r.calls);
  assert.equal(row.repo, 'github.com/acme/shop-api');
  assert.equal(row.branch, 'feat/cart');
  assert.equal(row.model, 'gpt-5.6');
  assert.deepEqual(row.tokens, { input: 5000, output: 1500, cacheRead: 20000, cacheWrite5m: 0, cacheWrite1h: 0, reasoning: 600 });
  // 5000×$4 + 1500×$20 + 20000×$0.40 per MTok
  close(row.costUsd, 0.058);
});

test('codex, newer logs: token_usage_record per response, token_count totals not counted again', async () => {
  const r = await collect({ prices, sources: [codex], roots: { codex: [fixture('codex-v2/sessions')] } });
  assert.equal(r.calls.length, 2);
  const [row] = toRows(r.calls);
  assert.equal(row.repo, 'github.com/acme/probe-repo');
  assert.deepEqual(row.tokens, {
    input: (13929 - 12160) + (14997 - 12160 - 1000),
    output: 368,
    cacheRead: 24320,
    cacheWrite5m: 1000,
    cacheWrite1h: 0,
    reasoning: 55,
  });
});

test('calls are grouped by local date', async () => {
  const r = await collect({ prices, ...both, since: '2026-10-19' });
  assert.ok(r.calls.length > 0);
  assert.ok(r.calls.every((c) => c.date >= '2026-10-19'));
});

test('shared rows carry no prompt text, local paths or session ids', async () => {
  const r = await collect({ prices, ...both });
  const json = JSON.stringify(toRows(r.calls));
  for (const leak of ['secret prompt', 'never read', '/nonexistent', 'cx-demo', 'cx-v2', '"s1"', 'sessionId']) {
    assert.ok(!json.includes(leak), leak);
  }
});

test('context-size suffixes are not part of the model id', () => {
  assert.equal(baseModel('claude-opus-5-5[1m]'), 'claude-opus-5-5');
  assert.equal(baseModel('gpt-5.6'), 'gpt-5.6');
});

test('model ids from other platforms resolve to the base price', () => {
  assert.ok(candidates('us.anthropic.claude-opus-4-8-v1:0').includes('claude-opus-4-8'));
  assert.ok(candidates('claude-opus-5-5[1m]').includes('claude-opus-5-5'));
  assert.ok(candidates('openai/gpt-5.5-2026-04-23').includes('gpt-5.5'));
  assert.ok(candidates('claude-haiku-4-5@20251001').includes('claude-haiku-4-5'));
});

test('long prompts use the above-threshold tier', () => {
  const t = { ...emptyTokens(), input: 150_000, output: 1000 };
  // Haiku 5.5 above 100K prompt tokens: $0.50 / $2.50 per MTok
  close(cost(prices, 'claude-haiku-5-5', t)!, 150_000 * 0.5e-6 + 1000 * 2.5e-6);
});

test('git remotes normalise to host/org/repo', () => {
  for (const url of [
    'git@github.com:Acme/Shop-API.git',
    'https://github.com/acme/shop-api',
    'ssh://git@github.com:22/acme/shop-api.git',
    'https://user:token@github.com/acme/shop-api.git/',
    'https://relay.mirasim.ai/v2/gateway/git/github.com/acme/shop-api.git',
  ]) assert.equal(normalizeRemote(url), 'github.com/acme/shop-api', url);
  assert.equal(normalizeRemote('https://git.example.com/acme/shop-api.git'), 'git.example.com/acme/shop-api');
});

test('price overrides are applied', () => {
  const o = JSON.parse(readFileSync(new URL('../scripts/price-overrides.json', import.meta.url), 'utf8'));
  close(prices.models['claude-sonnet-5-5'].cacheRead, o.models['claude-sonnet-5-5'].cacheRead / 1e6);
});
