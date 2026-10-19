import { readFileSync } from 'node:fs';
import type { Tokens } from './types.ts';

// USD per token. `tier` applies when the request's prompt (input + cache) is above `above` tokens.
export interface Rates {
  in: number;
  out: number;
  cacheRead: number;
  cacheWrite: number;
  cacheWrite1h: number;
}
export interface Price extends Rates {
  tier?: Rates & { above: number };
  fast?: number;
}
export interface PriceTable {
  source: string;
  generatedAt: string;
  models: Record<string, Price>;
}

export function loadPrices(path = new URL('./prices.json', import.meta.url)): PriceTable {
  return JSON.parse(readFileSync(path, 'utf8'));
}

// 'us.anthropic.claude-opus-4-8-v1:0', 'claude-opus-5-5[1m]', 'openai/gpt-5.5-2026-04-23' → base id.
export function candidates(model: string): string[] {
  const out = [model];
  let m = model.toLowerCase().replace(/\[.*\]$/, '');
  out.push(m);
  m = m.replace(/^[a-z_-]+\//, '').replace(/^((us|eu|apac|global)\.)?anthropic\./, '').replace(/-v\d+(:\d+)?$/, '');
  out.push(m);
  m = m.replace(/[-@](\d{8}|\d{4}-\d{2}-\d{2})$/, '');
  out.push(m);
  return [...new Set(out)];
}

export function findPrice(table: PriceTable, model: string): Price | undefined {
  for (const c of candidates(model)) if (table.models[c]) return table.models[c];
  return undefined;
}

// null when the model is not in the table.
export function cost(table: PriceTable, model: string, t: Tokens, speed?: string): number | null {
  const p = findPrice(table, model);
  if (!p) return null;
  const prompt = t.input + t.cacheRead + t.cacheWrite5m + t.cacheWrite1h;
  const r: Rates = p.tier && prompt > p.tier.above ? p.tier : p;
  const usd =
    t.input * r.in +
    t.output * r.out +
    t.cacheRead * r.cacheRead +
    t.cacheWrite5m * r.cacheWrite +
    t.cacheWrite1h * r.cacheWrite1h;
  return speed === 'fast' && p.fast ? usd * p.fast : usd;
}

// The day the table was generated, shown in reports and written into shared files.
export const pricesDate = (table: PriceTable) => table.generatedAt.slice(0, 10);
