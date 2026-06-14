import {
  DEFAULT_GRAHAM_SCORING_THRESHOLDS,
  type GrahamScoringThresholds,
} from "./thresholds";
import type {
  RuleCheckResult,
  ScoringDataFreshness,
  ScoringDataPoint,
  ScoreLayerResult,
  StockSafetyScoringInput,
} from "./types";

export type SafetyMetricName =
  | "current_ratio"
  | "debt_to_equity"
  | "free_cash_flow"
  | "total_debt"
  | "total_equity";

export type SafetyScoreBucket =
  | "strong"
  | "adequate"
  | "mixed"
  | "weak"
  | "insufficient_data";

export type SafetyScoreResult = ScoreLayerResult & {
  bucket: SafetyScoreBucket;
};

const RULE_WEIGHTS = {
  fail: 0,
  pass: 100,
  warning: 50,
} as const;

const PRIMARY_RULE_IDS = new Set([
  "safety.current_ratio",
  "safety.debt_to_equity",
  "safety.positive_free_cash_flow",
]);

export function scoreSafetyLayer(
  input: StockSafetyScoringInput,
  thresholds: GrahamScoringThresholds = DEFAULT_GRAHAM_SCORING_THRESHOLDS,
): SafetyScoreResult {
  const debtToEquity = deriveDebtToEquity(input);
  const ruleChecks = [
    createMinimumCurrentRatioRuleCheck({
      measuredValue: input.currentRatio,
      thresholdValue: thresholds.minCurrentRatio,
    }),
    createMaximumDebtToEquityRuleCheck({
      measuredValue: debtToEquity,
      thresholdValue: thresholds.maxDebtToEquity,
    }),
    createFreeCashFlowRuleCheck(input.freeCashFlow),
    createTotalDebtRuleCheck(input.totalDebt),
    createTotalEquityRuleCheck(input.totalEquity),
  ] satisfies RuleCheckResult[];
  const decisiveRuleChecks = getDecisiveRuleChecks(ruleChecks);
  const decisivePrimaryRuleChecks = decisiveRuleChecks.filter((ruleCheck) =>
    PRIMARY_RULE_IDS.has(ruleCheck.id),
  );

  if (decisivePrimaryRuleChecks.length === 0) {
    return {
      bucket: "insufficient_data",
      explanation: {
        detail:
          "Unavailable cached safety inputs are excluded from pass/fail scoring.",
        summary:
          "Financial safety needs cached current ratio, debt/equity, or free cash flow.",
      },
      id: "safety",
      ruleChecks,
      score: null,
      status: "insufficient_data",
    };
  }

  const score = Math.round(
    decisiveRuleChecks.reduce((total, ruleCheck) => {
      return total + RULE_WEIGHTS[ruleCheck.status];
    }, 0) / decisiveRuleChecks.length,
  );
  const bucket = chooseSafetyBucket(ruleChecks, score);

  return {
    bucket,
    explanation: createSafetySummary(bucket, score, ruleChecks),
    id: "safety",
    ruleChecks,
    score,
    status: "scored",
  };
}

type PresentRuleThreshold = NonNullable<RuleCheckResult["threshold"]>;
type DecisiveRuleCheck = RuleCheckResult & {
  status: keyof typeof RULE_WEIGHTS;
};

function createMinimumCurrentRatioRuleCheck({
  measuredValue,
  thresholdValue,
}: {
  measuredValue: ScoringDataPoint;
  thresholdValue: number;
}): RuleCheckResult {
  const threshold = {
    label: "Minimum current ratio",
    operator: "above_or_equal",
    unit: "ratio",
    value: thresholdValue,
  } satisfies PresentRuleThreshold;

  if (measuredValue.availability !== "available") {
    return unavailableRuleCheck({
      id: "safety.current_ratio",
      measuredValue,
      metric: "current_ratio",
      threshold,
    });
  }

  if (measuredValue.value >= thresholdValue) {
    return {
      explanation: {
        summary:
          "Current ratio meets the default Graham financial safety threshold.",
      },
      id: "safety.current_ratio",
      measuredValue,
      status: "pass",
      threshold,
    };
  }

  return {
    explanation: {
      summary:
        "Current ratio is below the default Graham financial safety threshold.",
    },
    id: "safety.current_ratio",
    measuredValue,
    status: "fail",
    threshold,
  };
}

