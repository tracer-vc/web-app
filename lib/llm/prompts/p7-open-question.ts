import * as z from "zod";
import type { PromptDef } from "../types";

// P7 Uncovered prompt → open question (data_flow.html §04). R2 decides in code
// which required prompts are uncovered; P7 only phrases the uncertainty.
// Decision 38: it also states whether resolving it could change the
// recommendation and the minimum evidence that would resolve it.

export type P7Input = {
  company: string;
  prompt: { ref: string; question: string };
  nearest: string[]; // statements of the closest claims, for context
};

const schema = z.object({
  question: z.string().describe("A specific open question about this company."),
  why_unresolved: z.string().describe("One sentence on why the current sources cannot answer it."),
  decision_critical: z.boolean().describe("Whether resolving it could change Proceed / Watch / Pass."),
  min_evidence_to_resolve: z.string().describe("The minimum evidence that would resolve it."),
});

export const P7: PromptDef<P7Input, typeof schema> = {
  key: "P7",
  version: "1",
  name: "open_question",
  system: [
    "This Collection Prompt has no answering claim. Phrase it as a specific open question about this company and state in one sentence why the current sources cannot answer it.",
    "Also say whether resolving it could change a Proceed / Watch / Pass recommendation, and name the minimum evidence that would resolve it (a concrete document, data point or check).",
    "Use only the claims shown; do not answer the question from outside knowledge. Write in English.",
  ].join("\n"),
  user: ({ company, prompt, nearest }) =>
    [
      `Company under evaluation: ${company}`,
      `Uncovered Collection Prompt ${prompt.ref}: ${prompt.question}`,
      "",
      "Closest claims in the Claim Table:",
      ...(nearest.length ? nearest.map((s) => `- ${s}`) : ["(none)"]),
    ].join("\n"),
  schema,
  validate: (o) => {
    const errors: string[] = [];
    if (!o.question.trim().endsWith("?")) errors.push("question must be a question ending with '?'");
    if (o.question.length > 300) errors.push("question longer than 300 characters");
    if (!o.why_unresolved.trim()) errors.push("why_unresolved is empty");
    if (o.why_unresolved.length > 400) errors.push("why_unresolved longer than 400 characters");
    if (!o.min_evidence_to_resolve.trim()) errors.push("min_evidence_to_resolve is empty");
    return errors;
  },
};
