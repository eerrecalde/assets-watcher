import { describe, expect, it } from "vitest";

import { scoreStock } from "./stock";
import type {
  ScoringDataPoint,
  StockMarketContextScoringInput,
  StockQualityScoringInput,
  StockSafetyScoringInput,
  StockScoringInput,
  StockValuationScoringInput,
} from "./types";

const SCORE_DATE = new Date("2026-06-14T12:00:00.000Z");

const cachedFundamental = (value: number): ScoringDataPoint => ({
  availability: "available",
  asOfDate: "2026-03-31",
  freshness: "unknown",
  source: "cached_fundamentals",
  value,
});

const cachedPrice = (
  value: number,
  freshness: ScoringDataPoint["freshness"] = "fresh",
): ScoringDataPoint => ({
  availability: "available",
  asOfDate: "2026-06-12",
  freshness,
  source: "cached_price",
  value,
});

const derivedMetric = (
  value: number,
  freshness: ScoringDataPoint["freshness"] = "fresh",
): ScoringDataPoint => ({
  availability: "available",
  asOfDate: "2026-06-12",
  freshness,
  source: "derived_metric",
  value,
});

const missingFundamental = (reason: string): ScoringDataPoint => ({
  availability: "missing",
  asOfDate: null,
  freshness: "unknown",
  reason,
  source: "cached_fundamentals",
  value: null,
});

const missingDerivedMetric = (reason: string): ScoringDataPoint => ({
  availability: "insufficient",
  asOfDate: null,
  freshness: "unknown",
  reason,
  source: "derived_metric",
  value: null,
});

function stockInput(
  overrides: Partial<StockScoringInput> = {},
): StockScoringInput {
  return {
    marketContext: marketContextInput(),
    quality: qualityInput(),
    safety: safetyInput(),
    symbol: "aapl",
    valuation: valuationInput(),
    ...overrides,
  };
}

function valuationInput(
  overrides: Partial<StockValuationScoringInput> = {},
): StockValuationScoringInput {
  return {
    bookValuePerShare: cachedFundamental(20),
    currentPrice: cachedPrice(75),
    eps: cachedFundamental(5),
    grahamNumber: derivedMetric(100),
    marginOfSafetyPercent: derivedMetric(25),
    pbRatio: cachedFundamental(3),
    peRatio: cachedFundamental(20),
    ...overrides,
  };
}

function qualityInput(
  overrides: Partial<StockQualityScoringInput> = {},
): StockQualityScoringInput {
  return {
    dividendConsistency: null,
    earningsStability: missingDerivedMetric(
      "Cached fundamentals do not include multi-period earnings history.",
    ),
    eps: cachedFundamental(4.25),
    freeCashFlow: cachedFundamental(3_500_000_000),
    netIncome: cachedFundamental(4_000_000_000),
    revenue: cachedFundamental(25_000_000_000),
    revenueGrowth: missingDerivedMetric(
      "Cached fundamentals do not include multi-period revenue history.",
    ),
    ...overrides,
  };
}

function safetyInput(
  overrides: Partial<StockSafetyScoringInput> = {},
): StockSafetyScoringInput {
  return {
    currentRatio: cachedFundamental(2.1),
    debtToEquity: cachedFundamental(0.42),
    freeCashFlow: cachedFundamental(3_500_000_000),
    totalDebt: cachedFundamental(5_000_000_000),
    totalEquity: cachedFundamental(12_000_000_000),
    ...overrides,
  };
}

function marketContextInput(
  overrides: Partial<StockMarketContextScoringInput> = {},
): StockMarketContextScoringInput {
  return {
    fiftyDayMovingAverage: derivedMetric(150),
    fiftyTwoWeekHigh: derivedMetric(180),
    fiftyTwoWeekLow: derivedMetric(90),
    oneMonthMovementPercent: derivedMetric(4),
    oneWeekMovementPercent: derivedMetric(1),
    oneYearMovementPercent: derivedMetric(18),
    sixMonthMovementPercent: derivedMetric(9),
    twoHundredDayMovingAverage: derivedMetric(140),
    ...overrides,
  };
}

