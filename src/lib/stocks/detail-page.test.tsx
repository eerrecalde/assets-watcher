import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  StockDetailPage,
  type StockDetailPageDependencies,
} from "./detail-page";
import type { Database } from "../../types/supabase";

type StockRow = Database["public"]["Tables"]["stocks"]["Row"];
type HoldingRow = Database["public"]["Tables"]["holdings"]["Row"];
type PortfolioCashRow = Database["public"]["Tables"]["portfolio_cash"]["Row"];
type PortfolioRow = Database["public"]["Tables"]["portfolios"]["Row"];
type StockPriceRow = Database["public"]["Tables"]["stock_prices"]["Row"];
type StockFundamentalRow =
  Database["public"]["Tables"]["stock_fundamentals"]["Row"];
type StockScoreRow = Database["public"]["Tables"]["stock_scores"]["Row"];
type PortfolioScoreRow =
  Database["public"]["Tables"]["portfolio_stock_scores"]["Row"];
type WatchlistItemRow =
  Database["public"]["Tables"]["watchlist_items"]["Row"];

type QueryResult<T> = {
  data: T;
  error: { message: string } | null;
};

type QueryFilter = {
  column: string;
  operator: "eq" | "gte" | "in" | "lte";
  table: string;
  value: unknown;
};

type StockDetailFixture = {
  cash?: Pick<PortfolioCashRow, "amount" | "currency" | "updated_at"> | null;
  fundamentals?: StockFundamentalRow[];
  historicalPrices?: Pick<
    StockPriceRow,
    "close" | "created_at" | "high" | "low" | "price_date" | "symbol" | "volume"
  >[];
  holdingPrices?: Pick<StockPriceRow, "close" | "price_date" | "symbol">[];
  holdings?: HoldingRow[];
  latestPrice?: Pick<
    StockPriceRow,
    "close" | "created_at" | "high" | "low" | "price_date" | "symbol" | "volume"
  > | null;
  portfolio?: Pick<PortfolioRow, "base_currency" | "id" | "name"> | null;
  portfolioScore?: PortfolioScoreRow | null;
  queryFilters?: QueryFilter[];
  stock?: StockRow | null;
  stockScore?: StockScoreRow | null;
  user?: { email?: string | null; id: string } | null;
  watchlistItem?: Pick<
    WatchlistItemRow,
    "id" | "notes" | "target_price"
  > | null;
};

const user = {
  email: "investor@example.com",
  id: "user-1",
};

const portfolio = {
  base_currency: "USD",
  id: "portfolio-1",
  name: "Default Portfolio",
};

const stock: StockRow = {
  country: "US",
  created_at: "2026-06-05T11:00:00.000Z",
  currency: "USD",
  exchange: "NASDAQ",
  industry: "Consumer Electronics",
  name: "Apple Inc.",
  sector: "Technology",
  symbol: "AAPL",
  updated_at: "2026-06-05T12:00:00.000Z",
};

const latestPrice = {
  close: "202.75",
  created_at: "2026-06-05T12:15:00.000Z",
  high: "203",
  low: "198.25",
  price_date: "2026-06-05",
  symbol: "AAPL",
  volume: 45678900,
};

const fundamentals: StockFundamentalRow = {
  book_value_per_share: "4.2",
  created_at: "2026-06-06T08:30:00.000Z",
  current_ratio: "0.95",
  debt_to_equity: "1.32",
  dividend_yield: "0.005",
  eps: "6.1",
  fiscal_period: "FY",
  fiscal_year: 2025,
  free_cash_flow: "104000000000",
  id: "fundamentals-1",
  net_income: "98000000000",
  pb_ratio: "42",
  pe_ratio: "29.1",
  period_type: "annual",
  revenue: "391000000000",
  symbol: "AAPL",
  total_debt: "95000000000",
  total_equity: "72000000000",
};

const holding: HoldingRow = {
  average_cost: "150",
  created_at: "2026-06-05T10:00:00.000Z",
  currency: "USD",
  id: "holding-1",
  portfolio_id: portfolio.id,
  quantity: "10",
  symbol: "AAPL",
  updated_at: "2026-06-05T10:00:00.000Z",
};

const watchlistItem = {
  id: "watchlist-1",
  notes: "Wait for a better entry.",
  target_price: "180",
};

