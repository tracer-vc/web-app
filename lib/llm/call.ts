import "server-only";

import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type * as z from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";
import { LlmError, isRetryable, openai, toLlmError } from "./client";
import type { PromptDef } from "./types";

// Decision 25: each call retries up to 2 times on invalid JSON or a rule
// violation (3 attempts in total).
export const MAX_ATTEMPTS = 3;

// Models that reject `temperature` (reasoning models; decision 35). Others are
// learned on the first rejection and remembered for the process.
const noTemperature = new Set<string>(["gpt-6-luna"]);

export type LlmContext = {
  fundId: string;
  model: string;
  runId?: string | null;
  evaluationId?: string | null;
};

export type LlmResult<T> = { output: T; llmCallId: string; attempts: number };

// One structured-output call: JSON schema + temperature 0, zod validation,
// prompt rule checks, retries, and an llm_calls row per attempt.
export async function callLlm<Input, Schema extends z.ZodObject>(
  prompt: PromptDef<Input, Schema>,
  input: Input,
  ctx: LlmContext,
): Promise<LlmResult<z.infer<Schema>>> {
  const client = openai();
  const admin = createAdminClient();
  const userMessage = prompt.user(input);
  const format = zodTextFormat(prompt.schema, prompt.name);
  let lastError: LlmError | null = null;
  let lastRejected: z.infer<Schema> | undefined;
  // Rule violations of the previous attempt, shown to the model on the retry
  // so it can correct them (decision 25).
  let feedback: string | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const started = Date.now();
    let raw: string | null = null;
    let usage: { input_tokens?: number; output_tokens?: number } | undefined;
    let validationErrors: string[] = [];
    let output: z.infer<Schema> | null = null;
    let error: LlmError | null = null;
    const useTemperature = !noTemperature.has(ctx.model);

    try {
      const response = await requestWithTemperatureFallback(client, ctx.model, useTemperature, {
        model: ctx.model,
        input: [
          { role: "system", content: prompt.system },
          { role: "user", content: userMessage },
          ...(feedback ? [{ role: "user" as const, content: feedback }] : []),
        ],
        text: { format },
      });
      usage = response.usage ?? undefined;
      raw = response.output_text;

      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(raw);
      } catch {
        validationErrors = ["output is not valid JSON"];
      }
      if (parsedJson !== undefined) {
        const parsed = prompt.schema.safeParse(parsedJson);
        if (!parsed.success) {
          validationErrors = parsed.error.issues.map((i) => `${i.path.join(".") || "output"}: ${i.message}`);
        } else {
          validationErrors = prompt.validate?.(parsed.data, input) ?? [];
          if (validationErrors.length === 0) output = parsed.data;
          else lastRejected = parsed.data;
        }
      }
      if (validationErrors.length > 0) {
        error = new LlmError(
          "invalid_output",
          "The model's answer didn't meet the required format after several tries. Try again.",
          validationErrors.join("; "),
        );
      }
    } catch (e) {
      error = toLlmError(e);
    }

    const { data: row, error: logError } = await admin
      .from("llm_calls")
      .insert({
        fund_id: ctx.fundId,
        run_id: ctx.runId ?? null,
        evaluation_id: ctx.evaluationId ?? null,
        prompt_key: prompt.key,
        prompt_version: prompt.version,
        model: ctx.model,
        attempt,
        input: {
          system: prompt.system,
          user: userMessage,
          feedback,
          temperature: noTemperature.has(ctx.model) ? null : 0,
        } as Json,
        output: raw === null ? null : (tryJson(raw) as Json),
        validation_errors: validationErrors.length ? (validationErrors as Json) : null,
        error: error && error.kind !== "invalid_output" ? (error.detail ?? error.message) : null,
        input_tokens: usage?.input_tokens ?? null,
        output_tokens: usage?.output_tokens ?? null,
        latency_ms: Date.now() - started,
      })
      .select("id")
      .single();
    // The audit trail is part of the contract: no logged call, no result.
    if (logError) throw new LlmError("unavailable", "Couldn't record the model call. Try again.", logError.message);

    if (output !== null) return { output, llmCallId: row.id, attempts: attempt };

    lastError = error;
    if (error && !isRetryable(error)) throw error;
    feedback = validationErrors.length
      ? [
          "Your previous answer was rejected for these reasons:",
          ...validationErrors.map((e) => `- ${e}`),
          "Return a complete, corrected answer.",
        ].join("\n")
      : null;
  }

  const failure = lastError ?? new LlmError("invalid_output", "The model's answer was unusable. Try again.");
  if (failure.kind === "invalid_output") failure.lastOutput = lastRejected;
  throw failure;
}

type CreateParams = Parameters<OpenAI["responses"]["create"]>[0];

async function requestWithTemperatureFallback(
  client: OpenAI,
  model: string,
  useTemperature: boolean,
  params: Omit<CreateParams, "stream">,
) {
  if (!useTemperature) return client.responses.create({ ...params, stream: false });
  try {
    return await client.responses.create({ ...params, temperature: 0, stream: false });
  } catch (e) {
    if (e instanceof OpenAI.APIError && e.status === 400 && /temperature/i.test(e.message)) {
      noTemperature.add(model);
      return client.responses.create({ ...params, stream: false });
    }
    throw e;
  }
}

function tryJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return { raw };
  }
}
