export type ScoringDataSource =
  | "cached_fundamentals"
  | "cached_price"
  | "derived_metric"
  | "manual_portfolio_context";

export type ScoringDataFreshness = "fresh" | "stale" | "unknown";

export type ScoringDataPoint<T = number> =
  | {
      availability: "available";
      asOfDate: string | null;
      freshness: ScoringDataFreshness;
      source: ScoringDataSource;
      value: T;
    }
  | {
      availability: "missing" | "insufficient";
      asOfDate: string | null;
      freshness: "unknown";
      reason: string;
      source: ScoringDataSource;
      value: null;
    };

export type StockScoreLabel =
  | "Attractive"
  | "Reasonable"
  | "Watch"
  | "Expensive"
  | "Avoid / Review"
  | "Insufficient Data";

export type PortfolioFitLabel =
  | "Underweight"
  | "Balanced"
  | "Overweight"
  | "Concentration Risk"
  | "Cash Constrained"
  | "Do Not Add"
  | "Review Position"
  | "Insufficient Data";

export type StockScoreLayerId =
  | "valuation"
  | "quality"
  | "safety"
  | "market_context";

export type RuleCheckStatus =
  | "pass"
  | "fail"
  | "warning"
  | "unavailable"
  | "insufficient_data"
  | "not_applicable";

export type RuleThresholdOperator =
  | "below_or_equal"
  | "above_or_equal"
  | "below"
  | "above"
  | "equals";

export type RuleThreshold = {
  label: string;
  operator: RuleThresholdOperator;
  unit: "currency" | "number" | "percent" | "ratio";
  value: number;
};

export type RuleExplanation = {
  detail?: string;
  summary: string;
};

export type RuleCheckResult = {
  id: string;
  explanation: RuleExplanation;
  measuredValue: ScoringDataPoint | ScoringDataPoint<boolean> | null;
  status: RuleCheckStatus;
  threshold: RuleThreshold | null;
};

export type ScoreLayerStatus = "scored" | "insufficient_data";

export type ScoreLayerResult = {
  explanation: RuleExplanation;
  id: StockScoreLayerId;
  ruleChecks: RuleCheckResult[];
  score: number | null;
  status: ScoreLayerStatus;
};

export type StockValuationScoringInput = {
  bookValuePerShare: ScoringDataPoint;
  currentPrice: ScoringDataPoint;
  eps: ScoringDataPoint;
  grahamNumber: ScoringDataPoint;
  marginOfSafetyPercent: ScoringDataPoint;
  pbRatio: ScoringDataPoint;
  peRatio: ScoringDataPoint;
};

export type StockQualityScoringInput = {
  dividendConsistency: ScoringDataPoint<boolean> | null;
  earningsStability: ScoringDataPoint;
  eps: ScoringDataPoint;
  freeCashFlow: ScoringDataPoint;
  netIncome: ScoringDataPoint;
  revenue: ScoringDataPoint;
  revenueGrowth: ScoringDataPoint;
};

export type StockSafetyScoringInput = {
  currentRatio: ScoringDataPoint;
  debtToEquity: ScoringDataPoint;
  freeCashFlow: ScoringDataPoint;
  totalDebt: ScoringDataPoint;
  totalEquity: ScoringDataPoint;
};

export type StockMarketContextScoringInput = {
  fiftyDayMovingAverage: ScoringDataPoint;
  fiftyTwoWeekHigh: ScoringDataPoint;
  fiftyTwoWeekLow: ScoringDataPoint;
  oneMonthMovementPercent: ScoringDataPoint;
  oneWeekMovementPercent: ScoringDataPoint;
  oneYearMovementPercent: ScoringDataPoint;
  sixMonthMovementPercent: ScoringDataPoint;
  twoHundredDayMovingAverage: ScoringDataPoint;
};

export type StockScoringInput = {
  marketContext: StockMarketContextScoringInput;
  quality: StockQualityScoringInput;
  safety: StockSafetyScoringInput;
  symbol: string;
  valuation: StockValuationScoringInput;
};

export type StockLabelReason = {
  layerId: StockScoreLayerId;
  ruleId: string;
  status: RuleCheckStatus;
  summary: string;
};

export type StockScoringExplanation = {
  caution: string;
  dominantRules: StockLabelReason[];
  layerSummaries: Record<StockScoreLayerId, RuleExplanation>;
  summary: string;
};

export type StockScoringResult = {
  explanation: StockScoringExplanation;
  label: StockScoreLabel;
  layers: Record<StockScoreLayerId, ScoreLayerResult>;
  scoredAt: string;
  symbol: string;
};
