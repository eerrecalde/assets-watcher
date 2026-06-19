import Link from "next/link";

import {
  FeedbackSnackbars,
  type FeedbackSnackbarMessage,
} from "@/components/feedback-snackbars";
import {
  loadUserRuleThresholds,
  type LoadUserRuleThresholdsResult,
  type UserRulesClient,
} from "@/lib/scoring/user-rules";
import {
  loadAlertPreferences,
  type AlertPreferences,
  type AlertPreferencesClient,
  type LoadAlertPreferencesResult,
} from "./alert-preferences";
import type { GrahamScoringThresholds } from "@/lib/scoring/thresholds";
import {
  resetRuleThresholdsAction,
  updateAlertPreferencesAction,
  updateAllocationThresholdsAction,
  updateValuationThresholdsAction,
} from "./actions";

type AuthenticatedUser = {
  email?: string | null;
  id: string;
};

export type SettingsSupabaseClient = UserRulesClient &
  AlertPreferencesClient & {
  auth: {
    getUser(): PromiseLike<{
      data: {
        user: AuthenticatedUser | null;
      };
    }>;
  };
};

export type RulesSettingsPageDependencies = {
  createSupabaseClient: () => Promise<SettingsSupabaseClient>;
  feedbackMessages?: FeedbackSnackbarMessage[];
  loadPreferences?: (
    supabase: AlertPreferencesClient,
    userId: string,
  ) => Promise<LoadAlertPreferencesResult>;
  loadRuleThresholds?: (
    supabase: UserRulesClient,
    userId: string,
  ) => Promise<LoadUserRuleThresholdsResult>;
  redirectToLogin: (url: string) => never;
  resetRuleThresholds?: () => Promise<void>;
  updateAlertPreferences?: (formData: FormData) => Promise<void>;
  updateAllocationThresholds?: (formData: FormData) => Promise<void>;
  updateValuationThresholds?: (formData: FormData) => Promise<void>;
};

type RuleDefinition = {
  description: string;
  format: "number" | "percent";
  getValue: (thresholds: GrahamScoringThresholds) => number;
  label: string;
};

const RULE_DEFINITIONS: RuleDefinition[] = [
  {
    description: "Used by valuation scoring for price-to-earnings checks.",
    format: "number",
    getValue: (thresholds) => thresholds.maxPe,
    label: "Maximum P/E",
  },
  {
    description: "Used by valuation scoring for price-to-book checks.",
    format: "number",
    getValue: (thresholds) => thresholds.maxPb,
    label: "Maximum P/B",
  },
  {
    description:
      "Used by valuation scoring when cached price and Graham Number are available.",
    format: "percent",
    getValue: (thresholds) => thresholds.minMarginOfSafetyPercent,
    label: "Minimum margin of safety",
  },
  {
    description: "Used by financial safety scoring for liquidity checks.",
    format: "number",
    getValue: (thresholds) => thresholds.minCurrentRatio,
    label: "Minimum current ratio",
  },
  {
    description:
      "Used by financial safety scoring for balance-sheet leverage checks.",
    format: "number",
    getValue: (thresholds) => thresholds.maxDebtToEquity,
    label: "Maximum debt/equity",
  },
  {
    description:
      "Used by portfolio-fit scoring to flag single-position concentration.",
    format: "percent",
    getValue: (thresholds) => thresholds.maxSingleStockAllocationPercent,
    label: "Maximum single-stock allocation",
  },
  {
    description: "Used by portfolio-fit scoring to flag sector concentration.",
    format: "percent",
    getValue: (thresholds) => thresholds.maxSectorAllocationPercent,
    label: "Maximum sector allocation",
  },
];

const ALERT_PREFERENCE_DEFINITIONS: Array<{
  description: string;
  key: keyof AlertPreferences;
  label: string;
  name: string;
}> = [
  {
    description:
      "Flags owned holdings above allocation limits or missing enough data to calculate concentration.",
    key: "allocation",
    label: "Allocation alerts",
    name: "allocation",
  },
  {
    description:
      "Flags target-price comparisons for watchlist items with cached prices.",
    key: "targetPrice",
    label: "Target price alerts",
    name: "target_price",
  },
  {
    description:
      "Flags deterministic stock-score and portfolio-fit label or rule changes.",
    key: "scoreChange",
    label: "Score change alerts",
    name: "score_change",
  },
  {
    description:
      "Flags watched stocks with positive deterministic labels and compatible target-price context.",
    key: "watchlistOpportunity",
    label: "Watchlist opportunity alerts",
    name: "watchlist_opportunity",
  },
];

