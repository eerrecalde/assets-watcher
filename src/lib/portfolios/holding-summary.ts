import {
  calculateHoldingValue,
  calculatePositionAllocation,
  type CalculatedHoldingValue,
  type NumericInput,
  type PositionAllocationResult,
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
  positionAllocation: PositionAllocationResult;
  portfolioPercentage: number | null;
  status: "owned";
};

export type UserHoldingSummary =
  | NotOwnedHoldingSummary
  | OwnedHoldingSummary;

export function buildUserHoldingSummary({
  cashAmount,
  holding,
  portfolioHoldings,
}: {
  cashAmount: NumericInput;
  holding: HoldingSummaryInput | null;
  portfolioHoldings: CalculatedHoldingValue[];
}): UserHoldingSummary {
  if (!holding) {
    return { status: "not-owned" };
  }

  const calculatedValue = calculateHoldingValue(holding);
  const positionAllocation = calculatePositionAllocation({
    cashAmountInput: cashAmount,
    holding: calculatedValue,
    holdings: portfolioHoldings,
  });

  return {
    ...calculatedValue,
    currency: holding.currency,
    hasSufficientPriceData: calculatedValue.marketValue !== null,
    latestPriceDate: holding.latestPriceDate ?? null,
    positionAllocation,
    portfolioPercentage: positionAllocation.percentage,
    status: "owned",
  };
}
