import { describe, expect, it } from "vitest";

import {
  calculateHoldingValue,
  calculatePortfolioTotals,
  toFiniteNumber,
} from "./totals";

describe("toFiniteNumber", () => {
  it("returns finite numbers from number and string inputs", () => {
    expect(toFiniteNumber(12.5)).toBe(12.5);
    expect(toFiniteNumber("42.75")).toBe(42.75);
    expect(toFiniteNumber(" 8 ")).toBe(8);
  });

  it("returns null for missing or non-finite inputs", () => {
    expect(toFiniteNumber(null)).toBeNull();
    expect(toFiniteNumber(undefined)).toBeNull();
    expect(toFiniteNumber("not-a-number")).toBeNull();
    expect(toFiniteNumber(Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe("calculateHoldingValue", () => {
  it("calculates cost basis, market value, portfolio value, and unrealised gain", () => {
    expect(
      calculateHoldingValue({
        averageCost: "10.25",
        latestClose: "12",
        quantity: "3.5",
      }),
    ).toEqual({
      averageCost: 10.25,
      costBasis: 35.875,
      latestClose: 12,
      marketValue: 42,
      portfolioValue: 42,
      quantity: 3.5,
      unrealizedGain: 6.125,
    });
  });

  it("falls back to cost basis when no cached market price is available", () => {
    expect(
      calculateHoldingValue({
        averageCost: "150",
        latestClose: null,
        quantity: "2",
      }),
    ).toEqual({
      averageCost: 150,
      costBasis: 300,
      latestClose: null,
      marketValue: null,
      portfolioValue: 300,
      quantity: 2,
      unrealizedGain: null,
    });
  });

  it("allows a zero average cost for manually tracked holdings", () => {
    expect(
      calculateHoldingValue({
        averageCost: "0",
        latestClose: "9",
        quantity: "3",
      }),
    ).toEqual({
      averageCost: 0,
      costBasis: 0,
      latestClose: 9,
      marketValue: 27,
      portfolioValue: 27,
      quantity: 3,
      unrealizedGain: 27,
    });
  });
});

describe("calculatePortfolioTotals", () => {
  it("aggregates holdings, cached market values, unrealised gain, and cash", () => {
    const holdings = [
      calculateHoldingValue({
        averageCost: "100",
        latestClose: "120",
        quantity: "10",
      }),
      calculateHoldingValue({
        averageCost: "20",
        latestClose: null,
        quantity: "5",
      }),
    ];

    expect(calculatePortfolioTotals(holdings, "75.5")).toEqual({
      cashAmount: 75.5,
      costBasisTotal: 1100,
      hasCachedMarketValues: true,
      holdingsValueTotal: 1300,
      marketValueTotal: 1200,
      totalPortfolioValue: 1375.5,
      unrealizedTotal: 200,
    });
  });

  it("uses cost basis for holdings totals when no cached prices exist", () => {
    const holdings = [
      calculateHoldingValue({
        averageCost: "15",
        latestClose: undefined,
        quantity: "4",
      }),
      calculateHoldingValue({
        averageCost: "7.5",
        latestClose: null,
        quantity: "2",
      }),
    ];

    expect(calculatePortfolioTotals(holdings, "0")).toEqual({
      cashAmount: 0,
      costBasisTotal: 75,
      hasCachedMarketValues: false,
      holdingsValueTotal: 75,
      marketValueTotal: 0,
      totalPortfolioValue: 75,
      unrealizedTotal: 0,
    });
  });
});
