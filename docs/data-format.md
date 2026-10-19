# Agent Bill: shared data format

**Schema 1, 2026-10-19.** This is the contract between `share`, which writes these files, and `report` and `demo`, which read and write them. Change it only with a schema bump.

## Where the files live

An orphan branch `agent-bill-data` in the team's chosen repo:

```text
handles.json                              who takes part (see below)
usage/<handle>/<device>/<YYYY-MM-DD>.json one person's usage on one device on one day
```

- `<handle>`: the person's chosen name, `[a-z0-9-]{1,32}`.
- `<device>`: a random id made on first run and kept in `~/.agentbill/config.json`, `d-` plus 8 hex digits. It is never the hostname. It keeps one person's laptop and desktop from overwriting each other's files.
- `<YYYY-MM-DD>`: the local date on that device.
- A day with no usage has no file.

## Usage file

```json
{
  "schema": 1,
  "handle": "peiqi",
  "device": "d-3f9a2c1b",
  "date": "2026-10-19",
  "collector": "agent-bill/0.1.0",
  "prices": "2026-10-06",
  "rows": [
    {
      "agent": "claude-code",
      "model": "claude-opus-5-5",
      "repo": "github.com/acme/shop-api",
      "branch": "feat/cart",
      "calls": 42,
      "subagentCalls": 5,
      "tokens": { "input": 1520, "output": 88010, "cacheRead": 4100230, "cacheWrite5m": 120400, "cacheWrite1h": 0, "reasoning": 0 },
      "costUsd": 3.1415,
      "unpricedCalls": 0
    }
  ]
}
```

| Field | Meaning |
|---|---|
| `collector` | The version that wrote the file |
| `prices` | The date of the price table `costUsd` was computed with |
| `agent` | `claude-code` or `codex` |
| `model` | The model id as the agent logged it, minus context-size suffixes such as `[1m]` |
| `repo` | Normalized git remote, `host/org/repo`, lowercase; `local:<folder name>` when there is no remote |
| `branch` | Git branch; absent when unknown or detached |
| `calls` | API calls, after removing the duplicate log lines |
| `subagentCalls` | Of those, calls made by sub-agents |
| `tokens.input` | Input tokens not served from cache |
| `tokens.output` | Output tokens, including reasoning |
| `tokens.cacheRead` | Input tokens served from cache |
| `tokens.cacheWrite5m`, `tokens.cacheWrite1h` | Tokens written to cache, by cache lifetime (Claude only; 0 for Codex) |
| `tokens.reasoning` | The reasoning part of `output`, for information; already counted in `output` |
| `costUsd` | Estimated at API list price, rounded to 4 decimals |
| `unpricedCalls` | Calls to a model the price table doesn't know; their cost is not in `costUsd` |

There is one row per agent × model × repo × branch. A file never contains prompts, outputs, code, tool calls, file paths, session ids or times of day.

## Writing rules

- `share` rewrites whole files, never appends. Running it twice gives the same files.
- By default it writes the last 7 days; `--since YYYY-MM-DD` goes further back. Agents delete old logs (Claude Code after 30 days by default), so rewriting an old day could replace a complete file with a partial one. `share` never deletes files.
- One commit per run, with the message `usage: <handle> <first date>..<last date>`. Each person only writes under their own `usage/<handle>/`, so concurrent pushes don't conflict; `share` rebases and retries when the push is rejected.

## handles.json

```json
{
  "schema": 1,
  "people": {
    "peiqi": { "mirasim": ["peiqi.shen@mirasim.ai"] },
    "feifan": { "mirasim": ["feifan.tong@mirasim.ai"] }
  }
}
```

Adding your handle here is how you take part; `agent-bill share --mirasim <your Mirasim email>` adds you. It matters on shared machines: in a Mirasim space, everyone drives agents as the same OS user, so `share` uses the space's record of who started each session (`~/.mirasim/collab/turns.jsonl`) and writes each person's rows under their handle. It writes rows only for people listed here, matched by their Mirasim account email. It counts the rest and leaves them out, and `--dry-run` says how many calls were left out and why. Sessions with no recorded starter (for example, ones another agent started) go to the person running `share`.

## Reading rules (`report`)

- Sum every device's file for a handle and date.
- Ignore files whose `schema` it doesn't know, and say so.
- A week runs Monday to Sunday by each file's `date`.
