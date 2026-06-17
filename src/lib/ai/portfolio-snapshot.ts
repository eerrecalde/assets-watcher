import {
  calculateCashAllocation,
  calculateHoldingValue,
  calculatePortfolioTotals,
  calculatePositionAllocation,
  calculateSectorAllocations,
  toFiniteNumber,
} from "../portfolios/totals";
import {
  loadUserRuleThresholds,
  type LoadUserRuleThresholdsResult,
} from "../scoring/user-rules";
import { classifyStockDetailPriceFreshness } from "../stocks/detail";
import type {
  AITakeDeterministicFact,
  AITakeHoldingSnapshot,
  AITakePortfolioFitSnapshot,
  AITakePortfolioSnapshot,
  AITakePriceSnapshot,
  AITakeSectorAllocationSnapshot,
  AITakeStockScoreSnapshot,
  AITakeWatchlistSnapshot,
} from "./provider";
import type { Database } from "@/types/supabase";

type HoldingRow = Database["public"]["Tables"]["holdings"]["Row"];
type PortfolioRow = Database["public"]["Tables"]["portfolios"]["Row"];
type PortfolioCashRow = Database["public"]["Tables"]["portfolio_cash"]["Row"];
type PortfolioScoreRow =
  Database["public"]["Tables"]["portfolio_stock_scores"]["Row"];
type StockPriceRow = Database["public"]["Tables"]["stock_prices"]["Row"];
type StockRow = Database["public"]["Tables"]["stocks"]["Row"];
type StockScoreRow = Database["public"]["Tables"]["stock_scores"]["Row"];
type WatchlistItemRow =
  Database["public"]["Tables"]["watchlist_items"]["Row"];

type QueryError = {
  message: string;
};

type PortfolioSnapshotQuery = PromiseLike<{
  data: unknown[] | null;
  error: QueryError | null;
}> & {
  eq(column: string, value: unknown): PortfolioSnapshotQuery;
  in(column: string, values: unknown[]): PortfolioSnapshotQuery;
  limit(count: number): PortfolioSnapshotQuery;
  maybeSingle(): PromiseLike<{
    data: unknown | null;
    error: QueryError | null;
  }>;
  order(
    column: string,
    options: { ascending: boolean },
  ): PortfolioSnapshotQuery;
};

type PortfolioSnapshotClient = {
  from(table: string): {
    select(columns: string): PortfolioSnapshotQuery;
  };
};

export type GeneratePortfolioSnapshotUser = {
  id: string;
};

export type GeneratePortfolioSnapshotOptions = {
  currentDate?: Date;
  portfolioId?: string;
};

export type GeneratePortfolioSnapshotResult =
  | {
      ok: true;
      snapshot: AITakePortfolioSnapshot;
    }
  | {
      ok: false;
      error: {
        code:
          | "portfolio_not_found"
          | "portfolio_read_failed"
          | "portfolio_data_read_failed"
          | "rules_read_failed";
        message: string;
      };
    };

type PortfolioSnapshotRows = {
  cashRows: Pick<PortfolioCashRow, "amount" | "currency" | "updated_at">[];
  holdings: Pick<
    HoldingRow,
    "average_cost" | "currency" | "quantity" | "symbol"
  >[];
  portfolioScores: Pick<
    PortfolioScoreRow,
    "explanation_json" | "portfolio_fit_label" | "scored_at" | "symbol"
  >[];
  prices: Pick<
    StockPriceRow,
    "close" | "created_at" | "price_date" | "symbol"
  >[];
  stockScores: Pick<
    StockScoreRow,
    "explanation_json" | "overall_label" | "scored_at" | "symbol"
  >[];
  stocks: Pick<StockRow, "currency" | "name" | "sector" | "symbol">[];
  watchlistItems: Pick<WatchlistItemRow, "symbol">[];
};

type StockScoreExplanationJson = {
  result?: {
    explanation?: {
      caution?: unknown;
      summary?: unknown;
    };
  };
};

type PortfolioScoreExplanationJson = {
  result?: {
    explanation?: {
      caution?: unknown;
      summary?: unknown;
    };
    ruleChecks?: unknown;
  };
};

const SNAPSHOT_ID_PREFIX = "portfolio-snapshot";
const MAX_HOLDINGS = 25;
const MAX_WATCHLIST_ITEMS = 25;
const MAX_SECTOR_ALLOCATIONS = 12;

