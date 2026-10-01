"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import {
  MAX_QUICK_SCREEN_QUESTIONS,
  TIERS,
  type ConfigView,
  type TierDefinitions,
  type VersionSummary,
} from "@/lib/config-shared";

const SECTIONS = [
  ["tiers", "Source tiers"],
  ["quick", "Quick Screen questions"],
  ["prompts", "Collection Prompts"],
  ["counter", "Counter-Case Prompts"],
  ["versions", "Configuration versions"],
] as const;
type Section = (typeof SECTIONS)[number][0];

// Editable copy of the draft. `key` is a client-only React key; `id` is the
// database row id (absent for rows added in this session).
type Row<T> = T & { key: string; id?: string };
type Model = {
  id: string;
  tiers: TierDefinitions;
  quick: Row<{ label: string; question: string }>[];
  prompts: Row<{ question: string; required: boolean }>[];
  counter: Row<{ prompt: string }>[];
};

const toModel = (c: ConfigView): Model => ({
  id: c.id,
  tiers: structuredClone(c.tierDefinitions),
  quick: c.quickScreenQuestions.map((q) => ({ ...q, key: q.id })),
  prompts: c.collectionPrompts.map((p) => ({ ...p, key: p.id })),
  counter: c.counterCasePrompts.map((p) => ({ ...p, key: p.id })),
});

