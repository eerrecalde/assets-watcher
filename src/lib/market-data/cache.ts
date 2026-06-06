import {
  createMarketDataSuccess,
  normalizeMarketDataSymbol,
  type MarketDataCompanyProfile,
  type HistoricalPriceRequest,
  type MarketDataPrice,
  type MarketDataProvider,
  type MarketDataProviderErrorCode,
} from "./provider";
import type { Database } from "@/types/supabase";

type StockInsert = Database["public"]["Tables"]["stocks"]["Insert"];
type StockPriceInsert =
  Database["public"]["Tables"]["stock_prices"]["Insert"];
type StockPriceUpsert = StockPriceInsert | StockPriceInsert[];

export type MarketDataCacheErrorCode =
  | MarketDataProviderErrorCode
  | "cache_write_failed";

type MarketDataCacheFailure = {
  ok: false;
  provider: string;
  fetchedAt: Date;
  error: {
    code: MarketDataCacheErrorCode;
    message: string;
  };
};

export type CompanyProfileCacheResult =
  | ReturnType<typeof createMarketDataSuccess<MarketDataCompanyProfile>>
  | MarketDataCacheFailure;

export type LatestPriceCacheResult =
  | ReturnType<typeof createMarketDataSuccess<MarketDataPrice>>
  | MarketDataCacheFailure;

export type HistoricalPricesCacheResult =
  | ReturnType<typeof createMarketDataSuccess<MarketDataPrice[]>>
  | MarketDataCacheFailure;

export type CompanyProfileCacheClient = {
  from(table: "stocks"): {
    upsert(
      values: StockInsert,
      options: { onConflict: "symbol" },
    ): PromiseLike<{ error: { message: string } | null }>;
  };
};

export type LatestPriceCacheClient = {
  from(table: "stock_prices"): {
    upsert(
      values: StockPriceUpsert,
      options: { onConflict: "symbol,price_date" },
    ): PromiseLike<{ error: { message: string } | null }>;
  };
};

type CacheCompanyProfileOptions = {
  fetchedAt?: Date;
  provider?: string;
  warnings?: string[];
};

type CacheLatestPriceOptions = {
  fetchedAt?: Date;
  provider?: string;
  warnings?: string[];
};

type CacheHistoricalPricesOptions = {
  fetchedAt?: Date;
  provider?: string;
  warnings?: string[];
};

export async function cacheCompanyProfile(
  supabase: CompanyProfileCacheClient,
  profile: MarketDataCompanyProfile,
  {
    fetchedAt = new Date(),
    provider = "market-data-cache",
    warnings = [],
  }: CacheCompanyProfileOptions = {},
): Promise<CompanyProfileCacheResult> {
  const stock = mapCompanyProfileToStock(profile);
  const { error } = await supabase
    .from("stocks")
    .upsert(stock, { onConflict: "symbol" });

  if (error) {
    return createCacheFailure({
      code: "cache_write_failed",
      fetchedAt,
      message: `Could not cache company profile for ${stock.symbol}: ${error.message}`,
      provider,
    });
  }

  return createMarketDataSuccess({
    data: {
      symbol: stock.symbol,
      name: stock.name,
      exchange: stock.exchange ?? null,
      sector: stock.sector ?? null,
      industry: stock.industry ?? null,
      country: stock.country ?? "US",
      currency: stock.currency ?? "USD",
    },
    fetchedAt,
    provider,
    warnings,
  });
}

export async function cacheLatestPrice(
  supabase: LatestPriceCacheClient,
  price: MarketDataPrice,
  {
    fetchedAt = new Date(),
    provider = "market-data-cache",
    warnings = [],
  }: CacheLatestPriceOptions = {},
): Promise<LatestPriceCacheResult> {
  const stockPrice = mapLatestPriceToStockPrice(price);
  const { error } = await supabase
    .from("stock_prices")
    .upsert(stockPrice, { onConflict: "symbol,price_date" });

  if (error) {
    return createCacheFailure({
      code: "cache_write_failed",
      fetchedAt,
      message: `Could not cache latest price for ${stockPrice.symbol} on ${stockPrice.price_date}: ${error.message}`,
      provider,
    });
  }

  return createMarketDataSuccess({
    data: {
      symbol: stockPrice.symbol,
      priceDate: stockPrice.price_date,
      open: parseOptionalNumber(stockPrice.open),
      high: parseOptionalNumber(stockPrice.high),
      low: parseOptionalNumber(stockPrice.low),
      close: Number(stockPrice.close),
      volume: stockPrice.volume ?? null,
    },
    fetchedAt,
    provider,
    warnings,
  });
}

