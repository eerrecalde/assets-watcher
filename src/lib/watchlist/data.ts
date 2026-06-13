import type { SupabaseClient } from "@supabase/supabase-js";

import { ensureDefaultPortfolioForUser } from "../portfolios/defaults";
import { toFiniteNumber } from "../portfolios/totals";
import {
  classifyStockDetailPriceFreshness,
  type StockDetailPriceFreshness,
} from "../stocks/detail";
import type { Database } from "../../types/supabase";

type AppSupabaseClient = SupabaseClient<Database>;
type PortfolioRow = Database["public"]["Tables"]["portfolios"]["Row"];
type StockRow = Database["public"]["Tables"]["stocks"]["Row"];
type StockPriceRow = Database["public"]["Tables"]["stock_prices"]["Row"];
type StockScoreRow = Database["public"]["Tables"]["stock_scores"]["Row"];
type WatchlistItemRow =
  Database["public"]["Tables"]["watchlist_items"]["Row"];

type AuthenticatedUser = {
  email?: string | null;
  id: string;
};

export type DefaultPortfolioWatchlistItem = Pick<
  WatchlistItemRow,
  | "created_at"
  | "id"
  | "notes"
  | "portfolio_id"
  | "symbol"
  | "target_price"
  | "updated_at"
  | "user_id"
>;

export type DefaultPortfolioWatchlistResult =
  | {
      error?: never;
      items: DefaultPortfolioWatchlistItem[];
      portfolio: Pick<PortfolioRow, "base_currency" | "id" | "name">;
    }
  | {
      error: string;
      items?: never;
      portfolio?: never;
    };

export type EnrichedWatchlistLoadErrorScope =
  | "latest_prices"
  | "stock_scores"
  | "stocks";

export type EnrichedWatchlistLoadError = {
  message: string;
  scope: EnrichedWatchlistLoadErrorScope;
};

export type EnrichedWatchlistLatestPrice = {
  cachedAt: string;
  close: number;
  closeRaw: string;
  freshness: StockDetailPriceFreshness;
  priceDate: string;
};

export type EnrichedWatchlistStockScore = {
  marginOfSafetyPercent: number | null;
  marketContextScore: number | null;
  overallLabel: StockScoreRow["overall_label"];
  qualityScore: number | null;
  safetyScore: number | null;
  scoredAt: string;
  valuationScore: number | null;
};

export type EnrichedDefaultPortfolioWatchlistItem = {
  companyName: string | null;
  detailHref: string;
  id: string;
  insufficientData: {
    company: boolean;
    latestCachedPrice: boolean;
    marginOfSafety: boolean;
    stockScore: boolean;
  };
  latestCachedPrice: EnrichedWatchlistLatestPrice | null;
  notes: string | null;
  portfolioId: string;
  stockCurrency: string | null;
  stockScore: EnrichedWatchlistStockScore | null;
  symbol: string;
  targetPrice: string | null;
  userId: string;
  watchlistItem: DefaultPortfolioWatchlistItem;
};

export type EnrichedDefaultPortfolioWatchlistResult =
  | {
      error?: never;
      items: EnrichedDefaultPortfolioWatchlistItem[];
      loadErrors: EnrichedWatchlistLoadError[];
      portfolio: Pick<PortfolioRow, "base_currency" | "id" | "name">;
    }
  | {
      error: string;
      items?: never;
      loadErrors?: never;
      portfolio?: never;
    };

export type EnrichedDefaultPortfolioWatchlistOptions = {
  currentDate?: Date;
};

