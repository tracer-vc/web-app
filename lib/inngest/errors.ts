import "server-only";

import { LlmError } from "@/lib/llm/client";

// LLM failures that stop the whole run (configuration problems); anything
// else becomes a warning on the item (decision 25).
export const isFatal = (e: unknown) =>
  e instanceof LlmError && (e.kind === "auth" || e.kind === "missing_key" || e.kind === "model");

export const describe = (e: unknown) =>
  e instanceof LlmError ? (e.detail ?? e.userMessage) : e instanceof Error ? e.message : String(e);
