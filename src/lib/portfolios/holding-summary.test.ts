import { describe, expect, it } from "vitest";

import { calculateHoldingValue } from "./totals";
import { buildUserHoldingSummary } from "./holding-summary";

describe("buildUserHoldingSummary", () => {
  it("returns a neutral not-owned state when no holding exists", () => {
    expect(
      buildUserHoldingSummary({
        cashAmount: "1000",
        holding: null,
        portfolioHoldings: [],
      }),
    ).toEqual({ status: "not-owned" });
  });

  it("summarizes an owned holding with cached latest price data", () => {
    const portfolioHoldings = [
      calculateHoldingValue({
        averageCost: "100",
        latestClose: "120",
        quantity: "10",
      }),
      calculateHoldingValue({
        averageCost: "50",
        latestClose: "70",
        quantity: "5",
      }),
    ];

    expect(
      buildUserHoldingSummary({
        cashAmount: "300",
        holding: {
          averageCost: "100",
          currency: "USD",
          latestClose: "120",
          latestPriceDate: "2026-06-05",
          quantity: "10",
        },
        portfolioHoldings,
      }),
    ).toMatchObject({
      averageCost: 100,
      costBasis: 1000,
      currency: "USD",
      hasSufficientPriceData: true,
      latestClose: 120,
      latestPriceDate: "2026-06-05",
      marketValue: 1200,
      portfolioPercentage: 64.86486486486487,
      portfolioValue: 1200,
      positionAllocation: {
        cashAmount: 300,
        cashStatus: "included",
        denominatorValue: 1850,
        includesCash: true,
        invalidMarketValueCount: 0,
        missingMarketValueCount: 0,
        numeratorMarketValue: 1200,
        percentage: 64.86486486486487,
        pricedHoldingCount: 2,
        reason: "calculated_from_cached_market_values_and_cash",
        status: "calculated",
        totalHoldingCount: 2,
      },
      quantity: 10,
      status: "owned",
      unrealizedGain: 200,
    });
  });

  it("does not calculate market value, unrealised gain, or allocation without a latest price", () => {
    expect(
      buildUserHoldingSummary({
        cashAmount: "1000",
        holding: {
          averageCost: "100",
          currency: "USD",
          latestClose: null,
          quantity: "10",
        },
        portfolioHoldings: [],
      }),
    ).toMatchObject({
      hasSufficientPriceData: false,
      latestClose: null,
      marketValue: null,
      positionAllocation: {
        reason: "missing_cached_market_value",
        status: "insufficient-data",
      },
      portfolioPercentage: null,
      status: "owned",
      unrealizedGain: null,
    });
  });

  it("does not calculate dependent values from an unusable latest price", () => {
    expect(
      buildUserHoldingSummary({
        cashAmount: "1000",
        holding: {
          averageCost: "100",
          currency: "USD",
          latestClose: "not-a-number",
          latestPriceDate: "2026-06-05",
          quantity: "10",
        },
        portfolioHoldings: [],
      }),
    ).toMatchObject({
      hasSufficientPriceData: false,
      latestClose: null,
      latestPriceDate: "2026-06-05",
      marketValue: null,
      portfolioPercentage: null,
      status: "owned",
      unrealizedGain: null,
    });
  });
});