export async function listDefaultPortfolioWatchlistItems(
  supabase: AppSupabaseClient,
  user: AuthenticatedUser,
): Promise<DefaultPortfolioWatchlistResult> {
  const defaultPortfolioResult = await ensureDefaultPortfolioForUser(
    supabase,
    user,
  );

  if ("error" in defaultPortfolioResult) {
    return {
      error:
        defaultPortfolioResult.error ?? "Could not load your default portfolio.",
    };
  }

  const { data, error } = await supabase
    .from("watchlist_items")
    .select(
      "created_at,id,notes,portfolio_id,symbol,target_price,updated_at,user_id",
    )
    .eq("portfolio_id", defaultPortfolioResult.portfolio.id)
    .eq("user_id", user.id)
    .order("symbol", { ascending: true });

  if (error) {
    console.error("Could not load default portfolio watchlist.", error);

    return {
      error: "Could not load your watchlist.",
    };
  }

  return {
    items: data ?? [],
    portfolio: defaultPortfolioResult.portfolio,
  };
}

export async function listEnrichedDefaultPortfolioWatchlistItems(
  supabase: AppSupabaseClient,
  user: AuthenticatedUser,
  options: EnrichedDefaultPortfolioWatchlistOptions = {},
): Promise<EnrichedDefaultPortfolioWatchlistResult> {
  const watchlistResult = await listDefaultPortfolioWatchlistItems(
    supabase,
    user,
  );

  if ("error" in watchlistResult) {
    return {
      error: watchlistResult.error ?? "Could not load your watchlist.",
    };
  }

  const symbols = watchlistResult.items.map((item) => item.symbol);

  if (!symbols.length) {
    return {
      items: [],
      loadErrors: [],
      portfolio: watchlistResult.portfolio,
    };
  }

  const [stocksResult, pricesResult, stockScoresResult] = await Promise.all([
    supabase
      .from("stocks")
      .select("symbol,name,currency")
      .in("symbol", symbols),
    supabase
      .from("stock_prices")
      .select("symbol,close,price_date,created_at")
      .in("symbol", symbols)
      .order("price_date", { ascending: false }),
    supabase
      .from("stock_scores")
      .select(
        "symbol,overall_label,valuation_score,quality_score,safety_score,market_context_score,scored_at,explanation_json",
      )
      .in("symbol", symbols)
      .order("scored_at", { ascending: false }),
  ]);

  const loadErrors = [
    createLoadError("stocks", stocksResult.error?.message),
    createLoadError("latest_prices", pricesResult.error?.message),
    createLoadError("stock_scores", stockScoresResult.error?.message),
  ].filter((error): error is EnrichedWatchlistLoadError =>
    Boolean(error),
  );

  for (const loadError of loadErrors) {
    console.error("Enriched watchlist data load failed.", loadError);
  }

  const stocksBySymbol = new Map(
    ((stocksResult.data ?? []) as Pick<
      StockRow,
      "currency" | "name" | "symbol"
    >[]).map((stock) => [stock.symbol, stock]),
  );
  const latestPricesBySymbol = buildLatestBySymbol(
    (pricesResult.data ?? []) as Pick<
      StockPriceRow,
      "close" | "created_at" | "price_date" | "symbol"
    >[],
    (row) => row.price_date,
  );
  const latestScoresBySymbol = buildLatestBySymbol(
    (stockScoresResult.data ?? []) as Pick<
      StockScoreRow,
      | "explanation_json"
      | "market_context_score"
      | "overall_label"
      | "quality_score"
      | "safety_score"
      | "scored_at"
      | "symbol"
      | "valuation_score"
    >[],
    (row) => row.scored_at,
  );

  return {
    items: watchlistResult.items.map((item) =>
      createEnrichedWatchlistItem({
        currentDate: options.currentDate,
        item,
        latestPrice: latestPricesBySymbol.get(item.symbol) ?? null,
        stock: stocksBySymbol.get(item.symbol) ?? null,
        stockScore: latestScoresBySymbol.get(item.symbol) ?? null,
      }),
    ),
    loadErrors,
    portfolio: watchlistResult.portfolio,
  };
}

