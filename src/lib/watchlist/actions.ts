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
import {
  getStockDetailPath,
  isValidNormalizedStockSymbol,
  normalizeStockSymbol,
} from "@/lib/stocks/symbols";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const WATCHLIST_PATH = "/watchlist";
const DECIMAL_PATTERN = /^\d+(\.\d{1,6})?$/;
const MAX_TARGET_PRICE_INTEGER_DIGITS = 14;
const MAX_NOTES_LENGTH = 2000;

function getString(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value.trim() : "";
}

function redirectWithError(message: string): never {
  redirectWithFeedback({ error: message });
}

function redirectWithSuccess(message: string): never {
  redirectWithFeedback({ success: message });
}

function redirectWithFeedback({
  error,
  success,
  warning,
}: {
  error?: string;
  success?: string;
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

  redirect(`${WATCHLIST_PATH}?${params.toString()}`);
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

function parseOptionalTargetPrice(value: string) {
  if (!value) {
    return null;
  }

  if (!DECIMAL_PATTERN.test(value)) {
    redirectWithError(
      "Target price must be a valid number with up to 6 decimals.",
    );
  }

  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    redirectWithError("Target price must be a valid number.");
  }

  if (numericValue <= 0) {
    redirectWithError("Target price must be greater than zero.");
  }

  const [integerPart = ""] = value.split(".");
  const significantIntegerDigits = integerPart.replace(/^0+/, "");

  if (significantIntegerDigits.length > MAX_TARGET_PRICE_INTEGER_DIGITS) {
    redirectWithError(
      "Target price must fit within 14 digits before the decimal.",
    );
  }

  return value;
}

function parseOptionalNotes(value: string) {
  if (!value) {
    return null;
  }

  if (value.length > MAX_NOTES_LENGTH) {
    redirectWithError(`Notes must be ${MAX_NOTES_LENGTH} characters or fewer.`);
  }

  return value;
}

function parseWatchlistInput(formData: FormData) {
  const symbol = normalizeStockSymbol(getString(formData, "symbol"));

  if (!symbol) {
    redirectWithError("Symbol is required.");
  }

  if (!isValidNormalizedStockSymbol(symbol)) {
    redirectWithError(
      "Symbol must start with a letter and use only uppercase letters, numbers, dots, or hyphens.",
    );
  }

  return {
    notes: parseOptionalNotes(getString(formData, "notes")),
    symbol,
    targetPrice: parseOptionalTargetPrice(getString(formData, "target_price")),
  };
}

async function getAuthenticatedSupabase() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?next=${encodeURIComponent(WATCHLIST_PATH)}`);
  }

  return { supabase, user };
}

function createMarketDataAdminClient() {
  try {
    return createAdminClient();
  } catch (error) {
    console.error(error);
    redirectWithError("Market data lookup is not configured correctly.");
  }
}

async function ensureStockReference(symbol: string) {
  const admin = createMarketDataAdminClient();
  let provider: ReturnType<typeof createFinancialModelingPrepProvider>;

  try {
    provider = createFinancialModelingPrepProvider();
  } catch (error) {
    if (isMissingFmpApiKeyError(error)) {
      redirectWithError(
        "Market data lookup is not configured. Add FMP_API_KEY on the server.",
      );
    }

    console.error(error);
    redirectWithError("Could not start market data lookup.");
  }

  const profileResult = await fetchAndCacheCompanyProfile({
    provider,
    supabase: admin,
    symbol,
  });

  if (!profileResult.ok) {
    if (profileResult.error.code === "cache_write_failed") {
      console.error(profileResult.error.message);
    }

    redirectWithError(
      `Stock reference could not be verified: ${getMarketDataFailureMessage(
        profileResult,
      )}`,
    );
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

    return {
      warning: `Latest price could not be refreshed: ${getMarketDataFailureMessage(
        priceResult,
      )}`,
    };
  }

  return {};
}

function revalidateWatchlistPaths(symbols: string[]) {
  revalidatePath(WATCHLIST_PATH);
  revalidatePath("/dashboard");

  for (const symbol of Array.from(new Set(symbols))) {
    revalidatePath(getStockDetailPath(symbol));
  }
}

export async function addWatchlistItemAction(formData: FormData) {
  const { supabase, user } = await getAuthenticatedSupabase();
  const defaultPortfolioResult = await ensureDefaultPortfolioForUser(
    supabase,
    user,
  );

  if ("error" in defaultPortfolioResult) {
    redirectWithError(
      defaultPortfolioResult.error ?? "Could not load your default portfolio.",
    );
  }

  const { notes, symbol, targetPrice } = parseWatchlistInput(formData);
  const { data: duplicateItem, error: duplicateError } = await supabase
    .from("watchlist_items")
    .select("id")
    .eq("portfolio_id", defaultPortfolioResult.portfolio.id)
    .eq("user_id", user.id)
    .eq("symbol", symbol)
    .maybeSingle();

  if (duplicateError) {
    redirectWithError("Could not check whether that symbol is already watched.");
  }

  if (duplicateItem) {
    redirectWithError("That symbol is already in this portfolio's watchlist.");
  }

  const marketDataResult = await ensureStockReference(symbol);

  const { error } = await supabase.from("watchlist_items").insert({
    notes,
    portfolio_id: defaultPortfolioResult.portfolio.id,
    symbol,
    target_price: targetPrice,
    user_id: user.id,
  });

  if (error) {
    redirectWithError(
      error.code === "23505"
        ? "That symbol is already in this portfolio's watchlist."
        : "Could not add the watchlist item.",
    );
  }

  revalidateWatchlistPaths([symbol]);
  redirectWithFeedback({
    success: "Watchlist item added.",
    warning: marketDataResult.warning,
  });
}

export async function updateWatchlistItemAction(formData: FormData) {
  const watchlistItemId = getString(formData, "watchlist_item_id");
  const { supabase, user } = await getAuthenticatedSupabase();
  const defaultPortfolioResult = await ensureDefaultPortfolioForUser(
    supabase,
    user,
  );

  if ("error" in defaultPortfolioResult) {
    redirectWithError(
      defaultPortfolioResult.error ?? "Could not load your default portfolio.",
    );
  }

  const { notes, symbol, targetPrice } = parseWatchlistInput(formData);

  if (!watchlistItemId) {
    redirectWithError("Could not identify the watchlist item to update.");
  }

  const { data: existingItem, error: existingItemError } = await supabase
    .from("watchlist_items")
    .select("id,portfolio_id,symbol")
    .eq("id", watchlistItemId)
    .eq("user_id", user.id)
    .eq("portfolio_id", defaultPortfolioResult.portfolio.id)
    .maybeSingle();

  if (existingItemError || !existingItem) {
    redirectWithError("Could not load the watchlist item to update.");
  }

  let marketDataResult: { warning?: string } = {};

  if (existingItem.symbol !== symbol) {
    const { data: duplicateItem, error: duplicateError } = await supabase
      .from("watchlist_items")
      .select("id")
      .eq("portfolio_id", defaultPortfolioResult.portfolio.id)
      .eq("user_id", user.id)
      .eq("symbol", symbol)
      .maybeSingle();

    if (duplicateError) {
      redirectWithError(
        "Could not check whether that symbol is already watched.",
      );
    }

    if (duplicateItem) {
      redirectWithError("That symbol is already in this portfolio's watchlist.");
    }

    marketDataResult = await ensureStockReference(symbol);
  }

  const { error } = await supabase
    .from("watchlist_items")
    .update({
      notes,
      symbol,
      target_price: targetPrice,
    })
    .eq("id", watchlistItemId)
    .eq("user_id", user.id)
    .eq("portfolio_id", defaultPortfolioResult.portfolio.id);

  if (error) {
    redirectWithError(
      error.code === "23505"
        ? "That symbol is already in this portfolio's watchlist."
        : "Could not update the watchlist item.",
    );
  }

  revalidateWatchlistPaths([existingItem.symbol, symbol]);
  redirectWithFeedback({
    success: "Watchlist item updated.",
    warning: marketDataResult.warning,
  });
}

export async function deleteWatchlistItemAction(formData: FormData) {
  const watchlistItemId = getString(formData, "watchlist_item_id");
  const { supabase, user } = await getAuthenticatedSupabase();
  const defaultPortfolioResult = await ensureDefaultPortfolioForUser(
    supabase,
    user,
  );

  if ("error" in defaultPortfolioResult) {
    redirectWithError(
      defaultPortfolioResult.error ?? "Could not load your default portfolio.",
    );
  }

  if (!watchlistItemId) {
    redirectWithError("Could not identify the watchlist item to delete.");
  }

  const { data: existingItem, error: existingItemError } = await supabase
    .from("watchlist_items")
    .select("id,symbol")
    .eq("id", watchlistItemId)
    .eq("user_id", user.id)
    .eq("portfolio_id", defaultPortfolioResult.portfolio.id)
    .maybeSingle();

  if (existingItemError || !existingItem) {
    redirectWithError("Could not load the watchlist item to delete.");
  }

  const { error } = await supabase
    .from("watchlist_items")
    .delete()
    .eq("id", watchlistItemId)
    .eq("user_id", user.id)
    .eq("portfolio_id", defaultPortfolioResult.portfolio.id);

  if (error) {
    redirectWithError("Could not delete the watchlist item.");
  }

  revalidateWatchlistPaths([existingItem.symbol]);
  redirectWithSuccess("Watchlist item deleted.");
}
