// Regenerates src/prices.json from LiteLLM's community price table, then applies
// scripts/price-overrides.json (official rates that the community table has wrong or lacks).
//
//   node scripts/update-prices.ts            # download
//   node scripts/update-prices.ts file.json  # use a local copy
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Price, PriceTable } from '../src/pricing.ts';

const URL = 'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json';
// Earlier providers win when two strip to the same model name.
const PROVIDERS = ['anthropic', 'openai', 'gemini', 'xai', 'deepseek', 'moonshot', 'dashscope', 'zai', 'mistral'];

const here = dirname(fileURLToPath(import.meta.url));
const local = process.argv[2];
const raw: Record<string, any> = local
  ? JSON.parse(readFileSync(local, 'utf8'))
  : await (await fetch(URL)).json();

const models: Record<string, Price> = {};
const ranked = Object.entries(raw)
  .filter(([, v]) => v?.mode === 'chat' && PROVIDERS.includes(v.litellm_provider) && v.input_cost_per_token != null)
  .sort(([, a], [, b]) => PROVIDERS.indexOf(a.litellm_provider) - PROVIDERS.indexOf(b.litellm_provider));

for (const [key, v] of ranked) {
  const name = key.replace(/^[a-z_]+\//, '');
  if (models[name]) continue;
  const price: Price = {
    in: v.input_cost_per_token,
    out: v.output_cost_per_token ?? 0,
    cacheRead: v.cache_read_input_token_cost ?? v.input_cost_per_token,
    cacheWrite: v.cache_creation_input_token_cost ?? v.input_cost_per_token,
    cacheWrite1h: v.cache_creation_input_token_cost_above_1hr ?? v.cache_creation_input_token_cost ?? v.input_cost_per_token,
  };
  const tierKey = Object.keys(v).find((k) => /^input_cost_per_token_above_\d+k_tokens$/.test(k));
  if (tierKey) {
    const k = tierKey.match(/above_(\d+)k/)![1];
    const above = (field: string) => v[`${field}_above_${k}k_tokens`];
    price.tier = {
      above: Number(k) * 1000,
      in: v[tierKey],
      out: above('output_cost_per_token') ?? price.out,
      cacheRead: above('cache_read_input_token_cost') ?? price.cacheRead,
      cacheWrite: above('cache_creation_input_token_cost') ?? price.cacheWrite,
      cacheWrite1h: v[`cache_creation_input_token_cost_above_1hr_above_${k}k_tokens`] ?? price.cacheWrite1h,
    };
  }
  models[name] = price;
}

// Overrides are written per million tokens so they can be checked against pricing pages by eye.
const overrides = JSON.parse(readFileSync(join(here, 'price-overrides.json'), 'utf8'));
for (const [name, o] of Object.entries<any>(overrides.models)) {
  const m = (models[name] ??= { in: 0, out: 0, cacheRead: 0, cacheWrite: 0, cacheWrite1h: 0 });
  for (const field of ['in', 'out', 'cacheRead', 'cacheWrite', 'cacheWrite1h'] as const) {
    if (o[field] != null) m[field] = Number((o[field] / 1e6).toPrecision(6));
  }
  if (o.fast != null) m.fast = o.fast;
}

const table: PriceTable = {
  source: `LiteLLM model_prices_and_context_window.json + price-overrides.json (${overrides.asOf})`,
  generatedAt: new Date().toISOString(),
  models: Object.fromEntries(Object.entries(models).sort(([a], [b]) => a.localeCompare(b))),
};
writeFileSync(join(here, '..', 'src', 'prices.json'), JSON.stringify(table, null, 1) + '\n');
console.log(`prices.json: ${Object.keys(models).length} models`);
