import { toFiniteNumber, type NumericInput } from "../portfolios/totals";
import type { Database } from "../../types/supabase";

type StockRow = Database["public"]["Tables"]["stocks"]["Row"];
type StockPriceRow = Database["public"]["Tables"]["stock_prices"]["Row"];
type StockFundamentalRow =
  Database["public"]["Tables"]["stock_fundamentals"]["Row"];

export type StockProfileInput = Pick<
  StockRow,
  | "country"
  | "currency"
  | "exchange"
  | "industry"
  | "name"
  | "sector"
  | "symbol"
  | "updated_at"
>;

export type StockPriceInput = Pick<
  StockPriceRow,
  "close" | "created_at" | "high" | "low" | "price_date" | "symbol" | "volume"
>;

export type StockFundamentalInput = Pick<
  StockFundamentalRow,
  | "book_value_per_share"
  | "created_at"
  | "current_ratio"
  | "debt_to_equity"
  | "dividend_yield"
  | "eps"
  | "fiscal_period"
  | "fiscal_year"
  | "free_cash_flow"
  | "net_income"
  | "pb_ratio"
  | "pe_ratio"
  | "period_type"
  | "revenue"
  | "symbol"
  | "total_debt"
  | "total_equity"
>;

export type StockProfileField = {
  isMissing: boolean;
  label: string;
  value: string;
};

export type LatestCachedPriceSummary = {
  cachedAt: string;
  close: number;
  freshness: StockDetailPriceFreshness;
  priceDate: string;
  volume: number | null;
};

export type StockDetailPriceFreshnessStatus =
  | "fresh"
  | "stale"
  | "unavailable";

export type StockDetailPriceFreshness = {
  ageDays: number | null;
  asOfDate: string | null;
  currentDate: string;
  reason: string;
  staleAfterDate: string | null;
  status: StockDetailPriceFreshnessStatus;
  windowDays: number;
};

export type CachedFiftyTwoWeekRange = {
  hasFullWindow: boolean;
  high: number;
  low: number;
  requiredStartDate: string;
  rowCount: number;
  startDate: string;
  endDate: string;
};

export type HistoricalPriceChartPoint = {
  close: number;
  priceDate: string;
};

export type CachedMovementWindowId = "1w" | "1m" | "6m" | "1y";

export type CachedPriceMovementMetric = {
  baselineClose: number | null;
  baselineDate: string | null;
  id: CachedMovementWindowId;
  label: string;
  latestClose: number | null;
  latestDate: string | null;
  percentChange: number | null;
  targetDate: string | null;
  unavailableReason: string | null;
};

export type CachedMovingAverageId = "50d" | "200d";

export type CachedMovingAverageMetric = {
  endDate: string | null;
  id: CachedMovingAverageId;
  label: string;
  requiredRowCount: number;
  rowCount: number;
  startDate: string | null;
  unavailableReason: string | null;
  value: number | null;
};

export type CachedPriceMovementSummary = {
  earliestDate: string | null;
  latestClose: number | null;
  latestDate: string | null;
  movingAverages: CachedMovingAverageMetric[];
  movements: CachedPriceMovementMetric[];
  rowCount: number;
};

export type StockFundamentalMetricFormat =
  | "currency"
  | "number"
  | "percentage";

export type StockFundamentalMetric = {
  format: StockFundamentalMetricFormat;
  isMissing: boolean;
  label: string;
  value: number | null;
};

export type StockFundamentalsSummary = {
  cachedAt: string;
  fiscalPeriod: string;
  fiscalYear: number;
  periodType: StockFundamentalInput["period_type"];
  qualityAndSafetyMetrics: StockFundamentalMetric[];
  valuationMetrics: StockFundamentalMetric[];
};

export const STOCK_DETAIL_PRICE_FRESHNESS_WINDOW_DAYS = 3;

export function createStockProfileFields(
  stock: StockProfileInput,
): StockProfileField[] {
  return [
    createProfileField("Symbol", stock.symbol),
    createProfileField("Company", stock.name),
    createProfileField("Exchange", stock.exchange),
    createProfileField("Sector", stock.sector),
    createProfileField("Industry", stock.industry),
    createProfileField("Country", stock.country),
    createProfileField("Currency", stock.currency),
    createProfileField("Profile cache updated", stock.updated_at),
  ];
}

export function createLatestCachedPriceSummary(
  latestPrice: StockPriceInput | null,
  currentDate = new Date(),
): LatestCachedPriceSummary | null {
  const close = toFiniteNumber(latestPrice?.close);

  if (!latestPrice || close === null) {
    return null;
  }

  return {
    cachedAt: latestPrice.created_at,
    close,
    freshness: classifyStockDetailPriceFreshness(
      latestPrice.price_date,
      currentDate,
    ),
    priceDate: latestPrice.price_date,
    volume: latestPrice.volume,
  };
}

