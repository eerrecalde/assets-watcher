import { describe, expect, it } from "vitest";

import {
  calculateCashAllocation,
  calculateHoldingValue,
  calculatePositionAllocation,
  calculateSectorAllocations,
} from "../portfolios/totals";
import {
  getLatestPortfolioScoreSnapshot,
  persistPortfolioScoreSnapshot,
  type PortfolioScoreSnapshotClient,
} from "./portfolio-score-snapshots";
import { scorePortfolioFit, type PortfolioFitScoringInput } from "./portfolio-fit";
import type { Database } from "@/types/supabase";

type PortfolioScoreInsert =
  Database["public"]["Tables"]["portfolio_stock_scores"]["Insert"];
type PortfolioScoreRow =
  Database["public"]["Tables"]["portfolio_stock_scores"]["Row"];

const SCORE_DATE = new Date("2026-06-15T12:00:00.000Z");
const PORTFOLIO_ID = "portfolio-1";

describe("persistPortfolioScoreSnapshot", () => {
  it("inserts label, warnings, scoring timestamp, and structured explanation JSON", async () => {
    const portfolioFitInput = createPortfolioFitInput({
      cashAmount: 50,
      holding: { latestClose: 100, quantity: 20, sector: "Technology" },
      otherHoldings: [
        { latestClose: 100, quantity: 25, sector: "Technology" },
        { latestClose: 100, quantity: 100, sector: "Healthcare" },
      ],
    });
    const scoringResult = scorePortfolioFit(portfolioFitInput);
    const client = createMockPortfolioScoreSnapshotClient();

    const result = await persistPortfolioScoreSnapshot(
      client,
      {
        portfolioFitInput,
        portfolioId: PORTFOLIO_ID,
        scoringResult,
        symbol: "aapl",
      },
      { currentDate: SCORE_DATE },
    );

    expect(result.ok).toBe(true);
    expect(client.insertedPortfolioScore).toMatchObject({
      allocation_warning:
        "Position allocation is above the maximum single-stock allocation threshold.",
      cash_warning: "Cash allocation is below the minimum cash allocation threshold.",
      portfolio_fit_label: "Do Not Add",
      portfolio_id: PORTFOLIO_ID,
      scored_at: "2026-06-15T12:00:00.000Z",
      sector_warning:
        "Sector allocation is above the maximum sector allocation threshold.",
      symbol: "AAPL",
    });
    expect(client.insertedPortfolioScore?.explanation_json).toMatchObject({
      input: {
        cashAllocation: expect.objectContaining({
          percentage: expect.any(Number),
        }),
      },
      result: {
        explanation: expect.objectContaining({
          warnings: expect.arrayContaining([
            expect.objectContaining({
              ruleId: "portfolio_fit.position_allocation",
            }),
          ]),
        }),
        ruleChecks: expect.arrayContaining([
          expect.objectContaining({
            id: "portfolio_fit.cash_allocation",
            measuredValue: expect.objectContaining({
              availability: "available",
            }),
          }),
        ]),
      },
      schemaVersion: 1,
    });
  });

  it("persists insufficient-data snapshots with rule-by-rule context", async () => {
    const portfolioFitInput = createPortfolioFitInput({
      holding: { latestClose: null, quantity: 30, sector: "Technology" },
      otherHoldings: [
        { latestClose: 50, quantity: 50, sector: "Healthcare" },
      ],
    });
    const scoringResult = scorePortfolioFit(portfolioFitInput);
    const client = createMockPortfolioScoreSnapshotClient();

    await persistPortfolioScoreSnapshot(
      client,
      {
        portfolioFitInput,
        portfolioId: PORTFOLIO_ID,
        scoringResult,
        symbol: "MSFT",
      },
      { currentDate: SCORE_DATE },
    );

    expect(client.insertedPortfolioScore).toMatchObject({
      allocation_warning:
        "Position allocation cannot be classified without a positive cached market value and portfolio denominator.",
      portfolio_fit_label: "Insufficient Data",
      symbol: "MSFT",
    });
    expect(client.insertedPortfolioScore?.explanation_json).toMatchObject({
      result: {
        ruleChecks: expect.arrayContaining([
          expect.objectContaining({
            id: "portfolio_fit.position_allocation",
            measuredValue: expect.objectContaining({
              availability: "insufficient",
            }),
            status: "insufficient_data",
          }),
        ]),
      },
    });
  });

  it("returns a write failure when snapshot persistence fails", async () => {
    const portfolioFitInput = createPortfolioFitInput();
    const scoringResult = scorePortfolioFit(portfolioFitInput);
    const client = createMockPortfolioScoreSnapshotClient({
      insertError: { message: "permission denied" },
    });

    const result = await persistPortfolioScoreSnapshot(
      client,
      {
        portfolioFitInput,
        portfolioId: PORTFOLIO_ID,
        scoringResult,
        symbol: "AAPL",
      },
      { currentDate: SCORE_DATE },
    );

    expect(result).toEqual({
      ok: false,
      error: {
        code: "snapshot_write_failed",
        message:
          "Could not persist portfolio score snapshot for AAPL: permission denied",
      },
    });
  });
});

