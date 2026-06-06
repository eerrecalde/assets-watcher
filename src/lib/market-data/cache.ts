import {
  createMarketDataSuccess,
  normalizeMarketDataSymbol,
  type MarketDataCompanyProfile,
  type MarketDataProvider,
  type MarketDataProviderErrorCode,
} from "./provider";
import type { Database } from "@/types/supabase";

type StockInsert = Database["public"]["Tables"]["stocks"]["Insert"];

export type MarketDataCacheErrorCode =
  | MarketDataProviderErrorCode
  | "cache_write_failed";

export type CompanyProfileCacheResult =
  | ReturnType<typeof createMarketDataSuccess<MarketDataCompanyProfile>>
  | {
      ok: false;
      provider: string;
      fetchedAt: Date;
      error: {
        code: MarketDataCacheErrorCode;
        message: string;
      };
    };

export type CompanyProfileCacheClient = {
  from(table: "stocks"): {
    upsert(
      values: StockInsert,
      options: { onConflict: "symbol" },
    ): PromiseLike<{ error: { message: string } | null }>;
  };
};

type CacheCompanyProfileOptions = {
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
}): CompanyProfileCacheResult {
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
