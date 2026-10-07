import * as z from "zod";
import { excerptFound } from "@/lib/excerpt";
import { MAX_ANSWER_LENGTH, NOT_STATED } from "@/lib/evaluation-shared";
import type { PromptDef } from "../types";

// P1a Quick Screen answers from materials (decision 34). Drafts an answer to
// each Quick Screen question from the uploaded documents only, with verbatim
// excerpts; the analyst reviews them before P1 writes the memo.

export type P1aInput = {
  company: { name: string; stage: string; sector: string };
  questions: { ref: string; label: string; question: string }[];
  // `text` is what the model sees (possibly truncated); `fullText` is used to
  // check excerpts.
  documents: { ref: string; filename: string; text: string; fullText: string; truncated: boolean }[];
};

export const MAX_EXCERPT_LENGTH = 300;

// Question and document references as listed ("Q1", "D1"). Models sometimes
// add punctuation ("Q1."), which is not a different reference.
export const normalizeRef = (ref: string) => ref.trim().replace(/[\s.:;,)]+$/, "");

type Citation = { document: string; excerpt: string };

// Why a citation can't be used, or null when it is a verbatim excerpt of an
// uploaded document within the length limit.
export function citationProblem(docs: Map<string, { fullText: string }>, question: string, c: Citation): string | null {
  const ref = normalizeRef(c.document);
  const doc = docs.get(ref);
  if (!doc) return `${question}: unknown document ${c.document}`;
  if (c.excerpt.trim().length > MAX_EXCERPT_LENGTH) {
    return `${question}: an excerpt is ${c.excerpt.trim().length} characters (max ${MAX_EXCERPT_LENGTH}); quote a shorter part of it: "${c.excerpt.slice(0, 60)}…"`;
  }
  if (!excerptFound(doc.fullText, c.excerpt)) {
    return `${question}: excerpt not found verbatim in ${ref} (copy one contiguous passage, don't join separate lines): "${c.excerpt.slice(0, 80)}"`;
  }
  return null;
}

// The citations that can be stored. An answer keeps its valid citations; an
// over-long or non-verbatim extra is dropped rather than failing the call.
export function usableCitations(docs: Map<string, { fullText: string }>, question: string, citations: Citation[]) {
  return citations
    .filter((c) => citationProblem(docs, question, c) === null)
    .map((c) => ({ document: normalizeRef(c.document), excerpt: c.excerpt }));
}

const schema = z.object({
  answers: z.array(
    z.object({
      question: z.string().describe("The question reference exactly as listed, e.g. Q1 (no trailing period)."),
      found: z.boolean().describe("false if the materials do not answer the question."),
      answer: z.string().describe(`One or two sentences, at most ${MAX_ANSWER_LENGTH} characters.`),
      citations: z
        .array(
          z.object({
            document: z.string().describe("The document reference exactly as listed, e.g. D1."),
            excerpt: z.string().describe(`A verbatim quote from that document, copied exactly: one sentence or bullet, at most ${MAX_EXCERPT_LENGTH} characters.`),
          }),
        )
        .describe("1 to 3 supporting excerpts when found; empty when not found."),
    }),
  ),
});

export type P1aOutput = z.infer<typeof schema>;

export const P1A: PromptDef<P1aInput, typeof schema> = {
  key: "P1a",
  version: "3",
  name: "quick_screen_answers",
  system: [
    "You answer a venture fund's Quick Screen questions using only the deal materials provided.",
    "For each question, write a one- or two-sentence answer grounded strictly in the documents and cite 1 to 3 excerpts that support it.",
    `Each excerpt must be copied verbatim from the cited document, character for character. Quote the shortest passage that supports the answer: one sentence, bullet or line, never more than ${MAX_EXCERPT_LENGTH} characters. Slide decks often put each phrase on its own line; quote one line rather than joining several. Do not paraphrase inside an excerpt and do not join text from different places with semicolons or ellipses.`,
    "If the materials only partly answer a question, answer with what they do state and say briefly what is missing; that still counts as found.",
    `Only if the materials contain nothing relevant to a question, set found to false, write "${NOT_STATED}" as the answer and give no citations. Do not use outside knowledge and do not guess beyond the documents.`,
    'Answer every question exactly once, using its reference exactly as listed (for example "Q1", without a period). Write answers in English; keep excerpts in the document\'s original language.',
  ].join("\n"),
  user: ({ company, questions, documents }) =>
    [
      `Company: ${company.name}`,
      `Stage: ${company.stage || "not given"}`,
      `Sector: ${company.sector || "not given"}`,
      "",
      "Questions:",
      ...questions.map((q) => `${q.ref} (${q.label}): ${q.question}`),
      "",
      "Documents:",
      ...documents.map(
        (d) =>
          `=== ${d.ref}: ${d.filename}${d.truncated ? " (truncated: only the beginning is shown)" : ""} ===\n${d.text}\n=== end of ${d.ref} ===`,
      ),
    ].join("\n"),
  schema,
  validate: (o, input) => {
    const errors: string[] = [];
    const docs = new Map(input.documents.map((d) => [d.ref, d]));
    const seen = new Set<string>();

    for (const a of o.answers) {
      const ref = normalizeRef(a.question);
      if (!input.questions.some((q) => q.ref === ref)) {
        errors.push(`unknown question ${a.question}`);
        continue;
      }
      if (seen.has(ref)) errors.push(`${ref} answered twice`);
      seen.add(ref);

      if (!a.found) {
        if (a.citations.length) errors.push(`${ref}: not found, so it must have no citations`);
        continue;
      }
      if (!a.answer.trim()) errors.push(`${ref}: answer is empty`);
      if (a.answer.length > MAX_ANSWER_LENGTH) errors.push(`${ref}: answer longer than ${MAX_ANSWER_LENGTH} characters`);
      if (a.citations.length < 1 || a.citations.length > 3) errors.push(`${ref}: give 1 to 3 citations`);
      // Invalid extras are dropped (usableCitations); only an answer left
      // without any usable excerpt is a violation that needs a retry.
      if (a.citations.length && usableCitations(docs, ref, a.citations).length === 0) {
        for (const c of a.citations) {
          const problem = citationProblem(docs, ref, c);
          if (problem) errors.push(problem);
        }
      }
    }
    for (const q of input.questions) if (!seen.has(q.ref)) errors.push(`${q.ref} not answered`);
    return errors;
  },
};

// Shares the context budget across documents: short ones are kept whole, the
// rest are cut to an equal share of what is left.
export function fitDocuments<T extends { text: string }>(docs: T[], budget: number): (T & { shown: string; truncated: boolean })[] {
  const order = docs.map((d, i) => ({ i, len: d.text.length })).sort((a, b) => a.len - b.len);
  const share = new Array<number>(docs.length);
  let remaining = budget;
  order.forEach(({ i, len }, k) => {
    const fair = Math.floor(remaining / (order.length - k));
    share[i] = Math.min(len, fair);
    remaining -= share[i];
  });
  return docs.map((d, i) => ({ ...d, shown: d.text.slice(0, share[i]), truncated: share[i] < d.text.length }));
}
