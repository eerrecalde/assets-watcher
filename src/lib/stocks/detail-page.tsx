import Link from "next/link";
import type { ReactNode } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  FeedbackSnackbars,
  type FeedbackSnackbarMessage,
} from "../../components/feedback-snackbars";
import {
  classifyStockDetailPriceFreshness,
  createCachedFiftyTwoWeekRange,
  createCachedPriceMovementSummary,
  createHistoricalPriceChartPoints,
  createLatestCachedPriceSummary,
  createStockProfileFields,
  createStockFundamentalsSummary,
  getTrailingFiftyTwoWeekStartDate,
  getTrailingOneYearStartDate,
  selectLatestRelevantFundamentals,
  type CachedFiftyTwoWeekRange,
  type CachedMovingAverageMetric,
  type CachedPriceMovementMetric,
  type CachedPriceMovementSummary,
  type HistoricalPriceChartPoint,
  type LatestCachedPriceSummary,
  type StockDetailPriceFreshness,
  type StockPriceInput,
  type StockFundamentalMetric,
  type StockFundamentalInput,
  type StockFundamentalsSummary,
} from "./detail";
import {
  isValidNormalizedStockSymbol,
  normalizeStockSymbol,
} from "./symbols";
import {
  buildUserHoldingSummary,
  type UserHoldingSummary,
} from "../portfolios/holding-summary";
import {
  calculateHoldingValue,
} from "../portfolios/totals";
import type { Database } from "../../types/supabase";
import type {
  PortfolioFitScoringResult,
} from "../scoring/portfolio-fit";
import type {
  RuleCheckResult,
  RuleCheckStatus,
  ScoringDataPoint,
  ScoreLayerResult,
  StockScoreLayerId,
  StockScoringResult,
} from "../scoring/types";

export const dynamic = "force-dynamic";

type StockRow = Database["public"]["Tables"]["stocks"]["Row"];
type HoldingRow = Database["public"]["Tables"]["holdings"]["Row"];
type PortfolioCashRow = Database["public"]["Tables"]["portfolio_cash"]["Row"];
type StockPriceRow = Database["public"]["Tables"]["stock_prices"]["Row"];
type PortfolioRow = Database["public"]["Tables"]["portfolios"]["Row"];
type WatchlistItemRow =
  Database["public"]["Tables"]["watchlist_items"]["Row"];
type StockScoreRow = Database["public"]["Tables"]["stock_scores"]["Row"];
type PortfolioScoreRow =
  Database["public"]["Tables"]["portfolio_stock_scores"]["Row"];
type AppSupabaseClient = SupabaseClient<Database>;
type RefreshStockDetailMarketDataAction = (
  formData: FormData,
) => Promise<void> | void;

type AuthenticatedUser = {
  email?: string | null;
  id: string;
};

export type StockDetailPageProps = {
  params: Promise<{
    symbol: string;
  }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export type StockDetailPageDependencies = {
  createSupabaseClient: () => Promise<AppSupabaseClient>;
  ensureDefaultPortfolio: (
    supabase: AppSupabaseClient,
    user: AuthenticatedUser,
  ) => Promise<
    | {
        error?: never;
        portfolio: Pick<PortfolioRow, "base_currency" | "id" | "name">;
      }
    | {
        error: string;
        portfolio?: never;
      }
  >;
  redirectToLogin: (url: string) => never;
  refreshMarketDataAction?: RefreshStockDetailMarketDataAction;
};

const chartDimensions = {
  height: 320,
  paddingBottom: 48,
  paddingLeft: 112,
  paddingRight: 28,
  paddingTop: 24,
  width: 760,
};

const currencyFormatterCache = new Map<string, Intl.NumberFormat>();

function formatNumber(value: number, maximumFractionDigits = 6) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits,
    minimumFractionDigits: 0,
  }).format(value);
}

function formatDate(value: string) {
  const date = new Date(value.includes("T") ? value : `${value}T00:00:00.000Z`);

  if (Number.isNaN(date.getTime())) {
    return "Unavailable";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(date);
}

function formatDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unavailable";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(date);
}

function formatCurrency(value: number | null, currency: string) {
  if (value === null) {
    return "Not cached";
  }

  const cacheKey = currency.toUpperCase();
  const cachedFormatter = currencyFormatterCache.get(cacheKey);

  if (cachedFormatter) {
    return cachedFormatter.format(value);
  }

  try {
    const formatter = new Intl.NumberFormat("en-US", {
      currency: cacheKey,
      maximumFractionDigits: 2,
      style: "currency",
    });

    currencyFormatterCache.set(cacheKey, formatter);

    return formatter.format(value);
  } catch {
    return `${new Intl.NumberFormat("en-US", {
      maximumFractionDigits: 2,
      minimumFractionDigits: 2,
    }).format(value)} ${cacheKey}`;
  }
}

function formatInteger(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(value);
}

function formatPercentage(value: number | null) {
  return value === null ? "Not cached" : `${formatNumber(value, 2)}%`;
}

function formatScoreValue(value: number | null) {
  return value === null ? "Insufficient data" : `${formatNumber(value, 0)}/100`;
}

function formatOptionalCurrencyValue(value: string | null, currency: string) {
  if (value === null) {
    return "Not set";
  }

  const numericValue = Number(value);

  return Number.isFinite(numericValue)
    ? formatCurrency(numericValue, currency)
    : "Unavailable";
}

function formatFundamentalPercentage(value: number) {
  return `${formatNumber(value * 100, 2)}%`;
}

function formatFundamentalPeriodType(
  periodType: StockFundamentalsSummary["periodType"],
) {
  return {
    annual: "Annual",
    quarterly: "Quarterly",
    ttm: "TTM",
  }[periodType];
}

function getMessageValue(
  params: Record<string, string | string[] | undefined>,
  key: string,
) {
  const value = params[key];

  return typeof value === "string" ? value : undefined;
}

function buildFeedbackMessages(
  params: Record<string, string | string[] | undefined>,
) {
  const messages: FeedbackSnackbarMessage[] = [];
  const noticeId = getMessageValue(params, "notice") ?? "notice";
  const successMessage = getMessageValue(params, "success");
  const warningMessage = getMessageValue(params, "warning");
  const errorMessage = getMessageValue(params, "error");

  if (successMessage) {
    messages.push({
      id: `${noticeId}:success`,
      message: successMessage,
      tone: "success",
    });
  }

  if (warningMessage) {
    messages.push({
      id: `${noticeId}:warning`,
      message: warningMessage,
      tone: "warning",
    });
  }

  if (errorMessage) {
    messages.push({
      id: `${noticeId}:error`,
      message: errorMessage,
      tone: "error",
    });
  }

  return messages;
}

function formatFreshnessStatus(status: StockDetailPriceFreshness["status"]) {
  return {
    fresh: "Fresh",
    stale: "Stale",
    unavailable: "Unavailable",
  }[status];
}

function formatFreshnessDescription(freshness: StockDetailPriceFreshness) {
  if (!freshness.asOfDate) {
    return freshness.reason;
  }

  const status = formatFreshnessStatus(freshness.status);
  const staleAfter = freshness.staleAfterDate
    ? ` Stale after ${formatDate(freshness.staleAfterDate)}.`
    : "";

  return `${status} as of latest cached close ${formatDate(
    freshness.asOfDate,
  )}.${staleAfter}`;
}

function FreshnessBadge({
  freshness,
}: {
  freshness: StockDetailPriceFreshness;
}) {
  const className = {
    fresh: "border-emerald-800 bg-emerald-950/70 text-emerald-200",
    stale: "border-amber-800 bg-amber-950/70 text-amber-100",
    unavailable: "border-neutral-700 bg-neutral-950 text-neutral-300",
  }[freshness.status];

  return (
    <span
      className={`inline-flex h-7 items-center rounded-md border px-2.5 text-xs font-semibold ${className}`}
    >
      {formatFreshnessStatus(freshness.status)}
    </span>
  );
}

function PriceFreshnessNote({
  freshness,
}: {
  freshness: StockDetailPriceFreshness;
}) {
  return (
    <p className="mt-3 text-sm leading-6 text-neutral-500">
      {formatFreshnessDescription(freshness)}
    </p>
  );
}

function formatFundamentalMetricValue({
  currency,
  metric,
}: {
  currency: string;
  metric: StockFundamentalMetric;
}) {
  if (metric.value === null) {
    return "Unavailable";
  }

  if (metric.format === "currency") {
    return formatCurrency(metric.value, currency);
  }

  if (metric.format === "percentage") {
    return formatFundamentalPercentage(metric.value);
  }

  return formatNumber(metric.value, 2);
}

