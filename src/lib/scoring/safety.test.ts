import { describe, expect, it } from "vitest";

import { scoreSafetyLayer } from "./safety";
import type { ScoringDataPoint, StockSafetyScoringInput } from "./types";

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

describe("scoreSafetyLayer", () => {
  it("passes default threshold boundaries for current ratio and debt/equity", () => {
    const result = scoreSafetyLayer(
      safetyInput({
        currentRatio: cachedFundamental(1.5),
        debtToEquity: cachedFundamental(1),
      }),
    );

    expect(result).toMatchObject({
      bucket: "strong",
      score: 100,
      status: "scored",
    });
    expect(result.ruleChecks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "safety.current_ratio",
          status: "pass",
          threshold: expect.objectContaining({
            operator: "above_or_equal",
            value: 1.5,
          }),
        }),
        expect.objectContaining({
          id: "safety.debt_to_equity",
          status: "pass",
          threshold: expect.objectContaining({
            operator: "below_or_equal",
            value: 1,
          }),
        }),
      ]),
    );
  });

  it("handles positive, zero, negative, and missing free cash flow explicitly", () => {
    expect(
      scoreSafetyLayer(
        safetyInput({ freeCashFlow: cachedFundamental(1) }),
      ).ruleChecks.find(
        (ruleCheck) => ruleCheck.id === "safety.positive_free_cash_flow",
      ),
    ).toEqual(expect.objectContaining({ status: "pass" }));
    expect(
      scoreSafetyLayer(
        safetyInput({ freeCashFlow: cachedFundamental(0) }),
      ).ruleChecks.find(
        (ruleCheck) => ruleCheck.id === "safety.positive_free_cash_flow",
      ),
    ).toEqual(
      expect.objectContaining({
        measuredValue: expect.objectContaining({ value: 0 }),
        status: "warning",
      }),
    );
    expect(
      scoreSafetyLayer(
        safetyInput({ freeCashFlow: cachedFundamental(-1) }),
      ).ruleChecks.find(
        (ruleCheck) => ruleCheck.id === "safety.positive_free_cash_flow",
      ),
    ).toEqual(expect.objectContaining({ status: "fail" }));
    expect(
      scoreSafetyLayer(
        safetyInput({
          freeCashFlow: missingFundamental("No free cash flow is cached."),
        }),
      ).ruleChecks.find(
        (ruleCheck) => ruleCheck.id === "safety.positive_free_cash_flow",
      ),
    ).toEqual(
      expect.objectContaining({
        measuredValue: expect.objectContaining({ value: null }),
        status: "unavailable",
      }),
    );
  });

  it("returns unavailable rule checks instead of hiding missing safety metrics", () => {
    const result = scoreSafetyLayer(
      safetyInput({
        currentRatio: missingFundamental("No current ratio is cached."),
        debtToEquity: missingFundamental("No debt/equity is cached."),
        freeCashFlow: missingFundamental("No free cash flow is cached."),
        totalDebt: missingFundamental("No total debt is cached."),
        totalEquity: missingFundamental("No total equity is cached."),
      }),
    );

    expect(result).toMatchObject({
      bucket: "insufficient_data",
      score: null,
      status: "insufficient_data",
    });
    expect(result.ruleChecks.map(({ id, status }) => ({ id, status }))).toEqual(
      [
        { id: "safety.current_ratio", status: "unavailable" },
        { id: "safety.debt_to_equity", status: "unavailable" },
        { id: "safety.positive_free_cash_flow", status: "unavailable" },
        { id: "safety.total_debt", status: "unavailable" },
        { id: "safety.total_equity", status: "unavailable" },
      ],
    );
  });

  it("preserves real zero balance-sheet values separately from missing data", () => {
    const result = scoreSafetyLayer(
      safetyInput({
        debtToEquity: missingFundamental("No debt/equity is cached."),
        totalDebt: cachedFundamental(0),
        totalEquity: cachedFundamental(0),
      }),
    );

    expect(result.ruleChecks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "safety.debt_to_equity",
          measuredValue: expect.objectContaining({
            availability: "insufficient",
            value: null,
          }),
          status: "unavailable",
        }),
        expect.objectContaining({
          id: "safety.total_debt",
          measuredValue: expect.objectContaining({ value: 0 }),
          status: "pass",
        }),
        expect.objectContaining({
          id: "safety.total_equity",
          measuredValue: expect.objectContaining({ value: 0 }),
          status: "fail",
        }),
      ]),
    );
  });

  it("derives debt/equity from total debt and total equity when cached ratio is missing", () => {
    const result = scoreSafetyLayer(
      safetyInput({
        debtToEquity: missingFundamental("No debt/equity is cached."),
        totalDebt: cachedFundamental(4_000_000_000),
        totalEquity: cachedFundamental(2_000_000_000),
      }),
    );

    expect(result).toMatchObject({
      bucket: "adequate",
      score: 80,
      status: "scored",
    });
    expect(result.ruleChecks).toContainEqual(
      expect.objectContaining({
        id: "safety.debt_to_equity",
        measuredValue: expect.objectContaining({
          availability: "available",
          source: "derived_metric",
          value: 2,
        }),
        status: "fail",
      }),
    );
  });

  it("scores mixed safety outcomes without treating unavailable metrics as passing", () => {
    const result = scoreSafetyLayer(
      safetyInput({
        currentRatio: cachedFundamental(1.1),
        debtToEquity: cachedFundamental(1.4),
        freeCashFlow: cachedFundamental(0),
        totalDebt: missingFundamental("No total debt is cached."),
      }),
    );

    expect(result).toMatchObject({
      bucket: "weak",
      score: 38,
      status: "scored",
    });
    expect(result.ruleChecks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "safety.current_ratio",
          status: "fail",
        }),
        expect.objectContaining({
          id: "safety.debt_to_equity",
          status: "fail",
        }),
        expect.objectContaining({
          id: "safety.positive_free_cash_flow",
          measuredValue: expect.objectContaining({ value: 0 }),
          status: "warning",
        }),
        expect.objectContaining({
          id: "safety.total_debt",
          measuredValue: expect.objectContaining({ value: null }),
          status: "unavailable",
        }),
      ]),
    );
  });
});
