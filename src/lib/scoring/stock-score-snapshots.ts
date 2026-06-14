import { toFiniteNumber } from "../portfolios/totals";
import {
  classifyStockDetailPriceFreshness,
  selectLatestRelevantFundamentals,
  type StockFundamentalInput,
  type StockPriceInput,
} from "../stocks/detail";
import {
  calculateGrahamNumber,
  calculateMarginOfSafetyPercent,
} from "./valuation";
import { createMarketContextScoringInputFromCachedPrices } from "./market-context";
import { scoreStock } from "./stock";
import type { GrahamScoringThresholds } from "./thresholds";
import type {
  ScoringDataFreshness,
  ScoringDataPoint,
  StockScoringInput,
  StockScoringResult,
} from "./types";
import type { Database, Json } from "@/types/supabase";

type StockFundamentalRow =
  Database["public"]["Tables"]["stock_fundamentals"]["Row"];
type StockPriceRow = Database["public"]["Tables"]["stock_prices"]["Row"];
type StockScoreInsert =
  Database["public"]["Tables"]["stock_scores"]["Insert"];
type StockScoreRow = Database["public"]["Tables"]["stock_scores"]["Row"];

type QueryError = {
  message: string;
};

type QueryResult<T> = {
  data: T | null;
  error: QueryError | null;
};

type SelectQuery<T> = {
  eq(column: string, value: string): SelectQuery<T>;
  limit(count: number): PromiseLike<QueryResult<T[]>>;
  order(column: string, options: { ascending: boolean }): SelectQuery<T>;
};

export type StockScoreSnapshotClient = {
  from(table: "stock_fundamentals"): {
    select(columns: string): SelectQuery<StockFundamentalRow>;
  };
  from(table: "stock_prices"): {
    select(columns: string): SelectQuery<StockPriceRow>;
  };
  from(table: "stock_scores"): {
    insert(values: StockScoreInsert): {
      select(columns: string): {
        single(): PromiseLike<QueryResult<StockScoreRow>>;
      };
    };
  };
};

export type PersistStockScoreSnapshotOptions = {
  currentDate?: Date;
  thresholds?: GrahamScoringThresholds;
};

export type PersistStockScoreSnapshotResult =
  | {
      ok: true;
      snapshot: StockScoreRow;
      scoringResult: StockScoringResult;
    }
  | {
      ok: false;
      error: {
        code: "cached_data_read_failed" | "snapshot_write_failed";
        message: string;
      };
    };

const FUNDAMENTAL_COLUMNS = [
  "id",
  "symbol",
  "fiscal_period",
  "fiscal_year",
  "period_type",
  "eps",
  "book_value_per_share",
  "pe_ratio",
  "pb_ratio",
  "debt_to_equity",
  "current_ratio",
  "dividend_yield",
  "revenue",
  "net_income",
  "free_cash_flow",
  "total_debt",
  "total_equity",
  "created_at",
].join(", ");
const PRICE_COLUMNS = [
  "id",
  "symbol",
  "price_date",
  "open",
  "high",
  "low",
  "close",
  "volume",
  "created_at",
].join(", ");
const MAX_PRICE_ROWS_FOR_CONTEXT = 370;
const MAX_FUNDAMENTAL_ROWS = 12;

export async function persistStockScoreSnapshotForSymbol(
  supabase: StockScoreSnapshotClient,
  symbol: string,
  {
    currentDate = new Date(),
    thresholds,
  }: PersistStockScoreSnapshotOptions = {},
): Promise<PersistStockScoreSnapshotResult> {
  const normalizedSymbol = normalizeStockScoreSymbol(symbol);
  const cachedRows = await readCachedStockScoringRows(
    supabase,
    normalizedSymbol,
  );

  if (!cachedRows.ok) {
    return cachedRows;
  }

  const scoringInput = createStockScoringInputFromCachedRows({
    currentDate,
    fundamentals: cachedRows.fundamentals,
    priceRows: cachedRows.priceRows,
    symbol: normalizedSymbol,
  });
  const scoringResult = scoreStock(scoringInput, { currentDate, thresholds });
  const snapshot = toStockScoreInsert(scoringResult, scoringInput);
  const { data, error } = await supabase
    .from("stock_scores")
    .insert(snapshot)
    .select("*")
    .single();

  if (error || !data) {
    return {
      ok: false,
      error: {
        code: "snapshot_write_failed",
        message: `Could not persist stock score snapshot for ${normalizedSymbol}: ${
          error?.message ?? "No inserted row was returned."
        }`,
      },
    };
  }

  return {
    ok: true,
    scoringResult,
    snapshot: data,
  };
}

