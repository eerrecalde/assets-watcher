import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  createClient: vi.fn(),
  createFinancialModelingPrepProvider: vi.fn(),
  ensureDefaultPortfolioForUser: vi.fn(),
  fetchAndCacheCompanyProfile: vi.fn(),
  fetchAndCacheLatestPrice: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
  revalidatePath: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));

vi.mock("@/lib/portfolios/defaults", () => ({
  ensureDefaultPortfolioForUser: mocks.ensureDefaultPortfolioForUser,
}));

vi.mock("@/lib/market-data", () => ({
  createFinancialModelingPrepProvider:
    mocks.createFinancialModelingPrepProvider,
  fetchAndCacheCompanyProfile: mocks.fetchAndCacheCompanyProfile,
  fetchAndCacheLatestPrice: mocks.fetchAndCacheLatestPrice,
}));

vi.mock("@/lib/stocks/symbols", () => ({
  getStockDetailPath: (symbol: string) => `/stocks/${encodeURIComponent(symbol)}`,
  isValidNormalizedStockSymbol: (symbol: string) =>
    /^[A-Z][A-Z0-9.-]{0,14}$/.test(symbol),
  normalizeStockSymbol: (symbol: string) => symbol.trim().toUpperCase(),
}));

import {
  addWatchlistItemAction,
  deleteWatchlistItemAction,
  updateWatchlistItemAction,
} from "./actions";

const user = {
  email: "user@example.com",
  id: "user-1",
};

const portfolio = {
  base_currency: "USD",
  id: "portfolio-1",
  name: "Default Portfolio",
};

function createFormData(values: Record<string, string>) {
  const formData = new FormData();

  for (const [key, value] of Object.entries(values)) {
    formData.set(key, value);
  }

  return formData;
}

function expectRedirect(promise: Promise<unknown>, expectedUrlPart: string) {
  return expect(promise).rejects.toThrow(`NEXT_REDIRECT:${expectedUrlPart}`);
}

function createMutationQuery(error: { code?: string; message: string } | null) {
  const query = {
    eq: vi.fn(() => query),
    error,
  };

  return query;
}

function createSelectQuery({
  data = null,
  error = null,
}: {
  data?: Record<string, string> | null;
  error?: { message: string } | null;
} = {}) {
  const query = {
    eq: vi.fn(() => query),
    maybeSingle: vi.fn(async () => ({ data, error })),
    select: vi.fn(() => query),
  };

  return query;
}

function createSupabaseMock({
  deleteError = null,
  insertError = null,
  selectResults = [
    {
      data: {
        id: "watchlist-1",
        portfolio_id: "portfolio-1",
        symbol: "MSFT",
      },
      error: null,
    },
  ],
  sessionUser = user,
  updateError = null,
}: {
  deleteError?: { code?: string; message: string } | null;
  insertError?: { code?: string; message: string } | null;
  sessionUser?: typeof user | null;
  selectResults?: {
    data?: Record<string, string> | null;
    error?: { message: string } | null;
  }[];
  updateError?: { code?: string; message: string } | null;
} = {}) {
  const selectQueries = selectResults.map((result) =>
    createSelectQuery({
      data: result.data ?? null,
      error: result.error ?? null,
    }),
  );
  const updateQuery = createMutationQuery(updateError);
  const deleteQuery = createMutationQuery(deleteError);
  const insert = vi.fn(async () => ({ error: insertError }));
  const select = vi.fn(() => {
    const query = selectQueries.shift() ?? createSelectQuery();

    return query;
  });
  const update = vi.fn(() => updateQuery);
  const deleteMethod = vi.fn(() => deleteQuery);
  const from = vi.fn((table: string) => {
    if (table !== "watchlist_items") {
      throw new Error(`Unexpected table: ${table}`);
    }

    return {
      delete: deleteMethod,
      insert,
      select,
      update,
    };
  });
  const supabase = {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: sessionUser } })),
    },
    from,
  };

  return {
    delete: deleteMethod,
    deleteQuery,
    from,
    insert,
    select,
    selectQueries,
    supabase,
    update,
    updateQuery,
  };
}

beforeEach(() => {
  vi.clearAllMocks();

  mocks.createAdminClient.mockReturnValue({});
  mocks.createFinancialModelingPrepProvider.mockReturnValue({
    provider: "test-provider",
  });
  mocks.ensureDefaultPortfolioForUser.mockResolvedValue({ portfolio });
  mocks.fetchAndCacheCompanyProfile.mockResolvedValue({
    data: {
      country: "US",
      currency: "USD",
      exchange: "NASDAQ",
      industry: "Consumer Electronics",
      name: "Apple Inc.",
      sector: "Technology",
      symbol: "AAPL",
    },
    fetchedAt: new Date("2026-06-05T12:00:00.000Z"),
    ok: true,
    provider: "test-provider",
    warnings: [],
  });
  mocks.fetchAndCacheLatestPrice.mockResolvedValue({
    data: {
      close: 201,
      high: null,
      low: null,
      open: null,
      priceDate: "2026-06-05",
      symbol: "AAPL",
      volume: null,
    },
    fetchedAt: new Date("2026-06-05T12:00:00.000Z"),
    ok: true,
    provider: "test-provider",
    warnings: [],
  });
});

