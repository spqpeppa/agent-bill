import { localDate, toRows } from './collect.ts';
import { cost, pricesDate, type PriceTable } from './pricing.ts';
import type { Call, Tokens, UsageFile } from './types.ts';
import { COLLECTOR } from './version.ts';
import type { PullRequest } from './prs.ts';

// A made-up team for screenshots and the online demo: four people, four repos, two weeks.
// Nothing here comes from anyone's logs. Seeded, so the same end date gives the same data.

interface Habit {
  agent: string;
  model: string;
  share: number;             // fraction of the person's calls
}

interface Person {
  handle: string;
  devices: string[];
  callsPerDay: number;       // on a working day
  weekendFactor: number;
  habits: Habit[];
  work: { repo: string; branches: string[] }[];
  subagents: number;         // fraction of Claude calls made by sub-agents
  runaway?: number;          // days before the end: one unusually expensive day
}

const TEAM: Person[] = [
  {
    handle: 'ada', devices: ['d-a11ce001', 'd-a11ce002'], callsPerDay: 260, weekendFactor: 0.15,
    habits: [{ agent: 'claude-code', model: 'claude-opus-5-5', share: 0.8 }, { agent: 'claude-code', model: 'claude-haiku-5-5', share: 0.2 }],
    work: [
      { repo: 'github.com/acme/shop-api', branches: ['feat/cart-v2', 'fix/tax-rounding', 'main'] },
      { repo: 'github.com/acme/infra', branches: ['chore/pg-17'] },
    ],
    subagents: 0.2,
  },
  {
    handle: 'ben', devices: ['d-b0b0b0b0'], callsPerDay: 180, weekendFactor: 0,
    habits: [{ agent: 'codex', model: 'gpt-5.6', share: 0.7 }, { agent: 'codex', model: 'gpt-6.1-sol', share: 0.3 }],
    work: [{ repo: 'github.com/acme/shop-web', branches: ['feat/checkout-redesign', 'fix/safari-layout', 'main'] }],
    subagents: 0,
  },
  {
    handle: 'chloe', devices: ['d-c4c4c4c4'], callsPerDay: 220, weekendFactor: 0.3,
    habits: [
      { agent: 'claude-code', model: 'claude-sonnet-5-5', share: 0.6 },
      { agent: 'claude-code', model: 'claude-opus-5-5', share: 0.15 },
      { agent: 'codex', model: 'gpt-5.6', share: 0.25 },
    ],
    work: [
      { repo: 'github.com/acme/infra', branches: ['feat/otel-collector', 'chore/pg-17'] },
      { repo: 'github.com/acme/shop-api', branches: ['feat/cart-v2'] },
    ],
    subagents: 0.45,
  },
  {
    handle: 'dmitri', devices: ['d-d1d1d1d1'], callsPerDay: 70, weekendFactor: 0,
    habits: [{ agent: 'claude-code', model: 'claude-opus-5-5', share: 1 }],
    work: [
      { repo: 'github.com/acme/shop-web', branches: ['spike/ai-search'] },
      { repo: 'local:scratch', branches: [] },
    ],
    subagents: 0.1,
    runaway: 3,
  },
];

const PRS: (Omit<PullRequest, 'mergedAt'> & { mergedDaysAgo: number })[] = [
  { repo: 'github.com/acme/shop-api', number: 412, title: 'Cart v2: saved carts and guest merge', branch: 'feat/cart-v2', mergedDaysAgo: 2, url: 'https://github.com/acme/shop-api/pull/412' },
  { repo: 'github.com/acme/shop-api', number: 405, title: 'Round tax per line, not per order', branch: 'fix/tax-rounding', mergedDaysAgo: 9, url: 'https://github.com/acme/shop-api/pull/405' },
  { repo: 'github.com/acme/shop-web', number: 977, title: 'Checkout redesign', branch: 'feat/checkout-redesign', mergedDaysAgo: 1, url: 'https://github.com/acme/shop-web/pull/977' },
  { repo: 'github.com/acme/shop-web', number: 969, title: 'Fix sticky footer on Safari', branch: 'fix/safari-layout', mergedDaysAgo: 6, url: 'https://github.com/acme/shop-web/pull/969' },
  { repo: 'github.com/acme/infra', number: 88, title: 'Upgrade to Postgres 17', branch: 'chore/pg-17', mergedDaysAgo: 4, url: 'https://github.com/acme/infra/pull/88' },
];

