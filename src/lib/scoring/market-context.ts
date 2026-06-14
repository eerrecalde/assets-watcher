import {
  classifyStockDetailPriceFreshness,
  createCachedFiftyTwoWeekRange,
  createCachedPriceMovementSummary,
  type CachedMovementWindowId,
  type CachedMovingAverageId,
  type StockPriceInput,
} from "../stocks/detail";
import type {
  RuleCheckResult,
  ScoringDataFreshness,
  ScoringDataPoint,
  ScoreLayerResult,
  StockMarketContextScoringInput,
} from "./types";

export type MarketContextMetricName =
  | "fifty_day_moving_average"
  | "fifty_two_week_high"
  | "fifty_two_week_low"
  | "one_month_movement"
  | "one_week_movement"
  | "one_year_movement"
  | "six_month_movement"
  | "two_hundred_day_moving_average";

export type MarketContextScoreBucket =
  | "complete"
  | "partial"
  | "limited"
  | "stale"
  | "insufficient_data";

export type MarketContextScoreResult = ScoreLayerResult & {
  bucket: MarketContextScoreBucket;
};

export type MarketContextPriceRowInput = Pick<
  StockPriceInput,
  "close" | "high" | "low" | "price_date"
>;

export type CreateMarketContextScoringInputOptions = {
  currentDate?: Date;
  priceRows: MarketContextPriceRowInput[];
};

const RULE_WEIGHTS = {
  fail: 0,
  insufficient_data: 0,
  not_applicable: 0,
  pass: 100,
  unavailable: 0,
  warning: 50,
} as const;

const MOVEMENT_FIELD_BY_ID = {
  "1m": "oneMonthMovementPercent",
  "1w": "oneWeekMovementPercent",
  "1y": "oneYearMovementPercent",
  "6m": "sixMonthMovementPercent",
} satisfies Record<CachedMovementWindowId, keyof StockMarketContextScoringInput>;

const MOVING_AVERAGE_FIELD_BY_ID = {
  "200d": "twoHundredDayMovingAverage",
  "50d": "fiftyDayMovingAverage",
} satisfies Record<CachedMovingAverageId, keyof StockMarketContextScoringInput>;

export function createMarketContextScoringInputFromCachedPrices({
  currentDate = new Date(),
  priceRows,
}: CreateMarketContextScoringInputOptions): StockMarketContextScoringInput {
  const movementSummary = createCachedPriceMovementSummary(priceRows);
  const range = createCachedFiftyTwoWeekRange(priceRows);
  const freshness = mapPriceFreshness(
    classifyStockDetailPriceFreshness(movementSummary.latestDate, currentDate)
      .status,
  );
  const input: StockMarketContextScoringInput = {
    fiftyDayMovingAverage: unavailableDerivedMetric(
      "insufficient",
      movementSummary.latestDate,
      "Needs at least 50 cached daily closes.",
    ),
    fiftyTwoWeekHigh: unavailableDerivedMetric(
      "missing",
      movementSummary.latestDate,
      "No cached price range is available.",
    ),
    fiftyTwoWeekLow: unavailableDerivedMetric(
      "missing",
      movementSummary.latestDate,
      "No cached price range is available.",
    ),
    oneMonthMovementPercent: unavailableDerivedMetric(
      "missing",
      movementSummary.latestDate,
      "No cached close prices are available.",
    ),
    oneWeekMovementPercent: unavailableDerivedMetric(
      "missing",
      movementSummary.latestDate,
      "No cached close prices are available.",
    ),
    oneYearMovementPercent: unavailableDerivedMetric(
      "missing",
      movementSummary.latestDate,
      "No cached close prices are available.",
    ),
    sixMonthMovementPercent: unavailableDerivedMetric(
      "missing",
      movementSummary.latestDate,
      "No cached close prices are available.",
    ),
    twoHundredDayMovingAverage: unavailableDerivedMetric(
      "insufficient",
      movementSummary.latestDate,
      "Needs at least 200 cached daily closes.",
    ),
  };

  for (const movement of movementSummary.movements) {
    const field = MOVEMENT_FIELD_BY_ID[movement.id];

    input[field] =
      movement.percentChange === null
        ? unavailableDerivedMetric(
            "insufficient",
            movement.latestDate,
            movement.unavailableReason ?? "Cached movement is unavailable.",
          )
        : availableDerivedMetric(
            movement.percentChange,
            movement.latestDate,
            freshness,
          );
  }

  for (const movingAverage of movementSummary.movingAverages) {
    const field = MOVING_AVERAGE_FIELD_BY_ID[movingAverage.id];

    input[field] =
      movingAverage.value === null
        ? unavailableDerivedMetric(
            "insufficient",
            movingAverage.endDate,
            movingAverage.unavailableReason ??
              "Cached moving average is unavailable.",
          )
        : availableDerivedMetric(
            movingAverage.value,
            movingAverage.endDate,
            freshness,
          );
  }

  if (range) {
    const rangeDataPoint =
      range.hasFullWindow
        ? availableDerivedMetric(range.high, range.endDate, freshness)
        : unavailableDerivedMetric(
            "insufficient",
            range.endDate,
            `Needs cached prices back to ${range.requiredStartDate} for a full 52-week range.`,
          );

    input.fiftyTwoWeekHigh = rangeDataPoint;
    input.fiftyTwoWeekLow = range.hasFullWindow
      ? availableDerivedMetric(range.low, range.endDate, freshness)
      : rangeDataPoint;
  }

  return input;
}

