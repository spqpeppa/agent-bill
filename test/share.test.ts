import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { usageFiles } from '../src/commands/share.ts';
import { BRANCH, DataBranch } from '../src/datadir.ts';
import { emptyTokens, type Call } from '../src/types.ts';

const call = (date: string, extra: Partial<Call> = {}): Call => ({
  agent: 'claude-code', sessionId: 'secret-session', date, model: 'claude-opus-5-5',
  repo: 'github.com/acme/shop-api', branch: 'main', sidechain: false,
  tokens: { ...emptyTokens(), input: 10, output: 20 }, costUsd: 0.001, ...extra,
});

function bareRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'agent-bill-remote-'));
  execFileSync('git', ['init', '-q', '--bare', dir]);
  return dir;
}

// Each "person" gets their own ~/.agentbill, as on separate laptops.
function asPerson<T>(fn: () => T): T {
  const prev = process.env.AGENTBILL_HOME;
  process.env.AGENTBILL_HOME = mkdtempSync(join(tmpdir(), 'agent-bill-home-'));
  try {
    return fn();
  } finally {
    process.env.AGENTBILL_HOME = prev;
  }
}

const branchFiles = (remote: string) =>
  execFileSync('git', ['-C', remote, 'ls-tree', '-r', '--name-only', BRANCH], { encoding: 'utf8' }).trim().split('\n');

test('usage files: one per local date, rows folded, no session ids', () => {
  const files = usageFiles([call('2026-10-18'), call('2026-10-19'), call('2026-10-19', { sidechain: true })], 'peiqi', 'd-0000abcd', '2026-10-19');
  assert.deepEqual(files.map((f) => f.path), ['usage/peiqi/d-0000abcd/2026-10-18.json', 'usage/peiqi/d-0000abcd/2026-10-19.json']);
  const day = files[1].file;
  assert.equal(day.schema, 1);
  assert.equal(day.rows.length, 1);
  assert.equal(day.rows[0].calls, 2);
  assert.equal(day.rows[0].subagentCalls, 1);
  assert.ok(!JSON.stringify(files).includes('secret-session'));
});

test('data branch: created on first share, rewrites are no-ops, two people pushing at once both land', () => {
  const remote = bareRepo();
  const write = (data: DataBranch, path: string, body: string) => writeFileSync(join(data.dir, path), body);

  const a = asPerson(() => {
    const d = new DataBranch(remote);
    d.sync();
    return d;
  });
  const b = asPerson(() => {
    const d = new DataBranch(remote);
    d.sync();
    return d;
  });
  assert.deepEqual(branchFiles(remote), ['README.md']);  // created by a, fetched by b

  execFileSync('mkdir', ['-p', join(a.dir, 'usage/a'), join(b.dir, 'usage/b')]);
  write(a, 'usage/a/day.json', '{"n":1}\n');
  assert.equal(a.publish(['usage/a'], 'usage: a'), 'pushed');

  // b synced before a pushed, so b's first push is rejected and must rebase.
  write(b, 'usage/b/day.json', '{"n":2}\n');
  assert.equal(b.publish(['usage/b'], 'usage: b'), 'pushed');
  assert.deepEqual(branchFiles(remote), ['README.md', 'usage/a/day.json', 'usage/b/day.json']);

  // Same content again: nothing to push.
  a.sync();
  write(a, 'usage/a/day.json', '{"n":1}\n');
  assert.equal(a.publish(['usage/a'], 'usage: a'), 'unchanged');

  // History carries no one's git identity.
  const authors = execFileSync('git', ['-C', remote, 'log', '--format=%an <%ae>', BRANCH], { encoding: 'utf8' });
  assert.deepEqual([...new Set(authors.trim().split('\n'))], ['agent-bill <agent-bill@users.noreply.invalid>']);
  assert.equal(readFileSync(join(a.dir, 'usage/b/day.json'), 'utf8'), '{"n":2}\n');
});
