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
  queryFilters?: QueryFilter[];
  stock?: StockRow | null;
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