export function scoreMarketContextLayer(
  input: StockMarketContextScoringInput,
): MarketContextScoreResult {
  const ruleChecks = [
    createContextMetricRuleCheck({
      id: "market_context.one_week_movement",
      measuredValue: input.oneWeekMovementPercent,
      metric: "one_week_movement",
    }),
    createContextMetricRuleCheck({
      id: "market_context.one_month_movement",
      measuredValue: input.oneMonthMovementPercent,
      metric: "one_month_movement",
    }),
    createContextMetricRuleCheck({
      id: "market_context.six_month_movement",
      measuredValue: input.sixMonthMovementPercent,
      metric: "six_month_movement",
    }),
    createContextMetricRuleCheck({
      id: "market_context.one_year_movement",
      measuredValue: input.oneYearMovementPercent,
      metric: "one_year_movement",
    }),
    createContextMetricRuleCheck({
      id: "market_context.fifty_two_week_high",
      measuredValue: input.fiftyTwoWeekHigh,
      metric: "fifty_two_week_high",
    }),
    createContextMetricRuleCheck({
      id: "market_context.fifty_two_week_low",
      measuredValue: input.fiftyTwoWeekLow,
      metric: "fifty_two_week_low",
    }),
    createContextMetricRuleCheck({
      id: "market_context.fifty_day_moving_average",
      measuredValue: input.fiftyDayMovingAverage,
      metric: "fifty_day_moving_average",
    }),
    createContextMetricRuleCheck({
      id: "market_context.two_hundred_day_moving_average",
      measuredValue: input.twoHundredDayMovingAverage,
      metric: "two_hundred_day_moving_average",
    }),
  ] satisfies RuleCheckResult[];
  const availableRuleChecks = ruleChecks.filter(
    (ruleCheck) =>
      ruleCheck.status === "pass" || ruleCheck.status === "warning",
  );

  if (availableRuleChecks.length === 0) {
    return {
      bucket: "insufficient_data",
      explanation: {
        detail:
          "Cached price history is unavailable or too short for market context scoring.",
        summary:
          "Market context needs cached daily closes before it can provide historical context.",
      },
      id: "market_context",
      ruleChecks,
      score: null,
      status: "insufficient_data",
    };
  }

  const score = Math.round(
    ruleChecks.reduce((total, ruleCheck) => {
      return total + RULE_WEIGHTS[ruleCheck.status];
    }, 0) / ruleChecks.length,
  );
  const bucket = chooseMarketContextBucket(ruleChecks, score);

  return {
    bucket,
    explanation: createMarketContextSummary(bucket, score, ruleChecks),
    id: "market_context",
    ruleChecks,
    score,
    status: "scored",
  };
}

