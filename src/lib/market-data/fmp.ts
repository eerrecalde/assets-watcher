import {
  createMarketDataFailure,
  createMarketDataSuccess,
  normalizeMarketDataDate,
  normalizeMarketDataSymbol,
  type FundamentalsRequest,
  type HistoricalPriceRequest,
  type MarketDataCompanyProfile,
  type MarketDataFundamental,
  type MarketDataFundamentalPeriodType,
  type MarketDataPrice,
  type MarketDataProvider,
  type MarketDataProviderErrorCode,
  type MarketDataResult,
} from "./provider";

const DEFAULT_FMP_BASE_URL = "https://financialmodelingprep.com/stable";
const FMP_PROVIDER_ID = "financial-modeling-prep";
const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 100;

type MarketDataFetch = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;

type FinancialModelingPrepProviderOptions = {
  apiKey?: string;
  baseUrl?: string;
  fetchFn?: MarketDataFetch;
  now?: () => Date;
};

type FmpJsonObject = Record<string, unknown>;

type FmpRequestOptions = {
  symbol: string;
  path: string;
  params?: Record<string, string | number | undefined>;
};

type FmpRequestFailure = {
  ok: false;
  code: MarketDataProviderErrorCode;
  message: string;
};

type FmpRequestResult =
  | {
      ok: true;
      data: unknown;
    }
  | FmpRequestFailure;

type FmpArrayRequestResult =
  | {
      ok: true;
      data: FmpJsonObject[];
    }
  | FmpRequestFailure;

export class FinancialModelingPrepProvider implements MarketDataProvider {
  readonly id = FMP_PROVIDER_ID;
  readonly displayName = "Financial Modeling Prep";

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchFn: MarketDataFetch;
  private readonly now: () => Date;

  constructor({
    apiKey = process.env.FMP_API_KEY,
    baseUrl = DEFAULT_FMP_BASE_URL,
    fetchFn = fetch,
    now = () => new Date(),
  }: FinancialModelingPrepProviderOptions = {}) {
    if (!apiKey) {
      throw new Error("Missing required environment variable: FMP_API_KEY");
    }

    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.fetchFn = fetchFn;
    this.now = now;
  }

  async getCompanyProfile(
    symbol: string,
  ): Promise<MarketDataResult<MarketDataCompanyProfile>> {
    const fetchedAt = this.now();
    let normalizedSymbol: string;

    try {
      normalizedSymbol = normalizeMarketDataSymbol(symbol);
    } catch (error) {
      return this.failure("invalid_symbol", getErrorMessage(error), fetchedAt);
    }

    const response = await this.requestArray({
      symbol: normalizedSymbol,
      path: "/profile",
    });

    if (!response.ok) {
      return this.failure(response.code, response.message, fetchedAt);
    }

    const profile = response.data[0];

    if (!profile) {
      return this.failure(
        "not_found",
        `No company profile found for ${normalizedSymbol}.`,
        fetchedAt,
      );
    }

    const name = getString(profile, "companyName", "companyNameLong", "name");
    const currency = getString(profile, "currency", "reportedCurrency");

    if (!name || !currency) {
      return this.failure(
        "invalid_response",
        `Financial Modeling Prep returned an incomplete profile for ${normalizedSymbol}.`,
        fetchedAt,
      );
    }

    return createMarketDataSuccess({
      provider: this.id,
      fetchedAt,
      data: {
        symbol: normalizedSymbol,
        name,
        exchange: getNullableString(
          profile,
          "exchangeShortName",
          "exchange",
          "exchangeName",
        ),
        sector: getNullableString(profile, "sector"),
        industry: getNullableString(profile, "industry"),
        country: getNullableString(profile, "country"),
        currency,
      },
    });
  }

