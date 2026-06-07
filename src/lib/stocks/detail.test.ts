import { describe, expect, it } from "vitest";

import {
  createCachedFiftyTwoWeekRange,
  createCachedPriceMovementSummary,
  createHistoricalPriceChartPoints,
  createLatestCachedPriceSummary,
  createStockProfileFields,
  getTrailingFiftyTwoWeekStartDate,
  getTrailingOneYearStartDate,
  type StockPriceInput,
  type StockProfileInput,
} from "./detail";

const profile: StockProfileInput = {
  symbol: "AAPL",
  name: "Apple Inc.",
  exchange: "NASDAQ",
  sector: "Technology",
  industry: "Consumer Electronics",
  country: "US",
  currency: "USD",
  updated_at: "2026-06-05T12:00:00.000Z",
};

const latestPrice: StockPriceInput = {
  symbol: "AAPL",
  price_date: "2026-06-05",
  high: "203",
  low: "198.25",
  close: "202.75",
  volume: 45678900,
  created_at: "2026-06-05T12:15:00.000Z",
};

describe("createStockProfileFields", () => {
  it("creates display fields for successful cached company profile data", () => {
    expect(createStockProfileFields(profile)).toEqual([
      { label: "Symbol", value: "AAPL", isMissing: false },
      { label: "Company", value: "Apple Inc.", isMissing: false },
      { label: "Exchange", value: "NASDAQ", isMissing: false },
      { label: "Sector", value: "Technology", isMissing: false },
      {
        label: "Industry",
        value: "Consumer Electronics",
        isMissing: false,
      },
      { label: "Country", value: "US", isMissing: false },
      { label: "Currency", value: "USD", isMissing: false },
      {
        label: "Profile cache updated",
        value: "2026-06-05T12:00:00.000Z",
        isMissing: false,
      },
    ]);
  });

  it("marks missing optional profile fields as unavailable", () => {
    const fields = createStockProfileFields({
      ...profile,
      exchange: null,
      sector: " ",
      industry: null,
    });

    expect(fields).toEqual(
      expect.arrayContaining([
        { label: "Exchange", value: "Unavailable", isMissing: true },
        { label: "Sector", value: "Unavailable", isMissing: true },
        { label: "Industry", value: "Unavailable", isMissing: true },
      ]),
    );
  });
});

describe("createLatestCachedPriceSummary", () => {
  it("returns the latest cached price summary when close data exists", () => {
    expect(createLatestCachedPriceSummary(latestPrice)).toEqual({
      cachedAt: "2026-06-05T12:15:00.000Z",
      close: 202.75,
      priceDate: "2026-06-05",
      volume: 45678900,
    });
  });

  it("returns null for missing or unusable latest price data", () => {
    expect(createLatestCachedPriceSummary(null)).toBeNull();
    expect(
      createLatestCachedPriceSummary({
        ...latestPrice,
        close: "not-a-number",
      }),
    ).toBeNull();
  });
});

describe("createCachedFiftyTwoWeekRange", () => {
  it("derives high and low from cached daily price rows", () => {
    expect(
      createCachedFiftyTwoWeekRange([
        {
          price_date: "2026-06-03",
          high: "201",
          low: "197",
          close: "200",
        },
        {
          price_date: "2026-06-04",
          high: "205.5",
          low: "199",
          close: "204",
        },
        {
          price_date: "2026-06-05",
          high: null,
          low: null,
          close: "202.75",
        },
      ]),
    ).toEqual({
      hasFullWindow: false,
      high: 205.5,
      low: 197,
      requiredStartDate: "2025-06-06",
      rowCount: 3,
      startDate: "2026-06-03",
      endDate: "2026-06-05",
    });
  });

  it("returns null when no cached price rows have usable prices", () => {
    expect(
      createCachedFiftyTwoWeekRange([
        {
          price_date: "2026-06-05",
          high: null,
          low: null,
          close: "not-a-number",
        },
      ]),
    ).toBeNull();
  });
});

