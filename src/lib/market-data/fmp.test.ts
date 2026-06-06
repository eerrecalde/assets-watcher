import { describe, expect, it, vi } from "vitest";

import { createFinancialModelingPrepProvider } from "./fmp";

function jsonResponse(data: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

function createProvider(fetchFn: typeof fetch) {
  return createFinancialModelingPrepProvider({
    apiKey: "test-api-key",
    baseUrl: "https://example.test/stable",
    fetchFn,
    now: () => new Date("2026-06-05T12:00:00.000Z"),
  });
}

describe("FinancialModelingPrepProvider", () => {
  it("normalizes company profile responses", async () => {
    const fetchFn = vi.fn(async () =>
      jsonResponse([
        {
          symbol: "AAPL",
          companyName: "Apple Inc.",
          exchangeShortName: "NASDAQ",
          sector: "Technology",
          industry: "Consumer Electronics",
          country: "US",
          currency: "USD",
        },
      ]),
    );

    const result = await createProvider(fetchFn).getCompanyProfile(" aapl ");

    expect(fetchFn).toHaveBeenCalledWith(
      "https://example.test/stable/profile?symbol=AAPL&apikey=test-api-key",
      { headers: { accept: "application/json" } },
    );
    expect(result).toMatchObject({
      ok: true,
      provider: "financial-modeling-prep",
      data: {
        symbol: "AAPL",
        name: "Apple Inc.",
        exchange: "NASDAQ",
        sector: "Technology",
        industry: "Consumer Electronics",
        country: "US",
        currency: "USD",
      },
    });
  });

  it("normalizes latest quote responses", async () => {
    const fetchFn = vi.fn(async () =>
      jsonResponse([
        {
          symbol: "AAPL",
          price: 193.25,
          open: 190,
          dayHigh: 194,
          dayLow: 189.5,
          volume: 1200,
          timestamp: 1780689600,
        },
      ]),
    );

    const result = await createProvider(fetchFn).getLatestPrice("AAPL");

    expect(result).toMatchObject({
      ok: true,
      data: {
        symbol: "AAPL",
        priceDate: "2026-06-05",
        open: 190,
        high: 194,
        low: 189.5,
        close: 193.25,
        volume: 1200,
      },
    });
  });

  it("normalizes historical price responses with date filters and limits", async () => {
    const fetchFn = vi.fn(async () =>
      jsonResponse([
        {
          date: "2026-06-05",
          open: 190,
          high: 194,
          low: 189.5,
          close: 193.25,
          volume: 1200,
        },
      ]),
    );

    const result = await createProvider(fetchFn).getHistoricalPrices("AAPL", {
      startDate: "2026-06-01",
      endDate: "2026-06-05",
      limit: 1,
    });

    expect(fetchFn).toHaveBeenCalledWith(
      "https://example.test/stable/historical-price-eod/full?symbol=AAPL&from=2026-06-01&to=2026-06-05&limit=1&apikey=test-api-key",
      { headers: { accept: "application/json" } },
    );
    expect(result).toMatchObject({
      ok: true,
      data: [
        {
          symbol: "AAPL",
          priceDate: "2026-06-05",
          open: 190,
          high: 194,
          low: 189.5,
          close: 193.25,
          volume: 1200,
        },
      ],
    });
  });

  it("combines FMP statement, metric, and ratio rows into fundamentals", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse([
          {
            date: "2025-09-27",
            calendarYear: "2025",
            period: "FY",
            revenue: 391000,
            netIncome: 98000,
            eps: 6.1,
          },
        ]),
      )
      .mockResolvedValueOnce(
        jsonResponse([
          {
            date: "2025-09-27",
            calendarYear: "2025",
            period: "FY",
            totalDebt: 95000,
            totalStockholdersEquity: 72000,
          },
        ]),
      )
      .mockResolvedValueOnce(
        jsonResponse([
          {
            date: "2025-09-27",
            calendarYear: "2025",
            period: "FY",
            freeCashFlow: 104000,
          },
        ]),
      )
      .mockResolvedValueOnce(
        jsonResponse([
          {
            date: "2025-09-27",
            calendarYear: "2025",
            period: "FY",
            bookValuePerShare: 4.2,
            peRatio: 29.1,
            pbRatio: 42,
            debtToEquity: 1.32,
            currentRatio: 0.95,
          },
        ]),
      )
      .mockResolvedValueOnce(
        jsonResponse([
          {
            date: "2025-09-27",
            calendarYear: "2025",
            period: "FY",
            dividendYield: 0.005,
          },
        ]),
      );

    const result = await createProvider(fetchFn).getFundamentals("AAPL", {
      limit: 1,
    });

    expect(result).toMatchObject({
      ok: true,
      data: [
        {
          symbol: "AAPL",
          fiscalPeriod: "FY",
          fiscalYear: 2025,
          periodType: "annual",
          eps: 6.1,
          bookValuePerShare: 4.2,
          peRatio: 29.1,
          pbRatio: 42,
          debtToEquity: 1.32,
          currentRatio: 0.95,
          dividendYield: 0.005,
          revenue: 391000,
          netIncome: 98000,
          freeCashFlow: 104000,
          totalDebt: 95000,
          totalEquity: 72000,
        },
      ],
    });
  });

  it("uses FMP TTM metrics endpoints for TTM fundamentals", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse([
          {
            symbol: "AAPL",
            netIncomePerShareTTM: 6.2,
            bookValuePerShareTTM: 4.4,
            peRatioTTM: 28.4,
            pbRatioTTM: 41.2,
            debtToEquityTTM: 1.28,
            currentRatioTTM: 0.98,
            freeCashFlowTTM: 105000,
          },
        ]),
      )
      .mockResolvedValueOnce(
        jsonResponse([
          {
            symbol: "AAPL",
            dividendYieldTTM: 0.005,
          },
        ]),
      );

    const result = await createProvider(fetchFn).getFundamentals("AAPL", {
      periodType: "ttm",
      limit: 1,
    });

    expect(fetchFn).toHaveBeenNthCalledWith(
      1,
      "https://example.test/stable/key-metrics-ttm?symbol=AAPL&limit=1&apikey=test-api-key",
      { headers: { accept: "application/json" } },
    );
    expect(fetchFn).toHaveBeenNthCalledWith(
      2,
      "https://example.test/stable/ratios-ttm?symbol=AAPL&limit=1&apikey=test-api-key",
      { headers: { accept: "application/json" } },
    );
    expect(result).toMatchObject({
      ok: true,
      data: [
        {
          symbol: "AAPL",
          fiscalPeriod: "TTM",
          fiscalYear: 2026,
          periodType: "ttm",
          eps: 6.2,
          bookValuePerShare: 4.4,
          peRatio: 28.4,
          pbRatio: 41.2,
          debtToEquity: 1.28,
          currentRatio: 0.98,
          dividendYield: 0.005,
          freeCashFlow: 105000,
        },
      ],
    });
  });

  it("maps malformed symbols before making provider calls", async () => {
    const fetchFn = vi.fn();

    const result = await createProvider(fetchFn).getLatestPrice("$AAPL");

    expect(fetchFn).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "invalid_symbol",
      },
    });
  });

  it("maps rate-limit provider responses", async () => {
    const fetchFn = vi.fn(async () =>
      jsonResponse({ error: "Rate limit exceeded." }, { status: 429 }),
    );

    const result = await createProvider(fetchFn).getCompanyProfile("AAPL");

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "rate_limited",
        message: "Rate limit exceeded.",
      },
    });
  });
});
