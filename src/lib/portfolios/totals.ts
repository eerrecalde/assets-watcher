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