export async function cacheHistoricalPrices(
  supabase: LatestPriceCacheClient,
  prices: MarketDataPrice[],
  {
    fetchedAt = new Date(),
    provider = "market-data-cache",
    warnings = [],
  }: CacheHistoricalPricesOptions = {},
): Promise<HistoricalPricesCacheResult> {
  const stockPrices = prices.map(mapLatestPriceToStockPrice);

  if (stockPrices.length > 0) {
    const { error } = await supabase
      .from("stock_prices")
      .upsert(stockPrices, { onConflict: "symbol,price_date" });

    if (error) {
      const symbols = Array.from(
        new Set(stockPrices.map((stockPrice) => stockPrice.symbol)),
      ).join(", ");

      return createCacheFailure({
        code: "cache_write_failed",
        fetchedAt,
        message: `Could not cache historical prices for ${symbols}: ${error.message}`,
        provider,
      });
    }
  }

  return createMarketDataSuccess({
    data: stockPrices.map(mapStockPriceToMarketDataPrice),
    fetchedAt,
    provider,
    warnings,
  });
}

export async function fetchAndCacheCompanyProfile({
  provider,
  supabase,
  symbol,
}: {
  provider: MarketDataProvider;
  supabase: CompanyProfileCacheClient;
  symbol: string;
}): Promise<CompanyProfileCacheResult> {
  const result = await provider.getCompanyProfile(symbol);

  if (!result.ok) {
    return result;
  }

  return cacheCompanyProfile(supabase, result.data, {
    fetchedAt: result.fetchedAt,
    provider: result.provider,
    warnings: result.warnings,
  });
}

export async function fetchAndCacheLatestPrice({
  provider,
  supabase,
  symbol,
}: {
  provider: MarketDataProvider;
  supabase: LatestPriceCacheClient;
  symbol: string;
}): Promise<LatestPriceCacheResult> {
  const result = await provider.getLatestPrice(symbol);

  if (!result.ok) {
    return result;
  }

  return cacheLatestPrice(supabase, result.data, {
    fetchedAt: result.fetchedAt,
    provider: result.provider,
    warnings: result.warnings,
  });
}

export async function fetchAndCacheHistoricalPrices({
  provider,
  request,
  supabase,
  symbol,
}: {
  provider: MarketDataProvider;
  request?: HistoricalPriceRequest;
  supabase: LatestPriceCacheClient;
  symbol: string;
}): Promise<HistoricalPricesCacheResult> {
  const result = await provider.getHistoricalPrices(symbol, request);

  if (!result.ok) {
    return result;
  }

  return cacheHistoricalPrices(supabase, result.data, {
    fetchedAt: result.fetchedAt,
    provider: result.provider,
    warnings: result.warnings,
  });
}

export function mapCompanyProfileToStock(
  profile: MarketDataCompanyProfile,
): StockInsert {
  const symbol = normalizeMarketDataSymbol(profile.symbol);

  return {
    symbol,
    name: normalizeRequiredText(profile.name, symbol),
    exchange: normalizeOptionalText(profile.exchange),
    sector: normalizeOptionalText(profile.sector),
    industry: normalizeOptionalText(profile.industry),
    country: normalizeRequiredText(profile.country, "US").toUpperCase(),
    currency: normalizeRequiredText(profile.currency, "USD").toUpperCase(),
  };
}

export function mapLatestPriceToStockPrice(
  price: MarketDataPrice,
): StockPriceInsert {
  return {
    symbol: normalizeMarketDataSymbol(price.symbol),
    price_date: price.priceDate,
    open: stringifyOptionalNumber(price.open),
    high: stringifyOptionalNumber(price.high),
    low: stringifyOptionalNumber(price.low),
    close: stringifyRequiredNumber(price.close),
    volume: price.volume,
  };
}

function mapStockPriceToMarketDataPrice(
  stockPrice: StockPriceInsert,
): MarketDataPrice {
  return {
    symbol: stockPrice.symbol,
    priceDate: stockPrice.price_date,
    open: parseOptionalNumber(stockPrice.open),
    high: parseOptionalNumber(stockPrice.high),
    low: parseOptionalNumber(stockPrice.low),
    close: Number(stockPrice.close),
    volume: stockPrice.volume ?? null,
  };
}

function createCacheFailure({
  code,
  fetchedAt,
  message,
  provider,
}: {
  code: MarketDataCacheErrorCode;
  fetchedAt: Date;
  message: string;
  provider: string;
}): MarketDataCacheFailure {
  return {
    ok: false,
    provider,
    fetchedAt,
    error: {
      code,
      message,
    },
  };
}

function normalizeOptionalText(value: string | null) {
  const normalized = value?.trim();

  return normalized ? normalized : null;
}

function normalizeRequiredText(value: string | null, fallback: string) {
  return normalizeOptionalText(value) ?? fallback;
}

function stringifyOptionalNumber(value: number | null) {
  return value === null ? null : stringifyRequiredNumber(value);
}

function stringifyRequiredNumber(value: number) {
  if (!Number.isFinite(value)) {
    throw new Error("Market data numeric values must be finite.");
  }

  return String(value);
}

function parseOptionalNumber(value: string | null | undefined) {
  return value === null || value === undefined ? null : Number(value);
}
