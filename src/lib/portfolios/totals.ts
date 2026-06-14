export type NumericInput = number | string | null | undefined;

export type PortfolioHoldingInput = {
  averageCost: NumericInput;
  latestClose?: NumericInput;
  quantity: NumericInput;
};

export type CalculatedHoldingValue = {
  averageCost: number;
  costBasis: number;
  latestClose: number | null;
  marketValue: number | null;
  portfolioValue: number;
  quantity: number;
  unrealizedGain: number | null;
};

export type PortfolioTotals = {
  cashAmount: number;
  costBasisTotal: number;
  hasCachedMarketValues: boolean;
  holdingsValueTotal: number;
  marketValueTotal: number;
  totalPortfolioValue: number;
  unrealizedTotal: number;
};

export type PositionAllocationStatus =
  | "calculated"
  | "partial-market-data"
  | "insufficient-data";

export type PositionAllocationReason =
  | "calculated_from_cached_market_values_and_cash"
  | "calculated_from_partial_cached_market_values_and_cash"
  | "invalid_portfolio_inputs"
  | "missing_cached_market_value"
  | "non_positive_allocation_denominator"
  | "non_positive_holding_market_value";

export type PositionAllocationCashStatus = "included" | "zero" | "invalid";

export type PositionAllocationResult = {
  cashAmount: number;
  cashStatus: PositionAllocationCashStatus;
  denominatorValue: number;
  includesCash: boolean;
  invalidMarketValueCount: number;
  missingMarketValueCount: number;
  numeratorMarketValue: number | null;
  percentage: number | null;
  pricedHoldingCount: number;
  reason: PositionAllocationReason;
  status: PositionAllocationStatus;
  totalHoldingCount: number;
};

export function toFiniteNumber(value: NumericInput) {
  if (value === null || value === undefined) {
    return null;
  }

  const numericValue = Number(value);

  return Number.isFinite(numericValue) ? numericValue : null;
}

export function calculateHoldingValue(
  holding: PortfolioHoldingInput,
): CalculatedHoldingValue {
  const quantity = toFiniteNumber(holding.quantity) ?? 0;
  const averageCost = toFiniteNumber(holding.averageCost) ?? 0;
  const latestClose = toFiniteNumber(holding.latestClose);
  const costBasis = quantity * averageCost;
  const marketValue = latestClose === null ? null : quantity * latestClose;

  return {
    averageCost,
    costBasis,
    latestClose,
    marketValue,
    portfolioValue: marketValue ?? costBasis,
    quantity,
    unrealizedGain: marketValue === null ? null : marketValue - costBasis,
  };
}

export function calculatePortfolioTotals(
  holdings: CalculatedHoldingValue[],
  cashAmountInput: NumericInput,
): PortfolioTotals {
  const cashAmount = toFiniteNumber(cashAmountInput) ?? 0;
  const costBasisTotal = holdings.reduce(
    (total, holding) => total + holding.costBasis,
    0,
  );
  const marketValueTotal = holdings.reduce(
    (total, holding) => total + (holding.marketValue ?? 0),
    0,
  );
  const holdingsValueTotal = holdings.reduce(
    (total, holding) => total + holding.portfolioValue,
    0,
  );
  const unrealizedTotal = holdings.reduce(
    (total, holding) => total + (holding.unrealizedGain ?? 0),
    0,
  );

  return {
    cashAmount,
    costBasisTotal,
    hasCachedMarketValues: holdings.some(
      (holding) => holding.marketValue !== null,
    ),
    holdingsValueTotal,
    marketValueTotal,
    totalPortfolioValue: holdingsValueTotal + cashAmount,
    unrealizedTotal,
  };
}

export function calculatePositionAllocation({
  cashAmountInput,
  holding,
  holdings,
}: {
  cashAmountInput: NumericInput;
  holding: CalculatedHoldingValue;
  holdings: CalculatedHoldingValue[];
}): PositionAllocationResult {
  const cashAmount = toFiniteNumber(cashAmountInput) ?? 0;
  const cashStatus: PositionAllocationCashStatus =
    cashAmount < 0 ? "invalid" : cashAmount > 0 ? "included" : "zero";
  const validCashAmount = cashStatus === "included" ? cashAmount : 0;
  const pricedHoldings = holdings.filter(
    (portfolioHolding) =>
      portfolioHolding.marketValue !== null && portfolioHolding.marketValue > 0,
  );
  const missingMarketValueCount = holdings.filter(
    (portfolioHolding) => portfolioHolding.marketValue === null,
  ).length;
  const invalidMarketValueCount = holdings.filter(
    (portfolioHolding) =>
      portfolioHolding.marketValue !== null && portfolioHolding.marketValue <= 0,
  ).length;
  const denominatorValue =
    pricedHoldings.reduce(
      (total, portfolioHolding) => total + (portfolioHolding.marketValue ?? 0),
      0,
    ) + validCashAmount;
  const baseResult = {
    cashAmount,
    cashStatus,
    denominatorValue,
    includesCash: cashStatus === "included",
    invalidMarketValueCount,
    missingMarketValueCount,
    numeratorMarketValue: holding.marketValue,
    percentage: null,
    pricedHoldingCount: pricedHoldings.length,
    totalHoldingCount: holdings.length,
  } satisfies Omit<
    PositionAllocationResult,
    "reason" | "status"
  >;

  if (holding.marketValue === null) {
    return {
      ...baseResult,
      reason: "missing_cached_market_value",
      status: "insufficient-data",
    };
  }

  if (holding.marketValue <= 0) {
    return {
      ...baseResult,
      reason: "non_positive_holding_market_value",
      status: "insufficient-data",
    };
  }

  if (denominatorValue <= 0) {
    return {
      ...baseResult,
      reason: "non_positive_allocation_denominator",
      status: "insufficient-data",
    };
  }

  const hasPartialMarketData = missingMarketValueCount > 0;
  const hasInvalidPortfolioInputs =
    invalidMarketValueCount > 0 || cashStatus === "invalid";

  return {
    ...baseResult,
    percentage: (holding.marketValue / denominatorValue) * 100,
    reason: hasInvalidPortfolioInputs
      ? "invalid_portfolio_inputs"
      : hasPartialMarketData
        ? "calculated_from_partial_cached_market_values_and_cash"
        : "calculated_from_cached_market_values_and_cash",
    status:
      hasPartialMarketData || hasInvalidPortfolioInputs
        ? "partial-market-data"
        : "calculated",
  };
}
