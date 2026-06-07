import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";

import { StockSymbolLink } from "../../components/stocks/stock-symbol-link";
import {
  listDefaultPortfolioWatchlistItems,
  type DefaultPortfolioWatchlistItem,
  type DefaultPortfolioWatchlistResult,
} from "./data";
import type { Database } from "../../types/supabase";

export const dynamic = "force-dynamic";

type StockRow = Database["public"]["Tables"]["stocks"]["Row"];
type StockPriceRow = Database["public"]["Tables"]["stock_prices"]["Row"];
type AppSupabaseClient = SupabaseClient<Database>;

type AuthenticatedUser = {
  email?: string | null;
  id: string;
};

export type WatchlistPageDependencies = {
  createSupabaseClient: () => Promise<AppSupabaseClient>;
  listWatchlistItems?: (
    supabase: AppSupabaseClient,
    user: AuthenticatedUser,
  ) => Promise<DefaultPortfolioWatchlistResult>;
  redirectToLogin: (url: string) => never;
};

const currencyFormatterCache = new Map<string, Intl.NumberFormat>();

function formatDate(value: string) {
  const date = new Date(value.includes("T") ? value : `${value}T00:00:00.000Z`);

  if (Number.isNaN(date.getTime())) {
    return "Unavailable";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(date);
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

  try {
    const formatter = new Intl.NumberFormat("en-US", {
      currency: cacheKey,
      maximumFractionDigits: 2,
      style: "currency",
    });

    currencyFormatterCache.set(cacheKey, formatter);

    return formatter.format(value);
  } catch {
    return `${new Intl.NumberFormat("en-US", {
      maximumFractionDigits: 2,
      minimumFractionDigits: 2,
    }).format(value)} ${cacheKey}`;
  }
}

function toFiniteNumber(value: string | null | undefined) {
  if (value === null || value === undefined) {
    return null;
  }

  const numericValue = Number(value);

  return Number.isFinite(numericValue) ? numericValue : null;
}

function formatTargetGap({
  latestClose,
  targetPrice,
}: {
  latestClose: string | null | undefined;
  targetPrice: string | null;
}) {
  const latestCloseValue = toFiniteNumber(latestClose);
  const targetPriceValue = toFiniteNumber(targetPrice);

  if (latestCloseValue === null || targetPriceValue === null) {
    return "Not cached";
  }

  if (targetPriceValue === 0) {
    return "Unavailable";
  }

  const percentageGap = ((targetPriceValue - latestCloseValue) / targetPriceValue) * 100;
  const formatted = new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
    signDisplay: "exceptZero",
  }).format(percentageGap);

  return `${formatted}%`;
}

function buildLatestPriceMap(
  prices: Pick<StockPriceRow, "close" | "price_date" | "symbol">[],
) {
  const latestPrices = new Map<
    string,
    Pick<StockPriceRow, "close" | "price_date" | "symbol">
  >();

  for (const price of prices) {
    if (!latestPrices.has(price.symbol)) {
      latestPrices.set(price.symbol, price);
    }
  }

  return latestPrices;
}

function logWatchlistLoadError({
  error,
  scope,
}: {
  error: string | null | undefined;
  scope: string;
}) {
  if (!error) {
    return;
  }

  console.error("Watchlist data load failed.", {
    error,
    scope,
  });
}

function EmptyWatchlistState() {
  return (
    <div className="mt-5 rounded-lg border border-neutral-800 bg-neutral-900/70 p-8">
      <h2 className="text-base font-semibold text-white">
        No watched stocks yet
      </h2>
      <p className="mt-3 max-w-xl text-sm leading-6 text-neutral-400">
        Track wanted stocks separately from owned holdings so target prices,
        cached prices, and notes have a dedicated workspace.
      </p>
    </div>
  );
}

