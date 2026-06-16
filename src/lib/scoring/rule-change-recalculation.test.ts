import { describe, expect, it } from "vitest";

import { DEFAULT_GRAHAM_SCORING_THRESHOLDS } from "./thresholds";
import {
  recalculateScoresAfterRuleChange,
  type RuleChangeScoreRecalculationClient,
} from "./rule-change-recalculation";
import type { Database } from "@/types/supabase";

type StockScoreInsert =
  Database["public"]["Tables"]["stock_scores"]["Insert"];
type PortfolioScoreInsert =
  Database["public"]["Tables"]["portfolio_stock_scores"]["Insert"];

const SCORE_DATE = new Date("2026-06-16T12:00:00.000Z");

describe("recalculateScoresAfterRuleChange", () => {
  it("refreshes user-scoped stock and portfolio snapshots for tracked symbols", async () => {
    const client = createRecalculationClient();

    const result = await recalculateScoresAfterRuleChange(
      client,
      { email: "investor@example.com", id: "user-1" },
      {
        currentDate: SCORE_DATE,
        thresholds: {
          ...DEFAULT_GRAHAM_SCORING_THRESHOLDS,
          maxPb: 1.5,
          maxPe: 10,
          maxSectorAllocationPercent: 25,
          maxSingleStockAllocationPercent: 8,
          minMarginOfSafetyPercent: 40,
        },
      },
    );

    expect(result).toEqual({
      ok: true,
      portfolioScoreCount: 1,
      stockScoreCount: 2,
      trackedSymbolCount: 2,
    });
    expect(client.insertedStockScores).toHaveLength(2);
    expect(client.insertedStockScores.map((score) => score.symbol)).toEqual([
      "AAPL",
      "MSFT",
    ]);
    expect(client.insertedStockScores[0]).toMatchObject({
      scored_at: "2026-06-16T12:00:00.000Z",
      user_id: "user-1",
    });
    expect(client.insertedStockScores[0]?.explanation_json).toMatchObject({
      ruleScope: {
        source: "user_rules",
        userId: "user-1",
      },
      thresholds: {
        maxPb: 1.5,
        maxPe: 10,
        minMarginOfSafetyPercent: 40,
      },
    });
    expect(client.insertedPortfolioScores).toHaveLength(1);
    expect(client.insertedPortfolioScores[0]).toMatchObject({
      portfolio_id: "portfolio-1",
      scored_at: "2026-06-16T12:00:00.000Z",
      symbol: "AAPL",
    });
    expect(client.insertedPortfolioScores[0]?.explanation_json).toMatchObject({
      result: {
        ruleChecks: expect.arrayContaining([
          expect.objectContaining({
            id: "portfolio_fit.position_allocation",
            threshold: expect.objectContaining({
              value: 8,
            }),
          }),
        ]),
      },
    });
  });
});

