import { createOpenAI } from "@ai-sdk/openai";

const OPENCODE_BASE_URL = process.env.OPENCODE_BASE_URL ?? "https://opencode.ai/zen";
const OPENCODE_API_KEY = process.env.OPENCODE_API_KEY ?? "";
const OPENCODE_MODEL_ID = process.env.OPENCODE_MODEL ?? "minimax-m2.5-free";

export const opencodeProvider = createOpenAI({
  baseURL: OPENCODE_BASE_URL,
  apiKey: OPENCODE_API_KEY,
  headers: {
    "X-Enable-Tool-Search": process.env.ENABLE_TOOL_SEARCH ?? "true",
  },
});

export function getAIModel() {
  return opencodeProvider(OPENCODE_MODEL_ID);
}

export const OPENCODE_MODEL = OPENCODE_MODEL_ID;
