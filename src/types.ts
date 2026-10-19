// One API call as an agent logged it, normalised across agents. Never carries prompt or code content.
export interface UsageEvent {
  agent: string;             // 'claude-code' | 'codex'
  client?: string;           // where the agent ran from, e.g. 'cli', 'vscode', 'mirasim'
  sessionId: string;
  key: string;               // dedup key, unique per API call
  ts: string;                // ISO timestamp
  model: string;
  cwd?: string;              // used locally to resolve the repo, never shared
  remote?: string;           // git remote URL when the agent records it itself
  gitBranch?: string;
  sidechain?: boolean;       // sub-agent call
  speed?: string;            // 'fast' bills at a premium on some models
  tokens: Tokens;
}

// Input is uncached input only; every bucket is billed separately.
export interface Tokens {
  input: number;
  output: number;            // includes reasoning/thinking
  cacheRead: number;
  cacheWrite5m: number;
  cacheWrite1h: number;
  reasoning: number;         // informational subset of output
}

export interface Source {
  agent: string;
  // Directories that hold this agent's logs; missing ones are skipped.
  roots(): string[];
  read(root: string): AsyncIterable<UsageEvent>;
}

// A deduplicated call, resolved to what may be shared plus the session it came from (kept local).
export interface Call {
  agent: string;
  client?: string;
  sessionId: string;
  date: string;              // local YYYY-MM-DD
  model: string;
  repo: string;              // 'github.com/org/repo', or 'local:<folder>' with no remote
  branch?: string;
  sidechain: boolean;
  tokens: Tokens;
  costUsd: number | null;    // null: model not in the price table
}

// One row of a shared usage file (docs/data-format.md).
export interface Row {
  agent: string;
  model: string;
  repo: string;
  branch?: string;
  calls: number;
  subagentCalls: number;
  tokens: Tokens;
  costUsd: number;
  unpricedCalls: number;
}

// One person's usage on one device on one day (docs/data-format.md).
export interface UsageFile {
  schema: 1;
  handle: string;
  device: string;
  date: string;
  collector: string;
  prices: string;
  rows: Row[];
}

export const emptyTokens = (): Tokens => ({
  input: 0, output: 0, cacheRead: 0, cacheWrite5m: 0, cacheWrite1h: 0, reasoning: 0,
});

export function addTokens(into: Tokens, t: Tokens): void {
  into.input += t.input;
  into.output += t.output;
  into.cacheRead += t.cacheRead;
  into.cacheWrite5m += t.cacheWrite5m;
  into.cacheWrite1h += t.cacheWrite1h;
  into.reasoning += t.reasoning;
}

export const totalTokens = (t: Tokens) =>
  t.input + t.output + t.cacheRead + t.cacheWrite5m + t.cacheWrite1h;
