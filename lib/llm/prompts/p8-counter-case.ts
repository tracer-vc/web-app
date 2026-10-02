import * as z from "zod";
import type { PromptDef } from "../types";
import { formatClaimTable, unknownIds, type PromptClaim } from "./claim-table";

// P8 Counter-case arguments (data_flow.html §04): answer each Counter-Case
// Prompt, then the three strongest arguments against investing, ranked
// (decision 18: rank 1 is the strongest and becomes the failure case), each
// resting on claims from the table.

export type P8Input = {
  company: string;
  thesis: string; // preliminary thesis from the Quick Screen
  prompts: { ref: string; prompt: string }[]; // Counter-Case Prompts, ref "K1"…
  claims: PromptClaim[];
};

const schema = z.object({
  prompt_answers: z.array(
    z.object({
      prompt_ref: z.string().describe("Counter-Case Prompt reference, e.g. K1."),
      answer: z.string().describe("A short answer to the prompt for this company."),
    }),
  ),
  arguments: z
    .array(
      z.object({
        prompt_ref: z.string().nullable().describe("The Counter-Case Prompt this argument answers, or null."),
        argument: z.string().describe("The argument against investing, in one or two sentences."),
        mechanism: z.string().describe("How it would stop the company from reaching the outlier outcome."),
        claim_ids: z.array(z.string()).describe("C# of the claims it rests on, e.g. C4."),
      }),
    )
    .describe("Exactly three, strongest first."),
});

export type P8Output = z.infer<typeof schema>;

export const P8: PromptDef<P8Input, typeof schema> = {
  key: "P8",
  version: "1",
  name: "counter_case",
  system: [
    "Attack the investment case. Answer each Counter-Case Prompt, then return the three strongest arguments against investing, each with its mechanism and the claim IDs it rests on. Use only claim IDs from the table provided.",
    "Rank them: the first is the strongest, the one most likely to stop the company from reaching the outlier outcome. Each argument is specific to this company, not a generic startup risk, and names a concrete mechanism.",
    "Cite at least one claim per argument. An argument may rest on what the claims leave open or on low-confidence or speculative claims; say so in the argument instead of overstating the evidence. Write in English.",
  ].join("\n"),
  user: ({ company, thesis, prompts, claims }) =>
    [
      `Company under evaluation: ${company}`,
      `Preliminary thesis: ${thesis || "(none recorded)"}`,
      "",
      "Counter-Case Prompts:",
      ...prompts.map((p) => `${p.ref}. ${p.prompt}`),
      "",
      "Claim Table:",
      formatClaimTable(claims),
    ].join("\n"),
  schema,
  validate: (o, input) => {
    const errors: string[] = [];
    const refs = new Set(input.prompts.map((p) => p.ref));
    const codes = new Set(input.claims.map((c) => c.code));
    if (o.arguments.length !== 3) errors.push(`give exactly three arguments (got ${o.arguments.length})`);
    const answered = new Set(o.prompt_answers.map((a) => a.prompt_ref));
    for (const p of input.prompts) if (!answered.has(p.ref)) errors.push(`answer Counter-Case Prompt ${p.ref}`);
    for (const a of o.prompt_answers) if (!refs.has(a.prompt_ref)) errors.push(`unknown Counter-Case Prompt ${a.prompt_ref}`);
    o.arguments.forEach((a, i) => {
      const where = `argument ${i + 1}`;
      if (!a.argument.trim()) errors.push(`${where}: argument is empty`);
      if (!a.mechanism.trim()) errors.push(`${where}: mechanism is empty`);
      if (a.prompt_ref !== null && !refs.has(a.prompt_ref)) errors.push(`${where}: unknown Counter-Case Prompt ${a.prompt_ref}`);
      if (a.claim_ids.length === 0) errors.push(`${where}: cite at least one claim`);
      errors.push(...unknownIds(a.claim_ids, codes, "claim", where));
    });
    return errors;
  },
};
