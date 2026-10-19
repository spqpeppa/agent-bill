import { mkdirSync, writeFileSync } from 'node:fs';
import { userInfo } from 'node:os';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { parseArgs } from 'node:util';
import { collect, localDate, toRows } from '../collect.ts';
import { HANDLE, loadConfig, saveConfig } from '../config.ts';
import { BRANCH, DataBranch } from '../datadir.ts';
import { addMirasim, handleByMirasim, loadHandles, saveHandles, type Handles } from '../handles.ts';
import { loadStarters, type Starters } from '../mirasim.ts';
import { loadPrices, pricesDate } from '../pricing.ts';
import type { Call, UsageFile } from '../types.ts';
import { COLLECTOR } from '../version.ts';

const HELP = `usage: agent-bill share [--repo URL] [--handle NAME] [--since YYYY-MM-DD] [--mirasim EMAIL] [--dry-run] [--out DIR]

Writes your daily totals to the ${BRANCH} branch of a git repo your team shares, one file per
day at usage/<handle>/<device>/<date>.json. Only totals: date, handle, agent, model, repo, branch,
call count, token counts and estimated cost. Never prompts, code, paths or session ids.

  --repo URL      the team's repo (remembered after the first run)
  --handle NAME   the name you appear under: a-z, 0-9 and -, up to 32 (remembered)
  --since DATE    first local date to write; default: 6 days ago. Older files are left alone,
                  because agents delete old logs and an old day would come back incomplete.
  --mirasim EMAIL in a Mirasim space: your Mirasim account, so the sessions you start count as yours.
                  Saved in handles.json on the data branch. Everyone's usage on a shared machine is
                  split by who started each session; people not in handles.json are left out.
  --dry-run       print exactly what would be written; never pushes
  --out DIR       write the files into DIR instead of a git repo`;

export async function share(args: string[]): Promise<number> {
  const { values } = parseArgs({
    args,
    options: {
      repo: { type: 'string' },
      handle: { type: 'string' },
      since: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
      out: { type: 'string' },
      mirasim: { type: 'string' },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });
  if (values.help) {
    console.log(HELP);
    return 0;
  }

  const config = loadConfig();
  const handle = values.handle ?? config.handle ?? (await askHandle());
  if (!handle || !HANDLE.test(handle)) {
    console.error(`agent-bill share: ${handle ? `'${handle}' is not a valid handle` : 'no handle'}; pass --handle with a-z, 0-9 and -, up to 32`);
    return 64;
  }
  const since = values.since ?? daysAgo(6);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(since)) {
    console.error('agent-bill share: --since must be YYYY-MM-DD');
    return 64;
  }
  const repo = values.repo ?? config.repo;
  const dryRun = values['dry-run'];
  if (!repo && !values.out && !dryRun) {
    console.error('agent-bill share: no repo yet; pass --repo with your team repo (or --dry-run to look first)');
    return 64;
  }

  const prices = loadPrices();
  const result = await collect({ prices, since });

  // handles.json lives on the data branch (or in --out), so fetch it before splitting by person.
  let data: DataBranch | undefined;
  let handles: Handles = { schema: 1, people: {} };
  try {
    if (values.out) {
      handles = loadHandles(values.out);
    } else if (repo) {
      data = new DataBranch(repo);
      data.sync();
      handles = loadHandles(data.dir);
    }
  } catch (e: any) {
    console.error(`agent-bill share: git failed\n${e.stderr ?? e.message}`);
    return 1;
  }
  const joined = values.mirasim ? addMirasim(handles, handle, values.mirasim) : false;

  const { byHandle, leftOut } = splitByPerson(result.calls, handle, loadStarters(), handles);
  const files = [...byHandle].flatMap(([h, calls]) => usageFiles(calls, h, config.device, pricesDate(prices)));
  const calls = files.reduce((n, f) => n + f.file.rows.reduce((m, r) => m + r.calls, 0), 0);
  const days = files.map((f) => f.file.date).sort();
  const range = days.length ? `${days[0]}..${days.at(-1)}` : 'no days';
  const people = [...byHandle.keys()].join(', ') || handle;
  const notes = leftOutNotes(leftOut);

  if (dryRun) {
    for (const { path, file } of files) console.log(`── ${path}\n${render(file)}`);
    if (joined) console.log(`── handles.json\n${JSON.stringify(handles, null, 2)}\n`);
    console.log(`\nWould write ${files.length} file(s) for ${people} (${calls} calls, ${range}) to ${repo ? `${repo}, branch ${BRANCH}` : values.out ?? '(no repo set yet)'}.`);
    notes.forEach((n) => console.log(n));
    console.log('Dry run: nothing was written.');
    return 0;
  }

  if (values.out) {
    for (const { path, file } of files) write(join(values.out, path), file);
    if (joined) saveHandles(values.out, handles);
    console.log(`Wrote ${files.length} file(s) for ${people} (${calls} calls, ${range}) to ${values.out}.`);
    notes.forEach((n) => console.log(n));
    return 0;
  }

  try {
    for (const { path, file } of files) write(join(data!.dir, path), file);
    if (joined) saveHandles(data!.dir, handles);
    const paths = [...[...byHandle.keys()].map((h) => `usage/${h}`), ...(joined ? ['handles.json'] : [])];
    const outcome = paths.length ? data!.publish(paths, `usage: ${people} ${range}`) : 'unchanged';
    console.log(outcome === 'pushed'
      ? `Shared ${files.length} file(s) for ${people} (${calls} calls, ${range}) to ${repo}, branch ${BRANCH}.`
      : `Nothing new to share (${range}).`);
    notes.forEach((n) => console.log(n));
  } catch (e: any) {
    console.error(`agent-bill share: git failed\n${e.stderr ?? e.message}`);
    return 1;
  }
  saveConfig({ ...config, handle, repo });
  return 0;
}

