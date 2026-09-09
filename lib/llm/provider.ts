/**
 * LLM provider (ARCHITECTURE.md §6) — OpenAI-compatible chat completions.
 * Default target: Qwen (dashscope compatible-mode). Swappable to any
 * OpenAI-compatible endpoint via env. All requests go through safeFetch.
 */

import { safeFetch } from "@/lib/safe-fetch";

export interface ChatMessageParam {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
  name?: string;
}

export interface ToolSchema {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface LlmChoice {
  message: {
    role: "assistant";
    content: string | null;
    tool_calls?: ChatMessageParam["tool_calls"];
  };
  finish_reason?: string;
}

export interface LlmResponse {
  choices: LlmChoice[];
}

function baseUrl(): string {
  const raw = process.env.LLM_BASE_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1";
  return raw.replace(/\/+$/, "");
}

function apiKey(): string {
  return process.env.LLM_API_KEY || "";
}

function model(): string {
  return process.env.LLM_MODEL || "qwen-plus";
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export class LlmUnavailableError extends Error {}

export async function chatCompletion(
  messages: ChatMessageParam[],
  options: {
    tools?: ToolSchema[];
    jsonMode?: boolean;
    temperature?: number;
    maxTokens?: number;
  } = {},
): Promise<LlmResponse> {
  const key = apiKey();
  if (!key) {
    throw new LlmUnavailableError("LLM_API_KEY not set — LLM features disabled (demo data only)");
  }

  const body: Record<string, unknown> = {
    model: model(),
    messages,
    temperature: options.temperature ?? 0.3,
    max_tokens: options.maxTokens ?? 2000,
  };
  if (options.tools && options.tools.length > 0) {
    body.tools = options.tools;
  }
  if (options.jsonMode) {
    body.response_format = { type: "json_object" };
  }

  // The upstream proxy occasionally trips its breaker (observed live:
  // "provider temporarily unhealthy") — one retry on 5xx/429/network errors.
  const MAX_ATTEMPTS = 2;
  let lastError: LlmUnavailableError = new LlmUnavailableError("LLM request failed");
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let res: Response;
    try {
      res = await safeFetch(baseUrl() + "/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + key,
        },
        body: JSON.stringify(body),
      }, 45_000);
    } catch (e) {
      // network/timeout — retryable
      lastError = new LlmUnavailableError("LLM network error: " + (e instanceof Error ? e.message : "unknown"));
      if (attempt < MAX_ATTEMPTS) {
        await sleep(800);
        continue;
      }
      throw lastError;
    }

    if (res.ok) {
      return (await res.json()) as LlmResponse;
    }

    const detail = (await res.text().catch(() => "")).slice(0, 300);
    const retryable = res.status >= 500 || res.status === 429;
    lastError = new LlmUnavailableError(`LLM HTTP ${res.status}: ${detail}`);
    if (retryable && attempt < MAX_ATTEMPTS) {
      await sleep(800);
      continue;
    }
    throw lastError;
  }
  throw lastError;
}

export function llmConfigured(): boolean {
  return Boolean(apiKey());
}
