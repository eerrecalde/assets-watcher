import { describe, expect, it } from "vitest";

import { generatePortfolioSnapshotForAITake } from "./portfolio-snapshot";
import type { Database, Json } from "@/types/supabase";

type HoldingRow = Database["public"]["Tables"]["holdings"]["Row"];
type PortfolioRow = Database["public"]["Tables"]["portfolios"]["Row"];
type PortfolioCashRow = Database["public"]["Tables"]["portfolio_cash"]["Row"];
type PortfolioScoreRow =
  Database["public"]["Tables"]["portfolio_stock_scores"]["Row"];
type StockPriceRow = Database["public"]["Tables"]["stock_prices"]["Row"];
type StockRow = Database["public"]["Tables"]["stocks"]["Row"];
type StockScoreRow = Database["public"]["Tables"]["stock_scores"]["Row"];
type UserRulesRow = Database["public"]["Tables"]["user_rules"]["Row"];
type WatchlistItemRow =
  Database["public"]["Tables"]["watchlist_items"]["Row"];

const CURRENT_DATE = new Date("2026-06-17T09:00:00.000Z");

describe("generatePortfolioSnapshotForAITake", () => {
  it("builds a compact typed snapshot with rules, freshness, scores, and allocation context", async () => {
    const supabase = createMockSupabaseClient();

    const result = await generatePortfolioSnapshotForAITake(
      supabase as never,
      { id: "user-1" },
      { currentDate: CURRENT_DATE },
    );

    expect(result.ok).toBe(true);

    if (!result.ok) {
      return;
    }

    expect(result.snapshot).toMatchObject({
      generatedAt: "2026-06-17T09:00:00.000Z",
      portfolio: {
        asOfDate: "2026-06-16",
        baseCurrency: "USD",
        cashAllocationPercent: expect.closeTo(4.55, 2),
        cashBalance: 500,
        totalMarketValue: 10500,
        totalPortfolioValue: 11000,
      },
      rules: {
        maxPb: 2.5,
        maxPe: 18,
        maxSectorAllocationPercent: 35,
        maxSingleStockAllocationPercent: 12,
        minCashAllocationPercent: 5,
        minMarginOfSafetyPercent: 30,
        source: "stored",
      },
    });
    expect(result.snapshot.portfolio.sectorAllocation).toEqual([
      expect.objectContaining({
        holdingCount: 1,
        percentage: expect.closeTo(63.64, 2),
        sector: "Technology",
        status: "calculated",
      }),
      expect.objectContaining({
        holdingCount: 1,
        percentage: expect.closeTo(31.82, 2),
        sector: "Healthcare",
        status: "calculated",
      }),
    ]);
    expect(result.snapshot.holdings).toEqual([
      expect.objectContaining({
        allocationPercent: expect.closeTo(63.64, 2),
        companyName: "Apple Inc.",
        latestPrice: {
          asOfDate: "2026-06-16",
          currency: "USD",
          freshness: "fresh",
          value: 200,
        },
        marketValue: 7000,
        portfolioFit: expect.objectContaining({
          label: "Concentration Risk",
          summary: "AAPL is above the single-stock threshold.",
        }),
        quantity: 35,
        sector: "Technology",
        stockScore: expect.objectContaining({
          label: "Expensive",
          summary: "AAPL is expensive under saved valuation rules.",
        }),
        symbol: "AAPL",
        unrealizedGainLoss: 3500,
        unrealizedGainLossPercent: 100,
      }),
      expect.objectContaining({
        allocationPercent: expect.closeTo(31.82, 2),
        companyName: "Johnson & Johnson",
        latestPrice: {
          asOfDate: "2026-06-10",
          currency: "USD",
          freshness: "stale",
          value: 100,
        },
        marketValue: 3500,
        symbol: "JNJ",
      }),
    ]);
    expect(result.snapshot.watchlist).toEqual([
      expect.objectContaining({
        companyName: "Alphabet Inc.",
        latestPrice: expect.objectContaining({
          asOfDate: "2026-06-16",
          freshness: "fresh",
          value: 150,
        }),
        stockScore: expect.objectContaining({
          label: "Reasonable",
        }),
        symbol: "GOOGL",
      }),
    ]);
    expect(JSON.stringify(result.snapshot)).not.toContain("secret note");
    expect(JSON.stringify(result.snapshot)).not.toContain("emi@example.com");
    expect(JSON.stringify(result.snapshot)).not.toContain("created_at");
    expect(JSON.stringify(result.snapshot)).not.toContain("transaction");
  });

  it("returns a controlled failure when portfolio data cannot be loaded", async () => {
    const supabase = createMockSupabaseClient({
      errors: {
        holdings: { message: "permission denied" },
      },
    });

    const result = await generatePortfolioSnapshotForAITake(
      supabase as never,
      { id: "user-1" },
      { currentDate: CURRENT_DATE },
    );

    expect(result).toEqual({
      ok: false,
      error: {
        code: "portfolio_data_read_failed",
        message:
          "Could not load portfolio data for AI snapshot: permission denied",
      },
    });
  });

  it("returns a controlled failure when no portfolio is available", async () => {
    const supabase = createMockSupabaseClient({
      rows: {
        portfolios: [],
      },
    });

    const result = await generatePortfolioSnapshotForAITake(
      supabase as never,
      { id: "user-1" },
      { currentDate: CURRENT_DATE },
    );

    expect(result).toEqual({
      ok: false,
      error: {
        code: "portfolio_not_found",
        message: "Could not find a portfolio to summarize.",
      },
    });
  });
});