export interface DemoData {
  files: { path: string; file: UsageFile }[];
  handles: { schema: 1; people: Record<string, Record<string, never>> };
  prs: PullRequest[];
}

export function demoData(prices: PriceTable, end: string, days = 14, seed = 42): DemoData {
  const rand = mulberry32(seed);
  const files: { path: string; file: UsageFile }[] = [];

  for (const p of TEAM) {
    for (let back = days - 1; back >= 0; back--) {
      const date = shift(end, -back);
      const weekend = [0, 6].includes(new Date(`${date}T12:00:00`).getDay());
      let n = Math.round(p.callsPerDay * (weekend ? p.weekendFactor : 1) * (0.6 + rand() * 0.8));
      if (p.runaway === back) n *= 9;
      if (!n) continue;

      const byDevice = new Map<string, Call[]>();
      for (let i = 0; i < n; i++) {
        const habit = pick(rand, p.habits.map((h) => [h, h.share] as const));
        const work = p.work[Math.floor(rand() * p.work.length)];
        const branch = work.branches.length ? work.branches[Math.floor(rand() * work.branches.length)] : undefined;
        const tokens = callTokens(rand, habit);
        const device = p.devices[rand() < 0.75 ? 0 : p.devices.length - 1];
        const list = byDevice.get(device) ?? [];
        list.push({
          agent: habit.agent, sessionId: '', ts: `${date}T12:00:00Z`, date, model: habit.model,
          repo: work.repo, branch, sidechain: habit.agent === 'claude-code' && rand() < p.subagents,
          tokens, costUsd: cost(prices, habit.model, tokens),
        });
        byDevice.set(device, list);
      }
      for (const [device, calls] of byDevice) {
        files.push({
          path: `usage/${p.handle}/${device}/${date}.json`,
          file: { schema: 1, handle: p.handle, device, date, collector: COLLECTOR, prices: pricesDate(prices), rows: toRows(calls) },
        });
      }
    }
  }

  return {
    files,
    handles: { schema: 1, people: Object.fromEntries(TEAM.map((p) => [p.handle, {}])) },
    prs: PRS.map(({ mergedDaysAgo, ...pr }) => ({ ...pr, mergedAt: `${shift(end, -mergedDaysAgo)}T15:00:00Z` })),
  };
}

// Shapes like real agent calls: a large, mostly cached prompt and a short answer.
function callTokens(rand: () => number, h: Habit): Tokens {
  const prompt = Math.round(20_000 + rand() * 120_000);
  const cached = h.agent === 'codex' ? 0.85 : 0.92;
  const cacheRead = Math.round(prompt * cached * (0.8 + rand() * 0.2));
  const write = h.agent === 'codex' ? 0 : Math.round((prompt - cacheRead) * 0.85);
  const output = Math.round(150 + rand() * rand() * 4000);
  return {
    input: prompt - cacheRead - write,
    output,
    cacheRead,
    cacheWrite5m: write,
    cacheWrite1h: 0,
    reasoning: h.agent === 'codex' ? Math.round(output * 0.3) : 0,
  };
}

function pick<T>(rand: () => number, weighted: readonly (readonly [T, number])[]): T {
  let r = rand() * weighted.reduce((a, [, w]) => a + w, 0);
  for (const [v, w] of weighted) if ((r -= w) <= 0) return v;
  return weighted.at(-1)![0];
}

function shift(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + days);
  return localDate(d);
}

function mulberry32(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
