import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parseArgs } from 'node:util';
import { localDate } from '../collect.ts';
import { demoData } from '../demo.ts';
import { loadPrices } from '../pricing.ts';
import { render } from './share.ts';

const HELP = `usage: agent-bill demo [--out DIR] [--end YYYY-MM-DD] [--days N]

Writes a made-up team's usage (four people, four repos) in the same layout as the data branch,
plus prs.json with their merged pull requests. Use it for screenshots and demos, so nobody's
real spend is ever shown.

  --out DIR   where to write; default ./agent-bill-demo
  --end DATE  last day of the data; default today
  --days N    how many days; default 14`;

export async function demo(args: string[]): Promise<number> {
  const { values } = parseArgs({
    args,
    options: {
      out: { type: 'string', default: 'agent-bill-demo' },
      end: { type: 'string', default: localDate(new Date()) },
      days: { type: 'string', default: '14' },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });
  if (values.help) {
    console.log(HELP);
    return 0;
  }
  const days = Number(values.days);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(values.end!) || !Number.isInteger(days) || days < 1) {
    console.error('agent-bill demo: --end must be YYYY-MM-DD and --days a positive whole number');
    return 64;
  }

  const data = demoData(loadPrices(), values.end!, days);
  const put = (path: string, body: string) => {
    mkdirSync(dirname(join(values.out!, path)), { recursive: true });
    writeFileSync(join(values.out!, path), body);
  };
  for (const { path, file } of data.files) put(path, render(file));
  put('handles.json', JSON.stringify(data.handles, null, 2) + '\n');
  put('prs.json', JSON.stringify(data.prs, null, 2) + '\n');
  const total = data.files.reduce((s, f) => s + f.file.rows.reduce((t, r) => t + r.costUsd, 0), 0);
  console.log(`Wrote ${data.files.length} usage files for 4 made-up people (${days} days to ${values.end}, $${total.toFixed(2)} in all) and prs.json to ${values.out}.`);
  return 0;
}
