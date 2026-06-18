"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  CAUTIOUS_EDUCATIONAL_AI_TAKE_POLICY,
  createGeminiProvider,
  generatePortfolioSnapshotForAITake,
  type AITakeOutput,
  type AITakeResult,
} from "@/lib/ai";
import { ensureDefaultPortfolioForUser } from "@/lib/portfolios/defaults";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Database, Json } from "@/types/supabase";

const DASHBOARD_PATH = "/dashboard";
const AI_TAKE_RATE_LIMIT_MAX_GENERATIONS = 3;
const AI_TAKE_RATE_LIMIT_WINDOW_HOURS = 24;

type AITakeInsert =
  Database["public"]["Tables"]["ai_takes"]["Insert"];

type AITakeRateLimitResult =
  | { allowed: true }
  | { allowed: false; message: string }
  | { error: string };

type AITakeFailureStage =
  | "admin_client_configuration"
  | "provider_failure"
  | "provider_exception"
  | "provider_initialization"
  | "rate_limit_check"
  | "snapshot_exception"
  | "storage_failure"
  | "storage_exception";

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }

  return String(error);
}

function logAITakeFailure({
  code,
  error,
  model,
  portfolioId,
  provider,
  stage,
}: {
  code?: string;
  error?: unknown;
  model?: string;
  portfolioId?: string;
  provider?: string;
  stage: AITakeFailureStage;
}) {
  console.error("AI take generation failed", {
    code,
    error: error ? getErrorMessage(error) : undefined,
    model,
    portfolioId,
    provider,
    stage,
  });
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

  redirect(`${DASHBOARD_PATH}?${params.toString()}`);
}

function getAITakeFailureMessage(result: Extract<AITakeResult, { ok: false }>) {
  switch (result.error.code) {
    case "invalid_snapshot":
      return "The portfolio snapshot is not ready for an AI take yet.";
    case "rate_limited":
      return "AI take generation is rate limited. Try again later.";
    case "provider_unavailable":
      return "The AI provider is temporarily unavailable. Try again later.";
    case "safety_blocked":
      return "The AI provider blocked this response for safety reasons.";
    case "invalid_response":
      return "The AI provider returned an incomplete response. Try again later.";
    case "provider_error":
    default:
      return "AI take generation is temporarily unavailable. Try again later.";
  }
}

function formatAITakeMarkdown(output: AITakeOutput) {
  const sections = [output.narrative.trim()];

  if (output.deterministicFactsExplained.length > 0) {
    sections.push(
      [
        "Deterministic facts explained:",
        ...output.deterministicFactsExplained.map((fact) => `- ${fact}`),
      ].join("\n"),
    );
  }

  if (output.limitations.length > 0) {
    sections.push(
      [
        "Limitations:",
        ...output.limitations.map((limitation) => `- ${limitation}`),
      ].join("\n"),
    );
  }

  return sections.join("\n\n");
}

function toNonNegativeInteger(value: number | null | undefined) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : null;
}

function toCostValue(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value.toFixed(6)
    : null;
}

function toGeneratedAtValue(value: Date | null | undefined) {
  return value instanceof Date && Number.isFinite(value.getTime())
    ? value.toISOString()
    : undefined;
}

async function checkAITakeRateLimit(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  now = new Date(),
): Promise<AITakeRateLimitResult> {
  const windowStart = new Date(now);
  windowStart.setHours(
    windowStart.getHours() - AI_TAKE_RATE_LIMIT_WINDOW_HOURS,
  );

  const { count, error } = await admin
    .from("ai_takes")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", windowStart.toISOString());

  if (error) {
    logAITakeFailure({
      error,
      stage: "rate_limit_check",
    });
    return {
      error: "Could not check your AI take limit. Try again later.",
    };
  }

  if ((count ?? 0) >= AI_TAKE_RATE_LIMIT_MAX_GENERATIONS) {
    return {
      allowed: false,
      message: `AI take limit reached. You can generate up to ${AI_TAKE_RATE_LIMIT_MAX_GENERATIONS} AI takes per ${AI_TAKE_RATE_LIMIT_WINDOW_HOURS} hours. Try again later.`,
    };
  }

  return { allowed: true };
}