export async function generatePortfolioSnapshotForAITake(
  supabase: PortfolioSnapshotClient,
  user: GeneratePortfolioSnapshotUser,
  {
    currentDate = new Date(),
    portfolioId,
  }: GeneratePortfolioSnapshotOptions = {},
): Promise<GeneratePortfolioSnapshotResult> {
  const portfolioResult = await loadPortfolio(supabase, user.id, portfolioId);

  if (!portfolioResult.ok) {
    return portfolioResult;
  }

  const [rowsResult, rulesResult] = await Promise.all([
    loadPortfolioSnapshotRows(supabase, portfolioResult.portfolio.id, user.id),
    loadUserRuleThresholds(supabase as never, user.id),
  ]);

  if (!rulesResult.ok) {
    return {
      ok: false,
      error: {
        code: "rules_read_failed",
        message: rulesResult.error.message,
      },
    };
  }

  if (!rowsResult.ok) {
    return rowsResult;
  }

  return {
    ok: true,
    snapshot: createPortfolioSnapshot({
      currentDate,
      portfolio: portfolioResult.portfolio,
      rows: rowsResult.rows,
      rulesResult,
    }),
  };
}

async function loadPortfolio(
  supabase: PortfolioSnapshotClient,
  userId: string,
  portfolioId: string | undefined,
): Promise<
  | {
      ok: true;
      portfolio: Pick<PortfolioRow, "base_currency" | "id">;
    }
  | Extract<
      GeneratePortfolioSnapshotResult,
      { ok: false }
    >
> {
  let query = supabase
    .from("portfolios")
    .select("id,base_currency")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1);

  if (portfolioId) {
    query = query.eq("id", portfolioId);
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    return {
      ok: false,
      error: {
        code: "portfolio_read_failed",
        message: `Could not load portfolio for AI snapshot: ${error.message}`,
      },
    };
  }

  if (!data) {
    return {
      ok: false,
      error: {
        code: "portfolio_not_found",
        message: "Could not find a portfolio to summarize.",
      },
    };
  }

  return {
    ok: true,
    portfolio: data as Pick<PortfolioRow, "base_currency" | "id">,
  };
}

async function loadPortfolioSnapshotRows(
  supabase: PortfolioSnapshotClient,
  portfolioId: string,
  userId: string,
): Promise<
  | {
      ok: true;
      rows: PortfolioSnapshotRows;
    }
  | Extract<
      GeneratePortfolioSnapshotResult,
      { ok: false }
    >
> {
  const [cashResult, holdingsResult, watchlistResult] = await Promise.all([
    supabase
      .from("portfolio_cash")
      .select("amount,currency,updated_at")
      .eq("portfolio_id", portfolioId),
    supabase
      .from("holdings")
      .select("average_cost,currency,quantity,symbol")
      .eq("portfolio_id", portfolioId)
      .order("symbol", { ascending: true }),
    supabase
      .from("watchlist_items")
      .select("symbol")
      .eq("portfolio_id", portfolioId)
      .eq("user_id", userId)
      .order("symbol", { ascending: true }),
  ]);
  const firstError = firstQueryError([
    cashResult.error,
    holdingsResult.error,
    watchlistResult.error,
  ]);

  if (firstError) {
    return dataReadFailure(firstError);
  }

  const cashRows =
    (cashResult.data as PortfolioSnapshotRows["cashRows"] | null) ?? [];
  const holdings =
    (holdingsResult.data as PortfolioSnapshotRows["holdings"] | null) ?? [];
  const watchlistItems =
    (watchlistResult.data as PortfolioSnapshotRows["watchlistItems"] | null) ??
    [];
  const symbols = uniqueSymbols([
    ...holdings.map((holding) => holding.symbol),
    ...watchlistItems.map((item) => item.symbol),
  ]);

  if (symbols.length === 0) {
    return {
      ok: true,
      rows: {
        cashRows,
        holdings: [],
        portfolioScores: [],
        prices: [],
        stockScores: [],
        stocks: [],
        watchlistItems: [],
      },
    };
  }

  const [stocksResult, pricesResult, stockScoresResult, portfolioScoresResult] =
    await Promise.all([
      supabase
        .from("stocks")
        .select("symbol,name,sector,currency")
        .in("symbol", symbols),
      supabase
        .from("stock_prices")
        .select("symbol,close,price_date,created_at")
        .in("symbol", symbols)
        .order("price_date", { ascending: false }),
      supabase
        .from("stock_scores")
        .select("symbol,overall_label,scored_at,explanation_json")
        .in("symbol", symbols)
        .eq("user_id", userId)
        .order("scored_at", { ascending: false }),
      supabase
        .from("portfolio_stock_scores")
        .select("symbol,portfolio_fit_label,scored_at,explanation_json")
        .eq("portfolio_id", portfolioId)
        .in("symbol", symbols)
        .order("scored_at", { ascending: false }),
    ]);
  const relatedRowsError = firstQueryError([
    stocksResult.error,
    pricesResult.error,
    stockScoresResult.error,
    portfolioScoresResult.error,
  ]);

  if (relatedRowsError) {
    return dataReadFailure(relatedRowsError);
  }

  return {
    ok: true,
    rows: {
      cashRows,
      holdings,
      portfolioScores:
        (portfolioScoresResult.data as
          | PortfolioSnapshotRows["portfolioScores"]
          | null) ?? [],
      prices:
        (pricesResult.data as PortfolioSnapshotRows["prices"] | null) ?? [],
      stockScores:
        (stockScoresResult.data as
          | PortfolioSnapshotRows["stockScores"]
          | null) ?? [],
      stocks:
        (stocksResult.data as PortfolioSnapshotRows["stocks"] | null) ?? [],
      watchlistItems,
    },
  };
}

