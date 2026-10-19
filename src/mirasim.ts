import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

// In a Mirasim space several people drive agents as the same OS user, so the agents' logs can't
// say whose a call was. Mirasim records who started each turn of each session
// (collab/turns.jsonl, keyed '<agent>:<mirasim session id>'); a call belongs to whoever started
// the turn it was made in. Codex sessions have their own id in the logs; the session's
// record.json maps it ('nativeSessionId').
export interface Starters {
  // The account email of whoever started the turn running at `ts`; undefined when not recorded.
  at(agent: string, sessionId: string, ts: string): string | undefined;
}

const AGENTS: Record<string, string> = { 'claude-code': 'claude', codex: 'codex' };

export function loadStarters(home = process.env.MIRASIM_HOME ?? join(homedir(), '.mirasim')): Starters | undefined {
  const turnsFile = join(home, 'collab', 'turns.jsonl');
  if (!existsSync(turnsFile)) return undefined;

  const native = new Map<string, string>();
  for (const agent of Object.values(AGENTS)) {
    const dir = join(home, 'sessions', agent);
    if (!existsSync(dir)) continue;
    for (const id of readdirSync(dir)) {
      try {
        const record = JSON.parse(readFileSync(join(dir, id, 'record.json'), 'utf8'));
        if (record.nativeSessionId) native.set(`${agent}:${record.nativeSessionId}`, `${agent}:${id}`);
      } catch {
        // no record for this session
      }
    }
  }

  const turns = new Map<string, { at: number; email: string }[]>();
  const creators = new Map<string, string>();
  for (const line of readFileSync(turnsFile, 'utf8').split('\n')) {
    let e: any;
    try {
      e = JSON.parse(line);
    } catch {
      continue;
    }
    const email = e?.by?.email;
    if (!e?.k || !email) continue;
    if (e.t === 'creator') creators.set(e.k, email);
    else if (e.t === 'turn') turns.set(e.k, [...(turns.get(e.k) ?? []), { at: e.at, email }]);
  }
  for (const list of turns.values()) list.sort((a, b) => a.at - b.at);

  return {
    at(agent, sessionId, ts) {
      const name = AGENTS[agent];
      if (!name) return undefined;
      const key = native.get(`${name}:${sessionId}`) ?? `${name}:${sessionId}`;
      const t = Date.parse(ts);
      const started = (turns.get(key) ?? []).filter((x) => x.at <= t).at(-1);
      return started?.email ?? creators.get(key);
    },
  };
}