export async function generateAITakeAction() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?next=${encodeURIComponent(DASHBOARD_PATH)}`);
  }

  const portfolioResult = await ensureDefaultPortfolioForUser(supabase, user);

  if ("error" in portfolioResult) {
    redirectWithFeedback({
      error:
        portfolioResult.error ?? "Could not load your portfolio for an AI take.",
    });
  }

  let admin: ReturnType<typeof createAdminClient>;

  try {
    admin = createAdminClient();
  } catch (error) {
    logAITakeFailure({
      error,
      stage: "admin_client_configuration",
    });
    redirectWithFeedback({
      error: "AI take storage is not configured correctly.",
    });
  }

  const rateLimitResult = await checkAITakeRateLimit(admin, user.id);

  if ("error" in rateLimitResult) {
    redirectWithFeedback({ error: rateLimitResult.error });
  }

  if (!rateLimitResult.allowed) {
    redirectWithFeedback({ error: rateLimitResult.message });
  }

  let snapshotResult: Awaited<
    ReturnType<typeof generatePortfolioSnapshotForAITake>
  >;

  try {
    snapshotResult = await generatePortfolioSnapshotForAITake(
      supabase as never,
      user,
      { portfolioId: portfolioResult.portfolio.id },
    );
  } catch (error) {
    logAITakeFailure({
      error,
      portfolioId: portfolioResult.portfolio.id,
      stage: "snapshot_exception",
    });
    redirectWithFeedback({
      error:
        "Could not prepare your portfolio snapshot for an AI take. Your portfolio data is still available.",
    });
  }

  if (!snapshotResult.ok) {
    redirectWithFeedback({ error: snapshotResult.error.message });
  }

  let provider: ReturnType<typeof createGeminiProvider>;

  try {
    provider = createGeminiProvider();
  } catch (error) {
    logAITakeFailure({
      error,
      portfolioId: portfolioResult.portfolio.id,
      stage: "provider_initialization",
    });
    redirectWithFeedback({
      error: "AI take generation failed. Try again later.",
    });
  }

  let takeResult: AITakeResult;

  try {
    takeResult = await provider.generateTake({
      outputPolicy: CAUTIOUS_EDUCATIONAL_AI_TAKE_POLICY,
      snapshot: snapshotResult.snapshot,
    });
  } catch (error) {
    logAITakeFailure({
      error,
      portfolioId: portfolioResult.portfolio.id,
      stage: "provider_exception",
    });
    redirectWithFeedback({
      error: "AI take generation failed. Try again later.",
    });
  }

  if (!takeResult.ok) {
    logAITakeFailure({
      code: takeResult.error.code,
      error: takeResult.error.message,
      model: takeResult.metadata.model,
      portfolioId: portfolioResult.portfolio.id,
      provider: takeResult.metadata.provider,
      stage: "provider_failure",
    });
    redirectWithFeedback({ error: getAITakeFailureMessage(takeResult) });
  }

  const insertPayload: AITakeInsert = {
    created_at: toGeneratedAtValue(takeResult.metadata.generatedAt),
    estimated_cost: toCostValue(takeResult.metadata.cost?.estimatedCost),
    input_snapshot_json: snapshotResult.snapshot as unknown as Json,
    model: takeResult.metadata.model,
    output_markdown: formatAITakeMarkdown(takeResult.data),
    portfolio_id: portfolioResult.portfolio.id,
    provider: takeResult.metadata.provider,
    token_usage_input: toNonNegativeInteger(
      takeResult.metadata.usage?.inputTokens,
    ),
    token_usage_output: toNonNegativeInteger(
      takeResult.metadata.usage?.outputTokens,
    ),
    user_id: user.id,
  };

  let insertError: { message: string } | null;

  try {
    const insertResult = await admin.from("ai_takes").insert(insertPayload);
    insertError = insertResult.error;
  } catch (error) {
    logAITakeFailure({
      error,
      model: takeResult.metadata.model,
      portfolioId: portfolioResult.portfolio.id,
      provider: takeResult.metadata.provider,
      stage: "storage_exception",
    });
    redirectWithFeedback({
      error: "The AI take was generated but could not be saved. Try again.",
    });
  }

  if (insertError) {
    logAITakeFailure({
      error: insertError,
      model: takeResult.metadata.model,
      portfolioId: portfolioResult.portfolio.id,
      provider: takeResult.metadata.provider,
      stage: "storage_failure",
    });
    redirectWithFeedback({
      error: "The AI take was generated but could not be saved. Try again.",
    });
  }

  revalidatePath(DASHBOARD_PATH);
  redirectWithFeedback({ success: "AI take generated." });
}