function createPortfolioSnapshot({
  currentDate,
  portfolio,
  rows,
  rulesResult,
}: {
  currentDate: Date;
  portfolio: Pick<PortfolioRow, "base_currency" | "id">;
  rows: PortfolioSnapshotRows;
  rulesResult: Extract<LoadUserRuleThresholdsResult, { ok: true }>;
}): AITakePortfolioSnapshot {
  const stocksBySymbol = new Map(rows.stocks.map((stock) => [stock.symbol, stock]));
  const latestPricesBySymbol = latestBySymbol(rows.prices, (row) => row.price_date);
  const latestStockScoresBySymbol = latestBySymbol(
    rows.stockScores,
    (row) => row.scored_at,
  );
  const latestPortfolioScoresBySymbol = latestBySymbol(
    rows.portfolioScores,
    (row) => row.scored_at,
  );
  const cashBalance = calculateCashBalance(rows.cashRows, portfolio.base_currency);
  const calculatedHoldings = rows.holdings.map((holding) =>
    calculateHoldingValue({
      averageCost: holding.average_cost,
      latestClose: latestPricesBySymbol.get(holding.symbol)?.close,
      quantity: holding.quantity,
    }),
  );
  const totals = calculatePortfolioTotals(calculatedHoldings, cashBalance);
  const cashAllocation = calculateCashAllocation({
    cashAmountInput: cashBalance,
    holdings: calculatedHoldings,
  });
  const sectorAllocations = calculateSectorAllocations({
    cashAmountInput: cashBalance,
    holdings: rows.holdings.map((holding, index) => ({
      marketValue: calculatedHoldings[index].marketValue,
      sector: stocksBySymbol.get(holding.symbol)?.sector ?? null,
    })),
  });
  const asOfDate = latestAsOfDate(rows.prices.map((price) => price.price_date));
  const holdings = rows.holdings
    .map((holding, index) =>
      createHoldingSnapshot({
        allocationPercent: calculatePositionAllocation({
          cashAmountInput: cashBalance,
          holding: calculatedHoldings[index],
          holdings: calculatedHoldings,
        }).percentage,
        calculatedHolding: calculatedHoldings[index],
        currentDate,
        holding,
        portfolioScore:
          latestPortfolioScoresBySymbol.get(holding.symbol) ?? null,
        price: latestPricesBySymbol.get(holding.symbol) ?? null,
        stock: stocksBySymbol.get(holding.symbol) ?? null,
        stockScore: latestStockScoresBySymbol.get(holding.symbol) ?? null,
      }),
    )
    .sort(compareHoldingsByMarketValue)
    .slice(0, MAX_HOLDINGS);
  const watchlist = rows.watchlistItems
    .map((item) =>
      createWatchlistSnapshot({
        currentDate,
        item,
        price: latestPricesBySymbol.get(item.symbol) ?? null,
        stock: stocksBySymbol.get(item.symbol) ?? null,
        stockScore: latestStockScoresBySymbol.get(item.symbol) ?? null,
      }),
    )
    .slice(0, MAX_WATCHLIST_ITEMS);

  return {
    generatedAt: currentDate.toISOString(),
    holdings,
    portfolio: {
      asOfDate,
      baseCurrency: portfolio.base_currency,
      cashAllocationPercent: cashAllocation.percentage,
      cashBalance,
      deterministicFacts: createPortfolioFacts({
        cashAllocationPercent: cashAllocation.percentage,
        holdingCount: rows.holdings.length,
        marketValueMissingCount: calculatedHoldings.filter(
          (holding) => holding.marketValue === null,
        ).length,
        sectorAllocations,
        totalPortfolioValue: totals.totalPortfolioValue,
      }),
      sectorAllocation: sectorAllocations
        .map(toSectorAllocationSnapshot)
        .sort(compareSectorAllocation)
        .slice(0, MAX_SECTOR_ALLOCATIONS),
      totalMarketValue: totals.hasCachedMarketValues
        ? totals.marketValueTotal
        : null,
      totalPortfolioValue: totals.totalPortfolioValue,
    },
    rules: {
      ...rulesResult.thresholds,
      source: rulesResult.source,
    },
    snapshotId: `${SNAPSHOT_ID_PREFIX}:${portfolio.id}:${currentDate.toISOString()}`,
    watchlist,
  };
}