describe("scoreStock", () => {
  it("produces Attractive when valuation, quality, safety, and market context all pass", () => {
    const result = scoreStock(stockInput(), { currentDate: SCORE_DATE });

    expect(result).toMatchObject({
      label: "Attractive",
      scoredAt: "2026-06-14T12:00:00.000Z",
      symbol: "AAPL",
    });
    expect(result.explanation.dominantRules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          layerId: "valuation",
          ruleId: "valuation.pe_ratio",
          status: "pass",
        }),
      ]),
    );
  });

  it("produces Reasonable when valuation is near the Graham Number", () => {
    const result = scoreStock(
      stockInput({
        valuation: valuationInput({
          currentPrice: cachedPrice(90),
          grahamNumber: derivedMetric(100),
          pbRatio: cachedFundamental(2),
          peRatio: cachedFundamental(18),
        }),
      }),
      { currentDate: SCORE_DATE },
    );

    expect(result.label).toBe("Reasonable");
    expect(result.layers.valuation.score).toBe(83);
    expect(result.explanation.summary).not.toMatch(
      /\b(buy|sell|guaranteed|forecast)\b/i,
    );
  });

  it("produces Watch for mixed valuation or incomplete critical support layers", () => {
    const mixedValuationResult = scoreStock(
      stockInput({
        valuation: valuationInput({
          currentPrice: cachedPrice(90),
          grahamNumber: derivedMetric(100),
          pbRatio: cachedFundamental(4),
          peRatio: cachedFundamental(18),
        }),
      }),
      { currentDate: SCORE_DATE },
    );
    const incompleteSafetyResult = scoreStock(
      stockInput({
        safety: safetyInput({
          currentRatio: missingFundamental("No current ratio is cached."),
          debtToEquity: missingFundamental("No debt/equity is cached."),
          freeCashFlow: missingFundamental("No free cash flow is cached."),
          totalDebt: missingFundamental("No total debt is cached."),
          totalEquity: missingFundamental("No total equity is cached."),
        }),
      }),
      { currentDate: SCORE_DATE },
    );

    expect(mixedValuationResult.label).toBe("Watch");
    expect(incompleteSafetyResult.label).toBe("Watch");
    expect(incompleteSafetyResult.explanation.dominantRules).toContainEqual(
      expect.objectContaining({
        layerId: "safety",
        status: "unavailable",
      }),
    );
  });

  it("produces Expensive when valuation fails without weak quality or safety layers", () => {
    const result = scoreStock(
      stockInput({
        valuation: valuationInput({
          currentPrice: cachedPrice(125),
          grahamNumber: derivedMetric(100),
          pbRatio: cachedFundamental(2),
          peRatio: cachedFundamental(18),
        }),
      }),
      { currentDate: SCORE_DATE },
    );

    expect(result.label).toBe("Expensive");
    expect(result.explanation.dominantRules).toContainEqual(
      expect.objectContaining({
        layerId: "valuation",
        ruleId: "valuation.margin_of_safety",
        status: "fail",
      }),
    );
  });

  it("produces Avoid / Review when expensive valuation combines with weak fundamentals", () => {
    const result = scoreStock(
      stockInput({
        quality: qualityInput({
          eps: cachedFundamental(-1.2),
          freeCashFlow: cachedFundamental(-750_000_000),
          netIncome: cachedFundamental(-500_000_000),
        }),
        valuation: valuationInput({
          currentPrice: cachedPrice(125),
          grahamNumber: derivedMetric(100),
        }),
      }),
      { currentDate: SCORE_DATE },
    );

    expect(result.label).toBe("Avoid / Review");
    expect(result.explanation.dominantRules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          layerId: "valuation",
          status: "fail",
        }),
        expect.objectContaining({
          layerId: "quality",
          status: "fail",
        }),
      ]),
    );
  });

  it("produces Insufficient Data when valuation is not available", () => {
    const result = scoreStock(
      stockInput({
        valuation: valuationInput({
          currentPrice: missingFundamental("No latest cached close is available."),
          grahamNumber: missingDerivedMetric("No Graham Number is available."),
          pbRatio: missingFundamental("No P/B ratio is cached."),
          peRatio: missingFundamental("No P/E ratio is cached."),
        }),
      }),
      { currentDate: SCORE_DATE },
    );

    expect(result.label).toBe("Insufficient Data");
    expect(result.explanation.summary).toContain("Missing layer coverage");
    expect(result.explanation.dominantRules.every(({ status }) => {
      return status === "unavailable" || status === "insufficient_data";
    })).toBe(true);
  });

  it("caps an otherwise Attractive label at Reasonable when market context is stale", () => {
    const result = scoreStock(
      stockInput({
        marketContext: marketContextInput({
          fiftyDayMovingAverage: derivedMetric(150, "stale"),
          fiftyTwoWeekHigh: derivedMetric(180, "stale"),
          fiftyTwoWeekLow: derivedMetric(90, "stale"),
          oneMonthMovementPercent: derivedMetric(4, "stale"),
          oneWeekMovementPercent: derivedMetric(1, "stale"),
          oneYearMovementPercent: derivedMetric(18, "stale"),
          sixMonthMovementPercent: derivedMetric(9, "stale"),
          twoHundredDayMovingAverage: derivedMetric(140, "stale"),
        }),
      }),
      { currentDate: SCORE_DATE },
    );

    expect(result.label).toBe("Reasonable");
    expect(result.layers.market_context.status).toBe("scored");
    expect(result.layers.market_context.explanation.summary).toContain(
      "historical context",
    );
  });
});