export function createStockScoringInputFromCachedRows({
  currentDate = new Date(),
  fundamentals,
  priceRows,
  symbol,
}: {
  currentDate?: Date;
  fundamentals: StockFundamentalInput | null;
  priceRows: StockPriceInput[];
  symbol: string;
}): StockScoringInput {
  const normalizedSymbol = normalizeStockScoreSymbol(symbol);
  const latestPrice = selectLatestPriceRow(priceRows);
  const currentPrice = createCachedPriceDataPoint(latestPrice, currentDate);
  const eps = createFundamentalDataPoint(fundamentals, "eps", normalizedSymbol);
  const bookValuePerShare = createFundamentalDataPoint(
    fundamentals,
    "book_value_per_share",
    normalizedSymbol,
  );
  const grahamNumber = createDerivedMetricDataPoint(
    calculateGrahamNumber({
      bookValuePerShare: bookValuePerShare.value,
      eps: eps.value,
    }),
    latestNonNullAsOfDate([eps, bookValuePerShare]),
  );
  const marginOfSafetyPercent = createDerivedMetricDataPoint(
    calculateMarginOfSafetyPercent({
      currentPrice: currentPrice.value,
      estimatedValue: grahamNumber.value,
    }),
    latestNonNullAsOfDate([currentPrice, grahamNumber]),
  );

  return {
    marketContext: createMarketContextScoringInputFromCachedPrices({
      currentDate,
      priceRows,
    }),
    quality: {
      dividendConsistency: null,
      earningsStability: createUnavailableDerivedMetricDataPoint(
        "insufficient",
        fundamentalAsOfDate(fundamentals),
        "Cached fundamentals do not include enough earnings history yet.",
      ),
      eps,
      freeCashFlow: createFundamentalDataPoint(
        fundamentals,
        "free_cash_flow",
        normalizedSymbol,
      ),
      netIncome: createFundamentalDataPoint(
        fundamentals,
        "net_income",
        normalizedSymbol,
      ),
      revenue: createFundamentalDataPoint(
        fundamentals,
        "revenue",
        normalizedSymbol,
      ),
      revenueGrowth: createUnavailableDerivedMetricDataPoint(
        "insufficient",
        fundamentalAsOfDate(fundamentals),
        "Cached fundamentals do not include enough revenue history yet.",
      ),
    },
    safety: {
      currentRatio: createFundamentalDataPoint(
        fundamentals,
        "current_ratio",
        normalizedSymbol,
      ),
      debtToEquity: createFundamentalDataPoint(
        fundamentals,
        "debt_to_equity",
        normalizedSymbol,
      ),
      freeCashFlow: createFundamentalDataPoint(
        fundamentals,
        "free_cash_flow",
        normalizedSymbol,
      ),
      totalDebt: createFundamentalDataPoint(
        fundamentals,
        "total_debt",
        normalizedSymbol,
      ),
      totalEquity: createFundamentalDataPoint(
        fundamentals,
        "total_equity",
        normalizedSymbol,
      ),
    },
    symbol: normalizedSymbol,
    valuation: {
      bookValuePerShare,
      currentPrice,
      eps,
      grahamNumber,
      marginOfSafetyPercent,
      pbRatio: createFundamentalDataPoint(
        fundamentals,
        "pb_ratio",
        normalizedSymbol,
      ),
      peRatio: createFundamentalDataPoint(
        fundamentals,
        "pe_ratio",
        normalizedSymbol,
      ),
    },
  };
}

async function readCachedStockScoringRows(
  supabase: StockScoreSnapshotClient,
  symbol: string,
): Promise<
  | {
      ok: true;
      fundamentals: StockFundamentalInput | null;
      priceRows: StockPriceInput[];
    }
  | Extract<PersistStockScoreSnapshotResult, { ok: false }>
