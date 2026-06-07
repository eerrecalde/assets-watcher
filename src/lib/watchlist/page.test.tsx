import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("./actions", () => ({
  addWatchlistItemAction: "#add-watchlist",
  deleteWatchlistItemAction: "#delete-watchlist",
  updateWatchlistItemAction: "#update-watchlist",
}));

import {
  WatchlistPage,
  type WatchlistPageDependencies,
} from "./page";
import type { DefaultPortfolioWatchlistItem } from "./data";
import type { Database } from "../../types/supabase";

type PortfolioRow = Database["public"]["Tables"]["portfolios"]["Row"];
type StockRow = Database["public"]["Tables"]["stocks"]["Row"];
type StockPriceRow = Database["public"]["Tables"]["stock_prices"]["Row"];

type QueryResult<T> = {
  data: T;
  error: { message: string } | null;
};

type WatchlistFixture = {
  items?: DefaultPortfolioWatchlistItem[];
  portfolio?: Pick<PortfolioRow, "base_currency" | "id" | "name">;
  prices?: Pick<StockPriceRow, "close" | "price_date" | "symbol">[];
  stocks?: Pick<StockRow, "currency" | "name" | "symbol">[];
  user?: { email?: string | null; id: string } | null;
  watchlistError?: string;
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

const watchlistItem: DefaultPortfolioWatchlistItem = {
  created_at: "2026-06-06T12:00:00.000Z",
  id: "watchlist-1",
  notes: "Wait for a better entry.",
  portfolio_id: portfolio.id,
  symbol: "AAPL",
  target_price: "180",
  updated_at: "2026-06-06T12:00:00.000Z",
  user_id: user.id,
};

describe("WatchlistPage", () => {
  it("redirects unauthenticated users to login with the watchlist path", async () => {
    const redirectToLogin = vi.fn((url: string): never => {
      throw new Error(`redirect:${url}`);
    });
    const dependencies = createDependencies({
      user: null,
    });

    await expect(
      WatchlistPage({
        ...dependencies,
        redirectToLogin,
      }),
    ).rejects.toThrow("redirect:/login?next=%2Fwatchlist");
    expect(redirectToLogin).toHaveBeenCalledWith(
      "/login?next=%2Fwatchlist",
    );
  });

  it("renders a signed-in empty watchlist state", async () => {
    const html = await renderPage({
      items: [],
    });

    expect(html).toContain("Watchlist");
    expect(html).toContain("Default Portfolio");
    expect(html).toContain("Add watched stock");
    expect(html).toContain('name="symbol"');
    expect(html).toContain('name="target_price"');
    expect(html).toContain('name="notes"');
    expect(html).toContain("Optional context");
    expect(html).toContain("Watched stocks");
    expect(html).toContain("No watched stocks yet");
  });

  it("renders feedback messages from watchlist action redirects", async () => {
    const html = await renderPage(
      {
        items: [],
      },
      {
        feedbackParams: {
          notice: "notice-1",
          success: "Watchlist item added.",
          warning: "Latest price could not be refreshed.",
        },
      },
    );

    expect(html).toContain("Watchlist item added.");
    expect(html).toContain("Latest price could not be refreshed.");
  });

  it("renders watchlist rows with cached stock and latest price context", async () => {
    const listWatchlistItems = vi.fn(async () => ({
      items: [watchlistItem],
      portfolio,
    }));

    const html = await renderPage(
      {
        items: [watchlistItem],
        prices: [
          {
            close: "150",
            price_date: "2026-06-05",
            symbol: "AAPL",
          },
          {
            close: "720",
            price_date: "2026-06-05",
            symbol: "TSLA",
          },
        ],
        stocks: [
          {
            currency: "USD",
            name: "Apple Inc.",
            symbol: "AAPL",
          },
          {
            currency: "USD",
            name: "Tesla Inc.",
            symbol: "TSLA",
          },
        ],
      },
      { listWatchlistItems },
    );

    expect(listWatchlistItems).toHaveBeenCalledWith(expect.anything(), user);
    expect(html).toContain("Apple Inc.");
    expect(html).toContain("$150.00");
    expect(html).toContain("Graham label");
    expect(html).toContain("Margin of safety");
    expect(html).toContain("Pending Milestone 6");
    expect(html).toContain('aria-label="Edit AAPL target price"');
    expect(html).toContain('value="180"');
    expect(html).toContain('aria-label="Edit AAPL notes"');
    expect(html).toContain("Wait for a better entry.");
    expect(html).toContain("Save");
    expect(html).toContain("Delete");
    expect(html).not.toContain("Tesla Inc.");
  });

  it("renders explicit unavailable states for partial cached watchlist data", async () => {
    const partialItem: DefaultPortfolioWatchlistItem = {
      ...watchlistItem,
      id: "watchlist-2",
      notes: null,
      symbol: "MSFT",
      target_price: null,
    };

    const html = await renderPage({
      items: [partialItem],
      prices: [],
      stocks: [],
    });

    expect(html).toContain("Company unavailable");
    expect(html).toContain("Not cached");
    expect(html).toContain("Pending Milestone 6");
    expect(html).toContain('aria-label="Edit MSFT target price"');
    expect(html).toContain('placeholder="No notes"');
  });

  it("renders a load warning when watchlist data cannot be loaded", async () => {
    const html = await renderPage({
      watchlistError: "Could not load your watchlist.",
    });

    expect(html).toContain("Some watchlist data could not be loaded.");
    expect(html).toContain("No watched stocks yet");
  });
});

async function renderPage(
  fixture: WatchlistFixture,
  overrides: Partial<WatchlistPageDependencies> = {},
) {
  return renderToStaticMarkup(
    await WatchlistPage({
      ...createDependencies(fixture),
      ...overrides,
    }),
  );
}

function createDependencies(
  fixture: WatchlistFixture,
): WatchlistPageDependencies {
  return {
    createSupabaseClient: async () => createSupabaseFixture(fixture),
    listWatchlistItems:
      fixture.watchlistError === undefined
        ? vi.fn(async () => ({
            items: fixture.items ?? [],
            portfolio: fixture.portfolio ?? portfolio,
          }))
        : vi.fn(async () => ({
            error: fixture.watchlistError ?? "Could not load your watchlist.",
          })),
    redirectToLogin: vi.fn((url: string): never => {
      throw new Error(`redirect:${url}`);
    }),
    watchlistActions: {
      add: "#add-watchlist",
      delete: "#delete-watchlist",
      update: "#update-watchlist",
    },
  };
}

function createSupabaseFixture(fixture: WatchlistFixture) {
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

function createQueryBuilder(table: string, fixture: WatchlistFixture) {
  const builder = {
    in() {
      return builder;
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
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) {
      return Promise.resolve(resolveFixtureQuery(table, fixture)).then(
        onfulfilled,
        onrejected,
      );
    },
  };

  return builder;
}

function resolveFixtureQuery(
  table: string,
  fixture: WatchlistFixture,
): QueryResult<unknown> {
  if (table === "stocks") {
    return result(fixture.stocks ?? []);
  }

  if (table === "stock_prices") {
    return result(fixture.prices ?? []);
  }

  return result(null);
}

function result<T>(data: T): QueryResult<T> {
  return {
    data,
    error: null,
  };
}
