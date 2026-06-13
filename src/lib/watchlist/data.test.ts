import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ensureDefaultPortfolioForUser: vi.fn(),
}));

vi.mock("../portfolios/defaults", () => ({
  ensureDefaultPortfolioForUser: mocks.ensureDefaultPortfolioForUser,
}));

import {
  listDefaultPortfolioWatchlistItems,
  listEnrichedDefaultPortfolioWatchlistItems,
} from "./data";

const user = {
  email: "user@example.com",
  id: "user-1",
};

const portfolio = {
  base_currency: "USD",
  id: "portfolio-1",
  name: "Default Portfolio",
};

function createWatchlistQuery({
  data = [],
  error = null,
}: {
  data?: unknown[];
  error?: { message: string } | null;
} = {}) {
  const query = {
    eq: vi.fn(() => query),
    order: vi.fn(async () => ({ data, error })),
    select: vi.fn(() => query),
  };

  return query;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.ensureDefaultPortfolioForUser.mockResolvedValue({ portfolio });
});

describe("listDefaultPortfolioWatchlistItems", () => {
  it("loads watchlist items for the user's default portfolio", async () => {
    const rows = [
      {
        created_at: "2026-06-05T12:00:00.000Z",
        id: "watchlist-1",
        notes: "Watch pullbacks",
        portfolio_id: "portfolio-1",
        symbol: "AAPL",
        target_price: "150",
        updated_at: "2026-06-05T12:00:00.000Z",
        user_id: "user-1",
      },
    ];
    const query = createWatchlistQuery({ data: rows });
    const supabase = {
      from: vi.fn(() => ({
        select: query.select,
      })),
    };

    await expect(
      listDefaultPortfolioWatchlistItems(supabase as never, user),
    ).resolves.toEqual({
      items: rows,
      portfolio,
    });

    expect(mocks.ensureDefaultPortfolioForUser).toHaveBeenCalledWith(
      supabase,
      user,
    );
    expect(supabase.from).toHaveBeenCalledWith("watchlist_items");
    expect(query.eq).toHaveBeenCalledWith("portfolio_id", "portfolio-1");
    expect(query.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(query.order).toHaveBeenCalledWith("symbol", { ascending: true });
  });

  it("returns an error when the default portfolio cannot be loaded", async () => {
    mocks.ensureDefaultPortfolioForUser.mockResolvedValue({
      error: "Could not load your default portfolio.",
    });
    const supabase = {
      from: vi.fn(),
    };

    await expect(
      listDefaultPortfolioWatchlistItems(supabase as never, user),
    ).resolves.toEqual({
      error: "Could not load your default portfolio.",
    });

    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("returns an error when the watchlist query fails", async () => {
    const query = createWatchlistQuery({
      error: { message: "permission denied" },
    });
    const supabase = {
      from: vi.fn(() => ({
        select: query.select,
      })),
    };

    await expect(
      listDefaultPortfolioWatchlistItems(supabase as never, user),
    ).resolves.toEqual({
      error: "Could not load your watchlist.",
    });
  });
});

describe("listEnrichedDefaultPortfolioWatchlistItems", () => {
  it("loads an enriched default-portfolio watchlist projection", async () => {
    const watchlistRows = [
      createWatchlistRow({
        id: "watchlist-1",
        notes: "Watch pullbacks",
        symbol: "AAPL",
        target_price: "150",
      }),
    ];
    const watchlistQuery = createWatchlistQuery({ data: watchlistRows });
    const supabase = createEnrichedSupabaseFixture({
      prices: [
        {
          close: "175.5",
          created_at: "2026-06-06T21:00:00.000Z",
          price_date: "2026-06-05",
          symbol: "AAPL",
        },
        {
          close: "170",
          created_at: "2026-06-03T21:00:00.000Z",
          price_date: "2026-06-02",
          symbol: "AAPL",
        },
      ],
      scores: [
        {
          explanation_json: {
            margin_of_safety_percent: 12.5,
          },
          market_context_score: 64,
          overall_label: "Reasonable",
          quality_score: 88,
          safety_score: 70,
          scored_at: "2026-06-06T20:00:00.000Z",
          symbol: "AAPL",
          valuation_score: 72,
        },
      ],
      stocks: [
        {
          currency: "USD",
          name: "Apple Inc.",
          symbol: "AAPL",
        },
      ],
      watchlistQuery,
    });

    await expect(
      listEnrichedDefaultPortfolioWatchlistItems(supabase as never, user, {
        currentDate: new Date("2026-06-07T12:00:00.000Z"),
      }),
    ).resolves.toEqual({
      items: [
        {
          companyName: "Apple Inc.",
          detailHref: "/stocks/AAPL",
          id: "watchlist-1",
          insufficientData: {
            company: false,
            latestCachedPrice: false,
            marginOfSafety: false,
            stockScore: false,
          },
          latestCachedPrice: {
            cachedAt: "2026-06-06T21:00:00.000Z",
            close: 175.5,
            closeRaw: "175.5",
            freshness: expect.objectContaining({
              ageDays: 2,
              asOfDate: "2026-06-05",
              status: "fresh",
            }),
            priceDate: "2026-06-05",
          },
          notes: "Watch pullbacks",
          portfolioId: "portfolio-1",
          stockCurrency: "USD",
          stockScore: {
            marginOfSafetyPercent: 12.5,
            marketContextScore: 64,
            overallLabel: "Reasonable",
            qualityScore: 88,
            safetyScore: 70,
            scoredAt: "2026-06-06T20:00:00.000Z",
            valuationScore: 72,
          },
          symbol: "AAPL",
          targetPrice: "150",
          userId: "user-1",
          watchlistItem: watchlistRows[0],
        },
      ],
      loadErrors: [],
      portfolio,
    });

    expect(supabase.from).toHaveBeenCalledWith("watchlist_items");
    expect(supabase.from).toHaveBeenCalledWith("stocks");
    expect(supabase.from).toHaveBeenCalledWith("stock_prices");
    expect(supabase.from).toHaveBeenCalledWith("stock_scores");
    expect(watchlistQuery.eq).toHaveBeenCalledWith(
      "portfolio_id",
      "portfolio-1",
    );
    expect(watchlistQuery.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(watchlistQuery.order).toHaveBeenCalledWith("symbol", {
      ascending: true,
    });
  });

  it("represents missing cached profile, price, and score data explicitly", async () => {
    const watchlistRows = [
      createWatchlistRow({
        id: "watchlist-2",
        notes: null,
        symbol: "NVDA",
        target_price: null,
      }),
    ];
    const supabase = createEnrichedSupabaseFixture({
      prices: [],
      scores: [],
      stocks: [],
      watchlistQuery: createWatchlistQuery({ data: watchlistRows }),
    });

    await expect(
      listEnrichedDefaultPortfolioWatchlistItems(supabase as never, user),
    ).resolves.toEqual({
      items: [
        expect.objectContaining({
          companyName: null,
          detailHref: "/stocks/NVDA",
          insufficientData: {
            company: true,
            latestCachedPrice: true,
            marginOfSafety: true,
            stockScore: true,
          },
          latestCachedPrice: null,
          notes: null,
          stockCurrency: null,
          stockScore: null,
          symbol: "NVDA",
          targetPrice: null,
        }),
      ],
      loadErrors: [],
      portfolio,
    });
  });

  it("preserves watchlist ordering while selecting the latest price and score rows", async () => {
    const watchlistRows = [
      createWatchlistRow({ id: "watchlist-1", symbol: "AAPL" }),
      createWatchlistRow({ id: "watchlist-2", symbol: "MSFT" }),
    ];
    const supabase = createEnrichedSupabaseFixture({
      prices: [
        {
          close: "300",
          created_at: "2026-06-05T21:00:00.000Z",
          price_date: "2026-06-05",
          symbol: "MSFT",
        },
        {
          close: "150",
          created_at: "2026-06-03T21:00:00.000Z",
          price_date: "2026-06-03",
          symbol: "AAPL",
        },
        {
          close: "175",
          created_at: "2026-06-06T21:00:00.000Z",
          price_date: "2026-06-06",
          symbol: "AAPL",
        },
      ],
      scores: [
        {
          explanation_json: {},
          market_context_score: null,
          overall_label: "Watch",
          quality_score: null,
          safety_score: null,
          scored_at: "2026-06-03T20:00:00.000Z",
          symbol: "AAPL",
          valuation_score: null,
        },
        {
          explanation_json: {
            marginOfSafetyPercent: -5,
          },
          market_context_score: null,
          overall_label: "Expensive",
          quality_score: null,
          safety_score: null,
          scored_at: "2026-06-06T20:00:00.000Z",
          symbol: "AAPL",
          valuation_score: null,
        },
      ],
      stocks: [],
      watchlistQuery: createWatchlistQuery({ data: watchlistRows }),
    });

    const result = await listEnrichedDefaultPortfolioWatchlistItems(
      supabase as never,
      user,
    );

    expect(result).toMatchObject({
      items: [
        {
          latestCachedPrice: {
            close: 175,
            priceDate: "2026-06-06",
          },
          stockScore: {
            marginOfSafetyPercent: -5,
            overallLabel: "Expensive",
            scoredAt: "2026-06-06T20:00:00.000Z",
          },
          symbol: "AAPL",
        },
        {
          latestCachedPrice: {
            close: 300,
            priceDate: "2026-06-05",
          },
          stockScore: null,
          symbol: "MSFT",
        },
      ],
    });
  });

  it("returns an empty enriched projection without querying cached data", async () => {
    const supabase = createEnrichedSupabaseFixture({
      watchlistQuery: createWatchlistQuery({ data: [] }),
    });

    await expect(
      listEnrichedDefaultPortfolioWatchlistItems(supabase as never, user),
    ).resolves.toEqual({
      items: [],
      loadErrors: [],
      portfolio,
    });

    expect(supabase.from).toHaveBeenCalledTimes(1);
    expect(supabase.from).toHaveBeenCalledWith("watchlist_items");
  });
});

function createWatchlistRow(
  overrides: Partial<{
    created_at: string;
    id: string;
    notes: string | null;
    portfolio_id: string;
    symbol: string;
    target_price: string | null;
    updated_at: string;
    user_id: string;
  }>,
) {
  return {
    created_at: "2026-06-05T12:00:00.000Z",
    id: "watchlist-1",
    notes: "Watch pullbacks",
    portfolio_id: "portfolio-1",
    symbol: "AAPL",
    target_price: "150",
    updated_at: "2026-06-05T12:00:00.000Z",
    user_id: "user-1",
    ...overrides,
  };
}

function createEnrichmentQuery({
  data = [],
  error = null,
}: {
  data?: unknown[];
  error?: { message: string } | null;
} = {}) {
  const query = {
    in: vi.fn(() => query),
    order: vi.fn(() => query),
    select: vi.fn(() => query),
    then<TResult1 = { data: unknown[]; error: { message: string } | null }>(
      onfulfilled?: ((value: { data: unknown[]; error: typeof error }) => TResult1) | null,
      onrejected?: ((reason: unknown) => never) | null,
    ) {
      return Promise.resolve({ data, error }).then(onfulfilled, onrejected);
    },
  };

  return query;
}

function createEnrichedSupabaseFixture({
  prices = [],
  scores = [],
  stocks = [],
  watchlistQuery,
}: {
  prices?: unknown[];
  scores?: unknown[];
  stocks?: unknown[];
  watchlistQuery: ReturnType<typeof createWatchlistQuery>;
}) {
  const stockQuery = createEnrichmentQuery({ data: stocks });
  const priceQuery = createEnrichmentQuery({ data: prices });
  const scoreQuery = createEnrichmentQuery({ data: scores });

  return {
    from: vi.fn((table: string) => {
      if (table === "watchlist_items") {
        return {
          select: watchlistQuery.select,
        };
      }

      if (table === "stocks") {
        return {
          select: stockQuery.select,
        };
      }

      if (table === "stock_prices") {
        return {
          select: priceQuery.select,
        };
      }

      if (table === "stock_scores") {
        return {
          select: scoreQuery.select,
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    }),
  };
}
