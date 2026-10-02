import "server-only";

import OpenAI from "openai";

let client: OpenAI | null = null;

// Server-only OpenAI client (decision 4: key from OPENAI_API_KEY, model per fund).
export function openai(): OpenAI {
  if (!process.env.OPENAI_API_KEY) {
    throw new LlmError("missing_key", "The OpenAI API key is not configured. Ask an admin to set OPENAI_API_KEY.");
  }
  client ??= new OpenAI({ maxRetries: 0, timeout: 120_000 });
  return client;
}

export type LlmErrorKind = "missing_key" | "auth" | "rate_limit" | "model" | "invalid_output" | "unavailable";

// An LLM failure with a message the analyst can act on.
export class LlmError extends Error {
  constructor(
    readonly kind: LlmErrorKind,
    readonly userMessage: string,
    readonly detail?: string,
  ) {
    super(userMessage);
    this.name = "LlmError";
  }
}

export function toLlmError(e: unknown): LlmError {
  if (e instanceof LlmError) return e;
  if (e instanceof OpenAI.APIError) {
    // e.message already starts with the status code.
    const detail = e.message;
    if (e.status === 401 || e.status === 403) {
      return new LlmError("auth", "The OpenAI API key was rejected. Ask an admin to check OPENAI_API_KEY.", detail);
    }
    if (e.status === 429) {
      return new LlmError("rate_limit", "OpenAI's rate limit or quota was reached. Try again in a minute.", detail);
    }
    if (e.status === 404 || e.status === 400) {
      return new LlmError("model", "The model request was rejected. Ask an admin to check the fund's model setting.", detail);
    }
    return new LlmError("unavailable", "The model service is unavailable right now. Try again shortly.", detail);
  }
  const detail = e instanceof Error ? e.message : String(e);
  return new LlmError("unavailable", "Couldn't reach the model service. Try again shortly.", detail);
}

// Transient failures may be retried within the attempt budget; client errors may not.
export function isRetryable(e: LlmError): boolean {
  return e.kind === "invalid_output" || e.kind === "unavailable";
}