function createMaximumDebtToEquityRuleCheck({
  measuredValue,
  thresholdValue,
}: {
  measuredValue: ScoringDataPoint;
  thresholdValue: number;
}): RuleCheckResult {
  const threshold = {
    label: "Maximum debt/equity",
    operator: "below_or_equal",
    unit: "ratio",
    value: thresholdValue,
  } satisfies PresentRuleThreshold;

  if (measuredValue.availability !== "available") {
    return unavailableRuleCheck({
      id: "safety.debt_to_equity",
      measuredValue,
      metric: "debt_to_equity",
      threshold,
    });
  }

  if (measuredValue.value < 0) {
    return {
      explanation: {
        detail:
          "Negative debt/equity is not treated as a clean leverage pass.",
        summary: "Debt/equity should be reviewed before scoring leverage.",
      },
      id: "safety.debt_to_equity",
      measuredValue,
      status: "warning",
      threshold,
    };
  }

  if (measuredValue.value <= thresholdValue) {
    return {
      explanation: {
        summary: "Debt/equity is within the default Graham safety threshold.",
      },
      id: "safety.debt_to_equity",
      measuredValue,
      status: "pass",
      threshold,
    };
  }

  return {
    explanation: {
      summary: "Debt/equity is above the default Graham safety threshold.",
    },
    id: "safety.debt_to_equity",
    measuredValue,
    status: "fail",
    threshold,
  };
}

function createFreeCashFlowRuleCheck(
  measuredValue: ScoringDataPoint,
): RuleCheckResult {
  const threshold = {
    label: "Positive free cash flow",
    operator: "above",
    unit: "number",
    value: 0,
  } satisfies PresentRuleThreshold;

  if (measuredValue.availability !== "available") {
    return unavailableRuleCheck({
      id: "safety.positive_free_cash_flow",
      measuredValue,
      metric: "free_cash_flow",
      threshold,
    });
  }

  if (measuredValue.value > 0) {
    return {
      explanation: {
        summary:
          "Free cash flow passes the positive financial safety check.",
      },
      id: "safety.positive_free_cash_flow",
      measuredValue,
      status: "pass",
      threshold,
    };
  }

  if (measuredValue.value === 0) {
    return {
      explanation: {
        detail: "Zero free cash flow is preserved as a real cached value.",
        summary:
          "Free cash flow is break-even and should be reviewed separately from missing data.",
      },
      id: "safety.positive_free_cash_flow",
      measuredValue,
      status: "warning",
      threshold,
    };
  }

  return {
    explanation: {
      summary:
        "Free cash flow does not pass the positive financial safety check.",
    },
    id: "safety.positive_free_cash_flow",
    measuredValue,
    status: "fail",
    threshold,
  };
}

function createTotalDebtRuleCheck(
  measuredValue: ScoringDataPoint,
): RuleCheckResult {
  if (measuredValue.availability !== "available") {
    return unavailableRuleCheck({
      id: "safety.total_debt",
      measuredValue,
      metric: "total_debt",
      threshold: null,
    });
  }

  if (measuredValue.value < 0) {
    return {
      explanation: {
        detail: "Negative total debt is not a meaningful balance-sheet input.",
        summary: "Total debt should be reviewed before scoring safety.",
      },
      id: "safety.total_debt",
      measuredValue,
      status: "warning",
      threshold: null,
    };
  }

  return {
    explanation: {
      summary:
        measuredValue.value === 0
          ? "Total debt is cached as zero."
          : "Total debt is available in cached fundamentals.",
    },
    id: "safety.total_debt",
    measuredValue,
    status: "pass",
    threshold: null,
  };
}

function createTotalEquityRuleCheck(
  measuredValue: ScoringDataPoint,
): RuleCheckResult {
  const threshold = {
    label: "Positive total equity",
    operator: "above",
    unit: "number",
    value: 0,
  } satisfies PresentRuleThreshold;

  if (measuredValue.availability !== "available") {
    return unavailableRuleCheck({
      id: "safety.total_equity",
      measuredValue,
      metric: "total_equity",
      threshold,
    });
  }

  if (measuredValue.value > 0) {
    return {
      explanation: {
        summary: "Total equity is positive in cached fundamentals.",
      },
      id: "safety.total_equity",
      measuredValue,
      status: "pass",
      threshold,
    };
  }

  return {
    explanation: {
      detail:
        measuredValue.value === 0
          ? "Zero total equity is preserved as a real cached value."
          : "Negative total equity is preserved as a real cached value.",
      summary:
        "Total equity does not pass the positive balance-sheet check.",
    },
    id: "safety.total_equity",
    measuredValue,
    status: "fail",
    threshold,
  };
}