function createMockSupabaseClient({
  errors = {},
  rows = {},
}: {
  errors?: Partial<Record<keyof MockRows, { message: string }>>;
  rows?: Partial<MockRows>;
} = {}) {
  const mockRows = {
    ...createDefaultRows(),
    ...rows,
  };

  return {
    from(table: keyof MockRows) {
      return {
        select() {
          return new MockQuery(
            mockRows[table] as Record<string, unknown>[],
            errors[table] ?? null,
          );
        },
      };
    },
  };
}

type MockRows = ReturnType<typeof createDefaultRows>;

class MockQuery implements PromiseLike<{
  data: Record<string, unknown>[] | null;
  error: { message: string } | null;
}> {
  private filters: { column: string; values: unknown[] }[] = [];
  private limitCount: number | null = null;
  private orderings: { ascending: boolean; column: string }[] = [];

  constructor(
    private readonly rows: Record<string, unknown>[],
    private readonly error: { message: string } | null,
  ) {}

  eq(column: string, value: unknown) {
    this.filters.push({ column, values: [value] });
    return this;
  }

  in(column: string, values: unknown[]) {
    this.filters.push({ column, values });
    return this;
  }

  limit(count: number) {
    this.limitCount = count;
    return this;
  }

  maybeSingle() {
    return Promise.resolve({
      data: this.apply()[0] ?? null,
      error: this.error,
    });
  }

  order(column: string, options: { ascending: boolean }) {
    this.orderings.push({ column, ascending: options.ascending });
    return this;
  }

  then<
    TResult1 = {
      data: Record<string, unknown>[] | null;
      error: { message: string } | null;
    },
    TResult2 = never,
  >(
    onfulfilled?:
      | ((
          value: {
            data: Record<string, unknown>[] | null;
            error: { message: string } | null;
          },
        ) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve({
      data: this.apply(),
      error: this.error,
    }).then(onfulfilled, onrejected);
  }

  private apply() {
    if (this.error) {
      return [];
    }

    let result = [...this.rows];

    for (const filter of this.filters) {
      result = result.filter((row) =>
        filter.values.includes(row[filter.column]),
      );
    }

    for (const ordering of this.orderings.toReversed()) {
      result.sort((left, right) => {
        const leftValue = String(left[ordering.column] ?? "");
        const rightValue = String(right[ordering.column] ?? "");
        const comparison = leftValue.localeCompare(rightValue);

        return ordering.ascending ? comparison : -comparison;
      });
    }

    return this.limitCount === null ? result : result.slice(0, this.limitCount);
  }
}

function createDefaultRows() {
  return {
    holdings: [
      createHoldingRow({
        average_cost: "100",
        quantity: "35",
        symbol: "AAPL",
      }),
      createHoldingRow({
        average_cost: "90",
        quantity: "35",
        symbol: "JNJ",
      }),
    ],
    portfolio_cash: [
      {
        amount: "500",
        currency: "USD",
        id: "cash-1",
        portfolio_id: "portfolio-1",
        updated_at: "2026-06-16T20:00:00.000Z",
      } satisfies PortfolioCashRow,
    ],
    portfolio_stock_scores: [
      createPortfolioScoreRow({
        explanation_json: {
          result: {
            explanation: {
              caution: "Review concentration before adding more.",
              summary: "AAPL is above the single-stock threshold.",
            },
            ruleChecks: [
              {
                id: "portfolio_fit.position_allocation",
                measuredValue: null,
                status: "fail",
                threshold: null,
                explanation: {
                  summary: "Position allocation is high.",
                },
              },
            ],
          },
        },
        portfolio_fit_label: "Concentration Risk",
        scored_at: "2026-06-16T21:00:00.000Z",
        symbol: "AAPL",
      }),
    ],
    portfolios: [
      {
        base_currency: "USD",
        created_at: "2026-06-01T00:00:00.000Z",
        id: "portfolio-1",
        name: "Long-term",
        updated_at: "2026-06-01T00:00:00.000Z",
        user_id: "user-1",
      } satisfies PortfolioRow,
    ],
    stock_prices: [
      createStockPriceRow({
        close: "190",
        price_date: "2026-06-15",
        symbol: "AAPL",
      }),
      createStockPriceRow({
        close: "200",
        price_date: "2026-06-16",
        symbol: "AAPL",
      }),
      createStockPriceRow({
        close: "100",
        price_date: "2026-06-10",
        symbol: "JNJ",
      }),
      createStockPriceRow({
        close: "150",
        price_date: "2026-06-16",
        symbol: "GOOGL",
      }),
    ],
    stock_scores: [
      createStockScoreRow({
        explanation_json: {
          result: {
            explanation: {
              caution: "Rules flag valuation pressure.",
              summary: "AAPL is expensive under saved valuation rules.",
            },
          },
        },
        overall_label: "Expensive",
        scored_at: "2026-06-16T22:00:00.000Z",
        symbol: "AAPL",
        user_id: "user-1",
      }),
      createStockScoreRow({
        explanation_json: {
          result: {
            explanation: {
              summary: "Older score should not win.",
            },
          },
        },
        overall_label: "Attractive",
        scored_at: "2026-06-15T22:00:00.000Z",
        symbol: "AAPL",
        user_id: "user-1",
      }),
      createStockScoreRow({
        explanation_json: {
          result: {
            explanation: {
              summary: "GOOGL is reasonable under saved rules.",
            },
          },
        },
        overall_label: "Reasonable",
        scored_at: "2026-06-16T22:00:00.000Z",
        symbol: "GOOGL",
        user_id: "user-1",
      }),
      createStockScoreRow({
        overall_label: "Avoid / Review",
        symbol: "GOOGL",
        user_id: "other-user",
      }),
    ],
    stocks: [
      createStockRow({
        name: "Apple Inc.",
        sector: "Technology",
        symbol: "AAPL",
      }),
      createStockRow({
        name: "Johnson & Johnson",
        sector: "Healthcare",
        symbol: "JNJ",
      }),
      createStockRow({
        name: "Alphabet Inc.",
        sector: "Communication Services",
        symbol: "GOOGL",
      }),
    ],
    user_rules: [
      {
        created_at: "2026-06-01T00:00:00.000Z",
        id: "rules-1",
        max_debt_to_equity: "0.8",
        max_pb: "2.5",
        max_pe: "18",
        max_sector_allocation: "35",
        max_single_stock_allocation: "12",
        min_current_ratio: "1.25",
        min_margin_of_safety: "30",
        updated_at: "2026-06-01T00:00:00.000Z",
        user_id: "user-1",
      } satisfies UserRulesRow,
    ],
    watchlist_items: [
      {
        created_at: "2026-06-01T00:00:00.000Z",
        id: "watchlist-1",
        notes: "secret note",
        portfolio_id: "portfolio-1",
        symbol: "GOOGL",
        target_price: "120",
        updated_at: "2026-06-01T00:00:00.000Z",
        user_id: "user-1",
      } satisfies WatchlistItemRow,
    ],
  };
}

function createHoldingRow(overrides: Partial<HoldingRow>): HoldingRow {
  return {
    average_cost: "100",
    created_at: "2026-06-01T00:00:00.000Z",
    currency: "USD",
    id: `holding-${overrides.symbol ?? "AAPL"}`,
    portfolio_id: "portfolio-1",
    quantity: "1",
    symbol: "AAPL",
    updated_at: "2026-06-01T00:00:00.000Z",
    ...overrides,
  };
}

function createPortfolioScoreRow(
  overrides: Partial<PortfolioScoreRow>,
): PortfolioScoreRow {
  return {
    allocation_warning: null,
    cash_warning: null,
    explanation_json: {},
    id: `portfolio-score-${overrides.symbol ?? "AAPL"}`,
    portfolio_fit_label: "Balanced",
    portfolio_id: "portfolio-1",
    scored_at: "2026-06-16T00:00:00.000Z",
    sector_warning: null,
    symbol: "AAPL",
    ...overrides,
  };
}

function createStockPriceRow(overrides: Partial<StockPriceRow>): StockPriceRow {
  return {
    close: "100",
    created_at: "2026-06-16T22:00:00.000Z",
    high: null,
    id: `price-${overrides.symbol ?? "AAPL"}-${overrides.price_date ?? "2026-06-16"}`,
    low: null,
    open: null,
    price_date: "2026-06-16",
    symbol: "AAPL",
    volume: null,
    ...overrides,
  };
}

function createStockRow(overrides: Partial<StockRow>): StockRow {
  return {
    country: "US",
    created_at: "2026-06-01T00:00:00.000Z",
    currency: "USD",
    exchange: "NASDAQ",
    industry: null,
    name: "Apple Inc.",
    sector: "Technology",
    symbol: "AAPL",
    updated_at: "2026-06-01T00:00:00.000Z",
    ...overrides,
  };
}

function createStockScoreRow(overrides: Partial<StockScoreRow>): StockScoreRow {
  return {
    explanation_json: {} as Json,
    id: `stock-score-${overrides.symbol ?? "AAPL"}-${overrides.user_id ?? "user-1"}`,
    market_context_score: null,
    overall_label: "Reasonable",
    quality_score: null,
    safety_score: null,
    scored_at: "2026-06-16T00:00:00.000Z",
    symbol: "AAPL",
    user_id: "user-1",
    valuation_score: null,
    ...overrides,
  };
}
