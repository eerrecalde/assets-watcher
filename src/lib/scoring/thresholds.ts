import type { PortfolioFitLabel, StockScoreLabel } from "./types";

export type GrahamScoringThresholds = {
  maxDebtToEquity: number;
  maxPb: number;
  maxPe: number;
  maxSectorAllocationPercent: number;
  maxSingleStockAllocationPercent: number;
  minCurrentRatio: number;
  minMarginOfSafetyPercent: number;
};

export const DEFAULT_GRAHAM_SCORING_THRESHOLDS: GrahamScoringThresholds = {
  maxDebtToEquity: 1,
  maxPb: 3,
  maxPe: 20,
  maxSectorAllocationPercent: 30,
  maxSingleStockAllocationPercent: 10,
  minCurrentRatio: 1.5,
  minMarginOfSafetyPercent: 25,
};

export const STOCK_SCORE_LABELS = [
  "Attractive",
  "Reasonable",
  "Watch",
  "Expensive",
  "Avoid / Review",
  "Insufficient Data",
] as const satisfies readonly StockScoreLabel[];

export const PORTFOLIO_FIT_LABELS = [
  "Underweight",
  "Balanced",
  "Overweight",
  "Concentration Risk",
  "Cash Constrained",
  "Do Not Add",
  "Review Position",
] as const satisfies readonly PortfolioFitLabel[];

export const SCORING_LANGUAGE_GUIDANCE = {
  caution:
    "Scoring explains deterministic checks from cached data and is not financial advice.",
  disallowedDirectiveTerms: ["buy", "sell"] as const,
};
