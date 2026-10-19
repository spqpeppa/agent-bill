import assert from 'node:assert/strict';
import { test } from 'node:test';
import { splitByPerson } from '../src/commands/share.ts';
import { addMirasim, type Handles } from '../src/handles.ts';
import { loadStarters } from '../src/mirasim.ts';
import { emptyTokens, type Call } from '../src/types.ts';

const home = new URL('./fixtures/mirasim', import.meta.url).pathname;
const iso = (ms: number) => new Date(ms).toISOString();
const call = (agent: string, sessionId: string, ms: number): Call => ({
  agent, sessionId, ts: iso(ms), date: '2026-10-19', model: 'm', repo: 'r', sidechain: false,
  tokens: emptyTokens(), costUsd: 0,
});

test('a call belongs to whoever started the turn it ran in', () => {
  const s = loadStarters(home)!;
  assert.equal(s.at('claude-code', 'cc-shared', iso(1792400030000)), 'ann@example.com');
  assert.equal(s.at('claude-code', 'cc-shared', iso(1792400130000)), 'Bob@Example.com');
  // Codex logs carry their own session id; record.json maps it to the Mirasim session.
  assert.equal(s.at('codex', 'rollout-native-id', iso(1792400030000)), 'cat@example.com');
  assert.equal(s.at('claude-code', 'never-seen', iso(1792400030000)), undefined);
});

test('no Mirasim: everything is the person running share', () => {
  assert.equal(loadStarters('/nonexistent'), undefined);
  const { byHandle, leftOut } = splitByPerson([call('claude-code', 'x', 0)], 'me', undefined, { schema: 1, people: {} });
  assert.deepEqual([...byHandle.keys()], ['me']);
  assert.equal(leftOut.size, 0);
});

test('Mirasim: split by person, only people in handles.json, unrecorded sessions to the runner', () => {
  const handles: Handles = { schema: 1, people: {} };
  addMirasim(handles, 'ann', 'ann@example.com');
  addMirasim(handles, 'bob', 'bob@example.com');  // matched case-insensitively
  assert.equal(addMirasim(handles, 'bob', 'BOB@example.com'), false);

  const calls = [
    call('claude-code', 'cc-shared', 1792400030000),   // ann's turn
    call('claude-code', 'cc-shared', 1792400130000),   // bob's turn
    call('codex', 'rollout-native-id', 1792400030000), // cat: not in handles.json
    call('claude-code', 'started-by-an-agent', 1792400030000),
  ];
  const { byHandle, leftOut } = splitByPerson(calls, 'ann', loadStarters(home), handles);
  assert.deepEqual(Object.fromEntries([...byHandle].map(([h, list]) => [h, list.length])), { ann: 2, bob: 1 });
  assert.deepEqual([...leftOut], [['cat@example.com', 1]]);
});
