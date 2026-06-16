import { describe, expect, it } from "vitest";

import { DEFAULT_GRAHAM_SCORING_THRESHOLDS } from "./thresholds";
import {
  createDefaultUserRulesInsert,
  loadUserRuleThresholds,
  resetUserRuleThresholds,
  saveAllocationRuleThresholds,
  saveValuationRuleThresholds,
  type ResetUserRuleThresholdsClient,
  type SaveAllocationRuleThresholdsClient,
  type SaveValuationRuleThresholdsClient,
  type UserRulesClient,
  userRulesRowToGrahamScoringThresholds,
} from "./user-rules";
import type { Database } from "@/types/supabase";

type UserRulesRow = Database["public"]["Tables"]["user_rules"]["Row"];

const USER_ID = "user-1";

const storedRules: UserRulesRow = {
  created_at: "2026-06-15T10:00:00.000Z",
  id: "rules-1",
  max_debt_to_equity: "0.75",
  max_pb: "2.50",
  max_pe: "18.00",
  max_sector_allocation: "25.00",
  max_single_stock_allocation: "8.00",
  min_current_ratio: "2.00",
  min_margin_of_safety: "30.00",
  updated_at: "2026-06-15T10:00:00.000Z",
  user_id: USER_ID,
};

describe("userRulesRowToGrahamScoringThresholds", () => {
  it("maps persisted numeric rule strings into scoring thresholds", () => {
    expect(userRulesRowToGrahamScoringThresholds(storedRules)).toEqual({
      maxDebtToEquity: 0.75,
      maxPb: 2.5,
      maxPe: 18,
      maxSectorAllocationPercent: 25,
      maxSingleStockAllocationPercent: 8,
      minCashAllocationPercent: 5,
      minCurrentRatio: 2,
      minMarginOfSafetyPercent: 30,
    });
  });

  it("keeps deterministic defaults for fields not stored in user_rules", () => {
    expect(
      userRulesRowToGrahamScoringThresholds(storedRules)
        .minCashAllocationPercent,
    ).toBe(DEFAULT_GRAHAM_SCORING_THRESHOLDS.minCashAllocationPercent);
  });
});

describe("loadUserRuleThresholds", () => {
  it("loads stored user-scoped rules for scoring", async () => {
    const client = createMockUserRulesClient({ row: storedRules });

    const result = await loadUserRuleThresholds(client, USER_ID);

    expect(result).toEqual({
      ok: true,
      source: "stored",
      thresholds: {
        maxDebtToEquity: 0.75,
        maxPb: 2.5,
        maxPe: 18,
        maxSectorAllocationPercent: 25,
        maxSingleStockAllocationPercent: 8,
        minCashAllocationPercent: 5,
        minCurrentRatio: 2,
        minMarginOfSafetyPercent: 30,
      },
    });
    expect(client.filters).toEqual([["user_id", USER_ID]]);
    expect(client.selectedColumns).toContain("max_pe");
  });

  it("falls back to product-plan defaults when a user has no stored rules", async () => {
    const result = await loadUserRuleThresholds(
      createMockUserRulesClient({ row: null }),
      USER_ID,
    );

    expect(result).toEqual({
      ok: true,
      source: "defaults",
      thresholds: DEFAULT_GRAHAM_SCORING_THRESHOLDS,
    });
  });

  it("returns a read failure when user_rules cannot be loaded", async () => {
    const result = await loadUserRuleThresholds(
      createMockUserRulesClient({
        error: { message: "permission denied for table user_rules" },
        row: null,
      }),
      USER_ID,
    );

    expect(result).toEqual({
      ok: false,
      error: {
        code: "rules_read_failed",
        message:
          "Could not load user rule thresholds: permission denied for table user_rules",
      },
    });
  });
});

