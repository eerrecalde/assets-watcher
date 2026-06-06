import Link from "next/link";
import { redirect } from "next/navigation";

import {
  createCachedFiftyTwoWeekRange,
  createLatestCachedPriceSummary,
  createStockProfileFields,
  getTrailingFiftyTwoWeekStartDate,
  type CachedFiftyTwoWeekRange,
  type LatestCachedPriceSummary,
  type StockPriceInput,
} from "@/lib/stocks/detail";
import {
  isValidNormalizedStockSymbol,
  normalizeStockSymbol,
} from "@/lib/stocks/symbols";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/supabase";

export const dynamic = "force-dynamic";

type StockRow = Database["public"]["Tables"]["stocks"]["Row"];

type PageProps = {
  params: Promise<{
    symbol: string;
  }>;
};

const currencyFormatterCache = new Map<string, Intl.NumberFormat>();

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(value.includes("T") ? value : `${value}T00:00:00.000Z`));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}

function formatCurrency(value: number, currency: string) {
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

function formatInteger(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(value);
}

function UnavailableStockState({
  errorMessage,
  symbol,
}: {
  errorMessage?: string;
  symbol: string;
}) {
  return (
    <section className="rounded-lg border border-neutral-800 bg-neutral-900/70 p-8">
      <h2 className="text-lg font-semibold text-white">
        Cached stock unavailable
      </h2>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-neutral-400">
        {symbol
          ? `No local cached stock record is available for ${symbol}.`
          : "The stock symbol in this route is not valid."}
      </p>
      {errorMessage ? (
        <p className="mt-5 rounded-md border border-red-900 bg-red-950/60 px-4 py-3 text-sm text-red-200">
          Stock detail data could not be loaded.
        </p>
      ) : null}
    </section>
  );
}

function CompanyProfileCard({ stock }: { stock: StockRow }) {
  return (
    <section className="rounded-lg border border-neutral-800 bg-neutral-900/70 p-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">
            Company profile
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-400">
            Cached company identity from the local stock cache.
          </p>
        </div>
        <p className="text-sm text-neutral-500">
          Updated {formatDate(stock.updated_at)}
        </p>
      </div>

      <dl className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {createStockProfileFields(stock).map((field) => (
          <div
            className="rounded-md border border-neutral-800 bg-neutral-950 p-4"
            key={field.label}
          >
            <dt className="text-xs font-medium uppercase tracking-[0.14em] text-neutral-500">
              {field.label}
            </dt>
            <dd
              className={
                field.isMissing
                  ? "mt-2 break-words text-sm font-medium text-neutral-500"
                  : "mt-2 break-words text-sm font-medium text-neutral-100"
              }
            >
              {field.label === "Profile cache updated"
                ? formatDateTime(field.value)
                : field.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function LatestPriceCard({
  currency,
  loadError,
  latestPrice,
}: {
  currency: string;
  latestPrice: LatestCachedPriceSummary | null;
  loadError?: string;
}) {
  return (
    <section className="rounded-lg border border-neutral-800 bg-neutral-900/70 p-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">
            Latest cached price
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-400">
            Stored market data snapshot. Pricing is cached and may be stale; it
            is not real-time.
          </p>
        </div>
        {latestPrice ? (
          <p className="text-sm text-neutral-500">
            Price date {formatDate(latestPrice.priceDate)}
          </p>
        ) : null}
      </div>

      {loadError ? (
        <p className="mt-5 rounded-md border border-red-900 bg-red-950/60 px-4 py-3 text-sm text-red-200">
          Cached price data could not be loaded.
        </p>
      ) : null}

      {latestPrice ? (
        <dl className="mt-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-md border border-neutral-800 bg-neutral-950 p-4">
            <dt className="text-xs font-medium uppercase tracking-[0.14em] text-neutral-500">
              Close
            </dt>
            <dd className="mt-2 text-2xl font-semibold text-white">
              {formatCurrency(latestPrice.close, currency)}
            </dd>
          </div>
          <div className="rounded-md border border-neutral-800 bg-neutral-950 p-4">
            <dt className="text-xs font-medium uppercase tracking-[0.14em] text-neutral-500">
              Cache stored
            </dt>
            <dd className="mt-2 text-sm font-medium text-neutral-100">
              {formatDateTime(latestPrice.cachedAt)}
            </dd>
          </div>
          <div className="rounded-md border border-neutral-800 bg-neutral-950 p-4">
            <dt className="text-xs font-medium uppercase tracking-[0.14em] text-neutral-500">
              Volume
            </dt>
            <dd className="mt-2 text-sm font-medium text-neutral-100">
              {latestPrice.volume === null
                ? "Unavailable"
                : formatInteger(latestPrice.volume)}
            </dd>
          </div>
        </dl>
      ) : (
        <div className="mt-6 rounded-md border border-amber-900 bg-amber-950/40 px-4 py-4">
          <h3 className="text-sm font-semibold text-amber-100">
            Insufficient cached price data
          </h3>
          <p className="mt-2 text-sm leading-6 text-amber-200/80">
            No latest cached close price is available for this stock. The page
            will not show a zero or implied live quote.
          </p>
        </div>
      )}
    </section>
  );
}

function CachedRangeCard({
  currency,
  loadError,
  range,
}: {
  currency: string;
  loadError?: string;
  range: CachedFiftyTwoWeekRange | null;
}) {
  return (
    <section className="rounded-lg border border-neutral-800 bg-neutral-900/70 p-8">
      <div>
        <h2 className="text-lg font-semibold text-white">
          Cached 52-week range
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-400">
          Calculated only from cached daily price rows in the latest cached
          52-week window.
        </p>
      </div>

      {loadError ? (
        <p className="mt-5 rounded-md border border-red-900 bg-red-950/60 px-4 py-3 text-sm text-red-200">
          Cached price history could not be loaded.
        </p>
      ) : null}

      {range ? (
        <>
          <dl className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-md border border-neutral-800 bg-neutral-950 p-4">
              <dt className="text-xs font-medium uppercase tracking-[0.14em] text-neutral-500">
                Cached high
              </dt>
              <dd className="mt-2 text-xl font-semibold text-white">
                {formatCurrency(range.high, currency)}
              </dd>
            </div>
            <div className="rounded-md border border-neutral-800 bg-neutral-950 p-4">
              <dt className="text-xs font-medium uppercase tracking-[0.14em] text-neutral-500">
                Cached low
              </dt>
              <dd className="mt-2 text-xl font-semibold text-white">
                {formatCurrency(range.low, currency)}
              </dd>
            </div>
          </dl>
          <p className="mt-4 text-sm text-neutral-500">
            Based on {formatInteger(range.rowCount)} cached row
            {range.rowCount === 1 ? "" : "s"} from {formatDate(range.startDate)}{" "}
            to {formatDate(range.endDate)}.
          </p>
        </>
      ) : (
        <p className="mt-6 rounded-md border border-neutral-800 bg-neutral-950 px-4 py-4 text-sm leading-6 text-neutral-400">
          52-week high and low are unavailable because there is not enough
          cached price history for this stock.
        </p>
      )}
    </section>
  );
}

export default async function StockDetailPage({ params }: PageProps) {
  const { symbol: routeSymbol } = await params;
  const symbol = normalizeStockSymbol(routeSymbol);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/stocks/${symbol}`)}`);
  }

  const isValidSymbol = isValidNormalizedStockSymbol(symbol);
  let stock: StockRow | null = null;
  let stockLoadError: string | undefined;
  let latestPrice: StockPriceInput | null = null;
  let latestPriceLoadError: string | undefined;
  let cachedRange: CachedFiftyTwoWeekRange | null = null;
  let cachedRangeLoadError: string | undefined;

  if (isValidSymbol) {
    const { data, error } = await supabase
      .from("stocks")
      .select(
        "symbol,name,exchange,sector,industry,country,currency,created_at,updated_at",
      )
      .eq("symbol", symbol)
      .maybeSingle();

    stock = data;
    stockLoadError = error?.message;

    if (stock) {
      const latestPriceResult = await supabase
        .from("stock_prices")
        .select("symbol,price_date,high,low,close,volume,created_at")
        .eq("symbol", symbol)
        .order("price_date", { ascending: false })
        .limit(1)
        .maybeSingle();

      latestPrice = latestPriceResult.data;
      latestPriceLoadError = latestPriceResult.error?.message;

      if (latestPrice) {
        const rangeResult = await supabase
          .from("stock_prices")
          .select("symbol,price_date,high,low,close,volume,created_at")
          .eq("symbol", symbol)
          .gte(
            "price_date",
            getTrailingFiftyTwoWeekStartDate(latestPrice.price_date),
          )
          .lte("price_date", latestPrice.price_date)
          .order("price_date", { ascending: true });

        cachedRangeLoadError = rangeResult.error?.message;
        cachedRange = createCachedFiftyTwoWeekRange(rangeResult.data ?? []);
      }
    }
  }

  const latestPriceSummary = createLatestCachedPriceSummary(latestPrice);

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <section className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-6 py-10 sm:px-8">
        <header className="flex flex-col gap-5 border-b border-neutral-800 pb-8 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.16em] text-emerald-300">
              Stock detail
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-normal text-white">
              {stock?.name ?? symbol ?? "Stock"}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-neutral-400">
              Review cached company identity and stored market data without
              triggering a live provider fetch.
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

        <div className="grid gap-8 py-8">
          {stock ? (
            <>
              <CompanyProfileCard stock={stock} />
              <LatestPriceCard
                currency={stock.currency}
                latestPrice={latestPriceSummary}
                loadError={latestPriceLoadError}
              />
              <CachedRangeCard
                currency={stock.currency}
                loadError={cachedRangeLoadError}
                range={cachedRange}
              />
            </>
          ) : (
            <UnavailableStockState
              errorMessage={stockLoadError}
              symbol={isValidSymbol ? symbol : ""}
            />
          )}
        </div>
      </section>
    </main>
  );
}
