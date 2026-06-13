import { describe, expect, it } from "vitest";

import {
  calculateGrahamNumber,
  calculateMarginOfSafety,
  calculateMarginOfSafetyPercent,
} from "./valuation";

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
