import type { Database, Json } from "@/types/supabase";

import type {
  PortfolioFitScoringInput,
  PortfolioFitScoringResult,
} from "./portfolio-fit";
import type { RuleCheckResult, RuleCheckStatus } from "./types";

type PortfolioScoreInsert =
  Database["public"]["Tables"]["portfolio_stock_scores"]["Insert"];
type PortfolioScoreRow =
  Database["public"]["Tables"]["portfolio_stock_scores"]["Row"];

type QueryError = {
  message: string;
};

type QueryResult<T> = {
  data: T | null;
  error: QueryError | null;
};

type SelectLatestPortfolioScoreQuery<T> = {
  eq(column: string, value: string): SelectLatestPortfolioScoreQuery<T>;
  limit(count: number): PromiseLike<QueryResult<T[]>>;
  order(
    column: string,
    options: { ascending: boolean },
  ): SelectLatestPortfolioScoreQuery<T>;
};

export type PortfolioScoreSnapshotClient = {
  from(table: "portfolio_stock_scores"): {
    insert(values: PortfolioScoreInsert): {
      select(columns: string): {
        single(): PromiseLike<QueryResult<PortfolioScoreRow>>;
      };
    };
    select(columns: string): SelectLatestPortfolioScoreQuery<PortfolioScoreRow>;
  };
};

export type PersistPortfolioScoreSnapshotInput = {
  portfolioFitInput: PortfolioFitScoringInput;
  portfolioId: string;
  scoringResult: PortfolioFitScoringResult;
  symbol: string;
};

export type PersistPortfolioScoreSnapshotOptions = {
  currentDate?: Date;
};

export type PersistPortfolioScoreSnapshotResult =
  | {
      ok: true;
      snapshot: PortfolioScoreRow;
    }
  | {
      ok: false;
      error: {
        code: "snapshot_write_failed";
        message: string;
      };
    };

export type GetLatestPortfolioScoreSnapshotInput = {
  portfolioId: string;
  symbol: string;
};

export type GetLatestPortfolioScoreSnapshotResult =
  | {
      ok: true;
      snapshot: PortfolioScoreRow | null;
    }
  | {
      ok: false;
      error: {
        code: "snapshot_read_failed";
        message: string;
      };
    };

export async function persistPortfolioScoreSnapshot(
  supabase: PortfolioScoreSnapshotClient,
  input: PersistPortfolioScoreSnapshotInput,
  { currentDate = new Date() }: PersistPortfolioScoreSnapshotOptions = {},
): Promise<PersistPortfolioScoreSnapshotResult> {
  const normalizedSymbol = normalizePortfolioScoreSymbol(input.symbol);
  const insert = toPortfolioScoreInsert({
    ...input,
    scoredAt: currentDate.toISOString(),
    symbol: normalizedSymbol,
  });
  const { data, error } = await supabase
    .from("portfolio_stock_scores")
    .insert(insert)
    .select("*")
    .single();

  if (error || !data) {
    return {
      ok: false,
      error: {
        code: "snapshot_write_failed",
        message: `Could not persist portfolio score snapshot for ${normalizedSymbol}: ${
          error?.message ?? "No inserted row was returned."
        }`,
      },
    };
  }

  return {
    ok: true,
    snapshot: data,
  };
}

export async function getLatestPortfolioScoreSnapshot(
  supabase: PortfolioScoreSnapshotClient,
  input: GetLatestPortfolioScoreSnapshotInput,
): Promise<GetLatestPortfolioScoreSnapshotResult> {
  const normalizedSymbol = normalizePortfolioScoreSymbol(input.symbol);
  const { data, error } = await supabase
    .from("portfolio_stock_scores")
    .select("*")
    .eq("portfolio_id", input.portfolioId)
    .eq("symbol", normalizedSymbol)
    .order("scored_at", { ascending: false })
    .limit(1);

  if (error) {
    return {
      ok: false,
      error: {
        code: "snapshot_read_failed",
        message: `Could not read portfolio score snapshot for ${normalizedSymbol}: ${error.message}`,
      },
    };
  }

  return {
    ok: true,
    snapshot: data?.[0] ?? null,
  };
}

function toPortfolioScoreInsert({
  portfolioFitInput,
  portfolioId,
  scoredAt,
  scoringResult,
  symbol,
}: PersistPortfolioScoreSnapshotInput & { scoredAt: string }): PortfolioScoreInsert {
  return {
    allocation_warning: findRuleWarningSummary(
      scoringResult.ruleChecks,
      "portfolio_fit.position_allocation",
    ),
    cash_warning: findRuleWarningSummary(
      scoringResult.ruleChecks,
      "portfolio_fit.cash_allocation",
    ),
    explanation_json: toJson({
      input: portfolioFitInput,
      result: scoringResult,
      schemaVersion: 1,
    }),
    portfolio_fit_label: scoringResult.label,
    portfolio_id: portfolioId,
    scored_at: scoredAt,
    sector_warning: findRuleWarningSummary(
      scoringResult.ruleChecks,
      "portfolio_fit.sector_allocation",
    ),
    symbol,
  };
}

function findRuleWarningSummary(ruleChecks: RuleCheckResult[], ruleId: string) {
  const ruleCheck = ruleChecks.find((candidate) => candidate.id === ruleId);

  if (!ruleCheck || !isPersistedWarningStatus(ruleCheck.status)) {
    return null;
  }

  return ruleCheck.explanation.summary;
}

function isPersistedWarningStatus(status: RuleCheckStatus) {
  return ["fail", "warning", "insufficient_data", "unavailable"].includes(
    status,
  );
}

function normalizePortfolioScoreSymbol(symbol: string) {
  return symbol.trim().toUpperCase();
}

function toJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}
