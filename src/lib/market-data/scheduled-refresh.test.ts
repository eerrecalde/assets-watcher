import { describe, expect, it, vi } from "vitest";

import {
  listTrackedMarketDataSymbols,
  refreshTrackedMarketData,
  type ScheduledRefreshClient,
} from "./scheduled-refresh";
import { createMarketDataFailure, createMarketDataSuccess } from "./provider";
import type { MarketDataPrice, MarketDataProvider } from "./provider";

function createRefreshClient({
  holdings = [],
  watchlist = [],
  holdingsError = null,
  watchlistError = null,
}: {
  holdings?: { symbol: string | null }[];
  watchlist?: { symbol: string | null }[];
  holdingsError?: { message: string } | null;
  watchlistError?: { message: string } | null;
} = {}) {
  const upsert = vi.fn(async () => ({ error: null }));
  const select = vi.fn(async function selectSymbols(this: { table: string }) {
    if (this.table === "holdings") {
      return { data: holdings, error: holdingsError };
    }

    return { data: watchlist, error: watchlistError };
  });
  const from = vi.fn((table: string) => {
    if (table === "holdings" || table === "watchlist_items") {
      return {
        table,
        select,
      };
    }

    return { upsert };
  });

  return {
    client: { from } as unknown as ScheduledRefreshClient,
    from,
    select,
    upsert,
  };
}

function createProvider() {
  const fetchedAt = new Date("2026-06-05T12:00:00.000Z");
  const provider: MarketDataProvider = {
    id: "test-provider",
    displayName: "Test Provider",
    getCompanyProfile: vi.fn(async (symbol: string) =>
      createMarketDataSuccess({
        provider: "test-provider",
        fetchedAt,
        data: {
          symbol,
          name: `${symbol} Inc.`,
          exchange: "NASDAQ",
          sector: "Technology",
          industry: "Software",
          country: "US",
          currency: "USD",
        },
      }),
    ),
    getLatestPrice: vi.fn(async (symbol: string) => {
      if (symbol === "MSFT") {
        return createMarketDataFailure<MarketDataPrice>({
          provider: "test-provider",
          fetchedAt,
          code: "rate_limited",
          message: "Rate limited",
        });
      }

      return createMarketDataSuccess({
        provider: "test-provider",
        fetchedAt,
        data: {
          symbol,
          priceDate: "2026-06-05",
          open: 199,
          high: 203,
          low: 198,
          close: 202.5,
          volume: 45678900,
        },
      });
    }),
    getHistoricalPrices: vi.fn(),
    getFundamentals: vi.fn(),
  };

  return provider;
}

describe("listTrackedMarketDataSymbols", () => {
  it("deduplicates normalized holding and watchlist symbols", async () => {
    const { client } = createRefreshClient({
      holdings: [{ symbol: " aapl " }, { symbol: "MSFT" }],
      watchlist: [
        { symbol: "AAPL" },
        { symbol: "googl" },
        { symbol: null },
        { symbol: "not valid" },
      ],
    });

    await expect(listTrackedMarketDataSymbols(client)).resolves.toEqual([
      "AAPL",
      "GOOGL",
      "MSFT",
    ]);
  });

  it("surfaces database errors while loading tracked symbols", async () => {
    const { client } = createRefreshClient({
      holdingsError: { message: "permission denied" },
    });

    await expect(listTrackedMarketDataSymbols(client)).rejects.toThrow(
      "Could not load holding symbols for scheduled refresh: permission denied",
    );
  });
});

describe("refreshTrackedMarketData", () => {
  it("refreshes every tracked symbol and reports per-symbol failures", async () => {
    const { client, upsert } = createRefreshClient();
    const provider = createProvider();

    const result = await refreshTrackedMarketData({
      provider,
      requestedAt: new Date("2026-06-06T09:00:00.000Z"),
      supabase: client,
      symbols: ["msft", "AAPL", "AAPL"],
    });

    expect(result).toEqual({
      requestedAt: "2026-06-06T09:00:00.000Z",
      symbols: ["AAPL", "MSFT"],
      refreshed: [
        {
          symbol: "AAPL",
          profile: { ok: true },
          latestPrice: {
            ok: true,
            priceDate: "2026-06-05",
            close: 202.5,
          },
        },
      ],
      failed: [
        {
          symbol: "MSFT",
          profile: { ok: true },
          latestPrice: {
            ok: false,
            code: "rate_limited",
            message: "Rate limited",
          },
        },
      ],
    });
    expect(provider.getCompanyProfile).toHaveBeenCalledTimes(2);
    expect(provider.getLatestPrice).toHaveBeenCalledTimes(2);
    expect(upsert).toHaveBeenCalledTimes(3);
  });
});
