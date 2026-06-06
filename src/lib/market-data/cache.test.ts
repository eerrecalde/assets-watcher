import { describe, expect, it, vi } from "vitest";

import {
  cacheCompanyProfile,
  fetchAndCacheCompanyProfile,
  mapCompanyProfileToStock,
  type CompanyProfileCacheClient,
} from "./cache";
import { createMarketDataFailure, createMarketDataSuccess } from "./provider";
import type { MarketDataCompanyProfile, MarketDataProvider } from "./provider";

function createCacheClient(error: { message: string } | null = null) {
  const upsert = vi.fn(async () => ({ error }));
  const from = vi.fn(() => ({ upsert }));

  return {
    client: { from } as unknown as CompanyProfileCacheClient,
    from,
    upsert,
  };
}

describe("mapCompanyProfileToStock", () => {
  it("maps provider profile fields into the stocks cache row", () => {
    expect(
      mapCompanyProfileToStock({
        symbol: " aapl ",
        name: " Apple Inc. ",
        exchange: " NASDAQ ",
        sector: " Technology ",
        industry: " Consumer Electronics ",
        country: " us ",
        currency: " usd ",
      }),
    ).toEqual({
      symbol: "AAPL",
      name: "Apple Inc.",
      exchange: "NASDAQ",
      sector: "Technology",
      industry: "Consumer Electronics",
      country: "US",
      currency: "USD",
    });
  });

  it("uses safe defaults for optional country and currency gaps", () => {
    expect(
      mapCompanyProfileToStock({
        symbol: "MSFT",
        name: "",
        exchange: "",
        sector: null,
        industry: null,
        country: null,
        currency: "",
      }),
    ).toEqual({
      symbol: "MSFT",
      name: "MSFT",
      exchange: null,
      sector: null,
      industry: null,
      country: "US",
      currency: "USD",
    });
  });
});

describe("cacheCompanyProfile", () => {
  it("upserts company profiles into the stocks cache", async () => {
    const { client, upsert } = createCacheClient();
    const fetchedAt = new Date("2026-06-05T12:00:00.000Z");

    const result = await cacheCompanyProfile(
      client,
      {
        symbol: "AAPL",
        name: "Apple Inc.",
        exchange: "NASDAQ",
        sector: "Technology",
        industry: "Consumer Electronics",
        country: "US",
        currency: "USD",
      },
      {
        fetchedAt,
        provider: "test-provider",
      },
    );

    expect(upsert).toHaveBeenCalledWith(
      {
        symbol: "AAPL",
        name: "Apple Inc.",
        exchange: "NASDAQ",
        sector: "Technology",
        industry: "Consumer Electronics",
        country: "US",
        currency: "USD",
      },
      { onConflict: "symbol" },
    );
    expect(result).toEqual({
      ok: true,
      provider: "test-provider",
      fetchedAt,
      data: {
        symbol: "AAPL",
        name: "Apple Inc.",
        exchange: "NASDAQ",
        sector: "Technology",
        industry: "Consumer Electronics",
        country: "US",
        currency: "USD",
      },
      warnings: [],
    });
  });

  it("returns a cache write failure when Supabase rejects the upsert", async () => {
    const { client } = createCacheClient({ message: "permission denied" });
    const fetchedAt = new Date("2026-06-05T12:00:00.000Z");

    const result = await cacheCompanyProfile(
      client,
      {
        symbol: "AAPL",
        name: "Apple Inc.",
        exchange: null,
        sector: null,
        industry: null,
        country: "US",
        currency: "USD",
      },
      {
        fetchedAt,
        provider: "test-provider",
      },
    );

    expect(result).toEqual({
      ok: false,
      provider: "test-provider",
      fetchedAt,
      error: {
        code: "cache_write_failed",
        message:
          "Could not cache company profile for AAPL: permission denied",
      },
    });
  });
});

describe("fetchAndCacheCompanyProfile", () => {
  it("fetches a company profile through the provider before caching it", async () => {
    const { client, upsert } = createCacheClient();
    const fetchedAt = new Date("2026-06-05T12:00:00.000Z");
    const provider: MarketDataProvider = {
      id: "test-provider",
      displayName: "Test Provider",
      getCompanyProfile: vi.fn(async () =>
        createMarketDataSuccess({
          provider: "test-provider",
          fetchedAt,
          data: {
            symbol: "AAPL",
            name: "Apple Inc.",
            exchange: "NASDAQ",
            sector: "Technology",
            industry: "Consumer Electronics",
            country: "US",
            currency: "USD",
          },
        }),
      ),
      getLatestPrice: vi.fn(),
      getHistoricalPrices: vi.fn(),
      getFundamentals: vi.fn(),
    };

    const result = await fetchAndCacheCompanyProfile({
      provider,
      supabase: client,
      symbol: "aapl",
    });

    expect(provider.getCompanyProfile).toHaveBeenCalledWith("aapl");
    expect(upsert).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      ok: true,
      provider: "test-provider",
      data: {
        symbol: "AAPL",
        name: "Apple Inc.",
      },
    });
  });

  it("does not write to the cache when the provider fails", async () => {
    const { client, upsert } = createCacheClient();
    const fetchedAt = new Date("2026-06-05T12:00:00.000Z");
    const provider: MarketDataProvider = {
      id: "test-provider",
      displayName: "Test Provider",
      getCompanyProfile: vi.fn(async () =>
        createMarketDataFailure<MarketDataCompanyProfile>({
          provider: "test-provider",
          fetchedAt,
          code: "not_found",
          message: "Symbol was not found.",
        }),
      ),
      getLatestPrice: vi.fn(),
      getHistoricalPrices: vi.fn(),
      getFundamentals: vi.fn(),
    };

    const result = await fetchAndCacheCompanyProfile({
      provider,
      supabase: client,
      symbol: "MISSING",
    });

    expect(upsert).not.toHaveBeenCalled();
    expect(result).toEqual({
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
