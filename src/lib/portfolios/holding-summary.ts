import {
  calculateHoldingValue,
  type CalculatedHoldingValue,
  type NumericInput,
} from "./totals";

export type HoldingSummaryInput = {
  averageCost: NumericInput;
  currency: string;
  latestClose?: NumericInput;
  latestPriceDate?: string | null;
  quantity: NumericInput;
};

export type NotOwnedHoldingSummary = {
  status: "not-owned";
};

export type OwnedHoldingSummary = CalculatedHoldingValue & {
  currency: string;
  hasSufficientPriceData: boolean;
  latestPriceDate: string | null;
  portfolioPercentage: number | null;
  status: "owned";
};

export type UserHoldingSummary =
  | NotOwnedHoldingSummary
  | OwnedHoldingSummary;

export function buildUserHoldingSummary({
  holding,
  totalPortfolioValue,
}: {
  holding: HoldingSummaryInput | null;
  totalPortfolioValue: NumericInput;
}): UserHoldingSummary {
  if (!holding) {
    return { status: "not-owned" };
  }

  const calculatedValue = calculateHoldingValue(holding);
  const totalValue = Number(totalPortfolioValue);
  const portfolioPercentage =
    calculatedValue.marketValue !== null &&
    Number.isFinite(totalValue) &&
    totalValue > 0
      ? (calculatedValue.marketValue / totalValue) * 100
      : null;

  return {
    ...calculatedValue,
    currency: holding.currency,
    hasSufficientPriceData: calculatedValue.marketValue !== null,
    latestPriceDate: holding.latestPriceDate ?? null,
    portfolioPercentage,
    status: "owned",
  };
}
