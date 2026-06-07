import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { WatchlistPage } from "@/lib/watchlist/page";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function Page({ searchParams }: PageProps) {
  const params = searchParams ? await searchParams : {};

  return WatchlistPage({
    createSupabaseClient: createClient,
    feedbackParams: params,
    redirectToLogin: redirect,
  });
}