function createHoldingSnapshot({
  allocationPercent,
  calculatedHolding,
  currentDate,
  holding,
  portfolioScore,
  price,
  stock,
  stockScore,
}: {
  allocationPercent: number | null;
  calculatedHolding: ReturnType<typeof calculateHoldingValue>;
  currentDate: Date;
  holding: Pick<HoldingRow, "average_cost" | "currency" | "quantity" | "symbol">;
  portfolioScore: Pick<
    PortfolioScoreRow,
    "explanation_json" | "portfolio_fit_label" | "scored_at" | "symbol"
  > | null;
  price: Pick<StockPriceRow, "close" | "created_at" | "price_date" | "symbol"> | null;
  stock: Pick<StockRow, "currency" | "name" | "sector" | "symbol"> | null;
  stockScore: Pick<
    StockScoreRow,
    "explanation_json" | "overall_label" | "scored_at" | "symbol"
  > | null;
}): AITakeHoldingSnapshot {
  const latestPrice = createPriceSnapshot(price, stock?.currency ?? holding.currency, currentDate);
  const stockScoreSnapshot = createStockScoreSnapshot(stockScore);
  const portfolioFitSnapshot = createPortfolioFitSnapshot(portfolioScore);
  const unrealizedGainLossPercent =
    calculatedHolding.unrealizedGain === null || calculatedHolding.costBasis <= 0
      ? null
      : (calculatedHolding.unrealizedGain / calculatedHolding.costBasis) * 100;

  return {
    allocationPercent,
    averageCost: calculatedHolding.averageCost,
    companyName: stock?.name ?? null,
    deterministicFacts: createHoldingFacts({
      allocationPercent,
      latestPrice,
      portfolioFitSnapshot,
      stockScoreSnapshot,
      symbol: holding.symbol,
    }),
    latestPrice,
    marketValue: calculatedHolding.marketValue,
    portfolioFit: portfolioFitSnapshot,
    quantity: calculatedHolding.quantity,
    sector: stock?.sector ?? null,
    stockScore: stockScoreSnapshot,
    symbol: holding.symbol,
    unrealizedGainLoss: calculatedHolding.unrealizedGain,
    unrealizedGainLossPercent,
  };
}

function createWatchlistSnapshot({
  currentDate,
  item,
  price,
  stock,
  stockScore,
}: {
  currentDate: Date;
  item: Pick<WatchlistItemRow, "symbol">;
  price: Pick<StockPriceRow, "close" | "created_at" | "price_date" | "symbol"> | null;
  stock: Pick<StockRow, "currency" | "name" | "sector" | "symbol"> | null;
  stockScore: Pick<
    StockScoreRow,
    "explanation_json" | "overall_label" | "scored_at" | "symbol"
  > | null;
}): AITakeWatchlistSnapshot {
  const latestPrice = createPriceSnapshot(price, stock?.currency ?? "USD", currentDate);
  const stockScoreSnapshot = createStockScoreSnapshot(stockScore);

  return {
    companyName: stock?.name ?? null,
    deterministicFacts: createWatchlistFacts({
      latestPrice,
      stockScoreSnapshot,
      symbol: item.symbol,
    }),
    latestPrice,
    sector: stock?.sector ?? null,
    stockScore: stockScoreSnapshot,
    symbol: item.symbol,
  };
}

