import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ensureDefaultPortfolioForUser: vi.fn(),
}));

vi.mock("../portfolios/defaults", () => ({
  ensureDefaultPortfolioForUser: mocks.ensureDefaultPortfolioForUser,
}));

import { listDefaultPortfolioWatchlistItems } from "./data";

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
