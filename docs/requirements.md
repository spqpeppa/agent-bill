# Agent Bill: requirements

**v1.0, 2026-10-19.** Section 8 records the decisions on the five open questions of draft v0.1.

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

Three commands plus a demo generator. TypeScript compiled to plain JavaScript, no runtime dependencies, Node ≥ 22, run with `npx agent-bill` (decision 2).

### 4.1 `scan`

Reads local logs and aggregates usage.

| Agent | Where | Fields we use |
|---|---|---|
| Claude Code | `~/.claude/projects/**/*.jsonl` | each assistant reply: `timestamp`, `cwd`, `gitBranch`, `message.model`, `message.usage` (input, cache creation, cache read, output tokens) |
| Codex | `${CODEX_HOME:-~/.codex}/sessions/**/rollout-*.jsonl` | `session_meta`: `cwd`, `git.repository_url`, `git.branch`; `turn_context`: `model`; `token_count` events: `last_token_usage` (input, cached input, output, reasoning tokens) |

One row = day × agent × model × repo × branch, with call count, token counts and estimated cost. The day is the person's local date, the same as ccusage uses, so the two can be compared. The repo is the normalized git remote (`github.com/org/repo`), not a folder path; a folder with no remote becomes `local:<folder name>`.

Agents write some log lines more than once: Claude Code repeats a streamed reply once per content block, and Codex repeats its running total when only rate limits change. `scan` counts each API call once (Claude Code: message id + request id; Codex: the change in the running total).

### 4.2 `share`

Writes the person's rows to a shared place the team already has, with no server: an `agent-bill-data` branch in a git repo the team chooses (decision 1), one file per person, device and day at `usage/<handle>/<device>/<YYYY-MM-DD>.json`. Re-running `share` rewrites the same files, so it is safe to run as often as you like. It rewrites the last 7 days by default, because agents delete old logs and an old day would come back incomplete. `--dry-run` prints exactly what would be written and never pushes. The file format is in [data-format.md](data-format.md).

**Shared machines.** In a Mirasim space several people drive agents as the same OS user, so the logs alone would put everyone's usage under one name. There, `share` reads the space's record of who started each session and splits the rows by person. It only writes files for people who have added themselves to `handles.json` on the data branch; adding yourself is how you opt in.

### 4.3 `report`

Builds one HTML file that opens offline, from everyone's shared rows (it fetches the data branch first, or reads a folder given with `--data`):

- Team total this week, and the trend over recent weeks
- By repo, by person, by agent and model
- Most expensive branches; cost per merged PR where a branch maps to a PR (decision 5)

### 4.4 `demo`

Generates a realistic 4-person, two-week dataset. Every public screenshot and the online demo use this data only.

### 4.5 Prices

Estimated at list price from a dated, vendored price table (decision 4). People on a subscription see a list-price equivalent, labeled as such, not their actual bill. Local logs don't show batch, priority-tier or negotiated discounts, so the estimate can be higher than the real invoice.

## 5. Privacy rules

- Only totals leave the laptop: date, handle, agent, model, repo, branch, call count, token counts, estimated cost.
- Never: prompts, outputs, code, tool calls, file paths, session ids, timestamps finer than a day.
- Sharing is opt-in, and each person chooses their handle.
- `share --dry-run` always works and shows the exact output.

## 6. Scope

**In v0.1:** Claude Code and Codex; `scan`, `share`, `report`, `demo`; macOS and Linux.

**Not in v0.1:** other agents (maybe later, by importing ccusage JSON); a server of any kind; subscription seats and their return on cost; budgets and alerts; reconciling with real invoices; Windows.

**Candidates for v0.2.** A self-hosted service (one container plus Postgres) for teams that outgrow a data branch: members push over HTTPS instead of git, and the service adds a seat register (who pays for which plan), paid-versus-list-price views, budgets and weekly digests. The sketch is in the team space's `PLAN.md`; it reuses the same collector and the same row format.

## 7. Acceptance for v0.1

- [ ] On a laptop with both Claude Code and Codex logs, `scan` daily totals match ccusage within 1% for the same days.
- [ ] `share --dry-run` output contains no prompt text, code or absolute paths.
- [ ] `report` built from four people's shared files opens offline as a single HTML file and shows the team week total, by repo, by person and by branch.
- [ ] Merged PRs show their cost when their branch can be matched.
- [ ] `demo` produces the 4-person dataset; the public demo shows only that.
- [ ] Following the README quick start works on a fresh macOS and a fresh Linux machine.

## 8. Decisions

Draft v0.1 left these five questions open. Decided 2026-10-19.

1. **Shared store: a data branch.** An orphan `agent-bill-data` branch in a repo the team already has, set once with `agent-bill share --repo <url>`. It reuses the repo's existing access control and needs nothing new to run. A separate repo works the same way, because it is only a URL; a gist doesn't, because it has no per-file history or access control we can rely on. A self-hosted service is a v0.2 candidate (section 6).
2. **Language: TypeScript, no runtime dependencies.** The package ships compiled JavaScript, because Node won't strip types from `.ts` files inside `node_modules`, so `npx` couldn't run the sources directly. Node ≥ 22: Node 20 reached end of life in April 2026. Development and tests run the `.ts` sources directly, which needs Node ≥ 22.18.
3. **Handle: a name the person chooses.** Lowercase letters, digits and `-`, asked for on the first `share` and stored in `~/.agentbill/config.json`. Not a hash of the git email: a hash is unreadable in the report, and anyone who knows the email can recompute it.
4. **Price table: LiteLLM's community table plus our own overrides.** `prices.json` is generated from LiteLLM's `model_prices_and_context_window.json`, then corrected with `scripts/price-overrides.json` (official list prices where the community table is wrong or missing a model; for example, it had Sonnet 5.5's cache-read price at half the official rate). It is regenerated for each release and dated. The report shows the table's date and marks calls to models it has no price for. Subscription users see a list-price equivalent, labeled as such.
5. **Branch to PR: GitHub API when a token is available.** `report` uses `$GITHUB_TOKEN`, or `gh auth token` when the GitHub CLI is signed in, to find merged pull requests by their head branch (github.com repos only in v0.1). Without a token, the report shows cost per branch and says that PR matching is off and how to turn it on.