describe("saveValuationRuleThresholds", () => {
  it("upserts valuation thresholds for the user rule set", async () => {
    const client = createMockSaveValuationRulesClient();

    const result = await saveValuationRuleThresholds(client, USER_ID, {
      maxPb: "2.75",
      maxPe: "18.5",
      minMarginOfSafetyPercent: "32",
    });

    expect(result).toEqual({
      ok: true,
      thresholds: {
        maxPb: 2.75,
        maxPe: 18.5,
        minMarginOfSafetyPercent: 32,
      },
    });
    expect(client.upsertedRules).toEqual({
      max_pb: "2.75",
      max_pe: "18.5",
      min_margin_of_safety: "32",
      user_id: USER_ID,
    });
  });

  it("rejects non-positive valuation limits", async () => {
    const result = await saveValuationRuleThresholds(
      createMockSaveValuationRulesClient(),
      USER_ID,
      {
        maxPb: "2",
        maxPe: "0",
        minMarginOfSafetyPercent: "25",
      },
    );

    expect(result).toEqual({
      ok: false,
      error: {
        code: "invalid_rules",
        message: "Maximum P/E must be greater than 0.",
      },
    });
  });

  it("rejects missing valuation thresholds", async () => {
    const result = await saveValuationRuleThresholds(
      createMockSaveValuationRulesClient(),
      USER_ID,
      {
        maxPb: "2",
        maxPe: "18",
        minMarginOfSafetyPercent: " ",
      },
    );

    expect(result).toEqual({
      ok: false,
      error: {
        code: "invalid_rules",
        message: "Minimum margin of safety is required.",
      },
    });
  });

  it("rejects non-numeric valuation thresholds", async () => {
    const result = await saveValuationRuleThresholds(
      createMockSaveValuationRulesClient(),
      USER_ID,
      {
        maxPb: "two",
        maxPe: "18",
        minMarginOfSafetyPercent: "25",
      },
    );

    expect(result).toEqual({
      ok: false,
      error: {
        code: "invalid_rules",
        message: "Maximum P/B must be a valid number.",
      },
    });
  });

  it("rejects valuation thresholds with excess decimal precision", async () => {
    const result = await saveValuationRuleThresholds(
      createMockSaveValuationRulesClient(),
      USER_ID,
      {
        maxPb: "2.345",
        maxPe: "18",
        minMarginOfSafetyPercent: "25",
      },
    );

    expect(result).toEqual({
      ok: false,
      error: {
        code: "invalid_rules",
        message: "Maximum P/B must use no more than 2 decimal places.",
      },
    });
  });

  it("rejects margin of safety above 100 percent", async () => {
    const result = await saveValuationRuleThresholds(
      createMockSaveValuationRulesClient(),
      USER_ID,
      {
        maxPb: "2",
        maxPe: "18",
        minMarginOfSafetyPercent: "100.01",
      },
    );

    expect(result).toEqual({
      ok: false,
      error: {
        code: "invalid_rules",
        message: "Minimum margin of safety must be 100 or less.",
      },
    });
  });

  it("returns a write failure when valuation rules cannot be saved", async () => {
    const result = await saveValuationRuleThresholds(
      createMockSaveValuationRulesClient({
        error: { message: "permission denied for table user_rules" },
      }),
      USER_ID,
      {
        maxPb: "2",
        maxPe: "18",
        minMarginOfSafetyPercent: "25",
      },
    );

    expect(result).toEqual({
      ok: false,
      error: {
        code: "rules_write_failed",
        message:
          "Could not save valuation thresholds: permission denied for table user_rules",
      },
    });
  });
});

describe("saveAllocationRuleThresholds", () => {
  it("upserts allocation thresholds for the user rule set", async () => {
    const client = createMockSaveAllocationRulesClient();

    const result = await saveAllocationRuleThresholds(client, USER_ID, {
      maxSectorAllocationPercent: "28",
      maxSingleStockAllocationPercent: "7.5",
    });

    expect(result).toEqual({
      ok: true,
      thresholds: {
        maxSectorAllocationPercent: 28,
        maxSingleStockAllocationPercent: 7.5,
      },
    });
    expect(client.upsertedRules).toEqual({
      max_sector_allocation: "28",
      max_single_stock_allocation: "7.5",
      user_id: USER_ID,
    });
  });

  it("rejects non-positive allocation limits", async () => {
    const result = await saveAllocationRuleThresholds(
      createMockSaveAllocationRulesClient(),
      USER_ID,
      {
        maxSectorAllocationPercent: "30",
        maxSingleStockAllocationPercent: "0",
      },
    );

    expect(result).toEqual({
      ok: false,
      error: {
        code: "invalid_rules",
        message: "Maximum single-stock allocation must be greater than 0.",
      },
    });
  });

  it("rejects allocation limits above 100 percent", async () => {
    const result = await saveAllocationRuleThresholds(
      createMockSaveAllocationRulesClient(),
      USER_ID,
      {
        maxSectorAllocationPercent: "101",
        maxSingleStockAllocationPercent: "10",
      },
    );

    expect(result).toEqual({
      ok: false,
      error: {
        code: "invalid_rules",
        message: "Maximum sector allocation must be 100 or less.",
      },
    });
  });

  it("rejects allocation limits with excess decimal precision", async () => {
    const result = await saveAllocationRuleThresholds(
      createMockSaveAllocationRulesClient(),
      USER_ID,
      {
        maxSectorAllocationPercent: "30",
        maxSingleStockAllocationPercent: "10.123",
      },
    );

    expect(result).toEqual({
      ok: false,
      error: {
        code: "invalid_rules",
        message:
          "Maximum single-stock allocation must use no more than 2 decimal places.",
      },
    });
  });

  it("returns a write failure when allocation rules cannot be saved", async () => {
    const result = await saveAllocationRuleThresholds(
      createMockSaveAllocationRulesClient({
        error: { message: "permission denied for table user_rules" },
      }),
      USER_ID,
      {
        maxSectorAllocationPercent: "30",
        maxSingleStockAllocationPercent: "10",
      },
    );

    expect(result).toEqual({
      ok: false,
      error: {
        code: "rules_write_failed",
        message:
          "Could not save allocation thresholds: permission denied for table user_rules",
      },
    });
  });
});

