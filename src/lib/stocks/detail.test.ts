import { describe, expect, it } from "vitest";

import {
  classifyStockDetailPriceFreshness,
  createCachedFiftyTwoWeekRange,
  createCachedPriceMovementSummary,
  createHistoricalPriceChartPoints,
  createLatestCachedPriceSummary,
  createStockProfileFields,
  createStockFundamentalsSummary,
  getTrailingFiftyTwoWeekStartDate,
  getTrailingOneYearStartDate,
  selectLatestRelevantFundamentals,
  type StockPriceInput,
  type StockProfileInput,
  type StockFundamentalInput,
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

const fundamentals: StockFundamentalInput = {
  symbol: "AAPL",
  fiscal_period: "FY",
  fiscal_year: 2025,
  period_type: "annual",
  eps: "6.1",
  book_value_per_share: "4.2",
  pe_ratio: "29.1",
  pb_ratio: "42",
  debt_to_equity: "1.32",
  current_ratio: "0.95",
  dividend_yield: "0.005",
  revenue: "391000000000",
  net_income: "98000000000",
  free_cash_flow: "104000000000",
  total_debt: "95000000000",
  total_equity: "72000000000",
  created_at: "2026-06-06T08:30:00.000Z",
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

  it("does not replace unknown profile fields with empty display strings", () => {
    const fields = createStockProfileFields({
      ...profile,
      country: " ",
      currency: "",
      name: " ",
    });

    expect(fields).toEqual(
      expect.arrayContaining([
        { label: "Company", value: "Unavailable", isMissing: true },
        { label: "Country", value: "Unavailable", isMissing: true },
        { label: "Currency", value: "Unavailable", isMissing: true },
      ]),
    );
  });
});

