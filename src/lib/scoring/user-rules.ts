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

type RuleValueRange = {
  max?: number;
  min: number;
  minInclusive: boolean;
};

type RuleValueDefinition = RuleValueRange & {
  label: string;
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

export type ResetUserRuleThresholdsClient = {
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

export type ResetUserRuleThresholdsResult =
  | {
      ok: true;
      thresholds: GrahamScoringThresholds;
    }
  | {
      ok: false;
      error: {
        code: "rules_write_failed";
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

const MAX_NUMERIC_10_2 = 99999999.99;
const RULE_DECIMAL_PLACES = 2;

const RULE_VALUE_DEFINITIONS = {
  maxDebtToEquity: {
    label: "Maximum debt/equity",
    max: MAX_NUMERIC_10_2,
    min: 0,
    minInclusive: true,
  },
  maxPb: {
    label: "Maximum P/B",
    max: MAX_NUMERIC_10_2,
    min: 0,
    minInclusive: false,
  },
  maxPe: {
    label: "Maximum P/E",
    max: MAX_NUMERIC_10_2,
    min: 0,
    minInclusive: false,
  },
  maxSectorAllocationPercent: {
    label: "Maximum sector allocation",
    max: 100,
    min: 0,
    minInclusive: false,
  },
  maxSingleStockAllocationPercent: {
    label: "Maximum single-stock allocation",
    max: 100,
    min: 0,
    minInclusive: false,
  },
  minCurrentRatio: {
    label: "Minimum current ratio",
    max: MAX_NUMERIC_10_2,
    min: 0,
    minInclusive: false,
  },
  minMarginOfSafetyPercent: {
    label: "Minimum margin of safety",
    max: 100,
    min: 0,
    minInclusive: true,
  },
} satisfies Record<
  Exclude<keyof GrahamScoringThresholds, "minCashAllocationPercent">,
  RuleValueDefinition
>;

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

export async function resetUserRuleThresholds(
  supabase: ResetUserRuleThresholdsClient,
  userId: string,
): Promise<ResetUserRuleThresholdsResult> {
  const { error } = await supabase.from("user_rules").upsert(
    createDefaultUserRulesInsert(userId),
    {
      onConflict: "user_id",
    },
  );

  if (error) {
    return {
      ok: false,
      error: {
        code: "rules_write_failed",
        message: `Could not reset rule thresholds: ${error.message}`,
      },
    };
  }

  return {
    ok: true,
    thresholds: DEFAULT_GRAHAM_SCORING_THRESHOLDS,
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
  const maxPe = parseRuleInputValue(
    input.maxPe,
    RULE_VALUE_DEFINITIONS.maxPe,
  );

  if (!maxPe.ok) {
    return maxPe;
  }

  const maxPb = parseRuleInputValue(
    input.maxPb,
    RULE_VALUE_DEFINITIONS.maxPb,
  );

  if (!maxPb.ok) {
    return maxPb;
  }

  const minMarginOfSafetyPercent = parseRuleInputValue(
    input.minMarginOfSafetyPercent,
    RULE_VALUE_DEFINITIONS.minMarginOfSafetyPercent,
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
  const maxSingleStockAllocationPercent = parseRuleInputValue(
    input.maxSingleStockAllocationPercent,
    RULE_VALUE_DEFINITIONS.maxSingleStockAllocationPercent,
  );

  if (!maxSingleStockAllocationPercent.ok) {
    return maxSingleStockAllocationPercent;
  }

  const maxSectorAllocationPercent = parseRuleInputValue(
    input.maxSectorAllocationPercent,
    RULE_VALUE_DEFINITIONS.maxSectorAllocationPercent,
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

function parseRuleInputValue(value: string, definition: RuleValueDefinition) {
  const normalizedValue = value.trim();

  if (!normalizedValue) {
    return invalidRules(`${definition.label} is required.`);
  }

  if (!/^-?(?:\d+|\d*\.\d+)$/.test(normalizedValue)) {
    return invalidRules(`${definition.label} must be a valid number.`);
  }

  if (getDecimalPlaces(normalizedValue) > RULE_DECIMAL_PLACES) {
    return invalidRules(
      `${definition.label} must use no more than ${RULE_DECIMAL_PLACES} decimal places.`,
    );
  }

  const parsedValue = Number(normalizedValue);

  if (!Number.isFinite(parsedValue)) {
    return invalidRules(`${definition.label} must be a valid number.`);
  }

  if (
    definition.minInclusive
      ? parsedValue < definition.min
      : parsedValue <= definition.min
  ) {
    return invalidRules(
      definition.minInclusive
        ? `${definition.label} must be ${definition.min} or greater.`
        : `${definition.label} must be greater than ${definition.min}.`,
    );
  }

  if (definition.max !== undefined && parsedValue > definition.max) {
    return invalidRules(`${definition.label} must be ${definition.max} or less.`);
  }

  return {
    ok: true as const,
    value: parsedValue,
  };
}

function getDecimalPlaces(value: string) {
  const decimalPart = value.split(".")[1];

  return decimalPart ? decimalPart.length : 0;
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
