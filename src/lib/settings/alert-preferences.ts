import type { Database } from "@/types/supabase";

type AlertPreferencesRow =
  Database["public"]["Tables"]["alert_preferences"]["Row"];
type AlertPreferencesInsert =
  Database["public"]["Tables"]["alert_preferences"]["Insert"];

type QueryError = {
  message: string;
};

type QueryResult<T> = {
  data: T | null;
  error: QueryError | null;
};

type SelectAlertPreferencesQuery = {
  eq(column: string, value: string): SelectAlertPreferencesQuery;
  maybeSingle(): PromiseLike<QueryResult<AlertPreferencesRow>>;
};

export type AlertPreferences = {
  allocation: boolean;
  scoreChange: boolean;
  targetPrice: boolean;
  watchlistOpportunity: boolean;
};

export type AlertPreferencesClient = {
  from(table: "alert_preferences"): {
    select(columns: string): SelectAlertPreferencesQuery;
  };
};

export type SaveAlertPreferencesClient = {
  from(table: "alert_preferences"): {
    upsert(
      values: AlertPreferencesInsert,
      options: { onConflict: "user_id" },
    ): PromiseLike<QueryResult<AlertPreferencesRow>>;
  };
};

export type LoadAlertPreferencesResult =
  | {
      ok: true;
      preferences: AlertPreferences;
      source: "stored" | "defaults";
    }
  | {
      ok: false;
      error: {
        code: "alert_preferences_read_failed";
        message: string;
      };
    };

export type SaveAlertPreferencesResult =
  | {
      ok: true;
      preferences: AlertPreferences;
    }
  | {
      ok: false;
      error: {
        code: "alert_preferences_write_failed";
        message: string;
      };
    };

export const DEFAULT_ALERT_PREFERENCES = {
  allocation: true,
  scoreChange: true,
  targetPrice: true,
  watchlistOpportunity: true,
} satisfies AlertPreferences;

const ALERT_PREFERENCE_COLUMNS = [
  "allocation_enabled",
  "score_change_enabled",
  "target_price_enabled",
  "watchlist_opportunity_enabled",
].join(", ");

export async function loadAlertPreferences(
  supabase: AlertPreferencesClient,
  userId: string,
): Promise<LoadAlertPreferencesResult> {
  const { data, error } = await supabase
    .from("alert_preferences")
    .select(ALERT_PREFERENCE_COLUMNS)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    return {
      ok: false,
      error: {
        code: "alert_preferences_read_failed",
        message: `Could not load alert preferences: ${error.message}`,
      },
    };
  }

  if (!data) {
    return {
      ok: true,
      preferences: DEFAULT_ALERT_PREFERENCES,
      source: "defaults",
    };
  }

  return {
    ok: true,
    preferences: alertPreferencesRowToPreferences(data),
    source: "stored",
  };
}

export async function saveAlertPreferences(
  supabase: SaveAlertPreferencesClient,
  userId: string,
  preferences: AlertPreferences,
): Promise<SaveAlertPreferencesResult> {
  const { error } = await supabase.from("alert_preferences").upsert(
    createAlertPreferencesInsert(userId, preferences),
    {
      onConflict: "user_id",
    },
  );

  if (error) {
    return {
      ok: false,
      error: {
        code: "alert_preferences_write_failed",
        message: `Could not save alert preferences: ${error.message}`,
      },
    };
  }

  return {
    ok: true,
    preferences,
  };
}

export function parseAlertPreferencesFormData(
  formData: FormData,
): AlertPreferences {
  return {
    allocation: formData.has("allocation"),
    scoreChange: formData.has("score_change"),
    targetPrice: formData.has("target_price"),
    watchlistOpportunity: formData.has("watchlist_opportunity"),
  };
}

export function createAlertPreferencesInsert(
  userId: string,
  preferences: AlertPreferences = DEFAULT_ALERT_PREFERENCES,
): AlertPreferencesInsert {
  return {
    allocation_enabled: preferences.allocation,
    score_change_enabled: preferences.scoreChange,
    target_price_enabled: preferences.targetPrice,
    user_id: userId,
    watchlist_opportunity_enabled: preferences.watchlistOpportunity,
  };
}

function alertPreferencesRowToPreferences(
  row: Pick<
    AlertPreferencesRow,
    | "allocation_enabled"
    | "score_change_enabled"
    | "target_price_enabled"
    | "watchlist_opportunity_enabled"
  >,
): AlertPreferences {
  return {
    allocation: row.allocation_enabled,
    scoreChange: row.score_change_enabled,
    targetPrice: row.target_price_enabled,
    watchlistOpportunity: row.watchlist_opportunity_enabled,
  };
}
