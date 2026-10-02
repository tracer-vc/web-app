import * as z from "zod";
import type { PromptDef } from "../types";

// P3 Search queries (data_flow.html §04).

export type P3Input = {
  company: { name: string; stage: string; sector: string; website: string };
  prompts: { ref: string; question: string; covered: boolean }[];
  uncertainties: string[];
};

export const MAX_QUERIES = 8;

const schema = z.object({
  queries: z.array(
    z.object({
      q: z.string().describe("A web search query."),
      target_prompt: z.string().nullable().describe("The Collection Prompt reference it targets (e.g. P7), or null."),
    }),
  ),
});

export const P3: PromptDef<P3Input, typeof schema> = {
  key: "P3",
  version: "2",
  name: "search_queries",
  system: [
    `Propose up to ${MAX_QUERIES} web search queries that would find independent (Secondary) sources on the company, prioritising Collection Prompts not yet covered by uploads and the two critical uncertainties from the Quick Screen.`,
    `Every query must contain the company's full name in double quotes (e.g. "Acme Robotics") plus a term from its sector or product, so results about other things with a similar name are excluded. Prefer press, analyst and industry coverage over the company's own pages. Do not target social media.`,
  ].join("\n"),
  user: ({ company, prompts, uncertainties }) =>
    [
      `Company: ${company.name}`,
      `Stage: ${company.stage || "not given"} · Sector: ${company.sector || "not given"}${company.website ? ` · Website: ${company.website}` : ""}`,
      "",
      "Collection Prompts (coverage by the uploaded materials):",
      ...prompts.map((p) => `${p.ref}. [${p.covered ? "covered" : "NOT covered"}] ${p.question}`),
      "",
      "Critical uncertainties from the Quick Screen:",
      ...(uncertainties.length ? uncertainties.map((u, i) => `${i + 1}. ${u}`) : ["(none recorded)"]),
    ].join("\n"),
  schema,
  validate: (o, input) => {
    const errors: string[] = [];
    if (o.queries.length < 1 || o.queries.length > MAX_QUERIES) errors.push(`give 1 to ${MAX_QUERIES} queries (got ${o.queries.length})`);
    const refs = new Set(input.prompts.map((p) => p.ref));
    const quoted = `"${input.company.name.toLowerCase()}"`;
    for (const q of o.queries) {
      if (!q.q.trim()) errors.push("a query is empty");
      else if (!q.q.toLowerCase().includes(quoted)) errors.push(`query "${q.q}" must contain ${quoted} in double quotes`);
      if (q.target_prompt !== null && !refs.has(q.target_prompt)) errors.push(`unknown prompt reference ${q.target_prompt}`);
    }
    return errors;
  },
};
