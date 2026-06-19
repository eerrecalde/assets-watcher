"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  parseAlertPreferencesFormData,
  saveAlertPreferences,
  type SaveAlertPreferencesClient,
} from "@/lib/settings/alert-preferences";
import {
  loadUserRuleThresholds,
  resetUserRuleThresholds,
  saveAllocationRuleThresholds,
  saveValuationRuleThresholds,
  type ResetUserRuleThresholdsClient,
  type SaveAllocationRuleThresholdsClient,
  type SaveValuationRuleThresholdsClient,
  type UserRulesClient,
} from "@/lib/scoring/user-rules";
import {
  recalculateScoresAfterRuleChange,
  type RuleChangeScoreRecalculationClient,
} from "@/lib/scoring/rule-change-recalculation";
import { createClient } from "@/lib/supabase/server";

const RULES_SETTINGS_PATH = "/settings/rules";

function getString(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value.trim() : "";
}

function redirectWithFeedback({
  error,
  success,
  warning,
}: {
  error?: string;
  success?: string;
  warning?: string;
}): never {
  const params = new URLSearchParams();

  if (success) {
    params.set("success", success);
  }

  if (error) {
    params.set("error", error);
  }

  if (warning) {
    params.set("warning", warning);
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

  const warning = await refreshRuleDependentScores(supabase, user);

  revalidatePath(RULES_SETTINGS_PATH);
  revalidatePath("/dashboard");
  revalidatePath("/holdings");
  revalidatePath("/watchlist");
  redirectWithFeedback({
    success: "Valuation thresholds saved.",
    warning,
  });
}

export async function updateAllocationThresholdsAction(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?next=${encodeURIComponent(RULES_SETTINGS_PATH)}`);
  }

  const result = await saveAllocationRuleThresholds(
    supabase as unknown as SaveAllocationRuleThresholdsClient,
    user.id,
    {
      maxSectorAllocationPercent: getString(
        formData,
        "max_sector_allocation",
      ),
      maxSingleStockAllocationPercent: getString(
        formData,
        "max_single_stock_allocation",
      ),
    },
  );

  if (!result.ok) {
    redirectWithFeedback({ error: result.error.message });
  }

  const warning = await refreshRuleDependentScores(supabase, user);

  revalidatePath(RULES_SETTINGS_PATH);
  revalidatePath("/dashboard");
  revalidatePath("/holdings");
  revalidatePath("/watchlist");
  redirectWithFeedback({
    success: "Allocation thresholds saved.",
    warning,
  });
}

export async function resetRuleThresholdsAction() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?next=${encodeURIComponent(RULES_SETTINGS_PATH)}`);
  }

  const result = await resetUserRuleThresholds(
    supabase as unknown as ResetUserRuleThresholdsClient,
    user.id,
  );

  if (!result.ok) {
    redirectWithFeedback({ error: result.error.message });
  }

  const warning = await refreshRuleDependentScores(supabase, user);

  revalidatePath(RULES_SETTINGS_PATH);
  revalidatePath("/dashboard");
  revalidatePath("/holdings");
  revalidatePath("/watchlist");
  redirectWithFeedback({
    success: "Rule thresholds reset to product-plan defaults.",
    warning,
  });
}

export async function updateAlertPreferencesAction(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?next=${encodeURIComponent(RULES_SETTINGS_PATH)}`);
  }

  const result = await saveAlertPreferences(
    supabase as unknown as SaveAlertPreferencesClient,
    user.id,
    parseAlertPreferencesFormData(formData),
  );

  if (!result.ok) {
    redirectWithFeedback({ error: result.error.message });
  }

  revalidatePath(RULES_SETTINGS_PATH);
  revalidatePath("/dashboard");
  redirectWithFeedback({
    success: "Alert preferences saved.",
  });
}

async function refreshRuleDependentScores(
  supabase: Awaited<ReturnType<typeof createClient>>,
  user: { email?: string | null; id: string },
) {
  const rulesResult = await loadUserRuleThresholds(
    supabase as unknown as UserRulesClient,
    user.id,
  );

  if (!rulesResult.ok) {
    return "Rules were saved, but score snapshots could not be refreshed because the saved thresholds could not be reloaded.";
  }

  const recalculationResult = await recalculateScoresAfterRuleChange(
    supabase as unknown as RuleChangeScoreRecalculationClient,
    user,
    {
      thresholds: rulesResult.thresholds,
    },
  );

  if (recalculationResult.ok) {
    return undefined;
  }

  console.error("Rule-dependent score recalculation failed.", {
    error: recalculationResult.error,
    userId: user.id,
  });

  return recalculationResult.error.message;
}