// Off Mirasim every call is the person running share. On Mirasim a call belongs to whoever started
// its turn, if they are in handles.json; calls with no recorded starter are the person running share.
export function splitByPerson(calls: Call[], me: string, starters: Starters | undefined, handles: Handles) {
  const byHandle = new Map<string, Call[]>();
  const leftOut = new Map<string, number>();
  const handleOf = handleByMirasim(handles);
  for (const c of calls) {
    const email = starters?.at(c.agent, c.sessionId, c.ts)?.toLowerCase();
    const h = email ? handleOf.get(email) : me;
    if (h) byHandle.set(h, [...(byHandle.get(h) ?? []), c]);
    else leftOut.set(email!, (leftOut.get(email!) ?? 0) + 1);
  }
  return { byHandle, leftOut };
}

function leftOutNotes(leftOut: Map<string, number>): string[] {
  if (!leftOut.size) return [];
  return [
    `Left out ${[...leftOut.values()].reduce((a, b) => a + b, 0)} call(s) from Mirasim sessions started by people not in handles.json:`,
    ...[...leftOut].map(([email, n]) => `  ${email}: ${n} call(s)`),
    'Each of them can join with: agent-bill share --mirasim <their Mirasim email>',
  ];
}

export function usageFiles(calls: Call[], handle: string, device: string, prices: string): { path: string; file: UsageFile }[] {
  const byDate = new Map<string, Call[]>();
  for (const c of calls) byDate.set(c.date, [...(byDate.get(c.date) ?? []), c]);
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, list]) => ({
      path: `usage/${handle}/${device}/${date}.json`,
      file: { schema: 1, handle, device, date, collector: COLLECTOR, prices, rows: toRows(list) },
    }));
}

export const render = (file: UsageFile) => JSON.stringify(file, null, 1) + '\n';

function write(path: string, file: UsageFile): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, render(file));
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return localDate(d);
}

async function askHandle(): Promise<string | undefined> {
  if (!process.stdin.isTTY) return undefined;
  const suggestion = userInfo().username.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 32);
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`Pick the name your team will see you as (a-z, 0-9, -) [${suggestion}]: `);
  rl.close();
  return answer.trim() || suggestion;
}
