"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import {
  MAX_QUICK_SCREEN_QUESTIONS,
  type ClassificationCriteria,
  type ConfigView,
  type ScoreAnchors,
  type TierDefinitions,
  type VersionSummary,
} from "@/lib/config-shared";
import { CriteriaSection } from "./criteria-section";
import { DimensionsSection, type DimensionRow } from "./dimensions-section";
import {
  AnchorsSection,
  ConfidenceSection,
  RowList,
  SectionHeader,
  SufficiencySection,
  TiersSection,
  VersionsSection,
  type Row,
} from "./sections";

const SECTIONS = [
  ["tiers", "Source tiers"],
  ["conf", "Confidence rules"],
  ["suff", "Sufficiency rule"],
  ["quick", "Quick Screen questions"],
  ["prompts", "Collection Prompts"],
  ["counter", "Counter-Case Prompts"],
  ["dims", "Evaluation dimensions"],
  ["anchors", "Score anchors"],
  ["class", "Proceed / Watch / Pass"],
  ["versions", "Configuration versions"],
] as const;
type Section = (typeof SECTIONS)[number][0];

// Editable copy of a config.
type Model = {
  id: string;
  tiers: TierDefinitions;
  suff: { min: number; max: number; cap: number };
  anchors: ScoreAnchors;
  criteria: ClassificationCriteria;
  quick: Row<{ label: string; question: string }>[];
  prompts: Row<{ question: string; required: boolean }>[];
  counter: Row<{ prompt: string }>[];
  dims: DimensionRow[];
};

const toModel = (c: ConfigView): Model => ({
  id: c.id,
  tiers: structuredClone(c.tierDefinitions),
  suff: {
    min: c.sufficiencyRule.claims_per_score.min,
    max: c.sufficiencyRule.claims_per_score.max,
    cap: c.sufficiencyRule.score_cap,
  },
  anchors: { ...c.scoreAnchors },
  criteria: structuredClone(c.classificationCriteria),
  quick: c.quickScreenQuestions.map((q) => ({ ...q, key: q.id })),
  prompts: c.collectionPrompts.map((p) => ({ ...p, key: p.id })),
  counter: c.counterCasePrompts.map((p) => ({ ...p, key: p.id })),
  dims: c.dimensions.map((d) => ({
    key: d.id,
    id: d.id,
    title: d.title,
    question: d.question,
    claimCoverage: d.claimCoverage,
    highScoreSignals: d.highScoreSignals,
    lowScoreSignals: d.lowScoreSignals,
    disqualifyingBelow: d.disqualifyingBelow,
    prompts: d.prompts.map((p) => ({ ...p, key: p.id })),
    required: [...d.requiredPromptIds],
  })),
});

// Body of PUT /api/settings/config. Required prompts are sent as positions
// because prompts added in this session have no id yet.
const toBody = (m: Model) => ({
  id: m.id,
  tier_definitions: m.tiers,
  sufficiency_rule: { claims_per_score: { min: m.suff.min, max: m.suff.max }, score_cap: m.suff.cap },
  score_anchors: m.anchors,
  classification_criteria: m.criteria,
  quick_screen_questions: m.quick.map(({ id, label, question }) => ({ id, label, question })),
  collection_prompts: m.prompts.map(({ id, question, required }) => ({ id, question, required })),
  counter_case_prompts: m.counter.map(({ id, prompt }) => ({ id, prompt })),
  dimensions: m.dims.map((d) => ({
    id: d.id,
    title: d.title,
    question: d.question,
    claim_coverage: d.claimCoverage,
    high_score_signals: d.highScoreSignals,
    low_score_signals: d.lowScoreSignals,
    disqualifying_below: d.disqualifyingBelow,
    prompts: d.prompts.map(({ id, prompt }) => ({ id, prompt })),
    required_prompt_positions: m.prompts.flatMap((p, i) => (d.required.includes(p.key) ? [i + 1] : [])),
  })),
});

async function call(method: string, url: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error ?? `Request failed (${res.status})`);
  }
  return res.status === 204 ? null : res.json();
}

