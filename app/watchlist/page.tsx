import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { WatchlistPage } from "@/lib/watchlist/page";

export const dynamic = "force-dynamic";

export default function Page() {
  return WatchlistPage({
    createSupabaseClient: createClient,
    redirectToLogin: redirect,
  });
}