export function classifyStockDetailPriceFreshness(
  priceDate: string | null | undefined,
  currentDate = new Date(),
): StockDetailPriceFreshness {
  const currentDateOnly = toUtcDateOnly(currentDate);

  if (!currentDateOnly) {
    return {
      ageDays: null,
      asOfDate: priceDate ?? null,
      currentDate: "Unavailable",
      reason: "Current date is unavailable, so cache freshness cannot be calculated.",
      staleAfterDate: null,
      status: "unavailable",
      windowDays: STOCK_DETAIL_PRICE_FRESHNESS_WINDOW_DAYS,
    };
  }

  const validPriceDate = parseDateOnly(priceDate);

  if (!validPriceDate || !priceDate) {
    return {
      ageDays: null,
      asOfDate: null,
      currentDate: currentDateOnly,
      reason: "No usable latest cached close date is available.",
      staleAfterDate: null,
      status: "unavailable",
      windowDays: STOCK_DETAIL_PRICE_FRESHNESS_WINDOW_DAYS,
    };
  }

  const ageDays = differenceInUtcDays(currentDateOnly, priceDate);
  const staleAfterDate = addUtcDays(
    priceDate,
    STOCK_DETAIL_PRICE_FRESHNESS_WINDOW_DAYS,
  );
  const isFresh = ageDays <= STOCK_DETAIL_PRICE_FRESHNESS_WINDOW_DAYS;

  return {
    ageDays,
    asOfDate: priceDate,
    currentDate: currentDateOnly,
    reason: isFresh
      ? `Latest cached close is within ${STOCK_DETAIL_PRICE_FRESHNESS_WINDOW_DAYS} calendar days.`
      : `Latest cached close is older than ${STOCK_DETAIL_PRICE_FRESHNESS_WINDOW_DAYS} calendar days.`,
    staleAfterDate,
    status: isFresh ? "fresh" : "stale",
    windowDays: STOCK_DETAIL_PRICE_FRESHNESS_WINDOW_DAYS,
  };
}