function deriveDebtToEquity(input: StockSafetyScoringInput): ScoringDataPoint {
  if (input.debtToEquity.availability === "available") {
    return input.debtToEquity;
  }

  if (
    input.totalDebt.availability !== "available" ||
    input.totalEquity.availability !== "available"
  ) {
    return input.debtToEquity;
  }

  if (input.totalDebt.value < 0) {
    return {
      availability: "insufficient",
      asOfDate: input.totalDebt.asOfDate,
      freshness: "unknown",
      reason: "Total debt must be zero or positive to derive debt/equity.",
      source: "derived_metric",
      value: null,
    };
  }

  if (input.totalEquity.value <= 0) {
    return {
      availability: "insufficient",
      asOfDate: input.totalEquity.asOfDate,
      freshness: "unknown",
      reason: "Total equity must be positive to derive debt/equity.",
      source: "derived_metric",
      value: null,
    };
  }

  return {
    availability: "available",
    asOfDate: input.totalDebt.asOfDate ?? input.totalEquity.asOfDate,
    freshness: combineFreshness(input.totalDebt, input.totalEquity),
    source: "derived_metric",
    value: input.totalDebt.value / input.totalEquity.value,
  };
}

function combineFreshness(
  first: ScoringDataPoint,
  second: ScoringDataPoint,
): ScoringDataFreshness {
  if (first.availability !== "available" || second.availability !== "available") {
    return "unknown";
  }

  if (first.freshness === "stale" || second.freshness === "stale") {
    return "stale";
  }

  if (first.freshness === "fresh" && second.freshness === "fresh") {
    return "fresh";
  }

  return "unknown";
}

function unavailableRuleCheck({
  id,
  measuredValue,
  metric,
  threshold,
}: {
  id: string;
  measuredValue: ScoringDataPoint;
  metric: SafetyMetricName;
  threshold: RuleCheckResult["threshold"];
}): RuleCheckResult {
  return {
    explanation: {
      detail:
        measuredValue.availability !== "available"
          ? measuredValue.reason
          : undefined,
      summary: `${formatMetricName(metric)} is unavailable in cached fundamentals.`,
    },
    id,
    measuredValue,
    status: "unavailable",
    threshold,
  };
}

function chooseSafetyBucket(
  ruleChecks: RuleCheckResult[],
  score: number,
): SafetyScoreBucket {
  const decisivePrimaryRuleChecks = getDecisiveRuleChecks(ruleChecks).filter(
    (ruleCheck) => PRIMARY_RULE_IDS.has(ruleCheck.id),
  );
  const primaryFailures = decisivePrimaryRuleChecks.filter(
    (ruleCheck) => ruleCheck.status === "fail",
  ).length;
  const primaryWarnings = decisivePrimaryRuleChecks.filter(
    (ruleCheck) => ruleCheck.status === "warning",
  ).length;

  if (score >= 85 && primaryFailures === 0 && primaryWarnings === 0) {
    return "strong";
  }

  if (score >= 70 && primaryFailures <= 1) {
    return "adequate";
  }

  if (score >= 50) {
    return "mixed";
  }

  return "weak";
}

function getDecisiveRuleChecks(
  ruleChecks: RuleCheckResult[],
): DecisiveRuleCheck[] {
  return ruleChecks.filter((ruleCheck): ruleCheck is DecisiveRuleCheck => {
    return (
      ruleCheck.status === "pass" ||
      ruleCheck.status === "fail" ||
      ruleCheck.status === "warning"
    );
  });
}

function createSafetySummary(
  bucket: SafetyScoreBucket,
  score: number,
  ruleChecks: RuleCheckResult[],
): SafetyScoreResult["explanation"] {
  const unavailableCount = ruleChecks.filter(
    (ruleCheck) => ruleCheck.status === "unavailable",
  ).length;
  const unavailableDetail =
    unavailableCount > 0
      ? ` ${unavailableCount} unavailable rule${
          unavailableCount === 1 ? "" : "s"
        } were excluded from the score.`
      : "";

  switch (bucket) {
    case "strong":
      return {
        detail: `Safety score: ${score}.${unavailableDetail}`.trim(),
        summary:
          "Cached fundamentals pass the available financial safety checks.",
      };
    case "adequate":
      return {
        detail: `Safety score: ${score}.${unavailableDetail}`.trim(),
        summary:
          "Cached fundamentals generally pass the available financial safety checks.",
      };
    case "mixed":
      return {
        detail: `Safety score: ${score}.${unavailableDetail}`.trim(),
        summary:
          "Cached financial safety checks are mixed and should be reviewed cautiously.",
      };
    case "weak":
      return {
        detail: `Safety score: ${score}.${unavailableDetail}`.trim(),
        summary:
          "Available financial safety checks do not pass consistently.",
      };
    case "insufficient_data":
      return {
        summary:
          "Financial safety needs cached current ratio, debt/equity, or free cash flow.",
      };
  }
}

function formatMetricName(metricName: SafetyMetricName) {
  switch (metricName) {
    case "current_ratio":
      return "Current ratio";
    case "debt_to_equity":
      return "Debt/equity";
    case "free_cash_flow":
      return "Free cash flow";
    case "total_debt":
      return "Total debt";
    case "total_equity":
      return "Total equity";
  }
}
