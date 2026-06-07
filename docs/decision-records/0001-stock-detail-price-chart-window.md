# 0001 Stock Detail Price Chart Window

## Status

Accepted for V1.

## Context

The product plan says the stock detail page should show a price chart, recent price movement, and 52-week high/low if available.

The market context scoring inputs later include 1-week, 1-month, 6-month, and 1-year movement, plus 52-week high/low, 50-day moving average, and 200-day moving average.

The data refresh strategy says prices refresh daily and the app should avoid live price fetches on every page load. Cached market data may therefore be stale relative to the current calendar date.

## Decision

The V1 stock detail price chart will show the latest cached trailing 52-week window of daily close prices.

The window is anchored to the latest cached `price_date`, not the current calendar date.

The chart uses only locally cached historical price rows and does not trigger live provider fetches during page rendering.

If fewer than two usable cached close prices are available, the chart area shows an insufficient-data state instead of implying a trend.

## Consequences

This gives the stock detail page a clear default chart window that matches the app's mid/long-term investing context and planned 1-year / 52-week market-context inputs.

It keeps chart rendering deterministic and cache-backed, which is consistent with the cost-control and refresh strategy.

It does not add chart range controls yet. Those can be introduced later when implementing recent movement views or broader market-context indicators.

## Revisit When

- Adding user-selectable chart ranges.
- Implementing 1-week, 1-month, 6-month, or 1-year movement displays.
- Adding 50-day or 200-day moving averages.
- Changing the market data refresh cadence or cache retention policy.
