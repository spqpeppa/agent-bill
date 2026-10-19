import { homedir } from 'node:os';
import { join } from 'node:path';
import { jsonLines, num, walk } from '../files.ts';
import type { Source, UsageEvent } from '../types.ts';

// ~/.claude/projects/<cwd-slug>/<session>.jsonl — one line per transcript entry. Assistant entries
// carry `message.usage`; a streamed message is written once per content block with the same
// message id and requestId, so those are the dedup key.
export const claudeCode: Source = {
  agent: 'claude-code',

  roots() {
    const dirs = (process.env.CLAUDE_CONFIG_DIR ?? '')
      .split(',')
      .map((d) => d.trim())
      .filter(Boolean);
    if (!dirs.length) dirs.push(join(homedir(), '.claude'), join(homedir(), '.config', 'claude'));
    return dirs.map((d) => join(d, 'projects'));
  },

  async *read(root) {
    for (const file of walk(root, (n) => n.endsWith('.jsonl'))) {
      for await (const e of jsonLines(file)) {
        if (e?.type !== 'assistant' || !e.message?.usage) continue;
        const m = e.message;
        const u = m.usage;
        if (!m.model || m.model === '<synthetic>') continue;

        const cacheWrite = num(u.cache_creation_input_tokens);
        const cacheWrite1h = num(u.cache_creation?.ephemeral_1h_input_tokens);
        const event: UsageEvent = {
          agent: 'claude-code',
          client: e.entrypoint,
          sessionId: e.sessionId ?? '',
          key: `${m.id ?? e.uuid}:${e.requestId ?? ''}`,
          ts: e.timestamp,
          model: m.model,
          cwd: e.cwd,
          gitBranch: e.gitBranch && e.gitBranch !== 'HEAD' ? e.gitBranch : undefined,
          sidechain: !!e.isSidechain,
          speed: u.speed,
          tokens: {
            input: num(u.input_tokens),
            output: num(u.output_tokens),
            cacheRead: num(u.cache_read_input_tokens),
            cacheWrite5m: cacheWrite - cacheWrite1h,
            cacheWrite1h,
            reasoning: num(u.output_tokens_details?.thinking_tokens),
          },
        };
        yield event;
      }
    }
  },
};