describe("getLatestPortfolioScoreSnapshot", () => {
  it("retrieves the latest snapshot scoped by portfolio and symbol", async () => {
    const snapshot = createPortfolioScoreRow({
      portfolio_fit_label: "Balanced",
      scored_at: "2026-06-15T12:00:00.000Z",
      symbol: "AAPL",
    });
    const client = createMockPortfolioScoreSnapshotClient({
      snapshots: [snapshot],
    });

    const result = await getLatestPortfolioScoreSnapshot(client, {
      portfolioId: PORTFOLIO_ID,
      symbol: "aapl",
    });

    expect(result).toEqual({
      ok: true,
      snapshot,
    });
    expect(client.selectFilters).toEqual([
      ["portfolio_id", PORTFOLIO_ID],
      ["symbol", "AAPL"],
    ]);
    expect(client.ordering).toEqual({
      ascending: false,
      column: "scored_at",
    });
  });

  it("returns null when no scoped snapshot exists", async () => {
    const client = createMockPortfolioScoreSnapshotClient({ snapshots: [] });

    const result = await getLatestPortfolioScoreSnapshot(client, {
      portfolioId: PORTFOLIO_ID,
      symbol: "MSFT",
    });

    expect(result).toEqual({
      ok: true,
      snapshot: null,
    });
  });

  it("returns a read failure when retrieval fails", async () => {
    const client = createMockPortfolioScoreSnapshotClient({
      selectError: { message: "permission denied" },
    });

    const result = await getLatestPortfolioScoreSnapshot(client, {
      portfolioId: PORTFOLIO_ID,
      symbol: "AAPL",
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "snapshot_read_failed",
        message:
          "Could not read portfolio score snapshot for AAPL: permission denied",
      },
    });
  });
});

function createPortfolioFitInput({
  cashAmount = 500,
  holding = { latestClose: 10, quantity: 30, sector: "Technology" },
  otherHoldings = [
    { latestClose: 50, quantity: 50, sector: "Healthcare" },
    { latestClose: 40, quantity: 50, sector: "Industrials" },
  ],
}: {
  cashAmount?: number | string | null;
  holding?: {
    latestClose: number | string | null;
    quantity: number | string;
    sector: string | null;
  };
  otherHoldings?: {
    latestClose: number | string | null;
    quantity: number | string;
    sector: string | null;
  }[];
} = {}): PortfolioFitScoringInput {
  const holdings = [holding, ...otherHoldings].map((portfolioHolding) => ({
    ...calculateHoldingValue({
      averageCost: "10",
      latestClose: portfolioHolding.latestClose,
      quantity: portfolioHolding.quantity,
    }),
    sector: portfolioHolding.sector,
  }));
  const sectorAllocations = calculateSectorAllocations({
    cashAmountInput: cashAmount,
    holdings,
  });
  const sectorAllocation =
    sectorAllocations.find((allocation) => allocation.sector === holding.sector) ??
    sectorAllocations.find((allocation) => allocation.isUnknownSector) ??
    null;

  return {
    cashAllocation: calculateCashAllocation({
      cashAmountInput: cashAmount,
      holdings,
    }),
    positionAllocation: calculatePositionAllocation({
      cashAmountInput: cashAmount,
      holding: holdings[0],
      holdings,
    }),
    sectorAllocation,
  };
}

function createMockPortfolioScoreSnapshotClient({
  insertError = null,
  selectError = null,
  snapshots = [],
}: {
  insertError?: { message: string } | null;
  selectError?: { message: string } | null;
  snapshots?: PortfolioScoreRow[];
} = {}) {
  const state: {
    insertedPortfolioScore: PortfolioScoreInsert | null;
    ordering: { ascending: boolean; column: string } | null;
    selectFilters: [string, string][];
  } = {
    insertedPortfolioScore: null,
    ordering: null,
    selectFilters: [],
  };
  const client = {
    get insertedPortfolioScore() {
      return state.insertedPortfolioScore;
    },
    get ordering() {
      return state.ordering;
    },
    get selectFilters() {
      return state.selectFilters;
    },
    from(table: "portfolio_stock_scores") {
      if (table !== "portfolio_stock_scores") {
        throw new Error(`Unexpected table: ${table}`);
      }

      return {
        insert(values: PortfolioScoreInsert) {
          state.insertedPortfolioScore = values;

          return {
            select: () => ({
              single: async () => {
                if (insertError) {
                  return { data: null, error: insertError };
                }

                return {
                  data: createPortfolioScoreRow(values),
                  error: null,
                };
              },
            }),
          };
        },
        select: () => {
          const query = {
            eq(column: string, value: string) {
              state.selectFilters.push([column, value]);

              return query;
            },
            limit: async () => ({ data: snapshots, error: selectError }),
            order(column: string, options: { ascending: boolean }) {
              state.ordering = { column, ascending: options.ascending };

              return query;
            },
          };

          return query;
        },
      };
    },
  };

  return client as PortfolioScoreSnapshotClient & {
    insertedPortfolioScore: PortfolioScoreInsert | null;
    ordering: { ascending: boolean; column: string } | null;
    selectFilters: [string, string][];
  };
}

function createPortfolioScoreRow(
  values: Partial<PortfolioScoreRow> & Partial<PortfolioScoreInsert> = {},
): PortfolioScoreRow {
  return {
    allocation_warning: values.allocation_warning ?? null,
    cash_warning: values.cash_warning ?? null,
    explanation_json: values.explanation_json ?? {},
    id: values.id ?? "portfolio-score-snapshot-id",
    portfolio_fit_label: values.portfolio_fit_label ?? "Review Position",
    portfolio_id: values.portfolio_id ?? PORTFOLIO_ID,
    scored_at: values.scored_at ?? SCORE_DATE.toISOString(),
    sector_warning: values.sector_warning ?? null,
    symbol: values.symbol ?? "AAPL",
  };
}
