import { redirect } from "next/navigation";
import Link from "next/link";

import { GenerateAITakeButton } from "@/components/ai/generate-ai-take-button";
import { StockSymbolLink } from "@/components/stocks/stock-symbol-link";
import { generateAITakeAction } from "@/lib/ai/actions";
import type {
  AITakeDeterministicFact,
  AITakePortfolioSnapshot,
} from "@/lib/ai/provider";
import { signOutAction } from "@/lib/auth/actions";
import { ensureDefaultPortfolioForUser } from "@/lib/portfolios/defaults";
import {
  calculateCashAllocation,
  calculateHoldingValue,
  calculatePositionAllocation,
  calculatePortfolioTotals,
  calculateSectorAllocations,
  toFiniteNumber,
} from "@/lib/portfolios/totals";
import {
  DEFAULT_GRAHAM_SCORING_THRESHOLDS,
  type GrahamScoringThresholds,
} from "@/lib/scoring/thresholds";
import {
  loadUserRuleThresholds,
  type UserRulesClient,
} from "@/lib/scoring/user-rules";
import { classifyStockDetailPriceFreshness } from "@/lib/stocks/detail";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/supabase";

export const dynamic = "force-dynamic";

type HoldingRow = Database["public"]["Tables"]["holdings"]["Row"];
type AITakeRow = Database["public"]["Tables"]["ai_takes"]["Row"];
type PortfolioCashRow = Database["public"]["Tables"]["portfolio_cash"]["Row"];
type PortfolioScoreRow =
  Database["public"]["Tables"]["portfolio_stock_scores"]["Row"];
type StockRow = Database["public"]["Tables"]["stocks"]["Row"];
type StockPriceRow = Database["public"]["Tables"]["stock_prices"]["Row"];
type StockScoreRow = Database["public"]["Tables"]["stock_scores"]["Row"];
type WatchlistItemRow =
  Database["public"]["Tables"]["watchlist_items"]["Row"];
type LatestAITakeRow = Pick<
  AITakeRow,
  "created_at" | "input_snapshot_json" | "model" | "output_markdown" | "provider"
>;
type LatestPriceRow = Pick<StockPriceRow, "symbol" | "close" | "price_date">;
type LatestStockScoreRow = Pick<
  StockScoreRow,
  "symbol" | "overall_label" | "scored_at"
>;
type LatestPortfolioScoreRow = Pick<
  PortfolioScoreRow,
  "symbol" | "portfolio_fit_label" | "scored_at"
>;
type ReviewQueueItemKind =
  | "allocation"
  | "score_change"
  | "target_price"
  | "watchlist_opportunity";
type ReviewQueueItem = {
  context: string;
  detail: string;
  href: string;
  id: string;
  kind: ReviewQueueItemKind;
  priority: number;
  symbol: string;
  title: string;
};

const currencyFormatterCache = new Map<string, Intl.NumberFormat>();
const MAX_AI_TAKE_FACTS = 6;

type DashboardPageProps = {
  searchParams?: Promise<{
    error?: string;
    success?: string;
  }>;
};

function formatNumber(value: number, maximumFractionDigits = 6) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits,
    minimumFractionDigits: 0,
  }).format(value);
}

function formatCurrency(value: number | null, currency: string) {
  if (value === null) {
    return "Not cached";
  }

  const cacheKey = currency.toUpperCase();
  const cachedFormatter = currencyFormatterCache.get(cacheKey);

  if (cachedFormatter) {
    return cachedFormatter.format(value);
  }

  const formatter = new Intl.NumberFormat("en-US", {
    currency: cacheKey,
    maximumFractionDigits: 2,
    style: "currency",
  });

  currencyFormatterCache.set(cacheKey, formatter);

  return formatter.format(value);
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
  }).format(new Date(value));
}

function formatFreshnessStatus(status: string) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function formatOptionalCurrency(
  value: number | null,
  currency: string,
  fallback: string,
) {
  return value === null ? fallback : formatCurrency(value, currency);
}

