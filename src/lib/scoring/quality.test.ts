import { describe, expect, it } from "vitest";

import type { ScoringDataPoint, StockQualityScoringInput } from "./types";
import { scoreQualityLayer } from "./quality";

const cachedFundamental = (value: number): ScoringDataPoint => ({
  availability: "available",
  asOfDate: "2026-03-31",
  freshness: "unknown",
  source: "cached_fundamentals",
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

const unavailableHistory = (reason: string): ScoringDataPoint => ({
  availability: "insufficient",
  asOfDate: null,
  freshness: "unknown",
  reason,
  source: "derived_metric",
  value: null,
});

function qualityInput(
  overrides: Partial<StockQualityScoringInput> = {},
): StockQualityScoringInput {
  return {
    dividendConsistency: null,
    earningsStability: unavailableHistory(
      "Cached fundamentals do not include multi-period earnings history.",
    ),
    eps: cachedFundamental(4.25),
    freeCashFlow: cachedFundamental(3_500_000_000),
    netIncome: cachedFundamental(4_000_000_000),
    revenue: cachedFundamental(25_000_000_000),
    revenueGrowth: unavailableHistory(
      "Cached fundamentals do not include multi-period revenue history.",
    ),
    ...overrides,
  };
}

describe("scoreQualityLayer", () => {
  it("scores profitable cached fundamentals independently from unavailable history inputs", () => {
    const result = scoreQualityLayer(qualityInput());

    expect(result).toMatchObject({
      bucket: "strong",
      score: 100,
      status: "scored",
    });
    expect(result.ruleChecks.map(({ id, status }) => ({ id, status }))).toEqual(
      [
        { id: "quality.positive_eps", status: "pass" },
        { id: "quality.positive_net_income", status: "pass" },
        { id: "quality.positive_free_cash_flow", status: "pass" },
        { id: "quality.revenue_available", status: "pass" },
        { id: "quality.revenue_growth", status: "unavailable" },
        { id: "quality.earnings_stability", status: "unavailable" },
        { id: "quality.dividend_consistency", status: "not_applicable" },
      ],
    );
  });

  it("scores loss-making cached fundamentals without using neutral language as investment advice", () => {
    const result = scoreQualityLayer(
      qualityInput({
        eps: cachedFundamental(-1.2),
        freeCashFlow: cachedFundamental(-750_000_000),
        netIncome: cachedFundamental(-500_000_000),
      }),
    );

    expect(result).toMatchObject({
      bucket: "weak",
      score: 25,
      status: "scored",
    });
    expect(result.ruleChecks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "quality.positive_eps",
          status: "fail",
        }),
        expect.objectContaining({
          id: "quality.positive_net_income",
          status: "fail",
        }),
        expect.objectContaining({
          id: "quality.positive_free_cash_flow",
          status: "fail",
        }),
      ]),
    );
    expect(result.explanation.summary).not.toContain("bad company");
  });

  it("scores mixed cached fundamentals while preserving unavailable metrics", () => {
    const result = scoreQualityLayer(
      qualityInput({
        freeCashFlow: missingFundamental("No free cash flow is cached."),
        netIncome: cachedFundamental(-100_000_000),
      }),
    );

    expect(result).toMatchObject({
      bucket: "mixed",
      score: 67,
      status: "scored",
    });
    expect(result.ruleChecks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "quality.positive_eps",
          status: "pass",
        }),
        expect.objectContaining({
          id: "quality.positive_net_income",
          status: "fail",
        }),
        expect.objectContaining({
          id: "quality.positive_free_cash_flow",
          measuredValue: expect.objectContaining({ value: null }),
          status: "unavailable",
        }),
      ]),
    );
  });

  it("returns insufficient data when profitability fundamentals are unavailable", () => {
    const result = scoreQualityLayer(
      qualityInput({
        eps: missingFundamental("No EPS is cached."),
        freeCashFlow: missingFundamental("No free cash flow is cached."),
        netIncome: missingFundamental("No net income is cached."),
      }),
    );

    expect(result).toMatchObject({
      bucket: "insufficient_data",
      score: null,
      status: "insufficient_data",
    });
    expect(result.ruleChecks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "quality.positive_eps",
          measuredValue: expect.objectContaining({ value: null }),
          status: "unavailable",
        }),
        expect.objectContaining({
          id: "quality.positive_net_income",
          measuredValue: expect.objectContaining({ value: null }),
          status: "unavailable",
        }),
        expect.objectContaining({
          id: "quality.positive_free_cash_flow",
          measuredValue: expect.objectContaining({ value: null }),
          status: "unavailable",
        }),
      ]),
    );
  });

  it("does not convert missing revenue to zero or an automatic failure", () => {
    const result = scoreQualityLayer(
      qualityInput({
        revenue: missingFundamental("No revenue is cached."),
      }),
    );

    expect(result).toMatchObject({
      bucket: "strong",
      score: 100,
      status: "scored",
    });
    expect(result.ruleChecks).toContainEqual(
      expect.objectContaining({
        id: "quality.revenue_available",
        measuredValue: expect.objectContaining({ value: null }),
        status: "unavailable",
      }),
    );
  });
});