describe("createCachedPriceMovementSummary", () => {
  it("calculates recent movement windows from cached daily closes", () => {
    const summary = createCachedPriceMovementSummary([
      { price_date: "2026-06-05", close: "165" },
      { price_date: "2025-06-05", close: "100" },
      { price_date: "2025-12-05", close: "120" },
      { price_date: "2026-05-05", close: "140" },
      { price_date: "2026-05-29", close: "150" },
    ]);

    expect(summary).toMatchObject({
      earliestDate: "2025-06-05",
      latestClose: 165,
      latestDate: "2026-06-05",
      rowCount: 5,
    });

    expect(summary.movements.map((movement) => movement.id)).toEqual([
      "1w",
      "1m",
      "6m",
      "1y",
    ]);
    expect(summary.movements[0]).toMatchObject({
      baselineClose: 150,
      baselineDate: "2026-05-29",
      percentChange: 10,
      targetDate: "2026-05-29",
      unavailableReason: null,
    });
    expect(summary.movements[1].percentChange).toBeCloseTo(17.857142857);
    expect(summary.movements[2].percentChange).toBeCloseTo(37.5);
    expect(summary.movements[3].percentChange).toBeCloseTo(65);
  });

  it("marks movement windows unavailable when cached history is too short", () => {
    const summary = createCachedPriceMovementSummary([
      { price_date: "2026-05-29", close: "150" },
      { price_date: "2026-06-05", close: "165" },
    ]);

    expect(summary.movements[0]).toMatchObject({
      baselineDate: "2026-05-29",
      percentChange: 10,
      unavailableReason: null,
    });
    expect(summary.movements[1]).toMatchObject({
      baselineDate: null,
      percentChange: null,
      targetDate: "2026-05-05",
      unavailableReason: "Needs cached prices back to 2026-05-05.",
    });
    expect(summary.movements[2].unavailableReason).toBe(
      "Needs cached prices back to 2025-12-05.",
    );
    expect(summary.movements[3].unavailableReason).toBe(
      "Needs cached prices back to 2025-06-05.",
    );
  });

  it("does not calculate a percentage movement from a zero baseline close", () => {
    const summary = createCachedPriceMovementSummary([
      { price_date: "2026-05-05", close: "0" },
      { price_date: "2026-06-05", close: "165" },
    ]);

    expect(summary.movements[1]).toMatchObject({
      baselineDate: null,
      percentChange: null,
      unavailableReason: "Cached close on 2026-05-05 is not above zero.",
    });
  });

  it("calculates moving averages only when enough cached closes exist", () => {
    const summary = createCachedPriceMovementSummary(
      Array.from({ length: 200 }, (_, index) => ({
        price_date: addUtcDays("2026-01-01", index),
        close: String(index + 1),
      })),
    );

    expect(summary.movingAverages).toEqual([
      {
        endDate: "2026-07-19",
        id: "50d",
        label: "50-day moving average",
        requiredRowCount: 50,
        rowCount: 50,
        startDate: "2026-05-31",
        unavailableReason: null,
        value: 175.5,
      },
      {
        endDate: "2026-07-19",
        id: "200d",
        label: "200-day moving average",
        requiredRowCount: 200,
        rowCount: 200,
        startDate: "2026-01-01",
        unavailableReason: null,
        value: 100.5,
      },
    ]);
  });

  it("marks moving averages unavailable when too few cached closes exist", () => {
    const summary = createCachedPriceMovementSummary([
      { price_date: "2026-06-03", close: "100" },
      { price_date: "2026-06-04", close: "101" },
      { price_date: "2026-06-05", close: "102" },
    ]);

    expect(summary.movingAverages).toEqual([
      {
        endDate: "2026-06-05",
        id: "50d",
        label: "50-day moving average",
        requiredRowCount: 50,
        rowCount: 3,
        startDate: "2026-06-03",
        unavailableReason: "Needs at least 50 cached daily closes.",
        value: null,
      },
      {
        endDate: "2026-06-05",
        id: "200d",
        label: "200-day moving average",
        requiredRowCount: 200,
        rowCount: 3,
        startDate: "2026-06-03",
        unavailableReason: "Needs at least 200 cached daily closes.",
        value: null,
      },
    ]);
  });
});

describe("createHistoricalPriceChartPoints", () => {
  it("creates ascending close-price chart points from cached daily rows", () => {
    expect(
      createHistoricalPriceChartPoints([
        {
          price_date: "2026-06-05",
          close: "202.75",
        },
        {
          price_date: "2026-06-03",
          close: "200",
        },
        {
          price_date: "2026-06-04",
          close: "not-a-number",
        },
      ]),
    ).toEqual([
      {
        priceDate: "2026-06-03",
        close: 200,
      },
      {
        priceDate: "2026-06-05",
        close: 202.75,
      },
    ]);
  });

  it("returns no points when cached rows do not have usable closes", () => {
    expect(
      createHistoricalPriceChartPoints([
        {
          price_date: "2026-06-05",
          close: "not-a-number",
        },
      ]),
    ).toEqual([]);
  });
});

describe("getTrailingFiftyTwoWeekStartDate", () => {
  it("uses the latest cached price date as the end of the window", () => {
    expect(getTrailingFiftyTwoWeekStartDate("2026-06-05")).toBe("2025-06-06");
  });
});

describe("getTrailingOneYearStartDate", () => {
  it("uses a calendar year for one-year movement lookbacks", () => {
    expect(getTrailingOneYearStartDate("2026-06-05")).toBe("2025-06-05");
  });
});

function addUtcDays(priceDate: string, days: number) {
  const date = new Date(`${priceDate}T00:00:00.000Z`);

  date.setUTCDate(date.getUTCDate() + days);

  return date.toISOString().slice(0, 10);
}
