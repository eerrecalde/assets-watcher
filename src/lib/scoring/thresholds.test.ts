import { describe, expect, it } from "vitest";

import {
  DEFAULT_GRAHAM_SCORING_THRESHOLDS,
  PORTFOLIO_FIT_LABELS,
  SCORING_LANGUAGE_GUIDANCE,
  STOCK_SCORE_LABELS,
} from "./thresholds";

describe("DEFAULT_GRAHAM_SCORING_THRESHOLDS", () => {
  it("matches the product-plan default Graham rules", () => {
    expect(DEFAULT_GRAHAM_SCORING_THRESHOLDS).toEqual({
      maxDebtToEquity: 1,
      maxPb: 3,
      maxPe: 20,
      maxSectorAllocationPercent: 30,
      maxSingleStockAllocationPercent: 10,
      minCurrentRatio: 1.5,
      minMarginOfSafetyPercent: 25,
    });
  });
});

describe("scoring label contracts", () => {
  it("keeps the product-plan stock labels available for score results", () => {
    expect(STOCK_SCORE_LABELS).toEqual([
      "Attractive",
      "Reasonable",
      "Watch",
      "Expensive",
      "Avoid / Review",
      "Insufficient Data",
    ]);
  });

  it("keeps portfolio-fit labels as a future scoring boundary", () => {
    expect(PORTFOLIO_FIT_LABELS).toEqual([
      "Underweight",
      "Balanced",
      "Overweight",
      "Concentration Risk",
      "Cash Constrained",
      "Do Not Add",
      "Review Position",
    ]);
  });

  it("documents cautious language and forbidden recommendation verbs", () => {
    expect(SCORING_LANGUAGE_GUIDANCE.caution).not.toMatch(/\b(buy|sell)\b/i);
    expect(SCORING_LANGUAGE_GUIDANCE.disallowedDirectiveTerms).toEqual([
      "buy",
      "sell",
    ]);
  });
});
