"use client";

import {
  NEXT_STEP_ACTIONS,
  OPS,
  PREDICATE_TYPES,
  type ClassificationCriteria,
  type ClassificationRule,
  type Op,
  type Predicate,
  type PredicateType,
} from "@/lib/config-shared";
import { SectionHeader } from "./sections";
import { usePlain } from "./plain";

const TITLES = { pass: "Pass", watch: "Watch", proceed: "Proceed" } as const;

// Plain-language versions for the guided fund setup.
const PLAIN_PREDICATES: Record<PredicateType, string> = {
  any_dimension_disqualifying: "Any area scores below its rule-out score",
  min_dimension_score: "Lowest area score",
  avg_dimension_score: "Average area score",
  open_decision_critical_uncertainties: "Important questions still unanswered",
  open_conflicts: "Contradictions between sources still unsettled",
};
const PLAIN_NEXT_STEP: Record<ClassificationRule["outcome"], string> = {
  pass: "stop the evaluation and note the main reason, and what would make you look again.",
  watch: "note what you are waiting for, when to look again, and what evidence would let you go ahead.",
  proceed: "continue with the full evaluation and the final recommendation.",
};

function predicateOf(type: PredicateType, prev?: Predicate): Predicate {
  if (type === "any_dimension_disqualifying") return { type };
  const kind = PREDICATE_TYPES[type].kind;
  const keep = prev && "op" in prev && PREDICATE_TYPES[prev.type].kind === kind;
  return {
    type,
    op: keep ? prev.op : kind === "score" ? "<=" : ">=",
    value: keep ? prev.value : kind === "score" ? 2 : 1,
  };
}

// R3 criteria (decisions 12, 33): structured predicates the code evaluates
// Pass -> Watch -> Proceed; the model never chooses the outcome.
export function CriteriaSection({
  criteria,
  onChange,
}: {
  criteria: ClassificationCriteria;
  onChange?: (criteria: ClassificationCriteria) => void;
}) {
  const readOnly = !onChange;
  const { pick } = usePlain();
  const setRule = (i: number, patch: Partial<ClassificationRule>) =>
    onChange?.({ rules: criteria.rules.map((r, j) => (j === i ? { ...r, ...patch } : r)) });

  return (
    <>
      <SectionHeader
        title="Proceed / Watch / Pass criteria"
        intro={pick(
          "Selection criteria are yours. Next-step actions are fixed by the system. The classification is computed from dimension scores and counts, never chosen by the model.",
          "The rules that turn a deal's scores into a recommendation: Pass, Watch or Proceed. You set the rules; Tracer applies them automatically, so the AI never picks the outcome itself.",
        )}
      />
      <div className="flex flex-col gap-3">
        {criteria.rules.map((rule, i) => (
          <div key={rule.outcome} className="card p-4">
            <div className="mb-2 flex items-center gap-3">
              <span className="tag tag-neutral">{TITLES[rule.outcome]}</span>
              <span className="text-muted text-meta">
                {pick("Quick Screen and Decision Snapshot", "Used for the first check and for the final recommendation")}
              </span>
            </div>

            {rule.outcome === "proceed" ? (
              <p className="mb-3 text-body">
                {pick("Applies when neither Pass nor Watch matches.", "Applies when neither the Pass nor the Watch rules apply.")}
              </p>
            ) : (
              <div className="mb-3 flex flex-col gap-2">
                <div className="flex items-center gap-2 text-body">
                  <span>{TITLES[rule.outcome]} when</span>
                  <select
                    className="input w-auto min-h-0 py-1"
                    aria-label={`${TITLES[rule.outcome]} match`}
                    value={rule.match}
                    disabled={readOnly}
                    onChange={(e) => setRule(i, { match: e.target.value as "any" | "all" })}
                  >
                    <option value="any">any</option>
                    <option value="all">all</option>
                  </select>
                  <span>of these hold:</span>
                </div>
                {rule.predicates.map((p, pi) => (
                  <PredicateRow
                    key={pi}
                    outcome={TITLES[rule.outcome]}
                    predicate={p}
                    readOnly={readOnly}
                    onChange={(next) =>
                      setRule(i, { predicates: rule.predicates.map((x, xi) => (xi === pi ? next : x)) })
                    }
                    onRemove={() => setRule(i, { predicates: rule.predicates.filter((_, xi) => xi !== pi) })}
                  />
                ))}
                {rule.predicates.length === 0 && (
                  <p className="text-danger text-body">Add at least one condition.</p>
                )}
                {!readOnly && (
                  <button
                    className="btn ml-4 self-start px-2.5 py-[5px] text-body"
                    onClick={() => setRule(i, { predicates: [...rule.predicates, predicateOf("min_dimension_score")] })}
                  >
                    + Add condition
                  </button>
                )}
              </div>
            )}

            <label className="flex flex-col gap-1">
              <span className="text-muted text-meta">
                {pick("Selection criteria (editable note, display only)", "Description for your team (doesn't change the outcome)")}
              </span>
              <textarea
                className="input min-h-14 text-body"
                aria-label={`${TITLES[rule.outcome]} note`}
                value={rule.note}
                readOnly={readOnly}
                onChange={(e) => setRule(i, { note: e.target.value })}
              />
            </label>
            <p className="text-muted mt-2 text-meta">
              {pick("Next-step action (fixed)", "What happens next")}:{" "}
              {pick(NEXT_STEP_ACTIONS[rule.outcome], PLAIN_NEXT_STEP[rule.outcome])}
            </p>
          </div>
        ))}
      </div>
      <p className="text-muted mt-3 text-body">
        Evaluated in order Pass → Watch → Proceed; the first match wins.
      </p>
    </>
  );
}

function PredicateRow({
  outcome,
  predicate,
  readOnly,
  onChange,
  onRemove,
}: {
  outcome: string;
  predicate: Predicate;
  readOnly: boolean;
  onChange: (p: Predicate) => void;
  onRemove: () => void;
}) {
  const { pick } = usePlain();
  return (
    <div className="flex flex-wrap items-center gap-2 pl-4 text-body">
      <select
        className="input w-auto min-h-0 py-1"
        aria-label={`${outcome} condition`}
        value={predicate.type}
        disabled={readOnly}
        onChange={(e) => onChange(predicateOf(e.target.value as PredicateType, predicate))}
      >
        {Object.entries(PREDICATE_TYPES).map(([type, { label }]) => (
          <option key={type} value={type}>
            {pick(label, PLAIN_PREDICATES[type as PredicateType])}
          </option>
        ))}
      </select>
      {"op" in predicate && (
        <>
          <select
            className="input w-auto min-h-0 py-1"
            aria-label={`${outcome} operator`}
            value={predicate.op}
            disabled={readOnly}
            onChange={(e) => onChange({ ...predicate, op: e.target.value as Op })}
          >
            {OPS.map((op) => (
              <option key={op} value={op}>
                {op}
              </option>
            ))}
          </select>
          <input
            type="number"
            className="input w-20 min-h-0 py-1"
            aria-label={`${outcome} value`}
            step={PREDICATE_TYPES[predicate.type].kind === "score" ? 0.5 : 1}
            value={Number.isNaN(predicate.value) ? "" : predicate.value}
            readOnly={readOnly}
            onChange={(e) => onChange({ ...predicate, value: e.target.value === "" ? NaN : Number(e.target.value) })}
          />
        </>
      )}
      {!readOnly && (
        <button className="btn px-2 py-1" aria-label="Remove condition" onClick={onRemove}>
          ×
        </button>
      )}
    </div>
  );
}
