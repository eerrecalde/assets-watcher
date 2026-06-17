import {
  createAIProviderFailure,
  createAIProviderSuccess,
  type AIProvider,
  type AIProviderCostMetadata,
  type AIProviderErrorCode,
  type AIProviderUsageMetadata,
  type AITakeOutput,
  type AITakeResult,
  type GenerateAITakeRequest,
} from "./provider";
import { createAITakePromptMessages } from "./prompt";

const DEFAULT_GEMINI_BASE_URL = "https://generativelanguage.googleapis.com";
const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash";
const GEMINI_PROVIDER_ID = "gemini";

type GeminiFetch = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;

type GeminiProviderOptions = {
  apiKey?: string;
  baseUrl?: string;
  fetchFn?: GeminiFetch;
  model?: string;
  now?: () => Date;
};

type GeminiJsonObject = Record<string, unknown>;

type GeminiRequestResult =
  | {
      ok: true;
      data: GeminiJsonObject;
    }
  | {
      ok: false;
      code: AIProviderErrorCode;
      message: string;
      usage: AIProviderUsageMetadata | null;
    };

export class GeminiProvider implements AIProvider {
  readonly id = GEMINI_PROVIDER_ID;
  readonly displayName = "Gemini";
  readonly model: string;

  private readonly apiKey: string | null;
  private readonly baseUrl: string;
  private readonly fetchFn: GeminiFetch;
  private readonly now: () => Date;

  constructor({
    apiKey = process.env.GEMINI_API_KEY,
    baseUrl = DEFAULT_GEMINI_BASE_URL,
    fetchFn = fetch,
    model = DEFAULT_GEMINI_MODEL,
    now = () => new Date(),
  }: GeminiProviderOptions = {}) {
    this.apiKey = normalizeOptionalString(apiKey);
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.fetchFn = fetchFn;
    this.model = model.trim();
    this.now = now;
  }

  async generateTake(request: GenerateAITakeRequest): Promise<AITakeResult> {
    const generatedAt = this.now();
    const configurationError = this.getConfigurationError();

    if (configurationError) {
      return this.failure({
        code: "provider_error",
        generatedAt,
        message: configurationError,
      });
    }

    if (!isValidRequest(request)) {
      return this.failure({
        code: "invalid_snapshot",
        generatedAt,
        message: "AI take generation requires a valid portfolio snapshot.",
      });
    }

    const response = await this.request(request);

    if (!response.ok) {
      return this.failure({
        code: response.code,
        generatedAt,
        message: response.message,
        usage: response.usage,
      });
    }

    const usage = getUsageMetadata(response.data);

    if (isSafetyBlocked(response.data)) {
      return this.failure({
        code: "safety_blocked",
        generatedAt,
        message: "Gemini blocked the AI take response for safety reasons.",
        usage,
      });
    }

    const text = getCandidateText(response.data);

    if (!text) {
      return this.failure({
        code: "invalid_response",
        generatedAt,
        message: "Gemini returned an empty AI take response.",
        usage,
      });
    }

    const output = parseAITakeOutput(text);

    if (!output) {
      return this.failure({
        code: "invalid_response",
        generatedAt,
        message: "Gemini returned an invalid AI take response.",
        usage,
      });
    }

    return createAIProviderSuccess({
      cost: getCostMetadata(),
      data: output,
      generatedAt,
      model: this.model,
      provider: this.id,
      usage,
      warnings: getWarnings(response.data),
    });
  }

  private async request(
    request: GenerateAITakeRequest,
  ): Promise<GeminiRequestResult> {
    const url = new URL(
      `/v1beta/models/${encodeURIComponent(this.model)}:generateContent`,
      this.baseUrl,
    );
    url.searchParams.set("key", this.apiKey ?? "");

    let response: Response;

    try {
      response = await this.fetchFn(url.toString(), {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
        },
        body: JSON.stringify(createGeminiRequestBody(request)),
      });
    } catch {
      return {
        ok: false,
        code: "provider_unavailable",
        message: "Gemini is unavailable.",
        usage: null,
      };
    }

    let json: unknown;

    try {
      json = await response.json();
    } catch {
      return {
        ok: false,
        code: "invalid_response",
        message: "Gemini returned invalid JSON.",
        usage: null,
      };
    }

    if (!isObject(json)) {
      return {
        ok: false,
        code: "invalid_response",
        message: "Gemini returned a malformed response.",
        usage: null,
      };
    }

    const usage = getUsageMetadata(json);

    if (!response.ok) {
      return {
        ok: false,
        code: mapHttpStatusToErrorCode(response.status),
        message: getProviderErrorMessage(json, response.status),
        usage,
      };
    }

    return {
      ok: true,
      data: json,
    };
  }

  private getConfigurationError() {
    if (!this.apiKey) {
      return "Gemini provider is not configured. Set GEMINI_API_KEY on the server.";
    }

    if (!this.model) {
      return "Gemini provider is not configured. Set a Gemini model name.";
    }

    if (!isValidUrl(this.baseUrl)) {
      return "Gemini provider is not configured. Set a valid Gemini base URL.";
    }

    return null;
  }

  private failure({
    code,
    generatedAt,
    message,
    usage = null,
  }: {
    code: AIProviderErrorCode;
    generatedAt: Date;
    message: string;
    usage?: AIProviderUsageMetadata | null;
  }): AITakeResult {
    return createAIProviderFailure({
      cost: getCostMetadata(),
      code,
      generatedAt,
      message,
      model: this.model || DEFAULT_GEMINI_MODEL,
      provider: this.id,
      usage,
    });
  }
}