const toBody = (m: Model) => ({
  id: m.id,
  tier_definitions: m.tiers,
  quick_screen_questions: m.quick.map(({ id, label, question }) => ({ id, label, question })),
  collection_prompts: m.prompts.map(({ id, question, required }) => ({ id, question, required })),
  counter_case_prompts: m.counter.map(({ id, prompt }) => ({ id, prompt })),
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
  const saveDraft = () => run(async () => {
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

  const update = (fn: (m: Model) => Model) => setModel((m) => (m ? fn(m) : m));

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
          Viewing v{viewing.version} ({viewing.status === "draft" ? "draft" : viewing.isActive ? "active" : "inactive"}),
          read-only. Published versions never change.
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
          {!shown ? (
            <p className="text-muted">{fundName} has no configuration yet.</p>
          ) : section === "tiers" ? (
            <TiersSection
              tiers={editing ? model!.tiers : shown.tierDefinitions}
              onChange={editing ? (tiers) => update((m) => ({ ...m, tiers })) : undefined}
            />
          ) : section === "quick" ? (
            <ListSection
              title="Quick Screen questions"
              intro="One to seven questions, each answered in one or two sentences before deciding whether the deal warrants deeper work."
              rows={editing ? model!.quick : shown.quickScreenQuestions.map((q) => ({ ...q, key: q.id }))}
              onChange={editing ? (quick) => update((m) => ({ ...m, quick })) : undefined}
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
          ) : section === "prompts" ? (
            <ListSection
              title="Collection Prompts"
              intro="Guiding questions the evaluation must answer. Together they define what evidence is required; an unanswered required prompt becomes an Uncertainty."
              rows={editing ? model!.prompts : shown.collectionPrompts.map((p) => ({ ...p, key: p.id }))}
              onChange={editing ? (prompts) => update((m) => ({ ...m, prompts })) : undefined}
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
          ) : section === "counter" ? (
            <ListSection
              title="Counter-Case Prompts"
              intro="Outside the design theory, but required by the outputs. Each produces one argument against, linked to claims."
              rows={editing ? model!.counter : shown.counterCasePrompts.map((p) => ({ ...p, key: p.id }))}
              onChange={editing ? (counter) => update((m) => ({ ...m, counter })) : undefined}
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
          ) : (
            <VersionsSection versions={versions} />
          )}
        </div>
      </div>
    </>
  );
}

function SectionHeader({ title, intro }: { title: string; intro: string }) {
  return (
    <>
      <h2 className="mb-1.5 text-[22px]">{title}</h2>
      <p className="text-muted mb-6 max-w-[640px] text-[13.5px] leading-relaxed">{intro}</p>
    </>
  );
}

function TiersSection({
  tiers,
  onChange,
}: {
  tiers: TierDefinitions;
  onChange?: (tiers: TierDefinitions) => void;
}) {
  return (
    <>
      <SectionHeader
        title="Source tiers"
        intro="A tier fixes how much confidence a source can justify. It informs conflict resolution but never decides it."
      />
      {TIERS.map((tier) => (
        <div key={tier} className="card mb-3 flex-row items-start gap-4 p-4">
          <span className="tag tag-neutral mt-0.5 w-20 justify-center capitalize">{tier}</span>
          <div className="flex flex-1 flex-col gap-1.5">
            <textarea
              className="input min-h-14 text-[13px]"
              aria-label={`${tier} definition`}
              value={tiers[tier].definition}
              readOnly={!onChange}
              onChange={(e) => onChange?.({ ...tiers, [tier]: { ...tiers[tier], definition: e.target.value } })}
            />
            <label className="flex flex-col gap-1">
              <span className="text-muted text-xs">Examples</span>
              <input
                className="input"
                value={tiers[tier].examples}
                readOnly={!onChange}
                onChange={(e) => onChange?.({ ...tiers, [tier]: { ...tiers[tier], examples: e.target.value } })}
              />
            </label>
          </div>
        </div>
      ))}
    </>
  );
}

// A numbered, reorderable list. Read-only when onChange is absent.
function ListSection<T extends object>({
  title,
  intro,
  rows,
  onChange,
  newRow,
  renderRow,
  addLabel,
  max,
  maxMessage,
}: {
  title: string;
  intro: string;
  rows: Row<T>[];
  onChange?: (rows: Row<T>[]) => void;
  newRow: () => T;
  renderRow: (row: Row<T>, set: (patch: Partial<T>) => void, readOnly: boolean) => React.ReactNode;
  addLabel: string;
  max?: number;
  maxMessage?: string;
}) {
  const readOnly = !onChange;
  const atMax = max !== undefined && rows.length >= max;
  const move = (i: number, d: number) => {
    const next = [...rows];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    onChange?.(next);
  };

  return (
    <>
      <SectionHeader title={title} intro={intro} />
      <ol className="flex flex-col gap-3">
        {rows.map((row, i) => (
          <li key={row.key} className="card flex-row items-start gap-3 p-4">
            <span className="text-muted w-5 pt-2 text-right text-xs tabular-nums">{i + 1}</span>
            <div className="flex-1">
              {renderRow(row, (patch) => onChange?.(rows.map((r) => (r.key === row.key ? { ...r, ...patch } : r))), readOnly)}
            </div>
            {!readOnly && (
              <div className="flex flex-col">
                <button className="btn px-2 py-1" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>
                  ↑
                </button>
                <button
                  className="btn px-2 py-1"
                  aria-label="Move down"
                  disabled={i === rows.length - 1}
                  onClick={() => move(i, 1)}
                >
                  ↓
                </button>
                <button
                  className="btn px-2 py-1"
                  aria-label="Remove"
                  onClick={() => onChange?.(rows.filter((r) => r.key !== row.key))}
                >
                  ×
                </button>
              </div>
            )}
          </li>
        ))}
      </ol>
      {!readOnly && (
        <div className="mt-3 flex items-center gap-3">
          <button
            className="btn btn-primary"
            disabled={atMax}
            onClick={() => onChange?.([...rows, { ...newRow(), key: crypto.randomUUID() } as Row<T>])}
          >
            {addLabel}
          </button>
          {atMax && <span className="text-muted text-[13px]">{maxMessage}</span>}
        </div>
      )}
      {readOnly && rows.length === 0 && <p className="text-muted text-[13px]">None.</p>}
    </>
  );
}

function VersionsSection({ versions }: { versions: VersionSummary[] }) {
  return (
    <>
      <SectionHeader
        title="Configuration versions"
        intro="Every evaluation records the version it ran under. Changing configuration never rewrites a past evaluation."
      />
      <div className="card overflow-x-auto p-4">
        <table className="w-full text-left text-[13px]">
          <thead className="text-muted text-xs">
            <tr>
              <th className="pb-2 font-normal">Version</th>
              <th className="pb-2 font-normal">Status</th>
              <th className="pb-2 font-normal">Date</th>
              <th className="pb-2 font-normal">Author</th>
              <th className="pb-2" />
            </tr>
          </thead>
          <tbody>
            {versions.map((v) => (
              <tr key={v.id} className="border-t border-[var(--color-divider)]">
                <td className="py-2 pr-4 tabular-nums">v{v.version}</td>
                <td className="py-2 pr-4">
                  <span className="tag tag-neutral">
                    {v.status === "draft" ? "draft" : v.isActive ? "active" : "inactive"}
                  </span>
                </td>
                <td className="text-muted py-2 pr-4">{new Date(v.date).toLocaleDateString("en-GB")}</td>
                <td className="py-2 pr-4">{v.author ?? "—"}</td>
                <td className="py-2 text-right">
                  {v.status === "published" && !v.isActive && <Link href={`/settings?v=${v.version}`}>View</Link>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
