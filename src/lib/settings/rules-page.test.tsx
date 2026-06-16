import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { DEFAULT_GRAHAM_SCORING_THRESHOLDS } from "@/lib/scoring/thresholds";
import type { LoadUserRuleThresholdsResult } from "@/lib/scoring/user-rules";
import {
  RulesSettingsPage,
  type RulesSettingsPageDependencies,
} from "./rules-page";

const user = {
  email: "investor@example.com",
  id: "user-1",
};

describe("RulesSettingsPage", () => {
  it("redirects unauthenticated users to login with the rules settings path", async () => {
    const redirectToLogin = vi.fn((url: string): never => {
      throw new Error(`redirect:${url}`);
    });

    await expect(
      RulesSettingsPage({
        createSupabaseClient: async () => createSupabaseFixture(null),
        loadRuleThresholds: vi.fn(),
        redirectToLogin,
      }),
    ).rejects.toThrow("redirect:/login?next=%2Fsettings%2Frules");
    expect(redirectToLogin).toHaveBeenCalledWith(
      "/login?next=%2Fsettings%2Frules",
    );
  });

  it("renders stored rule thresholds for the signed-in user", async () => {
    const storedResult = {
      ok: true,
      source: "stored",
      thresholds: {
        ...DEFAULT_GRAHAM_SCORING_THRESHOLDS,
        maxDebtToEquity: 0.75,
        maxPb: 2.5,
        maxPe: 18,
        maxSectorAllocationPercent: 25,
        maxSingleStockAllocationPercent: 8,
        minCurrentRatio: 2,
        minMarginOfSafetyPercent: 30,
      },
    } satisfies LoadUserRuleThresholdsResult;
    const loadRuleThresholds = vi.fn(async () => storedResult);

    const supabase = createSupabaseFixture(user);
    const html = await renderPage({
      createSupabaseClient: async () => supabase,
      loadRuleThresholds,
    });

    expect(loadRuleThresholds).toHaveBeenCalledWith(supabase, "user-1");
    expect(html).toContain("Rules settings");
    expect(html).toContain("investor@example.com");
    expect(html).toContain("Stored rules");
    expect(html).toContain("Maximum P/E");
    expect(html).toContain('name="max_pe"');
    expect(html).toContain('value="18"');
    expect(html).toContain("18");
    expect(html).toContain("Maximum P/B");
    expect(html).toContain('name="max_pb"');
    expect(html).toContain('value="2.5"');
    expect(html).toContain("2.5");
    expect(html).toContain("Minimum margin of safety");
    expect(html).toContain('name="min_margin_of_safety"');
    expect(html).toContain('value="30"');
    expect(html).toContain("30%");
    expect(html).toContain("Save valuation thresholds");
    expect(html).toContain("do not recommend buying or selling");
    expect(html).toContain("Minimum current ratio");
    expect(html).toContain("2");
    expect(html).toContain("Maximum debt/equity");
    expect(html).toContain("0.75");
    expect(html).toContain("Maximum single-stock allocation");
    expect(html).toContain("8%");
    expect(html).toContain("Maximum sector allocation");
    expect(html).toContain("25%");
    expect(html).toContain("not financial advice");
    expect(html).toContain('href="/dashboard"');
    expect(html).toContain('href="/holdings"');
    expect(html).toContain('href="/watchlist"');
  });

  it("renders product-plan defaults when no stored rules exist", async () => {
    const defaultResult = {
      ok: true,
      source: "defaults",
      thresholds: DEFAULT_GRAHAM_SCORING_THRESHOLDS,
    } satisfies LoadUserRuleThresholdsResult;

    const html = await renderPage({
      loadRuleThresholds: vi.fn(async () => defaultResult),
    });

    expect(html).toContain("Product-plan defaults");
    expect(html).toContain("20");
    expect(html).toContain("3");
    expect(html).toContain("25%");
    expect(html).toContain("1.5");
    expect(html).toContain("1");
    expect(html).toContain("10%");
    expect(html).toContain("30%");
  });

  it("renders settings feedback messages from the route query", async () => {
    const html = await renderPage({
      feedbackMessages: [
        {
          id: "notice:success",
          message: "Valuation thresholds saved.",
          tone: "success",
        },
      ],
    });

    expect(html).toContain("Valuation thresholds saved.");
  });

  it("renders a load error when rule thresholds cannot be read", async () => {
    const errorResult = {
      error: {
        code: "rules_read_failed",
        message: "Could not load user rule thresholds: permission denied",
      },
      ok: false,
    } satisfies LoadUserRuleThresholdsResult;

    const html = await renderPage({
      loadRuleThresholds: vi.fn(async () => errorResult),
    });

    expect(html).toContain(
      "Could not load user rule thresholds: permission denied",
    );
    expect(html).not.toContain("Scoring thresholds");
  });
});

async function renderPage(
  overrides: Partial<RulesSettingsPageDependencies> = {},
) {
  const defaultResult = {
    ok: true,
    source: "defaults",
    thresholds: DEFAULT_GRAHAM_SCORING_THRESHOLDS,
  } satisfies LoadUserRuleThresholdsResult;

  return renderToStaticMarkup(
    await RulesSettingsPage({
      createSupabaseClient: async () => createSupabaseFixture(user),
      loadRuleThresholds: vi.fn(async () => defaultResult),
      redirectToLogin: vi.fn((url: string): never => {
        throw new Error(`redirect:${url}`);
      }),
      updateValuationThresholds: vi.fn(async () => {}),
      ...overrides,
    }),
  );
}

function createSupabaseFixture(currentUser: typeof user | null) {
  return {
    auth: {
      getUser: vi.fn(async () => ({
        data: {
          user: currentUser,
        },
      })),
    },
  } as never;
}
