import { existsSync } from 'node:fs';
import { cost, type PriceTable } from './pricing.ts';
import { normalizeRemote, repoOf } from './repo.ts';
import { sources as allSources } from './sources/index.ts';
import { addTokens, emptyTokens, type Call, type Row, type Source, type UsageEvent } from './types.ts';

export interface CollectOptions {
  prices: PriceTable;
  since?: string;            // local YYYY-MM-DD, inclusive
  until?: string;            // local YYYY-MM-DD, exclusive
  sources?: Source[];
  roots?: Record<string, string[]>;  // agent → roots, overrides Source.roots() (tests)
}

export interface CollectResult {
  calls: Call[];
  duplicates: number;
  unpricedModels: string[];
}

export async function collect(opts: CollectOptions): Promise<CollectResult> {
  const events = new Map<string, UsageEvent>();
  let seen = 0;

  for (const source of opts.sources ?? allSources) {
    for (const root of opts.roots?.[source.agent] ?? source.roots()) {
      if (!existsSync(root)) continue;
      for await (const e of source.read(root)) {
        const at = new Date(e.ts);
        if (Number.isNaN(at.getTime())) continue;
        const date = localDate(at);
        if (opts.since && date < opts.since) continue;
        if (opts.until && date >= opts.until) continue;
        seen++;
        const key = `${e.agent}:${e.key}`;
        const prev = events.get(key);
        if (!prev || e.tokens.output > prev.tokens.output) events.set(key, e);
      }
    }
  }

  const unpriced = new Set<string>();
  const calls: Call[] = [];
  for (const e of events.values()) {
    const usd = cost(opts.prices, e.model, e.tokens, e.speed);
    if (usd == null) unpriced.add(e.model);
    calls.push({
      agent: e.agent,
      client: e.client,
      sessionId: e.sessionId,
      ts: e.ts,
      date: localDate(new Date(e.ts)),
      model: baseModel(e.model),
      repo: e.remote ? normalizeRemote(e.remote) : repoOf(e.cwd),
      branch: e.gitBranch,
      sidechain: !!e.sidechain,
      tokens: e.tokens,
      costUsd: usd,
    });
  }
  calls.sort((a, b) => a.date.localeCompare(b.date));
  return { calls, duplicates: seen - events.size, unpricedModels: [...unpriced].sort() };
}

// Folds calls into shared rows: one per agent × model × repo × branch.
export function toRows(calls: Iterable<Call>): Row[] {
  const rows = new Map<string, Row>();
  for (const c of calls) {
    const id = [c.agent, c.model, c.repo, c.branch ?? ''].join('\u0000');
    let row = rows.get(id);
    if (!row) {
      row = {
        agent: c.agent, model: c.model, repo: c.repo, branch: c.branch,
        calls: 0, subagentCalls: 0, tokens: emptyTokens(), costUsd: 0, unpricedCalls: 0,
      };
      rows.set(id, row);
    }
    row.calls++;
    if (c.sidechain) row.subagentCalls++;
    addTokens(row.tokens, c.tokens);
    if (c.costUsd == null) row.unpricedCalls++;
    else row.costUsd += c.costUsd;
  }
  for (const row of rows.values()) row.costUsd = Math.round(row.costUsd * 1e4) / 1e4;
  return [...rows.values()].sort((a, b) => b.costUsd - a.costUsd);
}

// 'claude-opus-5-5[1m]' → 'claude-opus-5-5': the context-size suffix is a setting, not a model.
export const baseModel = (model: string) => model.replace(/\[[^\]]*\]$/, '');

export function localDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
