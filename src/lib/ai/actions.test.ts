import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string): never => {
    throw new Error(`redirect:${url}`);
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));

vi.mock("@/lib/portfolios/defaults", () => ({
  ensureDefaultPortfolioForUser: vi.fn(),
}));

vi.mock("@/lib/ai", () => ({
  CAUTIOUS_EDUCATIONAL_AI_TAKE_POLICY: {
    forbiddenOutputs: ["trading_instruction"],
    purpose: "explain_deterministic_portfolio_snapshot",
    requiredTone: "cautious_educational",
  },
  createGeminiProvider: vi.fn(),
  generatePortfolioSnapshotForAITake: vi.fn(),
}));

import { revalidatePath } from "next/cache";

import { generateAITakeAction } from "./actions";
import {
  createGeminiProvider,
  generatePortfolioSnapshotForAITake,
} from "@/lib/ai";
import { ensureDefaultPortfolioForUser } from "@/lib/portfolios/defaults";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { AITakePortfolioSnapshot, AITakeResult } from "./provider";

const user = {
  id: "user-1",
};

const portfolio = {
  base_currency: "USD",
  id: "portfolio-1",
  name: "Default Portfolio",
  user_id: user.id,
};

const snapshot: AITakePortfolioSnapshot = {
  generatedAt: "2026-06-17T14:00:00.000Z",
  holdings: [],
  portfolio: {
    asOfDate: null,
    baseCurrency: "USD",
    cashAllocationPercent: null,
    cashBalance: null,
    deterministicFacts: [],
    sectorAllocation: [],
    totalMarketValue: null,
    totalPortfolioValue: null,
  },
  rules: {
    maxDebtToEquity: 1,
    maxPb: 3,
    maxPe: 20,
    maxSectorAllocationPercent: 30,
    maxSingleStockAllocationPercent: 10,
    minCashAllocationPercent: 5,
    minCurrentRatio: 1.5,
    minMarginOfSafetyPercent: 25,
    source: "defaults",
  },
  watchlist: [],
};

describe("generateAITakeAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createClient).mockResolvedValue(createSupabaseFixture() as never);
    vi.mocked(createAdminClient).mockReturnValue(createAdminFixture() as never);
    vi.mocked(ensureDefaultPortfolioForUser).mockResolvedValue({
      portfolio,
    });
    vi.mocked(generatePortfolioSnapshotForAITake).mockResolvedValue({
      ok: true,
      snapshot,
    });
    vi.mocked(createGeminiProvider).mockReturnValue({
      displayName: "Gemini",
      id: "gemini",
      model: "gemini-3.5-flash",
      generateTake: vi.fn(async (): Promise<AITakeResult> => ({
        ok: true,
        data: {
          deterministicFactsExplained: ["Cash allocation is unavailable."],
          limitations: ["Educational context only."],
          narrative: "Your deterministic snapshot is ready for review.",
        },
        metadata: {
          cost: {
            currency: "USD",
            estimatedCost: 0.00042,
          },
          generatedAt: new Date("2026-06-17T14:01:00.000Z"),
          model: "gemini-3.5-flash",
          provider: "gemini",
          usage: {
            inputTokens: 120,
            outputTokens: 80,
            totalTokens: 200,
          },
        },
        warnings: [],
      })),
    } as never);
  });

  it("builds, generates, stores, and redirects with success feedback", async () => {
    const admin = createAdminFixture();
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    await expect(generateAITakeAction()).rejects.toThrow(
      "redirect:/dashboard?success=AI+take+generated.",
    );

    expect(generatePortfolioSnapshotForAITake).toHaveBeenCalledWith(
      expect.anything(),
      user,
      { portfolioId: portfolio.id },
    );
    expect(admin.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        created_at: "2026-06-17T14:01:00.000Z",
        estimated_cost: "0.000420",
        input_snapshot_json: snapshot,
        model: "gemini-3.5-flash",
        output_markdown: expect.stringContaining(
          "Your deterministic snapshot is ready for review.",
        ),
        portfolio_id: portfolio.id,
        provider: "gemini",
        token_usage_input: 120,
        token_usage_output: 80,
        user_id: user.id,
      }),
    );
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard");
  });

  it("stores nullable usage and cost metadata when the provider omits them", async () => {
    const admin = createAdminFixture();
    vi.mocked(createAdminClient).mockReturnValue(admin as never);
    vi.mocked(createGeminiProvider).mockReturnValue({
      displayName: "Gemini",
      id: "gemini",
      model: "gemini-3.5-flash",
      generateTake: vi.fn(async (): Promise<AITakeResult> => ({
        ok: true,
        data: {
          deterministicFactsExplained: [],
          limitations: [],
          narrative: "Your deterministic snapshot is ready for review.",
        },
        metadata: {
          cost: null,
          generatedAt: new Date("2026-06-17T14:02:00.000Z"),
          model: "gemini-3.5-flash",
          provider: "gemini",
          usage: null,
        },
        warnings: [],
      })),
    } as never);

    await expect(generateAITakeAction()).rejects.toThrow(
      "redirect:/dashboard?success=AI+take+generated.",
    );

    expect(admin.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        created_at: "2026-06-17T14:02:00.000Z",
        estimated_cost: null,
        token_usage_input: null,
        token_usage_output: null,
      }),
    );
  });

  it("redirects with controlled feedback when the provider fails", async () => {
    const admin = createAdminFixture();
    vi.mocked(createAdminClient).mockReturnValue(admin as never);
    vi.mocked(createGeminiProvider).mockReturnValue({
      displayName: "Gemini",
      id: "gemini",
      model: "gemini-3.5-flash",
      generateTake: vi.fn(async (): Promise<AITakeResult> => ({
        ok: false,
        error: {
          code: "provider_unavailable",
          message: "Gemini is unavailable.",
        },
        metadata: {
          cost: null,
          generatedAt: new Date("2026-06-17T14:01:00.000Z"),
          model: "gemini-3.5-flash",
          provider: "gemini",
          usage: null,
        },
      })),
    } as never);

    await expect(generateAITakeAction()).rejects.toThrow(
      "redirect:/dashboard?error=The+AI+provider+is+temporarily+unavailable.+Try+again+later.",
    );

    expect(admin.insert).not.toHaveBeenCalled();
  });
});

function createSupabaseFixture() {
  return {
    auth: {
      getUser: vi.fn(async () => ({
        data: {
          user,
        },
      })),
    },
  };
}

function createAdminFixture() {
  const insert = vi.fn(async () => ({
    error: null,
  }));

  return {
    insert,
    from: vi.fn(() => ({
      insert,
    })),
  };
}
