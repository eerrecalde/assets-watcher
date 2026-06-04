import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { getSupabaseServerEnv } from "@/lib/env";
import type { Database } from "@/types/supabase";

export function createAdminClient() {
  const { url, secretKey } = getSupabaseServerEnv();

  return createSupabaseClient<Database>(url, secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
