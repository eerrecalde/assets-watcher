import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/supabase";

type PortfolioRow = Database["public"]["Tables"]["portfolios"]["Row"];
type AppSupabaseClient = SupabaseClient<Database>;

type AppUser = {
  email?: string | null;
  id: string;
};

type EnsureDefaultPortfolioResult =
  | {
      error?: never;
      portfolio: Pick<PortfolioRow, "base_currency" | "id" | "name">;
    }
  | {
      error: string;
      portfolio?: never;
    };

type SupabaseSetupError = {
  code?: string;
  message?: string;
};

function getSetupErrorMessage(error: SupabaseSetupError, fallback: string) {
  if (error.code === "PGRST205") {
    return "Database schema is not ready. Apply the Supabase migrations for this project, then refresh the API schema cache.";
  }

  return fallback;
}

export async function ensureDefaultPortfolioForUser(
  supabase: AppSupabaseClient,
  user: AppUser,
): Promise<EnsureDefaultPortfolioResult> {
  const email = user.email?.trim() || user.id;

  const { error: userError } = await supabase.from("users").upsert(
    {
      email,
      id: user.id,
    },
    {
      onConflict: "id",
    },
  );

  if (userError) {
    console.error("Could not ensure app user.", userError);

    return {
      error: getSetupErrorMessage(userError, "Could not prepare your account."),
    };
  }

  const { data: existingPortfolio, error: portfolioLoadError } = await supabase
    .from("portfolios")
    .select("id,name,base_currency")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (portfolioLoadError) {
    console.error("Could not load default portfolio.", portfolioLoadError);

    return {
      error: getSetupErrorMessage(
        portfolioLoadError,
        "Could not load your default portfolio.",
      ),
    };
  }

  let portfolio = existingPortfolio;

  if (!portfolio) {
    const { data: createdPortfolio, error: portfolioCreateError } = await supabase
      .from("portfolios")
      .insert({
        base_currency: "USD",
        name: "Default Portfolio",
        user_id: user.id,
      })
      .select("id,name,base_currency")
      .single();

    if (portfolioCreateError) {
      console.error("Could not create default portfolio.", portfolioCreateError);

      return {
        error: getSetupErrorMessage(
          portfolioCreateError,
          "Could not create your default portfolio.",
        ),
      };
    }

    portfolio = createdPortfolio;
  }

  if (!portfolio) {
    return { error: "Could not create your default portfolio." };
  }

  const { error: cashError } = await supabase.from("portfolio_cash").upsert(
    {
      amount: "0",
      currency: portfolio.base_currency,
      portfolio_id: portfolio.id,
    },
    {
      ignoreDuplicates: true,
      onConflict: "portfolio_id,currency",
    },
  );

  if (cashError) {
    console.error("Could not ensure portfolio cash.", cashError);
  }

  const { error: rulesError } = await supabase.from("user_rules").upsert(
    {
      user_id: user.id,
    },
    {
      ignoreDuplicates: true,
      onConflict: "user_id",
    },
  );

  if (rulesError) {
    console.error("Could not ensure user rules.", rulesError);
  }

  return { portfolio };
}