export function SettingsEditor({
  fundName,
  active,
  draft,
  viewing,
  versions,
}: {
  fundName: string;
  active: ConfigView | null;
  draft: ConfigView | null;
  viewing: ConfigView | null;
  versions: VersionSummary[];
}) {
  const router = useRouter();
  const [section, setSection] = useState<Section>("prompts");
  const [model, setModel] = useState<Model | null>(draft ? toModel(draft) : null);
  const [saved, setSaved] = useState(() => (draft ? JSON.stringify(toBody(toModel(draft))) : ""));
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  const dirty = useMemo(() => (model ? JSON.stringify(toBody(model)) !== saved : false), [model, saved]);
  const editing = !!model && !viewing;
  const shown = viewing ?? draft ?? active;
  // Read-only views use the same model shape as the editor.
  const view = useMemo(() => (editing ? model! : shown ? toModel(shown) : null), [editing, model, shown]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function run(action: () => Promise<string | void>) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      try {
        const message = await action();
        if (message) setNotice(message);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      }
    });
  }

  // Reload the model from the saved draft so rows added in this session get
  // their database ids (otherwise the next save would insert them again).
  const save = async () => {
    if (!model) return;
    const { draft: savedDraft } = await call("PUT", "/api/settings/config", toBody(model));
    const next = toModel(savedDraft);
    setModel(next);
    setSaved(JSON.stringify(toBody(next)));
  };

  const startEditing = () => run(async () => void (await call("POST", "/api/settings/config/draft")));
  const saveDraft = () =>
    run(async () => {
      await save();
      return "Draft saved.";
    });
  const discard = () => {
    if (!confirm("Discard the draft? All unpublished changes are lost.")) return;
    run(async () => {
      await call("DELETE", "/api/settings/config/draft");
      setModel(null);
      setSaved("");
      return "Draft discarded.";
    });
  };
  const publish = () => {
    if (!draft) return;
    if (
      !confirm(
        `Publish as v${draft.version}? New evaluations use it; evaluations already started keep their version.`,
      )
    )
      return;
    run(async () => {
      if (dirty) await save();
      const { version } = await call("POST", "/api/settings/config/publish");
      return `Published as v${version}.`;
    });
  };

  const update =
    <K extends keyof Model>(key: K) =>
    (value: Model[K]) =>
      setModel((m) => (m ? { ...m, [key]: value } : m));

  return (
    <>
      <div className="mb-8 flex flex-wrap items-end gap-4">
        <div>
          <h1 className="mb-1.5 text-3xl">Fund settings</h1>
          <p className="text-muted text-[13px]">
            Framework Configuration · set once, applied unchanged to every evaluation · current
            version v{active?.version ?? "–"}
            {draft && !viewing && <> · editing draft v{draft.version}</>}
          </p>
        </div>
        <div className="ml-auto flex gap-1.5">
          {viewing ? (
            <Link className="btn" href="/settings">
              Back to current
            </Link>
          ) : draft ? (
            <>
              <button className="btn" onClick={discard} disabled={busy}>
                Discard draft
              </button>
              <button className="btn" onClick={saveDraft} disabled={busy || !dirty}>
                {dirty ? "Save draft" : "Saved"}
              </button>
              <button className="btn btn-primary" onClick={publish} disabled={busy}>
                Publish as v{draft.version}
              </button>
            </>
          ) : (
            <button className="btn btn-primary" onClick={startEditing} disabled={busy || !active}>
              Edit configuration
            </button>
          )}
        </div>
      </div>

      {(error || notice) && (
        <p role={error ? "alert" : "status"} className={`mb-6 text-[13px] ${error ? "text-danger" : ""}`}>
          {error ?? notice}
        </p>
      )}

      {viewing && (
        <p className="card mb-6 text-[13px]">
          Viewing v{viewing.version} (
          {viewing.status === "draft" ? "draft" : viewing.isActive ? "active" : "inactive"}), read-only.
          Published versions never change.
        </p>
      )}

      <div className="grid items-start gap-14 md:grid-cols-[240px_minmax(0,1fr)]">
        <nav className="flex flex-col gap-0.5 md:sticky md:top-[88px]">
          {SECTIONS.map(([key, label]) => (
            <button
              key={key}
              onClick={() => setSection(key)}
              className={`rounded-md px-2.5 py-1.5 text-left text-[13px] hover:bg-[var(--color-neutral-900)] ${
                section === key
                  ? "bg-[var(--color-neutral-900)] text-[var(--color-text)]"
                  : "text-[var(--color-neutral-400)]"
              }`}
            >
              {label}
            </button>
          ))}
          <Link
            href="/settings/team"
            className="rounded-md px-2.5 py-1.5 text-[13px] text-[var(--color-neutral-400)] no-underline hover:bg-[var(--color-neutral-900)]"
          >
            Team →
          </Link>
          <div className="text-muted mt-4 rounded-lg border border-[var(--color-neutral-800)] p-2.5 text-[11px] leading-normal">
            <div className="mb-1 font-medium text-[var(--color-neutral-300)]">
              Fixed mechanism (not configurable)
            </div>
            Mandatory C# on every statement · mandatory S# + excerpt on Facts and Inferences ·
            three claim types · mandatory conflict status · outputs rendered from claims ·
            identifier scheme
          </div>
        </nav>

        <div className="max-w-[880px]">
          {!view || !shown ? (
            <p className="text-muted">{fundName} has no configuration yet.</p>
          ) : section === "tiers" ? (
            <TiersSection tiers={view.tiers} onChange={editing ? update("tiers") : undefined} />
          ) : section === "conf" ? (
            <ConfidenceSection rules={shown.confidenceRules} />
          ) : section === "suff" ? (
            <SufficiencySection
              rule={{ ...view.suff, locked: shown.sufficiencyRule.locked }}
              onChange={editing ? (patch) => update("suff")({ ...view.suff, ...patch }) : undefined}
            />
          ) : section === "quick" ? (
            <>
              <SectionHeader
                title="Quick Screen questions"
                intro="One to seven questions, each answered in one or two sentences before deciding whether the deal warrants deeper work."
              />
              <RowList
                rows={view.quick}
                onChange={editing ? update("quick") : undefined}
                newRow={() => ({ label: "", question: "" })}
                max={MAX_QUICK_SCREEN_QUESTIONS}
                maxMessage={`Up to ${MAX_QUICK_SCREEN_QUESTIONS} Quick Screen questions.`}
                addLabel="+ Add question"
                renderRow={(row, set, readOnly) => (
                  <div className="flex flex-col gap-1.5">
                    <input
                      className="input"
                      aria-label="Label"
                      placeholder="Label"
                      value={row.label}
                      readOnly={readOnly}
                      onChange={(e) => set({ label: e.target.value })}
                    />
                    <textarea
                      className="input min-h-14"
                      aria-label="Question"
                      placeholder="Question"
                      value={row.question}
                      readOnly={readOnly}
                      onChange={(e) => set({ question: e.target.value })}
                    />
                  </div>
                )}
              />
            </>
          ) : section === "prompts" ? (
            <>
              <SectionHeader
                title="Collection Prompts"
                intro="Guiding questions the evaluation must answer. Together they define what evidence is required; an unanswered required prompt becomes an Uncertainty."
              />
              <RowList
                rows={view.prompts}
                onChange={editing ? update("prompts") : undefined}
                newRow={() => ({ question: "", required: true })}
                addLabel="+ Add prompt"
                renderRow={(row, set, readOnly) => (
                  <div className="flex flex-col gap-1.5">
                    <textarea
                      className="input min-h-14"
                      aria-label="Collection Prompt"
                      value={row.question}
                      readOnly={readOnly}
                      onChange={(e) => set({ question: e.target.value })}
                    />
                    <label className="text-muted flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={row.required}
                        disabled={readOnly}
                        onChange={(e) => set({ required: e.target.checked })}
                      />
                      Required: an uncovered prompt becomes an Uncertainty (U#)
                    </label>
                  </div>
                )}
              />
            </>
          ) : section === "counter" ? (
            <>
              <SectionHeader
                title="Counter-Case Prompts"
                intro="Outside the design theory, but required by the outputs. Each produces one argument against, linked to claims."
              />
              <RowList
                rows={view.counter}
                onChange={editing ? update("counter") : undefined}
                newRow={() => ({ prompt: "" })}
                addLabel="+ Add prompt"
                renderRow={(row, set, readOnly) => (
                  <textarea
                    className="input min-h-14"
                    aria-label="Counter-Case Prompt"
                    value={row.prompt}
                    readOnly={readOnly}
                    onChange={(e) => set({ prompt: e.target.value })}
                  />
                )}
              />
            </>
          ) : section === "dims" ? (
            <DimensionsSection
              dimensions={view.dims}
              collectionPrompts={view.prompts}
              onChange={editing ? update("dims") : undefined}
            />
          ) : section === "anchors" ? (
            <AnchorsSection anchors={view.anchors} onChange={editing ? update("anchors") : undefined} />
          ) : section === "class" ? (
            <CriteriaSection criteria={view.criteria} onChange={editing ? update("criteria") : undefined} />
          ) : (
            <VersionsSection versions={versions} />
          )}
        </div>
      </div>
    </>
  );
}