> {
  const [fundamentalsResult, pricesResult] = await Promise.all([
    supabase
      .from("stock_fundamentals")
      .select(FUNDAMENTAL_COLUMNS)
      .eq("symbol", symbol)
      .order("fiscal_year", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(MAX_FUNDAMENTAL_ROWS),
    supabase
      .from("stock_prices")
      .select(PRICE_COLUMNS)
      .eq("symbol", symbol)
      .order("price_date", { ascending: false })
      .limit(MAX_PRICE_ROWS_FOR_CONTEXT),
  ]);

  if (fundamentalsResult.error || pricesResult.error) {
    return {
      ok: false,
      error: {
        code: "cached_data_read_failed",
        message: `Could not read cached scoring data for ${symbol}: ${
          fundamentalsResult.error?.message ??
          pricesResult.error?.message ??
          "Unknown read error."
        }`,
      },
    };
  }

  return {
    ok: true,
    fundamentals: selectLatestRelevantFundamentals(
      fundamentalsResult.data ?? [],
    ),
    priceRows: pricesResult.data ?? [],
  };
}

function toStockScoreInsert(
  scoringResult: StockScoringResult,
  input: StockScoringInput,
): StockScoreInsert {
  return {
    explanation_json: toJson({
      input,
      result: scoringResult,
      schemaVersion: 1,
    }),
    market_context_score: scoringResult.layers.market_context.score,
    overall_label: scoringResult.label,
    quality_score: scoringResult.layers.quality.score,
    safety_score: scoringResult.layers.safety.score,
    scored_at: scoringResult.scoredAt,
    symbol: scoringResult.symbol,
    valuation_score: scoringResult.layers.valuation.score,
  };
}

function createFundamentalDataPoint(
  fundamentals: StockFundamentalInput | null,
  metric: keyof Pick<
    StockFundamentalInput,
    | "book_value_per_share"
    | "current_ratio"
    | "debt_to_equity"
    | "eps"
    | "free_cash_flow"
    | "net_income"
    | "pb_ratio"
    | "pe_ratio"
    | "revenue"
    | "total_debt"
    | "total_equity"
  >,
  symbol: string,
): ScoringDataPoint {
  const value = toFiniteNumber(fundamentals?.[metric]);
  const asOfDate = fundamentalAsOfDate(fundamentals);

  if (value === null) {
    return {
      availability: "missing",
      asOfDate,
      freshness: "unknown",
      reason: fundamentals
        ? `${formatMetricName(metric)} is missing in cached fundamentals.`
        : `No cached fundamentals are available for ${symbol}.`,
      source: "cached_fundamentals",
      value: null,
    };
  }

  return {
    availability: "available",
    asOfDate,
    freshness: "unknown",
    source: "cached_fundamentals",
    value,
  };
}

function createCachedPriceDataPoint(
  price: StockPriceInput | null,
  currentDate: Date,
): ScoringDataPoint {
  const value = toFiniteNumber(price?.close);

  if (!price || value === null) {
    return {
      availability: "missing",
      asOfDate: price?.price_date ?? null,
      freshness: "unknown",
      reason: "No cached close price is available.",
      source: "cached_price",
      value: null,
    };
  }

  return {
    availability: "available",
    asOfDate: price.price_date,
    freshness: mapPriceFreshness(
      classifyStockDetailPriceFreshness(price.price_date, currentDate).status,
    ),
    source: "cached_price",
    value,
  };
}

function createDerivedMetricDataPoint(
  calculation:
    | {
        availability: "available";
        value: number;
      }
    | {
        availability: "missing" | "insufficient";
        reason: string;
        value: null;
      },
  asOfDate: string | null,
): ScoringDataPoint {
  if (calculation.availability !== "available") {
    return createUnavailableDerivedMetricDataPoint(
      calculation.availability,
      asOfDate,
      calculation.reason,
    );
  }

  return {
    availability: "available",
    asOfDate,
    freshness: "unknown",
    source: "derived_metric",
    value: calculation.value,
  };
}

function createUnavailableDerivedMetricDataPoint(
  availability: "missing" | "insufficient",
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

function selectLatestPriceRow(priceRows: StockPriceInput[]) {
  if (priceRows.length === 0) {
    return null;
  }

  return [...priceRows].sort((first, second) =>
    second.price_date.localeCompare(first.price_date),
  )[0];
}

function fundamentalAsOfDate(fundamentals: StockFundamentalInput | null) {
  if (!fundamentals) {
    return null;
  }

  return `${fundamentals.fiscal_year} ${fundamentals.fiscal_period}`;
}

function latestNonNullAsOfDate(points: ScoringDataPoint[]) {
  return points.find((point) => point.asOfDate !== null)?.asOfDate ?? null;
}

function mapPriceFreshness(
  status: ReturnType<typeof classifyStockDetailPriceFreshness>["status"],
): ScoringDataFreshness {
  switch (status) {
    case "fresh":
      return "fresh";
    case "stale":
      return "stale";
    case "unavailable":
      return "unknown";
  }
}

function normalizeStockScoreSymbol(symbol: string) {
  return symbol.trim().toUpperCase();
}

function formatMetricName(metric: string) {
  return metric.replaceAll("_", " ");
}

function toJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}
