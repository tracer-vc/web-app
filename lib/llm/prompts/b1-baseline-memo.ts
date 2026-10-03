import * as z from "zod";
import type { ScoreAnchors } from "@/lib/config-shared";
import type { PromptDef } from "../types";

// B1 Baseline memo (Study 2, decision 27): the same LLM, corpus and fund
// config as the artifact, asked for a cited screening memo under the same
// headings as the Thesis Card and Decision Snapshot, but without the claim
// layer, sufficiency rule, conflict register or rule-based classification.
// Citations are corpus document numbers [n].

export type B1Input = {
  company: { name: string; stage: string; sector: string };
  quickScreen: { thesis: string; verdict: string; uncertainties: string[] };
  dimensions: { title: string; question: string; prompts: string[] }[];
  anchors: ScoreAnchors;
  outcomes: { outcome: "proceed" | "watch" | "pass"; note: string }[];
  corpus: { n: number; title: string; origin: string; text: string; truncated: boolean }[];
};

const item = z.object({
  text: z.string().describe("1–2 sentences."),
  refs: z.array(z.number().int()).describe("Corpus document numbers it rests on, e.g. [1, 3]."),
});
const scenario = item.extend({ detail: z.string().describe("Gating variables, or the dominant failure mode.") });

const schema = z.object({
  thesis: item,
  outlier: item,
  base_case: scenario,
  upside_case: scenario,
  failure_case: scenario,
  moat: item,
  entry_wedge: item,
  milestones: z.array(item).describe("2–3 de-risking milestones."),
  falsifiers: z.array(item).describe("2–4 observable conditions that would reject or materially revise the thesis."),
  dimension_scores: z.array(
    z.object({
      dimension: z.string().describe("The dimension title as given."),
      score: z.number().int().describe("0–5 per the anchors."),
      counter_signal: z.string().describe("The strongest counter-signal."),
      refs: z.array(z.number().int()),
    }),
  ),
  open_questions: z.array(item).describe("Decision-critical open questions."),
  recommendation: z.enum(["proceed", "watch", "pass"]),
  justification: item,
  supporting_arguments: z.array(item).describe("The three strongest arguments for the outlier case."),
  risks: z.array(item).describe("The three primary risks, strongest first."),
  research_agenda: z.array(item.extend({ evidence: z.string().describe("The evidence that would resolve it.") })).describe("3–7 questions."),
  reeval_trigger: item,
});

export type B1Output = z.infer<typeof schema>;

export const B1: PromptDef<B1Input, typeof schema> = {
  key: "B1",
  version: "1",
  name: "baseline_memo",
  system: [
    "You are a venture analyst. Write an investment screening memo on the company from the documents provided, for the fund whose evaluation frame is given.",
    "Fill every section: one-sentence thesis, outlier scenario, base/upside/failure case (each with its gating variables or dominant failure mode), moat hypothesis, entry wedge, 2–3 de-risking milestones, 2–4 falsifiers, a 0–5 score per dimension with its strongest counter-signal, decision-critical open questions, a Proceed / Watch / Pass recommendation with a 1–2 sentence justification, three supporting arguments, three primary risks, a 3–7 item research agenda with the evidence that would resolve each, and a re-evaluation trigger.",
    "Keep each item to 1–2 concise sentences (about 40 words at most). Cite the documents each item rests on by their numbers in `refs`; use only the documents provided and no outside knowledge. Write in English.",
  ].join("\n"),
  user: (i) =>
    [
      `Company: ${i.company.name} · Stage: ${i.company.stage || "not given"} · Sector: ${i.company.sector || "not given"}`,
      `Quick Screen: ${i.quickScreen.verdict} — preliminary thesis: ${i.quickScreen.thesis}`,
      `Critical uncertainties from the Quick Screen: ${i.quickScreen.uncertainties.join(" | ")}`,
      "",
      "Evaluation dimensions:",
      ...i.dimensions.map((d) => `- ${d.title}: ${d.question}${d.prompts.length ? ` (${d.prompts.join(" / ")})` : ""}`),
      "",
      "Score anchors:",
      ...Object.entries(i.anchors).map(([k, v]) => `${k}: ${v}`),
      "",
      "Outcomes:",
      ...i.outcomes.map((o) => `- ${o.outcome}: ${o.note}`),
      "",
      "Documents:",
      ...i.corpus.map((d) => `=== [${d.n}] ${d.title} (${d.origin})${d.truncated ? " (truncated)" : ""} ===\n${d.text}\n=== end of [${d.n}] ===`),
    ].join("\n"),
  schema,
  validate: (o, i) => {
    const errors: string[] = [];
    const known = new Set(i.corpus.map((d) => d.n));
    const check = (refs: number[], where: string) => {
      for (const r of refs) if (!known.has(r)) errors.push(`${where}: unknown document [${r}]`);
    };
    const items: [string, { text: string; refs: number[] }][] = [
      ["thesis", o.thesis],
      ["outlier", o.outlier],
      ["base_case", o.base_case],
      ["upside_case", o.upside_case],
      ["failure_case", o.failure_case],
      ["moat", o.moat],
      ["entry_wedge", o.entry_wedge],
      ["justification", o.justification],
      ["reeval_trigger", o.reeval_trigger],
      ...o.milestones.map((m, n) => [`milestone ${n + 1}`, m] as [string, { text: string; refs: number[] }]),
      ...o.falsifiers.map((m, n) => [`falsifier ${n + 1}`, m] as [string, { text: string; refs: number[] }]),
      ...o.open_questions.map((m, n) => [`open question ${n + 1}`, m] as [string, { text: string; refs: number[] }]),
      ...o.supporting_arguments.map((m, n) => [`supporting ${n + 1}`, m] as [string, { text: string; refs: number[] }]),
      ...o.risks.map((m, n) => [`risk ${n + 1}`, m] as [string, { text: string; refs: number[] }]),
      ...o.research_agenda.map((m, n) => [`research ${n + 1}`, m] as [string, { text: string; refs: number[] }]),
    ];
    for (const [where, it] of items) {
      if (!it.text.trim()) errors.push(`${where}: text is empty`);
      check(it.refs, where);
    }
    for (const d of o.dimension_scores) check(d.refs, d.dimension);
    const counts: [string, number, number, number][] = [
      ["milestones", o.milestones.length, 2, 3],
      ["falsifiers", o.falsifiers.length, 2, 4],
      ["supporting arguments", o.supporting_arguments.length, 3, 3],
      ["risks", o.risks.length, 3, 3],
      ["research agenda items", o.research_agenda.length, 3, 7],
    ];
    for (const [what, n, min, max] of counts) if (n < min || n > max) errors.push(`give ${min === max ? min : `${min}–${max}`} ${what} (got ${n})`);
    const titles = i.dimensions.map((d) => d.title);
    for (const t of titles) {
      const n = o.dimension_scores.filter((d) => d.dimension.trim() === t).length;
      if (n !== 1) errors.push(`score dimension "${t}" exactly once (got ${n})`);
    }
    for (const d of o.dimension_scores) if (d.score < 0 || d.score > 5) errors.push(`${d.dimension}: score must be 0–5`);
    return errors;
  },
};
