import type {
  CashAllocationResult,
  PositionAllocationResult,
  SectorAllocationResult,
} from "../portfolios/totals";
import {
  DEFAULT_GRAHAM_SCORING_THRESHOLDS,
  type GrahamScoringThresholds,
} from "./thresholds";
import type {
  PortfolioFitLabel,
  RuleCheckResult,
  RuleCheckStatus,
  RuleThreshold,
  ScoringDataPoint,
} from "./types";

export type PortfolioFitScoringInput = {
  cashAllocation: CashAllocationResult;
  positionAllocation: PositionAllocationResult;
  sectorAllocation: SectorAllocationResult | null;
};

export type PortfolioFitStatus = "classified" | "insufficient_data";

export type PortfolioFitWarning = {
  detail?: string;
  ruleId: string;
  status: RuleCheckStatus;
  summary: string;
};

export type PortfolioFitReason = PortfolioFitWarning;

export type PortfolioFitScoringExplanation = {
  caution: string;
  dominantRules: PortfolioFitReason[];
  summary: string;
  warnings: PortfolioFitWarning[];
};

export type PortfolioFitScoringResult = {
  explanation: PortfolioFitScoringExplanation;
  label: PortfolioFitLabel;
  ruleChecks: RuleCheckResult[];
  status: PortfolioFitStatus;
};

export type ScorePortfolioFitOptions = {
  thresholds?: GrahamScoringThresholds;
};

const CAUTION_COPY =
  "Portfolio fit explains deterministic allocation checks for educational review and is not financial advice.";
const UNDERWEIGHT_THRESHOLD_RATIO = 0.5;
const MAX_DOMINANT_RULES = 4;

export function scorePortfolioFit(
  input: PortfolioFitScoringInput,
  {
    thresholds = DEFAULT_GRAHAM_SCORING_THRESHOLDS,
  }: ScorePortfolioFitOptions = {},
): PortfolioFitScoringResult {
  const ruleChecks = createPortfolioFitRuleChecks(input, thresholds);
  const label = choosePortfolioFitLabel(ruleChecks, thresholds);
  const status: PortfolioFitStatus =
    label === "Insufficient Data" ? "insufficient_data" : "classified";

  return {
    explanation: {
      caution: CAUTION_COPY,
      dominantRules: selectDominantRules(label, ruleChecks),
      summary: createPortfolioFitSummary(label, ruleChecks, thresholds),
      warnings: createPortfolioFitWarnings(ruleChecks),
    },
    label,
    ruleChecks,
    status,
  };
}

function createPortfolioFitRuleChecks(
  input: PortfolioFitScoringInput,
  thresholds: GrahamScoringThresholds,
) {
  return [
    createPositionAllocationRuleCheck(
      input.positionAllocation,
      thresholds.maxSingleStockAllocationPercent,
    ),
    createSectorAllocationRuleCheck(
      input.sectorAllocation,
      thresholds.maxSectorAllocationPercent,
    ),
    createCashAllocationRuleCheck(
      input.cashAllocation,
      thresholds.minCashAllocationPercent,
    ),
    createPortfolioDataCoverageRuleCheck(input),
  ] satisfies RuleCheckResult[];
}

function createPositionAllocationRuleCheck(
  allocation: PositionAllocationResult,
  thresholdValue: number,
): RuleCheckResult {
  const threshold = {
    label: "Maximum single-stock allocation",
    operator: "below_or_equal",
    unit: "percent",
    value: thresholdValue,
  } satisfies RuleThreshold;

  if (allocation.percentage === null) {
    return {
      id: "portfolio_fit.position_allocation",
      explanation: {
        detail: formatAllocationReason(allocation.reason),
        summary:
          "Position allocation cannot be classified without a positive cached market value and portfolio denominator.",
      },
      measuredValue: insufficientAllocationDataPoint(
        "Position allocation is unavailable from the current portfolio context.",
      ),
      status: "insufficient_data",
      threshold,
    };
  }

  if (allocation.percentage > thresholdValue) {
    return {
      id: "portfolio_fit.position_allocation",
      explanation: {
        detail: `Position allocation is ${formatPercent(allocation.percentage)} against a ${formatPercent(thresholdValue)} maximum.`,
        summary:
          "Position allocation is above the maximum single-stock allocation threshold.",
      },
      measuredValue: availableAllocationDataPoint(allocation.percentage),
      status: "fail",
      threshold,
    };
  }

  const underweightThreshold = getUnderweightThreshold(thresholdValue);

  if (allocation.percentage < underweightThreshold) {
    return {
      id: "portfolio_fit.position_allocation",
      explanation: {
        detail: `Position allocation is ${formatPercent(allocation.percentage)}; the underweight review point is below ${formatPercent(underweightThreshold)}.`,
        summary:
          "Position allocation is below the underweight review point derived from the maximum single-stock threshold.",
      },
      measuredValue: availableAllocationDataPoint(allocation.percentage),
      status: "warning",
      threshold,
    };
  }

  return {
    id: "portfolio_fit.position_allocation",
    explanation: {
      detail: `Position allocation is ${formatPercent(allocation.percentage)} against a ${formatPercent(thresholdValue)} maximum.`,
      summary:
        "Position allocation is within the maximum single-stock allocation threshold.",
    },
    measuredValue: availableAllocationDataPoint(allocation.percentage),
    status: "pass",
    threshold,
  };
}

