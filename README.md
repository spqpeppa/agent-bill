# Agent Bill

**What did that PR cost?**

Agent Bill shows what your team's coding agents cost: per person, per repo, per branch, and per merged pull request. It reads the logs Claude Code and Codex already keep on each laptop. No proxy, no telemetry stack, no server.

> **Status: being built in the open, October 2026.** There is nothing to install yet. Start with the [requirements draft](docs/requirements.md) and open an issue if something you need is missing.

## Why

- Everyone on the team runs agents on their own plan or key. Nobody can say what the team spent this week, or on what.
- Tools like [ccusage](https://github.com/ccusage/ccusage) answer that for one person on one laptop.
- OpenTelemetry dashboards can split cost by user and repo, but they need a collector, a metrics store and Grafana, and they only see agents that export telemetry.

Agent Bill sits in between. It gives a team view with nothing to run.

## How it will work

```sh
npx agent-bill scan              # read local Claude Code and Codex logs, show your own totals
npx agent-bill share --dry-run   # show exactly what would leave your laptop
npx agent-bill share             # write your daily totals to the team's data branch
npx agent-bill report            # build one offline HTML dashboard from everyone's totals
```

Only totals leave your laptop: date, your chosen handle, agent, model, repo, branch, token counts and estimated cost. Prompts, outputs, code and file paths never do.

## Planned for v0.1

- Claude Code and Codex
- Team totals by week, repo, person, agent and model
- Cost per branch, and per merged PR when the branch maps to one
- A sample-data generator, so demos never show anyone's real spend

## Built by

A small team and several coding agents, working together in a [Mirasim](https://mirasim.ai) team space. We are recording how it goes and will link the write-up here.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
