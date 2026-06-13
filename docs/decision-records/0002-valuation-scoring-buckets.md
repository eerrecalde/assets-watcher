# 0002 Valuation Scoring Buckets

## Status

Accepted for V1.

## Context

The product plan defines Graham-inspired valuation inputs, default thresholds, and soft labels:

- `max_pe = 20`
- `max_pb = 3`
- `min_margin_of_safety = 25%`
- labels such as `Attractive`, `Reasonable`, `Watch`, `Expensive`, and `Insufficient Data`

The plan does not define a numeric weighting formula for combining rule checks into a valuation score.

## Decision

The V1 valuation layer scores only available valuation rules.

Unavailable cached inputs are reported as `unavailable` rule checks and excluded from the numeric score instead of being treated as failures.

Decisive rule checks use these weights:

- `pass`: 100
- `warning`: 50
- `fail`: 0

The valuation score is the rounded average of decisive rule weights.

Bucket mapping is deterministic:

- All decisive checks pass and margin of safety passes: `Attractive`
- Price near the Graham Number with passing P/E and P/B checks: `Reasonable`
- Mixed available checks without a decisive expensive signal: `Watch`
- Negative margin of safety, both P/E and P/B failing, or a low decisive score: `Expensive`
- No decisive valuation checks: `Insufficient Data`

Margin of safety is calculated inside the valuation scorer from latest cached price and Graham Number when both are valid.

## Consequences

This keeps scoring deterministic and transparent without inventing missing data.

It matches the product plan's caution that classic Graham checks can be strict and should be explained as valuation checks, not as a company-quality judgment.

Stocks with partial cached data can still receive a valuation label from available metrics, while explanation data shows which rules were unavailable.

## Revisit When

- Adding editable user scoring rules.
- Combining valuation with quality, safety, market context, or portfolio fit.
- Persisting scoring snapshots into `stock_scores`.
- Introducing historical backtesting or calibration for score weights.