describe("resetUserRuleThresholds", () => {
  it("upserts the full product-plan default threshold set for the user", async () => {
    const client = createMockResetRulesClient();

    const result = await resetUserRuleThresholds(client, USER_ID);

    expect(result).toEqual({
      ok: true,
      thresholds: DEFAULT_GRAHAM_SCORING_THRESHOLDS,
    });
    expect(client.upsertedRules).toEqual({
      max_debt_to_equity: "1",
      max_pb: "3",
      max_pe: "20",
      max_sector_allocation: "30",
      max_single_stock_allocation: "10",
      min_current_ratio: "1.5",
      min_margin_of_safety: "25",
      user_id: USER_ID,
    });
  });

  it("returns a write failure when default rules cannot be persisted", async () => {
    const result = await resetUserRuleThresholds(
      createMockResetRulesClient({
        error: { message: "permission denied for table user_rules" },
      }),
      USER_ID,
    );

    expect(result).toEqual({
      ok: false,
      error: {
        code: "rules_write_failed",
        message:
          "Could not reset rule thresholds: permission denied for table user_rules",
      },
    });
  });
});

describe("createDefaultUserRulesInsert", () => {
  it("creates the product-plan default threshold payload for new users", () => {
    expect(createDefaultUserRulesInsert(USER_ID)).toEqual({
      max_debt_to_equity: "1",
      max_pb: "3",
      max_pe: "20",
      max_sector_allocation: "30",
      max_single_stock_allocation: "10",
      min_current_ratio: "1.5",
      min_margin_of_safety: "25",
      user_id: USER_ID,
    });
  });
});

function createMockUserRulesClient({
  error = null,
  row,
}: {
  error?: { message: string } | null;
  row: UserRulesRow | null;
}) {
  const state: {
    filters: [string, string][];
    selectedColumns: string | null;
  } = {
    filters: [],
    selectedColumns: null,
  };
  const client = {
    get filters() {
      return state.filters;
    },
    get selectedColumns() {
      return state.selectedColumns;
    },
    from(table: "user_rules") {
      if (table !== "user_rules") {
        throw new Error(`Unexpected table: ${table}`);
      }

      return {
        select(columns: string) {
          state.selectedColumns = columns;

          const query = {
            eq(column: string, value: string) {
              state.filters.push([column, value]);

              return query;
            },
            maybeSingle: async () => ({ data: row, error }),
          };

          return query;
        },
      };
    },
  };

  return client as UserRulesClient & {
    filters: [string, string][];
    selectedColumns: string | null;
  };
}

function createMockResetRulesClient({
  error = null,
}: {
  error?: { message: string } | null;
} = {}) {
  const state: {
    upsertedRules: Record<string, string> | null;
  } = {
    upsertedRules: null,
  };
  const client = {
    get upsertedRules() {
      return state.upsertedRules;
    },
    from(table: "user_rules") {
      if (table !== "user_rules") {
        throw new Error(`Unexpected table: ${table}`);
      }

      return {
        select() {
          throw new Error("select was not expected");
        },
        upsert(values: Record<string, string>) {
          state.upsertedRules = values;

          return Promise.resolve({ data: null, error });
        },
      };
    },
  };

  return client as ResetUserRuleThresholdsClient & {
    upsertedRules: Record<string, string> | null;
  };
}

function createMockSaveValuationRulesClient({
  error = null,
}: {
  error?: { message: string } | null;
} = {}) {
  const state: {
    upsertedRules: Record<string, string> | null;
  } = {
    upsertedRules: null,
  };
  const client = {
    get upsertedRules() {
      return state.upsertedRules;
    },
    from(table: "user_rules") {
      if (table !== "user_rules") {
        throw new Error(`Unexpected table: ${table}`);
      }

      return {
        select() {
          throw new Error("select was not expected");
        },
        upsert(values: Record<string, string>) {
          state.upsertedRules = values;

          return Promise.resolve({ data: null, error });
        },
      };
    },
  };

  return client as SaveValuationRuleThresholdsClient & {
    upsertedRules: Record<string, string> | null;
  };
}

function createMockSaveAllocationRulesClient({
  error = null,
}: {
  error?: { message: string } | null;
} = {}) {
  const state: {
    upsertedRules: Record<string, string> | null;
  } = {
    upsertedRules: null,
  };
  const client = {
    get upsertedRules() {
      return state.upsertedRules;
    },
    from(table: "user_rules") {
      if (table !== "user_rules") {
        throw new Error(`Unexpected table: ${table}`);
      }

      return {
        select() {
          throw new Error("select was not expected");
        },
        upsert(values: Record<string, string>) {
          state.upsertedRules = values;

          return Promise.resolve({ data: null, error });
        },
      };
    },
  };

  return client as SaveAllocationRuleThresholdsClient & {
    upsertedRules: Record<string, string> | null;
  };
}
