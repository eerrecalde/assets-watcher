import { redirect } from "next/navigation";

import {
  RulesSettingsPage,
  type SettingsSupabaseClient,
} from "@/lib/settings/rules-page";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function Page() {
  return RulesSettingsPage({
    createSupabaseClient: async () =>
      (await createClient()) as unknown as SettingsSupabaseClient,
    redirectToLogin: redirect,
  });
}
