"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  createFinancialModelingPrepProvider,
  fetchAndCacheCompanyProfile,
  fetchAndCacheLatestPrice,
  type CompanyProfileCacheResult,
  type LatestPriceCacheResult,
} from "@/lib/market-data";
import { ensureDefaultPortfolioForUser } from "@/lib/portfolios/defaults";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const SYMBOL_PATTERN = /^[A-Z][A-Z0-9.-]{0,14}$/;

function getString(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value.trim() : "";
}

function getStockDetailPath(symbol: string) {
  return `/stocks/${symbol}`;
}

function redirectWithFeedback({
  error,
  success,
  symbol,
  warning,
}: {
  error?: string;
  success?: string;
  symbol: string;
  warning?: string;
}): never {
  const params = new URLSearchParams();

  if (success) {
    params.set("success", success);
  }

  if (warning) {
    params.set("warning", warning);
  }

  if (error) {
    params.set("error", error);
  }

  if (params.size > 0) {
    params.set("notice", Date.now().toString());
  }

  redirect(`${getStockDetailPath(symbol)}?${params.toString()}`);
}

function getMarketDataFailureMessage(
  result: Exclude<
    CompanyProfileCacheResult | LatestPriceCacheResult,
    { ok: true }
  >,
) {
  switch (result.error.code) {
    case "invalid_symbol":
      return "Symbol is not valid for market data refresh.";
    case "not_found":
      return "No market data was found for this symbol.";
    case "rate_limited":
      return "Market data provider rate limit reached. Try again later.";
    case "provider_unavailable":
      return "Market data provider is unavailable. Try again later.";
    case "invalid_response":
      return "Market data provider returned incomplete data for this symbol.";
    case "cache_write_failed":
      return "Market data was fetched but could not be saved.";
    default:
      return "Market data refresh failed.";
  }
}

function isMissingFmpApiKeyError(error: unknown) {
  return (
    error instanceof Error &&
    error.message === "Missing required environment variable: FMP_API_KEY"
  );
}

function createMarketDataAdminClient(symbol: string) {
  try {
    return createAdminClient();
  } catch (error) {
    console.error(error);
    redirectWithFeedback({
      error: "Market data refresh is not configured correctly.",
      symbol,
    });
  }
}

async function refreshMarketDataForSymbol(symbol: string) {
  const admin = createMarketDataAdminClient(symbol);
  let provider: ReturnType<typeof createFinancialModelingPrepProvider>;

  try {
    provider = createFinancialModelingPrepProvider();
  } catch (error) {
    if (isMissingFmpApiKeyError(error)) {
      redirectWithFeedback({
        error: "Market data refresh is not configured. Add FMP_API_KEY on the server.",
        symbol,
      });
    }

    console.error(error);
    redirectWithFeedback({
      error: "Could not start market data refresh.",
      symbol,
    });
  }

  const profileResult = await fetchAndCacheCompanyProfile({
    provider,
    supabase: admin,
    symbol,
  });
  const profileWarning = !profileResult.ok
    ? `Company profile could not be refreshed: ${getMarketDataFailureMessage(
        profileResult,
      )}`
    : undefined;

  if (!profileResult.ok && profileResult.error.code === "cache_write_failed") {
    console.error(profileResult.error.message);
  }

  const priceResult = await fetchAndCacheLatestPrice({
    provider,
    supabase: admin,
    symbol,
  });

  if (!priceResult.ok) {
    if (priceResult.error.code === "cache_write_failed") {
      console.error(priceResult.error.message);
    }

    redirectWithFeedback({
      error: getMarketDataFailureMessage(priceResult),
      symbol,
    });
  }

  return { price: priceResult.data, warning: profileWarning };
}

export async function refreshStockDetailMarketDataAction(formData: FormData) {
  const symbol = getString(formData, "symbol").toUpperCase();

  if (!SYMBOL_PATTERN.test(symbol)) {
    redirectWithFeedback({
      error: "Symbol is not valid for market data refresh.",
      symbol: "UNKNOWN",
    });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?next=${encodeURIComponent(getStockDetailPath(symbol))}`);
  }

  const defaultPortfolioResult = await ensureDefaultPortfolioForUser(
    supabase,
    user,
  );

  if ("error" in defaultPortfolioResult) {
    redirectWithFeedback({
      error:
        defaultPortfolioResult.error ?? "Could not load your default portfolio.",
      symbol,
    });
  }

  const portfolioId = defaultPortfolioResult.portfolio.id;
  const [holdingResult, watchlistResult] = await Promise.all([
    supabase
      .from("holdings")
      .select("id")
      .eq("portfolio_id", portfolioId)
      .eq("symbol", symbol)
      .maybeSingle(),
    supabase
      .from("watchlist_items")
      .select("id")
      .eq("portfolio_id", portfolioId)
      .eq("symbol", symbol)
      .maybeSingle(),
  ]);

  if (holdingResult.error || watchlistResult.error) {
    redirectWithFeedback({
      error: "Could not verify whether this symbol is tracked.",
      symbol,
    });
  }

  if (!holdingResult.data && !watchlistResult.data) {
    redirectWithFeedback({
      error:
        "Only symbols in your holdings or watchlist can be manually refreshed from stock detail.",
      symbol,
    });
  }

  const marketDataResult = await refreshMarketDataForSymbol(symbol);

  revalidatePath(getStockDetailPath(symbol));
  revalidatePath("/holdings");
  revalidatePath("/dashboard");
  redirectWithFeedback({
    success: `Market data refreshed for ${marketDataResult.price.symbol} (${marketDataResult.price.priceDate}).`,
    symbol,
    warning: marketDataResult.warning,
  });
}
