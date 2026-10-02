import * as z from "zod";
import { NOT_STATED } from "@/lib/evaluation-shared";
import type { PromptDef } from "../types";

// P1 Quick Screen memo (data_flow.html §04). The verdict is chosen by the
// model from the analyst's answers and the fund's criteria (decision 13).

export type P1Input = {
  company: { name: string; stage: string; sector: string };
  criteria: { pass: string; watch: string; proceed: string };
  answers: { label: string; question: string; answer: string }[];
};

const schema = z.object({
  thesis: z.string().describe("One preliminary thesis sentence."),
  verdict: z.enum(["proceed", "watch", "pass"]),
  justification: z.string().describe("One sentence justifying the verdict against the fund's criteria."),
  uncertainties: z
    .array(z.string())
    .describe("Exactly two uncertainties most likely to change the verdict, most decisive first."),
  reopen_condition: z
    .string()
    .nullable()
    .describe("Pass only: one concrete condition under which the case would be re-opened. Otherwise null."),
  gating_variable: z
    .string()
    .nullable()
    .describe("Watch only: the external gating variable constraining progress. Otherwise null."),
  reeval_trigger: z
    .string()
    .nullable()
    .describe("Watch only: the event- or time-based trigger for re-evaluation. Otherwise null."),
});

export type P1Output = z.infer<typeof schema>;

const filled = (s: string | null | undefined) => !!s && s.trim().length > 0;

export const P1: PromptDef<P1Input, typeof schema> = {
  key: "P1",
  version: "2",
  name: "quick_screen_memo",
  system: [
    "You are a VC screening assistant.",
    "From the analyst's answers, state one preliminary thesis sentence, classify Proceed/Watch/Pass strictly by the fund's criteria, justify in one sentence, and name the two uncertainties most likely to change the verdict.",
    "Do not add facts not present in the answers.",
    `An answer reading "${NOT_STATED}" means the deal materials did not cover that question: treat it as open, and consider it for the two uncertainties.`,
    "For Pass, give one concrete condition under which the case would be re-opened (e.g. a de-risking milestone or market trigger). For Watch, name the gating variable and an event- or time-based re-evaluation trigger. Leave the fields that don't apply to the verdict null.",
    "Write in English, whatever the language of the answers.",
  ].join("\n"),
  user: ({ company, criteria, answers }) =>
    [
      `Company: ${company.name}`,
      `Stage: ${company.stage || "not given"}`,
      `Sector: ${company.sector || "not given"}`,
      "",
      "Fund criteria:",
      `- Pass: ${criteria.pass}`,
      `- Watch: ${criteria.watch}`,
      `- Proceed: ${criteria.proceed}`,
      "",
      "Quick Screen answers:",
      ...answers.map((a, i) => `${i + 1}. ${a.label}: ${a.question}\n   Answer: ${a.answer}`),
    ].join("\n"),
  schema,
  validate: (o) => {
    const errors: string[] = [];
    if (!filled(o.thesis)) errors.push("thesis is empty");
    if (!filled(o.justification)) errors.push("justification is empty");
    if (o.uncertainties.length !== 2 || !o.uncertainties.every(filled)) {
      errors.push(`uncertainties must be exactly two non-empty items (got ${o.uncertainties.length})`);
    }
    if (o.verdict === "pass" && !filled(o.reopen_condition)) errors.push("a Pass needs a reopen_condition");
    if (o.verdict === "watch" && (!filled(o.gating_variable) || !filled(o.reeval_trigger))) {
      errors.push("a Watch needs a gating_variable and a reeval_trigger");
    }
    return errors;
  },
};
