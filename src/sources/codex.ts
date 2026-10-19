import { homedir } from 'node:os';
import { join } from 'node:path';
import { jsonLines, num, walk } from '../files.ts';
import type { Source, Tokens, UsageEvent } from '../types.ts';

// $CODEX_HOME/sessions/YYYY/MM/DD/rollout-*.jsonl (and archived_sessions/).
//
// Newer Codex writes a `token_usage_record` per model response, keyed by `response_id`; when a file
// has those, they are the calls. Older files only have `token_count` events carrying a running
// `total_token_usage`; Codex repeats the event when only rate limits change, so there each call is
// the difference between consecutive totals, and an unchanged total is skipped.
// OpenAI counts cached input (and cache writes) inside input_tokens, and reasoning inside output_tokens.
export const codex: Source = {
  agent: 'codex',

  roots() {
    const home = process.env.CODEX_HOME ?? join(homedir(), '.codex');
    return [join(home, 'sessions'), join(home, 'archived_sessions')];
  },

  async *read(root) {
    for (const file of walk(root, (n) => n.startsWith('rollout-') && n.endsWith('.jsonl'))) {
      let sessionId = file;
      let cwd: string | undefined;
      let branch: string | undefined;
      let remote: string | undefined;
      let client: string | undefined;
      let model = 'unknown';
      let prev = { input: 0, cached: 0, cacheWrite: 0, output: 0, reasoning: 0 };
      const records: UsageEvent[] = [];
      const deltas: UsageEvent[] = [];

      const event = (key: string, ts: string, u: ReturnType<typeof usage>): UsageEvent => ({
        agent: 'codex',
        client,
        sessionId,
        key,
        ts,
        model,
        cwd,
        remote,
        gitBranch: branch,
        tokens: tokensOf(u),
      });

      for await (const e of jsonLines(file)) {
        const p = e?.payload;
        if (!p) continue;
        if (e.type === 'session_meta') {
          sessionId = p.id ?? sessionId;
          cwd = p.cwd ?? cwd;
          branch = p.git?.branch ?? branch;
          remote = p.git?.repository_url ?? remote;
          client = p.originator ?? client;
        } else if (e.type === 'turn_context') {
          model = p.model ?? model;
          cwd = p.cwd ?? cwd;
        } else if (e.type === 'token_usage_record' && p.usage) {
          records.push(event(`${sessionId}:${p.response_id ?? e.timestamp}`, e.timestamp, usage(p.usage)));
        } else if (e.type === 'event_msg' && p.type === 'token_count' && p.info?.total_token_usage) {
          const total = usage(p.info.total_token_usage);
          const d = {
            input: total.input - prev.input,
            cached: total.cached - prev.cached,
            cacheWrite: total.cacheWrite - prev.cacheWrite,
            output: total.output - prev.output,
            reasoning: total.reasoning - prev.reasoning,
          };
          // A total that went down means a new rollout segment; count it from zero.
          const delta = d.input < 0 || d.output < 0 ? total : d;
          prev = total;
          if (delta.input === 0 && delta.output === 0) continue;
          deltas.push(event(`${sessionId}:${total.input}:${total.output}`, e.timestamp, delta));
        }
      }
      yield* records.length ? records : deltas;
    }
  },
};

function usage(t: any) {
  return {
    input: num(t.input_tokens),
    cached: num(t.cached_input_tokens),
    cacheWrite: num(t.cache_write_input_tokens),
    output: num(t.output_tokens),
    reasoning: num(t.reasoning_output_tokens),
  };
}

function tokensOf(u: ReturnType<typeof usage>): Tokens {
  return {
    input: Math.max(0, u.input - u.cached - u.cacheWrite),
    output: u.output,
    cacheRead: u.cached,
    cacheWrite5m: u.cacheWrite,
    cacheWrite1h: 0,
    reasoning: u.reasoning,
  };
}
