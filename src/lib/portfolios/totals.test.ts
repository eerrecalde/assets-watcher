import { describe, expect, it } from "vitest";

import {
  calculateCashAllocation,
  calculateHoldingValue,
  calculatePositionAllocation,
  calculateSectorAllocations,
  calculatePortfolioTotals,
  toFiniteNumber,
  UNKNOWN_SECTOR_NAME,
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

describe("calculatePositionAllocation", () => {
  it("calculates allocation from cached market value and cash denominator", () => {
    const holdings = [
      calculateHoldingValue({
        averageCost: "100",
        latestClose: "120",
        quantity: "10",
      }),
      calculateHoldingValue({
        averageCost: "20",
        latestClose: "30",
        quantity: "5",
      }),
    ];

    expect(
      calculatePositionAllocation({
        cashAmountInput: "150",
        holding: holdings[0],
        holdings,
      }),
    ).toEqual({
      cashAmount: 150,
      cashStatus: "included",
      denominatorValue: 1500,
      includesCash: true,
      invalidMarketValueCount: 0,
      missingMarketValueCount: 0,
      numeratorMarketValue: 1200,
      percentage: 80,
      pricedHoldingCount: 2,
      reason: "calculated_from_cached_market_values_and_cash",
      status: "calculated",
      totalHoldingCount: 2,
    });
  });

  it("marks calculated allocations as partial when another holding is missing a cached price", () => {
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

    expect(
      calculatePositionAllocation({
        cashAmountInput: "300",
        holding: holdings[0],
        holdings,
      }),
    ).toMatchObject({
      denominatorValue: 1500,
      missingMarketValueCount: 1,
      percentage: 80,
      reason: "calculated_from_partial_cached_market_values_and_cash",
      status: "partial-market-data",
    });
  });

  it("does not calculate allocation for a holding without cached market value", () => {
    const holdings = [
      calculateHoldingValue({
        averageCost: "100",
        latestClose: null,
        quantity: "10",
      }),
    ];

    expect(
      calculatePositionAllocation({
        cashAmountInput: "1000",
        holding: holdings[0],
        holdings,
      }),
    ).toMatchObject({
      denominatorValue: 1000,
      numeratorMarketValue: null,
      percentage: null,
      reason: "missing_cached_market_value",
      status: "insufficient-data",
    });
  });

  it("is stable for empty and all-cash portfolios", () => {
    const holding = calculateHoldingValue({
      averageCost: "10",
      latestClose: "0",
      quantity: "1",
    });

    expect(
      calculatePositionAllocation({
        cashAmountInput: "500",
        holding,
        holdings: [],
      }),
    ).toMatchObject({
      denominatorValue: 500,
      percentage: null,
      reason: "non_positive_holding_market_value",
      status: "insufficient-data",
      totalHoldingCount: 0,
    });
  });

  it("does not let zero or negative market values produce misleading percentages", () => {
    const holdings = [
      calculateHoldingValue({
        averageCost: "100",
        latestClose: "-10",
        quantity: "2",
      }),
      calculateHoldingValue({
        averageCost: "50",
        latestClose: "75",
        quantity: "2",
      }),
    ];

    expect(
      calculatePositionAllocation({
        cashAmountInput: "-25",
        holding: holdings[1],
        holdings,
      }),
    ).toMatchObject({
      cashStatus: "invalid",
      denominatorValue: 150,
      invalidMarketValueCount: 1,
      percentage: 100,
      reason: "invalid_portfolio_inputs",
      status: "partial-market-data",
    });
  });
});

describe("calculateSectorAllocations", () => {
  it("calculates sector percentages from cached market values and cash denominator", () => {
    const holdings = [
      {
        ...calculateHoldingValue({
          averageCost: "100",
          latestClose: "120",
          quantity: "10",
        }),
        sector: "Technology",
      },
      {
        ...calculateHoldingValue({
          averageCost: "20",
          latestClose: "30",
          quantity: "5",
        }),
        sector: "Consumer Defensive",
      },
      {
        ...calculateHoldingValue({
          averageCost: "10",
          latestClose: "15",
          quantity: "10",
        }),
        sector: "Technology",
      },
    ];

    expect(
      calculateSectorAllocations({
        cashAmountInput: "300",
        holdings,
      }),
    ).toEqual([
      {
        cashAmount: 300,
        cashStatus: "included",
        denominatorValue: 1800,
        holdingCount: 2,
        includesCash: true,
        invalidMarketValueCount: 0,
        isUnknownSector: false,
        missingMarketValueCount: 0,
        numeratorMarketValue: 1350,
        percentage: 75,
        pricedHoldingCount: 2,
        reason: "calculated_from_cached_market_values_and_cash",
        sector: "Technology",
        status: "calculated",
        totalHoldingCount: 3,
      },
      {
        cashAmount: 300,
        cashStatus: "included",
        denominatorValue: 1800,
        holdingCount: 1,
        includesCash: true,
        invalidMarketValueCount: 0,
        isUnknownSector: false,
        missingMarketValueCount: 0,
        numeratorMarketValue: 150,
        percentage: 8.333333333333332,
        pricedHoldingCount: 1,
        reason: "calculated_from_cached_market_values_and_cash",
        sector: "Consumer Defensive",
        status: "calculated",
        totalHoldingCount: 3,
      },
    ]);
  });

  it("groups missing or blank sector metadata into an unknown bucket", () => {
    const holdings = [
      {
        ...calculateHoldingValue({
          averageCost: "100",
          latestClose: "125",
          quantity: "2",
        }),
        sector: null,
      },
      {
        ...calculateHoldingValue({
          averageCost: "50",
          latestClose: "50",
          quantity: "3",
        }),
        sector: "   ",
      },
    ];

    expect(
      calculateSectorAllocations({
        cashAmountInput: "100",
        holdings,
      }),
    ).toEqual([
      {
        cashAmount: 100,
        cashStatus: "included",
        denominatorValue: 500,
        holdingCount: 2,
        includesCash: true,
        invalidMarketValueCount: 0,
        isUnknownSector: true,
        missingMarketValueCount: 0,
        numeratorMarketValue: 400,
        percentage: 80,
        pricedHoldingCount: 2,
        reason: "calculated_from_cached_market_values_and_cash",
        sector: UNKNOWN_SECTOR_NAME,
        status: "calculated",
        totalHoldingCount: 2,
      },
    ]);
  });

  it("marks sector percentages as partial when another holding is missing a cached price", () => {
    const holdings = [
      {
        ...calculateHoldingValue({
          averageCost: "100",
          latestClose: "120",
          quantity: "10",
        }),
        sector: "Technology",
      },
      {
        ...calculateHoldingValue({
          averageCost: "20",
          latestClose: null,
          quantity: "5",
        }),
        sector: "Healthcare",
      },
    ];

    expect(
      calculateSectorAllocations({
        cashAmountInput: "300",
        holdings,
      }),
    ).toEqual([
      expect.objectContaining({
        denominatorValue: 1500,
        missingMarketValueCount: 0,
        percentage: 80,
        reason: "calculated_from_partial_cached_market_values_and_cash",
        sector: "Technology",
        status: "partial-market-data",
      }),
      expect.objectContaining({
        denominatorValue: 1500,
        missingMarketValueCount: 1,
        numeratorMarketValue: 0,
        percentage: null,
        reason: "missing_cached_market_value",
        sector: "Healthcare",
        status: "insufficient-data",
      }),
    ]);
  });

  it("does not let zero or negative market values produce misleading sector percentages", () => {
    const holdings = [
      {
        ...calculateHoldingValue({
          averageCost: "100",
          latestClose: "-10",
          quantity: "2",
        }),
        sector: "Technology",
      },
      {
        ...calculateHoldingValue({
          averageCost: "50",
          latestClose: "75",
          quantity: "2",
        }),
        sector: "Healthcare",
      },
    ];

    expect(
      calculateSectorAllocations({
        cashAmountInput: "-25",
        holdings,
      }),
    ).toEqual([
      expect.objectContaining({
        cashStatus: "invalid",
        denominatorValue: 150,
        percentage: 100,
        reason: "invalid_portfolio_inputs",
        sector: "Healthcare",
        status: "partial-market-data",
      }),
      expect.objectContaining({
        invalidMarketValueCount: 1,
        numeratorMarketValue: 0,
        percentage: null,
        reason: "non_positive_sector_market_value",
        sector: "Technology",
        status: "insufficient-data",
      }),
    ]);
  });
});

describe("calculateCashAllocation", () => {
  it("calculates cash percentage from stored cash and cached market values", () => {
    const holdings = [
      calculateHoldingValue({
        averageCost: "100",
        latestClose: "120",
        quantity: "10",
      }),
      calculateHoldingValue({
        averageCost: "20",
        latestClose: "30",
        quantity: "5",
      }),
    ];

    expect(
      calculateCashAllocation({
        cashAmountInput: "150",
        holdings,
      }),
    ).toEqual({
      cashAmount: 150,
      cashStatus: "included",
      denominatorValue: 1500,
      includesCash: true,
      invalidMarketValueCount: 0,
      missingMarketValueCount: 0,
      numeratorCashAmount: 150,
      percentage: 10,
      pricedHoldingCount: 2,
      reason: "calculated_from_cached_market_values_and_cash",
      status: "calculated",
      totalHoldingCount: 2,
    });
  });

  it("returns zero percent for no-cash portfolios with priced holdings", () => {
    const holdings = [
      calculateHoldingValue({
        averageCost: "50",
        latestClose: "75",
        quantity: "2",
      }),
    ];

    expect(
      calculateCashAllocation({
        cashAmountInput: "0",
        holdings,
      }),
    ).toMatchObject({
      cashStatus: "zero",
      denominatorValue: 150,
      percentage: 0,
      reason: "calculated_from_cached_market_values_and_cash",
      status: "calculated",
    });
  });

  it("returns one hundred percent for all-cash portfolios", () => {
    expect(
      calculateCashAllocation({
        cashAmountInput: "500",
        holdings: [],
      }),
    ).toMatchObject({
      cashStatus: "included",
      denominatorValue: 500,
      percentage: 100,
      reason: "calculated_from_cached_market_values_and_cash",
      status: "calculated",
      totalHoldingCount: 0,
    });
  });

  it("marks cash allocation as partial when holdings have missing cached prices", () => {
    const holdings = [
      calculateHoldingValue({
        averageCost: "100",
        latestClose: null,
        quantity: "10",
      }),
    ];

    expect(
      calculateCashAllocation({
        cashAmountInput: "500",
        holdings,
      }),
    ).toMatchObject({
      denominatorValue: 500,
      missingMarketValueCount: 1,
      percentage: 100,
      reason: "calculated_from_partial_cached_market_values_and_cash",
      status: "partial-market-data",
    });
  });

  it("returns insufficient data for empty zero-value portfolios", () => {
    expect(
      calculateCashAllocation({
        cashAmountInput: "0",
        holdings: [],
      }),
    ).toMatchObject({
      cashStatus: "zero",
      denominatorValue: 0,
      percentage: null,
      reason: "non_positive_allocation_denominator",
      status: "insufficient-data",
    });
  });

  it("does not calculate a cash percentage from invalid negative cash", () => {
    const holdings = [
      calculateHoldingValue({
        averageCost: "50",
        latestClose: "75",
        quantity: "2",
      }),
    ];

    expect(
      calculateCashAllocation({
        cashAmountInput: "-25",
        holdings,
      }),
    ).toMatchObject({
      cashStatus: "invalid",
      denominatorValue: 150,
      numeratorCashAmount: null,
      percentage: null,
      reason: "invalid_cash_amount",
      status: "insufficient-data",
    });
  });
});
