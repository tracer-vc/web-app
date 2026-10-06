"use client";

import { useState } from "react";
import { LuChevronDown } from "react-icons/lu";
import { RowList, SectionHeader, newKey, type Row } from "./sections";
import { usePlain } from "./plain";

export type DimensionRow = Row<{
  title: string;
  question: string;
  claimCoverage: string;
  highScoreSignals: string;
  lowScoreSignals: string;
  disqualifyingBelow: number | null;
  prompts: Row<{ prompt: string }>[];
  // Row keys of the required Collection Prompts (= ids for saved prompts).
  required: string[];
}>;

export const newDimension = (): DimensionRow => ({
  key: newKey(),
  title: "",
  question: "",
  claimCoverage: "",
  highScoreSignals: "",
  lowScoreSignals: "",
  disqualifyingBelow: null,
  prompts: [],
  required: [],
});

// Fully fund-managed dimensions (decision 30). Read-only when onChange is absent.
export function DimensionsSection({
  dimensions,
  collectionPrompts,
  onChange,
}: {
  dimensions: DimensionRow[];
  collectionPrompts: Row<{ question: string }>[];
  onChange?: (dimensions: DimensionRow[]) => void;
}) {
  const { pick } = usePlain();
  const readOnly = !onChange;
  const [open, setOpen] = useState<string | null>(dimensions[0]?.key ?? null);

  const set = (key: string, patch: Partial<DimensionRow>) =>
    onChange?.(dimensions.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  const move = (i: number, delta: number) => {
    const next = [...dimensions];
    [next[i], next[i + delta]] = [next[i + delta], next[i]];
    onChange?.(next);
  };

  return (
    <>
      <SectionHeader
        title="Evaluation dimensions"
        intro={pick(
          "About ten lenses. Each has a question, claim coverage to look for, concrete prompts, and high/low-score signals. Removing a dimension leaves it out of the next published version; evaluations on earlier versions keep it.",
          "The areas every deal is scored on from 0 to 5, such as the team or the competitive advantage. For each area, say what to look at, which questions to answer, and what a high or a low score looks like.",
        )}
      />
      <div className="flex flex-col gap-3">
        {dimensions.map((d, i) => {
          const isOpen = open === d.key;
          return (
            <div key={d.key} className="card p-4">
              <div className="flex items-center gap-3">
                <button
                  className="flex flex-1 items-center gap-3 text-left"
                  aria-expanded={isOpen}
                  onClick={() => setOpen(isOpen ? null : d.key)}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">
                      {d.title || <span className="text-muted font-normal">Untitled dimension</span>}
                    </span>
                    <span className="text-muted block text-meta tabular-nums">
                      {pick(
                        `D${i + 1} · ${d.prompts.length} prompt${d.prompts.length === 1 ? "" : "s"}`,
                        `${d.prompts.length} question${d.prompts.length === 1 ? "" : "s"}`,
                      )}
                    </span>
                  </span>
                  <LuChevronDown
                    aria-hidden
                    className={`h-4 w-4 shrink-0 text-[var(--color-neutral-500)] transition-transform ${isOpen ? "rotate-180" : ""}`}
                  />
                </button>
                {!readOnly && (
                  <div className="flex gap-1">
                    <button className="btn px-2 py-1" aria-label="Move dimension up" disabled={i === 0} onClick={() => move(i, -1)}>
                      ↑
                    </button>
                    <button
                      className="btn px-2 py-1"
                      aria-label="Move dimension down"
                      disabled={i === dimensions.length - 1}
                      onClick={() => move(i, 1)}
                    >
                      ↓
                    </button>
                    <button
                      className="btn px-2 py-1"
                      aria-label="Remove dimension"
                      onClick={() => {
                        if (confirm(`Remove "${d.title || "this dimension"}" from the draft?`)) {
                          onChange?.(dimensions.filter((x) => x.key !== d.key));
                        }
                      }}
                    >
                      ×
                    </button>
                  </div>
                )}
              </div>

              {isOpen && (
                <div className="mt-4 flex flex-col gap-4 border-t border-[var(--color-divider)] pt-4">
                  <Field label="Title">
                    <input
                      className="input"
                      aria-label="Dimension title"
                      value={d.title}
                      readOnly={readOnly}
                      onChange={(e) => set(d.key, { title: e.target.value })}
                    />
                  </Field>
                  <Field label="Question">
                    <textarea
                      className="input min-h-14"
                      aria-label="Dimension question"
                      value={d.question}
                      readOnly={readOnly}
                      onChange={(e) => set(d.key, { question: e.target.value })}
                    />
                  </Field>
                  <Field label={pick("Claim coverage (what to look for)", "What to look for")}>
                    <textarea
                      className="input min-h-14"
                      value={d.claimCoverage}
                      readOnly={readOnly}
                      onChange={(e) => set(d.key, { claimCoverage: e.target.value })}
                    />
                  </Field>
                  <Field label={pick("Concrete prompts", "Questions to answer")}>
                    <RowList
                      compact
                      rows={d.prompts}
                      onChange={readOnly ? undefined : (prompts) => set(d.key, { prompts })}
                      newRow={() => ({ prompt: "" })}
                      addLabel={pick("+ Add concrete prompt", "+ Add question")}
                      renderRow={(row, setRow, ro) => (
                        <textarea
                          className="input min-h-10"
                          aria-label="Concrete prompt"
                          value={row.prompt}
                          readOnly={ro}
                          onChange={(e) => setRow({ prompt: e.target.value })}
                        />
                      )}
                    />
                  </Field>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label={pick("High-score signals", "What a high score looks like")}>
                      <textarea
                        className="input min-h-14"
                        value={d.highScoreSignals}
                        readOnly={readOnly}
                        onChange={(e) => set(d.key, { highScoreSignals: e.target.value })}
                      />
                    </Field>
                    <Field label={pick("Low-score signals", "What a low score looks like")}>
                      <textarea
                        className="input min-h-14"
                        value={d.lowScoreSignals}
                        readOnly={readOnly}
                        onChange={(e) => set(d.key, { lowScoreSignals: e.target.value })}
                      />
                    </Field>
                  </div>
                  <Field label={pick("Disqualifying threshold (R3)", "Rule the deal out below")}>
                    <select
                      className="input max-w-xs"
                      aria-label="Disqualifying threshold"
                      value={d.disqualifyingBelow ?? ""}
                      disabled={readOnly}
                      onChange={(e) =>
                        set(d.key, { disqualifyingBelow: e.target.value === "" ? null : Number(e.target.value) })
                      }
                    >
                      <option value="">{pick("None: never disqualifying", "Never rule a deal out on this area")}</option>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <option key={n} value={n}>
                          {pick(`A score below ${n} is disqualifying`, `Rule the deal out if it scores below ${n}`)}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field
                    label={pick(
                      "Required Collection Prompts (an uncovered one caps the score)",
                      "Research questions this area depends on (an unanswered one caps the score)",
                    )}
                  >
                    {collectionPrompts.length === 0 ? (
                      <p className="text-muted text-body">No Collection Prompts yet.</p>
                    ) : (
                      <div className="flex flex-col gap-1">
                        {collectionPrompts.map((p, pi) => (
                          <label key={p.key} className="flex items-start gap-2 text-body">
                            <input
                              type="checkbox"
                              className="mt-1"
                              aria-label={`Requires Collection Prompt ${pi + 1}`}
                              checked={d.required.includes(p.key)}
                              disabled={readOnly}
                              onChange={(e) =>
                                set(d.key, {
                                  required: e.target.checked
                                    ? [...d.required, p.key]
                                    : d.required.filter((k) => k !== p.key),
                                })
                              }
                            />
                            <span>
                              <span className="text-muted tabular-nums">{pi + 1}.</span>{" "}
                              {p.question || <span className="text-muted">(empty prompt)</span>}
                            </span>
                          </label>
                        ))}
                      </div>
                    )}
                  </Field>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {!readOnly && (
        <button
          className="btn btn-primary mt-3"
          onClick={() => {
            const d = newDimension();
            onChange?.([...dimensions, d]);
            setOpen(d.key);
          }}
        >
          {pick("+ Add dimension", "+ Add area")}
        </button>
      )}
      {readOnly && dimensions.length === 0 && <p className="text-muted text-body">None.</p>}
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-muted text-meta">{label}</span>
      {children}
    </div>
  );
}