const stockScore: StockScoreRow = {
  explanation_json: {
    input: {},
    result: {
      explanation: {
        caution:
          "This deterministic label is educational context from cached data, not personalised financial advice.",
        dominantRules: [],
        layerSummaries: {
          market_context: {
            summary: "Market context has mixed cached price signals.",
          },
          quality: {
            summary: "Quality has positive cached profitability inputs.",
          },
          safety: {
            summary: "Safety has one cached metric to review.",
          },
          valuation: {
            summary: "Valuation is mixed against the stored Graham thresholds.",
          },
        },
        summary:
          "Your rules suggest a Watch label from the latest cached score snapshot.",
      },
      label: "Watch",
      layers: {
        market_context: {
          explanation: {
            detail: "Cached movement data is partial.",
            summary: "Market context has mixed cached price signals.",
          },
          id: "market_context",
          ruleChecks: [
            {
              explanation: {
                summary: "One-month movement may indicate a near-term review point.",
              },
              id: "market_context.one_month_movement",
              measuredValue: {
                availability: "available",
                asOfDate: "2026-06-05",
                freshness: "fresh",
                source: "derived_metric",
                value: 12,
              },
              status: "warning",
              threshold: {
                label: "One-month movement review band",
                operator: "below_or_equal",
                unit: "percent",
                value: 10,
              },
            },
          ],
          score: 50,
          status: "scored",
        },
        quality: {
          explanation: {
            detail: "Cached profitability is positive.",
            summary: "Quality has positive cached profitability inputs.",
          },
          id: "quality",
          ruleChecks: [
            {
              explanation: {
                summary: "EPS passes the positive profitability check.",
              },
              id: "quality.positive_eps",
              measuredValue: {
                availability: "available",
                asOfDate: "2025 FY",
                freshness: "unknown",
                source: "cached_fundamentals",
                value: 6.1,
              },
              status: "pass",
              threshold: {
                label: "Positive EPS",
                operator: "above",
                unit: "currency",
                value: 0,
              },
            },
          ],
          score: 100,
          status: "scored",
        },
        safety: {
          explanation: {
            detail: "Some cached safety inputs are incomplete.",
            summary: "Safety has one cached metric to review.",
          },
          id: "safety",
          ruleChecks: [
            {
              explanation: {
                detail: "Current ratio is missing in cached fundamentals.",
                summary: "Current ratio is unavailable in cached fundamentals.",
              },
              id: "safety.current_ratio",
              measuredValue: {
                availability: "missing",
                asOfDate: "2025 FY",
                freshness: "unknown",
                reason: "Current ratio is missing in cached fundamentals.",
                source: "cached_fundamentals",
                value: null,
              },
              status: "unavailable",
              threshold: {
                label: "Minimum current ratio",
                operator: "above_or_equal",
                unit: "ratio",
                value: 1.5,
              },
            },
          ],
          score: null,
          status: "insufficient_data",
        },
        valuation: {
          explanation: {
            detail: "Cached valuation checks are mixed.",
            summary: "Valuation is mixed against the stored Graham thresholds.",
          },
          id: "valuation",
          ruleChecks: [
            {
              explanation: {
                summary: "P/E ratio is above the default Graham valuation threshold.",
              },
              id: "valuation.pe_ratio",
              measuredValue: {
                availability: "available",
                asOfDate: "2025 FY",
                freshness: "unknown",
                source: "cached_fundamentals",
                value: 29.1,
              },
              status: "fail",
              threshold: {
                label: "Maximum P/E ratio",
                operator: "below_or_equal",
                unit: "ratio",
                value: 20,
              },
            },
          ],
          score: 67,
          status: "scored",
        },
      },
      scoredAt: "2026-06-06T09:00:00.000Z",
      symbol: "AAPL",
    },
    schemaVersion: 1,
  },
  id: "score-1",
  market_context_score: 50,
  overall_label: "Watch",
  quality_score: 100,
  safety_score: null,
  scored_at: "2026-06-06T09:00:00.000Z",
  symbol: "AAPL",
  valuation_score: 67,
};

