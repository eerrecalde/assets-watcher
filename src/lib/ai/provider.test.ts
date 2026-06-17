import { describe, expect, it } from "vitest";

import {
  CAUTIOUS_EDUCATIONAL_AI_TAKE_POLICY,
  createAIProviderFailure,
  createAIProviderSuccess,
  type AIProvider,
  type GenerateAITakeRequest,
} from "./provider";

const generatedAt = new Date("2026-06-16T10:00:00.000Z");

const request = {
  outputPolicy: CAUTIOUS_EDUCATIONAL_AI_TAKE_POLICY,
  snapshot: {
    generatedAt: "2026-06-16T09:59:00.000Z",
    portfolio: {
      asOfDate: "2026-06-15",
      baseCurrency: "USD",
      cashAllocationPercent: 7.69,
      cashBalance: 1000,
      deterministicFacts: [
        {
          asOfDate: "2026-06-15",
          description: "Technology allocation is above the user's threshold.",
          source: "derived_portfolio_metric",
        },
      ],
      sectorAllocation: [
        {
          asOfDate: "2026-06-15",
          holdingCount: 1,
          percentage: 35,
          sector: "Technology",
          status: "calculated",
        },
      ],
      totalMarketValue: 12000,
      totalPortfolioValue: 13000,
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
      source: "stored",
    },
    holdings: [
      {
        allocationPercent: 35,
        averageCost: 120,
        companyName: "Example Corp.",
        deterministicFacts: [
          {
            asOfDate: "2026-06-15",
            description: "The stock is labelled Expensive by valuation rules.",
            source: "deterministic_stock_score",
          },
        ],
        latestPrice: {
          asOfDate: "2026-06-15",
          currency: "USD",
          freshness: "fresh",
          value: 180,
        },
        marketValue: 3500,
        portfolioFit: {
          caution:
            "Portfolio fit explains deterministic allocation checks for educational review and is not financial advice.",
          label: "Overweight",
          ruleChecks: [],
          summary:
            "Position allocation is above the maximum single-stock allocation threshold.",
        },
        quantity: 20,
        sector: "Technology",
        stockScore: {
          caution:
            "Scores are deterministic educational checks and are not financial advice.",
          label: "Expensive",
          scoredAt: "2026-06-16T09:58:00.000Z",
          summary: "Valuation rules classify this stock as expensive.",
        },
        symbol: "EXMP",
        unrealizedGainLoss: 1200,
        unrealizedGainLossPercent: 50,
      },
    ],
    watchlist: [
      {
        companyName: "Watch Corp.",
        deterministicFacts: [],
        latestPrice: null,
        sector: null,
        stockScore: null,
        symbol: "WTCH",
      },
    ],
  },
} satisfies GenerateAITakeRequest;

describe("AI provider result helpers", () => {
  it("creates explicit success results with provider, model, usage, and cost metadata", () => {
    expect(
      createAIProviderSuccess({
        provider: "test-provider",
        model: "test-model",
        generatedAt,
        usage: {
          inputTokens: 120,
          outputTokens: 80,
          totalTokens: 200,
        },
        cost: {
          currency: "USD",
          estimatedCost: 0.001,
        },
        data: {
          deterministicFactsExplained: [
            "Technology allocation is above the user's threshold.",
          ],
          limitations: ["This is educational context only."],
          narrative:
            "Your deterministic rules suggest reviewing technology exposure.",
        },
      }),
    ).toEqual({
      ok: true,
      data: {
        deterministicFactsExplained: [
          "Technology allocation is above the user's threshold.",
        ],
        limitations: ["This is educational context only."],
        narrative:
          "Your deterministic rules suggest reviewing technology exposure.",
      },
      metadata: {
        cost: {
          currency: "USD",
          estimatedCost: 0.001,
        },
        generatedAt,
        model: "test-model",
        provider: "test-provider",
        usage: {
          inputTokens: 120,
          outputTokens: 80,
          totalTokens: 200,
        },
      },
      warnings: [],
    });
  });

  it("creates browser-safe failure results without provider implementation details", () => {
    expect(
      createAIProviderFailure({
        provider: "test-provider",
        model: "test-model",
        generatedAt,
        code: "provider_unavailable",
        message: "AI take generation is temporarily unavailable.",
      }),
    ).toEqual({
      ok: false,
      error: {
        code: "provider_unavailable",
        message: "AI take generation is temporarily unavailable.",
      },
      metadata: {
        cost: null,
        generatedAt,
        model: "test-model",
        provider: "test-provider",
        usage: null,
      },
    });
  });
});

describe("AIProvider", () => {
  it("defines a server-side contract for explaining structured deterministic snapshots", async () => {
    const provider: AIProvider = {
      id: "mock",
      displayName: "Mock AI",
      model: "mock-educational-model",
      async generateTake(input) {
        expect(input).toEqual(request);
        expect(input.outputPolicy).toMatchObject({
          purpose: "explain_deterministic_portfolio_snapshot",
          requiredTone: "cautious_educational",
        });
        expect(input.outputPolicy.forbiddenOutputs).toContain(
          "trading_instruction",
        );

        return createAIProviderSuccess({
          provider: this.id,
          model: this.model,
          generatedAt,
          data: {
            deterministicFactsExplained:
              input.snapshot.portfolio.deterministicFacts.map(
                (fact) => fact.description,
              ),
            limitations: ["This explanation does not include instructions."],
            narrative:
              "Your deterministic rules suggest reviewing concentration.",
          },
        });
      },
    };

    await expect(provider.generateTake(request)).resolves.toMatchObject({
      ok: true,
      metadata: {
        provider: "mock",
        model: "mock-educational-model",
      },
      data: {
        deterministicFactsExplained: [
          "Technology allocation is above the user's threshold.",
        ],
      },
    });
  });

  it("keeps provider input limited to compact snapshots rather than raw personal data", () => {
    const serializedRequest = JSON.stringify(request);

    expect(serializedRequest).not.toContain("email");
    expect(serializedRequest).not.toContain("fullName");
    expect(serializedRequest).not.toContain("transactions");
    expect(serializedRequest).not.toContain("rawTransaction");
    expect(serializedRequest).not.toContain("userId");
  });
});
