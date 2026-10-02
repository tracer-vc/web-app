import * as z from "zod";
import { formatClaimTable, type PromptClaim } from "./claim-table";

// Shared by P12 (Thesis Card) and P13 (Decision Snapshot): a cited item, its
// validation (decision 11; source IDs only next to a claim that cites them)
// and the evaluation context both prompts read.

export const MAX_ITEM_LENGTH = 450; // 1–2 sentences

export const itemSchema = z.object({
  text: z.string().describe("1–2 sentences, without any IDs in the text."),
  claim_ids: z.array(z.string()).describe("C# the statement rests on."),
  source_ids: z.array(z.string()).describe("S# cited by those claims, if worth naming."),
  uncertainty_ids: z.array(z.string()).describe("U# it refers to."),
  falsifier_ids: z.array(z.string()).describe("F# it refers to."),
});
export type Item = z.infer<typeof itemSchema>;

export type SynthesisContext = {
  company: { name: string; stage: string; sector: string };
  preliminaryThesis: string;
  claims: (PromptClaim & { id?: string })[];
  counterArguments: { rank: number; argument: string; mechanism: string; claimIds: string[] }[];
  uncertainties: { code: string; question: string; decisionCritical: boolean; minEvidence: string | null }[];
  falsifiers: { code: string; criterion: string; outcomeCheck: string }[];
  dimensions: { code: string; title: string; score: number; counterSignal: string; cappedBy: string | null }[];
  openConflicts: { code: string; description: string }[];
};

export function formatContext(c: SynthesisContext): string {
  return [
    `Company: ${c.company.name} · Stage: ${c.company.stage || "not given"} · Sector: ${c.company.sector || "not given"}`,
    `Preliminary thesis (Quick Screen): ${c.preliminaryThesis || "(none)"}`,
    "",
    "Dimension scores:",
    ...c.dimensions.map(
      (d) => `${d.code} ${d.title}: ${d.score}/5${d.cappedBy ? ` (capped by ${d.cappedBy})` : ""} — strongest counter-signal: ${d.counterSignal}`,
    ),
    "",
    "Counter-case arguments (strongest first):",
    ...c.counterArguments.map((a) => `${a.rank}. ${a.argument} Mechanism: ${a.mechanism} [${a.claimIds.join(", ")}]`),
    "",
    "Uncertainty List:",
    ...c.uncertainties.map(
      (u) => `${u.code}${u.decisionCritical ? " (decision-critical)" : ""}: ${u.question}${u.minEvidence ? ` Minimum evidence: ${u.minEvidence}` : ""}`,
    ),
    "",
    "Falsifiers:",
    ...c.falsifiers.map((f) => `${f.code}: ${f.criterion} Check: ${f.outcomeCheck}`),
    "",
    "Open conflicts:",
    ...(c.openConflicts.length ? c.openConflicts.map((x) => `${x.code}: ${x.description}`) : ["(none)"]),
    "",
    "Claim Table:",
    formatClaimTable(c.claims),
  ].join("\n");
}

const ID_IN_TEXT = /\b(?:C|S|U|F|D|CR)\d+\b/;

export type ItemLimits = { maxLength?: number; maxClaims?: number; maxRefs?: number };

// Rule checks for one item. `needs`: which reference kind is mandatory.
export function itemErrors(
  item: Item,
  c: SynthesisContext,
  where: string,
  needs: "claim" | "uncertainty" = "claim",
  limits: ItemLimits = {},
): string[] {
  const maxLength = limits.maxLength ?? MAX_ITEM_LENGTH;
  const errors: string[] = [];
  const claims = new Map(c.claims.map((x) => [x.code, x]));
  const uncertainties = new Set(c.uncertainties.map((u) => u.code));
  const falsifiers = new Set(c.falsifiers.map((f) => f.code));
  if (!item.text.trim()) errors.push(`${where}: text is empty`);
  else if (item.text.length > maxLength) {
    errors.push(`${where}: too long (${item.text.length} characters); keep it to 1–2 concise sentences, max ${maxLength}`);
  }
  if (limits.maxClaims && item.claim_ids.length > limits.maxClaims) {
    errors.push(`${where}: cite the ${limits.maxClaims} most relevant claims at most (got ${item.claim_ids.length})`);
  }
  const refs = item.claim_ids.length + item.source_ids.length + item.uncertainty_ids.length + item.falsifier_ids.length;
  if (limits.maxRefs && refs > limits.maxRefs) errors.push(`${where}: at most ${limits.maxRefs} IDs in total (got ${refs})`);
  const inText = [...item.text.matchAll(new RegExp(ID_IN_TEXT.source, "g"))].map((m) => m[0]);
  if (inText.some((id) => /^(D|CR)\d/.test(id))) {
    errors.push(`${where}: name dimensions and conflicts in words (e.g. "Monopoly Path & Moats scores 2/5"), not by ${inText.join(", ")}`);
  } else if (inText.length) {
    errors.push(`${where}: remove ${inText.join(", ")} from the text; list them in the ID lists only`);
  }
  if (needs === "claim" && item.claim_ids.length === 0) errors.push(`${where}: cite at least one claim`);
  if (needs === "uncertainty" && item.uncertainty_ids.length === 0) errors.push(`${where}: cite at least one uncertainty`);
  for (const id of item.claim_ids) if (!claims.has(id)) errors.push(`${where}: unknown claim ${id}`);
  for (const id of item.uncertainty_ids) if (!uncertainties.has(id)) errors.push(`${where}: unknown uncertainty ${id}`);
  for (const id of item.falsifier_ids) if (!falsifiers.has(id)) errors.push(`${where}: unknown falsifier ${id}`);
  const cited = new Set(item.claim_ids.flatMap((id) => claims.get(id)?.sources ?? []));
  for (const id of item.source_ids) {
    if (!cited.has(id)) errors.push(`${where}: source ${id} is not cited by any of the item's claims`);
  }
  return errors;
}
