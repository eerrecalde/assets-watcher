import { describe, expect, it } from "vitest";

import {
  createMarketDataFailure,
  createMarketDataSuccess,
  normalizeMarketDataDate,
  normalizeMarketDataSymbol,
  type MarketDataProvider,
} from "./provider";

describe("normalizeMarketDataSymbol", () => {
  it("trims and uppercases provider symbols", () => {
    expect(normalizeMarketDataSymbol(" aapl ")).toBe("AAPL");
    expect(normalizeMarketDataSymbol("brk.b")).toBe("BRK.B");
  });

  it("rejects blank, spaced, or malformed symbols", () => {
    expect(() => normalizeMarketDataSymbol("")).toThrow(
      "Invalid market data symbol",
    );
    expect(() => normalizeMarketDataSymbol("BAD SYMBOL")).toThrow(
      "Invalid market data symbol",
    );
    expect(() => normalizeMarketDataSymbol("$TSLA")).toThrow(
      "Invalid market data symbol",
    );
  });
});

describe("normalizeMarketDataDate", () => {
  it("normalizes Date instances to a yyyy-mm-dd date", () => {
    expect(
      normalizeMarketDataDate(new Date("2026-06-05T21:30:00.000Z")),
    ).toBe("2026-06-05");
  });

  it("keeps valid yyyy-mm-dd strings unchanged", () => {
    expect(normalizeMarketDataDate("2026-06-05")).toBe("2026-06-05");
  });

  it("rejects invalid or non-normalized dates", () => {
    expect(() => normalizeMarketDataDate("2026-02-30")).toThrow(
      "Invalid market data date",
    );
    expect(() => normalizeMarketDataDate("06/05/2026")).toThrow(
      "Invalid market data date",
    );
  });
});

describe("market data result helpers", () => {
  it("creates explicit success results with provider metadata", () => {
    const fetchedAt = new Date("2026-06-05T00:00:00.000Z");

    expect(
      createMarketDataSuccess({
        provider: "test-provider",
        fetchedAt,
        data: {
          symbol: "AAPL",
          priceDate: "2026-06-05",
          open: 190,
          high: 194,
          low: 189.5,
          close: 193.25,
          volume: 1200,
        },
      }),
    ).toEqual({
      ok: true,
      provider: "test-provider",
      fetchedAt,
      data: {
        symbol: "AAPL",
        priceDate: "2026-06-05",
        open: 190,
        high: 194,
        low: 189.5,
        close: 193.25,
        volume: 1200,
      },
      warnings: [],
    });
  });

  it("creates explicit failure results without provider data", () => {
    const fetchedAt = new Date("2026-06-05T00:00:00.000Z");

    expect(
      createMarketDataFailure({
        provider: "test-provider",
        fetchedAt,
        code: "not_found",
        message: "Symbol was not found.",
      }),
    ).toEqual({
      ok: false,
      provider: "test-provider",
      fetchedAt,
      error: {
        code: "not_found",
        message: "Symbol was not found.",
      },
    });
  });
});

describe("MarketDataProvider", () => {
  it("defines a pluggable provider contract for normalized market data", async () => {
    const fetchedAt = new Date("2026-06-05T00:00:00.000Z");
    const provider: MarketDataProvider = {
      id: "mock",
      displayName: "Mock Provider",
      async getCompanyProfile(symbol) {
        return createMarketDataSuccess({
          provider: this.id,
          fetchedAt,
          data: {
            symbol: normalizeMarketDataSymbol(symbol),
            name: "Apple Inc.",
            exchange: "NASDAQ",
            sector: "Technology",
            industry: "Consumer Electronics",
            country: "US",
            currency: "USD",
          },
        });
      },
      async getLatestPrice(symbol) {
        return createMarketDataSuccess({
          provider: this.id,
          fetchedAt,
          data: {
            symbol: normalizeMarketDataSymbol(symbol),
            priceDate: "2026-06-05",
            open: null,
            high: null,
            low: null,
            close: 193.25,
            volume: null,
          },
        });
      },
      async getHistoricalPrices(symbol) {
        return createMarketDataSuccess({
          provider: this.id,
          fetchedAt,
          data: [
            {
              symbol: normalizeMarketDataSymbol(symbol),
              priceDate: "2026-06-05",
              open: null,
              high: null,
              low: null,
              close: 193.25,
              volume: null,
            },
          ],
        });
      },
      async getFundamentals(symbol) {
        return createMarketDataSuccess({
          provider: this.id,
          fetchedAt,
          data: [
            {
              symbol: normalizeMarketDataSymbol(symbol),
              fiscalPeriod: "FY",
              fiscalYear: 2025,
              periodType: "annual",
              eps: 6.1,
              bookValuePerShare: null,
              peRatio: null,
              pbRatio: null,
              debtToEquity: null,
              currentRatio: null,
              dividendYield: null,
              revenue: null,
              netIncome: null,
              freeCashFlow: null,
              totalDebt: null,
              totalEquity: null,
            },
          ],
        });
      },
    };

    await expect(provider.getLatestPrice("aapl")).resolves.toMatchObject({
      ok: true,
      provider: "mock",
      data: {
        symbol: "AAPL",
        close: 193.25,
      },
    });
  });
});
