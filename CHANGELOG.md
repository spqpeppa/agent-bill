# Changelog

## 0.1.0 (unreleased)

First release.

- `scan`: your own usage from local Claude Code and Codex logs, by day, model, repo, branch or agent. Duplicate log lines are dropped (Claude Code's streamed replies; Codex's repeated totals), and Codex's newer per-response records are used when present. Daily totals match ccusage 20.0.
- `share`: your daily totals to the `agent-bill-data` branch of a repo your team chooses, one file per person, device and day (docs/data-format.md). `--dry-run` shows exactly what would be written. Commits are authored by `agent-bill`. In a Mirasim space, usage is split by who started each session.
- `report`: one offline HTML dashboard: team spend by week and day, by person, repo, agent and model, unusually expensive days, the most expensive branches, and the cost of each merged pull request (found on GitHub with a token).
- `demo`: a made-up four-person team's data, for screenshots and demos.
- Prices: LiteLLM's community table plus official overrides, dated 2026-10-19.
