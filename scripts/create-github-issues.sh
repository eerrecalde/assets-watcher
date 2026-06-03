#!/usr/bin/env bash
set -euo pipefail

DRY_RUN=1
DEFAULT_GH_REPO="eerrecalde/assets-watcher"

usage() {
  cat <<'USAGE'
Bulk-create GitHub issues for the stock portfolio intelligence app.

Usage:
  scripts/create-github-issues.sh [--dry-run]
  scripts/create-github-issues.sh --execute

Options:
  --dry-run   Print the gh issue create commands without creating issues.
              This is the default.
  --execute   Run the gh issue create commands.
  -h, --help  Show this help.

Prerequisites:
  - GitHub CLI is installed and authenticated with `gh auth login`.
  - The target repository is eerrecalde/assets-watcher, or GH_REPO is set.
  - Milestones and labels already exist in GitHub.
USAGE
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --dry-run)
      DRY_RUN=1
      ;;
    --execute)
      DRY_RUN=0
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
  shift
done

shell_quote() {
  local value="$1"
  value=${value//\'/\'\\\'\'}
  printf "'%s'" "$value"
}

print_command() {
  local first=1
  local arg

  for arg in "$@"; do
    if [ "$first" -eq 1 ]; then
      first=0
    else
      printf ' '
    fi

    shell_quote "$arg"
  done

  printf '\n'
}

create_issue() {
  local title="$1"
  local milestone="$2"
  local labels_csv="$3"
  local body="$4"
  local args=(
    gh issue create
    --repo "$GH_REPO"
    --title "$title"
    --body "$body"
    --milestone "$milestone"
  )
  local label
  local old_ifs="$IFS"
  local IFS=,
  local labels=($labels_csv)
  IFS="$old_ifs"

  for label in "${labels[@]}"; do
    args+=(--label "$label")
  done

  if [ "$DRY_RUN" -eq 1 ]; then
    print_command "${args[@]}"
    printf '\n'
  else
    "${args[@]}"
  fi
}

export GH_REPO="${GH_REPO:-$DEFAULT_GH_REPO}"

if [ "$DRY_RUN" -eq 1 ]; then
  echo "Dry run: previewing gh issue create commands. Re-run with --execute to create issues."
  echo "Target repository: $GH_REPO"
  echo
fi

create_issue \
  "Define app architecture and delivery baseline" \
  "Milestone 0 — Project Foundation" \
  "codex-ready,priority: high,area: docs,type: docs" \
  "## Goal
Create the foundation documentation for the stock portfolio intelligence app so implementation decisions are explicit and repeatable.

## Scope
- Document the target user workflows for tracking stock holdings and reviewing portfolio intelligence.
- Define the initial app architecture, data flow, and integration boundaries.
- Capture setup instructions for local development, testing, and deployment assumptions.

## Acceptance Criteria
- README or project docs describe the app purpose, supported workflows, and local setup.
- Architecture notes identify the UI, portfolio, auth, database, and market-data boundaries.
- Open questions and known constraints are recorded for future milestones."

create_issue \
  "Set up application shell and primary navigation" \
  "Milestone 0 — Project Foundation" \
  "codex-ready,priority: high,area: ui,type: feature" \
  "## Goal
Create the initial app shell for the portfolio intelligence product.

## Scope
- Add the base layout for authenticated application screens.
- Add primary navigation for dashboard, portfolio, market data, and settings areas.
- Include empty states that make unfinished sections clear without blocking navigation.

## Acceptance Criteria
- The app starts into a stable shell with responsive navigation.
- Placeholder routes exist for the first portfolio and market-data workflows.
- UI structure can support authenticated and unauthenticated states."

create_issue \
  "Create database schema baseline" \
  "Milestone 0 — Project Foundation" \
  "codex-ready,priority: high,area: db,type: feature" \
  "## Goal
Create the initial database structure needed by the first portfolio workflows.

## Scope
- Define tables or collections for users, portfolios, holdings, transactions, securities, and cached market prices.
- Add migration or schema management instructions.
- Include basic constraints, indexes, and ownership relationships.

## Acceptance Criteria
- Schema can represent a user's manually entered portfolio.
- Schema supports future market-data cache records by symbol and timestamp.
- Migration or setup steps are documented and repeatable."

create_issue \
  "Add authentication guard and user ownership model" \
  "Milestone 0 — Project Foundation" \
  "codex-ready,priority: medium,area: auth,type: feature" \
  "## Goal
Establish the auth boundary and user ownership rules for portfolio data.

## Scope
- Add authentication state handling for application routes.
- Define how portfolio records are scoped to a user.
- Document the expected auth provider or local development substitute.

## Acceptance Criteria
- Protected screens cannot be accessed without an authenticated user state.
- Portfolio data access is designed around user ownership.
- Local development has a documented way to test authenticated flows."

create_issue \
  "Add initial smoke tests for foundation workflows" \
  "Milestone 0 — Project Foundation" \
  "codex-ready,priority: medium,area: ui,type: test" \
  "## Goal
Add basic test coverage for the app foundation.

## Scope
- Cover app startup and primary navigation rendering.
- Cover authenticated versus unauthenticated route behavior if the app already exposes it.
- Add a documented test command.

## Acceptance Criteria
- A contributor can run the smoke tests locally.
- Tests fail for a broken app shell or missing primary navigation.
- CI-readiness gaps are documented if CI is not yet configured."

create_issue \
  "Create manual portfolio CRUD workflow" \
  "Milestone 1 — Manual Portfolio Tracker" \
  "codex-ready,priority: high,area: portfolio,type: feature" \
  "## Goal
Allow users to create and manage portfolios manually.

## Scope
- Add create, rename, view, and delete support for portfolios.
- Persist portfolio records using the project database layer.
- Show useful empty and loading states.

## Acceptance Criteria
- Users can create at least one named portfolio.
- Users can view their portfolios after refresh or reload.
- Users can rename and delete a portfolio with clear confirmation behavior."

create_issue \
  "Add holdings entry and editing" \
  "Milestone 1 — Manual Portfolio Tracker" \
  "codex-ready,priority: high,area: portfolio,type: feature" \
  "## Goal
Allow users to manually add and maintain holdings in a portfolio.

## Scope
- Add fields for ticker symbol, quantity, cost basis, purchase date, and notes where applicable.
- Validate required values and numeric ranges.
- Support editing and removing holdings.

## Acceptance Criteria
- Users can add holdings to a portfolio.
- Invalid symbols, quantities, and prices produce clear validation errors.
- Edited holdings persist after reload."

create_issue \
  "Build portfolio summary view" \
  "Milestone 1 — Manual Portfolio Tracker" \
  "codex-ready,priority: medium,area: ui,type: feature" \
  "## Goal
Display a readable summary of a manually entered portfolio.

## Scope
- Show holdings in a table or list optimized for scanning.
- Calculate total invested amount from quantity and cost basis.
- Add sorting or grouping where it improves repeated use.

## Acceptance Criteria
- Summary view shows each holding with key values.
- Total invested amount is calculated consistently from persisted data.
- UI handles empty portfolios and long holding lists."

create_issue \
  "Document manual portfolio tracker behavior" \
  "Milestone 1 — Manual Portfolio Tracker" \
  "codex-ready,priority: low,area: docs,type: docs" \
  "## Goal
Document the behavior and constraints of manual portfolio tracking.

## Scope
- Explain supported fields and validation rules.
- Describe how holdings and portfolios are stored.
- Record known limitations before market data is connected.

## Acceptance Criteria
- Documentation reflects the implemented tracker behavior.
- Manual data entry limitations are clear.
- Future market-data integration assumptions are noted."

create_issue \
  "Add tests for portfolio persistence and validation" \
  "Milestone 1 — Manual Portfolio Tracker" \
  "codex-ready,priority: medium,area: portfolio,type: test" \
  "## Goal
Cover the critical manual portfolio tracker behaviors.

## Scope
- Test portfolio creation and listing.
- Test holding creation, editing, and deletion.
- Test validation for required fields and invalid numeric inputs.

## Acceptance Criteria
- Tests catch broken persistence for portfolios and holdings.
- Validation tests cover common invalid inputs.
- Test setup isolates user-owned portfolio data."

create_issue \
  "Design market data cache schema" \
  "Milestone 2 — Market Data Cache" \
  "codex-ready,priority: high,area: market-data,type: feature" \
  "## Goal
Define and implement the persistence model for cached market data.

## Scope
- Store symbol, provider, price, currency, timestamp, and fetch status metadata.
- Add indexes for fast latest-price lookup by symbol.
- Decide retention and refresh-window behavior.

## Acceptance Criteria
- Cache records can store historical fetches and latest usable values.
- Latest-price lookup is efficient for portfolio summary use.
- Schema supports provider errors and stale data states."

create_issue \
  "Implement market data fetch adapter" \
  "Milestone 2 — Market Data Cache" \
  "codex-ready,priority: high,area: market-data,type: feature" \
  "## Goal
Create a provider boundary for fetching market prices.

## Scope
- Add an adapter interface for symbol quote lookup.
- Implement the first provider or a documented mock provider.
- Normalize provider responses into the app's market-data model.

## Acceptance Criteria
- Fetch logic is isolated behind a provider interface.
- Returned prices are normalized before persistence.
- Provider errors are represented without crashing portfolio workflows."

create_issue \
  "Add cache refresh workflow" \
  "Milestone 2 — Market Data Cache" \
  "codex-ready,priority: medium,area: market-data,type: feature" \
  "## Goal
Refresh cached prices only when data is missing or stale.

## Scope
- Add freshness rules for deciding when to fetch.
- Read from cache before calling the provider.
- Persist successful fetches and failure metadata.

## Acceptance Criteria
- Repeated quote requests use fresh cached values.
- Stale or missing values trigger a provider fetch.
- Fetch failures leave prior usable cache values available when possible."

create_issue \
  "Surface cached prices in portfolio summary" \
  "Milestone 2 — Market Data Cache" \
  "codex-ready,priority: medium,area: ui,type: feature" \
  "## Goal
Show cached market prices in the portfolio summary without making the UI brittle.

## Scope
- Display latest cached price, market value, and stale-data indicators.
- Handle missing prices and provider failures clearly.
- Avoid blocking manual portfolio workflows when market data is unavailable.

## Acceptance Criteria
- Holdings show cached price data when available.
- Missing or stale price states are visible.
- Portfolio summary remains usable when market-data fetches fail."

create_issue \
  "Add tests for market data cache behavior" \
  "Milestone 2 — Market Data Cache" \
  "codex-ready,priority: medium,area: market-data,type: test" \
  "## Goal
Verify market-data caching rules and provider isolation.

## Scope
- Test cache hits for fresh data.
- Test refresh behavior for stale or missing data.
- Test provider failure handling and fallback to prior cached values.

## Acceptance Criteria
- Tests verify that fresh cache entries prevent provider calls.
- Tests verify stale entries trigger refresh.
- Tests cover failure states without requiring live external market-data calls."

create_issue \
  "Review cache cleanup and retention policy" \
  "Milestone 2 — Market Data Cache" \
  "codex-ready,priority: low,area: db,type: tech-debt" \
  "## Goal
Define a maintainable policy for pruning old market-data cache records.

## Scope
- Decide whether old quote records should be retained, aggregated, or deleted.
- Document storage and audit tradeoffs.
- Add a cleanup task or backlog recommendation if implementation is deferred.

## Acceptance Criteria
- Retention policy is documented.
- Database growth risks are understood.
- Follow-up implementation work is identified if cleanup is not included now."