const portfolioScore: PortfolioScoreRow = {
  allocation_warning:
    "Single-stock allocation is above the maximum portfolio-fit threshold.",
  explanation_json: {
    input: {},
    result: {
      explanation: {
        caution:
          "Portfolio fit explains deterministic allocation checks for educational review and is not financial advice.",
        dominantRules: [
          {
            ruleId: "portfolio_fit.position_allocation",
            status: "fail",
            summary:
              "Single-stock allocation is above the maximum portfolio-fit threshold.",
          },
        ],
        summary:
          "Portfolio fit flags concentration risk from cached allocation context.",
        warnings: [
          {
            ruleId: "portfolio_fit.position_allocation",
            status: "fail",
            summary:
              "Single-stock allocation is above the maximum portfolio-fit threshold.",
          },
        ],
      },
      label: "Concentration Risk",
      ruleChecks: [
        {
          explanation: {
            detail:
              "The selected holding is above the default maximum single-stock allocation.",
            summary:
              "Single-stock allocation is above the maximum portfolio-fit threshold.",
          },
          id: "portfolio_fit.position_allocation",
          measuredValue: {
            availability: "available",
            asOfDate: "2026-06-05",
            freshness: "fresh",
            source: "derived_metric",
            value: 42,
          },
          status: "fail",
          threshold: {
            label: "Maximum single-stock allocation",
            operator: "below_or_equal",
            unit: "percent",
            value: 10,
          },
        },
      ],
      status: "classified",
    },
    schemaVersion: 1,
  },
  cash_warning: null,
  id: "portfolio-score-1",
  portfolio_fit_label: "Concentration Risk",
  portfolio_id: portfolio.id,
  scored_at: "2026-06-06T10:00:00.000Z",
  sector_warning: null,
  symbol: "AAPL",
};

