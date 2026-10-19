# Agent Bill: requirements

**Draft v0.1, 2026-10-19.** For review. Comment on any paragraph. Section 8 lists the decisions we still need.

## 1. Problem

A team of engineers uses Claude Code, Codex and other coding agents, each person on their own plan or API key. Nobody can answer simple questions:

- How much did the team spend on agents this week?
- Which repo, which branch, which pull request cost the most?
- Is one agent or model cheaper for the kind of work we do?

Spend shows up on many separate bills, and none of them is per pull request.

## 2. Users

| Who | Wants |
|---|---|
| Tech lead of a 2–20 person team | Weekly team spend by repo, person and agent; cost per merged PR; a heads-up when something is unusually expensive |
| Engineer | Their own spend over time; a comparison between agents; control over what they share |

## 3. What exists today (checked 2026-10-19)

| Tool | What it does | What it doesn't do |
|---|---|---|
| [ccusage](https://github.com/ccusage/ccusage) (about 19k stars) | Reads local logs of 18+ agents; daily, monthly and session reports; JSON output | One person, one laptop. No team view, no per-PR cost |
| CodeBurn | Terminal dashboard for Claude Code and Codex | One person, one laptop |
| TokenSave usage analyzer | In-browser report by day, project and model, CSV export | One person; upload logs by hand |
| Claude Code OpenTelemetry + Grafana dashboards | Cost by user and repo across a team | Needs a collector, a metrics store and Grafana; only agents that export telemetry |
| Provider consoles | The real bill | Per account or org, not per repo or PR |

**The gap:** a team view and cost per pull request, with no server to run.

## 4. Proposal for v0.1

Three commands plus a demo generator. Node ≥ 20, run with `npx agent-bill` (see question 2).

### 4.1 `scan`

Reads local logs and aggregates usage.

| Agent | Where | Fields we use |
|---|---|---|
| Claude Code | `~/.claude/projects/**/*.jsonl` | each assistant reply: `timestamp`, `cwd`, `gitBranch`, `message.model`, `message.usage` (input, cache creation, cache read, output tokens) |
| Codex | `${CODEX_HOME:-~/.codex}/sessions/**/rollout-*.jsonl` | `session_meta`: `cwd`, `git.repository_url`, `git.branch`; `turn_context`: `model`; `token_count` events: `last_token_usage` (input, cached input, output, reasoning tokens) |

One row = day × agent × model × repo × branch, with token counts and estimated cost. The repo is the normalized git remote, not a folder path.

### 4.2 `share`

Writes the person's rows to a shared place the team already has, with no server. Proposal: a `agent-bill-data` branch in the team's own repo, one file per person per day (question 1). `--dry-run` prints exactly what would be written.

### 4.3 `report`

Builds one HTML file that opens offline, from everyone's shared rows:

- Team total this week, and the trend over recent weeks
- By repo, by person, by agent and model
- Most expensive branches; cost per merged PR where a branch maps to a PR (question 5)

### 4.4 `demo`

Generates a realistic 4-person, two-week dataset. Every public screenshot and the online demo use this data only.

### 4.5 Prices

Estimated at list price from a dated, vendored price table (question 4). People on a subscription see a list-price equivalent, labeled as such, not their actual bill.

## 5. Privacy rules

- Only totals leave the laptop: date, handle, agent, model, repo, branch, token counts, estimated cost.
- Never: prompts, outputs, code, tool calls, file paths.
- Sharing is opt-in, and each person chooses their handle.
- `share --dry-run` always works and shows the exact output.

## 6. Scope

**In v0.1:** Claude Code and Codex; `scan`, `share`, `report`, `demo`; macOS and Linux.

**Not in v0.1:** other agents (maybe later, by importing ccusage JSON); a hosted server; budgets and alerts; reconciling with real invoices; Windows.

## 7. Acceptance for v0.1

- [ ] On a laptop with both Claude Code and Codex logs, `scan` daily totals match ccusage within 1% for the same days.
- [ ] `share --dry-run` output contains no prompt text, code or absolute paths.
- [ ] `report` built from four people's shared files opens offline as a single HTML file and shows the team week total, by repo, by person and by branch.
- [ ] Merged PRs show their cost when their branch can be matched.
- [ ] `demo` produces the 4-person dataset; the public demo shows only that.
- [ ] Following the README quick start works on a fresh macOS and a fresh Linux machine.

## 8. Open questions

1. **Shared store.** A data branch in the team's repo, a separate repo, or a gist? *Proposal: data branch.*
2. **Language.** TypeScript on Node (like ccusage's npm package; `npx` just works) or a Rust single binary? *Proposal: TypeScript, no runtime dependencies.*
3. **Handle.** A name the person chooses, or a hash of their git email? *Proposal: chosen name, stored in a local config file.*
4. **Price table.** Which source, how often to update, and how to label subscription users?
5. **Branch to PR.** Use the GitHub API when a token is available. What do we show without one?