function WatchlistTable({
  displayCurrency,
  items,
  latestPricesBySymbol,
  stocksBySymbol,
}: {
  displayCurrency: string;
  items: DefaultPortfolioWatchlistItem[];
  latestPricesBySymbol: Map<
    string,
    Pick<StockPriceRow, "close" | "price_date" | "symbol">
  >;
  stocksBySymbol: Map<string, Pick<StockRow, "currency" | "name" | "symbol">>;
}) {
  return (
    <div className="mt-5 overflow-x-auto rounded-lg border border-neutral-800">
      <table className="min-w-[72rem] w-full border-collapse text-left text-sm">
        <thead className="bg-neutral-900 text-xs uppercase tracking-[0.14em] text-neutral-400">
          <tr>
            <th className="px-4 py-3 font-medium">Symbol</th>
            <th className="px-4 py-3 font-medium">Company</th>
            <th className="px-4 py-3 font-medium">Latest price</th>
            <th className="px-4 py-3 font-medium">Target price</th>
            <th className="px-4 py-3 font-medium">Target gap</th>
            <th className="px-4 py-3 font-medium">Notes</th>
            <th className="px-4 py-3 font-medium">Added</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-800">
          {items.map((item) => {
            const stock = stocksBySymbol.get(item.symbol);
            const latestPrice = latestPricesBySymbol.get(item.symbol);
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
                  {stock?.name ?? item.symbol}
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
                  {formatCurrency(toFiniteNumber(item.target_price), displayCurrency)}
                </td>
                <td className="px-4 py-4 align-top text-neutral-300">
                  {formatTargetGap({
                    latestClose: latestPrice?.close,
                    targetPrice: item.target_price,
                  })}
                </td>
                <td className="max-w-md px-4 py-4 align-top text-neutral-300">
                  {item.notes ? (
                    <p className="whitespace-pre-wrap leading-6">{item.notes}</p>
                  ) : (
                    <span className="text-neutral-500">No notes</span>
                  )}
                </td>
                <td className="px-4 py-4 align-top text-neutral-300">
                  {formatDate(item.created_at)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export async function WatchlistPage({
  createSupabaseClient,
  listWatchlistItems = listDefaultPortfolioWatchlistItems,
  redirectToLogin,
}: WatchlistPageDependencies) {
  const supabase = await createSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return redirectToLogin(`/login?next=${encodeURIComponent("/watchlist")}`);
  }

  const watchlistResult = await listWatchlistItems(supabase, user);
  const portfolio = watchlistResult.portfolio;
  const items = watchlistResult.items ?? [];
  const displayCurrency = portfolio?.base_currency ?? "USD";
  const symbols = items.map((item) => item.symbol);
  const stocksResult = symbols.length
    ? await supabase
        .from("stocks")
        .select("symbol,name,currency")
        .in("symbol", symbols)
    : {
        data: [] as Pick<StockRow, "currency" | "name" | "symbol">[],
        error: null,
      };
  const pricesResult = symbols.length
    ? await supabase
        .from("stock_prices")
        .select("symbol,close,price_date")
        .in("symbol", symbols)
        .order("price_date", { ascending: false })
    : {
        data: [] as Pick<StockPriceRow, "close" | "price_date" | "symbol">[],
        error: null,
      };

  logWatchlistLoadError({
    error: stocksResult.error?.message,
    scope: "stocks",
  });
  logWatchlistLoadError({
    error: pricesResult.error?.message,
    scope: "latest prices",
  });

  const stocksBySymbol = new Map(
    (stocksResult.data ?? []).map((stock) => [stock.symbol, stock]),
  );
  const latestPricesBySymbol = buildLatestPriceMap(pricesResult.data ?? []);
  const hasLoadError =
    Boolean(watchlistResult.error) ||
    Boolean(stocksResult.error) ||
    Boolean(pricesResult.error);

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <section className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-6 py-10 sm:px-8">
        <header className="flex flex-col gap-5 border-b border-neutral-800 pb-8 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.16em] text-emerald-300">
              Manual portfolio tracker
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-normal text-white">
              Watchlist
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-neutral-400">
              Review wanted stocks from your default portfolio with target
              prices, notes, and the latest cached close when available.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              className="inline-flex h-10 items-center justify-center rounded-md border border-neutral-700 px-4 text-sm font-medium text-neutral-200 transition hover:border-neutral-500 hover:text-white"
              href="/dashboard"
            >
              Dashboard
            </Link>
            <Link
              className="inline-flex h-10 items-center justify-center rounded-md bg-emerald-400 px-4 text-sm font-semibold text-neutral-950 transition hover:bg-emerald-300"
              href="/holdings"
            >
              Holdings
            </Link>
          </div>
        </header>

        <div className="grid gap-4 py-8 md:grid-cols-3">
          <div className="rounded-lg border border-neutral-800 bg-neutral-900/70 p-5">
            <p className="text-sm text-neutral-400">Portfolio</p>
            <p className="mt-2 text-lg font-semibold text-white">
              {portfolio?.name ?? "Not found"}
            </p>
          </div>
          <div className="rounded-lg border border-neutral-800 bg-neutral-900/70 p-5">
            <p className="text-sm text-neutral-400">Watched stocks</p>
            <p className="mt-2 text-lg font-semibold text-white">
              {items.length}
            </p>
          </div>
          <div className="rounded-lg border border-neutral-800 bg-neutral-900/70 p-5">
            <p className="text-sm text-neutral-400">Base currency</p>
            <p className="mt-2 text-lg font-semibold text-white">
              {displayCurrency}
            </p>
          </div>
        </div>

        <section className="border-t border-neutral-800 py-8">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">
                Watched stocks
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-400">
                Current watchlist items for your default portfolio. Cached
                market data is displayed only when it already exists locally.
              </p>
            </div>
            {portfolio ? (
              <p className="text-sm text-neutral-500">{portfolio.name}</p>
            ) : null}
          </div>

          {hasLoadError ? (
            <p className="mt-6 rounded-md border border-red-900 bg-red-950/60 px-4 py-3 text-sm text-red-200">
              Some watchlist data could not be loaded.
            </p>
          ) : null}

          {items.length ? (
            <WatchlistTable
              displayCurrency={displayCurrency}
              items={items}
              latestPricesBySymbol={latestPricesBySymbol}
              stocksBySymbol={stocksBySymbol}
            />
          ) : (
            <EmptyWatchlistState />
          )}
        </section>
      </section>
    </main>
  );
}
