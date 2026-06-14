# Codex Instructions

Before making product or implementation changes, read:

- `docs/product-plan.md`

Work issue-by-issue. Use GitHub issues as the unit of work.

Before starting any issue work:
- Check out `main`.
- Pull the latest changes from `origin/main`.
- Create a new issue branch from `main`.

For every issue:
- Follow the product plan unless the issue explicitly says otherwise.
- Keep changes scoped to the issue.
- Do not implement unrelated milestones.
- Update tests and README when relevant.
- Explain any assumptions in the final summary. If there were no assumptions,
  say so.
- If an assumption should be preserved beyond the final summary, add or update
  a decision record in `docs/decision-records/`.
- For each assumption, state whether it is consistent with
  `docs/product-plan.md`.
- If an assumption reveals a gap or follow-up adjustment in the code or product
  plan, discuss whether to handle it in the current issue or create a separate
  ticket.
- State whether the implemented feature is worth manual testing before merge,
  and why.

## GitHub Issues

GitHub repository: `eerrecalde/assets-watcher`

When the user references an issue number like `#1`, resolve it from GitHub with:

`gh issue view <number> --repo eerrecalde/assets-watcher`

Use the actual GitHub issue title, body, labels, and acceptance criteria as the scope of work.
