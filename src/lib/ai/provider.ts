import type {
  PortfolioFitLabel,
  RuleCheckResult,
  StockScoreLabel,
} from "../scoring/types";

export type AIProviderErrorCode =
  | "invalid_snapshot"
  | "rate_limited"
  | "provider_unavailable"
  | "invalid_response"
  | "safety_blocked"
  | "provider_error";

export type AIProviderUsageMetadata = {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
};

export type AIProviderCostMetadata = {
  currency: string | null;
  estimatedCost: number | null;
};

export type AIProviderResultMetadata = {
  cost: AIProviderCostMetadata | null;
  generatedAt: Date;
  model: string;
  provider: string;
  usage: AIProviderUsageMetadata | null;
};

export type AITakeResult =
  | {
      ok: true;
      data: AITakeOutput;
      metadata: AIProviderResultMetadata;
      warnings: string[];
    }
  | {
      ok: false;
      error: {
        code: AIProviderErrorCode;
        message: string;
      };
      metadata: AIProviderResultMetadata;
    };

export type AITakeOutput = {
  deterministicFactsExplained: string[];
  limitations: string[];
  narrative: string;
};

export type GenerateAITakeRequest = {
  outputPolicy: AITakeOutputPolicy;
  snapshot: AITakePortfolioSnapshot;
};

export type AITakeOutputPolicy = {
  purpose: "explain_deterministic_portfolio_snapshot";
  forbiddenOutputs: readonly AITakeForbiddenOutput[];
  requiredTone: "cautious_educational";
};

export type AITakeForbiddenOutput =
  | "trading_instruction"
  | "personalized_financial_advice"
  | "invented_market_data"
  | "forecast_or_price_target";

export type AITakePortfolioSnapshot = {
  generatedAt: string;
  holdings: AITakeHoldingSnapshot[];
  portfolio: AITakePortfolioSummary;
  rules: AITakeRuleSettingsSnapshot;
  snapshotId?: string;
  watchlist: AITakeWatchlistSnapshot[];
};

export type AITakePortfolioSummary = {
  asOfDate: string | null;
  baseCurrency: string;
  cashAllocationPercent: number | null;
  cashBalance: number | null;
  deterministicFacts: AITakeDeterministicFact[];
  sectorAllocation: AITakeSectorAllocationSnapshot[];
  totalMarketValue: number | null;
  totalPortfolioValue: number | null;
};

export type AITakeRuleSettingsSnapshot = {
  maxDebtToEquity: number;
  maxPb: number;
  maxPe: number;
  maxSectorAllocationPercent: number;
  maxSingleStockAllocationPercent: number;
  minCashAllocationPercent: number;
  minCurrentRatio: number;
  minMarginOfSafetyPercent: number;
  source: "defaults" | "stored";
};

export type AITakeSectorAllocationSnapshot = {
  asOfDate: string | null;
  holdingCount: number;
  percentage: number | null;
  sector: string;
  status: "calculated" | "partial-market-data" | "insufficient-data";
};

export type AITakeHoldingSnapshot = {
  allocationPercent: number | null;
  averageCost: number | null;
  companyName: string | null;
  deterministicFacts: AITakeDeterministicFact[];
  latestPrice: AITakePriceSnapshot | null;
  marketValue: number | null;
  portfolioFit: AITakePortfolioFitSnapshot | null;
  quantity: number;
  sector: string | null;
  stockScore: AITakeStockScoreSnapshot | null;
  symbol: string;
  unrealizedGainLoss: number | null;
  unrealizedGainLossPercent: number | null;
};

export type AITakeWatchlistSnapshot = {
  companyName: string | null;
  deterministicFacts: AITakeDeterministicFact[];
  latestPrice: AITakePriceSnapshot | null;
  sector: string | null;
  stockScore: AITakeStockScoreSnapshot | null;
  symbol: string;
};

export type AITakePriceSnapshot = {
  asOfDate: string | null;
  currency: string;
  freshness: "fresh" | "stale" | "unknown";
  value: number;
};

export type AITakeStockScoreSnapshot = {
  caution: string;
  label: StockScoreLabel;
  scoredAt: string;
  summary: string;
};

export type AITakePortfolioFitSnapshot = {
  caution: string;
  label: PortfolioFitLabel;
  ruleChecks: RuleCheckResult[];
  summary: string;
};

export type AITakeDeterministicFact = {
  asOfDate: string | null;
  description: string;
  source:
    | "cached_market_data"
    | "derived_portfolio_metric"
    | "deterministic_stock_score"
    | "deterministic_portfolio_fit"
    | "manual_portfolio_input";
};

export interface AIProvider {
  readonly id: string;
  readonly displayName: string;
  readonly model: string;
  generateTake(request: GenerateAITakeRequest): Promise<AITakeResult>;
}

export const CAUTIOUS_EDUCATIONAL_AI_TAKE_POLICY = {
  purpose: "explain_deterministic_portfolio_snapshot",
  forbiddenOutputs: [
    "trading_instruction",
    "personalized_financial_advice",
    "invented_market_data",
    "forecast_or_price_target",
  ],
  requiredTone: "cautious_educational",
} as const satisfies AITakeOutputPolicy;

export function createAIProviderSuccess({
  cost = null,
  data,
  generatedAt = new Date(),
  model,
  provider,
  usage = null,
  warnings = [],
}: {
  cost?: AIProviderCostMetadata | null;
  data: AITakeOutput;
  generatedAt?: Date;
  model: string;
  provider: string;
  usage?: AIProviderUsageMetadata | null;
  warnings?: string[];
}): AITakeResult {
  return {
    ok: true,
    data,
    metadata: {
      cost,
      generatedAt,
      model,
      provider,
      usage,
    },
    warnings,
  };
}

export function createAIProviderFailure({
  code,
  cost = null,
  generatedAt = new Date(),
  message,
  model,
  provider,
  usage = null,
}: {
  code: AIProviderErrorCode;
  cost?: AIProviderCostMetadata | null;
  generatedAt?: Date;
  message: string;
  model: string;
  provider: string;
  usage?: AIProviderUsageMetadata | null;
}): AITakeResult {
  return {
    ok: false,
    error: {
      code,
      message,
    },
    metadata: {
      cost,
      generatedAt,
      model,
      provider,
      usage,
    },
  };
}
