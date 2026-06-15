# 0007 Portfolio Fit V1 Thresholds

## Status

Accepted for V1.

## Context

Milestone 7 adds deterministic portfolio-fit labels from position, sector, and cash context. The product plan defines maximum single-stock allocation and maximum sector allocation defaults, but it does not define a default cash threshold before Milestone 8 user rules make thresholds configurable.

The product plan section 10.2 lists portfolio-fit labels but does not include `Insufficient Data`. Issue #107 explicitly requires insufficient-data states when market, holding, cash, or sector inputs are unavailable.

## Decision

Portfolio-fit scoring uses the existing default allocation thresholds:

- Maximum single-stock allocation: `10%`
- Maximum sector allocation: `30%`

V1 adds a default minimum cash allocation threshold of `5%` so cash warnings can be generated deterministically until user rules are configurable.

The `Underweight` review point is derived as half of the maximum single-stock allocation threshold, currently `5%`, rather than adding a separate configurable threshold before Milestone 8.

Portfolio-fit results use `Insufficient Data` when required position, sector, or cash allocation inputs cannot be classified. This preserves the issue's acceptance criteria while keeping the normal classified labels aligned with the product plan's portfolio-fit language.

## Consequences

Cash warnings are deterministic and explainable, but the `5%` threshold is a V1 product assumption rather than a product-plan default.

Underweight classification remains tied to the existing maximum single-stock allocation rule, so Milestone 8 can replace it with a user-configurable rule without changing the result shape.

Insufficient portfolio context is explicit and does not fall through to a softer label such as `Review Position`.

## Revisit When

- Milestone 8 introduces user-configurable portfolio rules.
- Persisting portfolio score snapshots in the database.
- Adding cash-target ranges instead of a single minimum cash threshold.
