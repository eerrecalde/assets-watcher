import type {
  RuleCheckResult,
  ScoringDataPoint,
  ScoreLayerResult,
  StockQualityScoringInput,
} from "./types";

export type QualityMetricName =
  | "dividend_consistency"
  | "earnings_stability"
  | "eps"
  | "free_cash_flow"
  | "net_income"
  | "revenue"
  | "revenue_growth";

export type QualityScoreBucket =
  | "strong"
  | "adequate"
  | "mixed"
  | "weak"
  | "insufficient_data";

export type QualityScoreResult = ScoreLayerResult & {
  bucket: QualityScoreBucket;
};

const RULE_WEIGHTS = {
  fail: 0,
  pass: 100,
  warning: 50,
} as const;

const PROFITABILITY_RULE_IDS = new Set([
  "quality.positive_eps",
  "quality.positive_net_income",
  "quality.positive_free_cash_flow",
]);

export function scoreQualityLayer(
  input: StockQualityScoringInput,
): QualityScoreResult {
  const ruleChecks = [
    createPositiveFundamentalRuleCheck({
      id: "quality.positive_eps",
      measuredValue: input.eps,
      metric: "eps",
      thresholdLabel: "Positive EPS",
    }),
    createPositiveFundamentalRuleCheck({
      id: "quality.positive_net_income",
      measuredValue: input.netIncome,
      metric: "net_income",
      thresholdLabel: "Positive net income",
    }),
    createPositiveFundamentalRuleCheck({
      id: "quality.positive_free_cash_flow",
      measuredValue: input.freeCashFlow,
      metric: "free_cash_flow",
      thresholdLabel: "Positive free cash flow",
    }),
    createRevenueAvailabilityRuleCheck(input.revenue),
    createUnsupportedHistoryRuleCheck({
      id: "quality.revenue_growth",
      measuredValue: input.revenueGrowth,
      metric: "revenue_growth",
    }),
    createUnsupportedHistoryRuleCheck({
      id: "quality.earnings_stability",
      measuredValue: input.earningsStability,
      metric: "earnings_stability",
    }),
    createDividendConsistencyRuleCheck(input.dividendConsistency),
  ] satisfies RuleCheckResult[];
  const decisiveRuleChecks = getDecisiveRuleChecks(ruleChecks);
  const decisiveProfitabilityRuleChecks = decisiveRuleChecks.filter(
    (ruleCheck) => PROFITABILITY_RULE_IDS.has(ruleCheck.id),
  );

  if (decisiveProfitabilityRuleChecks.length === 0) {
    return {
      bucket: "insufficient_data",
      explanation: {
        detail:
          "Unavailable cached quality inputs are excluded from pass/fail scoring.",
        summary:
          "Business quality needs cached EPS, net income, or free cash flow.",
      },
      id: "quality",
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
  const bucket = chooseQualityBucket(ruleChecks, score);

  return {
    bucket,
    explanation: createQualitySummary(bucket, score, ruleChecks),
    id: "quality",
    ruleChecks,
    score,
    status: "scored",
  };
}

type PresentRuleThreshold = NonNullable<RuleCheckResult["threshold"]>;
type DecisiveRuleCheck = RuleCheckResult & {
  status: keyof typeof RULE_WEIGHTS;
};

function createPositiveFundamentalRuleCheck({
  id,
  measuredValue,
  metric,
  thresholdLabel,
}: {
  id: string;
  measuredValue: ScoringDataPoint;
  metric: Extract<
    QualityMetricName,
    "eps" | "free_cash_flow" | "net_income"
  >;
  thresholdLabel: string;
}): RuleCheckResult {
  const threshold = {
    label: thresholdLabel,
    operator: "above",
    unit: metric === "eps" ? "currency" : "number",
    value: 0,
  } satisfies PresentRuleThreshold;

  if (measuredValue.availability !== "available") {
    return {
      explanation: {
        detail: measuredValue.reason,
        summary: `${formatMetricName(metric)} is unavailable in cached fundamentals.`,
      },
      id,
      measuredValue,
      status: "unavailable",
      threshold,
    };
  }

  if (measuredValue.value > 0) {
    return {
      explanation: {
        summary: `${formatMetricName(metric)} passes the positive profitability check.`,
      },
      id,
      measuredValue,
      status: "pass",
      threshold,
    };
  }

  return {
    explanation: {
      summary: `${formatMetricName(metric)} does not pass the positive profitability check.`,
    },
    id,
    measuredValue,
    status: "fail",
    threshold,
  };
}

function createRevenueAvailabilityRuleCheck(
  measuredValue: ScoringDataPoint,
): RuleCheckResult {
  if (measuredValue.availability !== "available") {
    return {
      explanation: {
        detail: measuredValue.reason,
        summary: "Revenue is unavailable in cached fundamentals.",
      },
      id: "quality.revenue_available",
      measuredValue,
      status: "unavailable",
      threshold: null,
    };
  }

  if (measuredValue.value > 0) {
    return {
      explanation: {
        summary: "Revenue is available in cached fundamentals.",
      },
      id: "quality.revenue_available",
      measuredValue,
      status: "pass",
      threshold: null,
    };
  }

  return {
    explanation: {
      detail: "Revenue availability is present, but the cached value is not positive.",
      summary: "Revenue should be reviewed before treating it as a quality input.",
    },
    id: "quality.revenue_available",
    measuredValue,
    status: "warning",
    threshold: null,
  };
}

function createUnsupportedHistoryRuleCheck({
  id,
  measuredValue,
  metric,
}: {
  id: string;
  measuredValue: ScoringDataPoint;
  metric: Extract<QualityMetricName, "earnings_stability" | "revenue_growth">;
}): RuleCheckResult {
  if (measuredValue.availability !== "available") {
    return {
      explanation: {
        detail: measuredValue.reason,
        summary: `${formatMetricName(metric)} is unavailable because cached fundamentals do not include enough history yet.`,
      },
      id,
      measuredValue,
      status: "unavailable",
      threshold: null,
    };
  }

  return {
    explanation: {
      summary: `${formatMetricName(metric)} is available for business quality scoring.`,
    },
    id,
    measuredValue,
    status: "pass",
    threshold: null,
  };
}

function createDividendConsistencyRuleCheck(
  measuredValue: ScoringDataPoint<boolean> | null,
): RuleCheckResult {
  if (measuredValue === null) {
    return {
      explanation: {
        summary: "Dividend consistency is optional and was not evaluated.",
      },
      id: "quality.dividend_consistency",
      measuredValue: null,
      status: "not_applicable",
      threshold: null,
    };
  }

  if (measuredValue.availability !== "available") {
    return {
      explanation: {
        detail: measuredValue.reason,
        summary: "Dividend consistency is unavailable in cached fundamentals.",
      },
      id: "quality.dividend_consistency",
      measuredValue,
      status: "unavailable",
      threshold: null,
    };
  }

  if (measuredValue.value) {
    return {
      explanation: {
        summary: "Dividend consistency passes the optional quality check.",
      },
      id: "quality.dividend_consistency",
      measuredValue,
      status: "pass",
      threshold: null,
    };
  }

  return {
    explanation: {
      summary:
        "Dividend consistency does not pass the optional quality check.",
    },
    id: "quality.dividend_consistency",
    measuredValue,
    status: "warning",
    threshold: null,
  };
}

function chooseQualityBucket(
  ruleChecks: RuleCheckResult[],
  score: number,
): QualityScoreBucket {
  const profitabilityFailures = ruleChecks.filter(
    (ruleCheck) =>
      PROFITABILITY_RULE_IDS.has(ruleCheck.id) && ruleCheck.status === "fail",
  ).length;

  if (score >= 85 && profitabilityFailures === 0) {
    return "strong";
  }

  if (score >= 70 && profitabilityFailures <= 1) {
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

function createQualitySummary(
  bucket: QualityScoreBucket,
  score: number,
  ruleChecks: RuleCheckResult[],
): QualityScoreResult["explanation"] {
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
        detail: `Quality score: ${score}.${unavailableDetail}`.trim(),
        summary:
          "Cached fundamentals pass the available business quality checks.",
      };
    case "adequate":
      return {
        detail: `Quality score: ${score}.${unavailableDetail}`.trim(),
        summary:
          "Cached fundamentals generally pass the available business quality checks.",
      };
    case "mixed":
      return {
        detail: `Quality score: ${score}.${unavailableDetail}`.trim(),
        summary:
          "Cached business quality checks are mixed and should be reviewed cautiously.",
      };
    case "weak":
      return {
        detail: `Quality score: ${score}.${unavailableDetail}`.trim(),
        summary:
          "Available profitability checks do not pass consistently.",
      };
    case "insufficient_data":
      return {
        summary:
          "Business quality needs cached EPS, net income, or free cash flow.",
      };
  }
}

function formatMetricName(metricName: QualityMetricName) {
  switch (metricName) {
    case "dividend_consistency":
      return "Dividend consistency";
    case "earnings_stability":
      return "Earnings stability";
    case "eps":
      return "EPS";
    case "free_cash_flow":
      return "Free cash flow";
    case "net_income":
      return "Net income";
    case "revenue":
      return "Revenue";
    case "revenue_growth":
      return "Revenue growth";
  }
}