function formatSignedPercentage(value: number | null) {
  if (value === null) {
    return "Unavailable";
  }

  const formatted = formatNumber(Math.abs(value), 2);

  if (value > 0) {
    return `+${formatted}%`;
  }

  if (value < 0) {
    return `-${formatted}%`;
  }

  return "0%";
}

function formatLayerName(layerId: StockScoreLayerId) {
  return {
    market_context: "Market context",
    quality: "Quality",
    safety: "Safety",
    valuation: "Valuation",
  }[layerId];
}

function formatRuleStatus(status: RuleCheckStatus) {
  return {
    fail: "Fail",
    insufficient_data: "Insufficient data",
    not_applicable: "Not applicable",
    pass: "Pass",
    unavailable: "Unavailable",
    warning: "Warning",
  }[status];
}

function getRuleStatusClassName(status: RuleCheckStatus) {
  return {
    fail: "border-red-900 bg-red-950/50 text-red-100",
    insufficient_data: "border-neutral-700 bg-neutral-950 text-neutral-300",
    not_applicable: "border-neutral-700 bg-neutral-950 text-neutral-300",
    pass: "border-emerald-800 bg-emerald-950/70 text-emerald-200",
    unavailable: "border-neutral-700 bg-neutral-950 text-neutral-300",
    warning: "border-amber-800 bg-amber-950/70 text-amber-100",
  }[status];
}

function formatThresholdOperator(
  operator: NonNullable<RuleCheckResult["threshold"]>["operator"],
) {
  return {
    above: ">",
    above_or_equal: ">=",
    below: "<",
    below_or_equal: "<=",
    equals: "=",
  }[operator];
}

function formatScoringUnitValue({
  currency,
  unit,
  value,
}: {
  currency: string;
  unit: "currency" | "number" | "percent" | "ratio";
  value: number;
}) {
  if (unit === "currency") {
    return formatCurrency(value, currency);
  }

  if (unit === "percent") {
    return `${formatNumber(value, 2)}%`;
  }

  return formatNumber(value, 2);
}

function formatMeasuredValue({
  currency,
  measuredValue,
  threshold,
}: {
  currency: string;
  measuredValue: RuleCheckResult["measuredValue"];
  threshold: RuleCheckResult["threshold"];
}) {
  if (!measuredValue) {
    return "Unavailable";
  }

  if (measuredValue.availability !== "available") {
    return "Unavailable";
  }

  if (typeof measuredValue.value === "boolean") {
    return measuredValue.value ? "Yes" : "No";
  }

  return formatScoringUnitValue({
    currency,
    unit: threshold?.unit ?? "number",
    value: measuredValue.value,
  });
}

function formatThreshold({
  currency,
  rule,
}: {
  currency: string;
  rule: RuleCheckResult;
}) {
  if (!rule.threshold) {
    return "No numeric threshold";
  }

  return `${rule.threshold.label} ${formatThresholdOperator(
    rule.threshold.operator,
  )} ${formatScoringUnitValue({
    currency,
    unit: rule.threshold.unit,
    value: rule.threshold.value,
  })}`;
}

function getMeasuredValueMeta(measuredValue: RuleCheckResult["measuredValue"]) {
  if (!measuredValue) {
    return "No measured value stored for this rule.";
  }

  const dataPoint = measuredValue as ScoringDataPoint | ScoringDataPoint<boolean>;
  const parts = [
    `Source ${dataPoint.source.replaceAll("_", " ")}`,
    dataPoint.asOfDate ? `as of ${dataPoint.asOfDate}` : null,
    dataPoint.freshness !== "unknown" ? dataPoint.freshness : null,
  ].filter(Boolean);

  if (dataPoint.availability !== "available") {
    parts.push(dataPoint.reason);
  }

  return parts.join(". ");
}

const stockScoreLayerOrder: StockScoreLayerId[] = [
  "valuation",
  "quality",
  "safety",
  "market_context",
];

function buildLatestPriceMap(
  prices: Pick<StockPriceRow, "close" | "price_date" | "symbol">[],
) {
  const latestPrices = new Map<
    string,
    Pick<StockPriceRow, "close" | "price_date" | "symbol">
  >();

  for (const price of prices) {
    if (!latestPrices.has(price.symbol)) {
      latestPrices.set(price.symbol, price);
    }
  }

  return latestPrices;
}

function logStockDetailLoadError({
  error,
  scope,
  symbol,
}: {
  error: string | null | undefined;
  scope: string;
  symbol: string;
}) {
  if (!error) {
    return;
  }

  console.error("Stock detail data load failed.", {
    error,
    scope,
    symbol,
  });
}

function parseStockScoreSnapshotResult(
  snapshot: Pick<StockScoreRow, "explanation_json"> | null,
) {
  const value = snapshot?.explanation_json;

  if (!isRecord(value)) {
    return null;
  }

  const result = value.result;

  if (!isRecord(result)) {
    return null;
  }

  if (
    typeof result.symbol !== "string" ||
    typeof result.label !== "string" ||
    typeof result.scoredAt !== "string" ||
    !isRecord(result.layers) ||
    !isRecord(result.explanation)
  ) {
    return null;
  }

  return result as unknown as StockScoringResult;
}

