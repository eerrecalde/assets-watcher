import { redirect } from "next/navigation";
import Link from "next/link";

import { GenerateAITakeButton } from "@/components/ai/generate-ai-take-button";
import { StockSymbolLink } from "@/components/stocks/stock-symbol-link";
import { generateAITakeAction } from "@/lib/ai/actions";
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

const currencyFormatterCache = new Map<string, Intl.NumberFormat>();

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
  const stockScoresResult = holdingSymbols.length
    ? await supabase
        .from("stock_scores")
        .select("symbol,overall_label,scored_at")
        .in("symbol", holdingSymbols)
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
        .select("created_at,model,output_markdown,provider")
        .eq("portfolio_id", portfolio.id)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
    : {
        data: [] as Pick<
          AITakeRow,
          "created_at" | "model" | "output_markdown" | "provider"
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
    (stockScoresResult.data ?? []) as Pick<
      StockScoreRow,
      "symbol" | "overall_label" | "scored_at"
    >[],
  );
  const latestPortfolioScoresBySymbol = buildLatestMap(
    (portfolioScoresResult.data ?? []) as Pick<
      PortfolioScoreRow,
      "symbol" | "portfolio_fit_label" | "scored_at"
    >[],
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
    Boolean(cashResult.error);
  const hasWatchlistLoadError =
    Boolean(watchlistResult.error) ||
    Boolean(stocksResult.error) ||
    Boolean(pricesResult.error);
  const latestAITake =
    (latestAITakeResult.data?.[0] as
      | Pick<
          AITakeRow,
          "created_at" | "model" | "output_markdown" | "provider"
        >
      | undefined) ?? null;

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
                <p className="mt-4 whitespace-pre-line text-sm leading-6 text-neutral-300">
                  {latestAITake.output_markdown}
                </p>
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