function createPriceSnapshot(
  price: Pick<StockPriceRow, "close" | "created_at" | "price_date" | "symbol"> | null,
  currency: string,
  currentDate: Date,
): AITakePriceSnapshot | null {
  const value = toFiniteNumber(price?.close);

  if (!price || value === null) {
    return null;
  }

  const freshness = classifyStockDetailPriceFreshness(
    price.price_date,
    currentDate,
  );

  return {
    asOfDate: freshness.asOfDate,
    currency,
    freshness: freshness.status === "unavailable" ? "unknown" : freshness.status,
    value,
  };
}

function createStockScoreSnapshot(
  stockScore: Pick<
    StockScoreRow,
    "explanation_json" | "overall_label" | "scored_at" | "symbol"
  > | null,
): AITakeStockScoreSnapshot | null {
  if (!stockScore) {
    return null;
  }

  const explanation = stockScore.explanation_json as StockScoreExplanationJson;

  return {
    caution: stringOrFallback(
      explanation.result?.explanation?.caution,
      "Use this deterministic score as educational context only.",
    ),
    label: stockScore.overall_label,
    scoredAt: stockScore.scored_at,
    summary: stringOrFallback(
      explanation.result?.explanation?.summary,
      `Deterministic stock score label is ${stockScore.overall_label}.`,
    ),
  };
}

function createPortfolioFitSnapshot(
  portfolioScore: Pick<
    PortfolioScoreRow,
    "explanation_json" | "portfolio_fit_label" | "scored_at" | "symbol"
  > | null,
): AITakePortfolioFitSnapshot | null {
  if (!portfolioScore) {
    return null;
  }

  const explanation =
    portfolioScore.explanation_json as PortfolioScoreExplanationJson;

  return {
    caution: stringOrFallback(
      explanation.result?.explanation?.caution,
      "Use this deterministic portfolio-fit label as educational context only.",
    ),
    label: portfolioScore.portfolio_fit_label,
    ruleChecks: Array.isArray(explanation.result?.ruleChecks)
      ? JSON.parse(JSON.stringify(explanation.result.ruleChecks))
      : [],
    summary: stringOrFallback(
      explanation.result?.explanation?.summary,
      `Deterministic portfolio-fit label is ${portfolioScore.portfolio_fit_label}.`,
    ),
  };
}

function createPortfolioFacts({
  cashAllocationPercent,
  holdingCount,
  marketValueMissingCount,
  sectorAllocations,
  totalPortfolioValue,
}: {
  cashAllocationPercent: number | null;
  holdingCount: number;
  marketValueMissingCount: number;
  sectorAllocations: ReturnType<typeof calculateSectorAllocations>;
  totalPortfolioValue: number;
}): AITakeDeterministicFact[] {
  const facts: AITakeDeterministicFact[] = [
    {
      asOfDate: null,
      description: `Portfolio snapshot includes ${holdingCount} holding${holdingCount === 1 ? "" : "s"} and total portfolio value ${roundForSnapshot(totalPortfolioValue)}.`,
      source: "derived_portfolio_metric",
    },
  ];

  if (cashAllocationPercent !== null) {
    facts.push({
      asOfDate: null,
      description: `Cash allocation is ${roundForSnapshot(cashAllocationPercent)}%.`,
      source: "derived_portfolio_metric",
    });
  }

  const largestSector = sectorAllocations
    .filter((sector) => sector.percentage !== null)
    .sort(compareSectorAllocation)[0];

  if (largestSector?.percentage !== null && largestSector) {
    facts.push({
      asOfDate: null,
      description: `${largestSector.sector} is the largest sector allocation at ${roundForSnapshot(largestSector.percentage)}%.`,
      source: "derived_portfolio_metric",
    });
  }

  if (marketValueMissingCount > 0) {
    facts.push({
      asOfDate: null,
      description: `${marketValueMissingCount} holding${marketValueMissingCount === 1 ? " is" : "s are"} missing cached market value data, so allocation metrics may be partial.`,
      source: "cached_market_data",
    });
  }

  return facts;
}