  async getLatestPrice(
    symbol: string,
  ): Promise<MarketDataResult<MarketDataPrice>> {
    const fetchedAt = this.now();
    let normalizedSymbol: string;

    try {
      normalizedSymbol = normalizeMarketDataSymbol(symbol);
    } catch (error) {
      return this.failure("invalid_symbol", getErrorMessage(error), fetchedAt);
    }

    const response = await this.requestArray({
      symbol: normalizedSymbol,
      path: "/quote",
    });

    if (!response.ok) {
      return this.failure(response.code, response.message, fetchedAt);
    }

    const quote = response.data[0];

    if (!quote) {
      return this.failure(
        "not_found",
        `No latest quote found for ${normalizedSymbol}.`,
        fetchedAt,
      );
    }

    const close = getNumber(quote, "price", "close");

    if (close === null) {
      return this.failure(
        "invalid_response",
        `Financial Modeling Prep returned an incomplete quote for ${normalizedSymbol}.`,
        fetchedAt,
      );
    }

    return createMarketDataSuccess({
      provider: this.id,
      fetchedAt,
      data: {
        symbol: normalizedSymbol,
        priceDate: getQuoteDate(quote, fetchedAt),
        open: getNumber(quote, "open"),
        high: getNumber(quote, "dayHigh", "high"),
        low: getNumber(quote, "dayLow", "low"),
        close,
        volume: getNumber(quote, "volume"),
      },
    });
  }

  async getHistoricalPrices(
    symbol: string,
    request: HistoricalPriceRequest = {},
  ): Promise<MarketDataResult<MarketDataPrice[]>> {
    const fetchedAt = this.now();
    let normalizedSymbol: string;

    try {
      normalizedSymbol = normalizeMarketDataSymbol(symbol);
    } catch (error) {
      return this.failure("invalid_symbol", getErrorMessage(error), fetchedAt);
    }

    const response = await this.request({
      symbol: normalizedSymbol,
      path: "/historical-price-eod/full",
      params: {
        from: request.startDate
          ? normalizeMarketDataDate(request.startDate)
          : undefined,
        to: request.endDate ? normalizeMarketDataDate(request.endDate) : undefined,
        limit: normalizeLimit(request.limit),
      },
    });

    if (!response.ok) {
      return this.failure(response.code, response.message, fetchedAt);
    }

    const rows = unwrapHistoricalRows(response.data);
    const prices = rows
      .map((row) => mapHistoricalPrice(row, normalizedSymbol))
      .filter((price) => price !== null);

    if (prices.length !== rows.length) {
      return this.failure(
        "invalid_response",
        `Financial Modeling Prep returned incomplete historical prices for ${normalizedSymbol}.`,
        fetchedAt,
      );
    }

    return createMarketDataSuccess({
      provider: this.id,
      fetchedAt,
      data: prices,
    });
  }

  async getFundamentals(
    symbol: string,
    request: FundamentalsRequest = {},
  ): Promise<MarketDataResult<MarketDataFundamental[]>> {
    const fetchedAt = this.now();
    let normalizedSymbol: string;

    try {
      normalizedSymbol = normalizeMarketDataSymbol(symbol);
    } catch (error) {
      return this.failure("invalid_symbol", getErrorMessage(error), fetchedAt);
    }

    const periodType = request.periodType ?? "annual";
    const limit = normalizeLimit(request.limit) ?? DEFAULT_LIMIT;

    if (periodType === "ttm") {
      return this.getTtmFundamentals(normalizedSymbol, limit, fetchedAt);
    }

    const period = periodType === "quarterly" ? "quarter" : "annual";

    const [income, balance, cashFlow, metrics, ratios] = await Promise.all([
      this.requestArray({
        symbol: normalizedSymbol,
        path: "/income-statement",
        params: { period, limit },
      }),
      this.requestArray({
        symbol: normalizedSymbol,
        path: "/balance-sheet-statement",
        params: { period, limit },
      }),
      this.requestArray({
        symbol: normalizedSymbol,
        path: "/cash-flow-statement",
        params: { period, limit },
      }),
      this.requestArray({
        symbol: normalizedSymbol,
        path: "/key-metrics",
        params: { period, limit },
      }),
      this.requestArray({
        symbol: normalizedSymbol,
        path: "/ratios",
        params: { period, limit },
      }),
    ]);

    const failure = [income, balance, cashFlow, metrics, ratios].find(
      (response) => !response.ok,
    );

    if (failure && !failure.ok) {
      return this.failure(failure.code, failure.message, fetchedAt);
    }

    if (
      !income.ok ||
      !balance.ok ||
      !cashFlow.ok ||
      !metrics.ok ||
      !ratios.ok
    ) {
      return this.failure(
        "provider_error",
        "Financial Modeling Prep returned an unexpected fundamentals response.",
        fetchedAt,
      );
    }

    const balanceByPeriod = indexByFiscalPeriod(balance.data);
    const cashFlowByPeriod = indexByFiscalPeriod(cashFlow.data);
    const metricsByPeriod = indexByFiscalPeriod(metrics.data);
    const ratiosByPeriod = indexByFiscalPeriod(ratios.data);

    const fundamentals = income.data
      .map((incomeRow) =>
        mapFundamental({
          symbol: normalizedSymbol,
          periodType,
          income: incomeRow,
          balance: balanceByPeriod.get(getFiscalPeriodKey(incomeRow)),
          cashFlow: cashFlowByPeriod.get(getFiscalPeriodKey(incomeRow)),
          metrics: metricsByPeriod.get(getFiscalPeriodKey(incomeRow)),
          ratios: ratiosByPeriod.get(getFiscalPeriodKey(incomeRow)),
        }),
      )
      .filter((fundamental) => fundamental !== null);

    return createMarketDataSuccess({
      provider: this.id,
      fetchedAt,
      data: fundamentals,
    });
  }

