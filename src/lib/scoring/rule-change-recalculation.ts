import { ensureDefaultPortfolioForUser } from "../portfolios/defaults";
import {
  calculateCashAllocation,
  calculateHoldingValue,
  calculatePositionAllocation,
  calculateSectorAllocations,
  type CalculatedHoldingValue,
} from "../portfolios/totals";
import {
  persistPortfolioScoreSnapshot,
  type PortfolioScoreSnapshotClient,
} from "./portfolio-score-snapshots";
import { scorePortfolioFit, type PortfolioFitScoringInput } from "./portfolio-fit";
import {
  persistStockScoreSnapshotForSymbol,
  type StockScoreSnapshotClient,
} from "./stock-score-snapshots";
import type { GrahamScoringThresholds } from "./thresholds";
import type { Database } from "@/types/supabase";

type HoldingRow = Pick<
  Database["public"]["Tables"]["holdings"]["Row"],
  "average_cost" | "quantity" | "symbol"
>;
type PortfolioCashRow = Pick<
  Database["public"]["Tables"]["portfolio_cash"]["Row"],
  "amount"
>;
type StockPriceRow = Pick<
  Database["public"]["Tables"]["stock_prices"]["Row"],
  "close" | "price_date" | "symbol"
>;
type StockRow = Pick<Database["public"]["Tables"]["stocks"]["Row"], "sector" | "symbol">;
type WatchlistRow = Pick<
  Database["public"]["Tables"]["watchlist_items"]["Row"],
  "symbol"
>;

type QueryError = {
  message: string;
};

type QueryResult<T> = {
  data: T | null;
  error: QueryError | null;
};

type EqQuery<T> = {
  eq(column: string, value: string): EqQuery<T>;
  maybeSingle(): PromiseLike<QueryResult<T>>;
  order(column: string, options: { ascending: boolean }): EqQuery<T>;
  limit(count: number): PromiseLike<QueryResult<T[]>>;
};

type ListEqQuery<T> = {
  eq(column: string, value: string): PromiseLike<QueryResult<T[]>>;
};

export type RuleChangeScoreRecalculationClient = StockScoreSnapshotClient &
  PortfolioScoreSnapshotClient & {
    from(table: "holdings"): {
      select(columns: string): ListEqQuery<HoldingRow>;
    };
    from(table: "portfolio_cash"): {
      select(columns: string): EqQuery<PortfolioCashRow>;
    };
    from(table: "stock_prices"): {
      select(columns: string): EqQuery<StockPriceRow>;
    };
    from(table: "stocks"): {
      select(columns: string): EqQuery<StockRow>;
    };
    from(table: "watchlist_items"): {
      select(columns: string): ListEqQuery<WatchlistRow>;
    };
  };

export type RecalculateScoresAfterRuleChangeOptions = {
  currentDate?: Date;
  thresholds: GrahamScoringThresholds;
};

export type RecalculateScoresAfterRuleChangeResult =
  | {
      ok: true;
      portfolioScoreCount: number;
      stockScoreCount: number;
      trackedSymbolCount: number;
    }
  | {
      ok: false;
      error: {
        code: "portfolio_load_failed" | "tracked_symbols_read_failed";
        message: string;
      };
    }
  | {
      ok: false;
      error: {
        code: "snapshot_refresh_failed";
        failedSymbols: string[];
        message: string;
        portfolioScoreCount: number;
        stockScoreCount: number;
        trackedSymbolCount: number;
      };
    };

export async function recalculateScoresAfterRuleChange(
  supabase: RuleChangeScoreRecalculationClient,
  user: { email?: string | null; id: string },
  { currentDate = new Date(), thresholds }: RecalculateScoresAfterRuleChangeOptions,
): Promise<RecalculateScoresAfterRuleChangeResult> {
  const portfolioResult = await ensureDefaultPortfolioForUser(
    supabase as never,
    user,
  );

  if ("error" in portfolioResult) {
    return {
      ok: false,
      error: {
        code: "portfolio_load_failed",
        message:
          portfolioResult.error ?? "Could not load your default portfolio.",
      },
    };
  }

  const [holdingsResult, watchlistResult] = await Promise.all([
    supabase
      .from("holdings")
      .select("symbol,quantity,average_cost")
      .eq("portfolio_id", portfolioResult.portfolio.id),
    supabase
      .from("watchlist_items")
      .select("symbol")
      .eq("portfolio_id", portfolioResult.portfolio.id),
  ]);

  if (holdingsResult.error || watchlistResult.error) {
    return {
      ok: false,
      error: {
        code: "tracked_symbols_read_failed",
        message: `Could not load tracked symbols for score recalculation: ${
          holdingsResult.error?.message ??
          watchlistResult.error?.message ??
          "Unknown read error."
        }`,
      },
    };
  }

  const holdings = holdingsResult.data ?? [];
  const trackedSymbols = uniqueSymbols([
    ...holdings.map((holding) => holding.symbol),
    ...((watchlistResult.data ?? []) as WatchlistRow[]).map(
      (item) => item.symbol,
    ),
  ]);
  const failedSymbols = new Set<string>();
  let stockScoreCount = 0;
  let portfolioScoreCount = 0;

  for (const symbol of trackedSymbols) {
    const result = await persistStockScoreSnapshotForSymbol(supabase, symbol, {
      currentDate,
      thresholds,
      userId: user.id,
    });

    if (result.ok) {
      stockScoreCount += 1;
    } else {
      failedSymbols.add(symbol);
      console.error("Rule-change stock score recalculation failed.", {
        error: result.error,
        symbol,
      });
    }
  }

  if (holdings.length > 0) {
    const portfolioFitInputs = await createPortfolioFitInputs({
      cashCurrency: portfolioResult.portfolio.base_currency,
      holdings,
      portfolioId: portfolioResult.portfolio.id,
      supabase,
    });

    if (!portfolioFitInputs.ok) {
      return portfolioFitInputs;
    }

    for (const { input, symbol } of portfolioFitInputs.inputs) {
      const scoringResult = scorePortfolioFit(input, { thresholds });
      const result = await persistPortfolioScoreSnapshot(
        supabase,
        {
          portfolioFitInput: input,
          portfolioId: portfolioResult.portfolio.id,
          scoringResult,
          symbol,
        },
        { currentDate },
      );

      if (result.ok) {
        portfolioScoreCount += 1;
      } else {
        failedSymbols.add(symbol);
        console.error("Rule-change portfolio score recalculation failed.", {
          error: result.error,
          symbol,
        });
      }
    }
  }

  if (failedSymbols.size > 0) {
    return {
      ok: false,
      error: {
        code: "snapshot_refresh_failed",
        failedSymbols: Array.from(failedSymbols).sort(),
        message:
          "Rule thresholds were saved, but some score snapshots could not be refreshed.",
        portfolioScoreCount,
        stockScoreCount,
        trackedSymbolCount: trackedSymbols.length,
      },
    };
  }

  return {
    ok: true,
    portfolioScoreCount,
    stockScoreCount,
    trackedSymbolCount: trackedSymbols.length,
  };
}