function createSectorAllocationRuleCheck(
  allocation: SectorAllocationResult | null,
  thresholdValue: number,
): RuleCheckResult {
  const threshold = {
    label: "Maximum sector allocation",
    operator: "below_or_equal",
    unit: "percent",
    value: thresholdValue,
  } satisfies RuleThreshold;

  if (allocation === null) {
    return {
      id: "portfolio_fit.sector_allocation",
      explanation: {
        summary:
          "Sector allocation cannot be classified because no sector allocation input was provided.",
      },
      measuredValue: insufficientAllocationDataPoint(
        "Sector allocation input is unavailable.",
      ),
      status: "insufficient_data",
      threshold,
    };
  }

  if (allocation.isUnknownSector) {
    return {
      id: "portfolio_fit.sector_allocation",
      explanation: {
        detail: "The stock is grouped under Unknown / Insufficient Data.",
        summary:
          "Sector allocation cannot be classified without cached sector metadata.",
      },
      measuredValue: insufficientAllocationDataPoint(
        "Sector metadata is unavailable.",
      ),
      status: "insufficient_data",
      threshold,
    };
  }

  if (allocation.percentage === null) {
    return {
      id: "portfolio_fit.sector_allocation",
      explanation: {
        detail: formatAllocationReason(allocation.reason),
        summary:
          "Sector allocation cannot be classified without positive cached market values for the sector.",
      },
      measuredValue: insufficientAllocationDataPoint(
        "Sector allocation is unavailable from the current portfolio context.",
      ),
      status: "insufficient_data",
      threshold,
    };
  }

  if (allocation.percentage > thresholdValue) {
    return {
      id: "portfolio_fit.sector_allocation",
      explanation: {
        detail: `${allocation.sector} allocation is ${formatPercent(allocation.percentage)} against a ${formatPercent(thresholdValue)} maximum.`,
        summary:
          "Sector allocation is above the maximum sector allocation threshold.",
      },
      measuredValue: availableAllocationDataPoint(allocation.percentage),
      status: "fail",
      threshold,
    };
  }

  return {
    id: "portfolio_fit.sector_allocation",
    explanation: {
      detail: `${allocation.sector} allocation is ${formatPercent(allocation.percentage)} against a ${formatPercent(thresholdValue)} maximum.`,
      summary:
        "Sector allocation is within the maximum sector allocation threshold.",
    },
    measuredValue: availableAllocationDataPoint(allocation.percentage),
    status: "pass",
    threshold,
  };
}

function createCashAllocationRuleCheck(
  allocation: CashAllocationResult,
  thresholdValue: number,
): RuleCheckResult {
  const threshold = {
    label: "Minimum cash allocation",
    operator: "above_or_equal",
    unit: "percent",
    value: thresholdValue,
  } satisfies RuleThreshold;

  if (allocation.percentage === null) {
    return {
      id: "portfolio_fit.cash_allocation",
      explanation: {
        detail: formatAllocationReason(allocation.reason),
        summary:
          "Cash allocation cannot be classified without valid cash and portfolio denominator inputs.",
      },
      measuredValue: insufficientAllocationDataPoint(
        "Cash allocation is unavailable from the current portfolio context.",
      ),
      status: "insufficient_data",
      threshold,
    };
  }

  if (allocation.percentage < thresholdValue) {
    return {
      id: "portfolio_fit.cash_allocation",
      explanation: {
        detail: `Cash allocation is ${formatPercent(allocation.percentage)} against a ${formatPercent(thresholdValue)} minimum.`,
        summary:
          "Cash allocation is below the minimum cash allocation threshold.",
      },
      measuredValue: availableAllocationDataPoint(allocation.percentage),
      status: "warning",
      threshold,
    };
  }

  return {
    id: "portfolio_fit.cash_allocation",
    explanation: {
      detail: `Cash allocation is ${formatPercent(allocation.percentage)} against a ${formatPercent(thresholdValue)} minimum.`,
      summary:
        "Cash allocation is within the minimum cash allocation threshold.",
    },
    measuredValue: availableAllocationDataPoint(allocation.percentage),
    status: "pass",
    threshold,
  };
}

