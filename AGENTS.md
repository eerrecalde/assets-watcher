# Codex Instructions

Before making product or implementation changes, read:

- `docs/product-plan.md`

Work issue-by-issue. Use GitHub issues as the unit of work.

Before starting any issue work:
- Fetch `origin main`.
- Ensure the working branch is based on the latest `origin/main`.
- If it is not, update or rebase before making changes.

For every issue:
- Follow the product plan unless the issue explicitly says otherwise.
- Keep changes scoped to the issue.
- Do not implement unrelated milestones.
- Update tests and README when relevant.
- Explain assumptions in the final summary.
- After the assumption, please analyse whether the assumption makes sense from the product plan stand point and confirm this.
- If from the analysis above we determine that it needs further adjustments (code or plan wise), let's discuss about the possibility of tackling this on the same work or to create a ticket for later on.

## GitHub Issues

GitHub repository: `eerrecalde/assets-watcher`

When the user references an issue number like `#1`, resolve it from GitHub with:

`gh issue view <number> --repo eerrecalde/assets-watcher`

Use the actual GitHub issue title, body, labels, and acceptance criteria as the scope of work.
