import { describe, expect, it } from "vitest";

import { buildUserHoldingSummary } from "./holding-summary";

describe("buildUserHoldingSummary", () => {
  it("returns a neutral not-owned state when no holding exists", () => {
    expect(
      buildUserHoldingSummary({
        holding: null,
        totalPortfolioValue: "1000",
      }),
    ).toEqual({ status: "not-owned" });
  });

  it("summarizes an owned holding with cached latest price data", () => {
    expect(
      buildUserHoldingSummary({
        holding: {
          averageCost: "100",
          currency: "USD",
          latestClose: "120",
          latestPriceDate: "2026-06-05",
          quantity: "10",
        },
        totalPortfolioValue: "1500",
      }),
    ).toEqual({
      averageCost: 100,
      costBasis: 1000,
      currency: "USD",
      hasSufficientPriceData: true,
      latestClose: 120,
      latestPriceDate: "2026-06-05",
      marketValue: 1200,
      portfolioPercentage: 80,
      portfolioValue: 1200,
      quantity: 10,
      status: "owned",
      unrealizedGain: 200,
    });
  });

  it("does not calculate market value, unrealised gain, or allocation without a latest price", () => {
    expect(
      buildUserHoldingSummary({
        holding: {
          averageCost: "100",
          currency: "USD",
          latestClose: null,
          quantity: "10",
        },
        totalPortfolioValue: "1000",
      }),
    ).toMatchObject({
      hasSufficientPriceData: false,
      latestClose: null,
      marketValue: null,
      portfolioPercentage: null,
      status: "owned",
      unrealizedGain: null,
    });
  });
});
