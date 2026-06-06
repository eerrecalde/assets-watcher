import Link from "next/link";
import { redirect } from "next/navigation";

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

function formatOptionalText(value: string | null) {
  return value && value.trim().length > 0 ? value : "Not cached";
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-US");
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
        </div>
      </section>
    </main>
  );
}
