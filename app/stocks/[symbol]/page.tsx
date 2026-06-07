import Link from "next/link";
import { redirect } from "next/navigation";

import {
  isValidNormalizedStockSymbol,
  normalizeStockSymbol,
} from "@/lib/stocks/symbols";
import { ensureDefaultPortfolioForUser } from "@/lib/portfolios/defaults";
import {
  buildUserHoldingSummary,
  type UserHoldingSummary,
} from "@/lib/portfolios/holding-summary";
import {
  calculateHoldingValue,
  calculatePortfolioTotals,
} from "@/lib/portfolios/totals";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/supabase";

export const dynamic = "force-dynamic";

type StockRow = Database["public"]["Tables"]["stocks"]["Row"];
type HoldingRow = Database["public"]["Tables"]["holdings"]["Row"];
type PortfolioCashRow = Database["public"]["Tables"]["portfolio_cash"]["Row"];
type StockPriceRow = Database["public"]["Tables"]["stock_prices"]["Row"];

type PageProps = {
  params: Promise<{
    symbol: string;
  }>;
};

const currencyFormatterCache = new Map<string, Intl.NumberFormat>();

function formatOptionalText(value: string | null) {
  return value && value.trim().length > 0 ? value : "Not cached";
}

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

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-US");
}

function formatPercentage(value: number | null) {
  return value === null ? "Not cached" : `${formatNumber(value, 2)}%`;
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

function HoldingMetric({
  label,
  subtext,
  tone = "neutral",
  value,
}: {
  label: string;
  subtext?: string;
  tone?: "negative" | "neutral" | "positive";
  value: string;
}) {
  const valueClassName =
    tone === "positive"
      ? "text-emerald-200"
      : tone === "negative"
        ? "text-red-200"
        : "text-neutral-100";

  return (
    <div className="rounded-md border border-neutral-800 bg-neutral-950 p-4">
      <dt className="text-xs font-medium uppercase tracking-[0.14em] text-neutral-500">
        {label}
      </dt>
      <dd className={`mt-2 break-words text-sm font-medium ${valueClassName}`}>
        {value}
      </dd>
      {subtext ? (
        <dd className="mt-1 text-xs text-neutral-500">{subtext}</dd>
      ) : null}
    </div>
  );
}

function UserHoldingSummarySection({
  loadError,
  portfolioName,
  summary,
  symbol,
}: {
  loadError: boolean;
  portfolioName?: string;
  summary: UserHoldingSummary | null;
  symbol: string;
}) {
  return (
    <section className="rounded-lg border border-neutral-800 bg-neutral-900/70 p-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Your holding</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-400">
            Current position data for this symbol from your default portfolio.
          </p>
        </div>
        {portfolioName ? (
          <p className="text-sm text-neutral-500">{portfolioName}</p>
        ) : null}
      </div>

      {loadError ? (
        <p className="mt-5 rounded-md border border-red-900 bg-red-950/60 px-4 py-3 text-sm text-red-200">
          Holding data could not be fully loaded.
        </p>
      ) : null}

      {!summary ? (
        <p className="mt-5 rounded-md border border-red-900 bg-red-950/60 px-4 py-3 text-sm text-red-200">
          Your default portfolio could not be loaded.
        </p>
      ) : summary.status === "not-owned" ? (
        <div className="mt-6 rounded-md border border-neutral-800 bg-neutral-950 p-5">
          <h3 className="text-base font-semibold text-white">Not owned</h3>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-400">
            You do not currently hold {symbol} in your default portfolio.
          </p>
        </div>
      ) : (
        <>
          {!summary.hasSufficientPriceData ? (
            <p className="mt-5 rounded-md border border-amber-900 bg-amber-950/40 px-4 py-3 text-sm text-amber-100">
              Insufficient cached price data. Market value, unrealised
              gain/loss, and portfolio percentage are not calculated until a
              latest cached close is available.
            </p>
          ) : null}

          <dl className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <HoldingMetric
              label="Quantity"
              value={formatNumber(summary.quantity)}
            />
            <HoldingMetric
              label="Average cost"
              value={formatCurrency(summary.averageCost, summary.currency)}
            />
            <HoldingMetric label="Currency" value={summary.currency} />
            <HoldingMetric
              label="Latest cached price"
              subtext={
                summary.latestPriceDate
                  ? `Price date ${summary.latestPriceDate}`
                  : undefined
              }
              value={formatCurrency(summary.latestClose, summary.currency)}
            />
            <HoldingMetric
              label="Market value"
              value={formatCurrency(summary.marketValue, summary.currency)}
            />
            <HoldingMetric
              label="Unrealised gain/loss"
              tone={
                summary.unrealizedGain === null
                  ? "neutral"
                  : summary.unrealizedGain >= 0
                    ? "positive"
                    : "negative"
              }
              value={formatCurrency(summary.unrealizedGain, summary.currency)}
            />
            <HoldingMetric
              label="Portfolio %"
              value={formatPercentage(summary.portfolioPercentage)}
            />
          </dl>
        </>
      )}
    </section>
  );
}

function StockSummary({ stock }: { stock: StockRow }) {
  const details = [
    ["Company", stock.name],
    ["Symbol", stock.symbol],
    ["Exchange", formatOptionalText(stock.exchange)],
    ["Sector", formatOptionalText(stock.sector)],
    ["Industry", formatOptionalText(stock.industry)],
    ["Country", stock.country],
    ["Currency", stock.currency],
    ["Cache updated", formatDate(stock.updated_at)],
  ];

  return (
    <section className="rounded-lg border border-neutral-800 bg-neutral-900/70 p-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">
            Cached stock record
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-400">
            This page is grounded in locally cached market data.
          </p>
        </div>
        <p className="text-sm text-neutral-500">
          Created {formatDate(stock.created_at)}
        </p>
      </div>

      <dl className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {details.map(([label, value]) => (
          <div
            className="rounded-md border border-neutral-800 bg-neutral-950 p-4"
            key={label}
          >
            <dt className="text-xs font-medium uppercase tracking-[0.14em] text-neutral-500">
              {label}
            </dt>
            <dd className="mt-2 break-words text-sm font-medium text-neutral-100">
              {value}
            </dd>
          </div>
        ))}
      </dl>
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
  const defaultPortfolioResult = await ensureDefaultPortfolioForUser(
    supabase,
    user,
  );
  const portfolio = defaultPortfolioResult.portfolio;
  const displayCurrency = portfolio?.base_currency ?? "USD";

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
  }

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
  const latestPricesBySymbol = buildLatestPriceMap(pricesResult.data ?? []);
  const enrichedHoldings = holdings.map((holding) => {
    const latestPrice = latestPricesBySymbol.get(holding.symbol);

    return {
      ...calculateHoldingValue({
        averageCost: holding.average_cost,
        latestClose: latestPrice?.close,
        quantity: holding.quantity,
      }),
      holding,
    };
  });
  const portfolioTotals = calculatePortfolioTotals(
    enrichedHoldings,
    cashResult.data?.amount,
  );
  const selectedHolding =
    isValidSymbol && portfolio
      ? holdings.find((holding) => holding.symbol === symbol) ?? null
      : null;
  const selectedLatestPrice = latestPricesBySymbol.get(symbol);
  const holdingSummary = portfolio
    ? buildUserHoldingSummary({
        holding: selectedHolding
          ? {
              averageCost: selectedHolding.average_cost,
              currency: selectedHolding.currency,
              latestClose: selectedLatestPrice?.close,
              latestPriceDate: selectedLatestPrice?.price_date,
              quantity: selectedHolding.quantity,
            }
          : null,
        totalPortfolioValue: portfolioTotals.totalPortfolioValue,
      })
    : null;
  const hasHoldingLoadError =
    Boolean(defaultPortfolioResult.error) ||
    Boolean(cashResult.error) ||
    Boolean(holdingsResult.error) ||
    Boolean(pricesResult.error);

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <section className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-6 py-10 sm:px-8">
        <header className="flex flex-col gap-5 border-b border-neutral-800 pb-8 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.16em] text-emerald-300">
              Stock detail
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-normal text-white">
              {symbol || "Stock"}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-neutral-400">
              Review a single cached stock record from the protected portfolio
              workspace.
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
            <StockSummary stock={stock} />
          ) : (
            <UnavailableStockState
              errorMessage={stockLoadError}
              symbol={isValidSymbol ? symbol : ""}
            />
          )}

          {isValidSymbol ? (
            <UserHoldingSummarySection
              loadError={hasHoldingLoadError}
              portfolioName={portfolio?.name}
              summary={holdingSummary}
              symbol={symbol}
            />
          ) : null}
        </div>
      </section>
    </main>
  );
}
