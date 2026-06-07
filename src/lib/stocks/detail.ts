import { toFiniteNumber, type NumericInput } from "../portfolios/totals";
import type { Database } from "../../types/supabase";

type StockRow = Database["public"]["Tables"]["stocks"]["Row"];
type StockPriceRow = Database["public"]["Tables"]["stock_prices"]["Row"];

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

export type StockProfileField = {
  isMissing: boolean;
  label: string;
  value: string;
};

export type LatestCachedPriceSummary = {
  cachedAt: string;
  close: number;
  priceDate: string;
  volume: number | null;
};

export type CachedFiftyTwoWeekRange = {
  high: number;
  low: number;
  rowCount: number;
  startDate: string;
  endDate: string;
};

export type HistoricalPriceChartPoint = {
  close: number;
  priceDate: string;
};

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
): LatestCachedPriceSummary | null {
  const close = toFiniteNumber(latestPrice?.close);

  if (!latestPrice || close === null) {
    return null;
  }

  return {
    cachedAt: latestPrice.created_at,
    close,
    priceDate: latestPrice.price_date,
    volume: latestPrice.volume,
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

  return {
    high: Math.max(...usableRows.map((row) => row.high)),
    low: Math.min(...usableRows.map((row) => row.low)),
    rowCount: usableRows.length,
    startDate: usableRows.reduce(
      (earliest, row) =>
        row.priceDate < earliest ? row.priceDate : earliest,
      usableRows[0].priceDate,
    ),
    endDate: usableRows.reduce(
      (latest, row) => (row.priceDate > latest ? row.priceDate : latest),
      usableRows[0].priceDate,
    ),
  };
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
