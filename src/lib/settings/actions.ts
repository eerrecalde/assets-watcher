"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  saveValuationRuleThresholds,
  type SaveValuationRuleThresholdsClient,
} from "@/lib/scoring/user-rules";
import { createClient } from "@/lib/supabase/server";

const RULES_SETTINGS_PATH = "/settings/rules";

function getString(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value.trim() : "";
}

function redirectWithFeedback({
  error,
  success,
}: {
  error?: string;
  success?: string;
}): never {
  const params = new URLSearchParams();

  if (success) {
    params.set("success", success);
  }

  if (error) {
    params.set("error", error);
  }

  if (params.size > 0) {
    params.set("notice", Date.now().toString());
  }

  redirect(`${RULES_SETTINGS_PATH}?${params.toString()}`);
}

export async function updateValuationThresholdsAction(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?next=${encodeURIComponent(RULES_SETTINGS_PATH)}`);
  }

  const result = await saveValuationRuleThresholds(
    supabase as unknown as SaveValuationRuleThresholdsClient,
    user.id,
    {
      maxPb: getString(formData, "max_pb"),
      maxPe: getString(formData, "max_pe"),
      minMarginOfSafetyPercent: getString(
        formData,
        "min_margin_of_safety",
      ),
    },
  );

  if (!result.ok) {
    redirectWithFeedback({ error: result.error.message });
  }

  revalidatePath(RULES_SETTINGS_PATH);
  revalidatePath("/dashboard");
  revalidatePath("/holdings");
  revalidatePath("/watchlist");
  redirectWithFeedback({ success: "Valuation thresholds saved." });
}