describe("createLatestCachedPriceSummary", () => {
  it("returns the latest cached price summary when close data exists", () => {
    expect(
      createLatestCachedPriceSummary(
        latestPrice,
        new Date("2026-06-07T10:00:00.000Z"),
      ),
    ).toEqual({
      cachedAt: "2026-06-05T12:15:00.000Z",
      close: 202.75,
      freshness: {
        ageDays: 2,
        asOfDate: "2026-06-05",
        currentDate: "2026-06-07",
        reason: "Latest cached close is within 3 calendar days.",
        staleAfterDate: "2026-06-08",
        status: "fresh",
        windowDays: 3,
      },
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

  it("keeps a real zero close instead of treating it as missing", () => {
    expect(
      createLatestCachedPriceSummary({
        ...latestPrice,
        close: "0",
      }),
    ).toMatchObject({
      close: 0,
      priceDate: "2026-06-05",
    });
  });
});

describe("classifyStockDetailPriceFreshness", () => {
  it("keeps a Friday cached close fresh through the weekend freshness window", () => {
    expect(
      classifyStockDetailPriceFreshness(
        "2026-06-05",
        new Date("2026-06-08T09:00:00.000Z"),
      ),
    ).toEqual({
      ageDays: 3,
      asOfDate: "2026-06-05",
      currentDate: "2026-06-08",
      reason: "Latest cached close is within 3 calendar days.",
      staleAfterDate: "2026-06-08",
      status: "fresh",
      windowDays: 3,
    });
  });

  it("marks latest cached close data stale after the freshness window", () => {
    expect(
      classifyStockDetailPriceFreshness(
        "2026-06-05",
        new Date("2026-06-09T09:00:00.000Z"),
      ),
    ).toEqual({
      ageDays: 4,
      asOfDate: "2026-06-05",
      currentDate: "2026-06-09",
      reason: "Latest cached close is older than 3 calendar days.",
      staleAfterDate: "2026-06-08",
      status: "stale",
      windowDays: 3,
    });
  });

  it("marks missing or invalid latest close dates unavailable", () => {
    expect(
      classifyStockDetailPriceFreshness(
        null,
        new Date("2026-06-09T09:00:00.000Z"),
      ),
    ).toEqual({
      ageDays: null,
      asOfDate: null,
      currentDate: "2026-06-09",
      reason: "No usable latest cached close date is available.",
      staleAfterDate: null,
      status: "unavailable",
      windowDays: 3,
    });

    expect(
      classifyStockDetailPriceFreshness(
        "2026-02-30",
        new Date("2026-06-09T09:00:00.000Z"),
      ).status,
    ).toBe("unavailable");
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

describe("createStockFundamentalsSummary", () => {
  it("groups complete cached fundamentals for display", () => {
    expect(createStockFundamentalsSummary(fundamentals)).toEqual({
      cachedAt: "2026-06-06T08:30:00.000Z",
      fiscalPeriod: "FY",
      fiscalYear: 2025,
      periodType: "annual",
      valuationMetrics: [
        { format: "currency", isMissing: false, label: "EPS", value: 6.1 },
        {
          format: "currency",
          isMissing: false,
          label: "Book value / share",
          value: 4.2,
        },
        {
          format: "number",
          isMissing: false,
          label: "P/E ratio",
          value: 29.1,
        },
        { format: "number", isMissing: false, label: "P/B ratio", value: 42 },
        {
          format: "percentage",
          isMissing: false,
          label: "Dividend yield",
          value: 0.005,
        },
      ],
      qualityAndSafetyMetrics: [
        {
          format: "number",
          isMissing: false,
          label: "Debt / equity",
          value: 1.32,
        },
        {
          format: "number",
          isMissing: false,
          label: "Current ratio",
          value: 0.95,
        },
        {
          format: "currency",
          isMissing: false,
          label: "Revenue",
          value: 391000000000,
        },
        {
          format: "currency",
          isMissing: false,
          label: "Net income",
          value: 98000000000,
        },
        {
          format: "currency",
          isMissing: false,
          label: "Free cash flow",
          value: 104000000000,
        },
        {
          format: "currency",
          isMissing: false,
          label: "Total debt",
          value: 95000000000,
        },
        {
          format: "currency",
          isMissing: false,
          label: "Total equity",
          value: 72000000000,
        },
      ],
    });
  });

  it("keeps partial cached fundamentals visible and marks missing metrics", () => {
    const summary = createStockFundamentalsSummary({
      ...fundamentals,
      eps: "0",
      book_value_per_share: null,
      pe_ratio: "not-a-number",
      dividend_yield: "0",
      revenue: null,
      total_debt: "0",
    });

    expect(summary?.valuationMetrics).toEqual(
      expect.arrayContaining([
        { format: "currency", isMissing: false, label: "EPS", value: 0 },
        {
          format: "currency",
          isMissing: true,
          label: "Book value / share",
          value: null,
        },
        {
          format: "number",
          isMissing: true,
          label: "P/E ratio",
          value: null,
        },
        {
          format: "percentage",
          isMissing: false,
          label: "Dividend yield",
          value: 0,
        },
      ]),
    );
    expect(summary?.qualityAndSafetyMetrics).toEqual(
      expect.arrayContaining([
        {
          format: "currency",
          isMissing: true,
          label: "Revenue",
          value: null,
        },
        {
          format: "currency",
          isMissing: false,
          label: "Total debt",
          value: 0,
        },
      ]),
    );
  });

  it("returns null when no cached fundamentals row exists", () => {
    expect(createStockFundamentalsSummary(null)).toBeNull();
  });
});

describe("selectLatestRelevantFundamentals", () => {
  it("prefers TTM, then annual, then quarterly fundamentals", () => {
    const annual = {
      ...fundamentals,
      fiscal_period: "FY",
      fiscal_year: 2026,
      period_type: "annual" as const,
    };
    const ttm = {
      ...fundamentals,
      fiscal_period: "TTM",
      fiscal_year: 2025,
      period_type: "ttm" as const,
    };
    const quarterly = {
      ...fundamentals,
      fiscal_period: "Q4",
      fiscal_year: 2026,
      period_type: "quarterly" as const,
    };

    expect(
      selectLatestRelevantFundamentals([quarterly, annual, ttm]),
    ).toBe(ttm);
    expect(selectLatestRelevantFundamentals([quarterly, annual])).toBe(annual);
    expect(selectLatestRelevantFundamentals([quarterly])).toBe(quarterly);
  });

  it("uses fiscal year and cache timestamp within the same period type", () => {
    const olderTtm = {
      ...fundamentals,
      created_at: "2026-06-07T08:00:00.000Z",
      fiscal_year: 2025,
      period_type: "ttm" as const,
    };
    const newerFiscalYearTtm = {
      ...fundamentals,
      created_at: "2026-06-06T08:00:00.000Z",
      fiscal_year: 2026,
      period_type: "ttm" as const,
    };
    const refreshedSameYearTtm = {
      ...newerFiscalYearTtm,
      created_at: "2026-06-07T09:00:00.000Z",
    };

    expect(
      selectLatestRelevantFundamentals([olderTtm, newerFiscalYearTtm]),
    ).toBe(newerFiscalYearTtm);
    expect(
      selectLatestRelevantFundamentals([
        newerFiscalYearTtm,
        refreshedSameYearTtm,
      ]),
    ).toBe(refreshedSameYearTtm);
  });

  it("returns null when no fundamentals rows exist", () => {
    expect(selectLatestRelevantFundamentals([])).toBeNull();
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

  it("keeps only usable historical closes so chart empty states can target missing history", () => {
    expect(
      createHistoricalPriceChartPoints([
        {
          price_date: "2026-06-03",
          close: "not-a-number",
        },
        {
          price_date: "2026-06-04",
          close: "not-a-number",
        },
        {
          price_date: "2026-06-05",
          close: "101.5",
        },
      ]),
    ).toEqual([
      {
        close: 101.5,
        priceDate: "2026-06-05",
      },
    ]);
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
