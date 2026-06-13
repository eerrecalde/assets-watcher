# 0003 Business Quality Scoring Rules

Date: 2026-06-13

## Status

Accepted

## Context

The product plan defines business quality inputs as positive EPS, positive net income, positive free cash flow, revenue stability/growth, earnings stability, and optional dividend consistency.

The current cached fundamentals schema stores single-period EPS, revenue, net income, and free cash flow. It does not store enough multi-period history to calculate revenue growth, revenue stability, earnings stability, or dividend consistency deterministically.

## Decision

The V1 business quality layer scores available cached quality rules only.

The profitability checks are:

- EPS greater than zero
- Net income greater than zero
- Free cash flow greater than zero

Revenue is included as an availability check when present in cached fundamentals. Revenue availability can contribute to the score only when at least one profitability rule is also available. A stock with revenue but no cached EPS, net income, or free cash flow remains `insufficient_data` for business quality.

Unavailable cached inputs are reported as `unavailable` rule checks and excluded from the numeric score instead of being treated as failures or zero values.

Revenue growth and earnings stability are represented as explicit unavailable checks until the cached data model supports enough history. Dividend consistency is optional and represented as not applicable when no deterministic input is supplied.

The quality score is the rounded average of decisive rule weights:

- pass: 100
- warning: 50
- fail: 0

## Consequences

This keeps quality scoring deterministic, transparent, and aligned with the current cache.

Stocks with partial cached profitability data can still receive a quality score from available metrics, while explanation data shows which quality rules were unavailable.

The combined stock label layer can consume the quality score, status, bucket, and rule-level explanations without needing to infer why missing quality metrics were ignored.

Future work may add multi-period fundamentals and convert revenue growth, earnings stability, and dividend consistency into richer deterministic checks.
