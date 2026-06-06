import Link from "next/link";
import { redirect } from "next/navigation";

import {
  FeedbackSnackbars,
  type FeedbackSnackbarMessage,
} from "@/components/feedback-snackbars";
import {
  addHoldingAction,
  deleteHoldingAction,
  refreshHoldingMarketDataAction,
  updateHoldingAction,
} from "@/lib/holdings/actions";
import { updateCashBalanceAction } from "@/lib/portfolios/actions";
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
type StockRow = Database["public"]["Tables"]["stocks"]["Row"];
type StockPriceRow = Database["public"]["Tables"]["stock_prices"]["Row"];

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const currencyFormatterCache = new Map<string, Intl.NumberFormat>();

function getMessageValue(
  params: Record<string, string | string[] | undefined>,
  key: string,
) {
  const value = params[key];

  return typeof value === "string" ? value : undefined;
}

function buildFeedbackMessages(
  params: Record<string, string | string[] | undefined>,
) {
  const messages: FeedbackSnackbarMessage[] = [];
  const noticeId = getMessageValue(params, "notice") ?? "notice";
  const successMessage = getMessageValue(params, "success");
  const warningMessage = getMessageValue(params, "warning");
  const errorMessage = getMessageValue(params, "error");

  if (successMessage) {
    messages.push({
      id: `${noticeId}:success`,
      message: successMessage,
      tone: "success",
    });
  }

  if (warningMessage) {
    messages.push({
      id: `${noticeId}:warning`,
      message: warningMessage,
      tone: "warning",
    });
  }

  if (errorMessage) {
    messages.push({
      id: `${noticeId}:error`,
      message: errorMessage,
      tone: "error",
    });
  }

  return messages;
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

function buildLatestPriceMap(prices: StockPriceRow[]) {
  const latestPrices = new Map<string, StockPriceRow>();

  for (const price of prices) {
    if (!latestPrices.has(price.symbol)) {
      latestPrices.set(price.symbol, price);
    }
  }

  return latestPrices;
}

export default async function HoldingsPage({ searchParams }: PageProps) {
  const params = searchParams ? await searchParams : {};
  const feedbackMessages = buildFeedbackMessages(params);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?next=${encodeURIComponent("/holdings")}`);
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
        .select("id,portfolio_id,symbol,quantity,average_cost,currency,created_at,updated_at")
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
    : { data: [] as Pick<StockPriceRow, "symbol" | "close" | "price_date">[], error: null };

  const stocksBySymbol = new Map(
    (stocksResult.data ?? []).map((stock) => [stock.symbol, stock]),
  );
  const latestPricesBySymbol = buildLatestPriceMap(
    (pricesResult.data ?? []) as StockPriceRow[],
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
      stockName: stocksBySymbol.get(holding.symbol)?.name ?? holding.symbol,
    };
  });
  const cashAmountValue = cashResult.data?.amount ?? "0";
  const portfolioTotals = calculatePortfolioTotals(
    enrichedHoldings,
    cashAmountValue,
  );

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <section className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-6 py-10 sm:px-8">
        <header className="flex flex-col gap-5 border-b border-neutral-800 pb-8 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.16em] text-emerald-300">
              Manual portfolio tracker
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-normal text-white">
              Holdings
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-neutral-400">
              Add and maintain the stocks you own. Cached market prices will be
              used when available; manual cost basis remains visible even before
              market data is connected.
            </p>
          </div>

          <Link
            className="inline-flex h-10 items-center justify-center rounded-md border border-neutral-700 px-4 text-sm font-medium text-neutral-200 transition hover:border-neutral-500 hover:text-white"
            href="/dashboard"
          >
            Dashboard
          </Link>
        </header>

        <FeedbackSnackbars messages={feedbackMessages} />

        {portfolioError ? (
          <p className="mt-6 rounded-md border border-red-900 bg-red-950/60 px-4 py-3 text-sm text-red-200">
            {portfolioError}
          </p>
        ) : null}

        <div className="grid gap-4 py-8 md:grid-cols-3 xl:grid-cols-6">
          <div className="rounded-lg border border-neutral-800 bg-neutral-900/70 p-5">
            <p className="text-sm text-neutral-400">Portfolio</p>
            <p className="mt-2 text-lg font-semibold text-white">
              {portfolio?.name ?? "Not found"}
            </p>
          </div>
          <div className="rounded-lg border border-neutral-800 bg-neutral-900/70 p-5">
            <p className="text-sm text-neutral-400">Holdings</p>
            <p className="mt-2 text-lg font-semibold text-white">
              {holdings.length}
            </p>
          </div>
          <div className="rounded-lg border border-neutral-800 bg-neutral-900/70 p-5">
            <p className="text-sm text-neutral-400">Cash balance</p>
            <p className="mt-2 text-lg font-semibold text-white">
              {formatCurrency(portfolioTotals.cashAmount, displayCurrency)}
            </p>
          </div>
          <div className="rounded-lg border border-neutral-800 bg-neutral-900/70 p-5">
            <p className="text-sm text-neutral-400">Holdings value</p>
            <p className="mt-2 text-lg font-semibold text-white">
              {formatCurrency(
                portfolioTotals.holdingsValueTotal,
                displayCurrency,
              )}
            </p>
          </div>
          <div className="rounded-lg border border-neutral-800 bg-neutral-900/70 p-5">
            <p className="text-sm text-neutral-400">Overall value</p>
            <p className="mt-2 text-lg font-semibold text-white">
              {formatCurrency(
                portfolioTotals.totalPortfolioValue,
                displayCurrency,
              )}
            </p>
          </div>
          <div className="rounded-lg border border-neutral-800 bg-neutral-900/70 p-5">
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
          </div>
        </div>

        <section className="border-t border-neutral-800 py-8">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">
                Cash balance
              </h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-neutral-400">
                Track uninvested cash manually in the portfolio base currency.
              </p>
            </div>
            {cashResult.data?.updated_at ? (
              <p className="text-sm text-neutral-500">
                Updated{" "}
                {new Date(cashResult.data.updated_at).toLocaleDateString(
                  "en-US",
                )}
              </p>
            ) : null}
          </div>

          {cashResult.error ? (
            <p className="mt-5 rounded-md border border-red-900 bg-red-950/60 px-4 py-3 text-sm text-red-200">
              Cash balance could not be loaded.
            </p>
          ) : null}

          <form
            action={updateCashBalanceAction}
            className="mt-5 grid gap-4 sm:grid-cols-[minmax(12rem,18rem)_6rem_auto]"
          >
            <label className="grid gap-2 text-sm font-medium text-neutral-200">
              Amount
              <input
                className="h-11 rounded-md border border-neutral-700 bg-neutral-950 px-3 text-base text-white outline-none transition focus:border-emerald-400"
                defaultValue={cashAmountValue}
                min="0"
                name="cash_amount"
                required
                step="0.0001"
                type="number"
              />
            </label>
            <div className="grid gap-2 text-sm font-medium text-neutral-200">
              Currency
              <div className="flex h-11 items-center rounded-md border border-neutral-800 bg-neutral-900 px-3 text-base text-neutral-300">
                {displayCurrency}
              </div>
            </div>
            <button
              className="h-11 self-end rounded-md bg-emerald-400 px-4 text-sm font-semibold text-neutral-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:bg-neutral-700 disabled:text-neutral-400"
              disabled={!portfolio}
              type="submit"
            >
              Save cash
            </button>
          </form>
        </section>

        <section className="border-y border-neutral-800 py-8">
          <h2 className="text-lg font-semibold text-white">Add holding</h2>
          <form
            action={addHoldingAction}
            className="mt-5 grid gap-4 md:grid-cols-[minmax(9rem,1fr)_minmax(9rem,1fr)_minmax(9rem,1fr)_7rem_auto]"
          >
            <label className="grid gap-2 text-sm font-medium text-neutral-200">
              Symbol
              <input
                autoCapitalize="characters"
                className="h-11 rounded-md border border-neutral-700 bg-neutral-950 px-3 text-base text-white outline-none transition focus:border-emerald-400"
                maxLength={15}
                name="symbol"
                pattern="[A-Za-z][A-Za-z0-9.-]{0,14}"
                placeholder="AAPL"
                required
              />
            </label>
            <label className="grid gap-2 text-sm font-medium text-neutral-200">
              Quantity
              <input
                className="h-11 rounded-md border border-neutral-700 bg-neutral-950 px-3 text-base text-white outline-none transition focus:border-emerald-400"
                min="0.000001"
                name="quantity"
                placeholder="10"
                required
                step="0.000001"
                type="number"
              />
            </label>
            <label className="grid gap-2 text-sm font-medium text-neutral-200">
              Average cost
              <input
                className="h-11 rounded-md border border-neutral-700 bg-neutral-950 px-3 text-base text-white outline-none transition focus:border-emerald-400"
                min="0"
                name="average_cost"
                placeholder="150.00"
                required
                step="0.000001"
                type="number"
              />
            </label>
            <label className="grid gap-2 text-sm font-medium text-neutral-200">
              Currency
              <input
                autoCapitalize="characters"
                className="h-11 rounded-md border border-neutral-700 bg-neutral-950 px-3 text-base text-white outline-none transition focus:border-emerald-400"
                defaultValue={displayCurrency}
                maxLength={3}
                name="currency"
                pattern="[A-Za-z]{3}"
                required
              />
            </label>
            <button
              className="h-11 self-end rounded-md bg-emerald-400 px-4 text-sm font-semibold text-neutral-950 transition hover:bg-emerald-300"
              disabled={!portfolio}
              type="submit"
            >
              Add
            </button>
          </form>
        </section>

        <section className="py-8">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">
                Current holdings
              </h2>
              <p className="mt-2 text-sm text-neutral-400">
                Save a row to update it, or delete a row to remove it from this
                portfolio.
              </p>
            </div>
            <p className="text-sm text-neutral-400">
              Cost basis:{" "}
              {formatCurrency(portfolioTotals.costBasisTotal, displayCurrency)}
            </p>
          </div>

          {holdingsResult.error || stocksResult.error || pricesResult.error ? (
            <p className="mt-6 rounded-md border border-red-900 bg-red-950/60 px-4 py-3 text-sm text-red-200">
              Some holdings data could not be loaded.
            </p>
          ) : null}

          {enrichedHoldings.length ? (
            <div className="mt-5 overflow-x-auto rounded-lg border border-neutral-800">
              <table className="min-w-[72rem] w-full border-collapse text-left text-sm">
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
                    <th className="px-4 py-3 font-medium">Actions</th>
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
                          <form
                            action={updateHoldingAction}
                            className="contents"
                            id={`update-${row.holding.id}`}
                          >
                            <input
                              name="holding_id"
                              type="hidden"
                              value={row.holding.id}
                            />
                            <input
                              autoCapitalize="characters"
                              className="h-10 w-28 rounded-md border border-neutral-700 bg-neutral-950 px-3 text-sm font-semibold text-white outline-none transition focus:border-emerald-400"
                              defaultValue={row.holding.symbol}
                              maxLength={15}
                              name="symbol"
                              pattern="[A-Za-z][A-Za-z0-9.-]{0,14}"
                              required
                            />
                          </form>
                        </td>
                        <td className="px-4 py-4 align-top text-neutral-300">
                          {row.stockName}
                        </td>
                        <td className="px-4 py-4 align-top">
                          <input
                            className="h-10 w-32 rounded-md border border-neutral-700 bg-neutral-950 px-3 text-sm text-white outline-none transition focus:border-emerald-400"
                            defaultValue={row.holding.quantity}
                            form={`update-${row.holding.id}`}
                            min="0.000001"
                            name="quantity"
                            required
                            step="0.000001"
                            type="number"
                          />
                        </td>
                        <td className="px-4 py-4 align-top">
                          <div className="flex gap-2">
                            <input
                              className="h-10 w-32 rounded-md border border-neutral-700 bg-neutral-950 px-3 text-sm text-white outline-none transition focus:border-emerald-400"
                              defaultValue={row.holding.average_cost}
                              form={`update-${row.holding.id}`}
                              min="0"
                              name="average_cost"
                              required
                              step="0.000001"
                              type="number"
                            />
                            <input
                              autoCapitalize="characters"
                              className="h-10 w-20 rounded-md border border-neutral-700 bg-neutral-950 px-3 text-sm text-white outline-none transition focus:border-emerald-400"
                              defaultValue={row.holding.currency}
                              form={`update-${row.holding.id}`}
                              maxLength={3}
                              name="currency"
                              pattern="[A-Za-z]{3}"
                              required
                            />
                          </div>
                        </td>
                        <td className="px-4 py-4 align-top text-neutral-300">
                          <div>
                            {formatCurrency(row.latestClose, row.holding.currency)}
                          </div>
                          {row.latestPriceDate ? (
                            <div className="mt-1 text-xs text-neutral-500">
                              {row.latestPriceDate}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-4 py-4 align-top text-neutral-300">
                          {formatCurrency(row.marketValue, row.holding.currency)}
                        </td>
                        <td
                          className={`px-4 py-4 align-top ${
                            (row.unrealizedGain ?? 0) >= 0
                              ? "text-emerald-200"
                              : "text-red-200"
                          }`}
                        >
                          {formatCurrency(row.unrealizedGain, row.holding.currency)}
                        </td>
                        <td className="px-4 py-4 align-top text-neutral-300">
                          {allocation === null
                            ? "Not cached"
                            : `${formatNumber(allocation, 2)}%`}
                        </td>
                        <td className="px-4 py-4 align-top">
                          <div className="flex gap-2">
                            <button
                              className="h-10 rounded-md border border-neutral-700 px-3 text-sm font-medium text-neutral-200 transition hover:border-neutral-500 hover:text-white"
                              form={`update-${row.holding.id}`}
                              type="submit"
                            >
                              Save
                            </button>
                            <form action={refreshHoldingMarketDataAction}>
                              <input
                                name="holding_id"
                                type="hidden"
                                value={row.holding.id}
                              />
                              <button
                                className="h-10 rounded-md border border-emerald-900 px-3 text-sm font-medium text-emerald-200 transition hover:border-emerald-700 hover:text-emerald-100"
                                type="submit"
                              >
                                Refresh
                              </button>
                            </form>
                            <form action={deleteHoldingAction}>
                              <input
                                name="holding_id"
                                type="hidden"
                                value={row.holding.id}
                              />
                              <button
                                className="h-10 rounded-md border border-red-900 px-3 text-sm font-medium text-red-200 transition hover:border-red-700 hover:text-red-100"
                                type="submit"
                              >
                                Delete
                              </button>
                            </form>
                          </div>
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
                Add your first owned stock above. The page will start with
                manual quantity and cost basis, then use cached prices once
                market data exists.
              </p>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
