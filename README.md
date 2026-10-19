# Agent Bill

**What did that PR cost?**

Agent Bill shows what your team's coding agents cost: per person, per repo, per branch, and per merged pull request. It reads the logs Claude Code and Codex already keep on each laptop. No proxy, no telemetry stack, no server.

> **Status: v0.1, October 2026, built in the open.** Not on npm yet; until it is, run it from a clone (below). See the [requirements](docs/requirements.md), and open an issue if something you need is missing.

## Why

- Everyone on the team runs agents on their own plan or key. Nobody can say what the team spent this week, or on what.
- Tools like [ccusage](https://github.com/ccusage/ccusage) answer that for one person on one laptop.
- OpenTelemetry dashboards can split cost by user and repo, but they need a collector, a metrics store and Grafana, and they only see agents that export telemetry.

Agent Bill sits in between. It gives a team view with nothing to run.

## Quick start

You need Node 22 or later and git. Pick a repo your team can all push to; the data goes on its own branch, `agent-bill-data`, and never touches your code.

```sh
npx agent-bill scan                       # your own totals from local Claude Code and Codex logs
npx agent-bill scan --by repo             # … or by model, branch or agent

npx agent-bill share --dry-run            # exactly what would leave your laptop
npx agent-bill share --repo https://github.com/your-org/your-repo --handle your-name
                                          # write your daily totals to that repo's agent-bill-data branch;
                                          # later runs remember the repo and handle: npx agent-bill share

npx agent-bill report                     # one offline HTML page from everyone's totals
open agent-bill-report.html               # (xdg-open on Linux)
```

Run `share` whenever you like (a daily cron job or an agent hook works); it rewrites the last seven days and nothing older.

`report` finds each branch's merged pull request on GitHub when it has a token: `$GITHUB_TOKEN`, or the GitHub CLI's login (`gh auth login`). Only repo and branch names are sent. Without a token you still get cost per branch.

To try it without anyone's data:

```sh
npx agent-bill demo --out demo            # a made-up four-person team, two weeks
npx agent-bill report --data demo
```

### From a clone, until it is on npm

```sh
git clone https://github.com/spqpeppa/agent-bill && cd agent-bill
npm install && npm run build
node dist/cli.js scan                     # then use node dist/cli.js wherever this README says npx agent-bill
```

## What leaves your laptop

Only daily totals: date, your chosen handle, agent, model, repo (`github.com/org/repo`, never a local path), branch, call count, token counts and estimated cost. Never prompts, outputs, code, file paths or session ids. The files and their format are in [docs/data-format.md](docs/data-format.md); `share --dry-run` prints them before anything is written. The data branch's commits are authored by `agent-bill`, not by you.

Costs are estimates at API list price, from a dated price table in the package. If you are on a subscription, you see what the same usage would cost through the API, not your bill.

**Shared machines.** In a [Mirasim](https://mirasim.ai) space, several people drive agents as the same OS user. There, `share` splits the usage by who started each session, for the people who have joined with `share --mirasim <their Mirasim email>`.

## What's in v0.1

- Claude Code and Codex (including Codex's newer per-response logs). Daily totals match ccusage's for the same days.
- Team spend by week, day, person, repo, agent and model; unusually expensive days; the most expensive branches; the cost of each merged pull request.
- A sample-data generator, so demos never show anyone's real spend. [See the dashboard prototype](docs/prototype/).
- macOS and Linux.

Not yet: other agents, a server, budgets and alerts, reconciling with real invoices, Windows. The [requirements](docs/requirements.md#6-scope) list what might come next.

## Built by

A small team and several coding agents, working together in a [Mirasim](https://mirasim.ai) team space. We are recording how it goes and will link the write-up here.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
