import { describe, expect, it, vi } from "vitest";

import {
  CAUTIOUS_EDUCATIONAL_AI_TAKE_POLICY,
  createGeminiProvider,
  type GenerateAITakeRequest,
} from "./index";

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
        portfolioFit: null,
        quantity: 20,
        sector: "Technology",
        stockScore: null,
        symbol: "EXMP",
        unrealizedGainLoss: 1200,
        unrealizedGainLossPercent: 50,
      },
    ],
    watchlist: [],
  },
} satisfies GenerateAITakeRequest;

function jsonResponse(data: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

function createProvider(fetchFn: typeof fetch, options = {}) {
  return createGeminiProvider({
    apiKey: "test-gemini-key",
    baseUrl: "https://example.test",
    fetchFn,
    model: "gemini-test-model",
    now: () => generatedAt,
    ...options,
  });
}

describe("GeminiProvider", () => {
  it("maps compact AI take snapshots to Gemini generateContent requests", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () =>
      jsonResponse({
        candidates: [
          {
            finishReason: "STOP",
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    deterministicFactsExplained: [
                      "Technology allocation is above the user's threshold.",
                    ],
                    limitations: [
                      "This review only uses the provided structured data.",
                    ],
                    narrative:
                      "Your rules suggest reviewing technology concentration.",
                  }),
                },
              ],
            },
          },
        ],
        usageMetadata: {
          promptTokenCount: 120,
          candidatesTokenCount: 80,
          totalTokenCount: 200,
        },
      }),
    );

    const result = await createProvider(fetchFn).generateTake(request);
    const [url, init] = fetchFn.mock.calls[0];
    const body = JSON.parse(String(init?.body));

    expect(url).toBe(
      "https://example.test/v1beta/models/gemini-test-model:generateContent?key=test-gemini-key",
    );
    expect(init).toMatchObject({
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
    });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(body.generationConfig).toMatchObject({
      candidateCount: 1,
      responseMimeType: "application/json",
      temperature: 0.2,
    });
    expect(body.systemInstruction.parts[0].text).toContain(
      "Use only the structured data provided.",
    );
    expect(body.systemInstruction.parts[0].text).toContain(
      'Do not say "buy", "sell", or "you should".',
    );
    expect(body.contents[0].parts[0].text).toContain(
      "Technology allocation is above the user's threshold.",
    );
    expect(body.contents[0].parts[0].text).not.toContain("test-gemini-key");
    expect(result).toEqual({
      ok: true,
      data: {
        deterministicFactsExplained: [
          "Technology allocation is above the user's threshold.",
        ],
        limitations: ["This review only uses the provided structured data."],
        narrative: "Your rules suggest reviewing technology concentration.",
      },
      metadata: {
        cost: null,
        generatedAt,
        model: "gemini-test-model",
        provider: "gemini",
        usage: {
          inputTokens: 120,
          outputTokens: 80,
          totalTokens: 200,
        },
      },
      warnings: [],
    });
  });

  it("returns a controlled failure when Gemini is not configured", async () => {
    const fetchFn = vi.fn();

    const result = await createProvider(fetchFn, { apiKey: " " }).generateTake(
      request,
    );

    expect(fetchFn).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "provider_error",
        message:
          "Gemini provider is not configured. Set GEMINI_API_KEY on the server.",
      },
      metadata: {
        model: "gemini-test-model",
        provider: "gemini",
      },
    });
  });

  it("maps provider rate limits to shared AI provider failures", async () => {
    const fetchFn = vi.fn(async () =>
      jsonResponse(
        {
          error: {
            message: "Quota exceeded.",
          },
        },
        { status: 429 },
      ),
    );

    const result = await createProvider(fetchFn).generateTake(request);

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "rate_limited",
        message: "Quota exceeded.",
      },
      metadata: {
        provider: "gemini",
        usage: null,
      },
    });
  });

  it("maps timed-out provider requests to unavailable failures", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => {
      throw new DOMException("The operation timed out.", "TimeoutError");
    });

    const result = await createProvider(fetchFn, {
      timeoutMs: 25,
    }).generateTake(request);

    const [, init] = fetchFn.mock.calls[0];

    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "provider_unavailable",
        message: "Gemini is unavailable.",
      },
      metadata: {
        provider: "gemini",
      },
    });
  });

  it("maps safety-blocked responses to controlled failures", async () => {
    const fetchFn = vi.fn(async () =>
      jsonResponse({
        candidates: [
          {
            finishReason: "SAFETY",
          },
        ],
        usageMetadata: {
          promptTokenCount: 12,
          totalTokenCount: 12,
        },
      }),
    );

    const result = await createProvider(fetchFn).generateTake(request);

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "safety_blocked",
        message: "Gemini blocked the AI take response for safety reasons.",
      },
      metadata: {
        usage: {
          inputTokens: 12,
          outputTokens: null,
          totalTokens: 12,
        },
      },
    });
  });

  it("maps empty or malformed Gemini responses to invalid response failures", async () => {
    const fetchFn = vi.fn(async () =>
      jsonResponse({
        candidates: [
          {
            finishReason: "STOP",
            content: {
              parts: [{ text: "" }],
            },
          },
        ],
      }),
    );

    const result = await createProvider(fetchFn).generateTake(request);

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "invalid_response",
        message: "Gemini returned an empty AI take response.",
      },
    });
  });
});