describe("StockDetailPage", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-07T10:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("redirects unauthenticated users to login with the normalized stock path", async () => {
    const redirectToLogin = vi.fn((url: string): never => {
      throw new Error(`redirect:${url}`);
    });
    const dependencies = createDependencies({
      user: null,
    });

    await expect(
      StockDetailPage({
        ...dependencies,
        params: Promise.resolve({ symbol: "aapl" }),
        redirectToLogin,
      }),
    ).rejects.toThrow("redirect:/login?next=%2Fstocks%2FAAPL");
    expect(redirectToLogin).toHaveBeenCalledWith(
      "/login?next=%2Fstocks%2FAAPL",
    );
  });

  it("renders the authenticated happy path with cached price, fundamentals, chart, and owned holding summary", async () => {
    const html = await renderPage({
      cash: {
        amount: "100",
        currency: "USD",
        updated_at: "2026-06-05T09:00:00.000Z",
      },
      fundamentals: [fundamentals],
      historicalPrices: [
        {
          ...latestPrice,
          close: "190",
          high: "192",
          low: "188",
          price_date: "2026-06-03",
        },
        {
          ...latestPrice,
          close: "198",
          high: "200",
          low: "196",
          price_date: "2026-06-04",
        },
        latestPrice,
      ],
      holdingPrices: [
        {
          close: "202.75",
          price_date: "2026-06-05",
          symbol: "AAPL",
        },
      ],
      holdings: [holding],
      latestPrice,
      stock,
    });

    expect(html).toContain("Apple Inc.");
    expect(html).toContain("Latest cached price");
    expect(html).toContain("Fresh");
    expect(html).toContain("Fresh as of latest cached close Jun 5, 2026.");
    expect(html).toContain("$202.75");
    expect(html).toContain("Cached daily close price chart from 2026-06-03 to 2026-06-05");
    expect(html).toContain("Key fundamentals");
    expect(html).toContain("P/E ratio");
    expect(html).toContain("29.1");
    expect(html).toContain("Your holding");
    expect(html).toContain("Market value");
    expect(html).toContain("$2,027.50");
    expect(html).toContain("Unrealised gain/loss");
    expect(html).toContain("$527.50");
    expect(html).toContain("Portfolio %");
    expect(html).toContain("95.3%");
  });

  it("renders the latest deterministic Graham score snapshot with traceable rule states", async () => {
    const html = await renderPage({
      fundamentals: [fundamentals],
      historicalPrices: [latestPrice],
      latestPrice,
      stock,
      stockScore,
    });

    expect(html).toContain("Graham-inspired score");
    expect(html).toContain("Overall deterministic label");
    expect(html).toContain("Watch");
    expect(html).toContain(
      "Your rules suggest a Watch label from the latest cached score snapshot.",
    );
    expect(html).toContain("Valuation");
    expect(html).toContain("67/100");
    expect(html).toContain("Quality");
    expect(html).toContain("100/100");
    expect(html).toContain("Safety");
    expect(html).toContain("Insufficient data");
    expect(html).toContain(
      "P/E ratio is above the default Graham valuation threshold.",
    );
    expect(html).toContain("EPS passes the positive profitability check.");
    expect(html).toContain("Current ratio is unavailable in cached fundamentals.");
    expect(html).toContain(
      "One-month movement may indicate a near-term review point.",
    );
    expect(html).toContain("Fail");
    expect(html).toContain("Pass");
    expect(html).toContain("Warning");
    expect(html).toContain("Unavailable");
    expect(html).toContain("Maximum P/E ratio &lt;= 20");
    expect(html).not.toMatch(/\b(buy|sell)\b/i);
  });

  it("renders combined stock and portfolio labels with portfolio-fit rule details", async () => {
    const html = await renderPage({
      fundamentals: [fundamentals],
      historicalPrices: [latestPrice],
      latestPrice,
      portfolioScore,
      stock,
      stockScore: {
        ...stockScore,
        overall_label: "Reasonable",
      },
    });

    expect(html).toContain("Stock and portfolio context");
    expect(html).toContain("Stock label");
    expect(html).toContain("Reasonable");
    expect(html).toContain("Portfolio fit");
    expect(html).toContain("Concentration Risk");
    expect(html).toContain(
      "Portfolio fit flags concentration risk from cached allocation context.",
    );
    expect(html).toContain(
      "The stock label is positive, but the portfolio-fit label flags allocation context",
    );
    expect(html).toContain("Portfolio-fit rules");
    expect(html).toContain(
      "Single-stock allocation is above the maximum portfolio-fit threshold.",
    );
    expect(html).toContain("Maximum single-stock allocation &lt;= 10%");
    expect(html).not.toMatch(/\b(buy|sell)\b/i);
  });

  it("keeps missing stock-score and portfolio-context states separate on stock detail", async () => {
    const html = await renderPage({
      fundamentals: [fundamentals],
      historicalPrices: [latestPrice],
      latestPrice,
      portfolioScore: null,
      stock,
      stockScore: null,
    });

    expect(html).toContain("Stock and portfolio context");
    expect(html).toContain("Stock score unavailable");
    expect(html).toContain("Portfolio context unavailable");
    expect(html).toContain(
      "No cached deterministic stock score snapshot exists for this stock yet.",
    );
    expect(html).toContain(
      "No cached portfolio-fit score snapshot exists for this stock in your default portfolio yet.",
    );
  });

  it("renders an explicit unavailable state when no score snapshot exists", async () => {
    const html = await renderPage({
      fundamentals: [fundamentals],
      historicalPrices: [latestPrice],
      latestPrice,
      stock,
      stockScore: null,
    });

    expect(html).toContain("Graham-inspired score");
    expect(html).toContain("Score snapshot unavailable");
    expect(html).toContain(
      "No cached deterministic score snapshot exists for this stock yet.",
    );
  });

  it("renders an insufficient-data score snapshot with cautious educational copy", async () => {
    const html = await renderPage({
      fundamentals: [],
      historicalPrices: [],
      latestPrice: null,
      stock,
      stockScore: createInsufficientDataStockScore(),
    });

    expect(html).toContain("Overall deterministic label");
    expect(html).toContain("Insufficient Data");
    expect(html).toContain(
      "There is not enough cached data to score this stock.",
    );
    expect(html).toContain(
      "This deterministic label is educational context from cached data, not personalised financial advice.",
    );
    expect(html).toContain("Valuation");
    expect(html).toContain("Quality");
    expect(html).toContain("Safety");
    expect(html).toContain("Market context");
    expect(html).toContain("Layer needs more cached data.");
    expect(html).toContain("Unavailable");
    expect(html).toContain("No cached fundamentals are available.");
    expect(html).not.toMatch(/\b(buy|sell|you should|guaranteed)\b/i);
  });

  it("renders unknown cached-symbol handling without inventing stock data", async () => {
    const html = await renderPage({
      stock: null,
    }, "ZZZZ");

    expect(html).toContain("Cached stock unavailable");
    expect(html).toContain("No local cached stock record is available for ZZZZ.");
    expect(html).toContain("Your holding");
    expect(html).toContain("Not owned");
  });

  it("renders a neutral not-owned state for cached stocks outside the user's portfolio", async () => {
    const html = await renderPage({
      historicalPrices: [latestPrice],
      holdings: [],
      latestPrice,
      stock,
    });

    expect(html).toContain("Apple Inc.");
    expect(html).toContain("Not owned");
    expect(html).toContain(
      "You do not currently hold AAPL in your default portfolio.",
    );
  });

  it("renders the signed-in user's watched status with target price and notes", async () => {
    const html = await renderPage({
      historicalPrices: [latestPrice],
      latestPrice,
      stock,
      watchlistItem,
    });

    expect(html).toContain("Your watchlist");
    expect(html).toContain("Watching");
    expect(html).toContain("AAPL is in your default portfolio watchlist.");
    expect(html).toContain("Target price");
    expect(html).toContain("$180.00");
    expect(html).toContain("Notes");
    expect(html).toContain("Wait for a better entry.");
  });

  it("looks up watchlist status within the signed-in user's default portfolio", async () => {
    const queryFilters: QueryFilter[] = [];

    await renderPage({
      historicalPrices: [latestPrice],
      latestPrice,
      queryFilters,
      stock,
      watchlistItem,
    });

    expect(queryFilters).toEqual(
      expect.arrayContaining([
        {
          column: "portfolio_id",
          operator: "eq",
          table: "watchlist_items",
          value: "portfolio-1",
        },
        {
          column: "user_id",
          operator: "eq",
          table: "watchlist_items",
          value: "user-1",
        },
        {
          column: "symbol",
          operator: "eq",
          table: "watchlist_items",
          value: "AAPL",
        },
      ]),
    );
  });

  it("renders a neutral not-watched state without target price or notes", async () => {
    const html = await renderPage({
      historicalPrices: [latestPrice],
      latestPrice,
      stock,
      watchlistItem: null,
    });

    expect(html).toContain("Your watchlist");
    expect(html).toContain("Not watched");
    expect(html).toContain(
      "You are not currently watching AAPL in your default portfolio.",
    );
    expect(html).not.toContain("Wait for a better entry.");
  });

  it("renders targeted empty states for missing latest price, fundamentals, chart, and holding calculations", async () => {
    const html = await renderPage({
      fundamentals: [],
      holdingPrices: [],
      holdings: [holding],
      latestPrice: null,
      stock,
    });

    expect(html).toContain("Insufficient cached price data");
    expect(html).toContain("No usable latest cached close date is available.");
    expect(html).toContain("No latest cached close price is available for this stock.");
    expect(html).toContain("Insufficient cached historical prices");
    expect(html).toContain(
      "At least two cached daily close prices are needed to draw the history chart.",
    );
    expect(html).toContain("No cached fundamentals are available for this stock yet.");
    expect(html).toContain(
      "Market value, unrealised gain/loss, and portfolio percentage are not calculated",
    );
    expect(html).toContain("Not cached");
  });

  it("marks stale price-derived stock detail context as stale and as-of", async () => {
    vi.setSystemTime(new Date("2026-06-10T10:00:00.000Z"));

    const html = await renderPage({
      historicalPrices: [
        {
          ...latestPrice,
          close: "180",
          high: "181",
          low: "179",
          price_date: "2026-05-29",
        },
        {
          ...latestPrice,
          close: "190",
          high: "192",
          low: "188",
          price_date: "2026-06-03",
        },
        latestPrice,
      ],
      latestPrice,
      stock,
    });

    expect(html).toContain("Stale");
    expect(html).toContain("Stale as of latest cached close Jun 5, 2026.");
    expect(html).toContain("Stale as-of metric using latest cached close Jun 5, 2026.");
  });
});

