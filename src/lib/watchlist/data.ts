import type { SupabaseClient } from "@supabase/supabase-js";

import { ensureDefaultPortfolioForUser } from "@/lib/portfolios/defaults";
import type { Database } from "@/types/supabase";

type AppSupabaseClient = SupabaseClient<Database>;
type PortfolioRow = Database["public"]["Tables"]["portfolios"]["Row"];
type WatchlistItemRow =
  Database["public"]["Tables"]["watchlist_items"]["Row"];

type AuthenticatedUser = {
  email?: string | null;
  id: string;
};

export type DefaultPortfolioWatchlistItem = Pick<
  WatchlistItemRow,
  | "created_at"
  | "id"
  | "notes"
  | "portfolio_id"
  | "symbol"
  | "target_price"
  | "updated_at"
  | "user_id"
>;

export type DefaultPortfolioWatchlistResult =
  | {
      error?: never;
      items: DefaultPortfolioWatchlistItem[];
      portfolio: Pick<PortfolioRow, "base_currency" | "id" | "name">;
    }
  | {
      error: string;
      items?: never;
      portfolio?: never;
    };

export async function listDefaultPortfolioWatchlistItems(
  supabase: AppSupabaseClient,
  user: AuthenticatedUser,
): Promise<DefaultPortfolioWatchlistResult> {
  const defaultPortfolioResult = await ensureDefaultPortfolioForUser(
    supabase,
    user,
  );

  if ("error" in defaultPortfolioResult) {
    return {
      error:
        defaultPortfolioResult.error ?? "Could not load your default portfolio.",
    };
  }

  const { data, error } = await supabase
    .from("watchlist_items")
    .select(
      "created_at,id,notes,portfolio_id,symbol,target_price,updated_at,user_id",
    )
    .eq("portfolio_id", defaultPortfolioResult.portfolio.id)
    .eq("user_id", user.id)
    .order("symbol", { ascending: true });

  if (error) {
    console.error("Could not load default portfolio watchlist.", error);

    return {
      error: "Could not load your watchlist.",
    };
  }

  return {
    items: data ?? [],
    portfolio: defaultPortfolioResult.portfolio,
  };
}
