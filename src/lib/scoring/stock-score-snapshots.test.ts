import { describe, expect, it } from "vitest";

import {
  createStockScoringInputFromCachedRows,
  persistStockScoreSnapshotForSymbol,
  type StockScoreSnapshotClient,
} from "./stock-score-snapshots";
import type { Database } from "@/types/supabase";

type StockFundamentalRow =
  Database["public"]["Tables"]["stock_fundamentals"]["Row"];
type StockPriceRow = Database["public"]["Tables"]["stock_prices"]["Row"];
type StockScoreInsert =
  Database["public"]["Tables"]["stock_scores"]["Insert"];
type StockScoreRow = Database["public"]["Tables"]["stock_scores"]["Row"];
type UserRulesRow = Database["public"]["Tables"]["user_rules"]["Row"];

const SCORE_DATE = new Date("2026-06-14T12:00:00.000Z");

const baseFundamentals: StockFundamentalRow = {
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
};

const latestPrice: StockPriceRow = {
  close: "30",
  created_at: "2026-06-12T22:00:00.000Z",
  high: "31",
  id: "price-aapl-2026-06-12",
  low: "29",
  open: "30",
  price_date: "2026-06-12",
  symbol: "AAPL",
  volume: 1000,
};

const storedRules: UserRulesRow = {
  created_at: "2026-06-15T10:00:00.000Z",
  id: "rules-1",
  max_debt_to_equity: "1",
  max_pb: "1.5",
  max_pe: "10",
  max_sector_allocation: "30",
  max_single_stock_allocation: "10",
  min_current_ratio: "1.5",
  min_margin_of_safety: "40",
  updated_at: "2026-06-15T10:00:00.000Z",
  user_id: "user-1",
};

describe("createStockScoringInputFromCachedRows", () => {
  it("maps cached fundamentals and prices into deterministic scoring input", () => {
    const input = createStockScoringInputFromCachedRows({
      currentDate: SCORE_DATE,
      fundamentals: baseFundamentals,
      priceRows: [
        { ...latestPrice, close: "25", price_date: "2026-06-11" },
        latestPrice,
      ],
      symbol: "aapl",
    });

    expect(input.symbol).toBe("AAPL");
    expect(input.valuation.currentPrice).toMatchObject({
      availability: "available",
      asOfDate: "2026-06-12",
      freshness: "fresh",
      source: "cached_price",
      value: 30,
    });
    expect(input.valuation.grahamNumber).toMatchObject({
      availability: "available",
      source: "derived_metric",
    });
    expect(input.valuation.grahamNumber.value).toBeCloseTo(
      Math.sqrt(22.5 * 5 * 20),
    );
    expect(input.quality.revenueGrowth).toMatchObject({
      availability: "insufficient",
      reason: "Cached fundamentals do not include enough revenue history yet.",
      source: "derived_metric",
    });
  });

  it("keeps missing cached data explicit in scoring input", () => {
    const input = createStockScoringInputFromCachedRows({
      currentDate: SCORE_DATE,
      fundamentals: null,
      priceRows: [],
      symbol: "MSFT",
    });

    expect(input.valuation.eps).toMatchObject({
      availability: "missing",
      reason: "No cached fundamentals are available for MSFT.",
      source: "cached_fundamentals",
      value: null,
    });
    expect(input.valuation.currentPrice).toMatchObject({
      availability: "missing",
      reason: "No cached close price is available.",
      source: "cached_price",
      value: null,
    });
    expect(input.marketContext.oneWeekMovementPercent).toMatchObject({
      availability: "insufficient",
      reason: "No cached close prices are available.",
      source: "derived_metric",
      value: null,
    });
  });

  it("marks stale cached prices as historical context across valuation and market context inputs", () => {
    const input = createStockScoringInputFromCachedRows({
      currentDate: SCORE_DATE,
      fundamentals: baseFundamentals,
      priceRows: [
        {
          ...latestPrice,
          close: "24",
          price_date: "2026-05-29",
        },
        {
          ...latestPrice,
          close: "30",
          price_date: "2026-06-05",
        },
      ],
      symbol: "AAPL",
    });

    expect(input.valuation.currentPrice).toMatchObject({
      asOfDate: "2026-06-05",
      freshness: "stale",
      source: "cached_price",
      value: 30,
    });
    expect(input.marketContext.oneWeekMovementPercent).toMatchObject({
      asOfDate: "2026-06-05",
      freshness: "stale",
      source: "derived_metric",
      value: 25,
    });
  });
});

