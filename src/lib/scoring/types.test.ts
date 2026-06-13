import { describe, expect, it } from "vitest";

import type {
  RuleCheckResult,
  ScoreLayerResult,
  ScoringDataPoint,
  StockScoringInput,
  StockScoringResult,
} from "./types";

const unavailablePrice = {
  availability: "missing",
  asOfDate: null,
  freshness: "unknown",
  reason: "No latest cached close is available.",
  source: "cached_price",
  value: null,
} satisfies ScoringDataPoint;

const partialRuleCheck = {
  explanation: {
    summary: "Current price cannot be compared with the Graham Number yet.",
  },
  id: "valuation.graham_number_margin",
  measuredValue: unavailablePrice,
  status: "insufficient_data",
  threshold: {
    label: "Minimum margin of safety",
    operator: "above_or_equal",
    unit: "percent",
    value: 25,
  },
} satisfies RuleCheckResult;

const insufficientValuationLayer = {
  explanation: {
    summary: "Valuation needs cached price, EPS, and book value per share.",
  },
  id: "valuation",
  ruleChecks: [partialRuleCheck],
  score: null,
  status: "insufficient_data",
} satisfies ScoreLayerResult;

describe("scoring data contracts", () => {
  it("represent missing cached data without pass or fail semantics", () => {
    expect(unavailablePrice).toEqual({
      availability: "missing",
      asOfDate: null,
      freshness: "unknown",
      reason: "No latest cached close is available.",
      source: "cached_price",
      value: null,
    });
    expect(partialRuleCheck.status).toBe("insufficient_data");
  });

  it("allow stock scoring inputs to be built from partial cached data", () => {
    const availableFundamental = {
      availability: "available",
      asOfDate: "2026-03-31",
      freshness: "unknown",
      source: "cached_fundamentals",
      value: 12.5,
    } satisfies ScoringDataPoint;

    const input = {
      marketContext: {
        fiftyDayMovingAverage: unavailablePrice,
        fiftyTwoWeekHigh: unavailablePrice,
        fiftyTwoWeekLow: unavailablePrice,
        oneMonthMovementPercent: unavailablePrice,
        oneWeekMovementPercent: unavailablePrice,
        oneYearMovementPercent: unavailablePrice,
        sixMonthMovementPercent: unavailablePrice,
        twoHundredDayMovingAverage: unavailablePrice,
      },
      quality: {
        dividendConsistency: null,
        earningsStability: unavailablePrice,
        freeCashFlow: availableFundamental,
        netIncome: availableFundamental,
        revenueGrowth: unavailablePrice,
      },
      safety: {
        currentRatio: availableFundamental,
        debtToEquity: unavailablePrice,
        freeCashFlow: availableFundamental,
        totalDebt: unavailablePrice,
        totalEquity: unavailablePrice,
      },
      symbol: "AAPL",
      valuation: {
        bookValuePerShare: availableFundamental,
        currentPrice: unavailablePrice,
        eps: availableFundamental,
        grahamNumber: unavailablePrice,
        marginOfSafetyPercent: unavailablePrice,
        pbRatio: unavailablePrice,
        peRatio: availableFundamental,
      },
    } satisfies StockScoringInput;

    expect(input.valuation.currentPrice.availability).toBe("missing");
    expect(input.quality.freeCashFlow.value).toBe(12.5);
  });

  it("keeps layer scores nullable when the label is insufficient data", () => {
    const result = {
      explanation: {
        caution:
          "This label explains cached deterministic checks and is not financial advice.",
        layerSummaries: {
          market_context: {
            summary: "Market context cannot be scored without price history.",
          },
          quality: {
            summary: "Quality cannot be scored without enough fundamentals.",
          },
          safety: {
            summary: "Safety cannot be scored without balance sheet metrics.",
          },
          valuation: insufficientValuationLayer.explanation,
        },
        summary: "There is not enough cached data to score this stock.",
      },
      label: "Insufficient Data",
      layers: {
        market_context: {
          ...insufficientValuationLayer,
          id: "market_context",
        },
        quality: {
          ...insufficientValuationLayer,
          id: "quality",
        },
        safety: {
          ...insufficientValuationLayer,
          id: "safety",
        },
        valuation: insufficientValuationLayer,
      },
      scoredAt: "2026-06-13T00:00:00.000Z",
      symbol: "AAPL",
    } satisfies StockScoringResult;

    expect(result.label).toBe("Insufficient Data");
    expect(result.layers.valuation.score).toBeNull();
  });
});
