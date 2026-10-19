import { readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { localDate } from '../collect.ts';
import { loadConfig } from '../config.ts';
import { BRANCH, DataBranch } from '../datadir.ts';
import { loadPrs, loadUsage } from '../report/load.ts';
import { COLLECTOR } from '../version.ts';

const HELP = `usage: agent-bill report [--repo URL | --data DIR] [--out FILE] [--as-of YYYY-MM-DD]

Builds one HTML file, readable offline, from everyone's shared totals: the team's spend by week,
day, person, repo, agent and model; unusually expensive days; most expensive branches; and the
cost of each merged pull request.

  --repo URL   the team repo whose ${BRANCH} branch to read (default: the one share remembers)
  --data DIR   read a folder in the same layout instead (for example, agent-bill demo's output)
  --out FILE   default: agent-bill-report.html
  --as-of DATE the day the report treats as today; default: today`;

export async function report(args: string[]): Promise<number> {
  const { values } = parseArgs({
    args,
    options: {
      repo: { type: 'string' },
      data: { type: 'string' },
      out: { type: 'string', default: 'agent-bill-report.html' },
      'as-of': { type: 'string', default: localDate(new Date()) },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });
  if (values.help) {
    console.log(HELP);
    return 0;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(values['as-of']!)) {
    console.error('agent-bill report: --as-of must be YYYY-MM-DD');
    return 64;
  }

  let dir = values.data;
  // The page may be passed around, so name a folder without the path to it.
  let source = dir ? `folder ${basename(resolve(dir))}` : '';
  if (!dir) {
    const repo = values.repo ?? loadConfig().repo;
    if (!repo) {
      console.error('agent-bill report: pass --repo with your team repo, or --data with a folder');
      return 64;
    }
    try {
      const data = new DataBranch(repo);
      data.sync();
      dir = data.dir;
      source = `${repo} (${BRANCH})`;
    } catch (e: any) {
      console.error(`agent-bill report: git failed\n${e.stderr ?? e.message}`);
      return 1;
    }
  }

  const usage = loadUsage(dir);
  const prs = loadPrs(dir);
  const payload = {
    source,
    collector: COLLECTOR,
    today: values['as-of'],
    generatedAt: new Date().toISOString(),
    prices: usage.prices,
    skipped: usage.skipped,
    rows: usage.rows,
    prs: prs ?? null,
    prNote: prs ? null : 'Pull request matching is off: no prs.json in the data.',
  };
  writeFileSync(values.out!, renderHtml(payload));

  const people = new Set(usage.rows.map((r) => r.handle)).size;
  const total = usage.rows.reduce((s, r) => s + r.costUsd, 0);
  console.log(`Wrote ${values.out}: ${people} people, ${usage.rows.length} rows, $${total.toFixed(2)} estimated.`);
  if (usage.skipped.length) console.log(`Skipped ${usage.skipped.length} file(s) this version can't read: ${usage.skipped.slice(0, 3).join(', ')}${usage.skipped.length > 3 ? ', …' : ''}`);
  return 0;
}

// The page is one file: template.html with the data inlined as JSON.
export function renderHtml(payload: unknown): string {
  const template = readFileSync(new URL('../report/template.html', import.meta.url), 'utf8');
  const json = JSON.stringify(payload).replace(/</g, '\\u003c');
  return template.replace('/*DATA*/null', () => json);
}
