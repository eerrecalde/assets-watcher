# Stock Portfolio Intelligence App

This repository includes tooling for planning the stock portfolio intelligence app.

## Bulk-create GitHub issues

The script at `scripts/create-github-issues.sh` prepares GitHub issues for the first three milestones:

- `Milestone 0 — Project Foundation`
- `Milestone 1 — Manual Portfolio Tracker`
- `Milestone 2 — Market Data Cache`

It uses `gh issue create` and includes a title, body, milestone, and labels for each issue.

### Prerequisites

- Install the GitHub CLI.
- Authenticate with `gh auth login`.
- The script targets `eerrecalde/assets-watcher` by default.
- To target a different repository, set `GH_REPO=owner/repo`.
- Create the milestones and labels in GitHub before running the script.

Required labels:

- `codex-ready`
- `priority: high`
- `priority: medium`
- `priority: low`
- `area: auth`
- `area: portfolio`
- `area: market-data`
- `area: ui`
- `area: docs`
- `area: db`
- `type: feature`
- `type: docs`
- `type: test`
- `type: tech-debt`

### Preview commands

Dry-run mode is the default and does not create issues:

```bash
scripts/create-github-issues.sh
```

You can also pass the flag explicitly:

```bash
scripts/create-github-issues.sh --dry-run
```

### Create issues

Only run this when you are ready to create issues in GitHub:

```bash
scripts/create-github-issues.sh --execute
```