function createContextMetricRuleCheck({
  id,
  measuredValue,
  metric,
}: {
  id: string;
  measuredValue: ScoringDataPoint;
  metric: MarketContextMetricName;
}): RuleCheckResult {
  if (measuredValue.availability !== "available") {
    return {
      explanation: {
        detail: measuredValue.reason,
        summary:
          measuredValue.availability === "insufficient"
            ? `${formatMetricName(metric)} needs more cached price history.`
            : `${formatMetricName(metric)} is unavailable in cached prices.`,
      },
      id,
      measuredValue,
      status:
        measuredValue.availability === "insufficient"
          ? "insufficient_data"
          : "unavailable",
      threshold: null,
    };
  }

  if (measuredValue.freshness === "stale") {
    return {
      explanation: {
        detail: measuredValue.asOfDate
          ? `Latest cached close context is as of ${measuredValue.asOfDate}.`
          : undefined,
        summary: `${formatMetricName(metric)} is available only as stale cached context.`,
      },
      id,
      measuredValue,
      status: "warning",
      threshold: null,
    };
  }

  return {
    explanation: {
      detail: measuredValue.asOfDate
        ? `Calculated from cached prices as of ${measuredValue.asOfDate}.`
        : undefined,
      summary: `${formatMetricName(metric)} is available from cached prices.`,
    },
    id,
    measuredValue,
    status: "pass",
    threshold: null,
  };
}

function chooseMarketContextBucket(
  ruleChecks: RuleCheckResult[],
  score: number,
): MarketContextScoreBucket {
  if (ruleChecks.some((ruleCheck) => ruleCheck.status === "warning")) {
    return "stale";
  }

  if (score >= 90) {
    return "complete";
  }

  if (score >= 50) {
    return "partial";
  }

  return "limited";
}

function createMarketContextSummary(
  bucket: MarketContextScoreBucket,
  score: number,
  ruleChecks: RuleCheckResult[],
): MarketContextScoreResult["explanation"] {
  const unavailableCount = ruleChecks.filter(
    (ruleCheck) =>
      ruleCheck.status === "unavailable" ||
      ruleCheck.status === "insufficient_data",
  ).length;
  const unavailableDetail =
    unavailableCount > 0
      ? ` ${unavailableCount} context metric${
          unavailableCount === 1 ? "" : "s"
        } could not be evaluated from cached history.`
      : "";

  switch (bucket) {
    case "complete":
      return {
        detail: `Market context score: ${score}.${unavailableDetail}`.trim(),
        summary:
          "Cached price history covers all available market context checks.",
      };
    case "partial":
      return {
        detail: `Market context score: ${score}.${unavailableDetail}`.trim(),
        summary:
          "Cached price history covers some market context checks, with shorter windows omitted.",
      };
    case "limited":
      return {
        detail: `Market context score: ${score}.${unavailableDetail}`.trim(),
        summary:
          "Cached price history provides limited market context and should be read cautiously.",
      };
    case "stale":
      return {
        detail: `Market context score: ${score}.${unavailableDetail}`.trim(),
        summary:
          "Market context is based on stale cached prices and should be treated as historical context.",
      };
    case "insufficient_data":
      return {
        summary:
          "Market context needs cached daily closes before it can provide historical context.",
      };
  }
}

function availableDerivedMetric(
  value: number,
  asOfDate: string | null,
  freshness: ScoringDataFreshness,
): ScoringDataPoint {
  return {
    availability: "available",
    asOfDate,
    freshness,
    source: "derived_metric",
    value,
  };
}

function unavailableDerivedMetric(
  availability: "insufficient" | "missing",
  asOfDate: string | null,
  reason: string,
): ScoringDataPoint {
  return {
    availability,
    asOfDate,
    freshness: "unknown",
    reason,
    source: "derived_metric",
    value: null,
  };
}

function mapPriceFreshness(
  status: ReturnType<typeof classifyStockDetailPriceFreshness>["status"],
): ScoringDataFreshness {
  if (status === "fresh") {
    return "fresh";
  }

  if (status === "stale") {
    return "stale";
  }

  return "unknown";
}

function formatMetricName(metricName: MarketContextMetricName) {
  switch (metricName) {
    case "fifty_day_moving_average":
      return "50-day moving average";
    case "fifty_two_week_high":
      return "52-week high";
    case "fifty_two_week_low":
      return "52-week low";
    case "one_month_movement":
      return "1-month movement";
    case "one_week_movement":
      return "1-week movement";
    case "one_year_movement":
      return "1-year movement";
    case "six_month_movement":
      return "6-month movement";
    case "two_hundred_day_moving_average":
      return "200-day moving average";
  }
}
