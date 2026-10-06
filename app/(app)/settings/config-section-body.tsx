"use client";

import { MAX_QUICK_SCREEN_QUESTIONS, type ConfigView, type VersionSummary } from "@/lib/config-shared";
import type { ConfigSection } from "./config-sections";
import type { Model } from "./config-model";
import { CriteriaSection } from "./criteria-section";
import { DimensionsSection } from "./dimensions-section";
import {
  AnchorsSection,
  ConfidenceSection,
  RowList,
  SectionHeader,
  SufficiencySection,
  TiersSection,
  VersionsSection,
} from "./sections";
import { usePlain } from "./plain";

// One section of the fund's framework configuration, read-only or editable
// (when `update` is given). Shared by the Settings editor and the setup wizard.
export function ConfigSectionBody({
  section,
  view,
  shown,
  update,
  versions = [],
  fundName = "This fund",
}: {
  section: ConfigSection;
  view: Model | null;
  shown: ConfigView | null;
  update?: <K extends keyof Model>(key: K) => (value: Model[K]) => void;
  versions?: VersionSummary[];
  fundName?: string;
}) {
  const editing = !!update;
  const { pick } = usePlain();
  return (
    <>
    {!view || !shown ? (
      <p className="text-muted">{fundName} has no configuration yet.</p>
    ) : section === "tiers" ? (
      <TiersSection tiers={view.tiers} onChange={editing ? update!("tiers") : undefined} />
    ) : section === "conf" ? (
      <ConfidenceSection rules={shown.confidenceRules} />
    ) : section === "suff" ? (
      <SufficiencySection
        rule={{ ...view.suff, locked: shown.sufficiencyRule.locked }}
        onChange={editing ? (patch) => update!("suff")({ ...view.suff, ...patch }) : undefined}
      />
    ) : section === "quick" ? (
      <>
        <SectionHeader
          title="Quick Screen questions"
          intro={pick(
            "One to seven questions, each answered in one or two sentences before deciding whether the deal warrants deeper work.",
            "A short first check for every new deal: up to seven questions, each answered in a sentence or two from the pitch materials, before you decide whether the deal deserves a closer look.",
          )}
        />
        <RowList
          rows={view.quick}
          onChange={editing ? update!("quick") : undefined}
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
          intro={pick(
            "Guiding questions the evaluation must answer. Together they define what evidence is required; an unanswered required prompt becomes an Uncertainty.",
            "The questions the research on every deal has to answer, such as who the team is or how the company makes money. If the sources can't answer a required question, Tracer flags it as an open question for you to follow up.",
          )}
        />
        <RowList
          rows={view.prompts}
          onChange={editing ? update!("prompts") : undefined}
          newRow={() => ({ question: "", required: true })}
          addLabel={pick("+ Add prompt", "+ Add question")}
          renderRow={(row, set, readOnly) => (
            <div className="flex flex-col gap-1.5">
              <textarea
                className="input min-h-14"
                aria-label="Collection Prompt"
                value={row.question}
                readOnly={readOnly}
                onChange={(e) => set({ question: e.target.value })}
              />
              <label className="text-muted flex items-center gap-2 text-meta">
                <input
                  type="checkbox"
                  checked={row.required}
                  disabled={readOnly}
                  onChange={(e) => set({ required: e.target.checked })}
                />
                {pick(
                  "Required: an uncovered prompt becomes an Uncertainty (U#)",
                  "Required: flag it as an open question if the research can't answer it",
                )}
              </label>
            </div>
          )}
        />
      </>
    ) : section === "counter" ? (
      <>
        <SectionHeader
          title="Counter-Case Prompts"
          intro={pick(
            "Outside the design theory, but required by the outputs. Each produces one argument against, linked to claims.",
            "Questions Tracer uses to argue against every deal, so the risks get as much attention as the upside. Each one produces one argument against the investment, backed by the evidence.",
          )}
        />
        <RowList
          rows={view.counter}
          onChange={editing ? update!("counter") : undefined}
          newRow={() => ({ prompt: "" })}
          addLabel={pick("+ Add prompt", "+ Add question")}
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
        onChange={editing ? update!("dims") : undefined}
      />
    ) : section === "anchors" ? (
      <AnchorsSection anchors={view.anchors} onChange={editing ? update!("anchors") : undefined} />
    ) : section === "class" ? (
      <CriteriaSection criteria={view.criteria} onChange={editing ? update!("criteria") : undefined} />
    ) : (
      <VersionsSection versions={versions} />
    )}
    </>
  );
}
