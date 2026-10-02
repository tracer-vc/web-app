import * as z from "zod";
import type { PromptDef } from "../types";
import { formatClaimTable, unknownIds, type PromptClaim } from "./claim-table";

// P10 Falsification criteria (data_flow.html §04): 2–4 observable conditions
// that reject or materially revise the thesis, each citing ≥1 claim (decision
// 11) and the uncertainties it tests.

export type P10Input = {
  company: string;
  thesis: string;
  counterArguments: { rank: number; argument: string; claimIds: string[] }[];
  uncertainties: { code: string; question: string; decisionCritical: boolean }[];
  claims: PromptClaim[];
};

const schema = z.object({
  falsifiers: z.array(
    z.object({
      criterion: z.string().describe("An observable condition under which the thesis should be dropped or materially revised."),
      outcome_check: z.string().describe("How and by when it is checked, with numbers and a timeframe."),
      claim_ids: z.array(z.string()).describe("C# of the claims it tests (at least one)."),
      uncertainty_ids: z.array(z.string()).describe("U# of the uncertainties it tests (may be empty)."),
    }),
  ),
});

export const P10: PromptDef<P10Input, typeof schema> = {
  key: "P10",
  version: "1",
  name: "falsifiers",
  system: [
    "Write 2–4 observable conditions under which the thesis should be dropped or materially revised. Each needs a concrete outcome check (numbers, timeframe) and links to the claims and uncertainties it tests.",
    "Base them on the strongest counter-case arguments and the decision-critical uncertainties. A criterion is defined in advance and can be observed by a third party; avoid vague wording such as \"traction stalls\".",
    "Use only claim IDs and uncertainty IDs from the lists provided; cite at least one claim per falsifier. Write in English.",
  ].join("\n"),
  user: (i) =>
    [
      `Company under evaluation: ${i.company}`,
      `Thesis: ${i.thesis || "(none recorded)"}`,
      "",
      "Counter-case arguments (strongest first):",
      ...i.counterArguments.map((a) => `${a.rank}. ${a.argument} [${a.claimIds.join(", ")}]`),
      "",
      "Uncertainty List:",
      ...i.uncertainties.map((u) => `${u.code}${u.decisionCritical ? " (decision-critical)" : ""}: ${u.question}`),
      "",
      "Claim Table:",
      formatClaimTable(i.claims),
    ].join("\n"),
  schema,
  validate: (o, input) => {
    const errors: string[] = [];
    if (o.falsifiers.length < 2 || o.falsifiers.length > 4) errors.push(`give 2 to 4 falsifiers (got ${o.falsifiers.length})`);
    const claims = new Set(input.claims.map((c) => c.code));
    const uncertainties = new Set(input.uncertainties.map((u) => u.code));
    o.falsifiers.forEach((f, i) => {
      const where = `falsifier ${i + 1}`;
      if (!f.criterion.trim()) errors.push(`${where}: criterion is empty`);
      if (!f.outcome_check.trim()) errors.push(`${where}: outcome_check is empty`);
      else if (!/\d/.test(f.criterion + f.outcome_check)) errors.push(`${where}: give a number or date in the criterion or outcome check`);
      if (f.claim_ids.length === 0) errors.push(`${where}: cite at least one claim`);
      errors.push(...unknownIds(f.claim_ids, claims, "claim", where));
      errors.push(...unknownIds(f.uncertainty_ids, uncertainties, "uncertainty", where));
    });
    return errors;
  },
};
