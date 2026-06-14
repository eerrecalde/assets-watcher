import { scoreMarketContextLayer, type MarketContextScoreResult } from "./market-context";
import { scoreQualityLayer, type QualityScoreResult } from "./quality";
import { scoreSafetyLayer, type SafetyScoreResult } from "./safety";
import {
  DEFAULT_GRAHAM_SCORING_THRESHOLDS,
  type GrahamScoringThresholds,
} from "./thresholds";
import type {
  RuleCheckResult,
  RuleCheckStatus,
  StockLabelReason,
  StockScoreLabel,
  StockScoreLayerId,
  StockScoringInput,
  StockScoringResult,
} from "./types";
import { scoreValuationLayer, type ValuationScoreResult } from "./valuation";

export type StockLayerResults = {
  market_context: MarketContextScoreResult;
  quality: QualityScoreResult;
  safety: SafetyScoreResult;
  valuation: ValuationScoreResult;
};

export type ScoreStockOptions = {
  currentDate?: Date;
  thresholds?: GrahamScoringThresholds;
};

const CAUTION_COPY =
  "This label explains cached deterministic checks for educational review and is not financial advice.";
const MAX_DOMINANT_RULES = 4;

export function scoreStock(
  input: StockScoringInput,
  {
    currentDate = new Date(),
    thresholds = DEFAULT_GRAHAM_SCORING_THRESHOLDS,
  }: ScoreStockOptions = {},
): StockScoringResult {
  const layers: StockLayerResults = {
    market_context: scoreMarketContextLayer(input.marketContext),
    quality: scoreQualityLayer(input.quality),
    safety: scoreSafetyLayer(input.safety, thresholds),
    valuation: scoreValuationLayer(input.valuation, thresholds),
  };
  const label = chooseStockLabel(layers);

  return {
    explanation: {
      caution: CAUTION_COPY,
      dominantRules: selectDominantRules(label, layers),
      layerSummaries: {
        market_context: layers.market_context.explanation,
        quality: layers.quality.explanation,
        safety: layers.safety.explanation,
        valuation: layers.valuation.explanation,
      },
      summary: createStockLabelSummary(label, layers),
    },
    label,
    layers,
    scoredAt: currentDate.toISOString(),
    symbol: input.symbol.toUpperCase(),
  };
}

function chooseStockLabel(layers: StockLayerResults): StockScoreLabel {
  const { market_context: marketContext, quality, safety, valuation } = layers;
  const valuationLabel = valuation.label;

  if (valuation.status === "insufficient_data") {
    return "Insufficient Data";
  }

  if (
    quality.status === "insufficient_data" &&
    safety.status === "insufficient_data"
  ) {
    return "Insufficient Data";
  }

  if (
    (valuationLabel === "Expensive" &&
      (quality.bucket === "weak" || safety.bucket === "weak")) ||
    (quality.bucket === "weak" && safety.bucket === "weak")
  ) {
    return "Avoid / Review";
  }

  if (valuationLabel === "Expensive") {
    return "Expensive";
  }

  if (
    quality.status === "insufficient_data" ||
    safety.status === "insufficient_data"
  ) {
    return "Watch";
  }

  if (
    valuationLabel === "Watch" ||
    quality.bucket === "weak" ||
    safety.bucket === "weak"
  ) {
    return "Watch";
  }

  if (quality.bucket === "mixed" || safety.bucket === "mixed") {
    return valuationLabel === "Attractive" ? "Reasonable" : "Watch";
  }

  if (
    marketContext.status === "insufficient_data" ||
    marketContext.bucket === "limited" ||
    marketContext.bucket === "stale"
  ) {
    return valuationLabel === "Attractive" ? "Reasonable" : valuationLabel;
  }

  return valuationLabel;
}

function createStockLabelSummary(
  label: StockScoreLabel,
  layers: StockLayerResults,
): string {
  switch (label) {
    case "Attractive":
      return "Cached valuation, business quality, financial safety, and market context checks support an Attractive label under the deterministic rules.";
    case "Reasonable":
      return "Cached deterministic checks support a Reasonable label, with at least one layer limiting a stronger label.";
    case "Watch":
      return "Cached deterministic checks are mixed or incomplete, so this stock is labeled Watch.";
    case "Expensive":
      return "Cached valuation checks indicate an Expensive label under the deterministic rules.";
    case "Avoid / Review":
      return "Cached deterministic checks show expensive valuation or weak fundamentals that call for extra review.";
    case "Insufficient Data":
      return createInsufficientDataSummary(layers);
  }
}

function createInsufficientDataSummary(layers: StockLayerResults): string {
  const insufficientLayerNames = orderedLayerEntries(layers)
    .filter(([, layer]) => layer.status === "insufficient_data")
    .map(([layerId]) => formatLayerName(layerId));

  if (insufficientLayerNames.length === 0) {
    return "There is not enough cached data to score this stock.";
  }

  return `There is not enough cached data to score this stock. Missing layer coverage: ${insufficientLayerNames.join(", ")}.`;
}

function selectDominantRules(
  label: StockScoreLabel,
  layers: StockLayerResults,
): StockLabelReason[] {
  const ruleChecks = orderedLayerEntries(layers).flatMap(
    ([layerId, layer]) => {
      return layer.ruleChecks.map((ruleCheck) =>
        toStockLabelReason(layerId, ruleCheck),
      );
    },
  );
  const preferredStatuses = getPreferredStatuses(label);

  return ruleChecks
    .filter((ruleCheck) => preferredStatuses.includes(ruleCheck.status))
    .slice(0, MAX_DOMINANT_RULES);
}

function getPreferredStatuses(label: StockScoreLabel): RuleCheckStatus[] {
  switch (label) {
    case "Attractive":
    case "Reasonable":
      return ["pass", "warning"];
    case "Watch":
      return ["warning", "fail", "unavailable", "insufficient_data"];
    case "Expensive":
    case "Avoid / Review":
      return ["fail", "warning"];
    case "Insufficient Data":
      return ["unavailable", "insufficient_data"];
  }
}

function toStockLabelReason(
  layerId: StockScoreLayerId,
  ruleCheck: RuleCheckResult,
): StockLabelReason {
  return {
    layerId,
    ruleId: ruleCheck.id,
    status: ruleCheck.status,
    summary: ruleCheck.explanation.summary,
  };
}

function orderedLayerEntries(layers: StockLayerResults) {
  return [
    ["valuation", layers.valuation],
    ["quality", layers.quality],
    ["safety", layers.safety],
    ["market_context", layers.market_context],
  ] as const;
}

function formatLayerName(layerId: StockScoreLayerId) {
  switch (layerId) {
    case "market_context":
      return "market context";
    case "quality":
      return "business quality";
    case "safety":
      return "financial safety";
    case "valuation":
      return "valuation";
  }
}