describe("persistStockScoreSnapshotForSymbol", () => {
  it("inserts a stock score snapshot with labels, layer scores, and structured explanations", async () => {
    const client = createMockSnapshotClient({
      fundamentals: [baseFundamentals],
      prices: [latestPrice],
    });

    const result = await persistStockScoreSnapshotForSymbol(client, "aapl", {
      currentDate: SCORE_DATE,
    });

    expect(result.ok).toBe(true);
    expect(client.insertedStockScore).toMatchObject({
      overall_label: "Reasonable",
      quality_score: 100,
      safety_score: 100,
      scored_at: "2026-06-14T12:00:00.000Z",
      symbol: "AAPL",
      valuation_score: 100,
    });
    expect(client.insertedStockScore?.market_context_score).toBeNull();
    expect(client.insertedStockScore?.explanation_json).toMatchObject({
      schemaVersion: 1,
      result: {
        explanation: {
          summary:
            "Cached deterministic checks support a Reasonable label, with at least one layer limiting a stronger label.",
        },
        layers: {
          quality: {
            ruleChecks: expect.arrayContaining([
              expect.objectContaining({
                id: "quality.revenue_growth",
                measuredValue: expect.objectContaining({
                  availability: "insufficient",
                  reason:
                    "Cached fundamentals do not include enough revenue history yet.",
                }),
                status: "unavailable",
              }),
            ]),
          },
        },
      },
    });
  });

  it("uses saved user valuation thresholds when a user id is provided", async () => {
    const client = createMockSnapshotClient({
      fundamentals: [baseFundamentals],
      prices: [latestPrice],
      userRules: storedRules,
    });

    const result = await persistStockScoreSnapshotForSymbol(client, "aapl", {
      currentDate: SCORE_DATE,
      userId: "user-1",
    });

    expect(result.ok).toBe(true);
    expect(client.userRuleFilters).toEqual([["user_id", "user-1"]]);
    expect(client.insertedStockScore).toMatchObject({
      overall_label: "Expensive",
      symbol: "AAPL",
      valuation_score: 17,
    });
    expect(client.insertedStockScore?.explanation_json).toMatchObject({
      result: {
        layers: {
          valuation: {
            ruleChecks: expect.arrayContaining([
              expect.objectContaining({
                id: "valuation.pe_ratio",
                threshold: expect.objectContaining({
                  value: 10,
                }),
              }),
              expect.objectContaining({
                id: "valuation.pb_ratio",
                threshold: expect.objectContaining({
                  value: 1.5,
                }),
              }),
              expect.objectContaining({
                id: "valuation.margin_of_safety",
                threshold: expect.objectContaining({
                  value: 40,
                }),
              }),
            ]),
          },
        },
      },
    });
  });

  it("persists an insufficient-data snapshot instead of dropping missing rule details", async () => {
    const client = createMockSnapshotClient({
      fundamentals: [],
      prices: [],
    });

    const result = await persistStockScoreSnapshotForSymbol(client, "msft", {
      currentDate: SCORE_DATE,
    });

    expect(result.ok).toBe(true);
    expect(client.insertedStockScore).toMatchObject({
      market_context_score: null,
      overall_label: "Insufficient Data",
      quality_score: null,
      safety_score: null,
      symbol: "MSFT",
      valuation_score: null,
    });
    expect(client.insertedStockScore?.explanation_json).toMatchObject({
      input: {
        valuation: {
          currentPrice: {
            reason: "No cached close price is available.",
            value: null,
          },
        },
      },
      result: {
        layers: {
          valuation: {
            ruleChecks: expect.arrayContaining([
              expect.objectContaining({
                measuredValue: expect.objectContaining({
                  reason: "No cached fundamentals are available for MSFT.",
                  value: null,
                }),
                status: "unavailable",
              }),
            ]),
          },
        },
      },
    });
  });

  it("returns a read failure without writing a snapshot when cached rows cannot be read", async () => {
    const client = createMockSnapshotClient({
      fundamentals: [],
      fundamentalsError: { message: "database unavailable" },
      prices: [],
    });

    const result = await persistStockScoreSnapshotForSymbol(client, "AAPL", {
      currentDate: SCORE_DATE,
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "cached_data_read_failed",
        message:
          "Could not read cached scoring data for AAPL: database unavailable",
      },
    });
    expect(client.insertedStockScore).toBeNull();
  });

  it("returns a rule read failure before writing when saved thresholds cannot be loaded", async () => {
    const client = createMockSnapshotClient({
      fundamentals: [baseFundamentals],
      prices: [latestPrice],
      userRulesError: { message: "permission denied for table user_rules" },
    });

    const result = await persistStockScoreSnapshotForSymbol(client, "AAPL", {
      currentDate: SCORE_DATE,
      userId: "user-1",
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "rule_thresholds_read_failed",
        message:
          "Could not load user rule thresholds: permission denied for table user_rules",
      },
    });
    expect(client.insertedStockScore).toBeNull();
  });

  it("returns a write failure when snapshot persistence fails", async () => {
    const client = createMockSnapshotClient({
      fundamentals: [baseFundamentals],
      insertError: { message: "permission denied" },
      prices: [latestPrice],
    });

    const result = await persistStockScoreSnapshotForSymbol(client, "AAPL", {
      currentDate: SCORE_DATE,
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "snapshot_write_failed",
        message:
          "Could not persist stock score snapshot for AAPL: permission denied",
      },
    });
    expect(client.insertedStockScore).toMatchObject({
      overall_label: "Reasonable",
      symbol: "AAPL",
    });
  });
});

