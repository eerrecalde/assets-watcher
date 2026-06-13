export type ValuationMetricName =
  | "book_value_per_share"
  | "current_price"
  | "eps"
  | "estimated_value";

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

const DEFAULT_DECIMAL_PLACES = 6;
const GRAHAM_NUMBER_MULTIPLIER = 22.5;

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
  }
}
