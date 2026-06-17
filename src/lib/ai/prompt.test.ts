import { describe, expect, it } from "vitest";

import {
  AI_TAKE_OUTPUT_SECTIONS,
  AI_TAKE_PROMPT_VERSION,
  createAITakePromptMessages,
  createAITakeSystemInstruction,
  createAITakeUserPrompt,
} from "./prompt";
import {
  CAUTIOUS_EDUCATIONAL_AI_TAKE_POLICY,
  type GenerateAITakeRequest,
} from "./provider";

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
    watchlist: [
      {
        companyName: "Watch Corp.",
        deterministicFacts: [
          {
            asOfDate: null,
            description:
              "Watchlist item has no stock score snapshot available.",
            source: "deterministic_stock_score",
          },
        ],
        latestPrice: null,
        sector: null,
        stockScore: null,
        symbol: "WTCH",
      },
    ],
  },
} satisfies GenerateAITakeRequest;

describe("AI take prompt template", () => {
  it("frames the model as a cautious explanation layer over deterministic facts", () => {
    const instruction = createAITakeSystemInstruction();

    expect(instruction).toContain(
      "The deterministic engine is the source of truth.",
    );
    expect(instruction).toContain(
      "You are only an explanation layer over the structured snapshot.",
    );
    expect(instruction).toContain("Use only the structured data provided");
    expect(instruction).toContain(
      "Do not invent financial facts, prices, fundamentals, forecasts, news, company information, or external context.",
    );
    expect(instruction).toContain("Do not give personalised financial advice.");
    expect(instruction).toContain(
      'Do not give trading instructions or tell the user to "buy", "sell", "hold", or that "you should" take an action.',
    );
    expect(instruction).toContain(
      "If a useful fact is missing, state the limitation instead of filling the gap.",
    );
    expect(instruction).toContain(
      "educational context rather than financial advice",
    );
  });

  it("requires the product-plan output sections and limitation guidance", () => {
    const instruction = createAITakeSystemInstruction();

    for (const section of AI_TAKE_OUTPUT_SECTIONS) {
      expect(instruction).toContain(section);
    }

    expect(instruction).toContain("Overall portfolio posture.");
    expect(instruction).toContain("Concentration risks.");
    expect(instruction).toContain("Stocks worth reviewing.");
    expect(instruction).toContain("Watchlist opportunities.");
    expect(instruction).toContain("Cash and allocation observations.");
    expect(instruction).toContain("Key limitations");
    expect(instruction).toContain("Return only JSON matching the requested schema.");
  });

  it("serializes only the output policy and structured snapshot into the user prompt", () => {
    const prompt = createAITakeUserPrompt(request);
    const parsed = JSON.parse(prompt);

    expect(parsed).toEqual({
      promptVersion: AI_TAKE_PROMPT_VERSION,
      task: "Explain this deterministic portfolio snapshot using the output policy.",
      outputPolicy: request.outputPolicy,
      snapshot: request.snapshot,
    });
    expect(prompt).toContain("Technology allocation is above");
    expect(prompt).not.toContain("apiKey");
    expect(prompt).not.toContain("email");
    expect(prompt).not.toContain("transaction");
  });

  it("builds stable provider messages for snapshot checks", () => {
    const messages = createAITakePromptMessages(request);

    expect(messages).toMatchSnapshot();
  });
});