function createHoldingFacts({
  allocationPercent,
  latestPrice,
  portfolioFitSnapshot,
  stockScoreSnapshot,
  symbol,
}: {
  allocationPercent: number | null;
  latestPrice: AITakePriceSnapshot | null;
  portfolioFitSnapshot: AITakePortfolioFitSnapshot | null;
  stockScoreSnapshot: AITakeStockScoreSnapshot | null;
  symbol: string;
}): AITakeDeterministicFact[] {
  const facts: AITakeDeterministicFact[] = [];

  if (latestPrice) {
    facts.push({
      asOfDate: latestPrice.asOfDate,
      description: `${symbol} latest cached close is ${latestPrice.value} ${latestPrice.currency} and freshness is ${latestPrice.freshness}.`,
      source: "cached_market_data",
    });
  }

  if (stockScoreSnapshot) {
    facts.push({
      asOfDate: stockScoreSnapshot.scoredAt,
      description: `${symbol} stock score label is ${stockScoreSnapshot.label}: ${stockScoreSnapshot.summary}`,
      source: "deterministic_stock_score",
    });
  }

  if (portfolioFitSnapshot) {
    facts.push({
      asOfDate: null,
      description: `${symbol} portfolio-fit label is ${portfolioFitSnapshot.label}: ${portfolioFitSnapshot.summary}`,
      source: "deterministic_portfolio_fit",
    });
  }

  if (allocationPercent !== null) {
    facts.push({
      asOfDate: null,
      description: `${symbol} position allocation is ${roundForSnapshot(allocationPercent)}%.`,
      source: "derived_portfolio_metric",
    });
  }

  return facts;
}

function createWatchlistFacts({
  latestPrice,
  stockScoreSnapshot,
  symbol,
}: {
  latestPrice: AITakePriceSnapshot | null;
  stockScoreSnapshot: AITakeStockScoreSnapshot | null;
  symbol: string;
}): AITakeDeterministicFact[] {
  const facts: AITakeDeterministicFact[] = [];

  if (latestPrice) {
    facts.push({
      asOfDate: latestPrice.asOfDate,
      description: `${symbol} watchlist latest cached close is ${latestPrice.value} ${latestPrice.currency} and freshness is ${latestPrice.freshness}.`,
      source: "cached_market_data",
    });
  }

  if (stockScoreSnapshot) {
    facts.push({
      asOfDate: stockScoreSnapshot.scoredAt,
      description: `${symbol} watchlist stock score label is ${stockScoreSnapshot.label}: ${stockScoreSnapshot.summary}`,
      source: "deterministic_stock_score",
    });
  }

  return facts;
}

function toSectorAllocationSnapshot(
  sector: ReturnType<typeof calculateSectorAllocations>[number],
): AITakeSectorAllocationSnapshot {
  return {
    asOfDate: null,
    holdingCount: sector.holdingCount,
    percentage: sector.percentage,
    sector: sector.sector,
    status: sector.status,
  };
}

function calculateCashBalance(
  cashRows: Pick<PortfolioCashRow, "amount" | "currency" | "updated_at">[],
  baseCurrency: string,
) {
  const baseCurrencyCash = cashRows.find((row) => row.currency === baseCurrency);
  const fallbackCash = cashRows[0] ?? null;

  return toFiniteNumber(baseCurrencyCash?.amount ?? fallbackCash?.amount) ?? 0;
}

function latestBySymbol<T extends { symbol: string }>(
  rows: T[],
  getSortValue: (row: T) => string,
) {
  const latestRows = new Map<string, T>();

  for (const row of rows) {
    const previousRow = latestRows.get(row.symbol);

    if (!previousRow || getSortValue(row) > getSortValue(previousRow)) {
      latestRows.set(row.symbol, row);
    }
  }

  return latestRows;
}

function uniqueSymbols(symbols: string[]) {
  return Array.from(new Set(symbols.map((symbol) => symbol.trim().toUpperCase())))
    .filter(Boolean)
    .sort();
}

function latestAsOfDate(dates: string[]) {
  return dates.length ? dates.reduce((latest, date) => (date > latest ? date : latest)) : null;
}

function stringOrFallback(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function roundForSnapshot(value: number) {
  return Math.round(value * 100) / 100;
}

function compareHoldingsByMarketValue(
  left: AITakeHoldingSnapshot,
  right: AITakeHoldingSnapshot,
) {
  return (right.marketValue ?? 0) - (left.marketValue ?? 0);
}

function compareSectorAllocation(
  left: { percentage: number | null },
  right: { percentage: number | null },
) {
  return (right.percentage ?? 0) - (left.percentage ?? 0);
}

function firstQueryError(errors: (QueryError | null)[]) {
  return errors.find((error): error is QueryError => Boolean(error));
}

function dataReadFailure(
  error: QueryError,
): Extract<GeneratePortfolioSnapshotResult, { ok: false }> {
  return {
    ok: false,
    error: {
      code: "portfolio_data_read_failed",
      message: `Could not load portfolio data for AI snapshot: ${error.message}`,
    },
  };
}
