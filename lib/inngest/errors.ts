import "server-only";

import { NonRetriableError } from "inngest";
import { callLlm } from "@/lib/llm/call";
import { LlmError } from "@/lib/llm/client";

// LLM failures that stop the whole run (configuration problems: missing or
// rejected key, rejected model); anything else becomes a warning on the item
// (decision 25).
export const isFatal = (e: unknown) =>
  e instanceof NonRetriableError ||
  (e instanceof LlmError && (e.kind === "auth" || e.kind === "missing_key" || e.kind === "model"));

export const describe = (e: unknown) =>
  e instanceof LlmError ? (e.detail ?? e.userMessage) : e instanceof Error ? e.message : String(e);

// callLlm for background workers: a configuration problem fails the run at
// once with the readable message (Inngest won't retry it with back-off).
export const callLlmStep: typeof callLlm = async (prompt, input, ctx) => {
  try {
    return await callLlm(prompt, input, ctx);
  } catch (e) {
    if (e instanceof LlmError && isFatal(e)) throw new NonRetriableError(e.userMessage, { cause: e });
    throw e;
  }
};
