import { describe, expect, it } from "vitest";

import {
  DEFAULT_ALERT_PREFERENCES,
  createAlertPreferencesInsert,
  loadAlertPreferences,
  parseAlertPreferencesFormData,
  saveAlertPreferences,
} from "./alert-preferences";

describe("alert preferences", () => {
  it("loads defaults when the user has not stored preferences", async () => {
    const result = await loadAlertPreferences(createClient({ data: null }), "user-1");

    expect(result).toEqual({
      ok: true,
      preferences: DEFAULT_ALERT_PREFERENCES,
      source: "defaults",
    });
  });

  it("loads stored preferences", async () => {
    const result = await loadAlertPreferences(
      createClient({
        data: {
          allocation_enabled: false,
          created_at: "2026-06-19T12:00:00.000Z",
          id: "preferences-1",
          score_change_enabled: true,
          target_price_enabled: false,
          updated_at: "2026-06-19T12:00:00.000Z",
          user_id: "user-1",
          watchlist_opportunity_enabled: true,
        },
      }),
      "user-1",
    );

    expect(result).toEqual({
      ok: true,
      preferences: {
        allocation: false,
        scoreChange: true,
        targetPrice: false,
        watchlistOpportunity: true,
      },
      source: "stored",
    });
  });

  it("saves preferences as database columns", async () => {
    const writes: unknown[] = [];
    const result = await saveAlertPreferences(
      createClient({ data: null, writes }),
      "user-1",
      {
        allocation: true,
        scoreChange: false,
        targetPrice: false,
        watchlistOpportunity: true,
      },
    );

    expect(result).toEqual({
      ok: true,
      preferences: {
        allocation: true,
        scoreChange: false,
        targetPrice: false,
        watchlistOpportunity: true,
      },
    });
    expect(writes).toEqual([
      {
        allocation_enabled: true,
        score_change_enabled: false,
        target_price_enabled: false,
        user_id: "user-1",
        watchlist_opportunity_enabled: true,
      },
    ]);
  });

  it("parses unchecked checkboxes as disabled preferences", () => {
    const formData = new FormData();
    formData.set("allocation", "on");
    formData.set("watchlist_opportunity", "on");

    expect(parseAlertPreferencesFormData(formData)).toEqual({
      allocation: true,
      scoreChange: false,
      targetPrice: false,
      watchlistOpportunity: true,
    });
  });

  it("creates default alert preference inserts", () => {
    expect(createAlertPreferencesInsert("user-1")).toEqual({
      allocation_enabled: true,
      score_change_enabled: true,
      target_price_enabled: true,
      user_id: "user-1",
      watchlist_opportunity_enabled: true,
    });
  });
});

function createClient({
  data,
  error = null,
  writes = [],
}: {
  data: unknown;
  error?: { message: string } | null;
  writes?: unknown[];
}) {
  const builder = {
    eq() {
      return builder;
    },
    maybeSingle() {
      return Promise.resolve({ data, error });
    },
    select() {
      return builder;
    },
    upsert(value: unknown) {
      writes.push(value);
      return Promise.resolve({ data: null, error });
    },
  };

  return {
    from() {
      return builder;
    },
  } as never;
}
