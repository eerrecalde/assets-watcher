# 0005 Combined Stock Label Precedence

## Status

Accepted

## Context

Milestone 6 requires deterministic stock-level labels from valuation, business quality, financial safety, and market context layers. The product plan defines the allowed labels and emphasizes explainable layer results, but it does not define exact precedence when layers disagree.

## Decision

The combined stock label uses valuation as the primary critical layer because Graham-inspired stock labels depend on comparing cached price and valuation fundamentals. Missing valuation data produces `Insufficient Data`.

Business quality and financial safety are also critical support layers. When both are insufficient, the combined label is `Insufficient Data`. When only one is insufficient, the combined label is capped at `Watch` unless valuation is already `Expensive`.

`Avoid / Review` is reserved for severe combinations: expensive valuation with weak quality or weak safety, or simultaneous weak quality and weak safety. Expensive valuation without weak quality or safety remains `Expensive`.

Market context is supporting context, not a portfolio-fit label and not a recommendation layer. Missing, limited, or stale market context can cap an otherwise `Attractive` label at `Reasonable`, but it does not by itself make a stock `Watch`, `Expensive`, or `Avoid / Review`.

## Consequences

The mapping stays deterministic, traceable, and consistent with the product plan's labels while avoiding one unexplained aggregate score. Future score snapshots can store the combined label plus dominant rule reasons without inferring precedence from UI copy.

Portfolio-aware labels remain out of scope for Milestone 6 and should be handled in Milestone 7.
