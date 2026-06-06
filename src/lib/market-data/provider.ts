export type MarketDataProviderErrorCode =
  | "invalid_symbol"
  | "not_found"
  | "rate_limited"
  | "provider_unavailable"
  | "invalid_response"
  | "provider_error";

export type MarketDataResult<T> =
  | {
      ok: true;
      provider: string;
      fetchedAt: Date;
      data: T;
      warnings: string[];
    }
  | {
      ok: false;
      provider: string;
      fetchedAt: Date;
      error: {
        code: MarketDataProviderErrorCode;
        message: string;
      };
    };

export type MarketDataCompanyProfile = {
  symbol: string;
  name: string;
  exchange: string | null;
  sector: string | null;
  industry: string | null;
  country: string | null;
  currency: string;
};

export type MarketDataPrice = {
  symbol: string;
  priceDate: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number;
  volume: number | null;
};

export type MarketDataFundamentalPeriodType = "annual" | "quarterly" | "ttm";

export type MarketDataFundamental = {
  symbol: string;
  fiscalPeriod: string;
  fiscalYear: number;
  periodType: MarketDataFundamentalPeriodType;
  eps: number | null;
  bookValuePerShare: number | null;
  peRatio: number | null;
  pbRatio: number | null;
  debtToEquity: number | null;
  currentRatio: number | null;
  dividendYield: number | null;
  revenue: number | null;
  netIncome: number | null;
  freeCashFlow: number | null;
  totalDebt: number | null;
  totalEquity: number | null;
};

export type HistoricalPriceRequest = {
  startDate?: string;
  endDate?: string;
  limit?: number;
};

export type FundamentalsRequest = {
  periodType?: MarketDataFundamentalPeriodType;
  limit?: number;
};

export interface MarketDataProvider {
  readonly id: string;
  readonly displayName: string;
  getCompanyProfile(
    symbol: string,
  ): Promise<MarketDataResult<MarketDataCompanyProfile>>;
  getLatestPrice(symbol: string): Promise<MarketDataResult<MarketDataPrice>>;
  getHistoricalPrices(
    symbol: string,
    request?: HistoricalPriceRequest,
  ): Promise<MarketDataResult<MarketDataPrice[]>>;
  getFundamentals(
    symbol: string,
    request?: FundamentalsRequest,
  ): Promise<MarketDataResult<MarketDataFundamental[]>>;
}

export function normalizeMarketDataSymbol(symbol: string) {
  const normalizedSymbol = symbol.trim().toUpperCase();

  if (!/^[A-Z0-9][A-Z0-9.-]{0,14}$/.test(normalizedSymbol)) {
    throw new Error(`Invalid market data symbol: ${symbol}`);
  }

  return normalizedSymbol;
}

export function normalizeMarketDataDate(value: Date | string) {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new Error("Invalid market data date.");
    }

    return value.toISOString().slice(0, 10);
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`Invalid market data date: ${value}`);
  }

  const parsedDate = new Date(`${value}T00:00:00.000Z`);

  if (
    Number.isNaN(parsedDate.getTime()) ||
    parsedDate.toISOString().slice(0, 10) !== value
  ) {
    throw new Error(`Invalid market data date: ${value}`);
  }

  return value;
}

export function createMarketDataSuccess<T>({
  data,
  fetchedAt = new Date(),
  provider,
  warnings = [],
}: {
  data: T;
  fetchedAt?: Date;
  provider: string;
  warnings?: string[];
}): MarketDataResult<T> {
  return {
    ok: true,
    provider,
    fetchedAt,
    data,
    warnings,
  };
}

export function createMarketDataFailure<T>({
  code,
  fetchedAt = new Date(),
  message,
  provider,
}: {
  code: MarketDataProviderErrorCode;
  fetchedAt?: Date;
  message: string;
  provider: string;
}): MarketDataResult<T> {
  return {
    ok: false,
    provider,
    fetchedAt,
    error: {
      code,
      message,
    },
  };
}