function createPortfolioDataCoverageRuleCheck(
  input: PortfolioFitScoringInput,
): RuleCheckResult {
  const partialSources = [
    ["position allocation", input.positionAllocation.status],
    ["cash allocation", input.cashAllocation.status],
    ["sector allocation", input.sectorAllocation?.status ?? "insufficient-data"],
  ].filter(([, status]) => status === "partial-market-data");

  if (partialSources.length > 0) {
    const sourceNames = partialSources.map(([sourceName]) => sourceName);

    return {
      id: "portfolio_fit.data_coverage",
      explanation: {
        detail: `Partial inputs: ${sourceNames.join(", ")}.`,
        summary:
          "Portfolio fit is based on partial cached market data, so the label should be reviewed.",
      },
      measuredValue: {
        asOfDate: null,
        freshness: "unknown",
        source: "manual_portfolio_context",
        value: true,
        availability: "available",
      },
      status: "warning",
      threshold: null,
    };
  }

  return {
    id: "portfolio_fit.data_coverage",
    explanation: {
      summary:
        "Portfolio fit inputs have enough cached market data for deterministic classification.",
    },
    measuredValue: {
      asOfDate: null,
      freshness: "unknown",
      source: "manual_portfolio_context",
      value: true,
      availability: "available",
    },
    status: "pass",
    threshold: null,
  };
}

function choosePortfolioFitLabel(
  ruleChecks: RuleCheckResult[],
  thresholds: GrahamScoringThresholds,
): PortfolioFitLabel {
  if (hasRuleStatus(ruleChecks, "insufficient_data")) {
    return "Insufficient Data";
  }

  const positionRule = getRequiredRule(
    ruleChecks,
    "portfolio_fit.position_allocation",
  );
  const sectorRule = getRequiredRule(
    ruleChecks,
    "portfolio_fit.sector_allocation",
  );
  const cashRule = getRequiredRule(ruleChecks, "portfolio_fit.cash_allocation");
  const dataCoverageRule = getRequiredRule(
    ruleChecks,
    "portfolio_fit.data_coverage",
  );
  const positionAllocation = getMeasuredPercent(positionRule);
  const sectorAllocation = getMeasuredPercent(sectorRule);
  const isPositionOverweight = positionRule.status === "fail";
  const isSectorConcentrated = sectorRule.status === "fail";
  const isCashConstrained = cashRule.status === "warning";

  if (
    (isPositionOverweight && isSectorConcentrated) ||
    (isPositionOverweight && isCashConstrained) ||
    (isSectorConcentrated && isCashConstrained)
  ) {
    return "Do Not Add";
  }

  if (isSectorConcentrated) {
    return "Concentration Risk";
  }

  if (isPositionOverweight) {
    return "Overweight";
  }

  if (isCashConstrained) {
    return "Cash Constrained";
  }

  if (dataCoverageRule.status === "warning") {
    return "Review Position";
  }

  if (
    positionAllocation !== null &&
    sectorAllocation !== null &&
    positionAllocation < getUnderweightThreshold(
      thresholds.maxSingleStockAllocationPercent,
    ) &&
    sectorAllocation <= thresholds.maxSectorAllocationPercent
  ) {
    return "Underweight";
  }

  return "Balanced";
}