describe("addWatchlistItemAction", () => {
  it("creates a watchlist item for the default portfolio", async () => {
    const { insert, select, supabase } = createSupabaseMock({
      selectResults: [{ data: null }],
    });
    mocks.createClient.mockResolvedValue(supabase);

    await expectRedirect(
      addWatchlistItemAction(
        createFormData({
          notes: " Buy below target ",
          symbol: " aapl ",
          target_price: "150.25",
        }),
      ),
      "/watchlist?success=Watchlist+item+added.",
    );

    expect(mocks.ensureDefaultPortfolioForUser).toHaveBeenCalledWith(
      supabase,
      user,
    );
    expect(select).toHaveBeenCalledWith("id");
    expect(mocks.fetchAndCacheCompanyProfile).toHaveBeenCalledWith({
      provider: { provider: "test-provider" },
      supabase: {},
      symbol: "AAPL",
    });
    expect(insert).toHaveBeenCalledWith({
      notes: "Buy below target",
      portfolio_id: "portfolio-1",
      symbol: "AAPL",
      target_price: "150.25",
      user_id: "user-1",
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/watchlist");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/dashboard");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/stocks/AAPL");
  });

  it("redirects with a clear duplicate-symbol error", async () => {
    const { insert, supabase } = createSupabaseMock({
      selectResults: [{ data: { id: "watchlist-1" } }],
    });
    mocks.createClient.mockResolvedValue(supabase);

    await expectRedirect(
      addWatchlistItemAction(createFormData({ symbol: "MSFT" })),
      "/watchlist?error=That+symbol+is+already+in+this+portfolio%27s+watchlist.",
    );
    expect(mocks.fetchAndCacheCompanyProfile).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it("validates optional target price as positive when provided", async () => {
    const { insert, supabase } = createSupabaseMock();
    mocks.createClient.mockResolvedValue(supabase);

    await expectRedirect(
      addWatchlistItemAction(
        createFormData({
          symbol: "MSFT",
          target_price: "0",
        }),
      ),
      "/watchlist?error=Target+price+must+be+greater+than+zero.",
    );

    expect(insert).not.toHaveBeenCalled();
    expect(mocks.fetchAndCacheCompanyProfile).not.toHaveBeenCalled();
  });

  it("validates target price against the database precision limit", async () => {
    const { insert, supabase } = createSupabaseMock();
    mocks.createClient.mockResolvedValue(supabase);

    await expectRedirect(
      addWatchlistItemAction(
        createFormData({
          symbol: "MSFT",
          target_price: "123456789012345.12",
        }),
      ),
      "/watchlist?error=Target+price+must+fit+within+14+digits+before+the+decimal.",
    );

    expect(insert).not.toHaveBeenCalled();
    expect(mocks.fetchAndCacheCompanyProfile).not.toHaveBeenCalled();
  });

  it("still handles a duplicate insert race with a clear validation error", async () => {
    const { insert, supabase } = createSupabaseMock({
      insertError: {
        code: "23505",
        message: "duplicate key value violates unique constraint",
      },
      selectResults: [{ data: null }],
    });
    mocks.createClient.mockResolvedValue(supabase);

    await expectRedirect(
      addWatchlistItemAction(createFormData({ symbol: "MSFT" })),
      "/watchlist?error=That+symbol+is+already+in+this+portfolio%27s+watchlist.",
    );

    expect(insert).toHaveBeenCalled();
  });
});

describe("updateWatchlistItemAction", () => {
  it("updates an owned watchlist item", async () => {
    const { selectQueries, supabase, update, updateQuery } = createSupabaseMock({
      selectResults: [
        {
          data: {
            id: "watchlist-1",
            portfolio_id: "portfolio-1",
            symbol: "AAPL",
          },
        },
      ],
    });
    const [existingItemQuery] = selectQueries;
    mocks.createClient.mockResolvedValue(supabase);

    await expectRedirect(
      updateWatchlistItemAction(
        createFormData({
          notes: "",
          symbol: "AAPL",
          target_price: "175",
          watchlist_item_id: "watchlist-1",
        }),
      ),
      "/watchlist?success=Watchlist+item+updated.",
    );

    expect(existingItemQuery.eq).toHaveBeenCalledWith("id", "watchlist-1");
    expect(existingItemQuery.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(existingItemQuery.eq).toHaveBeenCalledWith(
      "portfolio_id",
      "portfolio-1",
    );
    expect(mocks.fetchAndCacheCompanyProfile).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith({
      notes: null,
      symbol: "AAPL",
      target_price: "175",
    });
    expect(updateQuery.eq).toHaveBeenCalledWith("id", "watchlist-1");
    expect(updateQuery.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(updateQuery.eq).toHaveBeenCalledWith("portfolio_id", "portfolio-1");
  });

  it("checks duplicates and refreshes market data when changing symbols", async () => {
    const { selectQueries, supabase, update } = createSupabaseMock({
      selectResults: [
        {
          data: {
            id: "watchlist-1",
            portfolio_id: "portfolio-1",
            symbol: "MSFT",
          },
        },
        { data: null },
      ],
    });
    const [, duplicateQuery] = selectQueries;
    mocks.createClient.mockResolvedValue(supabase);

    await expectRedirect(
      updateWatchlistItemAction(
        createFormData({
          symbol: "AAPL",
          watchlist_item_id: "watchlist-1",
        }),
      ),
      "/watchlist?success=Watchlist+item+updated.",
    );

    expect(duplicateQuery.eq).toHaveBeenCalledWith("portfolio_id", "portfolio-1");
    expect(duplicateQuery.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(duplicateQuery.eq).toHaveBeenCalledWith("symbol", "AAPL");
    expect(mocks.fetchAndCacheCompanyProfile).toHaveBeenCalledWith({
      provider: { provider: "test-provider" },
      supabase: {},
      symbol: "AAPL",
    });
    expect(update).toHaveBeenCalledWith({
      notes: null,
      symbol: "AAPL",
      target_price: null,
    });
  });

  it("redirects with a clear error when a changed symbol duplicates another item", async () => {
    const { supabase, update } = createSupabaseMock({
      selectResults: [
        {
          data: {
            id: "watchlist-1",
            portfolio_id: "portfolio-1",
            symbol: "MSFT",
          },
        },
        { data: { id: "watchlist-2" } },
      ],
    });
    mocks.createClient.mockResolvedValue(supabase);

    await expectRedirect(
      updateWatchlistItemAction(
        createFormData({
          symbol: "AAPL",
          watchlist_item_id: "watchlist-1",
        }),
      ),
      "/watchlist?error=That+symbol+is+already+in+this+portfolio%27s+watchlist.",
    );

    expect(mocks.fetchAndCacheCompanyProfile).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("rejects updates to watchlist items the user cannot load", async () => {
    const { supabase, update } = createSupabaseMock({
      selectResults: [{ data: null }],
    });
    mocks.createClient.mockResolvedValue(supabase);

    await expectRedirect(
      updateWatchlistItemAction(
        createFormData({
          symbol: "AAPL",
          watchlist_item_id: "watchlist-2",
        }),
      ),
      "/watchlist?error=Could+not+load+the+watchlist+item+to+update.",
    );

    expect(update).not.toHaveBeenCalled();
  });

  it("checks authentication before update input validation", async () => {
    const { supabase, update } = createSupabaseMock({
      sessionUser: null,
    });
    mocks.createClient.mockResolvedValue(supabase);

    await expectRedirect(
      updateWatchlistItemAction(
        createFormData({
          symbol: "",
          target_price: "0",
          watchlist_item_id: "watchlist-1",
        }),
      ),
      "/login?next=%2Fwatchlist",
    );

    expect(update).not.toHaveBeenCalled();
    expect(mocks.fetchAndCacheCompanyProfile).not.toHaveBeenCalled();
  });
});

describe("deleteWatchlistItemAction", () => {
  it("deletes an owned watchlist item", async () => {
    const { delete: deleteMethod, deleteQuery, selectQueries, supabase } =
      createSupabaseMock({
        selectResults: [
          {
            data: {
              id: "watchlist-1",
              portfolio_id: "portfolio-1",
              symbol: "AAPL",
            },
          },
        ],
      });
    const [existingItemQuery] = selectQueries;
    mocks.createClient.mockResolvedValue(supabase);

    await expectRedirect(
      deleteWatchlistItemAction(
        createFormData({
          watchlist_item_id: "watchlist-1",
        }),
      ),
      "/watchlist?success=Watchlist+item+deleted.",
    );

    expect(existingItemQuery.eq).toHaveBeenCalledWith("id", "watchlist-1");
    expect(existingItemQuery.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(existingItemQuery.eq).toHaveBeenCalledWith(
      "portfolio_id",
      "portfolio-1",
    );
    expect(deleteMethod).toHaveBeenCalled();
    expect(deleteQuery.eq).toHaveBeenCalledWith("id", "watchlist-1");
    expect(deleteQuery.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(deleteQuery.eq).toHaveBeenCalledWith("portfolio_id", "portfolio-1");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/stocks/AAPL");
  });
});
