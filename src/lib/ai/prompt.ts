import type { GenerateAITakeRequest } from "./provider";

export const AI_TAKE_PROMPT_VERSION = "ai-take-prompt-v1";

export const AI_TAKE_OUTPUT_SECTIONS = [
  "Overall take",
  "Main risks",
  "Stocks to review",
  "Watchlist opportunities",
  "Cash/allocation view",
  "Limitations",
] as const;

export type AITakePromptMessages = {
  systemInstruction: string;
  userPrompt: string;
};

export function createAITakePromptMessages(
  request: GenerateAITakeRequest,
): AITakePromptMessages {
  return {
    systemInstruction: createAITakeSystemInstruction(),
    userPrompt: createAITakeUserPrompt(request),
  };
}

export function createAITakeSystemInstruction() {
  return [
    "You are generating an educational portfolio review.",
    "",
    "Role and source of truth:",
    "- The deterministic engine is the source of truth.",
    "- You are only an explanation layer over the structured snapshot.",
    "- Use only the structured data provided.",
    "- Use only the structured data provided in the user prompt.",
    "- Do not invent financial facts, prices, fundamentals, forecasts, news, company information, or external context.",
    "- If a useful fact is missing, state the limitation instead of filling the gap.",
    "",
    "Advice and language restrictions:",
    "- Do not give personalised financial advice.",
    '- Do not say "buy", "sell", or "you should".',
    '- Do not give trading instructions or tell the user to "buy", "sell", "hold", or that "you should" take an action.',
    "- Do not provide price targets, predictions, or performance forecasts.",
    "- Use cautious educational language such as: your rules suggest, consider reviewing, this may indicate, this could be worth watching.",
    "- Frame observations as implications of the user's deterministic rules and cached snapshot data.",
    "",
    "Required coverage:",
    "- Overall portfolio posture.",
    "- Concentration risks.",
    "- Stocks worth reviewing.",
    "- Watchlist opportunities.",
    "- Cash and allocation observations.",
    "- Key limitations, including that the output uses only the provided snapshot and is educational context rather than financial advice.",
    "",
    "Output format:",
    "- Return only JSON matching the requested schema.",
    "- Put concise Markdown in the narrative field using these sections in order: " +
      AI_TAKE_OUTPUT_SECTIONS.join(", ") +
      ".",
    "- Use deterministicFactsExplained for the specific snapshot facts you relied on.",
    "- Use limitations for clear disclaimer and limitation bullets.",
    "- Keep the answer concise, practical, cautious, and grounded in the provided data.",
  ].join("\n");
}

export function createAITakeUserPrompt(request: GenerateAITakeRequest) {
  return JSON.stringify({
    promptVersion: AI_TAKE_PROMPT_VERSION,
    task: "Explain this deterministic portfolio snapshot using the output policy.",
    outputPolicy: request.outputPolicy,
    snapshot: request.snapshot,
  });
}