function createPortfolioFitSummary(
  label: PortfolioFitLabel,
  ruleChecks: RuleCheckResult[],
  thresholds: GrahamScoringThresholds,
): string {
  switch (label) {
    case "Underweight":
      return `Position allocation is below ${formatPercent(getUnderweightThreshold(thresholds.maxSingleStockAllocationPercent))}, while sector and cash checks stay within their default thresholds.`;
    case "Balanced":
      return "Position, sector, and cash allocation checks are within the default portfolio-fit thresholds.";
    case "Overweight":
      return "Position allocation is above the maximum single-stock threshold and should be reviewed in portfolio context.";
    case "Concentration Risk":
      return "Sector allocation is above the maximum sector threshold and should be reviewed in portfolio context.";
    case "Cash Constrained":
      return "Cash allocation is below the minimum cash threshold, so available cash context is constrained.";
    case "Do Not Add":
      return "Multiple portfolio-fit thresholds are exceeded, so adding exposure would increase an already flagged allocation constraint.";
    case "Review Position":
      return "Portfolio fit can be classified, but partial cached market data means the result should be reviewed before relying on it.";
    case "Insufficient Data":
      return createInsufficientDataSummary(ruleChecks);
  }
}

function createInsufficientDataSummary(ruleChecks: RuleCheckResult[]) {
  const insufficientRules = ruleChecks
    .filter((ruleCheck) => ruleCheck.status === "insufficient_data")
    .map((ruleCheck) => ruleCheck.explanation.summary);

  if (insufficientRules.length === 0) {
    return "Portfolio fit cannot be classified from the available allocation inputs.";
  }

  return `Portfolio fit cannot be classified from the available allocation inputs. ${insufficientRules.join(" ")}`;
}

function selectDominantRules(
  label: PortfolioFitLabel,
  ruleChecks: RuleCheckResult[],
): PortfolioFitReason[] {
  const preferredStatuses = getPreferredStatuses(label);

  return ruleChecks
    .filter((ruleCheck) => preferredStatuses.includes(ruleCheck.status))
    .map(toPortfolioFitReason)
    .slice(0, MAX_DOMINANT_RULES);
}

function getPreferredStatuses(label: PortfolioFitLabel): RuleCheckStatus[] {
  switch (label) {
    case "Balanced":
      return ["pass"];
    case "Underweight":
    case "Cash Constrained":
    case "Review Position":
      return ["warning"];
    case "Overweight":
    case "Concentration Risk":
    case "Do Not Add":
      return ["fail", "warning"];
    case "Insufficient Data":
      return ["insufficient_data", "unavailable"];
  }
}

function createPortfolioFitWarnings(ruleChecks: RuleCheckResult[]) {
  return ruleChecks
    .filter((ruleCheck) =>
      ["fail", "warning", "insufficient_data", "unavailable"].includes(
        ruleCheck.status,
      ),
    )
    .map(toPortfolioFitReason);
}

function toPortfolioFitReason(ruleCheck: RuleCheckResult): PortfolioFitReason {
  return {
    detail: ruleCheck.explanation.detail,
    ruleId: ruleCheck.id,
    status: ruleCheck.status,
    summary: ruleCheck.explanation.summary,
  };
}

function hasRuleStatus(
  ruleChecks: RuleCheckResult[],
  status: RuleCheckStatus,
) {
  return ruleChecks.some((ruleCheck) => ruleCheck.status === status);
}

function getRequiredRule(ruleChecks: RuleCheckResult[], id: string) {
  const ruleCheck = ruleChecks.find((candidate) => candidate.id === id);

  if (!ruleCheck) {
    throw new Error(`Missing portfolio-fit rule check: ${id}`);
  }

  return ruleCheck;
}

function getMeasuredPercent(ruleCheck: RuleCheckResult) {
  const measuredValue = ruleCheck.measuredValue;

  if (
    measuredValue === null ||
    measuredValue.availability !== "available" ||
    typeof measuredValue.value !== "number"
  ) {
    return null;
  }

  return measuredValue.value;
}

function availableAllocationDataPoint(value: number): ScoringDataPoint {
  return {
    asOfDate: null,
    freshness: "unknown",
    source: "manual_portfolio_context",
    value,
    availability: "available",
  };
}

function insufficientAllocationDataPoint(reason: string): ScoringDataPoint {
  return {
    asOfDate: null,
    freshness: "unknown",
    reason,
    source: "manual_portfolio_context",
    value: null,
    availability: "insufficient",
  };
}

function getUnderweightThreshold(maxSingleStockAllocationPercent: number) {
  return maxSingleStockAllocationPercent * UNDERWEIGHT_THRESHOLD_RATIO;
}

function formatPercent(value: number) {
  return `${Number(value.toFixed(2))}%`;
}

function formatAllocationReason(reason: string) {
  return reason.replaceAll("_", " ");
}
