// R3 classification (decisions 12, 33): Proceed / Watch / Pass from the
// dimension scores and counts against the fund's criteria. Computed by code,
// never chosen by the model. Rules are evaluated Pass -> Watch -> Proceed,
// first match wins; Proceed is the fallback. The trace records every
// predicate with its actual value so a reader can recompute the outcome.
//
// No runtime imports, so `node --test` can load it directly.
import type { ClassificationCriteria, Op, Outcome, Predicate } from "@/lib/config-shared";

export type ClassificationFacts = {
  // the score that counts per dimension (an analyst override, else the capped score)
  dimensions: { code: string; title: string; score: number; disqualifyingBelow: number | null }[];
  openDecisionCriticalUncertainties: number;
  openConflicts: number;
};

export type PredicateTrace = {
  type: Predicate["type"];
  op: Op | null;
  value: number | null;
  actual: number | string[] | null; // number, or the disqualifying D# list
  result: boolean;
  text: string; // e.g. "lowest dimension score 2 <= 2 (D1 Team & Execution)"
};

export type RuleTrace = { outcome: Outcome; match: "any" | "all"; matched: boolean; predicates: PredicateTrace[] };

export type ClassificationTrace = {
  classification: Outcome;
  rule_applied: string;
  rules: RuleTrace[];
  facts: ClassificationFacts;
};

const ORDER: Outcome[] = ["pass", "watch", "proceed"];
const LABEL: Record<Outcome, string> = { pass: "Pass", watch: "Watch", proceed: "Proceed" };

const compare = (actual: number, op: Op, value: number) =>
  op === "<" ? actual < value : op === "<=" ? actual <= value : op === "=" ? actual === value : op === ">=" ? actual >= value : actual > value;

function evaluatePredicate(p: Predicate, f: ClassificationFacts): PredicateTrace {
  const scores = f.dimensions.map((d) => d.score);
  if (p.type === "any_dimension_disqualifying") {
    const hits = f.dimensions.filter((d) => d.disqualifyingBelow !== null && d.score < d.disqualifyingBelow);
    return {
      type: p.type,
      op: null,
      value: null,
      actual: hits.map((d) => d.code),
      result: hits.length > 0,
      text: hits.length
        ? `disqualifying: ${hits.map((d) => `${d.code} ${d.title} ${d.score} < ${d.disqualifyingBelow}`).join(", ")}`
        : "no dimension below its disqualifying threshold",
    };
  }
  let actual: number | null;
  let label: string;
  let suffix = "";
  if (p.type === "min_dimension_score") {
    actual = scores.length ? Math.min(...scores) : null;
    const lowest = f.dimensions.filter((d) => d.score === actual).map((d) => `${d.code} ${d.title}`);
    label = "lowest dimension score";
    if (lowest.length) suffix = ` (${lowest.join(", ")})`;
  } else if (p.type === "avg_dimension_score") {
    actual = scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100 : null;
    label = "average dimension score";
  } else if (p.type === "open_decision_critical_uncertainties") {
    actual = f.openDecisionCriticalUncertainties;
    label = "open decision-critical uncertainties";
  } else {
    actual = f.openConflicts;
    label = "open conflicts";
  }
  const result = actual !== null && compare(actual, p.op, p.value);
  return { type: p.type, op: p.op, value: p.value, actual, result, text: `${label} ${actual ?? "n/a"} ${p.op} ${p.value}${suffix}` };
}

export function classify(criteria: ClassificationCriteria, facts: ClassificationFacts): ClassificationTrace {
  const rules: RuleTrace[] = [];
  let fired: RuleTrace | null = null;
  for (const outcome of ORDER) {
    const rule = criteria.rules.find((r) => r.outcome === outcome);
    // Proceed carries no conditions: it applies when neither Pass nor Watch matches (decision 33).
    if (outcome === "proceed" || !rule) {
      if (outcome === "proceed") {
        const t: RuleTrace = { outcome, match: "all", matched: true, predicates: [] };
        rules.push(t);
        fired ??= t;
      }
      continue;
    }
    const predicates = rule.predicates.map((p) => evaluatePredicate(p, facts));
    const matched =
      predicates.length > 0 && (rule.match === "any" ? predicates.some((p) => p.result) : predicates.every((p) => p.result));
    const t: RuleTrace = { outcome, match: rule.match, matched, predicates };
    rules.push(t);
    if (matched && !fired) fired = t;
  }

  const outcome = fired!.outcome;
  const because = fired!.predicates.filter((p) => p.result).map((p) => p.text);
  const rule_applied =
    outcome === "proceed"
      ? `Proceed: neither the Pass nor the Watch conditions matched (${rules
          .filter((r) => r.outcome !== "proceed")
          .flatMap((r) => r.predicates.map((p) => p.text))
          .join("; ")})`
      : `${LABEL[outcome]}: ${because.join(fired!.match === "any" ? "; " : " and ")}`;
  return { classification: outcome, rule_applied, rules, facts };
}
