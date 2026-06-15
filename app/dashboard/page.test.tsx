import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string): never => {
    throw new Error(`redirect:${url}`);
  }),
}));

vi.mock("@/lib/auth/actions", () => ({
  signOutAction: "#sign-out",
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/portfolios/defaults", () => ({
  ensureDefaultPortfolioForUser: vi.fn(),
}));

import DashboardPage from "./page";
import { ensureDefaultPortfolioForUser } from "@/lib/portfolios/defaults";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/supabase";

type HoldingRow = Database["public"]["Tables"]["holdings"]["Row"];
type PortfolioCashRow = Database["public"]["Tables"]["portfolio_cash"]["Row"];
type PortfolioRow = Database["public"]["Tables"]["portfolios"]["Row"];
type PortfolioScoreRow =
  Database["public"]["Tables"]["portfolio_stock_scores"]["Row"];
type StockRow = Database["public"]["Tables"]["stocks"]["Row"];
type StockPriceRow = Database["public"]["Tables"]["stock_prices"]["Row"];
type StockScoreRow = Database["public"]["Tables"]["stock_scores"]["Row"];
type WatchlistItemRow =
  Database["public"]["Tables"]["watchlist_items"]["Row"];

type QueryError = { message: string } | null;
type QueryResult<T> = {
  data: T;
  error: QueryError;
};

type QueryFilter = {
  column: string;
  table: string;
  value: unknown;
};

type DashboardFixture = {
  cash?: Pick<PortfolioCashRow, "amount" | "currency" | "updated_at"> | null;
  holdings?: HoldingRow[];
  portfolio?: Pick<PortfolioRow, "base_currency" | "id" | "name">;
  portfolioScores?: Pick<
    PortfolioScoreRow,
    "portfolio_fit_label" | "scored_at" | "symbol"
  >[];
  prices?: Pick<StockPriceRow, "close" | "price_date" | "symbol">[];
  queryFilters?: QueryFilter[];
  stockScores?: Pick<StockScoreRow, "overall_label" | "scored_at" | "symbol">[];
  stocks?: Pick<StockRow, "currency" | "name" | "symbol">[];
  user?: { email?: string | null; id: string } | null;
  watchlistItems?: WatchlistItemRow[];
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

const holding: HoldingRow = {
  average_cost: "250",
  created_at: "2026-06-06T12:00:00.000Z",
  currency: "USD",
  id: "holding-1",
  portfolio_id: portfolio.id,
  quantity: "2",
  symbol: "MSFT",
  updated_at: "2026-06-06T12:00:00.000Z",
};

const watchlistItem: WatchlistItemRow = {
  created_at: "2026-06-06T12:00:00.000Z",
  id: "watchlist-1",
  notes: "Wait for a better entry.",
  portfolio_id: portfolio.id,
  symbol: "AAPL",
  target_price: "180",
  updated_at: "2026-06-06T12:00:00.000Z",
  user_id: user.id,
};

describe("DashboardPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders watched stocks separately from owned holdings", async () => {
    const html = await renderDashboard({
      holdings: [holding],
      prices: [
        {
          close: "300",
          price_date: "2026-06-05",
          symbol: "MSFT",
        },
        {
          close: "150",
          price_date: "2026-06-05",
          symbol: "AAPL",
        },
      ],
      stocks: [
        {
          currency: "USD",
          name: "Microsoft Corporation",
          symbol: "MSFT",
        },
        {
          currency: "USD",
          name: "Apple Inc.",
          symbol: "AAPL",
        },
      ],
      watchlistItems: [watchlistItem],
    });

    expect(html).toContain("Holdings");
    expect(html).toContain("Current owned positions");
    expect(html).toContain("Cash allocation");
    expect(html).toContain("62.5%");
    expect(html).toContain('href="/stocks/MSFT"');
    expect(html).toContain("Microsoft Corporation");
    expect(html).toContain("Watchlist");
    expect(html).toContain("tracked separately from owned holdings");
    expect(html).toContain('href="/stocks/AAPL"');
    expect(html).toContain("Apple Inc.");
    expect(html).toContain("$150.00");
    expect(html).toContain("$180.00");
    expect(html).toContain("Wait for a better entry.");
    expect(html).not.toContain("opportunity");
  });

  it("queries watchlist rows for the signed-in user's default portfolio only", async () => {
    const queryFilters: QueryFilter[] = [];

    await renderDashboard({
      queryFilters,
      watchlistItems: [watchlistItem],
    });

    expect(queryFilters).toEqual(
      expect.arrayContaining([
        {
          column: "portfolio_id",
          table: "watchlist_items",
          value: "portfolio-1",
        },
        {
          column: "user_id",
          table: "watchlist_items",
          value: "user-1",
        },
      ]),
    );
  });

  it("renders an empty watchlist call to action", async () => {
    const html = await renderDashboard({
      watchlistItems: [],
    });

    expect(html).toContain("No watched stocks yet");
    expect(html).toContain("Add watched stock");
    expect(html).toContain('href="/watchlist"');
  });

  it("renders explicit missing states for partial watchlist data", async () => {
    const partialItem: WatchlistItemRow = {
      ...watchlistItem,
      id: "watchlist-2",
      notes: null,
      symbol: "NVDA",
      target_price: null,
    };

    const html = await renderDashboard({
      prices: [],
      stocks: [],
      watchlistItems: [partialItem],
    });

    expect(html).toContain('href="/stocks/NVDA"');
    expect(html).toContain("Company unavailable");
    expect(html).toContain("Not cached");
    expect(html).toContain("No target");
    expect(html).toContain("No notes");
  });

  it("renders stock and portfolio labels separately for owned holdings", async () => {
    const html = await renderDashboard({
      holdings: [holding],
      portfolioScores: [
        {
          portfolio_fit_label: "Concentration Risk",
          scored_at: "2026-06-06T10:00:00.000Z",
          symbol: "MSFT",
        },
      ],
      stockScores: [
        {
          overall_label: "Reasonable",
          scored_at: "2026-06-06T09:00:00.000Z",
          symbol: "MSFT",
        },
      ],
    });

    expect(html).toContain("Stock label");
    expect(html).toContain("Portfolio fit");
    expect(html).toContain("Reasonable");
    expect(html).toContain("Concentration Risk");
    expect(html).toContain("Portfolio context offsets the stock label.");
  });

  it("keeps missing stock-score and portfolio-context states separate", async () => {
    const html = await renderDashboard({
      holdings: [holding],
      portfolioScores: [],
      stockScores: [],
    });

    expect(html).toContain("Stock score unavailable");
    expect(html).toContain("Portfolio context unavailable");
  });
});