export function createCachedFiftyTwoWeekRange(
  priceRows: Pick<StockPriceInput, "close" | "high" | "low" | "price_date">[],
): CachedFiftyTwoWeekRange | null {
  const usableRows = priceRows
    .map((row) => {
      const close = toFiniteNumber(row.close);
      const high = toPricePoint(row.high, close);
      const low = toPricePoint(row.low, close);

      if (high === null || low === null) {
        return null;
      }

      return {
        high,
        low,
        priceDate: row.price_date,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  if (usableRows.length === 0) {
    return null;
  }

  const startDate = usableRows.reduce(
    (earliest, row) => (row.priceDate < earliest ? row.priceDate : earliest),
    usableRows[0].priceDate,
  );
  const endDate = usableRows.reduce(
    (latest, row) => (row.priceDate > latest ? row.priceDate : latest),
    usableRows[0].priceDate,
  );
  const requiredStartDate = getTrailingFiftyTwoWeekStartDate(endDate);

  return {
    hasFullWindow: startDate <= requiredStartDate,
    high: Math.max(...usableRows.map((row) => row.high)),
    low: Math.min(...usableRows.map((row) => row.low)),
    requiredStartDate,
    rowCount: usableRows.length,
    startDate,
    endDate,
  };
}

export function createCachedPriceMovementSummary(
  priceRows: Pick<StockPriceInput, "close" | "price_date">[],
): CachedPriceMovementSummary {
  const rows = createHistoricalPriceChartPoints(priceRows);
  const latestRow = rows.at(-1) ?? null;
  const earliestRow = rows[0] ?? null;

  return {
    earliestDate: earliestRow?.priceDate ?? null,
    latestClose: latestRow?.close ?? null,
    latestDate: latestRow?.priceDate ?? null,
    movingAverages: MOVING_AVERAGE_WINDOWS.map((window) =>
      createCachedMovingAverageMetric(rows, window),
    ),
    movements: MOVEMENT_WINDOWS.map((window) =>
      createCachedPriceMovementMetric(rows, window),
    ),
    rowCount: rows.length,
  };
}

export function createStockFundamentalsSummary(
  fundamentals: StockFundamentalInput | null,
): StockFundamentalsSummary | null {
  if (!fundamentals) {
    return null;
  }

  return {
    cachedAt: fundamentals.created_at,
    fiscalPeriod: fundamentals.fiscal_period,
    fiscalYear: fundamentals.fiscal_year,
    periodType: fundamentals.period_type,
    valuationMetrics: [
      createFundamentalMetric("EPS", fundamentals.eps, "currency"),
      createFundamentalMetric(
        "Book value / share",
        fundamentals.book_value_per_share,
        "currency",
      ),
      createFundamentalMetric("P/E ratio", fundamentals.pe_ratio, "number"),
      createFundamentalMetric("P/B ratio", fundamentals.pb_ratio, "number"),
      createFundamentalMetric(
        "Dividend yield",
        fundamentals.dividend_yield,
        "percentage",
      ),
    ],
    qualityAndSafetyMetrics: [
      createFundamentalMetric(
        "Debt / equity",
        fundamentals.debt_to_equity,
        "number",
      ),
      createFundamentalMetric(
        "Current ratio",
        fundamentals.current_ratio,
        "number",
      ),
      createFundamentalMetric("Revenue", fundamentals.revenue, "currency"),
      createFundamentalMetric(
        "Net income",
        fundamentals.net_income,
        "currency",
      ),
      createFundamentalMetric(
        "Free cash flow",
        fundamentals.free_cash_flow,
        "currency",
      ),
      createFundamentalMetric(
        "Total debt",
        fundamentals.total_debt,
        "currency",
      ),
      createFundamentalMetric(
        "Total equity",
        fundamentals.total_equity,
        "currency",
      ),
    ],
  };
}

export function selectLatestRelevantFundamentals(
  fundamentalsRows: StockFundamentalInput[],
): StockFundamentalInput | null {
  if (fundamentalsRows.length === 0) {
    return null;
  }

  return [...fundamentalsRows].sort(compareFundamentalsByRelevance)[0];
}

export function createHistoricalPriceChartPoints(
  priceRows: Pick<StockPriceInput, "close" | "price_date">[],
): HistoricalPriceChartPoint[] {
  return priceRows
    .map((row) => {
      const close = toFiniteNumber(row.close);

      if (close === null) {
        return null;
      }

      return {
        close,
        priceDate: row.price_date,
      };
    })
    .filter((row): row is HistoricalPriceChartPoint => row !== null)
    .sort((first, second) => first.priceDate.localeCompare(second.priceDate));
}

export function getTrailingFiftyTwoWeekStartDate(priceDate: string) {
  const latestDate = new Date(`${priceDate}T00:00:00.000Z`);

  if (Number.isNaN(latestDate.getTime())) {
    return priceDate;
  }

  latestDate.setUTCDate(latestDate.getUTCDate() - 364);

  return latestDate.toISOString().slice(0, 10);
}

export function getTrailingOneYearStartDate(priceDate: string) {
  const latestDate = new Date(`${priceDate}T00:00:00.000Z`);

  if (Number.isNaN(latestDate.getTime())) {
    return priceDate;
  }

  latestDate.setUTCFullYear(latestDate.getUTCFullYear() - 1);

  return latestDate.toISOString().slice(0, 10);
}

function addUtcDays(priceDate: string, days: number) {
  const date = new Date(`${priceDate}T00:00:00.000Z`);

  date.setUTCDate(date.getUTCDate() + days);

  return date.toISOString().slice(0, 10);
}

function differenceInUtcDays(laterDate: string, earlierDate: string) {
  const laterTime = Date.parse(`${laterDate}T00:00:00.000Z`);
  const earlierTime = Date.parse(`${earlierDate}T00:00:00.000Z`);

  return Math.floor((laterTime - earlierTime) / 86_400_000);
}

function parseDateOnly(value: string | null | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    return null;
  }

  return date;
}

function toUtcDateOnly(value: Date) {
  if (Number.isNaN(value.getTime())) {
    return null;
  }

  return value.toISOString().slice(0, 10);
}

function createProfileField(
  label: string,
  value: string | null,
): StockProfileField {
  const normalizedValue = value?.trim();

  return {
    isMissing: !normalizedValue,
    label,
    value: normalizedValue || "Unavailable",
  };
}

function toPricePoint(value: NumericInput, fallback: number | null) {
  return toFiniteNumber(value) ?? fallback;
}

function createFundamentalMetric(
  label: string,
  input: NumericInput,
  format: StockFundamentalMetricFormat,
): StockFundamentalMetric {
  const value = toFiniteNumber(input);

  return {
    format,
    isMissing: value === null,
    label,
    value,
  };
}

function compareFundamentalsByRelevance(
  first: StockFundamentalInput,
  second: StockFundamentalInput,
) {
  const periodPriorityDelta =
    FUNDAMENTAL_PERIOD_PRIORITY[first.period_type] -
    FUNDAMENTAL_PERIOD_PRIORITY[second.period_type];

  if (periodPriorityDelta !== 0) {
    return periodPriorityDelta;
  }

  if (first.fiscal_year !== second.fiscal_year) {
    return second.fiscal_year - first.fiscal_year;
  }

  return second.created_at.localeCompare(first.created_at);
}

const MOVEMENT_WINDOWS = [
  { amount: 7, id: "1w", label: "1 week", unit: "day" },
  { amount: 1, id: "1m", label: "1 month", unit: "month" },
  { amount: 6, id: "6m", label: "6 months", unit: "month" },
  { amount: 1, id: "1y", label: "1 year", unit: "year" },
] as const;

const MOVING_AVERAGE_WINDOWS = [
  { id: "50d", label: "50-day moving average", rowCount: 50 },
  { id: "200d", label: "200-day moving average", rowCount: 200 },
] as const;

const FUNDAMENTAL_PERIOD_PRIORITY = {
  ttm: 0,
  annual: 1,
  quarterly: 2,
} satisfies Record<StockFundamentalInput["period_type"], number>;

function createCachedPriceMovementMetric(
  rows: HistoricalPriceChartPoint[],
  window: (typeof MOVEMENT_WINDOWS)[number],
): CachedPriceMovementMetric {
  const latestRow = rows.at(-1) ?? null;
  const targetDate = latestRow
    ? subtractDateWindow(latestRow.priceDate, window)
    : null;
  const unavailableMetric = (
    unavailableReason: string,
  ): CachedPriceMovementMetric => ({
    baselineClose: null,
    baselineDate: null,
    id: window.id,
    label: window.label,
    latestClose: latestRow?.close ?? null,
    latestDate: latestRow?.priceDate ?? null,
    percentChange: null,
    targetDate,
    unavailableReason,
  });

  if (!latestRow || !targetDate) {
    return unavailableMetric("No cached close prices are available.");
  }

  if (latestRow.close <= 0) {
    return unavailableMetric("Latest cached close is not above zero.");
  }

  const earliestRow = rows[0];

  if (!earliestRow || earliestRow.priceDate > targetDate) {
    return unavailableMetric(`Needs cached prices back to ${targetDate}.`);
  }

  const baselineRow = rows.findLast((row) => row.priceDate <= targetDate);

  if (!baselineRow) {
    return unavailableMetric(`Needs a cached close on or before ${targetDate}.`);
  }

  if (baselineRow.close <= 0) {
    return unavailableMetric(
      `Cached close on ${baselineRow.priceDate} is not above zero.`,
    );
  }

  return {
    baselineClose: baselineRow.close,
    baselineDate: baselineRow.priceDate,
    id: window.id,
    label: window.label,
    latestClose: latestRow.close,
    latestDate: latestRow.priceDate,
    percentChange: ((latestRow.close - baselineRow.close) / baselineRow.close) * 100,
    targetDate,
    unavailableReason: null,
  };
}

function createCachedMovingAverageMetric(
  rows: HistoricalPriceChartPoint[],
  window: (typeof MOVING_AVERAGE_WINDOWS)[number],
): CachedMovingAverageMetric {
  const averagedRows = rows.slice(-window.rowCount);

  if (averagedRows.length < window.rowCount) {
    return {
      endDate: rows.at(-1)?.priceDate ?? null,
      id: window.id,
      label: window.label,
      requiredRowCount: window.rowCount,
      rowCount: averagedRows.length,
      startDate: averagedRows[0]?.priceDate ?? null,
      unavailableReason: `Needs at least ${window.rowCount} cached daily closes.`,
      value: null,
    };
  }

  return {
    endDate: averagedRows.at(-1)?.priceDate ?? null,
    id: window.id,
    label: window.label,
    requiredRowCount: window.rowCount,
    rowCount: averagedRows.length,
    startDate: averagedRows[0]?.priceDate ?? null,
    unavailableReason: null,
    value:
      averagedRows.reduce((total, row) => total + row.close, 0) /
      averagedRows.length,
  };
}

function subtractDateWindow(
  priceDate: string,
  window: (typeof MOVEMENT_WINDOWS)[number],
) {
  const date = new Date(`${priceDate}T00:00:00.000Z`);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  if (window.unit === "day") {
    date.setUTCDate(date.getUTCDate() - window.amount);
  } else if (window.unit === "month") {
    date.setUTCMonth(date.getUTCMonth() - window.amount);
  } else {
    date.setUTCFullYear(date.getUTCFullYear() - window.amount);
  }

  return date.toISOString().slice(0, 10);
}
