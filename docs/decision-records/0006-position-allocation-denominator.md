# 0006 Portfolio Allocation Denominator

## Status

Accepted for V1.

## Context

Milestone 7 adds position and sector allocation percentages so portfolio-aware scoring can reason about concentration risk.

The app tracks manual cost basis, cached market prices, and manual cash. Cached prices can be missing or partial because market data refreshes are controlled rather than fetched on every page load.

## Decision

Position allocation uses the holding's positive cached market value as the numerator.

The denominator is the sum of positive cached market values for priced holdings plus non-negative cash.

Manual cost basis is not used as a fallback for position allocation.

If the selected holding has no cached market value, a zero or negative market value, or the denominator is not positive, the allocation result is marked `insufficient-data` and the percentage is `null`.

If the selected holding can be calculated but other holdings are missing cached prices or invalid values, the percentage is still returned against the known cached market value plus cash denominator, and the result is marked `partial-market-data`.

Sector allocation uses the same denominator and market-value rules as position allocation. Each sector's numerator is the sum of positive cached market values for current holdings in that sector.

Holdings with missing, blank, or otherwise unavailable sector metadata are grouped into an explicit `Unknown / Insufficient Data` sector bucket. If a sector bucket has no positive cached market value because all of its holdings are missing prices or have zero or negative market values, that bucket is returned with `insufficient-data` and a `null` percentage instead of a misleading zero allocation.

## Consequences

Allocation percentages stay tied to current cached market value instead of mixing market value and cost basis.

Partial market-data states remain visible to downstream explanations, so portfolio-aware scoring can avoid presenting incomplete allocation context as complete.

All-cash, empty, missing-price, zero-value, and invalid negative-input states produce explicit metadata rather than misleading percentages.

Unknown sector exposure remains visible to users and downstream scoring instead of being dropped from the allocation context.

## Revisit When

- Adding currency conversion for non-USD holdings or cash.
- Persisting portfolio score snapshots that need a stable allocation metadata schema.
- Introducing external price freshness thresholds into portfolio-aware scoring.
