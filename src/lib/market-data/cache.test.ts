import { describe, expect, it, vi } from "vitest";

import {
  cacheHistoricalPrices,
  cacheCompanyProfile,
  cacheLatestPrice,
  fetchAndCacheCompanyProfile,
  fetchAndCacheHistoricalPrices,
  fetchAndCacheLatestPrice,
  mapCompanyProfileToStock,
  mapLatestPriceToStockPrice,
  type CompanyProfileCacheClient,
  type LatestPriceCacheClient,
} from "./cache";
import { createMarketDataFailure, createMarketDataSuccess } from "./provider";
import type {
  MarketDataCompanyProfile,
  MarketDataPrice,
  MarketDataProvider,
} from "./provider";

function createCacheClient(error: { message: string } | null = null) {
  const upsert = vi.fn(async () => ({ error }));
  const from = vi.fn(() => ({ upsert }));

  return {
    client: { from } as unknown as CompanyProfileCacheClient,
    from,
    upsert,
  };
}

function createPriceCacheClient(error: { message: string } | null = null) {
  const upsert = vi.fn(async () => ({ error }));
  const from = vi.fn(() => ({ upsert }));

  return {
    client: { from } as unknown as LatestPriceCacheClient,
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

describe("mapLatestPriceToStockPrice", () => {
  it("maps provider latest price fields into the stock_prices cache row", () => {
    expect(
      mapLatestPriceToStockPrice({
        symbol: " msft ",
        priceDate: "2026-06-05",
        open: 429.12,
        high: 431.5,
        low: 427,
        close: 430.25,
        volume: 12345678,
      }),
    ).toEqual({
      symbol: "MSFT",
      price_date: "2026-06-05",
      open: "429.12",
      high: "431.5",
      low: "427",
      close: "430.25",
      volume: 12345678,
    });
  });

  it("preserves nullable latest price fields", () => {
    expect(
      mapLatestPriceToStockPrice({
        symbol: "AAPL",
        priceDate: "2026-06-05",
        open: null,
        high: null,
        low: null,
        close: 201,
        volume: null,
      }),
    ).toEqual({
      symbol: "AAPL",
      price_date: "2026-06-05",
      open: null,
      high: null,
      low: null,
      close: "201",
      volume: null,
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

describe("cacheLatestPrice", () => {
  it("upserts latest prices into the stock_prices cache", async () => {
    const { client, upsert } = createPriceCacheClient();
    const fetchedAt = new Date("2026-06-05T12:00:00.000Z");

    const result = await cacheLatestPrice(
      client,
      {
        symbol: "AAPL",
        priceDate: "2026-06-05",
        open: 199.5,
        high: 203,
        low: 198.25,
        close: 202.75,
        volume: 45678900,
      },
      {
        fetchedAt,
        provider: "test-provider",
      },
    );

    expect(upsert).toHaveBeenCalledWith(
      {
        symbol: "AAPL",
        price_date: "2026-06-05",
        open: "199.5",
        high: "203",
        low: "198.25",
        close: "202.75",
        volume: 45678900,
      },
      { onConflict: "symbol,price_date" },
    );
    expect(result).toEqual({
      ok: true,
      provider: "test-provider",
      fetchedAt,
      data: {
        symbol: "AAPL",
        priceDate: "2026-06-05",
        open: 199.5,
        high: 203,
        low: 198.25,
        close: 202.75,
        volume: 45678900,
      },
      warnings: [],
    });
  });

  it("returns a cache write failure when Supabase rejects the upsert", async () => {
    const { client } = createPriceCacheClient({ message: "permission denied" });
    const fetchedAt = new Date("2026-06-05T12:00:00.000Z");

    const result = await cacheLatestPrice(
      client,
      {
        symbol: "AAPL",
        priceDate: "2026-06-05",
        open: null,
        high: null,
        low: null,
        close: 202.75,
        volume: null,
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
          "Could not cache latest price for AAPL on 2026-06-05: permission denied",
      },
    });
  });
});

describe("cacheHistoricalPrices", () => {
  it("upserts historical prices into the stock_prices cache as a batch", async () => {
    const { client, upsert } = createPriceCacheClient();
    const fetchedAt = new Date("2026-06-05T12:00:00.000Z");

    const result = await cacheHistoricalPrices(
      client,
      [
        {
          symbol: "AAPL",
          priceDate: "2026-06-05",
          open: 199.5,
          high: 203,
          low: 198.25,
          close: 202.75,
          volume: 45678900,
        },
        {
          symbol: "AAPL",
          priceDate: "2026-06-04",
          open: 198,
          high: 201,
          low: 197.5,
          close: 199.25,
          volume: 40123000,
        },
      ],
      {
        fetchedAt,
        provider: "test-provider",
      },
    );

    expect(upsert).toHaveBeenCalledWith(
      [
        {
          symbol: "AAPL",
          price_date: "2026-06-05",
          open: "199.5",
          high: "203",
          low: "198.25",
          close: "202.75",
          volume: 45678900,
        },
        {
          symbol: "AAPL",
          price_date: "2026-06-04",
          open: "198",
          high: "201",
          low: "197.5",
          close: "199.25",
          volume: 40123000,
        },
      ],
      { onConflict: "symbol,price_date" },
    );
    expect(result).toEqual({
      ok: true,
      provider: "test-provider",
      fetchedAt,
      data: [
        {
          symbol: "AAPL",
          priceDate: "2026-06-05",
          open: 199.5,
          high: 203,
          low: 198.25,
          close: 202.75,
          volume: 45678900,
        },
        {
          symbol: "AAPL",
          priceDate: "2026-06-04",
          open: 198,
          high: 201,
          low: 197.5,
          close: 199.25,
          volume: 40123000,
        },
      ],
      warnings: [],
    });
  });

  it("does not write when there are no historical prices to cache", async () => {
    const { client, upsert } = createPriceCacheClient();
    const fetchedAt = new Date("2026-06-05T12:00:00.000Z");

    const result = await cacheHistoricalPrices(client, [], {
      fetchedAt,
      provider: "test-provider",
    });

    expect(upsert).not.toHaveBeenCalled();
    expect(result).toEqual({
      ok: true,
      provider: "test-provider",
      fetchedAt,
      data: [],
      warnings: [],
    });
  });

  it("returns a cache write failure when Supabase rejects the batch upsert", async () => {
    const { client } = createPriceCacheClient({ message: "permission denied" });
    const fetchedAt = new Date("2026-06-05T12:00:00.000Z");

    const result = await cacheHistoricalPrices(
      client,
      [
        {
          symbol: "AAPL",
          priceDate: "2026-06-05",
          open: null,
          high: null,
          low: null,
          close: 202.75,
          volume: null,
        },
      ],
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
        message: "Could not cache historical prices for AAPL: permission denied",
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

describe("fetchAndCacheHistoricalPrices", () => {
  it("fetches historical prices through the provider before caching them", async () => {
    const { client, upsert } = createPriceCacheClient();
    const fetchedAt = new Date("2026-06-05T12:00:00.000Z");
    const provider: MarketDataProvider = {
      id: "test-provider",
      displayName: "Test Provider",
      getCompanyProfile: vi.fn(),
      getLatestPrice: vi.fn(),
      getHistoricalPrices: vi.fn(async () =>
        createMarketDataSuccess({
          provider: "test-provider",
          fetchedAt,
          data: [
            {
              symbol: "AAPL",
              priceDate: "2026-06-05",
              open: 199.5,
              high: 203,
              low: 198.25,
              close: 202.75,
              volume: 45678900,
            },
          ],
        }),
      ),
      getFundamentals: vi.fn(),
    };

    const request = {
      startDate: "2026-06-01",
      endDate: "2026-06-05",
      limit: 5,
    };
    const result = await fetchAndCacheHistoricalPrices({
      provider,
      request,
      supabase: client,
      symbol: "aapl",
    });

    expect(provider.getHistoricalPrices).toHaveBeenCalledWith("aapl", request);
    expect(upsert).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      ok: true,
      provider: "test-provider",
      data: [
        {
          symbol: "AAPL",
          priceDate: "2026-06-05",
          close: 202.75,
        },
      ],
    });
  });

  it("does not write to the cache when the historical provider fetch fails", async () => {
    const { client, upsert } = createPriceCacheClient();
    const fetchedAt = new Date("2026-06-05T12:00:00.000Z");
    const provider: MarketDataProvider = {
      id: "test-provider",
      displayName: "Test Provider",
      getCompanyProfile: vi.fn(),
      getLatestPrice: vi.fn(),
      getHistoricalPrices: vi.fn(async () =>
        createMarketDataFailure<MarketDataPrice[]>({
          provider: "test-provider",
          fetchedAt,
          code: "not_found",
          message: "Symbol was not found.",
        }),
      ),
      getFundamentals: vi.fn(),
    };

    const result = await fetchAndCacheHistoricalPrices({
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

describe("fetchAndCacheLatestPrice", () => {
  it("fetches a latest price through the provider before caching it", async () => {
    const { client, upsert } = createPriceCacheClient();
    const fetchedAt = new Date("2026-06-05T12:00:00.000Z");
    const provider: MarketDataProvider = {
      id: "test-provider",
      displayName: "Test Provider",
      getCompanyProfile: vi.fn(),
      getLatestPrice: vi.fn(async () =>
        createMarketDataSuccess({
          provider: "test-provider",
          fetchedAt,
          data: {
            symbol: "AAPL",
            priceDate: "2026-06-05",
            open: 199.5,
            high: 203,
            low: 198.25,
            close: 202.75,
            volume: 45678900,
          },
        }),
      ),
      getHistoricalPrices: vi.fn(),
      getFundamentals: vi.fn(),
    };

    const result = await fetchAndCacheLatestPrice({
      provider,
      supabase: client,
      symbol: "aapl",
    });

    expect(provider.getLatestPrice).toHaveBeenCalledWith("aapl");
    expect(upsert).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      ok: true,
      provider: "test-provider",
      data: {
        symbol: "AAPL",
        priceDate: "2026-06-05",
        close: 202.75,
      },
    });
  });

  it("does not write to the cache when the provider fails", async () => {
    const { client, upsert } = createPriceCacheClient();
    const fetchedAt = new Date("2026-06-05T12:00:00.000Z");
    const provider: MarketDataProvider = {
      id: "test-provider",
      displayName: "Test Provider",
      getCompanyProfile: vi.fn(),
      getLatestPrice: vi.fn(async () =>
        createMarketDataFailure<MarketDataPrice>({
          provider: "test-provider",
          fetchedAt,
          code: "not_found",
          message: "Symbol was not found.",
        }),
      ),
      getHistoricalPrices: vi.fn(),
      getFundamentals: vi.fn(),
    };

    const result = await fetchAndCacheLatestPrice({
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