async function renderDashboard(fixture: DashboardFixture) {
  vi.mocked(createClient).mockResolvedValue(createSupabaseFixture(fixture));
  vi.mocked(ensureDefaultPortfolioForUser).mockResolvedValue({
    portfolio: fixture.portfolio ?? portfolio,
  });

  return renderToStaticMarkup(await DashboardPage());
}

function createSupabaseFixture(fixture: DashboardFixture) {
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

function createQueryBuilder(table: string, fixture: DashboardFixture) {
  const builder = {
    eq(column: string, value: unknown) {
      fixture.queryFilters?.push({ column, table, value });
      return builder;
    },
    in() {
      return builder;
    },
    maybeSingle() {
      return Promise.resolve(resolveMaybeSingleFixtureQuery(table, fixture));
    },
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
      onrejected?:
        | ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
        | null,
    ) {
      return Promise.resolve(resolveFixtureQuery(table, fixture)).then(
        onfulfilled,
        onrejected,
      );
    },
  };

  return builder;
}

function resolveMaybeSingleFixtureQuery(
  table: string,
  fixture: DashboardFixture,
): QueryResult<unknown> {
  if (table === "portfolio_cash") {
    return result(
      fixture.cash ?? {
        amount: "1000",
        currency: "USD",
        updated_at: "2026-06-06T12:00:00.000Z",
      },
    );
  }

  return result(null);
}

function resolveFixtureQuery(
  table: string,
  fixture: DashboardFixture,
): QueryResult<unknown> {
  if (table === "holdings") {
    return result(fixture.holdings ?? []);
  }

  if (table === "watchlist_items") {
    return result(fixture.watchlistItems ?? []);
  }

  if (table === "stocks") {
    return result(fixture.stocks ?? []);
  }

  if (table === "stock_prices") {
    return result(fixture.prices ?? []);
  }

  if (table === "stock_scores") {
    return result(fixture.stockScores ?? []);
  }

  if (table === "portfolio_stock_scores") {
    return result(fixture.portfolioScores ?? []);
  }

  return result(null);
}

function result<T>(data: T): QueryResult<T> {
  return {
    data,
    error: null,
  };
}
