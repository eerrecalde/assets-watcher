import { describe, expect, it } from "vitest";

import {
  calculateGrahamNumber,
  calculateMarginOfSafety,
  calculateMarginOfSafetyPercent,
  scoreValuationLayer,
} from "./valuation";
import type { ScoringDataPoint, StockValuationScoringInput } from "./types";

const cachedFundamental = (value: number): ScoringDataPoint => ({
  availability: "available",
  asOfDate: "2026-03-31",
  freshness: "unknown",
  source: "cached_fundamentals",
  value,
});

const cachedPrice = (value: number): ScoringDataPoint => ({
  availability: "available",
  asOfDate: "2026-06-12",
  freshness: "fresh",
  source: "cached_price",
  value,
});

const derivedMetric = (value: number): ScoringDataPoint => ({
  availability: "available",
  asOfDate: "2026-06-12",
  freshness: "fresh",
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

const missingPrice = {
  availability: "missing",
  asOfDate: null,
  freshness: "unknown",
  reason: "No latest cached close is available.",
  source: "cached_price",
  value: null,
} satisfies ScoringDataPoint;

function valuationInput(
  overrides: Partial<StockValuationScoringInput> = {},
): StockValuationScoringInput {
  return {
    bookValuePerShare: cachedFundamental(20),
    currentPrice: cachedPrice(75),
    eps: cachedFundamental(5),
    grahamNumber: derivedMetric(100),
    marginOfSafetyPercent: derivedMetric(999),
    pbRatio: cachedFundamental(3),
    peRatio: cachedFundamental(20),
    ...overrides,
  };
}

describe("calculateGrahamNumber", () => {
  it("calculates the Graham Number for positive EPS and book value per share", () => {
    expect(
      calculateGrahamNumber({
        bookValuePerShare: 20,
        eps: 16,
      }),
    ).toEqual({
      availability: "available",
      value: 84.852814,
    });
  });

  it("accepts decimal strings from cached fundamentals", () => {
    expect(
      calculateGrahamNumber({
        bookValuePerShare: "25.50",
        eps: "6.25",
      }),
    ).toEqual({
      availability: "available",
      value: 59.882698,
    });
  });

  it.each([
    { bookValuePerShare: 20, eps: null, name: "null EPS" },
    { bookValuePerShare: 20, eps: undefined, name: "missing EPS" },
    { bookValuePerShare: null, eps: 16, name: "null book value" },
    { bookValuePerShare: undefined, eps: 16, name: "missing book value" },
    { bookValuePerShare: 20, eps: "not-a-number", name: "invalid EPS" },
    { bookValuePerShare: 20, eps: " ", name: "blank EPS" },
  ])("is unavailable for $name", (input) => {
    expect(calculateGrahamNumber(input)).toMatchObject({
      availability: "missing",
      value: null,
    });
  });

  it.each([
    { bookValuePerShare: 20, eps: 0, name: "zero EPS" },
    { bookValuePerShare: 20, eps: -1, name: "negative EPS" },
    { bookValuePerShare: 0, eps: 16, name: "zero book value" },
    { bookValuePerShare: -1, eps: 16, name: "negative book value" },
  ])("is insufficient for $name", (input) => {
    expect(calculateGrahamNumber(input)).toMatchObject({
      availability: "insufficient",
      value: null,
    });
  });
});

describe("calculateMarginOfSafety", () => {
  it("calculates a positive margin of safety when price is below estimated value", () => {
    expect(
      calculateMarginOfSafety({
        currentPrice: 150,
        estimatedValue: 200,
      }),
    ).toEqual({
      availability: "available",
      value: 0.25,
    });
  });

  it("calculates a negative margin of safety when price is above estimated value", () => {
    expect(
      calculateMarginOfSafety({
        currentPrice: 250,
        estimatedValue: 200,
      }),
    ).toEqual({
      availability: "available",
      value: -0.25,
    });
  });

  it("calculates margin of safety percent for scoring thresholds", () => {
    expect(
      calculateMarginOfSafetyPercent({
        currentPrice: "150",
        estimatedValue: "200",
      }),
    ).toEqual({
      availability: "available",
      value: 25,
    });
  });

  it.each([
    { currentPrice: null, estimatedValue: 200, name: "missing current price" },
    {
      currentPrice: undefined,
      estimatedValue: 200,
      name: "unavailable current price",
    },
    { currentPrice: 150, estimatedValue: null, name: "missing estimated value" },
    {
      currentPrice: "not-a-number",
      estimatedValue: 200,
      name: "invalid current price",
    },
  ])("is unavailable for $name", (input) => {
    expect(calculateMarginOfSafety(input)).toMatchObject({
      availability: "missing",
      value: null,
    });
  });

  it.each([
    { currentPrice: 150, estimatedValue: 0, name: "zero estimated value" },
    { currentPrice: 150, estimatedValue: -1, name: "negative estimated value" },
    { currentPrice: 0, estimatedValue: 200, name: "zero current price" },
    { currentPrice: -1, estimatedValue: 200, name: "negative current price" },
  ])("is insufficient for $name", (input) => {
    expect(calculateMarginOfSafety(input)).toMatchObject({
      availability: "insufficient",
      value: null,
    });
  });
});

describe("scoreValuationLayer", () => {
  it("scores an attractive valuation when P/E, P/B, and margin meet default thresholds", () => {
    const result = scoreValuationLayer(valuationInput());

    expect(result).toMatchObject({
      bucket: "attractive",
      label: "Attractive",
      score: 100,
      status: "scored",
    });
    expect(result.ruleChecks.map(({ id, status }) => ({ id, status }))).toEqual(
      [
        { id: "valuation.pe_ratio", status: "pass" },
        { id: "valuation.pb_ratio", status: "pass" },
        { id: "valuation.margin_of_safety", status: "pass" },
      ],
    );
  });

  it("treats product-plan threshold boundaries as passing", () => {
    const result = scoreValuationLayer(
      valuationInput({
        currentPrice: cachedPrice(75),
        grahamNumber: derivedMetric(100),
        pbRatio: cachedFundamental(3),
        peRatio: cachedFundamental(20),
      }),
    );

    expect(result.ruleChecks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "valuation.pe_ratio",
          measuredValue: expect.objectContaining({ value: 20 }),
          status: "pass",
        }),
        expect.objectContaining({
          id: "valuation.pb_ratio",
          measuredValue: expect.objectContaining({ value: 3 }),
          status: "pass",
        }),
        expect.objectContaining({
          id: "valuation.margin_of_safety",
          measuredValue: expect.objectContaining({ value: 25 }),
          status: "pass",
        }),
      ]),
    );
  });

  it("returns a reasonable valuation when price is near the Graham Number", () => {
    const result = scoreValuationLayer(
      valuationInput({
        currentPrice: cachedPrice(90),
        grahamNumber: derivedMetric(100),
        pbRatio: cachedFundamental(2),
        peRatio: cachedFundamental(18),
      }),
    );

    expect(result).toMatchObject({
      bucket: "reasonable",
      label: "Reasonable",
      score: 83,
    });
    expect(result.ruleChecks).toContainEqual(
      expect.objectContaining({
        id: "valuation.margin_of_safety",
        measuredValue: expect.objectContaining({ value: 10 }),
        status: "warning",
      }),
    );
  });

  it("returns watch when available valuation rules are mixed", () => {
    const result = scoreValuationLayer(
      valuationInput({
        currentPrice: cachedPrice(75),
        grahamNumber: derivedMetric(100),
        pbRatio: cachedFundamental(4),
        peRatio: cachedFundamental(18),
      }),
    );

    expect(result).toMatchObject({
      bucket: "watch",
      label: "Watch",
      score: 67,
    });
  });

  it("returns expensive when cached price is above the Graham Number", () => {
    const result = scoreValuationLayer(
      valuationInput({
        currentPrice: cachedPrice(125),
        grahamNumber: derivedMetric(100),
        marginOfSafetyPercent: derivedMetric(999),
        pbRatio: cachedFundamental(2),
        peRatio: cachedFundamental(18),
      }),
    );

    expect(result).toMatchObject({
      bucket: "expensive",
      label: "Expensive",
      score: 67,
    });
    expect(result.ruleChecks).toContainEqual(
      expect.objectContaining({
        id: "valuation.margin_of_safety",
        measuredValue: expect.objectContaining({ value: -25 }),
        status: "fail",
      }),
    );
  });

  it("does not treat a missing cached price as an automatic failure", () => {
    const result = scoreValuationLayer(
      valuationInput({
        currentPrice: missingPrice,
        pbRatio: cachedFundamental(2),
        peRatio: cachedFundamental(18),
      }),
    );

    expect(result).toMatchObject({
      bucket: "reasonable",
      label: "Reasonable",
      score: 100,
      status: "scored",
    });
    expect(result.ruleChecks).toContainEqual(
      expect.objectContaining({
        id: "valuation.margin_of_safety",
        status: "unavailable",
      }),
    );
  });

  it("returns insufficient data when cached fundamentals and price-derived valuation are unavailable", () => {
    const result = scoreValuationLayer(
      valuationInput({
        currentPrice: missingPrice,
        grahamNumber: missingFundamental("No Graham Number is cached."),
        pbRatio: missingFundamental("No P/B ratio is cached."),
        peRatio: missingFundamental("No P/E ratio is cached."),
      }),
    );

    expect(result).toMatchObject({
      bucket: "insufficient_data",
      label: "Insufficient Data",
      score: null,
      status: "insufficient_data",
    });
    expect(result.ruleChecks.every((ruleCheck) => ruleCheck.status)).toBe(true);
    expect(result.ruleChecks.map((ruleCheck) => ruleCheck.status)).toEqual([
      "unavailable",
      "unavailable",
      "unavailable",
    ]);
  });

  it("warns instead of passing non-positive cached ratios", () => {
    const result = scoreValuationLayer(
      valuationInput({
        pbRatio: cachedFundamental(0),
        peRatio: cachedFundamental(-4),
      }),
    );

    expect(result.ruleChecks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "valuation.pe_ratio",
          status: "warning",
        }),
        expect.objectContaining({
          id: "valuation.pb_ratio",
          status: "warning",
        }),
      ]),
    );
  });
});