function buildLatestMap<T extends { symbol: string }>(rows: T[]) {
  const latestRows = new Map<string, T>();

  for (const row of rows) {
    if (!latestRows.has(row.symbol)) {
      latestRows.set(row.symbol, row);
    }
  }

  return latestRows;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDeterministicFact(value: unknown): value is AITakeDeterministicFact {
  return (
    isRecord(value) &&
    typeof value.description === "string" &&
    (typeof value.asOfDate === "string" || value.asOfDate === null) &&
    typeof value.source === "string"
  );
}

function parseAITakeSnapshot(value: unknown): AITakePortfolioSnapshot | null {
  if (!isRecord(value)) {
    return null;
  }

  const portfolio = value.portfolio;

  if (
    typeof value.generatedAt !== "string" ||
    !isRecord(portfolio) ||
    !Array.isArray(portfolio.deterministicFacts) ||
    !Array.isArray(value.holdings) ||
    !Array.isArray(value.watchlist)
  ) {
    return null;
  }

  return value as unknown as AITakePortfolioSnapshot;
}

function getAITakeSnapshotDate(snapshot: AITakePortfolioSnapshot | null) {
  return snapshot?.portfolio.asOfDate ?? snapshot?.generatedAt ?? null;
}

function getAITakeFacts(snapshot: AITakePortfolioSnapshot | null) {
  if (!snapshot) {
    return [];
  }

  const holdingFacts = snapshot.holdings.flatMap(
    (holding) => holding.deterministicFacts,
  );
  const watchlistFacts = snapshot.watchlist.flatMap(
    (item) => item.deterministicFacts,
  );

  return [
    ...snapshot.portfolio.deterministicFacts,
    ...holdingFacts,
    ...watchlistFacts,
  ]
    .filter(isDeterministicFact)
    .slice(0, MAX_AI_TAKE_FACTS);
}

function isPortfolioFitOffset(label: string | null) {
  return [
    "Cash Constrained",
    "Concentration Risk",
    "Do Not Add",
    "Overweight",
    "Review Position",
  ].includes(label ?? "");
}

function isPositiveStockLabel(label: string | null) {
  return label === "Attractive" || label === "Reasonable";
}

function getStockLabelRank(label: string | null) {
  const ranks = new Map([
    ["Attractive", 1],
    ["Reasonable", 2],
    ["Watch", 3],
    ["Expensive", 4],
    ["Avoid / Review", 5],
    ["Insufficient Data", 6],
  ]);

  return ranks.get(label ?? "") ?? null;
}

function buildStockScoreHistory(rows: LatestStockScoreRow[]) {
  const history = new Map<string, LatestStockScoreRow[]>();

  for (const row of rows) {
    const rowsForSymbol = history.get(row.symbol) ?? [];
    rowsForSymbol.push(row);
    history.set(row.symbol, rowsForSymbol);
  }

  return history;
}

function buildReviewQueueItems({
  displayCurrency,
  enrichedHoldings,
  latestPricesBySymbol,
  maxSingleStockAllocationPercent,
  cashAmountInput,
  ruleSource,
  scoreHistoryBySymbol,
  stocksBySymbol,
  watchlistItems,
}: {
  displayCurrency: string;
  enrichedHoldings: Array<{
    averageCost: number;
    costBasis: number;
    holding: HoldingRow;
    latestClose: number | null;
    marketValue: number | null;
    portfolioFitLabel: string | null;
    portfolioValue: number;
    quantity: number;
    stockLabel: string | null;
    unrealizedGain: number | null;
  }>;
  latestPricesBySymbol: Map<string, LatestPriceRow>;
  maxSingleStockAllocationPercent: number;
  cashAmountInput: string | number | null | undefined;
  ruleSource: "stored" | "defaults";
  scoreHistoryBySymbol: Map<string, LatestStockScoreRow[]>;
  stocksBySymbol: Map<
    string,
    Pick<StockRow, "currency" | "name" | "sector" | "symbol">
  >;
  watchlistItems: WatchlistItemRow[];
}) {
  const items: ReviewQueueItem[] = [];

  for (const row of enrichedHoldings) {
    const allocation = calculatePositionAllocation({
      cashAmountInput,
      holding: row,
      holdings: enrichedHoldings,
    });

    if (
      allocation.percentage !== null &&
      allocation.percentage > maxSingleStockAllocationPercent
    ) {
      const thresholdContext =
        ruleSource === "stored" ? "your current rule" : "the product-plan default";

      items.push({
        context: `${row.holding.symbol} is ${formatNumber(allocation.percentage, 2)}% of the portfolio, above the ${formatNumber(maxSingleStockAllocationPercent, 2)}% single-stock allocation threshold from ${thresholdContext}.`,
        detail: `Portfolio context uses cached market value ${formatCurrency(row.marketValue, displayCurrency)} and denominator ${formatCurrency(allocation.denominatorValue, displayCurrency)}. This is an informational concentration flag, not a directive to sell.`,
        href: `/stocks/${row.holding.symbol}`,
        id: `allocation_threshold:${row.holding.symbol}`,
        kind: "allocation",
        priority: 10,
        symbol: row.holding.symbol,
        title: `${row.holding.symbol} is above allocation threshold`,
      });

      continue;
    }

    if (allocation.status === "insufficient-data") {
      items.push({
        context: `Single-stock allocation could not be calculated against the ${formatNumber(maxSingleStockAllocationPercent, 2)}% threshold.`,
        detail:
          "Cached price, holding value, cash, or portfolio denominator data is insufficient, so this position is not flagged as above the threshold.",
        href: `/stocks/${row.holding.symbol}`,
        id: `allocation_insufficient_data:${row.holding.symbol}`,
        kind: "allocation",
        priority: 12,
        symbol: row.holding.symbol,
        title: `${row.holding.symbol} allocation needs more data`,
      });

      continue;
    }

    if (isPortfolioFitOffset(row.portfolioFitLabel)) {
      items.push({
        context: `Portfolio fit: ${row.portfolioFitLabel}`,
        detail:
          "Deterministic portfolio context suggests this owned position may need review.",
        href: `/stocks/${row.holding.symbol}`,
        id: `portfolio_fit:${row.holding.symbol}`,
        kind: "allocation",
        priority: 18,
        symbol: row.holding.symbol,
        title: `${row.holding.symbol} allocation needs review`,
      });
    }
  }

  for (const item of watchlistItems) {
    const latestPrice = latestPricesBySymbol.get(item.symbol);
    const latestClose = toFiniteNumber(latestPrice?.close);
    const targetPrice = toFiniteNumber(item.target_price);
    const stock = stocksBySymbol.get(item.symbol);
    const currency = stock?.currency ?? displayCurrency;
    const latestScore = scoreHistoryBySymbol.get(item.symbol)?.[0] ?? null;

    if (targetPrice !== null && latestClose === null) {
      items.push({
        context: `Target price is ${formatCurrency(targetPrice, currency)}, but no usable latest cached price is available.`,
        detail:
          "The target-price rule cannot compare this watchlist item until cached price data exists. This is an informational data-quality flag, not a buy instruction.",
        href: `/stocks/${item.symbol}`,
        id: `target_price_missing_data:${item.symbol}`,
        kind: "target_price",
        priority: 22,
        symbol: item.symbol,
        title: `${item.symbol} target price needs cached price data`,
      });
    }

    if (
      latestClose !== null &&
      targetPrice !== null &&
      latestClose <= targetPrice
    ) {
      const freshness = classifyStockDetailPriceFreshness(
        latestPrice?.price_date,
      );
      const asOfText = freshness.asOfDate
        ? formatDate(freshness.asOfDate)
        : "Unavailable";

      items.push({
        context: `${formatCurrency(latestClose, currency)} latest cached close is at or below the ${formatCurrency(targetPrice, currency)} target price. As of ${asOfText}. Freshness: ${formatFreshnessStatus(freshness.status)}.`,
        detail: `${freshness.reason} This is an educational watchlist flag from cached data, not a buy instruction.`,
        href: `/stocks/${item.symbol}`,
        id: `target_price:${item.symbol}`,
        kind: "target_price",
        priority: 20,
        symbol: item.symbol,
        title: `${item.symbol} is at or below target`,
      });
    }

    if (
      isPositiveStockLabel(latestScore?.overall_label ?? null) &&
      (targetPrice === null || latestClose === null || latestClose <= targetPrice)
    ) {
      items.push({
        context: `Latest deterministic stock label: ${latestScore?.overall_label}`,
        detail:
          "A watched stock has a positive deterministic label based on cached scoring inputs.",
        href: `/stocks/${item.symbol}`,
        id: `watchlist_opportunity:${item.symbol}`,
        kind: "watchlist_opportunity",
        priority: 30,
        symbol: item.symbol,
        title: `${item.symbol} watchlist opportunity`,
      });
    }
  }

  for (const [symbol, history] of scoreHistoryBySymbol.entries()) {
    const [latestScore, previousScore] = history;

    if (!latestScore || !previousScore) {
      continue;
    }

    if (latestScore.overall_label === previousScore.overall_label) {
      continue;
    }

    const latestRank = getStockLabelRank(latestScore.overall_label);
    const previousRank = getStockLabelRank(previousScore.overall_label);
    const direction =
      latestRank !== null && previousRank !== null
        ? latestRank < previousRank
          ? "improved"
          : "weakened"
        : "changed";

    items.push({
      context: `Stock label ${direction} from ${previousScore.overall_label} to ${latestScore.overall_label}.`,
      detail: `Latest score was calculated ${formatDateTime(latestScore.scored_at)}.`,
      href: `/stocks/${symbol}`,
      id: `score_change:${symbol}`,
      kind: "score_change",
      priority: direction === "weakened" ? 15 : 40,
      symbol,
      title: `${symbol} score changed`,
    });
  }

  return items
    .sort((first, second) => {
      if (first.priority !== second.priority) {
        return first.priority - second.priority;
      }

      return first.symbol.localeCompare(second.symbol);
    })
    .slice(0, 8);
}

function LabelState({
  label,
  missingText,
}: {
  label: string | null;
  missingText: string;
}) {
  return label ? (
    <span className="text-neutral-200">{label}</span>
  ) : (
    <span className="text-neutral-500">{missingText}</span>
  );
}

export default async function DashboardPage({
  searchParams,
}: DashboardPageProps = {}) {
  const feedback = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?next=${encodeURIComponent("/dashboard")}`);
  }

  const defaultPortfolioResult = await ensureDefaultPortfolioForUser(
    supabase,
    user,
  );
  const portfolio = defaultPortfolioResult.portfolio;
  const portfolioError = defaultPortfolioResult.error;
  const displayCurrency = portfolio?.base_currency ?? "USD";
  const cashResult = portfolio
    ? await supabase
        .from("portfolio_cash")
        .select("amount,currency,updated_at")
        .eq("portfolio_id", portfolio.id)
        .eq("currency", displayCurrency)
        .maybeSingle()
    : {
        data: null as Pick<
          PortfolioCashRow,
          "amount" | "currency" | "updated_at"
        > | null,
        error: null,
      };
  const holdingsResult = portfolio
    ? await supabase
        .from("holdings")
        .select(
          "id,portfolio_id,symbol,quantity,average_cost,currency,created_at,updated_at",
        )
        .eq("portfolio_id", portfolio.id)
        .order("symbol", { ascending: true })
    : { data: [] as HoldingRow[], error: null };
  const watchlistResult = portfolio
    ? await supabase
        .from("watchlist_items")
        .select(
          "id,portfolio_id,symbol,target_price,notes,user_id,created_at,updated_at",
        )
        .eq("portfolio_id", portfolio.id)
        .eq("user_id", user.id)
        .order("symbol", { ascending: true })
    : { data: [] as WatchlistItemRow[], error: null };
  const userRulesResult = await loadUserRuleThresholds(
    supabase as unknown as UserRulesClient,
    user.id,
  );

  const holdings = holdingsResult.data ?? [];
  const watchlistItems = watchlistResult.data ?? [];
  const holdingSymbols = holdings.map((holding) => holding.symbol);
  const watchlistSymbols = watchlistItems.map((item) => item.symbol);
  const symbols = Array.from(new Set([...holdingSymbols, ...watchlistSymbols]));
  const stocksResult = symbols.length
    ? await supabase
        .from("stocks")
        .select("symbol,name,currency,sector")
        .in("symbol", symbols)
    : {
        data: [] as Pick<StockRow, "currency" | "name" | "sector" | "symbol">[],
        error: null,
      };
  const pricesResult = symbols.length
    ? await supabase
        .from("stock_prices")
        .select("symbol,close,price_date")
        .in("symbol", symbols)
        .order("price_date", { ascending: false })
    : {
        data: [] as Pick<StockPriceRow, "symbol" | "close" | "price_date">[],
        error: null,
      };
  const stockScoresResult = symbols.length
    ? await supabase
        .from("stock_scores")
        .select("symbol,overall_label,scored_at")
        .in("symbol", symbols)
        .eq("user_id", user.id)
        .order("scored_at", { ascending: false })
    : {
        data: [] as Pick<
          StockScoreRow,
          "symbol" | "overall_label" | "scored_at"
        >[],
        error: null,
      };
  const portfolioScoresResult =
    portfolio && holdingSymbols.length
      ? await supabase
          .from("portfolio_stock_scores")
          .select("symbol,portfolio_fit_label,scored_at")
          .eq("portfolio_id", portfolio.id)
          .in("symbol", holdingSymbols)
          .order("scored_at", { ascending: false })
      : {
          data: [] as Pick<
            PortfolioScoreRow,
            "symbol" | "portfolio_fit_label" | "scored_at"
          >[],
          error: null,
        };
  const latestAITakeResult = portfolio
    ? await supabase
        .from("ai_takes")
        .select("created_at,input_snapshot_json,model,output_markdown,provider")
        .eq("portfolio_id", portfolio.id)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
    : {
        data: [] as Pick<
          AITakeRow,
          | "created_at"
          | "input_snapshot_json"
          | "model"
          | "output_markdown"
          | "provider"
        >[],
        error: null,
      };

  const stocksBySymbol = new Map(
    (stocksResult.data ?? []).map((stock) => [stock.symbol, stock]),
  );
  const latestPricesBySymbol = buildLatestMap(
    (pricesResult.data ?? []) as Pick<
      StockPriceRow,
      "symbol" | "close" | "price_date"
    >[],
  );
  const latestStockScoresBySymbol = buildLatestMap(
    (stockScoresResult.data ?? []) as LatestStockScoreRow[],
  );
  const scoreHistoryBySymbol = buildStockScoreHistory(
    (stockScoresResult.data ?? []) as LatestStockScoreRow[],
  );
  const latestPortfolioScoresBySymbol = buildLatestMap(
    (portfolioScoresResult.data ?? []) as LatestPortfolioScoreRow[],
  );
  const enrichedHoldings = holdings.map((holding) => {
    const latestPrice = latestPricesBySymbol.get(holding.symbol);
    const calculatedValue = calculateHoldingValue({
      averageCost: holding.average_cost,
      latestClose: latestPrice?.close,
      quantity: holding.quantity,
    });

    return {
      ...calculatedValue,
      holding,
      latestPriceDate: latestPrice?.price_date,
      portfolioFitLabel:
        latestPortfolioScoresBySymbol.get(holding.symbol)
          ?.portfolio_fit_label ?? null,
      stockLabel:
        latestStockScoresBySymbol.get(holding.symbol)?.overall_label ?? null,
      stockName: stocksBySymbol.get(holding.symbol)?.name ?? holding.symbol,
      sector: stocksBySymbol.get(holding.symbol)?.sector ?? null,
    };
  });
  const portfolioTotals = calculatePortfolioTotals(
    enrichedHoldings,
    cashResult.data?.amount,
  );
  const cashAmountValue = cashResult.data?.amount;
  const ruleThresholds: GrahamScoringThresholds = userRulesResult.ok
    ? userRulesResult.thresholds
    : DEFAULT_GRAHAM_SCORING_THRESHOLDS;
  const cashAllocation = calculateCashAllocation({
    cashAmountInput: cashAmountValue,
    holdings: enrichedHoldings,
  });
  const sectorAllocations = calculateSectorAllocations({
    cashAmountInput: cashAmountValue,
    holdings: enrichedHoldings,
  });
  const hasHoldingsLoadError =
    Boolean(holdingsResult.error) ||
    Boolean(stocksResult.error) ||
    Boolean(pricesResult.error) ||
    Boolean(stockScoresResult.error) ||
    Boolean(portfolioScoresResult.error) ||
    !userRulesResult.ok ||
    Boolean(cashResult.error);
  const hasWatchlistLoadError =
    Boolean(watchlistResult.error) ||
    Boolean(stocksResult.error) ||
    Boolean(pricesResult.error);
  const latestAITake =
    (latestAITakeResult.data?.[0] as
      | LatestAITakeRow
      | undefined) ?? null;
  const latestAITakeSnapshot = parseAITakeSnapshot(
    latestAITake?.input_snapshot_json,
  );
  const latestAITakeSnapshotDate = getAITakeSnapshotDate(latestAITakeSnapshot);
  const latestAITakeFacts = getAITakeFacts(latestAITakeSnapshot);
  const reviewQueueItems = buildReviewQueueItems({
    displayCurrency,
    enrichedHoldings,
    cashAmountInput: cashAmountValue,
    latestPricesBySymbol,
    maxSingleStockAllocationPercent:
      ruleThresholds.maxSingleStockAllocationPercent,
    ruleSource: userRulesResult.ok ? userRulesResult.source : "defaults",
    scoreHistoryBySymbol,
    stocksBySymbol,
    watchlistItems,
  });

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <section className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-6 py-10 sm:px-8">
        <header className="flex flex-col gap-5 border-b border-neutral-800 pb-8 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.16em] text-emerald-300">
              Manual portfolio tracker
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-normal text-white">
              Dashboard
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-neutral-400">
              Review manually tracked positions with cached prices, allocation,
              and deterministic labels when those snapshots are available.
            </p>
          </div>

          <form action={signOutAction}>
            <button
              className="h-10 rounded-md border border-neutral-700 px-4 text-sm font-medium text-neutral-200 transition hover:border-neutral-500 hover:text-white"
              type="submit"
            >
              Log out
            </button>
          </form>
        </header>

        <div className="grid gap-8 py-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm text-neutral-400">Signed in as</p>
              <p className="mt-2 text-lg font-medium text-white">
                {user.email}
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                className="inline-flex h-10 items-center justify-center rounded-md border border-neutral-700 px-4 text-sm font-medium text-neutral-200 transition hover:border-neutral-500 hover:text-white"
                href="/settings/rules"
              >
                Rules
              </Link>
              <Link
                className="inline-flex h-10 items-center justify-center rounded-md border border-neutral-700 px-4 text-sm font-medium text-neutral-200 transition hover:border-neutral-500 hover:text-white"
                href="/watchlist"
              >
                Watchlist
              </Link>
              <Link
                className="inline-flex h-10 items-center justify-center rounded-md bg-emerald-400 px-4 text-sm font-semibold text-neutral-950 transition hover:bg-emerald-300"
                href="/holdings"
              >
                Manage holdings
              </Link>
            </div>
          </div>

          {portfolioError ? (
            <p className="rounded-md border border-red-900 bg-red-950/60 px-4 py-3 text-sm text-red-200">
              {portfolioError}
            </p>
          ) : null}
          {feedback?.success ? (
            <p className="rounded-md border border-emerald-900 bg-emerald-950/60 px-4 py-3 text-sm text-emerald-100">
              {feedback.success}
            </p>
          ) : null}
          {feedback?.error ? (
            <p className="rounded-md border border-red-900 bg-red-950/60 px-4 py-3 text-sm text-red-200">
              {feedback.error}
            </p>
          ) : null}

          <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
            <article className="rounded-lg border border-neutral-800 bg-neutral-900/70 p-5">
              <p className="text-sm text-neutral-400">Portfolio</p>
              <p className="mt-2 text-lg font-semibold text-white">
                {portfolio?.name ?? "Not found"}
              </p>
            </article>
            <article className="rounded-lg border border-neutral-800 bg-neutral-900/70 p-5">
              <p className="text-sm text-neutral-400">Holdings</p>
              <p className="mt-2 text-lg font-semibold text-white">
                {holdings.length}
              </p>
            </article>
            <article className="rounded-lg border border-neutral-800 bg-neutral-900/70 p-5">
              <p className="text-sm text-neutral-400">Watched stocks</p>
              <p className="mt-2 text-lg font-semibold text-white">
                {watchlistItems.length}
              </p>
            </article>
            <article className="rounded-lg border border-neutral-800 bg-neutral-900/70 p-5">
              <p className="text-sm text-neutral-400">Cash balance</p>
              <p className="mt-2 text-lg font-semibold text-white">
                {formatCurrency(portfolioTotals.cashAmount, displayCurrency)}
              </p>
            </article>
            <article className="rounded-lg border border-neutral-800 bg-neutral-900/70 p-5">
              <p className="text-sm text-neutral-400">Cash allocation</p>
              <p className="mt-2 text-lg font-semibold text-white">
                {cashAllocation.percentage === null
                  ? "Not available"
                  : `${formatNumber(cashAllocation.percentage, 2)}%`}
              </p>
              {cashAllocation.status === "partial-market-data" ? (
                <p className="mt-1 text-xs text-amber-300">Partial data</p>
              ) : null}
            </article>
            <article className="rounded-lg border border-neutral-800 bg-neutral-900/70 p-5">
              <p className="text-sm text-neutral-400">Holdings value</p>
              <p className="mt-2 text-lg font-semibold text-white">
                {formatCurrency(
                  portfolioTotals.holdingsValueTotal,
                  displayCurrency,
                )}
              </p>
            </article>
            <article className="rounded-lg border border-neutral-800 bg-neutral-900/70 p-5">
              <p className="text-sm text-neutral-400">Overall value</p>
              <p className="mt-2 text-lg font-semibold text-white">
                {formatCurrency(
                  portfolioTotals.totalPortfolioValue,
                  displayCurrency,
                )}
              </p>
            </article>
            <article className="rounded-lg border border-neutral-800 bg-neutral-900/70 p-5">
              <p className="text-sm text-neutral-400">Unrealised gain/loss</p>
              <p
                className={`mt-2 text-lg font-semibold ${
                  !portfolioTotals.hasCachedMarketValues
                    ? "text-neutral-300"
                    : portfolioTotals.unrealizedTotal >= 0
                      ? "text-emerald-200"
                      : "text-red-200"
                }`}
              >
                {formatCurrency(
                  portfolioTotals.hasCachedMarketValues
                    ? portfolioTotals.unrealizedTotal
                    : null,
                  displayCurrency,
                )}
              </p>
            </article>
          </div>

          <section className="border-t border-neutral-800 pt-8">
            <div>
              <h2 className="text-lg font-semibold text-white">
                Review queue
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-400">
                Deterministic attention items from your holdings, watchlist,
                cached prices, and saved scoring snapshots.
              </p>
            </div>

            {reviewQueueItems.length ? (
              <ol className="mt-5 grid gap-3">
                {reviewQueueItems.map((item, index) => (
                  <li
                    className="rounded-lg border border-neutral-800 bg-neutral-900/70 p-5"
                    key={item.id}
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-xs font-medium uppercase tracking-[0.14em] text-neutral-500">
                          #{index + 1} / {item.kind.replaceAll("_", " ")}
                        </p>
                        <h3 className="mt-2 text-base font-semibold text-white">
                          {item.title}
                        </h3>
                      </div>
                      <Link
                        className="text-sm font-medium text-emerald-200 underline-offset-4 transition hover:text-emerald-100 hover:underline"
                        href={item.href}
                      >
                        View stock
                      </Link>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-neutral-300">
                      {item.context}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-neutral-500">
                      {item.detail}
                    </p>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-5 rounded-lg border border-neutral-800 bg-neutral-900/70 px-4 py-3 text-sm text-neutral-400">
                Nothing is currently flagged for review by the deterministic
                rules and cached portfolio data. This is informational only and
                not financial advice.
              </p>
            )}
          </section>

          <section className="border-t border-neutral-800 pt-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white">AI take</h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-400">
                  Generate a cautious educational explanation from the current
                  deterministic portfolio snapshot.
                </p>
              </div>
              <form action={generateAITakeAction}>
                <GenerateAITakeButton />
              </form>
            </div>

            {latestAITakeResult.error ? (
              <p className="mt-6 rounded-md border border-red-900 bg-red-950/60 px-4 py-3 text-sm text-red-200">
                Latest AI take could not be loaded.
              </p>
            ) : latestAITake ? (
              <article className="mt-5 rounded-lg border border-neutral-800 bg-neutral-900/70 p-5">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm font-medium text-neutral-200">
                    Generated {formatDateTime(latestAITake.created_at)}
                  </p>
                  <p className="text-xs uppercase tracking-[0.14em] text-neutral-500">
                    {latestAITake.provider} / {latestAITake.model}
                  </p>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-md border border-neutral-800 bg-neutral-950 px-3 py-3">
                    <p className="text-xs uppercase tracking-[0.14em] text-neutral-500">
                      Provider/model
                    </p>
                    <p className="mt-2 text-sm text-neutral-200">
                      {latestAITake.provider} / {latestAITake.model}
                    </p>
                  </div>
                  <div className="rounded-md border border-neutral-800 bg-neutral-950 px-3 py-3">
                    <p className="text-xs uppercase tracking-[0.14em] text-neutral-500">
                      Snapshot date
                    </p>
                    <p className="mt-2 text-sm text-neutral-200">
                      {latestAITakeSnapshotDate
                        ? formatDate(latestAITakeSnapshotDate)
                        : "Snapshot metadata unavailable"}
                    </p>
                  </div>
                  <div className="rounded-md border border-neutral-800 bg-neutral-950 px-3 py-3">
                    <p className="text-xs uppercase tracking-[0.14em] text-neutral-500">
                      Limitation
                    </p>
                    <p className="mt-2 text-sm text-neutral-200">
                      Educational explanation only, not financial advice.
                    </p>
                  </div>
                </div>

                <div className="mt-5 rounded-md border border-emerald-900/60 bg-emerald-950/20 p-4">
                  <p className="text-xs font-medium uppercase tracking-[0.14em] text-emerald-300">
                    Educational explanation
                  </p>
                  <p className="mt-3 whitespace-pre-line text-sm leading-6 text-neutral-200">
                    {latestAITake.output_markdown}
                  </p>
                </div>

                <div className="mt-5">
                  <h3 className="text-sm font-semibold text-white">
                    Underlying deterministic facts
                  </h3>
                  {latestAITakeFacts.length ? (
                    <ul className="mt-3 space-y-2 text-sm leading-6 text-neutral-300">
                      {latestAITakeFacts.map((fact, index) => (
                        <li
                          className="rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2"
                          key={`${fact.source}-${fact.description}-${index}`}
                        >
                          <span>{fact.description}</span>
                          {fact.asOfDate ? (
                            <span className="ml-2 text-xs text-neutral-500">
                              As of {formatDate(fact.asOfDate)}
                            </span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-3 rounded-md border border-amber-900 bg-amber-950/40 px-4 py-3 text-sm text-amber-100">
                      Underlying deterministic facts are unavailable for this
                      stored take.
                    </p>
                  )}
                </div>
              </article>
            ) : (
              <p className="mt-5 rounded-lg border border-neutral-800 bg-neutral-900/70 px-4 py-3 text-sm text-neutral-400">
                No AI take has been generated for this portfolio yet.
              </p>
            )}
          </section>

          <section className="border-t border-neutral-800 pt-8">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white">
                  Sector allocation
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-400">
                  Exposure by cached stock sector using current cached market
                  values and cash in the allocation denominator.
                </p>
              </div>
              {sectorAllocations.some(
                (allocation) => allocation.status === "partial-market-data",
              ) ? (
                <p className="text-sm text-amber-300">Partial market data</p>
              ) : null}
            </div>

            {hasHoldingsLoadError ? (
              <p className="mt-6 rounded-md border border-red-900 bg-red-950/60 px-4 py-3 text-sm text-red-200">
                Sector allocation could not be fully loaded.
              </p>
            ) : null}

            {sectorAllocations.length ? (
              <div className="mt-5 overflow-x-auto rounded-lg border border-neutral-800">
                <table className="min-w-[44rem] w-full border-collapse text-left text-sm">
                  <thead className="bg-neutral-900 text-xs uppercase tracking-[0.14em] text-neutral-400">
                    <tr>
                      <th className="px-4 py-3 font-medium">Sector</th>
                      <th className="px-4 py-3 font-medium">Holdings</th>
                      <th className="px-4 py-3 font-medium">Cached value</th>
                      <th className="px-4 py-3 font-medium">Portfolio %</th>
                      <th className="px-4 py-3 font-medium">Data state</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-800">
                    {sectorAllocations.map((allocation) => (
                      <tr className="bg-neutral-950" key={allocation.sector}>
                        <td className="px-4 py-4 align-top text-neutral-200">
                          {allocation.sector}
                        </td>
                        <td className="px-4 py-4 align-top text-neutral-300">
                          {allocation.holdingCount}
                        </td>
                        <td className="px-4 py-4 align-top text-neutral-300">
                          {allocation.numeratorMarketValue > 0
                            ? formatCurrency(
                                allocation.numeratorMarketValue,
                                displayCurrency,
                              )
                            : "Not cached"}
                        </td>
                        <td className="px-4 py-4 align-top text-neutral-300">
                          {allocation.percentage === null
                            ? "Not cached"
                            : `${formatNumber(allocation.percentage, 2)}%`}
                        </td>
                        <td className="px-4 py-4 align-top">
                          <span
                            className={
                              allocation.status === "calculated"
                                ? "text-emerald-200"
                                : allocation.status === "partial-market-data"
                                  ? "text-amber-300"
                                  : "text-neutral-400"
                            }
                          >
                            {allocation.status === "calculated"
                              ? "Calculated"
                              : allocation.status === "partial-market-data"
                                ? "Partial data"
                                : "Insufficient data"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="mt-5 rounded-lg border border-neutral-800 bg-neutral-900/70 px-4 py-3 text-sm text-neutral-400">
                No sector exposure yet.
              </p>
            )}
          </section>

          <section className="border-t border-neutral-800 pt-8">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white">
                  Holdings
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-400">
                  Current owned positions from your default portfolio. Values
                  use the latest cached close where available.
                </p>
              </div>
              <p className="text-sm text-neutral-400">
                Cost basis:{" "}
                {formatCurrency(
                  portfolioTotals.costBasisTotal,
                  displayCurrency,
                )}
              </p>
            </div>

            {hasHoldingsLoadError ? (
              <p className="mt-6 rounded-md border border-red-900 bg-red-950/60 px-4 py-3 text-sm text-red-200">
                Some holdings data could not be loaded.
              </p>
            ) : null}

            {enrichedHoldings.length ? (
              <div className="mt-5 overflow-x-auto rounded-lg border border-neutral-800">
                <table className="min-w-[82rem] w-full border-collapse text-left text-sm">
                  <thead className="bg-neutral-900 text-xs uppercase tracking-[0.14em] text-neutral-400">
                    <tr>
                      <th className="px-4 py-3 font-medium">Symbol</th>
                      <th className="px-4 py-3 font-medium">Company</th>
                      <th className="px-4 py-3 font-medium">Quantity</th>
                      <th className="px-4 py-3 font-medium">Average cost</th>
                      <th className="px-4 py-3 font-medium">Latest price</th>
                      <th className="px-4 py-3 font-medium">Market value</th>
                      <th className="px-4 py-3 font-medium">Unrealised</th>
                      <th className="px-4 py-3 font-medium">Portfolio %</th>
                      <th className="px-4 py-3 font-medium">Stock label</th>
                      <th className="px-4 py-3 font-medium">Portfolio fit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-800">
                    {enrichedHoldings.map((row) => {
                      const allocation = calculatePositionAllocation({
                        cashAmountInput: cashAmountValue,
                        holding: row,
                        holdings: enrichedHoldings,
                      });

                      return (
                        <tr className="bg-neutral-950" key={row.holding.id}>
                          <td className="px-4 py-4 align-top">
                            <StockSymbolLink
                              className="font-semibold text-emerald-200 underline-offset-4 transition hover:text-emerald-100 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300"
                              symbol={row.holding.symbol}
                            />
                          </td>
                          <td className="px-4 py-4 align-top text-neutral-300">
                            {row.stockName}
                          </td>
                          <td className="px-4 py-4 align-top text-neutral-300">
                            {formatNumber(row.quantity)}
                          </td>
                          <td className="px-4 py-4 align-top text-neutral-300">
                            {formatCurrency(
                              row.averageCost,
                              row.holding.currency,
                            )}
                          </td>
                          <td className="px-4 py-4 align-top text-neutral-300">
                            <div>
                              {formatCurrency(
                                row.latestClose,
                                row.holding.currency,
                              )}
                            </div>
                            {row.latestPriceDate ? (
                              <div className="mt-1 text-xs text-neutral-500">
                                {row.latestPriceDate}
                              </div>
                            ) : null}
                          </td>
                          <td className="px-4 py-4 align-top text-neutral-300">
                            {formatCurrency(
                              row.marketValue,
                              row.holding.currency,
                            )}
                          </td>
                          <td
                            className={`px-4 py-4 align-top ${
                              row.unrealizedGain === null
                                ? "text-neutral-300"
                                : row.unrealizedGain >= 0
                                  ? "text-emerald-200"
                                  : "text-red-200"
                            }`}
                          >
                            {formatCurrency(
                              row.unrealizedGain,
                              row.holding.currency,
                            )}
                          </td>
                          <td className="px-4 py-4 align-top text-neutral-300">
                            <div>
                              {allocation.percentage === null
                                ? "Not cached"
                                : `${formatNumber(allocation.percentage, 2)}%`}
                            </div>
                            {allocation.status === "partial-market-data" ? (
                              <div className="mt-1 text-xs text-amber-300">
                                Partial data
                              </div>
                            ) : null}
                          </td>
                          <td className="px-4 py-4 align-top text-neutral-300">
                            <LabelState
                              label={row.stockLabel}
                              missingText="Stock score unavailable"
                            />
                          </td>
                          <td className="px-4 py-4 align-top text-neutral-300">
                            <div>
                              <LabelState
                                label={row.portfolioFitLabel}
                                missingText="Portfolio context unavailable"
                              />
                            </div>
                            {isPositiveStockLabel(row.stockLabel) &&
                            isPortfolioFitOffset(row.portfolioFitLabel) ? (
                              <div className="mt-1 max-w-48 text-xs leading-5 text-amber-300">
                                Portfolio context offsets the stock label.
                              </div>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="mt-5 rounded-lg border border-neutral-800 bg-neutral-900/70 p-8">
                <h3 className="text-base font-semibold text-white">
                  No holdings yet
                </h3>
                <p className="mt-3 max-w-xl text-sm leading-6 text-neutral-400">
                  Add owned stocks on the holdings page to populate this
                  dashboard table.
                </p>
                <Link
                  className="mt-5 inline-flex h-10 items-center rounded-md bg-emerald-400 px-4 text-sm font-semibold text-neutral-950 transition hover:bg-emerald-300"
                  href="/holdings"
                >
                  Add holding
                </Link>
              </div>
            )}
          </section>

          <section className="border-t border-neutral-800 pt-8">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white">
                  Watchlist
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-400">
                  Wanted stocks from your default portfolio, tracked separately
                  from owned holdings. Cached market data is displayed only
                  when it already exists locally.
                </p>
              </div>
              <Link
                className="inline-flex h-10 items-center justify-center rounded-md border border-neutral-700 px-4 text-sm font-medium text-neutral-200 transition hover:border-neutral-500 hover:text-white"
                href="/watchlist"
              >
                Manage watchlist
              </Link>
            </div>

            {hasWatchlistLoadError ? (
              <p className="mt-6 rounded-md border border-red-900 bg-red-950/60 px-4 py-3 text-sm text-red-200">
                Some watchlist data could not be loaded.
              </p>
            ) : null}

            {watchlistItems.length ? (
              <div className="mt-5 overflow-x-auto rounded-lg border border-neutral-800">
                <table className="min-w-[56rem] w-full border-collapse text-left text-sm">
                  <thead className="bg-neutral-900 text-xs uppercase tracking-[0.14em] text-neutral-400">
                    <tr>
                      <th className="px-4 py-3 font-medium">Symbol</th>
                      <th className="px-4 py-3 font-medium">Company</th>
                      <th className="px-4 py-3 font-medium">
                        Latest cached price
                      </th>
                      <th className="px-4 py-3 font-medium">Target price</th>
                      <th className="px-4 py-3 font-medium">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-800">
                    {watchlistItems.map((item) => {
                      const stock = stocksBySymbol.get(item.symbol);
                      const latestPrice = latestPricesBySymbol.get(
                        item.symbol,
                      );
                      const priceCurrency = stock?.currency ?? displayCurrency;

                      return (
                        <tr className="bg-neutral-950" key={item.id}>
                          <td className="px-4 py-4 align-top">
                            <StockSymbolLink
                              className="font-semibold text-emerald-200 underline-offset-4 transition hover:text-emerald-100 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300"
                              symbol={item.symbol}
                            />
                          </td>
                          <td className="px-4 py-4 align-top text-neutral-300">
                            {stock?.name ? (
                              stock.name
                            ) : (
                              <span className="text-neutral-500">
                                Company unavailable
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-4 align-top text-neutral-300">
                            <div>
                              {formatCurrency(
                                toFiniteNumber(latestPrice?.close),
                                priceCurrency,
                              )}
                            </div>
                            {latestPrice?.price_date ? (
                              <div className="mt-1 text-xs text-neutral-500">
                                {latestPrice.price_date}
                              </div>
                            ) : null}
                          </td>
                          <td className="px-4 py-4 align-top text-neutral-300">
                            {formatOptionalCurrency(
                              toFiniteNumber(item.target_price),
                              priceCurrency,
                              "No target",
                            )}
                          </td>
                          <td className="max-w-md px-4 py-4 align-top text-neutral-300">
                            {item.notes ? (
                              item.notes
                            ) : (
                              <span className="text-neutral-500">
                                No notes
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="mt-5 rounded-lg border border-neutral-800 bg-neutral-900/70 p-8">
                <h3 className="text-base font-semibold text-white">
                  No watched stocks yet
                </h3>
                <p className="mt-3 max-w-xl text-sm leading-6 text-neutral-400">
                  Add stocks you want to follow on the watchlist page. They will
                  appear here separately from owned holdings.
                </p>
                <Link
                  className="mt-5 inline-flex h-10 items-center rounded-md bg-emerald-400 px-4 text-sm font-semibold text-neutral-950 transition hover:bg-emerald-300"
                  href="/watchlist"
                >
                  Add watched stock
                </Link>
              </div>
            )}
          </section>
        </div>
      </section>
    </main>
  );
}
