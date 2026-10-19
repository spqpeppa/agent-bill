import { existsSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { collect } from '../collect.ts';
import { walk } from '../files.ts';
import { loadPrices, pricesDate } from '../pricing.ts';
import { sources } from '../sources/index.ts';
import { addTokens, emptyTokens, totalTokens, type Call, type Tokens } from '../types.ts';

const HELP = `usage: agent-bill scan [--by day|model|repo|branch|agent] [--since YYYY-MM-DD] [--until YYYY-MM-DD] [--json]

Reads Claude Code and Codex logs on this machine and shows your usage. Nothing leaves the machine.
Dates are local; --until is exclusive. Cost is an estimate at API list price.`;

const keyOf: Record<string, (c: Call) => string> = {
  day: (c) => c.date,
  model: (c) => c.model,
  repo: (c) => c.repo,
  branch: (c) => `${c.repo} @ ${c.branch ?? '-'}`,
  agent: (c) => c.agent,
};

interface Group { key: string; calls: number; tokens: Tokens; costUsd: number; unpricedCalls: number }

export async function scan(args: string[]): Promise<number> {
  const { values } = parseArgs({
    args,
    options: {
      by: { type: 'string', default: 'day' },
      since: { type: 'string' },
      until: { type: 'string' },
      json: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });
  if (values.help) {
    console.log(HELP);
    return 0;
  }
  const by = values.by!;
  if (!keyOf[by]) {
    console.error(`agent-bill scan: --by must be one of ${Object.keys(keyOf).join(', ')}`);
    return 64;
  }

  const prices = loadPrices();
  const result = await collect({ prices, since: values.since, until: values.until });

  const groups = new Map<string, Group>();
  const total: Group = { key: 'Total', calls: 0, tokens: emptyTokens(), costUsd: 0, unpricedCalls: 0 };
  for (const c of result.calls) {
    const key = keyOf[by](c);
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { key, calls: 0, tokens: emptyTokens(), costUsd: 0, unpricedCalls: 0 }));
    for (const x of [g, total]) {
      x.calls++;
      addTokens(x.tokens, c.tokens);
      if (c.costUsd == null) x.unpricedCalls++;
      else x.costUsd += c.costUsd;
    }
  }
  const list = [...groups.values()].sort((a, b) => (by === 'day' ? a.key.localeCompare(b.key) : b.costUsd - a.costUsd));

  if (values.json) {
    console.log(JSON.stringify({
      by, groups: list, total,
      duplicates: result.duplicates, unpricedModels: result.unpricedModels, prices: pricesDate(prices),
    }, null, 1));
    return 0;
  }

  const head = [by, 'calls', 'input', 'output', 'cache read', 'cache write', 'total', 'cache hit', 'cost (USD)'];
  const line = (g: Group) => [
    g.key,
    String(g.calls),
    fmt(g.tokens.input),
    fmt(g.tokens.output),
    fmt(g.tokens.cacheRead),
    fmt(g.tokens.cacheWrite5m + g.tokens.cacheWrite1h),
    fmt(totalTokens(g.tokens)),
    hitRate(g.tokens),
    `$${g.costUsd.toFixed(2)}${g.unpricedCalls ? '*' : ''}`,
  ];
  const table = [head, ...list.map(line), line(total)];
  const widths = head.map((_, i) => Math.max(...table.map((r) => r[i].length)));
  const render = (r: string[]) => r.map((c, i) => (i === 0 ? c.padEnd(widths[i]) : c.padStart(widths[i]))).join('  ');
  const rule = widths.map((w) => '─'.repeat(w)).join('  ');
  console.log([render(head), rule, ...list.map((g) => render(line(g))), rule, render(line(total))].join('\n'));

  console.log(`\n${total.calls} API calls (${result.duplicates} duplicate log lines dropped). Cost is an estimate at API list price (prices of ${pricesDate(prices)}).`);
  if (result.unpricedModels.length) console.log(`* no price for: ${result.unpricedModels.join(', ')}`);
  console.log('\nLogs read:');
  for (const s of sources) {
    for (const root of s.roots()) {
      const files = existsSync(root) ? [...walk(root, (n) => n.endsWith('.jsonl'))].length : 0;
      console.log(`  ${s.agent.padEnd(12)} ${existsSync(root) ? `${files} files`.padEnd(10) : 'not found '}  ${root}`);
    }
  }
  return 0;
}

function fmt(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(n);
}

// Share of prompt tokens served from cache.
function hitRate(t: Tokens): string {
  const prompt = t.input + t.cacheRead + t.cacheWrite5m + t.cacheWrite1h;
  return prompt ? `${Math.round((t.cacheRead / prompt) * 100)}%` : '-';
}