async function renderPage(fixture: StockDetailFixture, symbol = "AAPL") {
  return renderToStaticMarkup(
    await StockDetailPage({
      ...createDependencies(fixture),
      params: Promise.resolve({ symbol }),
    }),
  );
}

function createDependencies(
  fixture: StockDetailFixture,
): StockDetailPageDependencies {
  const portfolioResult = fixture.portfolio === null
    ? { error: "Could not load your default portfolio." as const }
    : { portfolio: fixture.portfolio ?? portfolio };

  return {
    createSupabaseClient: async () => createSupabaseFixture(fixture),
    ensureDefaultPortfolio: vi.fn(async () => portfolioResult),
    redirectToLogin: vi.fn((url: string): never => {
      throw new Error(`redirect:${url}`);
    }),
  };
}

function createInsufficientDataStockScore(): StockScoreRow {
  return {
    ...stockScore,
    explanation_json: {
      input: {},
      result: {
        explanation: {
          caution:
            "This deterministic label is educational context from cached data, not personalised financial advice.",
          dominantRules: [
            {
              layerId: "valuation",
              ruleId: "valuation.pe_ratio",
              status: "unavailable",
              summary: "No cached fundamentals are available.",
            },
          ],
          layerSummaries: {
            market_context: {
              summary: "Layer needs more cached data.",
            },
            quality: {
              summary: "Layer needs more cached data.",
            },
            safety: {
              summary: "Layer needs more cached data.",
            },
            valuation: {
              summary: "Layer needs more cached data.",
            },
          },
          summary: "There is not enough cached data to score this stock.",
        },
        label: "Insufficient Data",
        layers: {
          market_context: createUnavailableScoreLayer("market_context"),
          quality: createUnavailableScoreLayer("quality"),
          safety: createUnavailableScoreLayer("safety"),
          valuation: createUnavailableScoreLayer("valuation"),
        },
        scoredAt: "2026-06-06T09:00:00.000Z",
        symbol: "AAPL",
      },
      schemaVersion: 1,
    },
    market_context_score: null,
    overall_label: "Insufficient Data",
    quality_score: null,
    safety_score: null,
    valuation_score: null,
  };
}

