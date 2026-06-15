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

export const UNKNOWN_SECTOR_NAME = "Unknown / Insufficient Data";

export type SectorAllocationHoldingInput = Pick<
  CalculatedHoldingValue,
  "marketValue"
> & {
  sector?: string | null;
};

export type SectorAllocationStatus = PositionAllocationStatus;

export type SectorAllocationReason =
  | "calculated_from_cached_market_values_and_cash"
  | "calculated_from_partial_cached_market_values_and_cash"
  | "invalid_portfolio_inputs"
  | "missing_cached_market_value"
  | "non_positive_allocation_denominator"
  | "non_positive_sector_market_value";

export type SectorAllocationResult = {
  cashAmount: number;
  cashStatus: PositionAllocationCashStatus;
  denominatorValue: number;
  holdingCount: number;
  includesCash: boolean;
  invalidMarketValueCount: number;
  isUnknownSector: boolean;
  missingMarketValueCount: number;
  numeratorMarketValue: number;
  percentage: number | null;
  pricedHoldingCount: number;
  reason: SectorAllocationReason;
  sector: string;
  status: SectorAllocationStatus;
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

function getAllocationDenominatorContext(
  holdings: Pick<CalculatedHoldingValue, "marketValue">[],
  cashAmountInput: NumericInput,
) {
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

  return {
    cashAmount,
    cashStatus,
    denominatorValue,
    includesCash: cashStatus === "included",
    invalidMarketValueCount,
    missingMarketValueCount,
    pricedHoldingCount: pricedHoldings.length,
    totalHoldingCount: holdings.length,
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
  const allocationContext = getAllocationDenominatorContext(
    holdings,
    cashAmountInput,
  );
  const baseResult = {
    ...allocationContext,
    numeratorMarketValue: holding.marketValue,
    percentage: null,
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

  if (allocationContext.denominatorValue <= 0) {
    return {
      ...baseResult,
      reason: "non_positive_allocation_denominator",
      status: "insufficient-data",
    };
  }

  const hasPartialMarketData = allocationContext.missingMarketValueCount > 0;
  const hasInvalidPortfolioInputs =
    allocationContext.invalidMarketValueCount > 0 ||
    allocationContext.cashStatus === "invalid";

  return {
    ...baseResult,
    percentage: (holding.marketValue / allocationContext.denominatorValue) * 100,
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

function normalizeSectorName(sector: string | null | undefined) {
  const trimmedSector = sector?.trim();

  return trimmedSector ? trimmedSector : UNKNOWN_SECTOR_NAME;
}

export function calculateSectorAllocations({
  cashAmountInput,
  holdings,
}: {
  cashAmountInput: NumericInput;
  holdings: SectorAllocationHoldingInput[];
}): SectorAllocationResult[] {
  const allocationContext = getAllocationDenominatorContext(
    holdings,
    cashAmountInput,
  );
  const sectors = new Map<
    string,
    {
      holdingCount: number;
      invalidMarketValueCount: number;
      isUnknownSector: boolean;
      missingMarketValueCount: number;
      numeratorMarketValue: number;
      pricedHoldingCount: number;
      sector: string;
    }
  >();

  for (const holding of holdings) {
    const sector = normalizeSectorName(holding.sector);
    const sectorKey = sector.toLowerCase();
    const existingSector = sectors.get(sectorKey) ?? {
      holdingCount: 0,
      invalidMarketValueCount: 0,
      isUnknownSector: sector === UNKNOWN_SECTOR_NAME,
      missingMarketValueCount: 0,
      numeratorMarketValue: 0,
      pricedHoldingCount: 0,
      sector,
    };

    existingSector.holdingCount += 1;

    if (holding.marketValue === null) {
      existingSector.missingMarketValueCount += 1;
    } else if (holding.marketValue <= 0) {
      existingSector.invalidMarketValueCount += 1;
    } else {
      existingSector.numeratorMarketValue += holding.marketValue;
      existingSector.pricedHoldingCount += 1;
    }

    sectors.set(sectorKey, existingSector);
  }

  const hasPartialMarketData = allocationContext.missingMarketValueCount > 0;
  const hasInvalidPortfolioInputs =
    allocationContext.invalidMarketValueCount > 0 ||
    allocationContext.cashStatus === "invalid";

  return Array.from(sectors.values())
    .map((sector): SectorAllocationResult => {
      const baseResult = {
        ...allocationContext,
        holdingCount: sector.holdingCount,
        invalidMarketValueCount: sector.invalidMarketValueCount,
        isUnknownSector: sector.isUnknownSector,
        missingMarketValueCount: sector.missingMarketValueCount,
        numeratorMarketValue: sector.numeratorMarketValue,
        percentage: null,
        pricedHoldingCount: sector.pricedHoldingCount,
        sector: sector.sector,
      } satisfies Omit<SectorAllocationResult, "reason" | "status">;

      if (sector.numeratorMarketValue <= 0) {
        return {
          ...baseResult,
          reason:
            sector.invalidMarketValueCount > 0
              ? "non_positive_sector_market_value"
              : sector.missingMarketValueCount > 0
                ? "missing_cached_market_value"
                : "non_positive_sector_market_value",
          status: "insufficient-data",
        };
      }

      if (allocationContext.denominatorValue <= 0) {
        return {
          ...baseResult,
          reason: "non_positive_allocation_denominator",
          status: "insufficient-data",
        };
      }

      return {
        ...baseResult,
        percentage:
          (sector.numeratorMarketValue / allocationContext.denominatorValue) *
          100,
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
    })
    .sort((firstSector, secondSector) => {
      const marketValueDifference =
        secondSector.numeratorMarketValue - firstSector.numeratorMarketValue;

      if (marketValueDifference !== 0) {
        return marketValueDifference;
      }

      return firstSector.sector.localeCompare(secondSector.sector);
    });
}
