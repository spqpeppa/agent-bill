import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PullRequest } from '../prs.ts';
import type { Tokens, UsageFile } from '../types.ts';

// One row of the dashboard: a person's usage on a day, summed over their devices.
export interface ReportRow {
  date: string;
  handle: string;
  agent: string;
  model: string;
  repo: string;
  branch?: string;
  calls: number;
  subagentCalls: number;
  tokens: Tokens;
  costUsd: number;
  unpricedCalls: number;
}

export interface Loaded {
  rows: ReportRow[];
  prices: string[];          // price-table dates the files were priced with
  skipped: string[];         // files with a schema this version doesn't know, or unreadable
}

// Reads usage/<handle>/<device>/<date>.json under `dir` (docs/data-format.md).
export function loadUsage(dir: string): Loaded {
  const merged = new Map<string, ReportRow>();
  const prices = new Set<string>();
  const skipped: string[] = [];
  const usage = join(dir, 'usage');
  if (!existsSync(usage)) return { rows: [], prices: [], skipped };

  for (const handle of readdirSync(usage)) {
    for (const device of safeList(join(usage, handle))) {
      for (const name of safeList(join(usage, handle, device))) {
        if (!name.endsWith('.json')) continue;
        const path = `usage/${handle}/${device}/${name}`;
        let file: UsageFile;
        try {
          file = JSON.parse(readFileSync(join(dir, path), 'utf8'));
        } catch {
          skipped.push(path);
          continue;
        }
        if (file.schema !== 1 || !Array.isArray(file.rows)) {
          skipped.push(path);
          continue;
        }
        prices.add(file.prices);
        for (const r of file.rows) {
          const key = [file.date, file.handle, r.agent, r.model, r.repo, r.branch ?? ''].join('\u0000');
          const row = merged.get(key);
          if (!row) {
            merged.set(key, { date: file.date, handle: file.handle, ...r, tokens: { ...r.tokens } });
            continue;
          }
          row.calls += r.calls;
          row.subagentCalls += r.subagentCalls;
          row.costUsd += r.costUsd;
          row.unpricedCalls += r.unpricedCalls;
          for (const k of Object.keys(row.tokens) as (keyof Tokens)[]) row.tokens[k] += r.tokens[k];
        }
      }
    }
  }
  const rows = [...merged.values()].sort((a, b) => a.date.localeCompare(b.date));
  return { rows, prices: [...prices].sort(), skipped };
}

export function loadPrs(dir: string): PullRequest[] | undefined {
  const file = join(dir, 'prs.json');
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : undefined;
}

function safeList(dir: string): string[] {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}