function parsePortfolioScoreSnapshotResult(
  snapshot: Pick<PortfolioScoreRow, "explanation_json"> | null,
) {
  const value = snapshot?.explanation_json;

  if (!isRecord(value)) {
    return null;
  }

  const result = value.result;

  if (!isRecord(result)) {
    return null;
  }

  if (
    typeof result.label !== "string" ||
    typeof result.status !== "string" ||
    !Array.isArray(result.ruleChecks) ||
    !isRecord(result.explanation)
  ) {
    return null;
  }

  return result as unknown as PortfolioFitScoringResult;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function createPriceHistoryChart(points: HistoricalPriceChartPoint[]) {
  if (points.length < 2) {
    return null;
  }

  const plot = {
    bottom: chartDimensions.height - chartDimensions.paddingBottom,
    left: chartDimensions.paddingLeft,
    right: chartDimensions.width - chartDimensions.paddingRight,
    top: chartDimensions.paddingTop,
  };
  const closes = points.map((point) => point.close);
  const minClose = Math.min(...closes);
  const maxClose = Math.max(...closes);
  const closeRange = maxClose - minClose;
  const padding =
    closeRange === 0 ? Math.max(Math.abs(maxClose) * 0.05, 1) : closeRange * 0.08;
  const yMin = minClose - padding;
  const yMax = maxClose + padding;
  const yRange = yMax - yMin;
  const plotWidth = plot.right - plot.left;
  const plotHeight = plot.bottom - plot.top;
  const xForIndex = (index: number) =>
    plot.left + (index / (points.length - 1)) * plotWidth;
  const yForClose = (close: number) =>
    plot.bottom - ((close - yMin) / yRange) * plotHeight;
  const plottedPoints = points.map((point, index) => ({
    ...point,
    x: xForIndex(index),
    y: yForClose(point.close),
  }));
  const xTickIndexes = Array.from(
    new Set([0, Math.floor((points.length - 1) / 2), points.length - 1]),
  );

  return {
    endDate: points[points.length - 1].priceDate,
    latestPoint: plottedPoints[plottedPoints.length - 1],
    linePath: plottedPoints
      .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
      .join(" "),
    maxClose,
    minClose,
    plot,
    startDate: points[0].priceDate,
    xTicks: xTickIndexes.map((index) => ({
      priceDate: points[index].priceDate,
      textAnchor:
        index === 0
          ? ("start" as const)
          : index === points.length - 1
            ? ("end" as const)
            : ("middle" as const),
      x: xForIndex(index),
    })),
    yTicks: Array.from({ length: 5 }, (_, index) => {
      const value = yMin + ((yMax - yMin) * index) / 4;

      return {
        value,
        y: yForClose(value),
      };
    }).reverse(),
  };
}

function UnavailableStockState({
  errorMessage,
  symbol,
}: {
  errorMessage?: string;
  symbol: string;
}) {
  return (
    <section className="rounded-lg border border-neutral-800 bg-neutral-900/70 p-8">
      <h2 className="text-lg font-semibold text-white">
        Cached stock unavailable
      </h2>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-neutral-400">
        {symbol
          ? `No local cached stock record is available for ${symbol}.`
          : "The stock symbol in this route is not valid."}
      </p>
      {errorMessage ? (
        <p className="mt-5 rounded-md border border-red-900 bg-red-950/60 px-4 py-3 text-sm text-red-200">
          Stock detail data could not be loaded.
        </p>
      ) : null}
    </section>
  );
}

function HoldingMetric({
  label,
  subtext,
  tone = "neutral",
  value,
}: {
  label: string;
  subtext?: string;
  tone?: "negative" | "neutral" | "positive";
  value: string;
}) {
  const valueClassName =
    tone === "positive"
      ? "text-emerald-200"
      : tone === "negative"
        ? "text-red-200"
        : "text-neutral-100";

  return (
    <div className="rounded-md border border-neutral-800 bg-neutral-950 p-4">
      <dt className="text-xs font-medium uppercase tracking-[0.14em] text-neutral-500">
        {label}
      </dt>
      <dd className={`mt-2 break-words text-sm font-medium ${valueClassName}`}>
        {value}
      </dd>
      {subtext ? (
        <dd className="mt-1 text-xs text-neutral-500">{subtext}</dd>
      ) : null}
    </div>
  );
}

function UserHoldingSummarySection({
  loadError,
  portfolioName,
  summary,
  symbol,
}: {
  loadError: boolean;
  portfolioName?: string;
  summary: UserHoldingSummary | null;
  symbol: string;
}) {
  return (
    <section className="rounded-lg border border-neutral-800 bg-neutral-900/70 p-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Your holding</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-400">
            Current position data for this symbol from your default portfolio.
          </p>
        </div>
        {portfolioName ? (
          <p className="text-sm text-neutral-500">{portfolioName}</p>
        ) : null}
      </div>

      {loadError ? (
        <p className="mt-5 rounded-md border border-red-900 bg-red-950/60 px-4 py-3 text-sm text-red-200">
          Holding data could not be fully loaded.
        </p>
      ) : null}

      {!summary ? (
        <p className="mt-5 rounded-md border border-red-900 bg-red-950/60 px-4 py-3 text-sm text-red-200">
          Your default portfolio could not be loaded.
        </p>
      ) : summary.status === "not-owned" ? (
        <div className="mt-6 rounded-md border border-neutral-800 bg-neutral-950 p-5">
          <h3 className="text-base font-semibold text-white">Not owned</h3>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-400">
            You do not currently hold {symbol} in your default portfolio.
          </p>
        </div>
      ) : (
        <>
          {!summary.hasSufficientPriceData ? (
            <p className="mt-5 rounded-md border border-amber-900 bg-amber-950/40 px-4 py-3 text-sm text-amber-100">
              Insufficient cached price data. Market value, unrealised
              gain/loss, and portfolio percentage are not calculated until a
              latest cached close is available.
            </p>
          ) : null}

          <dl className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <HoldingMetric
              label="Quantity"
              value={formatNumber(summary.quantity)}
            />
            <HoldingMetric
              label="Average cost"
              value={formatCurrency(summary.averageCost, summary.currency)}
            />
            <HoldingMetric label="Currency" value={summary.currency} />
            <HoldingMetric
              label="Latest cached price"
              subtext={
                summary.latestPriceDate
                  ? `Price date ${summary.latestPriceDate}`
                  : undefined
              }
              value={formatCurrency(summary.latestClose, summary.currency)}
            />
            <HoldingMetric
              label="Market value"
              value={formatCurrency(summary.marketValue, summary.currency)}
            />
            <HoldingMetric
              label="Unrealised gain/loss"
              tone={
                summary.unrealizedGain === null
                  ? "neutral"
                  : summary.unrealizedGain >= 0
                    ? "positive"
                    : "negative"
              }
              value={formatCurrency(summary.unrealizedGain, summary.currency)}
            />
            <HoldingMetric
              label="Portfolio %"
              subtext={
                summary.positionAllocation.status === "partial-market-data"
                  ? "Partial data"
                  : undefined
              }
              value={formatPercentage(summary.portfolioPercentage)}
            />
          </dl>
        </>
      )}
    </section>
  );
}

function WatchlistStatusSection({
  currency,
  item,
  loadError,
  portfolioName,
  symbol,
}: {
  currency: string;
  item: Pick<WatchlistItemRow, "id" | "notes" | "target_price"> | null;
  loadError: boolean;
  portfolioName?: string;
  symbol: string;
}) {
  const trimmedNotes = item?.notes?.trim();

  return (
    <section className="rounded-lg border border-neutral-800 bg-neutral-900/70 p-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Your watchlist</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-400">
            Wanted-stock context for this symbol from your default portfolio.
          </p>
        </div>
        {portfolioName ? (
          <p className="text-sm text-neutral-500">{portfolioName}</p>
        ) : null}
      </div>

      {loadError ? (
        <p className="mt-5 rounded-md border border-red-900 bg-red-950/60 px-4 py-3 text-sm text-red-200">
          Watchlist data could not be fully loaded.
        </p>
      ) : null}

      {item ? (
        <div className="mt-6 rounded-md border border-emerald-900 bg-emerald-950/30 p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-base font-semibold text-white">Watching</h3>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-400">
                {symbol} is in your default portfolio watchlist.
              </p>
            </div>
            <span className="inline-flex h-7 w-fit items-center rounded-md border border-emerald-800 bg-emerald-950/70 px-2.5 text-xs font-semibold text-emerald-200">
              Watched
            </span>
          </div>

          <dl className="mt-5 grid gap-4 sm:grid-cols-2">
            <div className="rounded-md border border-neutral-800 bg-neutral-950 p-4">
              <dt className="text-xs font-medium uppercase tracking-[0.14em] text-neutral-500">
                Target price
              </dt>
              <dd className="mt-2 break-words text-sm font-medium text-neutral-100">
                {formatOptionalCurrencyValue(item.target_price, currency)}
              </dd>
            </div>
            <div className="rounded-md border border-neutral-800 bg-neutral-950 p-4">
              <dt className="text-xs font-medium uppercase tracking-[0.14em] text-neutral-500">
                Notes
              </dt>
              <dd
                className={
                  trimmedNotes
                    ? "mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-neutral-100"
                    : "mt-2 text-sm font-medium text-neutral-500"
                }
              >
                {trimmedNotes || "No notes"}
              </dd>
            </div>
          </dl>
        </div>
      ) : (
        <div className="mt-6 rounded-md border border-neutral-800 bg-neutral-950 p-5">
          <h3 className="text-base font-semibold text-white">Not watched</h3>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-400">
            You are not currently watching {symbol} in your default portfolio.
          </p>
        </div>
      )}
    </section>
  );
}

function CompanyProfileCard({ stock }: { stock: StockRow }) {
  return (
    <section className="rounded-lg border border-neutral-800 bg-neutral-900/70 p-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">
            Company profile
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-400">
            Cached company identity from the local stock cache.
          </p>
        </div>
        <p className="text-sm text-neutral-500">
          Updated {formatDate(stock.updated_at)}
        </p>
      </div>

      <dl className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {createStockProfileFields(stock).map((field) => (
          <div
            className="rounded-md border border-neutral-800 bg-neutral-950 p-4"
            key={field.label}
          >
            <dt className="text-xs font-medium uppercase tracking-[0.14em] text-neutral-500">
              {field.label}
            </dt>
            <dd
              className={
                field.isMissing
                  ? "mt-2 break-words text-sm font-medium text-neutral-500"
                  : "mt-2 break-words text-sm font-medium text-neutral-100"
              }
            >
              {field.label === "Profile cache updated"
                ? formatDateTime(field.value)
                : field.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function LatestPriceCard({
  currency,
  freshness,
  isTrackedSymbol,
  loadError,
  latestPrice,
  refreshAction,
  symbol,
}: {
  currency: string;
  freshness: StockDetailPriceFreshness;
  isTrackedSymbol: boolean;
  latestPrice: LatestCachedPriceSummary | null;
  loadError?: string;
  refreshAction?: RefreshStockDetailMarketDataAction;
  symbol: string;
}) {
  const showRefreshAction =
    Boolean(refreshAction) && isTrackedSymbol && freshness.status !== "fresh";

  return (
    <section className="rounded-lg border border-neutral-800 bg-neutral-900/70 p-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">
            Latest cached price
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-400">
            Stored market data snapshot. Pricing is cached and may be stale; it
            is not real-time.
          </p>
          <PriceFreshnessNote freshness={freshness} />
        </div>
        <div className="flex flex-col items-start gap-3 sm:items-end">
          <FreshnessBadge freshness={freshness} />
          {latestPrice ? (
            <p className="text-sm text-neutral-500">
              Price date {formatDate(latestPrice.priceDate)}
            </p>
          ) : null}
          {showRefreshAction && refreshAction ? (
            <form action={refreshAction}>
              <input name="symbol" type="hidden" value={symbol} />
              <button
                className="inline-flex h-10 items-center justify-center rounded-md border border-emerald-900 px-4 text-sm font-medium text-emerald-200 transition hover:border-emerald-700 hover:text-emerald-100"
                type="submit"
              >
                Refresh cached data
              </button>
            </form>
          ) : null}
        </div>
      </div>

      {loadError ? (
        <p className="mt-5 rounded-md border border-red-900 bg-red-950/60 px-4 py-3 text-sm text-red-200">
          Cached price data could not be loaded.
        </p>
      ) : null}

      {latestPrice ? (
        <dl className="mt-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-md border border-neutral-800 bg-neutral-950 p-4">
            <dt className="text-xs font-medium uppercase tracking-[0.14em] text-neutral-500">
              Close
            </dt>
            <dd className="mt-2 text-2xl font-semibold text-white">
              {formatCurrency(latestPrice.close, currency)}
            </dd>
          </div>
          <div className="rounded-md border border-neutral-800 bg-neutral-950 p-4">
            <dt className="text-xs font-medium uppercase tracking-[0.14em] text-neutral-500">
              Cache stored
            </dt>
            <dd className="mt-2 text-sm font-medium text-neutral-100">
              {formatDateTime(latestPrice.cachedAt)}
            </dd>
          </div>
          <div className="rounded-md border border-neutral-800 bg-neutral-950 p-4">
            <dt className="text-xs font-medium uppercase tracking-[0.14em] text-neutral-500">
              Volume
            </dt>
            <dd className="mt-2 text-sm font-medium text-neutral-100">
              {latestPrice.volume === null
                ? "Unavailable"
                : formatInteger(latestPrice.volume)}
            </dd>
          </div>
        </dl>
      ) : (
        <div className="mt-6 rounded-md border border-amber-900 bg-amber-950/40 px-4 py-4">
          <h3 className="text-sm font-semibold text-amber-100">
            Insufficient cached price data
          </h3>
          <p className="mt-2 text-sm leading-6 text-amber-200/80">
            No latest cached close price is available for this stock. The page
            will not show a zero or implied live quote.
          </p>
        </div>
      )}
    </section>
  );
}

function PriceHistoryChartCard({
  currency,
  freshness,
  loadError,
  points,
}: {
  currency: string;
  freshness: StockDetailPriceFreshness;
  loadError?: string;
  points: HistoricalPriceChartPoint[];
}) {
  const chart = createPriceHistoryChart(points);

  return (
    <section className="min-w-0 rounded-lg border border-neutral-800 bg-neutral-900/70 p-5 sm:p-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">
            Cached price history
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-400">
            Daily close prices from the local cache. The chart does not request
            live market data.
          </p>
          <PriceFreshnessNote freshness={freshness} />
        </div>
        <div className="flex flex-col items-start gap-2 sm:items-end">
          <FreshnessBadge freshness={freshness} />
          {chart ? (
            <p className="text-sm text-neutral-500">
              {formatDate(chart.startDate)} to {formatDate(chart.endDate)}
            </p>
          ) : null}
        </div>
      </div>

      {loadError ? (
        <p className="mt-5 rounded-md border border-red-900 bg-red-950/60 px-4 py-3 text-sm text-red-200">
          Cached price history could not be loaded.
        </p>
      ) : null}

      {chart ? (
        <div className="mt-6 max-w-full overflow-x-auto rounded-md border border-neutral-800 bg-neutral-950 p-3 sm:p-4">
          <svg
            aria-label={`Cached daily close price chart from ${chart.startDate} to ${chart.endDate}`}
            className="h-80 min-w-[640px] overflow-visible"
            role="img"
            viewBox={`0 0 ${chartDimensions.width} ${chartDimensions.height}`}
          >
            <title>
              {`Cached daily close prices from ${chart.startDate} to ${chart.endDate}`}
            </title>
            {chart.yTicks.map((tick) => (
              <g key={tick.value}>
                <line
                  stroke="#262626"
                  strokeWidth="1"
                  x1={chart.plot.left}
                  x2={chart.plot.right}
                  y1={tick.y}
                  y2={tick.y}
                />
                <text
                  fill="#a3a3a3"
                  fontSize="12"
                  textAnchor="end"
                  x={chart.plot.left - 12}
                  y={tick.y + 4}
                >
                  {formatCurrency(tick.value, currency)}
                </text>
              </g>
            ))}
            <line
              stroke="#525252"
              strokeWidth="1"
              x1={chart.plot.left}
              x2={chart.plot.right}
              y1={chart.plot.bottom}
              y2={chart.plot.bottom}
            />
            <line
              stroke="#525252"
              strokeWidth="1"
              x1={chart.plot.left}
              x2={chart.plot.left}
              y1={chart.plot.top}
              y2={chart.plot.bottom}
            />
            <path
              d={chart.linePath}
              fill="none"
              stroke="#34d399"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="3"
            />
            <circle
              cx={chart.latestPoint.x}
              cy={chart.latestPoint.y}
              fill="#0a0a0a"
              r="5"
              stroke="#34d399"
              strokeWidth="3"
            />
            {chart.xTicks.map((tick) => (
              <text
                fill="#a3a3a3"
                fontSize="12"
                key={tick.priceDate}
                textAnchor={tick.textAnchor}
                x={tick.x}
                y={chartDimensions.height - 14}
              >
                {formatDate(tick.priceDate)}
              </text>
            ))}
          </svg>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-neutral-500">Cached rows</dt>
              <dd className="mt-1 font-medium text-neutral-100">
                {formatInteger(points.length)}
              </dd>
            </div>
            <div>
              <dt className="text-neutral-500">Lowest close</dt>
              <dd className="mt-1 font-medium text-neutral-100">
                {formatCurrency(chart.minClose, currency)}
              </dd>
            </div>
            <div>
              <dt className="text-neutral-500">Highest close</dt>
              <dd className="mt-1 font-medium text-neutral-100">
                {formatCurrency(chart.maxClose, currency)}
              </dd>
            </div>
          </dl>
        </div>
      ) : (
        <div className="mt-6 rounded-md border border-neutral-800 bg-neutral-950 px-4 py-6">
          <h3 className="text-sm font-semibold text-neutral-100">
            Insufficient cached historical prices
          </h3>
          <p className="mt-2 text-sm leading-6 text-neutral-400">
            At least two cached daily close prices are needed to draw the
            history chart.
          </p>
        </div>
      )}
    </section>
  );
}

function CachedRangeCard({
  currency,
  freshness,
  loadError,
  range,
}: {
  currency: string;
  freshness: StockDetailPriceFreshness;
  loadError?: string;
  range: CachedFiftyTwoWeekRange | null;
}) {
  return (
    <section className="rounded-lg border border-neutral-800 bg-neutral-900/70 p-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">
            Cached price range
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-400">
            Calculated only from cached daily price rows. A 52-week high or low
            is shown only when the cache covers the full trailing window.
          </p>
          <PriceFreshnessNote freshness={freshness} />
        </div>
        <FreshnessBadge freshness={freshness} />
      </div>

      {loadError ? (
        <p className="mt-5 rounded-md border border-red-900 bg-red-950/60 px-4 py-3 text-sm text-red-200">
          Cached price history could not be loaded.
        </p>
      ) : null}

      {range ? (
        <>
          <dl className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-md border border-neutral-800 bg-neutral-950 p-4">
              <dt className="text-xs font-medium uppercase tracking-[0.14em] text-neutral-500">
                {range.hasFullWindow ? "52-week high" : "Cached high"}
              </dt>
              <dd className="mt-2 text-xl font-semibold text-white">
                {formatCurrency(range.high, currency)}
              </dd>
            </div>
            <div className="rounded-md border border-neutral-800 bg-neutral-950 p-4">
              <dt className="text-xs font-medium uppercase tracking-[0.14em] text-neutral-500">
                {range.hasFullWindow ? "52-week low" : "Cached low"}
              </dt>
              <dd className="mt-2 text-xl font-semibold text-white">
                {formatCurrency(range.low, currency)}
              </dd>
            </div>
          </dl>
          <p className="mt-4 text-sm text-neutral-500">
            {range.hasFullWindow
              ? "Full trailing 52-week cache"
              : "Partial cached range"}{" "}
            based on {formatInteger(range.rowCount)} cached row
            {range.rowCount === 1 ? "" : "s"} from {formatDate(range.startDate)}{" "}
            to {formatDate(range.endDate)}.
            {!range.hasFullWindow
              ? ` A full 52-week range needs cached prices back to ${formatDate(
                  range.requiredStartDate,
                )}.`
              : null}
          </p>
        </>
      ) : (
        <p className="mt-6 rounded-md border border-neutral-800 bg-neutral-950 px-4 py-4 text-sm leading-6 text-neutral-400">
          52-week high and low are unavailable because there is not enough
          cached price history for this stock.
        </p>
      )}
    </section>
  );
}

function PriceMovementCard({
  currency,
  freshness,
  loadError,
  summary,
}: {
  currency: string;
  freshness: StockDetailPriceFreshness;
  loadError?: string;
  summary: CachedPriceMovementSummary | null;
}) {
  return (
    <section className="rounded-lg border border-neutral-800 bg-neutral-900/70 p-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">
            Recent price context
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-400">
            Cached historical movement and averages for context only. These
            metrics are not financial advice or a trading recommendation.
          </p>
          <PriceFreshnessNote freshness={freshness} />
        </div>
        <div className="flex flex-col items-start gap-2 sm:items-end">
          <FreshnessBadge freshness={freshness} />
          {summary?.latestDate ? (
            <p className="text-sm text-neutral-500">
              Latest close {formatDate(summary.latestDate)}
            </p>
          ) : null}
        </div>
      </div>

      {loadError ? (
        <p className="mt-5 rounded-md border border-red-900 bg-red-950/60 px-4 py-3 text-sm text-red-200">
          Cached price history could not be loaded.
        </p>
      ) : null}

      {summary && summary.rowCount > 0 ? (
        <>
          <dl className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {summary.movements.map((movement) => (
              <MovementMetricCard
                freshness={freshness}
                key={movement.id}
                metric={movement}
              />
            ))}
          </dl>

          <dl className="mt-4 grid gap-4 sm:grid-cols-2">
            {summary.movingAverages.map((average) => (
              <MovingAverageMetricCard
                currency={currency}
                freshness={freshness}
                key={average.id}
                metric={average}
              />
            ))}
          </dl>

          <p className="mt-4 text-sm text-neutral-500">
            Based on {formatInteger(summary.rowCount)} cached daily close
            {summary.rowCount === 1 ? "" : "s"}
            {summary.earliestDate && summary.latestDate
              ? ` from ${formatDate(summary.earliestDate)} to ${formatDate(
                  summary.latestDate,
                )}.`
              : "."}
          </p>
        </>
      ) : (
        <p className="mt-6 rounded-md border border-neutral-800 bg-neutral-950 px-4 py-4 text-sm leading-6 text-neutral-400">
          Recent movement and moving averages are unavailable because there are
          no usable cached daily close prices for this stock.
        </p>
      )}
    </section>
  );
}

function FundamentalsCard({
  currency,
  loadError,
  summary,
}: {
  currency: string;
  loadError?: string;
  summary: StockFundamentalsSummary | null;
}) {
  return (
    <section className="rounded-lg border border-neutral-800 bg-neutral-900/70 p-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">
            Key fundamentals
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-400">
            Latest cached valuation, quality, and safety fields from the local
            fundamentals cache.
          </p>
        </div>
        {summary ? (
          <p className="text-sm text-neutral-500">
            Cached {formatDateTime(summary.cachedAt)}
          </p>
        ) : null}
      </div>

      {loadError ? (
        <p className="mt-5 rounded-md border border-red-900 bg-red-950/60 px-4 py-3 text-sm text-red-200">
          Cached fundamentals could not be loaded.
        </p>
      ) : null}

      {summary ? (
        <>
          <dl className="mt-6 grid gap-4 sm:grid-cols-3">
            <FundamentalMetricCard
              label="Fiscal period"
              value={`${summary.fiscalPeriod} ${summary.fiscalYear}`}
            />
            <FundamentalMetricCard
              label="Period type"
              value={formatFundamentalPeriodType(summary.periodType)}
            />
            <FundamentalMetricCard
              label="Cache stored"
              value={formatDateTime(summary.cachedAt)}
            />
          </dl>

          <div className="mt-7 grid gap-6 xl:grid-cols-2">
            <FundamentalMetricGroup
              currency={currency}
              metrics={summary.valuationMetrics}
              title="Valuation"
            />
            <FundamentalMetricGroup
              currency={currency}
              metrics={summary.qualityAndSafetyMetrics}
              title="Quality and safety"
            />
          </div>
        </>
      ) : (
        <p className="mt-6 rounded-md border border-neutral-800 bg-neutral-950 px-4 py-4 text-sm leading-6 text-neutral-400">
          No cached fundamentals are available for this stock yet.
        </p>
      )}
    </section>
  );
}

function StockScoreSnapshotSection({
  currency,
  loadError,
  snapshot,
}: {
  currency: string;
  loadError?: string;
  snapshot: StockScoreRow | null;
}) {
  const scoringResult = parseStockScoreSnapshotResult(snapshot);

  return (
    <section className="rounded-lg border border-neutral-800 bg-neutral-900/70 p-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">
            Graham-inspired score
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-400">
            Cached deterministic scoring snapshot. Your rules suggest this
            label from stored inputs; it is educational context, not
            personalised financial advice.
          </p>
        </div>
        {snapshot ? (
          <p className="text-sm text-neutral-500">
            Scored {formatDateTime(snapshot.scored_at)}
          </p>
        ) : null}
      </div>

      {loadError ? (
        <p className="mt-5 rounded-md border border-red-900 bg-red-950/60 px-4 py-3 text-sm text-red-200">
          Cached Graham score data could not be loaded.
        </p>
      ) : null}

      {!snapshot ? (
        <div className="mt-6 rounded-md border border-neutral-800 bg-neutral-950 px-4 py-5">
          <h3 className="text-sm font-semibold text-neutral-100">
            Score snapshot unavailable
          </h3>
          <p className="mt-2 text-sm leading-6 text-neutral-400">
            No cached deterministic score snapshot exists for this stock yet.
            The page will show the score after a scoring job stores one.
          </p>
        </div>
      ) : (
        <>
          <div className="mt-6 rounded-md border border-emerald-900 bg-emerald-950/30 p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.14em] text-emerald-200">
                  Overall deterministic label
                </p>
                <h3 className="mt-2 text-2xl font-semibold text-white">
                  {snapshot.overall_label}
                </h3>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-300">
                  {scoringResult?.explanation.summary ??
                    "The stored score columns are available, but the rule explanation payload is unavailable."}
                </p>
                {scoringResult?.explanation.caution ? (
                  <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-400">
                    {scoringResult.explanation.caution}
                  </p>
                ) : null}
              </div>
              <span className="inline-flex h-7 w-fit items-center rounded-md border border-emerald-800 bg-emerald-950/70 px-2.5 text-xs font-semibold text-emerald-200">
                {snapshot.overall_label}
              </span>
            </div>
          </div>

          <dl className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {stockScoreLayerOrder.map((layerId) => (
              <StockScoreLayerSummaryCard
                key={layerId}
                layer={scoringResult?.layers[layerId] ?? null}
                layerId={layerId}
                score={getStockScoreLayerColumn(snapshot, layerId)}
              />
            ))}
          </dl>

          {scoringResult ? (
            <div className="mt-7 grid gap-6">
              {stockScoreLayerOrder.map((layerId) => (
                <StockScoreRuleGroup
                  currency={currency}
                  key={layerId}
                  layer={scoringResult.layers[layerId]}
                />
              ))}
            </div>
          ) : (
            <p className="mt-6 rounded-md border border-amber-900 bg-amber-950/40 px-4 py-4 text-sm leading-6 text-amber-100">
              Rule-by-rule explanations are unavailable because the stored
              snapshot payload does not match the expected schema.
            </p>
          )}
        </>
      )}
    </section>
  );
}

function CombinedScoreContextSection({
  portfolioLoadError,
  portfolioSnapshot,
  stockLoadError,
  stockSnapshot,
}: {
  portfolioLoadError?: string;
  portfolioSnapshot: PortfolioScoreRow | null;
  stockLoadError?: string;
  stockSnapshot: StockScoreRow | null;
}) {
  const stockScoringResult = parseStockScoreSnapshotResult(stockSnapshot);
  const portfolioScoringResult =
    parsePortfolioScoreSnapshotResult(portfolioSnapshot);
  const stockLabel = stockSnapshot?.overall_label ?? null;
  const portfolioFitLabel = portfolioSnapshot?.portfolio_fit_label ?? null;
  const hasOffset =
    isPositiveStockLabel(stockLabel) && isPortfolioFitOffset(portfolioFitLabel);

  return (
    <section className="rounded-lg border border-neutral-800 bg-neutral-900/70 p-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">
            Stock and portfolio context
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-400">
            Combined deterministic labels keep stock-level checks separate from
            portfolio-fit checks. They are educational context and not an
            instruction to trade.
          </p>
        </div>
        {stockSnapshot || portfolioSnapshot ? (
          <p className="text-sm text-neutral-500">
            Latest snapshots from cached scoring data
          </p>
        ) : null}
      </div>

      {stockLoadError || portfolioLoadError ? (
        <div className="mt-5 grid gap-3">
          {stockLoadError ? (
            <p className="rounded-md border border-red-900 bg-red-950/60 px-4 py-3 text-sm text-red-200">
              Cached stock score data could not be loaded.
            </p>
          ) : null}
          {portfolioLoadError ? (
            <p className="rounded-md border border-red-900 bg-red-950/60 px-4 py-3 text-sm text-red-200">
              Cached portfolio-fit score data could not be loaded.
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <ScoreContextCard
          label={stockLabel}
          missingTitle="Stock score unavailable"
          scoredAt={stockSnapshot?.scored_at ?? null}
          title="Stock label"
        >
          {stockScoringResult?.explanation.summary ??
            "No cached deterministic stock score snapshot exists for this stock yet."}
        </ScoreContextCard>
        <ScoreContextCard
          label={portfolioFitLabel}
          missingTitle="Portfolio context unavailable"
          scoredAt={portfolioSnapshot?.scored_at ?? null}
          title="Portfolio fit"
        >
          {portfolioScoringResult?.explanation.summary ??
            "No cached portfolio-fit score snapshot exists for this stock in your default portfolio yet."}
        </ScoreContextCard>
      </div>

      {hasOffset ? (
        <p className="mt-5 rounded-md border border-amber-900 bg-amber-950/40 px-4 py-3 text-sm leading-6 text-amber-100">
          The stock label is positive, but the portfolio-fit label flags
          allocation context that offsets adding more exposure.
        </p>
      ) : null}

      {portfolioScoringResult ? (
        <div className="mt-7">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h3 className="text-sm font-semibold text-neutral-100">
                Portfolio-fit rules
              </h3>
              <p className="mt-1 text-sm leading-6 text-neutral-500">
                {portfolioScoringResult.explanation.caution}
              </p>
            </div>
            <p className="text-sm text-neutral-500">
              {portfolioScoringResult.status === "classified"
                ? "Classified portfolio context"
                : "Insufficient portfolio context"}
            </p>
          </div>
          <div className="mt-3 grid gap-4 lg:grid-cols-2">
            {portfolioScoringResult.ruleChecks.map((rule) => (
              <StockScoreRuleCard currency="USD" key={rule.id} rule={rule} />
            ))}
          </div>
        </div>
      ) : portfolioSnapshot ? (
        <p className="mt-6 rounded-md border border-amber-900 bg-amber-950/40 px-4 py-4 text-sm leading-6 text-amber-100">
          Portfolio-fit rule explanations are unavailable because the stored
          snapshot payload does not match the expected schema.
        </p>
      ) : null}
    </section>
  );
}

function ScoreContextCard({
  children,
  label,
  missingTitle,
  scoredAt,
  title,
}: {
  children: ReactNode;
  label: string | null;
  missingTitle: string;
  scoredAt: string | null;
  title: string;
}) {
  return (
    <div className="rounded-md border border-neutral-800 bg-neutral-950 p-5">
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-neutral-500">
        {title}
      </p>
      <h3
        className={
          label
            ? "mt-2 text-2xl font-semibold text-white"
            : "mt-2 text-lg font-semibold text-neutral-500"
        }
      >
        {label ?? missingTitle}
      </h3>
      {scoredAt ? (
        <p className="mt-1 text-xs text-neutral-500">
          Scored {formatDateTime(scoredAt)}
        </p>
      ) : null}
      <p className="mt-3 text-sm leading-6 text-neutral-400">{children}</p>
    </div>
  );
}

function isPortfolioFitOffset(label: string | null) {
  return [
    "Cash Constrained",
    "Concentration Risk",
    "Do Not Add",
    "Overweight",
    "Review Position",
  ].includes(label ?? "");
}

function isPositiveStockLabel(label: string | null) {
  return label === "Attractive" || label === "Reasonable";
}

function getStockScoreLayerColumn(
  snapshot: StockScoreRow,
  layerId: StockScoreLayerId,
) {
  return {
    market_context: snapshot.market_context_score,
    quality: snapshot.quality_score,
    safety: snapshot.safety_score,
    valuation: snapshot.valuation_score,
  }[layerId];
}

function StockScoreLayerSummaryCard({
  layer,
  layerId,
  score,
}: {
  layer: ScoreLayerResult | null;
  layerId: StockScoreLayerId;
  score: number | null;
}) {
  return (
    <div className="rounded-md border border-neutral-800 bg-neutral-950 p-4">
      <dt className="text-xs font-medium uppercase tracking-[0.14em] text-neutral-500">
        {formatLayerName(layerId)}
      </dt>
      <dd
        className={
          score === null
            ? "mt-2 text-xl font-semibold text-neutral-500"
            : "mt-2 text-xl font-semibold text-white"
        }
      >
        {formatScoreValue(score)}
      </dd>
      <dd className="mt-2 text-xs leading-5 text-neutral-500">
        {layer?.explanation.summary ??
          "Layer explanation is unavailable in the stored snapshot."}
      </dd>
    </div>
  );
}

function StockScoreRuleGroup({
  currency,
  layer,
}: {
  currency: string;
  layer: ScoreLayerResult;
}) {
  return (
    <div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-neutral-100">
            {formatLayerName(layer.id)} rules
          </h3>
          <p className="mt-1 text-sm leading-6 text-neutral-500">
            {layer.explanation.detail ?? layer.explanation.summary}
          </p>
        </div>
        <p className="text-sm text-neutral-500">
          {layer.status === "scored" ? "Scored layer" : "Insufficient layer data"}
        </p>
      </div>
      <div className="mt-3 grid gap-4 lg:grid-cols-2">
        {layer.ruleChecks.map((rule) => (
          <StockScoreRuleCard currency={currency} key={rule.id} rule={rule} />
        ))}
      </div>
    </div>
  );
}

function StockScoreRuleCard({
  currency,
  rule,
}: {
  currency: string;
  rule: RuleCheckResult;
}) {
  return (
    <div className="rounded-md border border-neutral-800 bg-neutral-950 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h4 className="text-sm font-semibold text-neutral-100">
            {rule.explanation.summary}
          </h4>
          {rule.explanation.detail ? (
            <p className="mt-2 text-xs leading-5 text-neutral-500">
              {rule.explanation.detail}
            </p>
          ) : null}
        </div>
        <span
          className={`inline-flex h-7 w-fit shrink-0 items-center rounded-md border px-2.5 text-xs font-semibold ${getRuleStatusClassName(
            rule.status,
          )}`}
        >
          {formatRuleStatus(rule.status)}
        </span>
      </div>

      <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-2">
        <div>
          <dt className="text-neutral-500">Measured value</dt>
          <dd className="mt-1 font-medium text-neutral-100">
            {formatMeasuredValue({
              currency,
              measuredValue: rule.measuredValue,
              threshold: rule.threshold,
            })}
          </dd>
        </div>
        <div>
          <dt className="text-neutral-500">Threshold</dt>
          <dd className="mt-1 font-medium text-neutral-100">
            {formatThreshold({ currency, rule })}
          </dd>
        </div>
      </dl>
      <p className="mt-3 text-xs leading-5 text-neutral-500">
        {getMeasuredValueMeta(rule.measuredValue)}
      </p>
    </div>
  );
}

function FundamentalMetricGroup({
  currency,
  metrics,
  title,
}: {
  currency: string;
  metrics: StockFundamentalMetric[];
  title: string;
}) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-neutral-100">{title}</h3>
      <dl className="mt-3 grid gap-4 sm:grid-cols-2">
        {metrics.map((metric) => (
          <FundamentalMetricCard
            isMissing={metric.isMissing}
            key={metric.label}
            label={metric.label}
            value={formatFundamentalMetricValue({ currency, metric })}
          />
        ))}
      </dl>
    </div>
  );
}

function FundamentalMetricCard({
  isMissing = false,
  label,
  value,
}: {
  isMissing?: boolean;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-md border border-neutral-800 bg-neutral-950 p-4">
      <dt className="text-xs font-medium uppercase tracking-[0.14em] text-neutral-500">
        {label}
      </dt>
      <dd
        className={
          isMissing
            ? "mt-2 break-words text-sm font-medium text-neutral-500"
            : "mt-2 break-words text-sm font-medium text-neutral-100"
        }
      >
        {value}
      </dd>
    </div>
  );
}

function MovementMetricCard({
  freshness,
  metric,
}: {
  freshness: StockDetailPriceFreshness;
  metric: CachedPriceMovementMetric;
}) {
  const tone =
    metric.percentChange === null
      ? "text-neutral-500"
      : metric.percentChange > 0
        ? "text-emerald-200"
        : metric.percentChange < 0
          ? "text-red-200"
          : "text-neutral-100";

  return (
    <div className="rounded-md border border-neutral-800 bg-neutral-950 p-4">
      <dt className="text-xs font-medium uppercase tracking-[0.14em] text-neutral-500">
        {metric.label}
      </dt>
      <dd className={`mt-2 text-xl font-semibold ${tone}`}>
        {formatSignedPercentage(metric.percentChange)}
      </dd>
      <dd className="mt-1 text-xs leading-5 text-neutral-500">
        {metric.unavailableReason
          ? metric.unavailableReason
          : metric.baselineDate && freshness.asOfDate
            ? `${formatFreshnessStatus(
                freshness.status,
              )} as-of metric using latest cached close ${formatDate(
                freshness.asOfDate,
              )}. Compared with cached close on ${formatDate(
                metric.baselineDate,
              )}.`
            : metric.baselineDate
              ? `Compared with cached close on ${formatDate(metric.baselineDate)}.`
            : "Unavailable from cached history."}
      </dd>
    </div>
  );
}

function MovingAverageMetricCard({
  currency,
  freshness,
  metric,
}: {
  currency: string;
  freshness: StockDetailPriceFreshness;
  metric: CachedMovingAverageMetric;
}) {
  return (
    <div className="rounded-md border border-neutral-800 bg-neutral-950 p-4">
      <dt className="text-xs font-medium uppercase tracking-[0.14em] text-neutral-500">
        {metric.label}
      </dt>
      <dd
        className={
          metric.value === null
            ? "mt-2 text-xl font-semibold text-neutral-500"
            : "mt-2 text-xl font-semibold text-white"
        }
      >
        {metric.value === null
          ? "Unavailable"
          : formatCurrency(metric.value, currency)}
      </dd>
      <dd className="mt-1 text-xs leading-5 text-neutral-500">
        {metric.unavailableReason
          ? `${metric.unavailableReason} Cached rows available: ${formatInteger(
              metric.rowCount,
            )}.`
          : metric.startDate && metric.endDate
            ? `${formatFreshnessStatus(
                freshness.status,
              )} as-of average using latest cached close ${
                freshness.asOfDate ? formatDate(freshness.asOfDate) : "Unavailable"
              }. Average of ${formatInteger(metric.rowCount)} cached closes from ${formatDate(
                metric.startDate,
              )} to ${formatDate(metric.endDate)}.`
            : "Unavailable from cached history."}
      </dd>
    </div>
  );
}

export async function StockDetailPage({
  createSupabaseClient,
  ensureDefaultPortfolio,
  params,
  redirectToLogin,
  refreshMarketDataAction,
  searchParams,
}: StockDetailPageProps & StockDetailPageDependencies) {
  const { symbol: routeSymbol } = await params;
  const feedbackParams = searchParams ? await searchParams : {};
  const feedbackMessages = buildFeedbackMessages(feedbackParams);
  const symbol = normalizeStockSymbol(routeSymbol);
  const renderDate = new Date();
  const supabase = await createSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return redirectToLogin(
      `/login?next=${encodeURIComponent(`/stocks/${symbol}`)}`,
    );
  }

  const authenticatedUser = user;

  const isValidSymbol = isValidNormalizedStockSymbol(symbol);
  let stock: StockRow | null = null;
  let stockLoadError: string | undefined;
  let latestPrice: StockPriceInput | null = null;
  let latestPriceLoadError: string | undefined;
  let cachedRange: CachedFiftyTwoWeekRange | null = null;
  let cachedRangeLoadError: string | undefined;
  let priceMovementSummary: CachedPriceMovementSummary | null = null;
  let historicalPriceChartPoints: HistoricalPriceChartPoint[] = [];
  let latestFundamentals: StockFundamentalInput | null = null;
  let latestFundamentalsLoadError: string | undefined;
  let latestStockScore: StockScoreRow | null = null;
  let latestStockScoreLoadError: string | undefined;
  let latestPortfolioScore: PortfolioScoreRow | null = null;
  let latestPortfolioScoreLoadError: string | undefined;
  const defaultPortfolioResult = await ensureDefaultPortfolio(
    supabase,
    authenticatedUser,
  );
  const portfolio = defaultPortfolioResult.portfolio;
  const displayCurrency = portfolio?.base_currency ?? "USD";

  if (isValidSymbol) {
    const { data, error } = await supabase
      .from("stocks")
      .select(
        "symbol,name,exchange,sector,industry,country,currency,created_at,updated_at",
      )
      .eq("symbol", symbol)
      .maybeSingle();

    stock = data;
    stockLoadError = error?.message;
    logStockDetailLoadError({
      error: stockLoadError,
      scope: "stock profile",
      symbol,
    });

    if (stock) {
      const latestPriceResult = await supabase
        .from("stock_prices")
        .select("symbol,price_date,high,low,close,volume,created_at")
        .eq("symbol", symbol)
        .order("price_date", { ascending: false })
        .limit(1)
        .maybeSingle();

      latestPrice = latestPriceResult.data;
      latestPriceLoadError = latestPriceResult.error?.message;
      logStockDetailLoadError({
        error: latestPriceLoadError,
        scope: "latest cached price",
        symbol,
      });

      if (latestPrice) {
        const contextResult = await supabase
          .from("stock_prices")
          .select("symbol,price_date,high,low,close,volume,created_at")
          .eq("symbol", symbol)
          .gte("price_date", getTrailingOneYearStartDate(latestPrice.price_date))
          .lte("price_date", latestPrice.price_date)
          .order("price_date", { ascending: true });

        cachedRangeLoadError = contextResult.error?.message;
        logStockDetailLoadError({
          error: cachedRangeLoadError,
          scope: "cached historical prices",
          symbol,
        });
        const cachedContextRows = contextResult.data ?? [];
        const trailingFiftyTwoWeekStartDate =
          getTrailingFiftyTwoWeekStartDate(latestPrice.price_date);
        const cachedPriceRows = cachedContextRows.filter(
          (row) => row.price_date >= trailingFiftyTwoWeekStartDate,
        );

        cachedRange = createCachedFiftyTwoWeekRange(cachedPriceRows);
        priceMovementSummary =
          createCachedPriceMovementSummary(cachedContextRows);
        historicalPriceChartPoints =
          createHistoricalPriceChartPoints(cachedPriceRows);
      }

      const latestFundamentalsResult = await supabase
        .from("stock_fundamentals")
        .select(
          "symbol,fiscal_period,fiscal_year,period_type,eps,book_value_per_share,pe_ratio,pb_ratio,debt_to_equity,current_ratio,dividend_yield,revenue,net_income,free_cash_flow,total_debt,total_equity,created_at",
        )
        .eq("symbol", symbol)
        .order("fiscal_year", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(12);

      latestFundamentals = selectLatestRelevantFundamentals(
        latestFundamentalsResult.data ?? [],
      );
      latestFundamentalsLoadError = latestFundamentalsResult.error?.message;
      logStockDetailLoadError({
        error: latestFundamentalsLoadError,
        scope: "cached fundamentals",
        symbol,
      });

      const latestStockScoreResult = await supabase
        .from("stock_scores")
        .select(
          "id,symbol,scored_at,valuation_score,quality_score,safety_score,market_context_score,overall_label,explanation_json",
        )
        .eq("symbol", symbol)
        .order("scored_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      latestStockScore = latestStockScoreResult.data;
      latestStockScoreLoadError = latestStockScoreResult.error?.message;
      logStockDetailLoadError({
        error: latestStockScoreLoadError,
        scope: "cached Graham score",
        symbol,
      });

      const latestPortfolioScoreResult = portfolio
        ? await supabase
            .from("portfolio_stock_scores")
            .select(
              "id,portfolio_id,symbol,scored_at,portfolio_fit_label,allocation_warning,sector_warning,cash_warning,explanation_json",
            )
            .eq("portfolio_id", portfolio.id)
            .eq("symbol", symbol)
            .order("scored_at", { ascending: false })
            .limit(1)
            .maybeSingle()
        : {
            data: null as PortfolioScoreRow | null,
            error: null,
          };

      latestPortfolioScore = latestPortfolioScoreResult.data;
      latestPortfolioScoreLoadError =
        latestPortfolioScoreResult.error?.message;
      logStockDetailLoadError({
        error: latestPortfolioScoreLoadError,
        scope: "cached portfolio-fit score",
        symbol,
      });
    }
  }

  const latestPriceSummary = createLatestCachedPriceSummary(
    latestPrice,
    renderDate,
  );
  const priceFreshness =
    latestPriceSummary?.freshness ??
    classifyStockDetailPriceFreshness(latestPrice?.price_date, renderDate);
  const fundamentalsSummary =
    createStockFundamentalsSummary(latestFundamentals);
  const cashResult = portfolio
    ? await supabase
        .from("portfolio_cash")
        .select("amount,currency,updated_at")
        .eq("portfolio_id", portfolio.id)
        .eq("currency", displayCurrency)
        .maybeSingle()
    : {
        data: null as Pick<
          PortfolioCashRow,
          "amount" | "currency" | "updated_at"
        > | null,
        error: null,
      };
  const holdingsResult = portfolio
    ? await supabase
        .from("holdings")
        .select(
          "id,portfolio_id,symbol,quantity,average_cost,currency,created_at,updated_at",
        )
        .eq("portfolio_id", portfolio.id)
        .order("symbol", { ascending: true })
    : { data: [] as HoldingRow[], error: null };

  const holdings = holdingsResult.data ?? [];
  logStockDetailLoadError({
    error: cashResult.error?.message,
    scope: "portfolio cash",
    symbol,
  });
  logStockDetailLoadError({
    error: holdingsResult.error?.message,
    scope: "holdings",
    symbol,
  });
  const symbols = holdings.map((holding) => holding.symbol);
  const pricesResult = symbols.length
    ? await supabase
        .from("stock_prices")
        .select("symbol,close,price_date")
        .in("symbol", symbols)
        .order("price_date", { ascending: false })
    : {
        data: [] as Pick<StockPriceRow, "symbol" | "close" | "price_date">[],
        error: null,
      };
  const latestPricesBySymbol = buildLatestPriceMap(pricesResult.data ?? []);
  logStockDetailLoadError({
    error: pricesResult.error?.message,
    scope: "holding latest prices",
    symbol,
  });
  const enrichedHoldings = holdings.map((holding) => {
    const latestPrice = latestPricesBySymbol.get(holding.symbol);

    return {
      ...calculateHoldingValue({
        averageCost: holding.average_cost,
        latestClose: latestPrice?.close,
        quantity: holding.quantity,
      }),
      holding,
    };
  });
  const selectedHolding =
    isValidSymbol && portfolio
      ? holdings.find((holding) => holding.symbol === symbol) ?? null
      : null;
  const selectedWatchlistResult =
    isValidSymbol && portfolio
      ? await supabase
          .from("watchlist_items")
          .select("id,notes,target_price")
          .eq("portfolio_id", portfolio.id)
          .eq("user_id", authenticatedUser.id)
          .eq("symbol", symbol)
          .maybeSingle()
      : {
          data: null as Pick<
            WatchlistItemRow,
            "id" | "notes" | "target_price"
          > | null,
          error: null,
        };
  logStockDetailLoadError({
    error: selectedWatchlistResult.error?.message,
    scope: "watchlist tracking",
    symbol,
  });
  const isTrackedSymbol =
    Boolean(selectedHolding) || Boolean(selectedWatchlistResult.data);
  const selectedLatestPrice = latestPricesBySymbol.get(symbol);
  const holdingSummary = portfolio
    ? buildUserHoldingSummary({
        cashAmount: cashResult.data?.amount,
        holding: selectedHolding
          ? {
              averageCost: selectedHolding.average_cost,
              currency: selectedHolding.currency,
              latestClose: selectedLatestPrice?.close,
              latestPriceDate: selectedLatestPrice?.price_date,
              quantity: selectedHolding.quantity,
            }
          : null,
        portfolioHoldings: enrichedHoldings,
      })
    : null;
  const hasHoldingLoadError =
    Boolean(defaultPortfolioResult.error) ||
    Boolean(cashResult.error) ||
    Boolean(holdingsResult.error) ||
    Boolean(pricesResult.error);

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <FeedbackSnackbars messages={feedbackMessages} />
      <section className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-6 py-10 sm:px-8">
        <header className="flex flex-col gap-5 border-b border-neutral-800 pb-8 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.16em] text-emerald-300">
              Stock detail
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-normal text-white">
              {stock?.name ?? symbol ?? "Stock"}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-neutral-400">
              Review cached company identity and stored market data without
              triggering a live provider fetch.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              className="inline-flex h-10 items-center justify-center rounded-md border border-neutral-700 px-4 text-sm font-medium text-neutral-200 transition hover:border-neutral-500 hover:text-white"
              href="/dashboard"
            >
              Dashboard
            </Link>
            <Link
              className="inline-flex h-10 items-center justify-center rounded-md bg-emerald-400 px-4 text-sm font-semibold text-neutral-950 transition hover:bg-emerald-300"
              href="/holdings"
            >
              Holdings
            </Link>
          </div>
        </header>

        <div className="grid gap-8 py-8">
          {stock ? (
            <>
              <CompanyProfileCard stock={stock} />
              <LatestPriceCard
                currency={stock.currency}
                freshness={priceFreshness}
                isTrackedSymbol={isTrackedSymbol}
                latestPrice={latestPriceSummary}
                loadError={latestPriceLoadError}
                refreshAction={refreshMarketDataAction}
                symbol={symbol}
              />
              <PriceHistoryChartCard
                currency={stock.currency}
                freshness={priceFreshness}
                loadError={cachedRangeLoadError}
                points={historicalPriceChartPoints}
              />
              <PriceMovementCard
                currency={stock.currency}
                freshness={priceFreshness}
                loadError={cachedRangeLoadError}
                summary={priceMovementSummary}
              />
              <FundamentalsCard
                currency={stock.currency}
                loadError={latestFundamentalsLoadError}
                summary={fundamentalsSummary}
              />
              <StockScoreSnapshotSection
                currency={stock.currency}
                loadError={latestStockScoreLoadError}
                snapshot={latestStockScore}
              />
              <CombinedScoreContextSection
                portfolioLoadError={latestPortfolioScoreLoadError}
                portfolioSnapshot={latestPortfolioScore}
                stockLoadError={latestStockScoreLoadError}
                stockSnapshot={latestStockScore}
              />
              <CachedRangeCard
                currency={stock.currency}
                freshness={priceFreshness}
                loadError={cachedRangeLoadError}
                range={cachedRange}
              />
            </>
          ) : (
            <UnavailableStockState
              errorMessage={stockLoadError}
              symbol={isValidSymbol ? symbol : ""}
            />
          )}

          {isValidSymbol ? (
            <>
              <UserHoldingSummarySection
                loadError={hasHoldingLoadError}
                portfolioName={portfolio?.name}
                summary={holdingSummary}
                symbol={symbol}
              />
              <WatchlistStatusSection
                currency={stock?.currency ?? displayCurrency}
                item={selectedWatchlistResult.data}
                loadError={Boolean(selectedWatchlistResult.error)}
                portfolioName={portfolio?.name}
                symbol={symbol}
              />
            </>
          ) : null}
        </div>
      </section>
    </main>
  );
}
