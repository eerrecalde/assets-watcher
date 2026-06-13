import {
  DEFAULT_GRAHAM_SCORING_THRESHOLDS,
  type GrahamScoringThresholds,
} from "./thresholds";
import type {
  RuleCheckResult,
  ScoringDataPoint,
  ScoreLayerResult,
  StockScoreLabel,
  StockValuationScoringInput,
} from "./types";

export type ValuationMetricName =
  | "book_value_per_share"
  | "current_price"
  | "eps"
  | "estimated_value"
  | "graham_number"
  | "pb_ratio"
  | "pe_ratio";

export type ValuationCalculationResult =
  | {
      availability: "available";
      value: number;
    }
  | {
      availability: "missing" | "insufficient";
      reason: string;
      value: null;
    };

export type GrahamNumberInput = {
  bookValuePerShare?: number | string | null;
  eps?: number | string | null;
};

export type MarginOfSafetyInput = {
  currentPrice?: number | string | null;
  estimatedValue?: number | string | null;
};

export type ValuationScoreBucket =
  | "attractive"
  | "reasonable"
  | "watch"
  | "expensive"
  | "insufficient_data";

export type ValuationScoreResult = ScoreLayerResult & {
  bucket: ValuationScoreBucket;
  label: Extract<
    StockScoreLabel,
    "Attractive" | "Reasonable" | "Watch" | "Expensive" | "Insufficient Data"
  >;
};

const DEFAULT_DECIMAL_PLACES = 6;
const GRAHAM_NUMBER_MULTIPLIER = 22.5;
const RULE_WEIGHTS = {
  fail: 0,
  pass: 100,
  warning: 50,
} as const;

