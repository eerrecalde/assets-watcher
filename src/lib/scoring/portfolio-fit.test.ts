import { describe, expect, it } from "vitest";

import {
  calculateCashAllocation,
  calculateHoldingValue,
  calculatePositionAllocation,
  calculateSectorAllocations,
} from "../portfolios/totals";
import { DEFAULT_GRAHAM_SCORING_THRESHOLDS } from "./thresholds";
import { scorePortfolioFit } from "./portfolio-fit";

function createPortfolioFitInput({
  cashAmount = 500,
  holding = { latestClose: 10, quantity: 5, sector: "Technology" },
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
} = {}) {
  const holdings = [holding, ...otherHoldings].map((portfolioHolding) => ({
    ...calculateHoldingValue({
      averageCost: "10",
      latestClose: portfolioHolding.latestClose,
      quantity: portfolioHolding.quantity,
    }),
    sector: portfolioHolding.sector,
  }));
  const positionAllocation = calculatePositionAllocation({
    cashAmountInput: cashAmount,
    holding: holdings[0],
    holdings,
  });
  const sectorAllocation =
    calculateSectorAllocations({
      cashAmountInput: cashAmount,
      holdings,
    }).find((allocation) => allocation.sector === (holding.sector ?? "")) ??
    calculateSectorAllocations({
      cashAmountInput: cashAmount,
      holdings,
    }).find((allocation) => allocation.isUnknownSector) ??
    null;
  const cashAllocation = calculateCashAllocation({
    cashAmountInput: cashAmount,
    holdings,
  });

  return {
    cashAllocation,
    positionAllocation,
    sectorAllocation,
  };
}