function formatRuleValue(value: number, format: RuleDefinition["format"]) {
  const formatted = new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(value);

  return format === "percent" ? `${formatted}%` : formatted;
}

function SourceBadge({ source }: { source: "defaults" | "stored" }) {
  return (
    <span
      className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${
        source === "stored"
          ? "border-emerald-800 bg-emerald-950/60 text-emerald-200"
          : "border-neutral-700 bg-neutral-900 text-neutral-300"
      }`}
    >
      {source === "stored" ? "Stored rules" : "Product-plan defaults"}
    </span>
  );
}

function ValuationThresholdForm({
  action,
  thresholds,
}: {
  action: (formData: FormData) => Promise<void>;
  thresholds: GrahamScoringThresholds;
}) {
  return (
    <form
      action={action}
      className="grid gap-5 border-t border-neutral-800 pt-8"
    >
      <div>
        <h2 className="text-lg font-semibold text-white">
          Valuation thresholds
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-400">
          Adjust the valuation limits used by deterministic Graham-inspired
          checks. These settings shape educational labels and do not recommend
          buying or selling.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <label className="grid gap-2 text-sm font-medium text-neutral-200">
          Maximum P/E
          <input
            className="h-11 rounded-md border border-neutral-700 bg-neutral-950 px-3 text-sm text-white outline-none transition focus:border-emerald-400"
            defaultValue={thresholds.maxPe}
            inputMode="decimal"
            min="0.01"
            name="max_pe"
            required
            step="0.01"
            title="Enter a number greater than 0 with up to 2 decimal places."
            type="number"
          />
        </label>

        <label className="grid gap-2 text-sm font-medium text-neutral-200">
          Maximum P/B
          <input
            className="h-11 rounded-md border border-neutral-700 bg-neutral-950 px-3 text-sm text-white outline-none transition focus:border-emerald-400"
            defaultValue={thresholds.maxPb}
            inputMode="decimal"
            min="0.01"
            name="max_pb"
            required
            step="0.01"
            title="Enter a number greater than 0 with up to 2 decimal places."
            type="number"
          />
        </label>

        <label className="grid gap-2 text-sm font-medium text-neutral-200">
          Minimum margin of safety %
          <input
            className="h-11 rounded-md border border-neutral-700 bg-neutral-950 px-3 text-sm text-white outline-none transition focus:border-emerald-400"
            defaultValue={thresholds.minMarginOfSafetyPercent}
            inputMode="decimal"
            max="100"
            min="0"
            name="min_margin_of_safety"
            required
            step="0.01"
            title="Enter a percentage from 0 to 100 with up to 2 decimal places."
            type="number"
          />
        </label>
      </div>

      <div>
        <button
          className="inline-flex h-10 items-center justify-center rounded-md bg-emerald-400 px-4 text-sm font-semibold text-neutral-950 transition hover:bg-emerald-300"
          type="submit"
        >
          Save valuation thresholds
        </button>
      </div>
    </form>
  );
}

function AllocationThresholdForm({
  action,
  thresholds,
}: {
  action: (formData: FormData) => Promise<void>;
  thresholds: GrahamScoringThresholds;
}) {
  return (
    <form
      action={action}
      className="grid gap-5 border-t border-neutral-800 pt-8"
    >
      <div>
        <h2 className="text-lg font-semibold text-white">
          Allocation thresholds
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-400">
          Adjust the portfolio-fit limits used to flag position and sector
          concentration. These settings shape educational labels and do not
          recommend buying or selling.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-2 text-sm font-medium text-neutral-200">
          Maximum single-stock allocation %
          <input
            className="h-11 rounded-md border border-neutral-700 bg-neutral-950 px-3 text-sm text-white outline-none transition focus:border-emerald-400"
            defaultValue={thresholds.maxSingleStockAllocationPercent}
            inputMode="decimal"
            max="100"
            min="0.01"
            name="max_single_stock_allocation"
            required
            step="0.01"
            title="Enter a percentage greater than 0 and no more than 100 with up to 2 decimal places."
            type="number"
          />
        </label>

        <label className="grid gap-2 text-sm font-medium text-neutral-200">
          Maximum sector allocation %
          <input
            className="h-11 rounded-md border border-neutral-700 bg-neutral-950 px-3 text-sm text-white outline-none transition focus:border-emerald-400"
            defaultValue={thresholds.maxSectorAllocationPercent}
            inputMode="decimal"
            max="100"
            min="0.01"
            name="max_sector_allocation"
            required
            step="0.01"
            title="Enter a percentage greater than 0 and no more than 100 with up to 2 decimal places."
            type="number"
          />
        </label>
      </div>

      <div>
        <button
          className="inline-flex h-10 items-center justify-center rounded-md bg-emerald-400 px-4 text-sm font-semibold text-neutral-950 transition hover:bg-emerald-300"
          type="submit"
        >
          Save allocation thresholds
        </button>
      </div>
    </form>
  );
}

function AlertPreferencesForm({
  action,
  preferences,
}: {
  action: (formData: FormData) => Promise<void>;
  preferences: AlertPreferences;
}) {
  return (
    <form
      action={action}
      className="grid gap-5 border-t border-neutral-800 pt-8"
    >
      <div>
        <h2 className="text-lg font-semibold text-white">
          Alert preferences
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-400">
          Choose which deterministic review queue categories appear on the
          dashboard. Disabled categories stay hidden until you enable them
          again.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {ALERT_PREFERENCE_DEFINITIONS.map((definition) => (
          <label
            className="flex gap-3 rounded-lg border border-neutral-800 bg-neutral-900/70 p-4 text-sm text-neutral-200"
            key={definition.name}
          >
            <input
              className="mt-1 h-4 w-4 rounded border-neutral-700 bg-neutral-950 text-emerald-400"
              defaultChecked={preferences[definition.key]}
              name={definition.name}
              type="checkbox"
              value="on"
            />
            <span>
              <span className="block font-medium text-white">
                {definition.label}
              </span>
              <span className="mt-1 block leading-6 text-neutral-400">
                {definition.description}
              </span>
            </span>
          </label>
        ))}
      </div>

      <div>
        <button
          className="inline-flex h-10 items-center justify-center rounded-md bg-emerald-400 px-4 text-sm font-semibold text-neutral-950 transition hover:bg-emerald-300"
          type="submit"
        >
          Save alert preferences
        </button>
      </div>
    </form>
  );
}

function ResetThresholdsForm({ action }: { action: () => Promise<void> }) {
  return (
    <form
      action={action}
      className="grid gap-4 border-t border-neutral-800 pt-8"
    >
      <div>
        <h2 className="text-lg font-semibold text-white">Reset rules</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-400">
          Persist the product-plan defaults for every rule threshold: P/E 20,
          P/B 3, margin of safety 25%, current ratio 1.5, debt/equity 1,
          single-stock allocation 10%, and sector allocation 30%.
        </p>
      </div>

      <div>
        <button
          className="inline-flex h-10 items-center justify-center rounded-md border border-amber-500/70 px-4 text-sm font-semibold text-amber-100 transition hover:border-amber-300 hover:text-white"
          type="submit"
        >
          Reset all thresholds to defaults
        </button>
      </div>
    </form>
  );
}

function RulesTable({ thresholds }: { thresholds: GrahamScoringThresholds }) {
  return (
    <div className="mt-5 overflow-x-auto rounded-lg border border-neutral-800">
      <table className="min-w-[44rem] w-full border-collapse text-left text-sm">
        <thead className="bg-neutral-900 text-xs uppercase tracking-[0.14em] text-neutral-400">
          <tr>
            <th className="px-4 py-3 font-medium">Rule threshold</th>
            <th className="px-4 py-3 font-medium">Current value</th>
            <th className="px-4 py-3 font-medium">Scoring use</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-800">
          {RULE_DEFINITIONS.map((rule) => (
            <tr className="bg-neutral-950" key={rule.label}>
              <td className="px-4 py-4 align-top font-medium text-neutral-100">
                {rule.label}
              </td>
              <td className="px-4 py-4 align-top text-neutral-200">
                {formatRuleValue(rule.getValue(thresholds), rule.format)}
              </td>
              <td className="px-4 py-4 align-top text-neutral-400">
                {rule.description}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SettingsNavigation() {
  return (
    <div className="flex flex-wrap gap-3">
      <Link
        className="inline-flex h-10 items-center justify-center rounded-md border border-neutral-700 px-4 text-sm font-medium text-neutral-200 transition hover:border-neutral-500 hover:text-white"
        href="/dashboard"
      >
        Dashboard
      </Link>
      <Link
        className="inline-flex h-10 items-center justify-center rounded-md border border-neutral-700 px-4 text-sm font-medium text-neutral-200 transition hover:border-neutral-500 hover:text-white"
        href="/holdings"
      >
        Holdings
      </Link>
      <Link
        className="inline-flex h-10 items-center justify-center rounded-md border border-neutral-700 px-4 text-sm font-medium text-neutral-200 transition hover:border-neutral-500 hover:text-white"
        href="/watchlist"
      >
        Watchlist
      </Link>
    </div>
  );
}

export async function RulesSettingsPage({
  createSupabaseClient,
  feedbackMessages = [],
  loadPreferences = loadAlertPreferences,
  loadRuleThresholds = loadUserRuleThresholds,
  redirectToLogin,
  resetRuleThresholds = resetRuleThresholdsAction,
  updateAlertPreferences = updateAlertPreferencesAction,
  updateAllocationThresholds = updateAllocationThresholdsAction,
  updateValuationThresholds = updateValuationThresholdsAction,
}: RulesSettingsPageDependencies) {
  const supabase = await createSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return redirectToLogin(
      `/login?next=${encodeURIComponent("/settings/rules")}`,
    );
  }

  const rulesResult = await loadRuleThresholds(supabase, user.id);
  const preferencesResult = await loadPreferences(supabase, user.id);
  const settingsErrorMessage = !rulesResult.ok
    ? rulesResult.error.message
    : !preferencesResult.ok
      ? preferencesResult.error.message
      : null;

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <FeedbackSnackbars messages={feedbackMessages} />
      <section className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-6 py-10 sm:px-8">
        <header className="flex flex-col gap-5 border-b border-neutral-800 pb-8 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.16em] text-emerald-300">
              Manual portfolio tracker
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-normal text-white">
              Rules settings
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-neutral-400">
              Review the deterministic scoring thresholds used for cached
              valuation, safety, and portfolio-fit checks. These preferences
              shape educational labels and are not financial advice.
            </p>
          </div>

          <SettingsNavigation />
        </header>

        <div className="grid gap-8 py-8">
          <section className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
            <div>
              <p className="text-sm text-neutral-400">Signed in as</p>
              <p className="mt-2 text-lg font-medium text-white">
                {user.email}
              </p>
            </div>

            {rulesResult.ok ? (
              <SourceBadge source={rulesResult.source} />
            ) : null}
          </section>

          {rulesResult.ok && preferencesResult.ok ? (
            <>
              <ValuationThresholdForm
                action={updateValuationThresholds}
                thresholds={rulesResult.thresholds}
              />

              <AllocationThresholdForm
                action={updateAllocationThresholds}
                thresholds={rulesResult.thresholds}
              />

              <AlertPreferencesForm
                action={updateAlertPreferences}
                preferences={preferencesResult.preferences}
              />

              <ResetThresholdsForm action={resetRuleThresholds} />

              <section className="border-t border-neutral-800 pt-8">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-white">
                      Scoring thresholds
                    </h2>
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-400">
                      Values come from your stored rule settings when available,
                      otherwise the app uses the product-plan defaults.
                    </p>
                  </div>
                </div>

                <RulesTable thresholds={rulesResult.thresholds} />
              </section>
            </>
          ) : settingsErrorMessage ? (
            <p className="rounded-md border border-red-900 bg-red-950/60 px-4 py-3 text-sm text-red-200">
              {settingsErrorMessage}
            </p>
          ) : null}
        </div>
      </section>
    </main>
  );
}
