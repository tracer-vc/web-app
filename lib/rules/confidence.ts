// R1 confidence (decision 9): a pure function of the claim's evidence links
// and the fund's confidence rules. Computed by code, never chosen by the
// model, and explained so a reader can recompute the label.
//
// No runtime imports, so `node --test` can load it directly.
import type { ConfidenceRules, Tier } from "@/lib/config-shared";

export type Level = "high" | "medium" | "low";

export type EvidenceSource = { code: string; tier: Tier; party: string };

export type ConfidenceBasis = {
  rule: string; // e.g. "Medium: one Primary party (Nordwind)"
  base_level: Level;
  downgraded: boolean;
  parties: { party: string; tiers: Tier[]; sources: string[] }[];
};

const LEVEL_LABEL: Record<Level, string> = { high: "High", medium: "Medium", low: "Low" };
const TIER_LABEL: Record<Tier, string> = { primary: "Primary", secondary: "Secondary", tertiary: "Tertiary" };
const TIER_ORDER: Tier[] = ["primary", "secondary", "tertiary"];

// Sources with the same authoring party count as one independent party.
const partyKey = (party: string) => party.trim().replace(/\s+/g, " ").toLowerCase();

export function groupParties(sources: EvidenceSource[]): ConfidenceBasis["parties"] {
  const byParty = new Map<string, ConfidenceBasis["parties"][number]>();
  for (const s of sources) {
    const key = partyKey(s.party);
    const entry = byParty.get(key) ?? { party: s.party.trim(), tiers: [], sources: [] };
    if (!entry.tiers.includes(s.tier)) entry.tiers.push(s.tier);
    if (!entry.sources.includes(s.code)) entry.sources.push(s.code);
    byParty.set(key, entry);
  }
  return [...byParty.values()].map((p) => ({ ...p, tiers: TIER_ORDER.filter((t) => p.tiers.includes(t)) }));
}

// Levels are evaluated best to worst, first match wins; the last level is the
// floor. A claim in an open conflict drops `open_conflict_downgrade` levels.
export function computeConfidence(
  rules: ConfidenceRules,
  sources: EvidenceSource[],
  inOpenConflict: boolean,
): { level: Level; basis: ConfidenceBasis } {
  const parties = groupParties(sources);
  const levels = rules.levels;
  let index = levels.findIndex((l) => {
    if (parties.length < (l.min_parties ?? 1)) return false;
    const inTiers = l.min_parties_in_tiers;
    if (!inTiers) return true;
    return parties.filter((p) => p.tiers.some((t) => inTiers.tiers.includes(t))).length >= inTiers.min;
  });
  if (index < 0) index = levels.length - 1;
  const base = levels[index].level;
  const finalIndex = inOpenConflict ? Math.min(levels.length - 1, index + rules.open_conflict_downgrade) : index;
  const level = levels[finalIndex].level;

  const describe = (p: (typeof parties)[number]) => `${p.party} (${p.tiers.map((t) => TIER_LABEL[t]).join("/")})`;
  const evidence =
    parties.length === 0
      ? "no source"
      : parties.length === 1
        ? `one ${parties[0].tiers.map((t) => TIER_LABEL[t]).join("/")} party (${parties[0].party})`
        : `${parties.length} independent parties: ${parties.map(describe).join(", ")}`;
  let rule = `${LEVEL_LABEL[base]}: ${evidence}`;
  if (finalIndex !== index) rule += ` → ${LEVEL_LABEL[level]}: in an open conflict`;

  return { level, basis: { rule, base_level: base, downgraded: finalIndex !== index, parties } };
}