export function createGeminiProvider(options?: GeminiProviderOptions) {
  return new GeminiProvider(options);
}

function createGeminiRequestBody(request: GenerateAITakeRequest) {
  const prompt = createAITakePromptMessages(request);

  return {
    systemInstruction: {
      parts: [{ text: prompt.systemInstruction }],
    },
    contents: [
      {
        role: "user",
        parts: [{ text: prompt.userPrompt }],
      },
    ],
    generationConfig: {
      temperature: 0.2,
      candidateCount: 1,
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          narrative: { type: "STRING" },
          deterministicFactsExplained: {
            type: "ARRAY",
            items: { type: "STRING" },
          },
          limitations: {
            type: "ARRAY",
            items: { type: "STRING" },
          },
        },
        required: [
          "narrative",
          "deterministicFactsExplained",
          "limitations",
        ],
      },
    },
  };
}

function parseAITakeOutput(text: string): AITakeOutput | null {
  const parsed = parseJson(stripJsonFence(text));

  if (!isObject(parsed)) {
    return null;
  }

  const narrative = getString(parsed, "narrative");
  const deterministicFactsExplained = getStringArray(
    parsed,
    "deterministicFactsExplained",
  );
  const limitations = getStringArray(parsed, "limitations");

  if (
    !narrative ||
    deterministicFactsExplained === null ||
    limitations === null
  ) {
    return null;
  }

  return {
    deterministicFactsExplained,
    limitations,
    narrative,
  };
}

function getCandidateText(json: GeminiJsonObject) {
  const candidates = getObjectArray(json, "candidates");
  const firstCandidate = candidates[0];

  if (!firstCandidate) {
    return null;
  }

  const content = getObject(firstCandidate, "content");
  const parts = content ? getObjectArray(content, "parts") : [];
  const text = parts
    .map((part) => getString(part, "text"))
    .filter((partText) => partText !== null)
    .join("");

  return text.trim() || null;
}

function getUsageMetadata(
  json: GeminiJsonObject,
): AIProviderUsageMetadata | null {
  const usage = getObject(json, "usageMetadata");

  if (!usage) {
    return null;
  }

  return {
    inputTokens: getNumber(usage, "promptTokenCount"),
    outputTokens: getNumber(usage, "candidatesTokenCount"),
    totalTokens: getNumber(usage, "totalTokenCount"),
  };
}

function getCostMetadata(): AIProviderCostMetadata | null {
  return null;
}

function getWarnings(json: GeminiJsonObject) {
  const finishReason = getFirstCandidateFinishReason(json);

  if (finishReason && finishReason !== "STOP") {
    return [`Gemini completed with finish reason: ${finishReason}.`];
  }

  return [];
}

function isSafetyBlocked(json: GeminiJsonObject) {
  const promptFeedback = getObject(json, "promptFeedback");
  const blockReason = promptFeedback
    ? getString(promptFeedback, "blockReason")
    : null;
  const finishReason = getFirstCandidateFinishReason(json);

  return Boolean(blockReason) || finishReason === "SAFETY";
}

function getFirstCandidateFinishReason(json: GeminiJsonObject) {
  const candidates = getObjectArray(json, "candidates");
  const firstCandidate = candidates[0];

  return firstCandidate ? getString(firstCandidate, "finishReason") : null;
}

function getProviderErrorMessage(json: GeminiJsonObject, status: number) {
  const error = getObject(json, "error");
  const message = error ? getString(error, "message") : null;

  return message || `Gemini request failed with status ${status}.`;
}

function mapHttpStatusToErrorCode(status: number): AIProviderErrorCode {
  if (status === 429) {
    return "rate_limited";
  }

  if (status === 408 || status >= 500) {
    return "provider_unavailable";
  }

  if (status === 400 || status === 401 || status === 403) {
    return "provider_error";
  }

  return "provider_error";
}

function isValidRequest(request: GenerateAITakeRequest) {
  return Boolean(
    request &&
      request.outputPolicy?.purpose ===
        "explain_deterministic_portfolio_snapshot" &&
      request.snapshot?.generatedAt &&
      request.snapshot.portfolio &&
      Array.isArray(request.snapshot.holdings) &&
      Array.isArray(request.snapshot.watchlist),
  );
}

function normalizeOptionalString(value: string | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function isValidUrl(value: string) {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

function stripJsonFence(value: string) {
  return value
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");
}

function parseJson(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function getObject(value: GeminiJsonObject, key: string) {
  const nested = value[key];
  return isObject(nested) ? nested : null;
}

function getObjectArray(value: GeminiJsonObject, key: string) {
  const nested = value[key];
  return Array.isArray(nested) ? nested.filter(isObject) : [];
}

function getString(value: GeminiJsonObject, key: string) {
  const rawValue = value[key];
  return typeof rawValue === "string" && rawValue.trim()
    ? rawValue.trim()
    : null;
}

function getStringArray(value: GeminiJsonObject, key: string) {
  const rawValue = value[key];

  if (!Array.isArray(rawValue)) {
    return null;
  }

  const strings = rawValue.filter(
    (item): item is string => typeof item === "string" && item.trim().length > 0,
  );

  return strings.length === rawValue.length
    ? strings.map((item) => item.trim())
    : null;
}

function getNumber(value: GeminiJsonObject, key: string) {
  const rawValue = value[key];
  return typeof rawValue === "number" && Number.isFinite(rawValue)
    ? rawValue
    : null;
}

function isObject(value: unknown): value is GeminiJsonObject {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
