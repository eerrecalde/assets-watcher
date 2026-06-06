import {
  fetchAndCacheCompanyProfile,
  fetchAndCacheLatestPrice,
  type CompanyProfileCacheClient,
  type LatestPriceCacheClient,
} from "./cache";
import {
  normalizeMarketDataSymbol,
  type MarketDataProvider,
} from "./provider";

type SymbolRow = {
  symbol: string | null;
};

export type TrackedSymbolsClient = {
  from(table: "holdings" | "watchlist_items"): {
    select(
      columns: "symbol",
    ): PromiseLike<{ data: SymbolRow[] | null; error: { message: string } | null }>;
  };
};

export type ScheduledRefreshClient = CompanyProfileCacheClient &
  LatestPriceCacheClient &
  TrackedSymbolsClient;

export type ScheduledMarketDataRefreshResult = {
  requestedAt: string;
  symbols: string[];
  refreshed: ScheduledMarketDataRefreshSymbolResult[];
  failed: ScheduledMarketDataRefreshSymbolResult[];
};

export type ScheduledMarketDataRefreshSymbolResult = {
  symbol: string;
  profile:
    | { ok: true }
    | {
        ok: false;
        code: string;
        message: string;
      };
  latestPrice:
    | {
        ok: true;
        priceDate: string;
        close: number;
      }
    | {
        ok: false;
        code: string;
        message: string;
      };
};

export async function listTrackedMarketDataSymbols(
  supabase: TrackedSymbolsClient,
) {
  const [holdingsResult, watchlistResult] = await Promise.all([
    supabase.from("holdings").select("symbol"),
    supabase.from("watchlist_items").select("symbol"),
  ]);

  if (holdingsResult.error) {
    throw new Error(
      `Could not load holding symbols for scheduled refresh: ${holdingsResult.error.message}`,
    );
  }

  if (watchlistResult.error) {
    throw new Error(
      `Could not load watchlist symbols for scheduled refresh: ${watchlistResult.error.message}`,
    );
  }

  return dedupeAndNormalizeSymbols([
    ...(holdingsResult.data ?? []),
    ...(watchlistResult.data ?? []),
  ]);
}

export async function refreshTrackedMarketData({
  provider,
  requestedAt = new Date(),
  supabase,
  symbols,
}: {
  provider: MarketDataProvider;
  requestedAt?: Date;
  supabase: ScheduledRefreshClient;
  symbols?: string[];
}): Promise<ScheduledMarketDataRefreshResult> {
  const trackedSymbols =
    symbols === undefined
      ? await listTrackedMarketDataSymbols(supabase)
      : dedupeAndNormalizeSymbols(symbols.map((symbol) => ({ symbol })));

  const results: ScheduledMarketDataRefreshSymbolResult[] = [];

  for (const symbol of trackedSymbols) {
    results.push(
      await refreshSingleTrackedSymbol({
        provider,
        supabase,
        symbol,
      }),
    );
  }

  return {
    requestedAt: requestedAt.toISOString(),
    symbols: trackedSymbols,
    refreshed: results.filter((result) => result.latestPrice.ok),
    failed: results.filter((result) => !result.latestPrice.ok),
  };
}

async function refreshSingleTrackedSymbol({
  provider,
  supabase,
  symbol,
}: {
  provider: MarketDataProvider;
  supabase: CompanyProfileCacheClient & LatestPriceCacheClient;
  symbol: string;
}): Promise<ScheduledMarketDataRefreshSymbolResult> {
  const profileResult = await fetchAndCacheCompanyProfile({
    provider,
    supabase,
    symbol,
  });
  const priceResult = await fetchAndCacheLatestPrice({
    provider,
    supabase,
    symbol,
  });

  return {
    symbol,
    profile: profileResult.ok
      ? { ok: true }
      : {
          ok: false,
          code: profileResult.error.code,
          message: profileResult.error.message,
        },
    latestPrice: priceResult.ok
      ? {
          ok: true,
          priceDate: priceResult.data.priceDate,
          close: priceResult.data.close,
        }
      : {
          ok: false,
          code: priceResult.error.code,
          message: priceResult.error.message,
        },
  };
}

function dedupeAndNormalizeSymbols(rows: SymbolRow[]) {
  return Array.from(
    new Set(
      rows.flatMap((row) => {
        if (!row.symbol) {
          return [];
        }

        try {
          return [normalizeMarketDataSymbol(row.symbol)];
        } catch {
          return [];
        }
      }),
    ),
  ).sort((first, second) => first.localeCompare(second));
}