function createRecalculationClient() {
  const insertedStockScores: StockScoreInsert[] = [];
  const insertedPortfolioScores: PortfolioScoreInsert[] = [];
  const holdings = [
    {
      average_cost: "25",
      quantity: "10",
      symbol: "AAPL",
    },
  ];
  const watchlist = [{ symbol: "MSFT" }];
  const fundamentals = [
    {
      book_value_per_share: "20",
      created_at: "2026-04-30T00:00:00.000Z",
      current_ratio: "2.1",
      debt_to_equity: "0.4",
      dividend_yield: null,
      eps: "5",
      fiscal_period: "FY",
      fiscal_year: 2025,
      free_cash_flow: "3500000000",
      id: "fundamentals-aapl-2025",
      net_income: "4000000000",
      pb_ratio: "2",
      pe_ratio: "12",
      period_type: "annual",
      revenue: "25000000000",
      symbol: "AAPL",
      total_debt: "5000000000",
      total_equity: "12000000000",
    },
    {
      book_value_per_share: "15",
      created_at: "2026-04-30T00:00:00.000Z",
      current_ratio: "1.8",
      debt_to_equity: "0.3",
      dividend_yield: null,
      eps: "4",
      fiscal_period: "FY",
      fiscal_year: 2025,
      free_cash_flow: "2500000000",
      id: "fundamentals-msft-2025",
      net_income: "3000000000",
      pb_ratio: "1",
      pe_ratio: "8",
      period_type: "annual",
      revenue: "18000000000",
      symbol: "MSFT",
      total_debt: "3000000000",
      total_equity: "10000000000",
    },
  ];
  const prices = [
    {
      close: "30",
      created_at: "2026-06-15T22:00:00.000Z",
      high: "31",
      id: "price-aapl",
      low: "29",
      open: "30",
      price_date: "2026-06-15",
      symbol: "AAPL",
      volume: 1000,
    },
    {
      close: "20",
      created_at: "2026-06-15T22:00:00.000Z",
      high: "21",
      id: "price-msft",
      low: "19",
      open: "20",
      price_date: "2026-06-15",
      symbol: "MSFT",
      volume: 1000,
    },
  ];
  const stocks = [
    {
      sector: "Technology",
      symbol: "AAPL",
    },
    {
      sector: "Technology",
      symbol: "MSFT",
    },
  ];

  const client = {
    insertedPortfolioScores,
    insertedStockScores,
    from(table: string) {
      switch (table) {
        case "users":
          return {
            upsert: async () => ({ data: null, error: null }),
          };
        case "portfolios":
          return {
            select: () =>
              createMaybeSingleQuery({
                base_currency: "USD",
                id: "portfolio-1",
                name: "Default Portfolio",
              }),
          };
        case "portfolio_cash":
          return {
            select: () => createMaybeSingleQuery({ amount: "100" }),
            upsert: async () => ({ data: null, error: null }),
          };
        case "user_rules":
          return {
            upsert: async () => ({ data: null, error: null }),
          };
        case "holdings":
          return {
            select: () => createListByPortfolioQuery(holdings),
          };
        case "watchlist_items":
          return {
            select: () => createListByPortfolioQuery(watchlist),
          };
        case "stock_fundamentals":
          return {
            select: () => createSymbolListQuery(fundamentals),
          };
        case "stock_prices":
          return {
            select: () => createSymbolListQuery(prices),
          };
        case "stocks":
          return {
            select: () => createStockQuery(stocks),
          };
        case "stock_scores":
          return {
            insert(values: StockScoreInsert) {
              insertedStockScores.push(values);

              return {
                select: () => ({
                  single: async () => ({
                    data: {
                      id: `stock-score-${insertedStockScores.length}`,
                      ...values,
                      explanation_json: values.explanation_json ?? {},
                      market_context_score: values.market_context_score ?? null,
                      overall_label: values.overall_label ?? "Insufficient Data",
                      quality_score: values.quality_score ?? null,
                      safety_score: values.safety_score ?? null,
                      scored_at: values.scored_at ?? SCORE_DATE.toISOString(),
                      user_id: values.user_id ?? null,
                      valuation_score: values.valuation_score ?? null,
                    },
                    error: null,
                  }),
                }),
              };
            },
          };
        case "portfolio_stock_scores":
          return {
            insert(values: PortfolioScoreInsert) {
              insertedPortfolioScores.push(values);

              return {
                select: () => ({
                  single: async () => ({
                    data: {
                      allocation_warning: values.allocation_warning ?? null,
                      cash_warning: values.cash_warning ?? null,
                      explanation_json: values.explanation_json ?? {},
                      id: `portfolio-score-${insertedPortfolioScores.length}`,
                      portfolio_fit_label:
                        values.portfolio_fit_label ?? "Review Position",
                      portfolio_id: values.portfolio_id,
                      scored_at: values.scored_at ?? SCORE_DATE.toISOString(),
                      sector_warning: values.sector_warning ?? null,
                      symbol: values.symbol,
                    },
                    error: null,
                  }),
                }),
              };
            },
          };
        default:
          throw new Error(`Unexpected table: ${table}`);
      }
    },
  };

  return client as unknown as RuleChangeScoreRecalculationClient & {
    insertedPortfolioScores: PortfolioScoreInsert[];
    insertedStockScores: StockScoreInsert[];
  };
}

function createListByPortfolioQuery<T>(data: T[]) {
  return {
    eq: async () => ({ data, error: null }),
  };
}

function createMaybeSingleQuery<T>(data: T) {
  const query = {
    eq: () => query,
    limit: () => query,
    maybeSingle: async () => ({ data, error: null }),
    order: () => query,
  };

  return query;
}

function createStockQuery<T extends { symbol: string }>(data: T[]) {
  let selectedSymbol = "";
  const query = {
    eq: (_column: string, value: string) => {
      selectedSymbol = value;

      return query;
    },
    maybeSingle: async () => ({
      data: data.find((item) => item.symbol === selectedSymbol) ?? null,
      error: null,
    }),
    order: () => query,
    limit: () => query,
  };

  return query;
}

function createSymbolListQuery<T extends { symbol: string }>(data: T[]) {
  let selectedSymbol = "";
  const query = {
    eq: (_column: string, value: string) => {
      selectedSymbol = value;

      return query;
    },
    limit: async () => ({
      data: data.filter((item) => item.symbol === selectedSymbol),
      error: null,
    }),
    order: () => query,
  };

  return query;
}