  private async getTtmFundamentals(
    symbol: string,
    limit: number,
    fetchedAt: Date,
  ): Promise<MarketDataResult<MarketDataFundamental[]>> {
    const [metrics, ratios] = await Promise.all([
      this.requestArray({
        symbol,
        path: "/key-metrics-ttm",
        params: { limit },
      }),
      this.requestArray({
        symbol,
        path: "/ratios-ttm",
        params: { limit },
      }),
    ]);

    const failure = [metrics, ratios].find((response) => !response.ok);

    if (failure && !failure.ok) {
      return this.failure(failure.code, failure.message, fetchedAt);
    }

    if (!metrics.ok || !ratios.ok) {
      return this.failure(
        "provider_error",
        "Financial Modeling Prep returned an unexpected TTM fundamentals response.",
        fetchedAt,
      );
    }

    const ratiosBySymbol = new Map(
      ratios.data.map((ratio) => [getString(ratio, "symbol") ?? symbol, ratio]),
    );

    return createMarketDataSuccess({
      provider: this.id,
      fetchedAt,
      data: metrics.data
        .slice(0, limit)
        .map((metric) =>
          mapTtmFundamental({
            symbol,
            fiscalYear: fetchedAt.getUTCFullYear(),
            metrics: metric,
            ratios: ratiosBySymbol.get(getString(metric, "symbol") ?? symbol),
          }),
        ),
    });
  }

  private async requestArray(
    options: FmpRequestOptions,
  ): Promise<FmpArrayRequestResult> {
    const response = await this.request(options);

    if (!response.ok) {
      return response;
    }

    if (!Array.isArray(response.data)) {
      return {
        ok: false as const,
        code: "invalid_response" as const,
        message: `Financial Modeling Prep returned an invalid ${options.path} response for ${options.symbol}.`,
      };
    }

    if (!response.data.every(isObject)) {
      return {
        ok: false as const,
        code: "invalid_response" as const,
        message: `Financial Modeling Prep returned malformed ${options.path} rows for ${options.symbol}.`,
      };
    }

    return {
      ok: true,
      data: response.data,
    };
  }

  private async request({
    symbol,
    path,
    params = {},
  }: FmpRequestOptions): Promise<FmpRequestResult> {
    const url = new URL(`${this.baseUrl}${path}`);
    url.searchParams.set("symbol", symbol);

    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }

    url.searchParams.set("apikey", this.apiKey);

    let response: Response;

    try {
      response = await this.fetchFn(url.toString(), {
        headers: {
          accept: "application/json",
        },
      });
    } catch {
      return {
        ok: false as const,
        code: "provider_unavailable" as const,
        message: "Financial Modeling Prep is unavailable.",
      };
    }

    let json: unknown;

    try {
      json = await response.json();
    } catch {
      return {
        ok: false as const,
        code: "invalid_response" as const,
        message: `Financial Modeling Prep returned invalid JSON for ${symbol}.`,
      };
    }

