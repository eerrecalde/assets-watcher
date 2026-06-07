import { describe, expect, it } from "vitest";

import {
  createCachedFiftyTwoWeekRange,
  createLatestCachedPriceSummary,
  createStockProfileFields,
  getTrailingFiftyTwoWeekStartDate,
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
      high: 205.5,
      low: 197,
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

describe("getTrailingFiftyTwoWeekStartDate", () => {
  it("uses the latest cached price date as the end of the window", () => {
    expect(getTrailingFiftyTwoWeekStartDate("2026-06-05")).toBe("2025-06-06");
  });
});
