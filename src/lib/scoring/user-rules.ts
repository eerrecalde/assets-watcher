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

export type SaveValuationRuleThresholdsClient = {
  from(table: "user_rules"): {
    upsert(
      values: UserRulesInsert,
      options: { onConflict: "user_id" },
    ): PromiseLike<QueryResult<UserRulesRow>>;
  };
};

export type SaveAllocationRuleThresholdsClient = {
  from(table: "user_rules"): {
    upsert(
      values: UserRulesInsert,
      options: { onConflict: "user_id" },
    ): PromiseLike<QueryResult<UserRulesRow>>;
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

export type ValuationRuleThresholdInput = {
  maxPb: string;
  maxPe: string;
  minMarginOfSafetyPercent: string;
};

export type AllocationRuleThresholdInput = {
  maxSectorAllocationPercent: string;
  maxSingleStockAllocationPercent: string;
};

export type SaveValuationRuleThresholdsResult =
  | {
      ok: true;
      thresholds: Pick<
        GrahamScoringThresholds,
        "maxPb" | "maxPe" | "minMarginOfSafetyPercent"
      >;
    }
  | {
      ok: false;
      error: {
        code: "invalid_rules" | "rules_write_failed";
        message: string;
      };
    };

export type SaveAllocationRuleThresholdsResult =
  | {
      ok: true;
      thresholds: Pick<
        GrahamScoringThresholds,
        "maxSectorAllocationPercent" | "maxSingleStockAllocationPercent"
      >;
    }
  | {
      ok: false;
      error: {
        code: "invalid_rules" | "rules_write_failed";
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

export async function saveValuationRuleThresholds(
  supabase: SaveValuationRuleThresholdsClient,
  userId: string,
  input: ValuationRuleThresholdInput,
): Promise<SaveValuationRuleThresholdsResult> {
  const parsedInput = parseValuationRuleThresholdInput(input);

  if (!parsedInput.ok) {
    return parsedInput;
  }

  const { error } = await supabase.from("user_rules").upsert(
    {
      max_pb: toRuleValue(parsedInput.thresholds.maxPb),
      max_pe: toRuleValue(parsedInput.thresholds.maxPe),
      min_margin_of_safety: toRuleValue(
        parsedInput.thresholds.minMarginOfSafetyPercent,
      ),
      user_id: userId,
    },
    {
      onConflict: "user_id",
    },
  );

  if (error) {
    return {
      ok: false,
      error: {
        code: "rules_write_failed",
        message: `Could not save valuation thresholds: ${error.message}`,
      },
    };
  }

  return {
    ok: true,
    thresholds: parsedInput.thresholds,
  };
}

export async function saveAllocationRuleThresholds(
  supabase: SaveAllocationRuleThresholdsClient,
  userId: string,
  input: AllocationRuleThresholdInput,
): Promise<SaveAllocationRuleThresholdsResult> {
  const parsedInput = parseAllocationRuleThresholdInput(input);

  if (!parsedInput.ok) {
    return parsedInput;
  }

  const { error } = await supabase.from("user_rules").upsert(
    {
      max_sector_allocation: toRuleValue(
        parsedInput.thresholds.maxSectorAllocationPercent,
      ),
      max_single_stock_allocation: toRuleValue(
        parsedInput.thresholds.maxSingleStockAllocationPercent,
      ),
      user_id: userId,
    },
    {
      onConflict: "user_id",
    },
  );

  if (error) {
    return {
      ok: false,
      error: {
        code: "rules_write_failed",
        message: `Could not save allocation thresholds: ${error.message}`,
      },
    };
  }

  return {
    ok: true,
    thresholds: parsedInput.thresholds,
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

function parseValuationRuleThresholdInput(
  input: ValuationRuleThresholdInput,
): SaveValuationRuleThresholdsResult {
  const maxPe = parsePositiveRuleValue(input.maxPe, "Maximum P/E");

  if (!maxPe.ok) {
    return maxPe;
  }

  const maxPb = parsePositiveRuleValue(input.maxPb, "Maximum P/B");

  if (!maxPb.ok) {
    return maxPb;
  }

  const minMarginOfSafetyPercent = parseNonNegativeRuleValue(
    input.minMarginOfSafetyPercent,
    "Minimum margin of safety",
  );

  if (!minMarginOfSafetyPercent.ok) {
    return minMarginOfSafetyPercent;
  }

  return {
    ok: true,
    thresholds: {
      maxPb: maxPb.value,
      maxPe: maxPe.value,
      minMarginOfSafetyPercent: minMarginOfSafetyPercent.value,
    },
  };
}

function parseAllocationRuleThresholdInput(
  input: AllocationRuleThresholdInput,
): SaveAllocationRuleThresholdsResult {
  const maxSingleStockAllocationPercent = parsePercentRuleValue(
    input.maxSingleStockAllocationPercent,
    "Maximum single-stock allocation",
  );

  if (!maxSingleStockAllocationPercent.ok) {
    return maxSingleStockAllocationPercent;
  }

  const maxSectorAllocationPercent = parsePercentRuleValue(
    input.maxSectorAllocationPercent,
    "Maximum sector allocation",
  );

  if (!maxSectorAllocationPercent.ok) {
    return maxSectorAllocationPercent;
  }

  return {
    ok: true,
    thresholds: {
      maxSectorAllocationPercent: maxSectorAllocationPercent.value,
      maxSingleStockAllocationPercent: maxSingleStockAllocationPercent.value,
    },
  };
}

function parsePositiveRuleValue(value: string, label: string) {
  const parsedValue = parseRuleInputValue(value, label);

  if (!parsedValue.ok) {
    return parsedValue;
  }

  if (parsedValue.value <= 0) {
    return invalidRules(`${label} must be greater than zero.`);
  }

  return parsedValue;
}

function parsePercentRuleValue(value: string, label: string) {
  const parsedValue = parsePositiveRuleValue(value, label);

  if (!parsedValue.ok) {
    return parsedValue;
  }

  if (parsedValue.value > 100) {
    return invalidRules(`${label} must be 100 or less.`);
  }

  return parsedValue;
}

function parseNonNegativeRuleValue(value: string, label: string) {
  const parsedValue = parseRuleInputValue(value, label);

  if (!parsedValue.ok) {
    return parsedValue;
  }

  if (parsedValue.value < 0) {
    return invalidRules(`${label} must be zero or greater.`);
  }

  return parsedValue;
}

function parseRuleInputValue(value: string, label: string) {
  const normalizedValue = value.trim();

  if (!normalizedValue) {
    return invalidRules(`${label} is required.`);
  }

  const parsedValue = Number(normalizedValue);

  if (!Number.isFinite(parsedValue)) {
    return invalidRules(`${label} must be a valid number.`);
  }

  return {
    ok: true as const,
    value: parsedValue,
  };
}

function invalidRules(message: string) {
  return {
    ok: false as const,
    error: {
      code: "invalid_rules" as const,
      message,
    },
  };
}

function toRuleValue(value: number) {
  return value.toString();
}
