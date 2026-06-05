"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";
import { ensureDefaultPortfolioForUser } from "@/lib/portfolios/defaults";
import { createClient } from "@/lib/supabase/server";

const SYMBOL_PATTERN = /^[A-Z][A-Z0-9.-]{0,14}$/;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;
const DECIMAL_PATTERN = /^\d+(\.\d{1,6})?$/;

function getString(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value.trim() : "";
}

function normalizeSymbol(formData: FormData) {
  return getString(formData, "symbol").toUpperCase();
}

function normalizeCurrency(formData: FormData) {
  return (getString(formData, "currency") || "USD").toUpperCase();
}

function redirectWithError(message: string): never {
  const params = new URLSearchParams({ error: message });

  redirect(`/holdings?${params.toString()}`);
}

function redirectWithSuccess(message: string): never {
  const params = new URLSearchParams({ success: message });

  redirect(`/holdings?${params.toString()}`);
}

function parseDecimalInput(value: string, label: string, allowZero: boolean) {
  if (!DECIMAL_PATTERN.test(value)) {
    redirectWithError(`${label} must be a valid number with up to 6 decimals.`);
  }

  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    redirectWithError(`${label} must be a valid number.`);
  }

  if (allowZero ? numericValue < 0 : numericValue <= 0) {
    redirectWithError(
      allowZero
        ? `${label} must be zero or greater.`
        : `${label} must be greater than zero.`,
    );
  }

  return value;
}

async function getDefaultPortfolioId() {
  const { supabase, user } = await getAuthenticatedSupabase();
  const result = await ensureDefaultPortfolioForUser(supabase, user);

  if ("error" in result) {
    redirectWithError(result.error ?? "Could not load your default portfolio.");
  }

  return result.portfolio.id;
}

async function getAuthenticatedSupabase() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?next=${encodeURIComponent("/holdings")}`);
  }

  return { supabase, user };
}

async function ensureStockExists(symbol: string, currency: string) {
  const admin = createAdminClient();
  const { error } = await admin.from("stocks").upsert(
    {
      symbol,
      name: symbol,
      country: "US",
      currency,
    },
    {
      ignoreDuplicates: true,
      onConflict: "symbol",
    },
  );

  if (error) {
    redirectWithError("Could not create the stock reference for this symbol.");
  }
}

function parseHoldingInput(formData: FormData) {
  const symbol = normalizeSymbol(formData);
  const currency = normalizeCurrency(formData);
  const quantity = parseDecimalInput(
    getString(formData, "quantity"),
    "Quantity",
    false,
  );
  const averageCost = parseDecimalInput(
    getString(formData, "average_cost"),
    "Average cost",
    true,
  );

  if (!SYMBOL_PATTERN.test(symbol)) {
    redirectWithError(
      "Symbol must start with a letter and use only uppercase letters, numbers, dots, or hyphens.",
    );
  }

  if (!CURRENCY_PATTERN.test(currency)) {
    redirectWithError("Currency must be a 3-letter code.");
  }

  return {
    averageCost,
    currency,
    quantity,
    symbol,
  };
}

export async function addHoldingAction(formData: FormData) {
  const portfolioId = await getDefaultPortfolioId();
  const { averageCost, currency, quantity, symbol } = parseHoldingInput(formData);

  await ensureStockExists(symbol, currency);

  const supabase = await createClient();
  const { error } = await supabase.from("holdings").insert({
    average_cost: averageCost,
    currency,
    portfolio_id: portfolioId,
    quantity,
    symbol,
  });

  if (error) {
    redirectWithError(
      error.code === "23505"
        ? "That holding already exists in this portfolio."
        : "Could not add the holding.",
    );
  }

  revalidatePath("/holdings");
  revalidatePath("/dashboard");
  redirectWithSuccess("Holding added.");
}

export async function updateHoldingAction(formData: FormData) {
  const holdingId = getString(formData, "holding_id");
  const { averageCost, currency, quantity, symbol } = parseHoldingInput(formData);
  const { supabase } = await getAuthenticatedSupabase();

  if (!holdingId) {
    redirectWithError("Could not identify the holding to update.");
  }

  await ensureStockExists(symbol, currency);

  const { error } = await supabase
    .from("holdings")
    .update({
      average_cost: averageCost,
      currency,
      quantity,
      symbol,
    })
    .eq("id", holdingId);

  if (error) {
    redirectWithError(
      error.code === "23505"
        ? "Another holding already uses that symbol."
        : "Could not update the holding.",
    );
  }

  revalidatePath("/holdings");
  revalidatePath("/dashboard");
  redirectWithSuccess("Holding updated.");
}

export async function deleteHoldingAction(formData: FormData) {
  const holdingId = getString(formData, "holding_id");
  const { supabase } = await getAuthenticatedSupabase();

  if (!holdingId) {
    redirectWithError("Could not identify the holding to delete.");
  }

  const { error } = await supabase
    .from("holdings")
    .delete()
    .eq("id", holdingId);

  if (error) {
    redirectWithError("Could not delete the holding.");
  }

  revalidatePath("/holdings");
  revalidatePath("/dashboard");
  redirectWithSuccess("Holding deleted.");
}