describe("scorePortfolioFit", () => {
  it("labels a small position as underweight when sector and cash thresholds pass", () => {
    const result = scorePortfolioFit(createPortfolioFitInput());

    expect(result).toMatchObject({
      label: "Underweight",
      status: "classified",
    });
    expect(result.explanation.summary).toContain("below 5%");
    expect(result.explanation.warnings).toEqual([
      expect.objectContaining({
        ruleId: "portfolio_fit.position_allocation",
        status: "warning",
      }),
    ]);
  });

  it("labels allocations as balanced when position, sector, and cash checks pass", () => {
    const result = scorePortfolioFit(
      createPortfolioFitInput({
        cashAmount: 500,
        holding: { latestClose: 10, quantity: 30, sector: "Technology" },
        otherHoldings: [
          { latestClose: 50, quantity: 50, sector: "Healthcare" },
          { latestClose: 40, quantity: 50, sector: "Industrials" },
        ],
      }),
    );

    expect(result).toMatchObject({
      label: "Balanced",
      status: "classified",
    });
    expect(result.explanation.warnings).toEqual([]);
    expect(result.ruleChecks).toEqual([
      expect.objectContaining({
        id: "portfolio_fit.position_allocation",
        status: "pass",
      }),
      expect.objectContaining({
        id: "portfolio_fit.sector_allocation",
        status: "pass",
      }),
      expect.objectContaining({
        id: "portfolio_fit.cash_allocation",
        status: "pass",
      }),
      expect.objectContaining({
        id: "portfolio_fit.data_coverage",
        status: "pass",
      }),
    ]);
  });

  it("labels single-stock allocation above the threshold as overweight", () => {
    const result = scorePortfolioFit(
      createPortfolioFitInput({
        cashAmount: 500,
        holding: { latestClose: 100, quantity: 10, sector: "Technology" },
        otherHoldings: [
          { latestClose: 50, quantity: 50, sector: "Healthcare" },
          { latestClose: 40, quantity: 50, sector: "Industrials" },
        ],
      }),
    );

    expect(result.label).toBe("Overweight");
    expect(result.explanation.dominantRules).toEqual([
      expect.objectContaining({
        ruleId: "portfolio_fit.position_allocation",
        status: "fail",
      }),
    ]);
  });

  it("labels sector allocation above the threshold as concentration risk", () => {
    const result = scorePortfolioFit(
      createPortfolioFitInput({
        cashAmount: 500,
        holding: { latestClose: 100, quantity: 5, sector: "Technology" },
        otherHoldings: [
          { latestClose: 40, quantity: 50, sector: "Technology" },
          { latestClose: 100, quantity: 50, sector: "Healthcare" },
        ],
      }),
    );

    expect(result.label).toBe("Concentration Risk");
    expect(result.explanation.warnings).toContainEqual(
      expect.objectContaining({
        ruleId: "portfolio_fit.sector_allocation",
        status: "fail",
      }),
    );
  });

  it("labels low cash allocation as cash constrained", () => {
    const result = scorePortfolioFit(
      createPortfolioFitInput({
        cashAmount: 50,
        holding: { latestClose: 10, quantity: 30, sector: "Technology" },
        otherHoldings: [
          { latestClose: 50, quantity: 50, sector: "Healthcare" },
          { latestClose: 40, quantity: 50, sector: "Industrials" },
        ],
      }),
    );

    expect(result.label).toBe("Cash Constrained");
    expect(result.explanation.warnings).toContainEqual(
      expect.objectContaining({
        ruleId: "portfolio_fit.cash_allocation",
        status: "warning",
      }),
    );
  });

  it("labels compound threshold failures as do not add without buy or sell language", () => {
    const result = scorePortfolioFit(
      createPortfolioFitInput({
        cashAmount: 100,
        holding: { latestClose: 100, quantity: 20, sector: "Technology" },
        otherHoldings: [
          { latestClose: 100, quantity: 25, sector: "Technology" },
          { latestClose: 100, quantity: 100, sector: "Healthcare" },
        ],
      }),
    );

    expect(result.label).toBe("Do Not Add");
    expect(
      [
        result.explanation.summary,
        result.explanation.caution,
        ...result.explanation.warnings.flatMap((warning) => [
          warning.summary,
          warning.detail ?? "",
        ]),
      ].join(" "),
    ).not.toMatch(/\b(buy|sell)\b/i);
  });

  it("labels otherwise classified partial market data as review position", () => {
    const result = scorePortfolioFit(
      createPortfolioFitInput({
        cashAmount: 500,
        holding: { latestClose: 10, quantity: 30, sector: "Technology" },
        otherHoldings: [
          { latestClose: 50, quantity: 50, sector: "Healthcare" },
          { latestClose: null, quantity: 50, sector: "Industrials" },
        ],
      }),
    );

    expect(result.label).toBe("Review Position");
    expect(result.explanation.warnings).toContainEqual(
      expect.objectContaining({
        ruleId: "portfolio_fit.data_coverage",
        status: "warning",
      }),
    );
  });

  it("uses insufficient data when required allocation inputs are unavailable", () => {
    const result = scorePortfolioFit(
      createPortfolioFitInput({
        cashAmount: 500,
        holding: { latestClose: null, quantity: 30, sector: "Technology" },
        otherHoldings: [
          { latestClose: 50, quantity: 50, sector: "Healthcare" },
        ],
      }),
    );

    expect(result).toMatchObject({
      label: "Insufficient Data",
      status: "insufficient_data",
    });
    expect(result.explanation.warnings).toContainEqual(
      expect.objectContaining({
        ruleId: "portfolio_fit.position_allocation",
        status: "insufficient_data",
      }),
    );
  });

  it("uses insufficient data when sector metadata is unknown", () => {
    const result = scorePortfolioFit(
      createPortfolioFitInput({
        cashAmount: 500,
        holding: { latestClose: 10, quantity: 30, sector: null },
        otherHoldings: [
          { latestClose: 50, quantity: 50, sector: "Healthcare" },
        ],
      }),
    );

    expect(result.label).toBe("Insufficient Data");
    expect(result.explanation.warnings).toContainEqual(
      expect.objectContaining({
        ruleId: "portfolio_fit.sector_allocation",
        status: "insufficient_data",
      }),
    );
  });

  it("allows portfolio-fit thresholds to be overridden", () => {
    const result = scorePortfolioFit(createPortfolioFitInput(), {
      thresholds: {
        ...DEFAULT_GRAHAM_SCORING_THRESHOLDS,
        maxSingleStockAllocationPercent: 0.5,
      },
    });

    expect(result.label).toBe("Overweight");
  });
});
