import { redirect } from "next/navigation";

import {
  StockDetailPage,
  type StockDetailPageProps,
} from "@/lib/stocks/detail-page";
import { ensureDefaultPortfolioForUser } from "@/lib/portfolios/defaults";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default function Page(props: StockDetailPageProps) {
  return StockDetailPage({
    ...props,
    createSupabaseClient: createClient,
    ensureDefaultPortfolio: ensureDefaultPortfolioForUser,
    redirectToLogin: redirect,
  });
}
