# 0008 User-Scoped Stock Score Snapshots

## Context

Milestone 8 makes Graham-inspired rule thresholds user configurable.
Stock-level valuation and safety labels depend on those thresholds, so a single
global latest `stock_scores` row can silently show one user's thresholds to
another user.

## Decision

Stock score snapshots created from saved user rules are scoped with `user_id`.
Authenticated portfolio and watchlist views read the latest score snapshot for
the current user. Existing or future system-wide snapshots can keep `user_id`
null, but user rule recalculation writes user-scoped rows.

## Product Plan Consistency

This is consistent with `docs/product-plan.md`: deterministic scoring remains
the source of truth, user rules are user-specific, and score metadata preserves
the thresholds used for explanation.

## Consequences

Rule saves can recalculate stock labels without cross-user leakage. Legacy
global stock scores are preserved for compatibility, but authenticated
user-facing views prefer the user's own rule-based snapshots.