export function scoreValuationLayer(
  input: StockValuationScoringInput,
  thresholds: GrahamScoringThresholds = DEFAULT_GRAHAM_SCORING_THRESHOLDS,
): ValuationScoreResult {
  const marginOfSafetyPercent = deriveMarginOfSafetyPercent(input);
  const ruleChecks = [
    createMaximumRatioRuleCheck({
      id: "valuation.pe_ratio",
      measuredValue: input.peRatio,
      metric: "pe_ratio",
      threshold: {
        label: "Maximum P/E ratio",
        operator: "below_or_equal",
        unit: "ratio",
        value: thresholds.maxPe,
      },
    }),
    createMaximumRatioRuleCheck({
      id: "valuation.pb_ratio",
      measuredValue: input.pbRatio,
      metric: "pb_ratio",
      threshold: {
        label: "Maximum P/B ratio",
        operator: "below_or_equal",
        unit: "ratio",
        value: thresholds.maxPb,
      },
    }),
    createMarginOfSafetyRuleCheck({
      measuredValue: marginOfSafetyPercent,
      thresholdValue: thresholds.minMarginOfSafetyPercent,
    }),
  ] satisfies RuleCheckResult[];
  const decisiveRuleChecks = getDecisiveRuleChecks(ruleChecks);

  if (decisiveRuleChecks.length === 0) {
    return {
      bucket: "insufficient_data",
      explanation: {
        detail:
          "Unavailable cached valuation inputs are excluded from pass/fail scoring.",
        summary:
          "Valuation needs cached P/E, P/B, or a valid cached price and Graham Number.",
      },
      id: "valuation",
      label: "Insufficient Data",
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
  const bucket = chooseValuationBucket(ruleChecks, score);

  return {
    bucket,
    explanation: createValuationSummary(bucket, score, ruleChecks),
    id: "valuation",
    label: valuationBucketToLabel(bucket),
    ruleChecks,
    score,
    status: "scored",
  };
}

export function calculateGrahamNumber({
  bookValuePerShare,
  eps,
}: GrahamNumberInput): ValuationCalculationResult {
  const normalizedEps = normalizeOptionalNumber(eps);
  const normalizedBookValuePerShare =
    normalizeOptionalNumber(bookValuePerShare);

  if (normalizedEps.availability === "missing") {
    return missingResult(
      `${formatMetricName("eps")} is required to calculate the Graham Number.`,
    );
  }

  if (normalizedBookValuePerShare.availability === "missing") {
    return missingResult(
      `${formatMetricName(
        "book_value_per_share",
      )} is required to calculate the Graham Number.`,
    );
  }

  if (normalizedEps.value <= 0) {
    return insufficientResult(
      `${formatMetricName("eps")} must be positive to calculate the Graham Number.`,
    );
  }

  if (normalizedBookValuePerShare.value <= 0) {
    return insufficientResult(
      `${formatMetricName(
        "book_value_per_share",
      )} must be positive to calculate the Graham Number.`,
    );
  }

  return availableResult(
    Math.sqrt(
      GRAHAM_NUMBER_MULTIPLIER *
        normalizedEps.value *
        normalizedBookValuePerShare.value,
    ),
  );
}

export function calculateMarginOfSafety({
  currentPrice,
  estimatedValue,
}: MarginOfSafetyInput): ValuationCalculationResult {
  const normalizedEstimatedValue = normalizeOptionalNumber(estimatedValue);
  const normalizedCurrentPrice = normalizeOptionalNumber(currentPrice);

  if (normalizedEstimatedValue.availability === "missing") {
    return missingResult(
      `${formatMetricName(
        "estimated_value",
      )} is required to calculate margin of safety.`,
    );
  }

  if (normalizedCurrentPrice.availability === "missing") {
    return missingResult(
      `${formatMetricName(
        "current_price",
      )} is required to calculate margin of safety.`,
    );
  }

  if (normalizedEstimatedValue.value <= 0) {
    return insufficientResult(
      "Estimated value must be positive to calculate margin of safety.",
    );
  }

  if (normalizedCurrentPrice.value <= 0) {
    return insufficientResult(
      "Current price must be positive to calculate margin of safety.",
    );
  }

  return availableResult(
    (normalizedEstimatedValue.value - normalizedCurrentPrice.value) /
      normalizedEstimatedValue.value,
  );
}

export function calculateMarginOfSafetyPercent(
  input: MarginOfSafetyInput,
): ValuationCalculationResult {
  const marginOfSafety = calculateMarginOfSafety(input);

  if (marginOfSafety.availability !== "available") {
    return marginOfSafety;
  }

  return availableResult(marginOfSafety.value * 100);
}

type NormalizedNumber =
  | {
      availability: "available";
      value: number;
    }
  | {
      availability: "missing";
      value: null;
    };
type PresentRuleThreshold = NonNullable<RuleCheckResult["threshold"]>;

function deriveMarginOfSafetyPercent(
  input: StockValuationScoringInput,
): ScoringDataPoint {
  const grahamNumber = input.grahamNumber;
  const currentPrice = input.currentPrice;

  if (grahamNumber.availability !== "available") {
    return createUnavailableDerivedMetric(
      grahamNumber.asOfDate,
      grahamNumber.reason,
    );
  }

  if (currentPrice.availability !== "available") {
    return createUnavailableDerivedMetric(
      currentPrice.asOfDate,
      currentPrice.reason,
    );
  }

  const marginOfSafety = calculateMarginOfSafetyPercent({
    currentPrice: currentPrice.value,
    estimatedValue: grahamNumber.value,
  });

  if (marginOfSafety.availability !== "available") {
    return {
      availability: marginOfSafety.availability,
      asOfDate: currentPrice.asOfDate,
      freshness: "unknown",
      reason: marginOfSafety.reason,
      source: "derived_metric",
      value: null,
    };
  }

  return {
    availability: "available",
    asOfDate: currentPrice.asOfDate,
    freshness: currentPrice.freshness,
    source: "derived_metric",
    value: marginOfSafety.value,
  };
}

function createUnavailableDerivedMetric(
  asOfDate: string | null,
  reason: string,
): ScoringDataPoint {
  return {
    availability: "missing",
    asOfDate,
    freshness: "unknown",
    reason,
    source: "derived_metric",
    value: null,
  };
}

function createMaximumRatioRuleCheck({
  id,
  measuredValue,
  metric,
  threshold,
}: {
  id: string;
  measuredValue: ScoringDataPoint;
  metric: Extract<ValuationMetricName, "pb_ratio" | "pe_ratio">;
  threshold: PresentRuleThreshold;
}): RuleCheckResult {
  if (measuredValue.availability !== "available") {
    return {
      explanation: {
        summary: `${formatMetricName(metric)} is unavailable in cached fundamentals.`,
      },
      id,
      measuredValue,
      status: "unavailable",
      threshold,
    };
  }

  if (measuredValue.value <= 0) {
    return {
      explanation: {
        detail: "Non-positive ratios are not treated as passing a Graham maximum.",
        summary: `${formatMetricName(metric)} is not meaningful for valuation scoring.`,
      },
      id,
      measuredValue,
      status: "warning",
      threshold,
    };
  }

  if (measuredValue.value <= threshold.value) {
    return {
      explanation: {
        summary: `${formatMetricName(metric)} is within the default Graham threshold.`,
      },
      id,
      measuredValue,
      status: "pass",
      threshold,
    };
  }

  return {
    explanation: {
      summary: `${formatMetricName(metric)} is above the default Graham threshold.`,
    },
    id,
    measuredValue,
    status: "fail",
    threshold,
  };
}

function createMarginOfSafetyRuleCheck({
  measuredValue,
  thresholdValue,
}: {
  measuredValue: ScoringDataPoint;
  thresholdValue: number;
}): RuleCheckResult {
  const threshold = {
    label: "Minimum margin of safety",
    operator: "above_or_equal",
    unit: "percent",
    value: thresholdValue,
  } satisfies RuleCheckResult["threshold"];

  if (measuredValue.availability !== "available") {
    return {
      explanation: {
        summary:
          "Margin of safety is unavailable without a valid cached price and Graham Number.",
      },
      id: "valuation.margin_of_safety",
      measuredValue,
      status: "unavailable",
      threshold,
    };
  }

  if (measuredValue.value >= thresholdValue) {
    return {
      explanation: {
        summary:
          "Cached price is below the Graham Number with the required margin of safety.",
      },
      id: "valuation.margin_of_safety",
      measuredValue,
      status: "pass",
      threshold,
    };
  }

  if (measuredValue.value >= 0) {
    return {
      explanation: {
        detail:
          "Price is below or near the Graham Number, but the default margin threshold is not met.",
        summary: "Margin of safety is positive but below the default threshold.",
      },
      id: "valuation.margin_of_safety",
      measuredValue,
      status: "warning",
      threshold,
    };
  }

  return {
    explanation: {
      summary: "Cached price is above the Graham Number.",
    },
    id: "valuation.margin_of_safety",
    measuredValue,
    status: "fail",
    threshold,
  };
}

function chooseValuationBucket(
  ruleChecks: RuleCheckResult[],
  score: number,
): ValuationScoreBucket {
  const marginRule = ruleChecks.find(
    (ruleCheck) => ruleCheck.id === "valuation.margin_of_safety",
  );
  const peRule = ruleChecks.find(
    (ruleCheck) => ruleCheck.id === "valuation.pe_ratio",
  );
  const pbRule = ruleChecks.find(
    (ruleCheck) => ruleCheck.id === "valuation.pb_ratio",
  );
  const decisiveRuleChecks = getDecisiveRuleChecks(ruleChecks);

  if (decisiveRuleChecks.length === 0) {
    return "insufficient_data";
  }

  if (marginRule?.status === "fail") {
    return "expensive";
  }

  if (peRule?.status === "fail" && pbRule?.status === "fail") {
    return "expensive";
  }

  if (
    marginRule?.status === "pass" &&
    decisiveRuleChecks.every((ruleCheck) => ruleCheck.status === "pass")
  ) {
    return "attractive";
  }

  if (
    marginRule?.status === "warning" &&
    peRule?.status === "pass" &&
    pbRule?.status === "pass"
  ) {
    return "reasonable";
  }

  if (score >= 75 && marginRule?.status !== "warning") {
    return "reasonable";
  }

  return score < 50 ? "expensive" : "watch";
}

function getDecisiveRuleChecks(ruleChecks: RuleCheckResult[]) {
  return ruleChecks.filter(
    (ruleCheck): ruleCheck is RuleCheckResult & {
      status: "fail" | "pass" | "warning";
    } =>
      ruleCheck.status === "pass" ||
      ruleCheck.status === "fail" ||
      ruleCheck.status === "warning",
  );
}

function valuationBucketToLabel(
  bucket: ValuationScoreBucket,
): ValuationScoreResult["label"] {
  switch (bucket) {
    case "attractive":
      return "Attractive";
    case "reasonable":
      return "Reasonable";
    case "watch":
      return "Watch";
    case "expensive":
      return "Expensive";
    case "insufficient_data":
      return "Insufficient Data";
  }
}

function createValuationSummary(
  bucket: ValuationScoreBucket,
  score: number,
  ruleChecks: RuleCheckResult[],
): ValuationScoreResult["explanation"] {
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
    case "attractive":
      return {
        detail: `Valuation score: ${score}.${unavailableDetail}`.trim(),
        summary:
          "Cached valuation metrics pass the default Graham valuation checks.",
      };
    case "reasonable":
      return {
        detail: `Valuation score: ${score}.${unavailableDetail}`.trim(),
        summary:
          "Cached valuation metrics are reasonable under the available Graham checks.",
      };
    case "watch":
      return {
        detail: `Valuation score: ${score}.${unavailableDetail}`.trim(),
        summary:
          "Cached valuation metrics are mixed and should be reviewed cautiously.",
      };
    case "expensive":
      return {
        detail: `Valuation score: ${score}.${unavailableDetail}`.trim(),
        summary: "Fails classic Graham valuation checks.",
      };
    case "insufficient_data":
      return {
        summary:
          "Valuation needs cached P/E, P/B, or a valid cached price and Graham Number.",
      };
  }
}

function normalizeOptionalNumber(value: number | string | null | undefined) {
  if (
    value === null ||
    value === undefined ||
    (typeof value === "string" && value.trim() === "")
  ) {
    return { availability: "missing", value: null } satisfies NormalizedNumber;
  }

  const parsedValue = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(parsedValue)) {
    return { availability: "missing", value: null } satisfies NormalizedNumber;
  }

  return {
    availability: "available",
    value: parsedValue,
  } satisfies NormalizedNumber;
}

function availableResult(value: number): ValuationCalculationResult {
  return {
    availability: "available",
    value: roundMetric(value),
  };
}

function missingResult(reason: string): ValuationCalculationResult {
  return {
    availability: "missing",
    reason,
    value: null,
  };
}

function insufficientResult(reason: string): ValuationCalculationResult {
  return {
    availability: "insufficient",
    reason,
    value: null,
  };
}

function roundMetric(value: number) {
  const multiplier = 10 ** DEFAULT_DECIMAL_PLACES;

  return Math.round((value + Number.EPSILON) * multiplier) / multiplier;
}

function formatMetricName(metricName: ValuationMetricName) {
  switch (metricName) {
    case "book_value_per_share":
      return "Book value per share";
    case "current_price":
      return "Current price";
    case "eps":
      return "EPS";
    case "estimated_value":
      return "Estimated value";
    case "graham_number":
      return "Graham Number";
    case "pb_ratio":
      return "P/B ratio";
    case "pe_ratio":
      return "P/E ratio";
  }
}