function createEnrichedWatchlistItem({
  currentDate,
  item,
  latestPrice,
  stock,
  stockScore,
}: {
  currentDate?: Date;
  item: DefaultPortfolioWatchlistItem;
  latestPrice: Pick<
    StockPriceRow,
    "close" | "created_at" | "price_date" | "symbol"
  > | null;
  stock: Pick<StockRow, "currency" | "name" | "symbol"> | null;
  stockScore: Pick<
    StockScoreRow,
    | "explanation_json"
    | "market_context_score"
    | "overall_label"
    | "quality_score"
    | "safety_score"
    | "scored_at"
    | "symbol"
    | "valuation_score"
  > | null;
}): EnrichedDefaultPortfolioWatchlistItem {
  const latestCachedPrice = createLatestCachedWatchlistPrice(
    latestPrice,
    currentDate,
  );
  const enrichedStockScore = createWatchlistStockScore(stockScore);

  return {
    companyName: stock?.name ?? null,
    detailHref: `/stocks/${encodeURIComponent(item.symbol)}`,
    id: item.id,
    insufficientData: {
      company: !stock?.name,
      latestCachedPrice: latestCachedPrice === null,
      marginOfSafety:
        !enrichedStockScore ||
        enrichedStockScore.marginOfSafetyPercent === null,
      stockScore: enrichedStockScore === null,
    },
    latestCachedPrice,
    notes: item.notes,
    portfolioId: item.portfolio_id,
    stockCurrency: stock?.currency ?? null,
    stockScore: enrichedStockScore,
    symbol: item.symbol,
    targetPrice: item.target_price,
    userId: item.user_id,
    watchlistItem: item,
  };
}

function createLatestCachedWatchlistPrice(
  latestPrice: Pick<
    StockPriceRow,
    "close" | "created_at" | "price_date" | "symbol"
  > | null,
  currentDate?: Date,
): EnrichedWatchlistLatestPrice | null {
  const close = toFiniteNumber(latestPrice?.close);

  if (!latestPrice || close === null) {
    return null;
  }

  return {
    cachedAt: latestPrice.created_at,
    close,
    closeRaw: latestPrice.close,
    freshness: classifyStockDetailPriceFreshness(
      latestPrice.price_date,
      currentDate,
    ),
    priceDate: latestPrice.price_date,
  };
}

function createWatchlistStockScore(
  stockScore: Pick<
    StockScoreRow,
    | "explanation_json"
    | "market_context_score"
    | "overall_label"
    | "quality_score"
    | "safety_score"
    | "scored_at"
    | "valuation_score"
  > | null,
): EnrichedWatchlistStockScore | null {
  if (!stockScore) {
    return null;
  }

  return {
    marginOfSafetyPercent: extractMarginOfSafetyPercent(
      stockScore.explanation_json,
    ),
    marketContextScore: stockScore.market_context_score,
    overallLabel: stockScore.overall_label,
    qualityScore: stockScore.quality_score,
    safetyScore: stockScore.safety_score,
    scoredAt: stockScore.scored_at,
    valuationScore: stockScore.valuation_score,
  };
}

function extractMarginOfSafetyPercent(explanationJson: unknown) {
  if (!explanationJson || typeof explanationJson !== "object") {
    return null;
  }

  const explanation = explanationJson as Record<string, unknown>;
  const rawMarginOfSafety =
    explanation.margin_of_safety_percent ??
    explanation.marginOfSafetyPercent ??
    explanation.margin_of_safety ??
    explanation.marginOfSafety;
  const marginOfSafety = toFiniteNumber(
    rawMarginOfSafety as string | number | null | undefined,
  );

  return marginOfSafety;
}

function buildLatestBySymbol<T extends { symbol: string }>(
  rows: T[],
  getSortValue: (row: T) => string,
) {
  const latestRows = new Map<string, T>();

  for (const row of rows) {
    const previousRow = latestRows.get(row.symbol);

    if (!previousRow || getSortValue(row) > getSortValue(previousRow)) {
      latestRows.set(row.symbol, row);
    }
  }

  return latestRows;
}

function createLoadError(
  scope: EnrichedWatchlistLoadErrorScope,
  message: string | null | undefined,
) {
  return message ? { message, scope } : null;
}
