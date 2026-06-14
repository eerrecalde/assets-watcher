import { describe, expect, it } from "vitest";

import {
  createMarketContextScoringInputFromCachedPrices,
  scoreMarketContextLayer,
  type MarketContextPriceRowInput,
} from "./market-context";

function priceRows({
  count,
  startDate,
}: {
  count: number;
  startDate: string;
}): MarketContextPriceRowInput[] {
  return Array.from({ length: count }, (_, index) => {
    const close = 100 + index;

    return {
      close: String(close),
      high: String(close + 5),
      low: String(close - 5),
      price_date: addUtcDays(startDate, index),
    };
  });
}

describe("createMarketContextScoringInputFromCachedPrices", () => {
  it("builds complete market context inputs from enough cached daily prices", () => {
    const input = createMarketContextScoringInputFromCachedPrices({
      currentDate: new Date("2026-06-02T12:00:00.000Z"),
      priceRows: priceRows({ count: 366, startDate: "2025-05-31" }),
    });

    expect(input).toMatchObject({
      fiftyDayMovingAverage: {
        availability: "available",
        asOfDate: "2026-05-31",
        freshness: "fresh",
        value: 440.5,
      },
      fiftyTwoWeekHigh: {
        availability: "available",
        asOfDate: "2026-05-31",
        freshness: "fresh",
        value: 470,
      },
      fiftyTwoWeekLow: {
        availability: "available",
        asOfDate: "2026-05-31",
        freshness: "fresh",
        value: 96,
      },
      oneWeekMovementPercent: {
        availability: "available",
        asOfDate: "2026-05-31",
        freshness: "fresh",
      },
      oneYearMovementPercent: {
        availability: "available",
        asOfDate: "2026-05-31",
        freshness: "fresh",
      },
      twoHundredDayMovingAverage: {
        availability: "available",
        asOfDate: "2026-05-31",
        freshness: "fresh",
        value: 365.5,
      },
    });
  });

  it("marks unavailable windows explicitly when cached history is too short", () => {
    const input = createMarketContextScoringInputFromCachedPrices({
      currentDate: new Date("2026-06-11T12:00:00.000Z"),
      priceRows: priceRows({ count: 60, startDate: "2026-04-12" }),
    });

    expect(input.oneWeekMovementPercent).toMatchObject({
      availability: "available",
      freshness: "fresh",
    });
    expect(input.oneMonthMovementPercent).toMatchObject({
      availability: "available",
      freshness: "fresh",
    });
    expect(input.fiftyDayMovingAverage).toMatchObject({
      availability: "available",
      freshness: "fresh",
    });
    expect(input.sixMonthMovementPercent).toMatchObject({
      availability: "insufficient",
      reason: "Needs cached prices back to 2025-12-10.",
      value: null,
    });
    expect(input.oneYearMovementPercent).toMatchObject({
      availability: "insufficient",
      reason: "Needs cached prices back to 2025-06-10.",
      value: null,
    });
    expect(input.fiftyTwoWeekHigh).toMatchObject({
      availability: "insufficient",
      reason:
        "Needs cached prices back to 2025-06-11 for a full 52-week range.",
      value: null,
    });
    expect(input.twoHundredDayMovingAverage).toMatchObject({
      availability: "insufficient",
      reason: "Needs at least 200 cached daily closes.",
      value: null,
    });
  });

  it("returns missing or insufficient context when cached price history is missing", () => {
    const input = createMarketContextScoringInputFromCachedPrices({
      currentDate: new Date("2026-06-11T12:00:00.000Z"),
      priceRows: [],
    });

    expect(input.oneWeekMovementPercent).toMatchObject({
      availability: "insufficient",
      reason: "No cached close prices are available.",
      value: null,
    });
    expect(input.fiftyTwoWeekHigh).toMatchObject({
      availability: "missing",
      reason: "No cached price range is available.",
      value: null,
    });
    expect(input.fiftyDayMovingAverage).toMatchObject({
      availability: "insufficient",
      reason: "Needs at least 50 cached daily closes.",
      value: null,
    });
  });
});

describe("scoreMarketContextLayer", () => {
  it("scores complete cached market context without directional advice", () => {
    const input = createMarketContextScoringInputFromCachedPrices({
      currentDate: new Date("2026-06-02T12:00:00.000Z"),
      priceRows: priceRows({ count: 366, startDate: "2025-05-31" }),
    });
    const result = scoreMarketContextLayer(input);

    expect(result).toMatchObject({
      bucket: "complete",
      score: 100,
      status: "scored",
    });
    expect(result.ruleChecks.map(({ id, status }) => ({ id, status }))).toEqual(
      [
        { id: "market_context.one_week_movement", status: "pass" },
        { id: "market_context.one_month_movement", status: "pass" },
        { id: "market_context.six_month_movement", status: "pass" },
        { id: "market_context.one_year_movement", status: "pass" },
        { id: "market_context.fifty_two_week_high", status: "pass" },
        { id: "market_context.fifty_two_week_low", status: "pass" },
        { id: "market_context.fifty_day_moving_average", status: "pass" },
        {
          id: "market_context.two_hundred_day_moving_average",
          status: "pass",
        },
      ],
    );
    expect(result.explanation.summary).not.toMatch(/\b(buy|sell)\b/i);
  });

  it("scores partial cached history without evaluating unavailable windows", () => {
    const input = createMarketContextScoringInputFromCachedPrices({
      currentDate: new Date("2026-06-11T12:00:00.000Z"),
      priceRows: priceRows({ count: 60, startDate: "2026-04-12" }),
    });
    const result = scoreMarketContextLayer(input);

    expect(result).toMatchObject({
      bucket: "limited",
      score: 38,
      status: "scored",
    });
    expect(result.ruleChecks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "market_context.one_week_movement",
          status: "pass",
        }),
        expect.objectContaining({
          id: "market_context.one_month_movement",
          status: "pass",
        }),
        expect.objectContaining({
          id: "market_context.six_month_movement",
          status: "insufficient_data",
        }),
        expect.objectContaining({
          id: "market_context.two_hundred_day_moving_average",
          status: "insufficient_data",
        }),
      ]),
    );
  });

  it("returns insufficient data when no cached price history is usable", () => {
    const input = createMarketContextScoringInputFromCachedPrices({
      currentDate: new Date("2026-06-11T12:00:00.000Z"),
      priceRows: [],
    });
    const result = scoreMarketContextLayer(input);

    expect(result).toMatchObject({
      bucket: "insufficient_data",
      score: null,
      status: "insufficient_data",
    });
    expect(result.ruleChecks.every(({ status }) => status !== "pass")).toBe(
      true,
    );
  });

  it("marks stale latest cached close context as historical rather than current", () => {
    const input = createMarketContextScoringInputFromCachedPrices({
      currentDate: new Date("2026-06-10T12:00:00.000Z"),
      priceRows: priceRows({ count: 366, startDate: "2025-05-31" }),
    });
    const result = scoreMarketContextLayer(input);

    expect(input.oneWeekMovementPercent).toMatchObject({
      asOfDate: "2026-05-31",
      availability: "available",
      freshness: "stale",
    });
    expect(result).toMatchObject({
      bucket: "stale",
      score: 50,
      status: "scored",
    });
    expect(result.ruleChecks.every(({ status }) => status === "warning")).toBe(
      true,
    );
    expect(result.explanation.summary).toContain("historical context");
  });
});

function addUtcDays(priceDate: string, days: number) {
  const date = new Date(`${priceDate}T00:00:00.000Z`);

  date.setUTCDate(date.getUTCDate() + days);

  return date.toISOString().slice(0, 10);
}
