"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { ensureDefaultPortfolioForUser } from "@/lib/portfolios/defaults";
import { createClient } from "@/lib/supabase/server";

const CASH_DECIMAL_PATTERN = /^\d+(\.\d{1,4})?$/;

function getString(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value.trim() : "";
}

function redirectWithError(message: string): never {
  const params = new URLSearchParams({ error: message });

  redirect(`/holdings?${params.toString()}`);
}

function redirectWithSuccess(message: string): never {
  const params = new URLSearchParams({ success: message });

  redirect(`/holdings?${params.toString()}`);
}

function parseCashAmount(value: string) {
  if (!CASH_DECIMAL_PATTERN.test(value)) {
    redirectWithError(
      "Cash balance must be a valid number with up to 4 decimals.",
    );
  }

  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    redirectWithError("Cash balance must be a valid number.");
  }

  if (numericValue < 0) {
    redirectWithError("Cash balance must be zero or greater.");
  }

  return value;
}

export async function updateCashBalanceAction(formData: FormData) {
  const amount = parseCashAmount(getString(formData, "cash_amount"));
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?next=${encodeURIComponent("/holdings")}`);
  }

  const result = await ensureDefaultPortfolioForUser(supabase, user);

  if ("error" in result) {
    redirectWithError(result.error ?? "Could not load your default portfolio.");
  }

  const { error } = await supabase.from("portfolio_cash").upsert(
    {
      amount,
      currency: result.portfolio.base_currency,
      portfolio_id: result.portfolio.id,
    },
    {
      onConflict: "portfolio_id,currency",
    },
  );

  if (error) {
    redirectWithError("Could not update the cash balance.");
  }

  revalidatePath("/holdings");
  revalidatePath("/dashboard");
  redirectWithSuccess("Cash balance updated.");
}