async function createPortfolioFitInputs({
  cashCurrency,
  holdings,
  portfolioId,
  supabase,
}: {
  cashCurrency: string;
  holdings: HoldingRow[];
  portfolioId: string;
  supabase: RuleChangeScoreRecalculationClient;
}): Promise<
  | {
      ok: true;
      inputs: { input: PortfolioFitScoringInput; symbol: string }[];
    }
  | Extract<RecalculateScoresAfterRuleChangeResult, { ok: false }>
> {
  const [cashResult, pricedHoldings] = await Promise.all([
    supabase
      .from("portfolio_cash")
      .select("amount")
      .eq("portfolio_id", portfolioId)
      .eq("currency", cashCurrency)
      .maybeSingle(),
    Promise.all(
      holdings.map(async (holding) => {
        const [priceResult, stockResult] = await Promise.all([
          supabase
            .from("stock_prices")
            .select("symbol,close,price_date")
            .eq("symbol", holding.symbol)
            .order("price_date", { ascending: false })
            .limit(1),
          supabase
            .from("stocks")
            .select("symbol,sector")
            .eq("symbol", holding.symbol)
            .maybeSingle(),
        ]);

        if (priceResult.error || stockResult.error) {
          return {
            error:
              priceResult.error?.message ??
              stockResult.error?.message ??
              "Unknown read error.",
            holding,
          };
        }

        const latestPrice = (priceResult.data ?? [])[0] ?? null;

        return {
          holding,
          latestClose: latestPrice?.close ?? null,
          sector: stockResult.data?.sector ?? null,
        };
      }),
    ),
  ]);

  const firstReadError = pricedHoldings.find(
    (holding): holding is { error: string; holding: HoldingRow } =>
      "error" in holding,
  );

  if (cashResult.error || firstReadError) {
    return {
      ok: false,
      error: {
        code: "tracked_symbols_read_failed",
        message: `Could not load portfolio context for score recalculation: ${
          cashResult.error?.message ?? firstReadError?.error ?? "Unknown read error."
        }`,
      },
    };
  }

  const calculatedHoldings = pricedHoldings.map((pricedHolding) => ({
    ...calculateHoldingValue({
      averageCost: pricedHolding.holding.average_cost,
      latestClose: pricedHolding.latestClose,
      quantity: pricedHolding.holding.quantity,
    }),
    sector: pricedHolding.sector ?? null,
    symbol: pricedHolding.holding.symbol,
  }));
  const cashAmount = cashResult.data?.amount ?? "0";
  const cashAllocation = calculateCashAllocation({
    cashAmountInput: cashAmount,
    holdings: calculatedHoldings,
  });
  const sectorAllocations = calculateSectorAllocations({
    cashAmountInput: cashAmount,
    holdings: calculatedHoldings,
  });

  return {
    ok: true,
    inputs: calculatedHoldings.map((holding) => ({
      input: {
        cashAllocation,
        positionAllocation: calculatePositionAllocation({
          cashAmountInput: cashAmount,
          holding,
          holdings: calculatedHoldings,
        }),
        sectorAllocation: findSectorAllocation(sectorAllocations, holding),
      },
      symbol: holding.symbol,
    })),
  };
}

function findSectorAllocation(
  sectorAllocations: ReturnType<typeof calculateSectorAllocations>,
  holding: CalculatedHoldingValue & { sector: string | null; symbol: string },
) {
  const sector = holding.sector?.trim();

  if (sector) {
    return (
      sectorAllocations.find((allocation) => allocation.sector === sector) ??
      null
    );
  }

  return (
    sectorAllocations.find((allocation) => allocation.isUnknownSector) ?? null
  );
}

function uniqueSymbols(symbols: string[]) {
  return Array.from(
    new Set(
      symbols
        .map((symbol) => symbol.trim().toUpperCase())
        .filter((symbol) => symbol.length > 0),
    ),
  ).sort();
}
