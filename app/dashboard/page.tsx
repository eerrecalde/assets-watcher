import { redirect } from "next/navigation";
import Link from "next/link";

import { StockSymbolLink } from "@/components/stocks/stock-symbol-link";
import { signOutAction } from "@/lib/auth/actions";
import { ensureDefaultPortfolioForUser } from "@/lib/portfolios/defaults";
import {
  calculateHoldingValue,
  calculatePortfolioTotals,
} from "@/lib/portfolios/totals";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/supabase";

export const dynamic = "force-dynamic";

type HoldingRow = Database["public"]["Tables"]["holdings"]["Row"];
type PortfolioCashRow = Database["public"]["Tables"]["portfolio_cash"]["Row"];
type PortfolioScoreRow =
  Database["public"]["Tables"]["portfolio_stock_scores"]["Row"];
type StockRow = Database["public"]["Tables"]["stocks"]["Row"];
type StockPriceRow = Database["public"]["Tables"]["stock_prices"]["Row"];
type StockScoreRow = Database["public"]["Tables"]["stock_scores"]["Row"];

const currencyFormatterCache = new Map<string, Intl.NumberFormat>();

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

function buildLatestMap<T extends { symbol: string }>(rows: T[]) {
  const latestRows = new Map<string, T>();

  for (const row of rows) {
    if (!latestRows.has(row.symbol)) {
      latestRows.set(row.symbol, row);
    }
  }

  return latestRows;
}

export default async function DashboardPage() {
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

  const holdings = holdingsResult.data ?? [];
  const symbols = holdings.map((holding) => holding.symbol);
  const stocksResult = symbols.length
    ? await supabase.from("stocks").select("symbol,name").in("symbol", symbols)
    : { data: [] as Pick<StockRow, "symbol" | "name">[], error: null };
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
        .order("scored_at", { ascending: false })
    : {
        data: [] as Pick<
          StockScoreRow,
          "symbol" | "overall_label" | "scored_at"
        >[],
        error: null,
      };
  const portfolioScoresResult =
    portfolio && symbols.length
      ? await supabase
          .from("portfolio_stock_scores")
          .select("symbol,portfolio_fit_label,scored_at")
          .eq("portfolio_id", portfolio.id)
          .in("symbol", symbols)
          .order("scored_at", { ascending: false })
      : {
          data: [] as Pick<
            PortfolioScoreRow,
            "symbol" | "portfolio_fit_label" | "scored_at"
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
          ?.portfolio_fit_label ?? "Review Position",
      stockLabel:
        latestStockScoresBySymbol.get(holding.symbol)?.overall_label ??
        "Insufficient Data",
      stockName: stocksBySymbol.get(holding.symbol)?.name ?? holding.symbol,
    };
  });
  const portfolioTotals = calculatePortfolioTotals(
    enrichedHoldings,
    cashResult.data?.amount,
  );
  const hasLoadError =
    Boolean(holdingsResult.error) ||
    Boolean(stocksResult.error) ||
    Boolean(pricesResult.error) ||
    Boolean(stockScoresResult.error) ||
    Boolean(portfolioScoresResult.error) ||
    Boolean(cashResult.error);

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
              <p className="text-sm text-neutral-400">Cash balance</p>
              <p className="mt-2 text-lg font-semibold text-white">
                {formatCurrency(portfolioTotals.cashAmount, displayCurrency)}
              </p>
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

            {hasLoadError ? (
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
                      const allocation =
                        portfolioTotals.totalPortfolioValue > 0
                          ? (row.portfolioValue /
                              portfolioTotals.totalPortfolioValue) *
                            100
                          : null;

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
                            {allocation === null
                              ? "Not cached"
                              : `${formatNumber(allocation, 2)}%`}
                          </td>
                          <td className="px-4 py-4 align-top text-neutral-300">
                            {row.stockLabel}
                          </td>
                          <td className="px-4 py-4 align-top text-neutral-300">
                            {row.portfolioFitLabel}
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
        </div>
      </section>
    </main>
  );
}
