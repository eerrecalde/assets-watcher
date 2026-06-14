# 0004 Financial Safety Scoring Rules

Date: 2026-06-14

## Status

Accepted

## Context

The product plan defines financial safety inputs as debt/equity, current ratio, free cash flow, total debt, and total equity.

The default safety thresholds are:

- Current ratio at least `1.5`
- Debt/equity at most `1.0`
- Free cash flow greater than `0`

The plan does not define a numeric weighting formula, bucket names, or how total debt and total equity should affect the safety layer when debt/equity is missing.

## Decision

The V1 financial safety layer scores available cached safety rules only.

The primary safety checks are:

- Current ratio greater than or equal to the configured minimum current ratio
- Debt/equity less than or equal to the configured maximum debt/equity
- Free cash flow greater than zero

Free cash flow is handled explicitly:

- Positive free cash flow passes
- Zero free cash flow is a warning, not missing data
- Negative free cash flow fails
- Missing free cash flow is unavailable and excluded from the score

When cached debt/equity is missing and cached total debt plus positive total equity are available, debt/equity is derived as `total_debt / total_equity`. Total debt of zero is preserved as a real value and can derive debt/equity of zero. Total equity must be positive to derive debt/equity.

Total debt and total equity are also reported as rule-level checks. Total debt is a cached balance-sheet context check where zero and positive values pass, negative values warn, and missing values are unavailable. Total equity must be positive; zero or negative total equity fails while remaining distinct from missing data.

The safety score is the rounded average of decisive rule weights:

- pass: 100
- warning: 50
- fail: 0

Unavailable inputs are reported as `unavailable` rule checks and excluded from the numeric score instead of being treated as failures or zero values. At least one primary safety check must be decisive before the layer returns a scored result.

## Consequences

This keeps safety scoring deterministic, transparent, and aligned with the current cached fundamentals schema.

Stocks with partial cached safety data can still receive a safety score from available primary metrics, while explanation data shows which rules were unavailable.

The combined stock label layer can consume the safety score, status, bucket, and rule-level explanations without inferring why missing safety metrics were ignored.

Future work may calibrate weights, add sector-specific safety thresholds, or separate balance-sheet context from the numeric safety score after more scoring snapshots exist.