function createUnavailableScoreLayer(
  id: "market_context" | "quality" | "safety" | "valuation",
) {
  return {
    explanation: {
      detail: "No cached inputs are available for this scoring layer.",
      summary: "Layer needs more cached data.",
    },
    id,
    ruleChecks: [
      {
        explanation: {
          detail: "No cached fundamentals are available.",
          summary: "No cached fundamentals are available.",
        },
        id: `${id}.missing_cached_data`,
        measuredValue: {
          availability: "missing",
          asOfDate: null,
          freshness: "unknown",
          reason: "No cached fundamentals are available.",
          source: id === "market_context" ? "cached_price" : "cached_fundamentals",
          value: null,
        },
        status: "unavailable",
        threshold: null,
      },
    ],
    score: null,
    status: "insufficient_data",
  };
}

function createSupabaseFixture(fixture: StockDetailFixture) {
  return {
    auth: {
      getUser: vi.fn(async () => ({
        data: {
          user: fixture.user === undefined ? user : fixture.user,
        },
      })),
    },
    from: vi.fn((table: string) => createQueryBuilder(table, fixture)),
  } as never;
}

function createQueryBuilder(table: string, fixture: StockDetailFixture) {
  const filters: QueryFilter[] = [];
  const builder = {
    eq(column: string, value: unknown) {
      filters.push({ column, operator: "eq", table, value });
      fixture.queryFilters?.push({ column, operator: "eq", table, value });
      return builder;
    },
    gte(column: string, value: unknown) {
      filters.push({ column, operator: "gte", table, value });
      return builder;
    },
    in(column: string, value: unknown) {
      filters.push({ column, operator: "in", table, value });
      return builder;
    },
    limit() {
      return builder;
    },
    lte(column: string, value: unknown) {
      filters.push({ column, operator: "lte", table, value });
      return builder;
    },
    maybeSingle: async () => resolveFixtureQuery(table, fixture, {
      filters,
      maybeSingle: true,
    }),
    order() {
      return builder;
    },
    select() {
      return builder;
    },
    then<TResult1 = QueryResult<unknown>, TResult2 = never>(
      onfulfilled?:
        | ((value: QueryResult<unknown>) => TResult1 | PromiseLike<TResult1>)
        | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) {
      return Promise.resolve(
        resolveFixtureQuery(table, fixture, { filters, maybeSingle: false }),
      ).then(onfulfilled, onrejected);
    },
  };

  return builder;
}

function resolveFixtureQuery(
  table: string,
  fixture: StockDetailFixture,
  {
    filters,
    maybeSingle,
  }: {
    filters: QueryFilter[];
    maybeSingle: boolean;
  },
): QueryResult<unknown> {
  if (table === "stocks") {
    return result(maybeSingle ? (fixture.stock ?? null) : [fixture.stock]);
  }

  if (table === "stock_prices") {
    if (maybeSingle) {
      return result(fixture.latestPrice ?? null);
    }

    if (filters.some((filter) => filter.operator === "in")) {
      return result(fixture.holdingPrices ?? []);
    }

    return result(fixture.historicalPrices ?? []);
  }

  if (table === "stock_fundamentals") {
    return result(fixture.fundamentals ?? []);
  }

  if (table === "stock_scores") {
    return result(fixture.stockScore ?? null);
  }

  if (table === "portfolio_stock_scores") {
    return result(fixture.portfolioScore ?? null);
  }

  if (table === "portfolio_cash") {
    return result(fixture.cash ?? null);
  }

  if (table === "holdings") {
    return result(fixture.holdings ?? []);
  }

  if (table === "watchlist_items") {
    return result(fixture.watchlistItem ?? null);
  }

  return result(null);
}

function result<T>(data: T): QueryResult<T> {
  return {
    data,
    error: null,
  };
}