    if (!response.ok) {
      return {
        ok: false as const,
        code: mapHttpStatusToErrorCode(response.status),
        message: getProviderErrorMessage(json, response.status),
      };
    }

    const providerError = getProviderError(json);

    if (providerError) {
      return providerError;
    }

    return {
      ok: true as const,
      data: json,
    };
  }

  private failure<T>(
    code: MarketDataProviderErrorCode,
    message: string,
    fetchedAt: Date,
  ): MarketDataResult<T> {
    return createMarketDataFailure({
      provider: this.id,
      fetchedAt,
      code,
      message,
    });
  }
}

export function createFinancialModelingPrepProvider(
  options?: FinancialModelingPrepProviderOptions,
) {
  return new FinancialModelingPrepProvider(options);
}

function normalizeLimit(limit: number | undefined) {
  if (limit === undefined) {
    return undefined;
  }

  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error("Market data limit must be a positive integer.");
  }

  return Math.min(limit, MAX_LIMIT);
}

function unwrapHistoricalRows(data: unknown) {
  if (Array.isArray(data)) {
    return data.filter(isObject);
  }

  if (isObject(data) && Array.isArray(data.historical)) {
    return data.historical.filter(isObject);
  }

  return [];
}

function mapHistoricalPrice(row: FmpJsonObject, symbol: string) {
  const priceDate = getString(row, "date");
  const close = getNumber(row, "close", "adjClose");

  if (!priceDate || close === null) {
    return null;
  }

  return {
    symbol,
    priceDate: normalizeMarketDataDate(priceDate),
    open: getNumber(row, "open"),
    high: getNumber(row, "high"),
    low: getNumber(row, "low"),
    close,
    volume: getNumber(row, "volume"),
  } satisfies MarketDataPrice;
}

function mapFundamental({
  symbol,
  periodType,
  income,
  balance,
  cashFlow,
  metrics,
  ratios,
}: {
  symbol: string;
  periodType: MarketDataFundamentalPeriodType;
  income: FmpJsonObject;
  balance?: FmpJsonObject;
  cashFlow?: FmpJsonObject;
  metrics?: FmpJsonObject;
  ratios?: FmpJsonObject;
}) {
  const fiscalPeriod = getString(income, "period") ?? "FY";
  const fiscalYear = getFiscalYear(income);

  if (fiscalYear === null) {
    return null;
  }

  return {
    symbol,
    fiscalPeriod,
    fiscalYear,
    periodType,
    eps: getNumber(income, "eps", "epsdiluted"),
    bookValuePerShare: getNumber(metrics, "bookValuePerShare"),
    peRatio: getNumber(metrics, "peRatio", "priceEarningsRatio"),
    pbRatio: getNumber(
      metrics,
      "pbRatio",
      "priceToBookRatio",
      "priceBookValueRatio",
    ),
    debtToEquity: getNumber(
      metrics,
      "debtToEquity",
      "debtEquityRatio",
      "debtToEquityRatio",
    ),
    currentRatio: getNumber(metrics, "currentRatio", "currentRatioTTM"),
    dividendYield: getNumber(
      ratios,
      "dividendYield",
      "dividendYielPercentageTTM",
      "dividendYieldTTM",
    ),
    revenue: getNumber(income, "revenue"),
    netIncome: getNumber(income, "netIncome"),
    freeCashFlow: getNumber(cashFlow, "freeCashFlow"),
    totalDebt: getNumber(balance, "totalDebt"),
    totalEquity: getNumber(
      balance,
      "totalStockholdersEquity",
      "totalEquity",
      "totalShareholderEquity",
    ),
  } satisfies MarketDataFundamental;
}

