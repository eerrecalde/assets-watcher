import type { Database } from "@/types/supabase";

import {
  DEFAULT_GRAHAM_SCORING_THRESHOLDS,
  type GrahamScoringThresholds,
} from "./thresholds";

type UserRulesRow = Database["public"]["Tables"]["user_rules"]["Row"];
type UserRulesInsert = Database["public"]["Tables"]["user_rules"]["Insert"];

type QueryError = {
  message: string;
};

type QueryResult<T> = {
  data: T | null;
  error: QueryError | null;
};

type SelectUserRulesQuery = {
  eq(column: string, value: string): SelectUserRulesQuery;
  maybeSingle(): PromiseLike<QueryResult<UserRulesRow>>;
};

export type UserRulesClient = {
  from(table: "user_rules"): {
    select(columns: string): SelectUserRulesQuery;
  };
};

export type LoadUserRuleThresholdsResult =
  | {
      ok: true;
      source: "stored" | "defaults";
      thresholds: GrahamScoringThresholds;
    }
  | {
      ok: false;
      error: {
        code: "rules_read_failed";
        message: string;
      };
    };

const USER_RULE_COLUMNS = [
  "max_debt_to_equity",
  "max_pb",
  "max_pe",
  "max_sector_allocation",
  "max_single_stock_allocation",
  "min_current_ratio",
  "min_margin_of_safety",
].join(", ");

export async function loadUserRuleThresholds(
  supabase: UserRulesClient,
  userId: string,
): Promise<LoadUserRuleThresholdsResult> {
  const { data, error } = await supabase
    .from("user_rules")
    .select(USER_RULE_COLUMNS)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    return {
      ok: false,
      error: {
        code: "rules_read_failed",
        message: `Could not load user rule thresholds: ${error.message}`,
      },
    };
  }

  if (!data) {
    return {
      ok: true,
      source: "defaults",
      thresholds: DEFAULT_GRAHAM_SCORING_THRESHOLDS,
    };
  }

  return {
    ok: true,
    source: "stored",
    thresholds: userRulesRowToGrahamScoringThresholds(data),
  };
}

export function createDefaultUserRulesInsert(userId: string): UserRulesInsert {
  return {
    max_debt_to_equity: toRuleValue(
      DEFAULT_GRAHAM_SCORING_THRESHOLDS.maxDebtToEquity,
    ),
    max_pb: toRuleValue(DEFAULT_GRAHAM_SCORING_THRESHOLDS.maxPb),
    max_pe: toRuleValue(DEFAULT_GRAHAM_SCORING_THRESHOLDS.maxPe),
    max_sector_allocation: toRuleValue(
      DEFAULT_GRAHAM_SCORING_THRESHOLDS.maxSectorAllocationPercent,
    ),
    max_single_stock_allocation: toRuleValue(
      DEFAULT_GRAHAM_SCORING_THRESHOLDS.maxSingleStockAllocationPercent,
    ),
    min_current_ratio: toRuleValue(
      DEFAULT_GRAHAM_SCORING_THRESHOLDS.minCurrentRatio,
    ),
    min_margin_of_safety: toRuleValue(
      DEFAULT_GRAHAM_SCORING_THRESHOLDS.minMarginOfSafetyPercent,
    ),
    user_id: userId,
  };
}

export function userRulesRowToGrahamScoringThresholds(
  row: Pick<
    UserRulesRow,
    | "max_debt_to_equity"
    | "max_pb"
    | "max_pe"
    | "max_sector_allocation"
    | "max_single_stock_allocation"
    | "min_current_ratio"
    | "min_margin_of_safety"
  >,
): GrahamScoringThresholds {
  return {
    maxDebtToEquity: parseRuleValue(
      row.max_debt_to_equity,
      DEFAULT_GRAHAM_SCORING_THRESHOLDS.maxDebtToEquity,
    ),
    maxPb: parseRuleValue(
      row.max_pb,
      DEFAULT_GRAHAM_SCORING_THRESHOLDS.maxPb,
    ),
    maxPe: parseRuleValue(
      row.max_pe,
      DEFAULT_GRAHAM_SCORING_THRESHOLDS.maxPe,
    ),
    maxSectorAllocationPercent: parseRuleValue(
      row.max_sector_allocation,
      DEFAULT_GRAHAM_SCORING_THRESHOLDS.maxSectorAllocationPercent,
    ),
    maxSingleStockAllocationPercent: parseRuleValue(
      row.max_single_stock_allocation,
      DEFAULT_GRAHAM_SCORING_THRESHOLDS.maxSingleStockAllocationPercent,
    ),
    minCashAllocationPercent:
      DEFAULT_GRAHAM_SCORING_THRESHOLDS.minCashAllocationPercent,
    minCurrentRatio: parseRuleValue(
      row.min_current_ratio,
      DEFAULT_GRAHAM_SCORING_THRESHOLDS.minCurrentRatio,
    ),
    minMarginOfSafetyPercent: parseRuleValue(
      row.min_margin_of_safety,
      DEFAULT_GRAHAM_SCORING_THRESHOLDS.minMarginOfSafetyPercent,
    ),
  };
}

function parseRuleValue(value: string, fallback: number) {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : fallback;
}

function toRuleValue(value: number) {
  return value.toString();
}