function createMockSnapshotClient({
  fundamentals,
  fundamentalsError = null,
  insertError = null,
  prices,
  pricesError = null,
  userRules = null,
  userRulesError = null,
}: {
  fundamentals: StockFundamentalRow[];
  fundamentalsError?: { message: string } | null;
  insertError?: { message: string } | null;
  prices: StockPriceRow[];
  pricesError?: { message: string } | null;
  userRules?: UserRulesRow | null;
  userRulesError?: { message: string } | null;
}) {
  const state: {
    insertedStockScore: StockScoreInsert | null;
    userRuleFilters: [string, string][];
  } = {
    insertedStockScore: null,
    userRuleFilters: [],
  };
  const client = {
    get insertedStockScore() {
      return state.insertedStockScore;
    },
    get userRuleFilters() {
      return state.userRuleFilters;
    },
    from(
      table:
        | "stock_fundamentals"
        | "stock_prices"
        | "stock_scores"
        | "user_rules",
    ) {
      if (table === "stock_fundamentals") {
        return {
          select: () => createSelectQuery(fundamentals, fundamentalsError),
        };
      }

      if (table === "stock_prices") {
        return {
          select: () => createSelectQuery(prices, pricesError),
        };
      }

      if (table === "stock_scores") {
        return {
          insert(values: StockScoreInsert) {
            state.insertedStockScore = values;

            return {
              select: () => ({
                single: async () => {
                  if (insertError) {
                    return { data: null, error: insertError };
                  }

                  return {
                    data: {
                      id: "score-snapshot-id",
                      ...values,
                      explanation_json: values.explanation_json ?? {},
                      market_context_score: values.market_context_score ?? null,
                      overall_label: values.overall_label ?? "Insufficient Data",
                      quality_score: values.quality_score ?? null,
                      safety_score: values.safety_score ?? null,
                      scored_at: values.scored_at ?? SCORE_DATE.toISOString(),
                      valuation_score: values.valuation_score ?? null,
                    } satisfies StockScoreRow,
                    error: null,
                  };
                },
              }),
            };
          },
        };
      }

      return {
        select: () =>
          createUserRulesSelectQuery(state, userRules, userRulesError),
      };
    },
  };

  return client as StockScoreSnapshotClient & {
    insertedStockScore: StockScoreInsert | null;
    userRuleFilters: [string, string][];
  };
}

function createSelectQuery<T>(data: T[], error: { message: string } | null) {
  const query = {
    eq: () => query,
    limit: async () => ({ data, error }),
    order: () => query,
  };

  return query;
}

function createUserRulesSelectQuery(
  state: { userRuleFilters: [string, string][] },
  data: UserRulesRow | null,
  error: { message: string } | null,
) {
  const query = {
    eq(column: string, value: string) {
      state.userRuleFilters.push([column, value]);

      return query;
    },
    maybeSingle: async () => ({ data, error }),
  };

  return query;
}