function mapTtmFundamental({
  symbol,
  fiscalYear,
  metrics,
  ratios,
}: {
  symbol: string;
  fiscalYear: number;
  metrics: FmpJsonObject;
  ratios?: FmpJsonObject;
}) {
  return {
    symbol,
    fiscalPeriod: "TTM",
    fiscalYear,
    periodType: "ttm",
    eps: getNumber(metrics, "netIncomePerShareTTM", "epsTTM"),
    bookValuePerShare: getNumber(
      metrics,
      "bookValuePerShareTTM",
      "bookValuePerShare",
    ),
    peRatio: getNumber(metrics, "peRatioTTM", "peRatio"),
    pbRatio: getNumber(
      metrics,
      "pbRatioTTM",
      "priceToBookRatioTTM",
      "priceBookValueRatioTTM",
    ),
    debtToEquity: getNumber(
      metrics,
      "debtToEquityTTM",
      "debtEquityRatioTTM",
      "debtToEquityRatioTTM",
    ),
    currentRatio: getNumber(metrics, "currentRatioTTM", "currentRatio"),
    dividendYield: getNumber(
      ratios,
      "dividendYieldTTM",
      "dividendYielPercentageTTM",
      "dividendYield",
    ),
    revenue: getNumber(metrics, "revenueTTM"),
    netIncome: getNumber(metrics, "netIncomeTTM"),
    freeCashFlow: getNumber(metrics, "freeCashFlowTTM"),
    totalDebt: getNumber(metrics, "totalDebtTTM"),
    totalEquity: getNumber(metrics, "totalEquityTTM"),
  } satisfies MarketDataFundamental;
}

function indexByFiscalPeriod(rows: FmpJsonObject[]) {
  const byPeriod = new Map<string, FmpJsonObject>();

  for (const row of rows) {
    byPeriod.set(getFiscalPeriodKey(row), row);
  }

  return byPeriod;
}

function getFiscalPeriodKey(row: FmpJsonObject) {
  return `${getString(row, "calendarYear") ?? getString(row, "date") ?? ""}:${
    getString(row, "period") ?? ""
  }`;
}

function getFiscalYear(row: FmpJsonObject) {
  const calendarYear = getString(row, "calendarYear");

  if (calendarYear && /^\d{4}$/.test(calendarYear)) {
    return Number(calendarYear);
  }

  const date = getString(row, "date");

  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return Number(date.slice(0, 4));
  }

  return null;
}

function getQuoteDate(quote: FmpJsonObject, fallbackDate: Date) {
  const date = getString(quote, "date");

  if (date) {
    return normalizeMarketDataDate(date.slice(0, 10));
  }

  const timestamp = getNumber(quote, "timestamp");

  if (timestamp !== null) {
    return new Date(timestamp * 1000).toISOString().slice(0, 10);
  }

  return normalizeMarketDataDate(fallbackDate);
}

function getNumber(
  source: FmpJsonObject | undefined,
  ...keys: string[]
): number | null {
  if (!source) {
    return null;
  }

  for (const key of keys) {
    const value = source[key];

    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === "string" && value.trim() !== "") {
      const parsedValue = Number(value);

      if (Number.isFinite(parsedValue)) {
        return parsedValue;
      }
    }
  }

  return null;
}

function getNullableString(source: FmpJsonObject, ...keys: string[]) {
  return getString(source, ...keys) ?? null;
}

function getString(source: FmpJsonObject | undefined, ...keys: string[]) {
  if (!source) {
    return null;
  }

  for (const key of keys) {
    const value = source[key];

    if (typeof value === "string" && value.trim() !== "") {
      return value;
    }
  }

  return null;
}

function getProviderError(json: unknown) {
  if (!isObject(json)) {
    return null;
  }

  const message = getString(
    json,
    "Error Message",
    "error",
    "message",
    "Message",
  );

  if (!message) {
    return null;
  }

  const lowerMessage = message.toLowerCase();

  return {
    ok: false as const,
    code:
      lowerMessage.includes("rate") || lowerMessage.includes("limit")
        ? ("rate_limited" as const)
        : ("provider_error" as const),
    message,
  };
}

function getProviderErrorMessage(json: unknown, status: number) {
  if (isObject(json)) {
    const message = getString(
      json,
      "Error Message",
      "error",
      "message",
      "Message",
    );

    if (message) {
      return message;
    }
  }

  return `Financial Modeling Prep request failed with HTTP ${status}.`;
}

function mapHttpStatusToErrorCode(
  status: number,
): MarketDataProviderErrorCode {
  if (status === 404) {
    return "not_found";
  }

  if (status === 429) {
    return "rate_limited";
  }

  if (status >= 500) {
    return "provider_unavailable";
  }

  return "provider_error";
}

function isObject(value: unknown): value is FmpJsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Invalid market data request.";
}
