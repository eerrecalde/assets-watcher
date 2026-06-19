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

vi.mock("@/lib/ai/actions", () => ({
  generateAITakeAction: "#generate-ai-take",
}));

vi.mock("@/components/ai/generate-ai-take-button", () => ({
  GenerateAITakeButton: () => <button type="submit">Generate AI Take</button>,
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
import type { AITakePortfolioSnapshot } from "@/lib/ai/provider";
import type { Database, Json } from "@/types/supabase";

type HoldingRow = Database["public"]["Tables"]["holdings"]["Row"];
type AITakeRow = Database["public"]["Tables"]["ai_takes"]["Row"];
type PortfolioCashRow = Database["public"]["Tables"]["portfolio_cash"]["Row"];
type PortfolioRow = Database["public"]["Tables"]["portfolios"]["Row"];
type PortfolioScoreRow =
  Database["public"]["Tables"]["portfolio_stock_scores"]["Row"];
type StockRow = Database["public"]["Tables"]["stocks"]["Row"];
type StockPriceRow = Database["public"]["Tables"]["stock_prices"]["Row"];
type StockScoreRow = Database["public"]["Tables"]["stock_scores"]["Row"];
type UserRulesRow = Database["public"]["Tables"]["user_rules"]["Row"];
type AlertPreferencesRow =
  Database["public"]["Tables"]["alert_preferences"]["Row"];
type WatchlistItemRow =
  Database["public"]["Tables"]["watchlist_items"]["Row"];
type LatestAITakeRow = Pick<
  AITakeRow,
  "created_at" | "input_snapshot_json" | "model" | "output_markdown" | "provider"
>;
type PortfolioScoreFixtureRow = Pick<
  PortfolioScoreRow,
  "portfolio_fit_label" | "scored_at" | "symbol"
> &
  Partial<Pick<PortfolioScoreRow, "explanation_json">>;
type StockScoreFixtureRow = Pick<
  StockScoreRow,
  "overall_label" | "scored_at" | "symbol"
> &
  Partial<Pick<StockScoreRow, "explanation_json">>;

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
  aiTakes?: LatestAITakeRow[];
  alertPreferences?: Pick<
    AlertPreferencesRow,
    | "allocation_enabled"
    | "score_change_enabled"
    | "target_price_enabled"
    | "watchlist_opportunity_enabled"
  > | null;
  cash?: Pick<PortfolioCashRow, "amount" | "currency" | "updated_at"> | null;
  holdings?: HoldingRow[];
  portfolio?: Pick<PortfolioRow, "base_currency" | "id" | "name">;
  portfolioScores?: PortfolioScoreFixtureRow[];
  prices?: Pick<StockPriceRow, "close" | "price_date" | "symbol">[];
  queryFilters?: QueryFilter[];
  stockScores?: StockScoreFixtureRow[];
  stocks?: Pick<StockRow, "currency" | "name" | "sector" | "symbol">[];
  user?: { email?: string | null; id: string } | null;
  userRules?: Pick<
    UserRulesRow,
    | "max_debt_to_equity"
    | "max_pb"
    | "max_pe"
    | "max_sector_allocation"
    | "max_single_stock_allocation"
    | "min_current_ratio"
    | "min_margin_of_safety"
  > | null;
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

const aiTakeSnapshot = {
  generatedAt: "2026-06-17T14:20:00.000Z",
  holdings: [
    {
      allocationPercent: 74.5,
      averageCost: 250,
      companyName: "Microsoft Corporation",
      deterministicFacts: [
        {
          asOfDate: "2026-06-05",
          description:
            "MSFT latest cached close is 300 USD and freshness is stale.",
          source: "cached_market_data",
        },
      ],
      latestPrice: {
        asOfDate: "2026-06-05",
        currency: "USD",
        freshness: "stale",
        value: 300,
      },
      marketValue: 600,
      portfolioFit: null,
      quantity: 2,
      sector: "Technology",
      stockScore: null,
      symbol: "MSFT",
      unrealizedGainLoss: 100,
      unrealizedGainLossPercent: 20,
    },
  ],
  portfolio: {
    asOfDate: "2026-06-05",
    baseCurrency: "USD",
    cashAllocationPercent: 62.5,
    cashBalance: 1000,
    deterministicFacts: [
      {
        asOfDate: null,
        description:
          "Portfolio snapshot includes 1 holding and total portfolio value 1600.",
        source: "derived_portfolio_metric",
      },
    ],
    sectorAllocation: [],
    totalMarketValue: 600,
    totalPortfolioValue: 1600,
  },
  rules: {
    maxDebtToEquity: 1,
    maxPb: 3,
    maxPe: 25,
    maxSectorAllocationPercent: 35,
    maxSingleStockAllocationPercent: 20,
    minCashAllocationPercent: 5,
    minCurrentRatio: 1.5,
    minMarginOfSafetyPercent: 25,
    source: "defaults",
  },
  snapshotId: "portfolio-snapshot:portfolio-1:2026-06-17T14:20:00.000Z",
  watchlist: [],
} satisfies AITakePortfolioSnapshot;

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
          sector: "Technology",
          symbol: "MSFT",
        },
        {
          currency: "USD",
          name: "Apple Inc.",
          sector: "Technology",
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

  it("renders a prioritized deterministic review queue", async () => {
    const html = await renderDashboard({
      holdings: [holding],
      portfolioScores: [
        {
          portfolio_fit_label: "Concentration Risk",
          explanation_json: createPortfolioScoreExplanation({
            ruleId: "portfolio_fit.position_allocation",
            status: "warning",
            summary:
              "Position allocation is above the maximum single-stock threshold.",
          }),
          scored_at: "2026-06-06T10:00:00.000Z",
          symbol: "MSFT",
        },
        {
          portfolio_fit_label: "Balanced",
          explanation_json: createPortfolioScoreExplanation({
            ruleId: "portfolio_fit.position_allocation",
            status: "pass",
            summary:
              "Position allocation was within the maximum single-stock threshold.",
          }),
          scored_at: "2026-06-05T10:00:00.000Z",
          symbol: "MSFT",
        },
      ],
      prices: [
        {
          close: "310",
          price_date: "2026-06-05",
          symbol: "MSFT",
        },
        {
          close: "170",
          price_date: "2026-06-05",
          symbol: "AAPL",
        },
      ],
      stockScores: [
        {
          explanation_json: createStockScoreExplanation({
            marginOfSafetyPercent: 28.4,
            minMarginOfSafetyPercent: 25,
            ruleId: "valuation.pe_ratio",
            status: "pass",
            summary: "P/E is within the configured threshold.",
          }),
          overall_label: "Reasonable",
          scored_at: "2026-06-07T09:00:00.000Z",
          symbol: "AAPL",
        },
        {
          explanation_json: createStockScoreExplanation({
            ruleId: "valuation.pe_ratio",
            status: "fail",
            summary: "P/E exceeded the configured threshold.",
          }),
          overall_label: "Watch",
          scored_at: "2026-06-06T09:00:00.000Z",
          symbol: "AAPL",
        },
      ],
      stocks: [
        {
          currency: "USD",
          name: "Microsoft Corporation",
          sector: "Technology",
          symbol: "MSFT",
        },
        {
          currency: "USD",
          name: "Apple Inc.",
          sector: "Technology",
          symbol: "AAPL",
        },
      ],
      watchlistItems: [watchlistItem],
    });

    expect(html).toContain("Review queue");
    expect(html).toContain("MSFT is above allocation threshold");
    expect(html).toContain(
      "MSFT is 38.27% of the portfolio, above the 10% single-stock allocation threshold from the product-plan default.",
    );
    expect(html).toContain(
      "This is an informational concentration flag, not a directive to sell.",
    );
    expect(html).toContain("AAPL is at or below target");
    expect(html).toContain(
      "$170.00 latest cached close is at or below the $180.00 target price. As of Jun 5, 2026. Freshness: Stale.",
    );
    expect(html).toContain("Latest cached close is older than 3 calendar days.");
    expect(html).toContain("not a buy instruction");
    expect(html).toContain("AAPL watchlist opportunity");
    expect(html).toContain(
      "Latest deterministic stock label: Reasonable. Margin of safety: 28.4%. Minimum threshold: 25%.",
    );
    expect(html).toContain(
      "Latest cached close: $170.00 as of Jun 5, 2026. Freshness: Stale.",
    );
    expect(html).toContain(
      "Target price: $180.00; current cached price is at or below that target.",
    );
    expect(html).toContain("AAPL stock score changed");
    expect(html).toContain("Stock label improved from Watch to Reasonable.");
    expect(html).toContain("AAPL stock rule outcome changed");
    expect(html).toContain("Rule valuation.pe_ratio changed from fail to pass.");
    expect(html).toContain("Previous snapshot: Jun 6, 2026");
    expect(html).toContain("Current snapshot: Jun 7, 2026");
    expect(html).toContain("MSFT portfolio-fit score changed");
    expect(html).toContain(
      "Portfolio-fit label changed from Balanced to Concentration Risk.",
    );
    expect(html).toContain("MSFT portfolio rule outcome changed");
    expect(html).toContain(
      "Portfolio rule portfolio_fit.position_allocation changed from pass to warning.",
    );
    expect(html).toContain("View stock");
  });

  it("hides disabled alert categories from the review queue", async () => {
    const html = await renderDashboard({
      alertPreferences: {
        allocation_enabled: false,
        score_change_enabled: false,
        target_price_enabled: false,
        watchlist_opportunity_enabled: true,
      },
      holdings: [holding],
      portfolioScores: [
        {
          portfolio_fit_label: "Concentration Risk",
          explanation_json: createPortfolioScoreExplanation({
            ruleId: "portfolio_fit.position_allocation",
            status: "warning",
            summary:
              "Position allocation is above the maximum single-stock threshold.",
          }),
          scored_at: "2026-06-06T10:00:00.000Z",
          symbol: "MSFT",
        },
        {
          portfolio_fit_label: "Balanced",
          explanation_json: createPortfolioScoreExplanation({
            ruleId: "portfolio_fit.position_allocation",
            status: "pass",
            summary:
              "Position allocation was within the maximum single-stock threshold.",
          }),
          scored_at: "2026-06-05T10:00:00.000Z",
          symbol: "MSFT",
        },
      ],
      prices: [
        {
          close: "310",
          price_date: "2026-06-05",
          symbol: "MSFT",
        },
        {
          close: "170",
          price_date: "2026-06-05",
          symbol: "AAPL",
        },
      ],
      stockScores: [
        {
          explanation_json: createStockScoreExplanation({
            marginOfSafetyPercent: 28.4,
            minMarginOfSafetyPercent: 25,
            ruleId: "valuation.pe_ratio",
            status: "pass",
            summary: "P/E is within the configured threshold.",
          }),
          overall_label: "Reasonable",
          scored_at: "2026-06-07T09:00:00.000Z",
          symbol: "AAPL",
        },
        {
          explanation_json: createStockScoreExplanation({
            ruleId: "valuation.pe_ratio",
            status: "fail",
            summary: "P/E exceeded the configured threshold.",
          }),
          overall_label: "Watch",
          scored_at: "2026-06-06T09:00:00.000Z",
          symbol: "AAPL",
        },
      ],
      watchlistItems: [watchlistItem],
    });

    expect(html).toContain("Configure alert preferences");
    expect(html).toContain("AAPL watchlist opportunity");
    expect(html).not.toContain("MSFT is above allocation threshold");
    expect(html).not.toContain("AAPL is at or below target");
    expect(html).not.toContain("AAPL stock score changed");
    expect(html).not.toContain("MSFT portfolio-fit score changed");
  });

  it("does not flag score changes when there is no prior comparable snapshot", async () => {
    const html = await renderDashboard({
      holdings: [holding],
      portfolioScores: [
        {
          portfolio_fit_label: "Concentration Risk",
          explanation_json: createPortfolioScoreExplanation({
            ruleId: "portfolio_fit.position_allocation",
            status: "warning",
            summary:
              "Position allocation is above the maximum single-stock threshold.",
          }),
          scored_at: "2026-06-07T10:00:00.000Z",
          symbol: "MSFT",
        },
      ],
      prices: [
        {
          close: "300",
          price_date: "2026-06-05",
          symbol: "MSFT",
        },
      ],
      stockScores: [
        {
          explanation_json: createStockScoreExplanation({
            ruleId: "valuation.pe_ratio",
            status: "fail",
            summary: "P/E exceeded the configured threshold.",
          }),
          overall_label: "Expensive",
          scored_at: "2026-06-07T09:00:00.000Z",
          symbol: "MSFT",
        },
      ],
      userRules: {
        max_debt_to_equity: "1",
        max_pb: "3",
        max_pe: "20",
        max_sector_allocation: "30",
        max_single_stock_allocation: "60",
        min_current_ratio: "1.5",
        min_margin_of_safety: "25",
      },
      watchlistItems: [],
    });

    expect(html).not.toContain("MSFT stock score changed");
    expect(html).not.toContain("MSFT stock rule outcome changed");
    expect(html).not.toContain("MSFT portfolio-fit score changed");
    expect(html).not.toContain("MSFT portfolio rule outcome changed");
  });

  it("renders an explicit review item when a target price cannot be compared without cached price data", async () => {
    const html = await renderDashboard({
      holdings: [],
      prices: [],
      stocks: [
        {
          currency: "USD",
          name: "Apple Inc.",
          sector: "Technology",
          symbol: "AAPL",
        },
      ],
      watchlistItems: [watchlistItem],
    });

    expect(html).toContain("AAPL target price needs cached price data");
    expect(html).toContain(
      "Target price is $180.00, but no usable latest cached price is available.",
    );
    expect(html).toContain(
      "The target-price rule cannot compare this watchlist item until cached price data exists.",
    );
    expect(html).toContain("not a buy instruction");
  });

  it("does not flag watchlist items for the target-price rule when no target price exists", async () => {
    const noTargetItem: WatchlistItemRow = {
      ...watchlistItem,
      id: "watchlist-no-target",
      target_price: null,
    };

    const html = await renderDashboard({
      holdings: [],
      prices: [
        {
          close: "150",
          price_date: "2026-06-19",
          symbol: "AAPL",
        },
      ],
      stockScores: [],
      watchlistItems: [noTargetItem],
    });

    expect(html).not.toContain("AAPL is at or below target");
    expect(html).not.toContain("AAPL target price needs cached price data");
    expect(html).toContain("Nothing is currently flagged for review");
  });

  it("represents missing price context on watchlist opportunity items", async () => {
    const noTargetItem: WatchlistItemRow = {
      ...watchlistItem,
      id: "watchlist-no-target",
      target_price: null,
    };

    const html = await renderDashboard({
      holdings: [],
      prices: [],
      stockScores: [
        {
          explanation_json: createStockScoreExplanation({
            ruleId: "valuation.margin_of_safety",
            status: "pass",
            summary:
              "Cached price is below the Graham Number with the required margin of safety.",
          }),
          overall_label: "Attractive",
          scored_at: "2026-06-07T09:00:00.000Z",
          symbol: "AAPL",
        },
      ],
      watchlistItems: [noTargetItem],
    });

    expect(html).toContain("AAPL watchlist opportunity");
    expect(html).toContain(
      "Latest deterministic stock label: Attractive. Margin of safety: unavailable.",
    );
    expect(html).toContain("Latest cached close: unavailable.");
    expect(html).toContain("Target price: not set.");
    expect(html).toContain("No usable latest cached close date is available.");
    expect(html).toContain("not a buy instruction");
  });

  it("uses stored single-stock allocation thresholds for review flags", async () => {
    const html = await renderDashboard({
      holdings: [holding],
      prices: [
        {
          close: "300",
          price_date: "2026-06-05",
          symbol: "MSFT",
        },
      ],
      userRules: {
        max_debt_to_equity: "1",
        max_pb: "3",
        max_pe: "20",
        max_sector_allocation: "30",
        max_single_stock_allocation: "20",
        min_current_ratio: "1.5",
        min_margin_of_safety: "25",
      },
    });

    expect(html).toContain("MSFT is above allocation threshold");
    expect(html).toContain(
      "MSFT is 37.5% of the portfolio, above the 20% single-stock allocation threshold from your current rule.",
    );
  });

  it("does not flag holdings at or below the single-stock allocation threshold", async () => {
    const html = await renderDashboard({
      cash: {
        amount: "400",
        currency: "USD",
        updated_at: "2026-06-06T12:00:00.000Z",
      },
      holdings: [holding],
      prices: [
        {
          close: "300",
          price_date: "2026-06-05",
          symbol: "MSFT",
        },
      ],
      userRules: {
        max_debt_to_equity: "1",
        max_pb: "3",
        max_pe: "20",
        max_sector_allocation: "30",
        max_single_stock_allocation: "60",
        min_current_ratio: "1.5",
        min_margin_of_safety: "25",
      },
      watchlistItems: [],
    });

    expect(html).not.toContain("MSFT is above allocation threshold");
    expect(html).toContain("Nothing is currently flagged for review");
  });

  it("renders an insufficient-data allocation item when prices are missing", async () => {
    const html = await renderDashboard({
      cash: {
        amount: "0",
        currency: "USD",
        updated_at: "2026-06-06T12:00:00.000Z",
      },
      holdings: [holding],
      prices: [],
      watchlistItems: [],
    });

    expect(html).toContain("MSFT allocation needs more data");
    expect(html).toContain(
      "Single-stock allocation could not be calculated against the 10% threshold.",
    );
    expect(html).toContain(
      "Cached price, holding value, cash, or portfolio denominator data is insufficient",
    );
    expect(html).not.toContain("MSFT is above allocation threshold");
  });

  it("renders a non-advisory empty review queue state", async () => {
    const html = await renderDashboard({
      holdings: [],
      stockScores: [],
      watchlistItems: [],
    });

    expect(html).toContain("Nothing is currently flagged for review");
    expect(html).toContain("not financial advice");
  });

  it("renders the AI take action and latest saved AI take", async () => {
    const html = await renderDashboard({
      aiTakes: [
        {
          created_at: "2026-06-17T14:30:00.000Z",
          input_snapshot_json: aiTakeSnapshot as unknown as Json,
          model: "gemini-3.5-flash",
          output_markdown:
            "Your deterministic rules suggest reviewing concentration.\n\nLimitations:\n- Educational context only.",
          provider: "gemini",
        },
      ],
    });

    expect(html).toContain("AI take");
    expect(html).toContain("Generate AI Take");
    expect(html).toContain("Your deterministic rules suggest");
    expect(html).toContain("gemini / gemini-3.5-flash");
    expect(html).toContain("Snapshot date");
    expect(html).toContain("Jun 5, 2026");
    expect(html).toContain("Educational explanation only, not financial advice.");
    expect(html).toContain("Underlying deterministic facts");
    expect(html).toContain("Portfolio snapshot includes 1 holding");
    expect(html).toContain("MSFT latest cached close is 300 USD");
  });

  it("renders the AI take empty state before generation", async () => {
    const html = await renderDashboard({
      aiTakes: [],
    });

    expect(html).toContain("No AI take has been generated for this portfolio yet.");
  });

  it("handles stored AI takes with unavailable snapshot facts", async () => {
    const html = await renderDashboard({
      aiTakes: [
        {
          created_at: "2026-06-17T14:30:00.000Z",
          input_snapshot_json: { legacy: true },
          model: "gemini-3.5-flash",
          output_markdown: "A legacy take is still readable.",
          provider: "gemini",
        },
      ],
    });

    expect(html).toContain("Snapshot metadata unavailable");
    expect(html).toContain(
      "Underlying deterministic facts are unavailable for this stored take.",
    );
  });

  it("escapes stored AI narrative output instead of rendering HTML", async () => {
    const html = await renderDashboard({
      aiTakes: [
        {
          created_at: "2026-06-17T14:30:00.000Z",
          input_snapshot_json: aiTakeSnapshot as unknown as Json,
          model: "gemini-3.5-flash",
          output_markdown: "Review only. <script>alert('xss')</script>",
          provider: "gemini",
        },
      ],
    });

    expect(html).toContain("&lt;script&gt;alert(&#x27;xss&#x27;)&lt;/script&gt;");
    expect(html).not.toContain("<script>alert");
  });

  it("renders dashboard feedback from AI take generation redirects", async () => {
    const html = await renderDashboard(
      {},
      {
        success: "AI take generated.",
      },
    );

    expect(html).toContain("AI take generated.");
  });
});

async function renderDashboard(
  fixture: DashboardFixture,
  searchParams?: { error?: string; success?: string },
) {
  vi.mocked(createClient).mockResolvedValue(createSupabaseFixture(fixture));
  vi.mocked(ensureDefaultPortfolioForUser).mockResolvedValue({
    portfolio: fixture.portfolio ?? portfolio,
  });

  return renderToStaticMarkup(
    await DashboardPage({
      searchParams: searchParams ? Promise.resolve(searchParams) : undefined,
    }),
  );
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
    limit() {
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

  if (table === "user_rules") {
    return result(fixture.userRules ?? null);
  }

  if (table === "alert_preferences") {
    return result(fixture.alertPreferences ?? null);
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

  if (table === "ai_takes") {
    return result(fixture.aiTakes ?? []);
  }

  return result(null);
}

function result<T>(data: T): QueryResult<T> {
  return {
    data,
    error: null,
  };
}

function createStockScoreExplanation({
  marginOfSafetyPercent,
  minMarginOfSafetyPercent,
  ruleId,
  status,
  summary,
}: {
  marginOfSafetyPercent?: number;
  minMarginOfSafetyPercent?: number;
  ruleId: string;
  status: string;
  summary: string;
}): Json {
  return {
    result: {
      layers: {
        valuation: {
          ruleChecks: [
            {
              explanation: {
                summary,
              },
              id: ruleId,
              status,
            },
          ],
        },
      },
    },
    schemaVersion: 1,
    ...(marginOfSafetyPercent === undefined
      ? {}
      : {
          input: {
            valuation: {
              marginOfSafetyPercent: {
                availability: "available",
                value: marginOfSafetyPercent,
              },
            },
          },
        }),
    ...(minMarginOfSafetyPercent === undefined
      ? {}
      : {
          thresholds: {
            minMarginOfSafetyPercent,
          },
        }),
  };
}

function createPortfolioScoreExplanation({
  ruleId,
  status,
  summary,
}: {
  ruleId: string;
  status: string;
  summary: string;
}): Json {
  return {
    result: {
      ruleChecks: [
        {
          explanation: {
            summary,
          },
          id: ruleId,
          status,
        },
      ],
    },
    schemaVersion: 1,
  };
}
