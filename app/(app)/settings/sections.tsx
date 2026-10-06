"use client";

import Link from "next/link";
import {
  ANCHOR_KEYS,
  TIERS,
  type ConfidenceRules,
  type ScoreAnchors,
  type SufficiencyRule,
  type TierDefinitions,
  type VersionSummary,
} from "@/lib/config-shared";
import { usePlain } from "./plain";

// `key` is a client-only React key; `id` is the database row id (absent for
// rows added in this session).
export type Row<T> = T & { key: string; id?: string };

export const newKey = () => crypto.randomUUID();

export function SectionHeader({ title, intro }: { title: string; intro: string }) {
  return (
    <>
      <h1 className="mb-1.5 text-page">{title}</h1>
      <p className="text-muted mb-6 max-w-[640px] text-body leading-relaxed">{intro}</p>
    </>
  );
}

// Numbered, reorderable rows. Read-only when onChange is absent.
export function RowList<T extends object>({
  rows,
  onChange,
  newRow,
  renderRow,
  addLabel,
  max,
  maxMessage,
  compact,
}: {
  rows: Row<T>[];
  onChange?: (rows: Row<T>[]) => void;
  newRow: () => T;
  renderRow: (row: Row<T>, set: (patch: Partial<T>) => void, readOnly: boolean) => React.ReactNode;
  addLabel: string;
  max?: number;
  maxMessage?: string;
  compact?: boolean;
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
      <ol className={`flex flex-col ${compact ? "gap-2" : "gap-3"}`}>
        {rows.map((row, i) => (
          <li
            key={row.key}
            className={compact ? "flex items-start gap-2" : "card flex-row items-start gap-3 p-4"}
          >
            <span className="text-muted w-5 pt-2 text-right text-meta tabular-nums">{i + 1}</span>
            <div className="flex-1">
              {renderRow(
                row,
                (patch) => onChange?.(rows.map((r) => (r.key === row.key ? { ...r, ...patch } : r))),
                readOnly,
              )}
            </div>
            {!readOnly && (
              <div className={`flex gap-1 ${compact ? "flex-row" : "flex-col"}`}>
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
            className={compact ? "btn" : "btn btn-primary"}
            disabled={atMax}
            onClick={() => onChange?.([...rows, { ...newRow(), key: newKey() } as Row<T>])}
          >
            {addLabel}
          </button>
          {atMax && <span className="text-muted text-body">{maxMessage}</span>}
        </div>
      )}
      {readOnly && rows.length === 0 && <p className="text-muted text-body">None.</p>}
    </>
  );
}

export function TiersSection({
  tiers,
  onChange,
}: {
  tiers: TierDefinitions;
  onChange?: (tiers: TierDefinitions) => void;
}) {
  const { pick } = usePlain();
  return (
    <>
      <SectionHeader
        title="Source tiers"
        intro={pick(
          "A tier fixes how much confidence a source can justify. It informs conflict resolution but never decides it.",
          "How far each kind of source can be trusted, from Primary (the company's own documents, official filings) to Tertiary (blogs, social media). The more trustworthy the source, the more weight a fact from it can carry.",
        )}
      />
      {TIERS.map((tier) => (
        <div key={tier} className="card mb-3 flex-row items-start gap-4 p-4">
          <span className="tag tag-neutral mt-0.5 w-20 justify-center capitalize">{tier}</span>
          <div className="flex flex-1 flex-col gap-1.5">
            <textarea
              className="input min-h-14 text-body"
              aria-label={`${tier} definition`}
              value={tiers[tier].definition}
              readOnly={!onChange}
              onChange={(e) => onChange?.({ ...tiers, [tier]: { ...tiers[tier], definition: e.target.value } })}
            />
            <label className="flex flex-col gap-1">
              <span className="text-muted text-meta">Examples</span>
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

// R1 is a fixed mechanism (decision 9): shown so a reader can recompute a
// label, never edited.
export function ConfidenceSection({ rules }: { rules: ConfidenceRules }) {
  const { pick } = usePlain();
  return (
    <>
      <SectionHeader
        title="Confidence rules"
        intro={pick(
          "Assigned by rule from tier and independence, so a reader can recompute a label from the visible links. Computed by code, never chosen by the model; not configurable.",
          "How sure Tracer is about each fact: High, Medium or Low, depending on how many independent sources confirm it and how trustworthy they are. These levels are fixed, so anyone can check how a rating came about.",
        )}
      />
      <div className="card p-4">
        <table className="w-full text-left text-body">
          <thead className="text-muted text-meta">
            <tr>
              <th className="w-28 pb-2 font-normal">Level</th>
              <th className="pb-2 font-normal">Rule</th>
            </tr>
          </thead>
          <tbody>
            {rules.levels.map((l) => (
              <tr key={l.level} className="border-t border-[var(--color-divider)]">
                <td className="py-2 pr-4 capitalize">{l.level}</td>
                <td className="py-2">{l.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-muted mt-3 text-body">
        {pick(
          <>
            A claim in an open conflict is downgraded{" "}
            {rules.open_conflict_downgrade === 1 ? "one level" : `${rules.open_conflict_downgrade} levels`}.{" "}
            {rules.independence}
          </>,
          <>
            A fact that another source contradicts drops{" "}
            {rules.open_conflict_downgrade === 1 ? "one level" : `${rules.open_conflict_downgrade} levels`} until someone
            settles the contradiction. Sources from the same publisher count as one.
          </>,
        )}
      </p>
    </>
  );
}

const LOCK = (
  <span className="tag tag-neutral" title="Fixed by the framework">
    🔒 Fixed
  </span>
);

export function SufficiencySection({
  rule,
  onChange,
}: {
  rule: { min: number; max: number; cap: number; locked: SufficiencyRule["locked"] };
  onChange?: (patch: Partial<{ min: number; max: number; cap: number }>) => void;
}) {
  const num = (value: number, set: (n: number) => void, label: string) => (
    <input
      type="number"
      aria-label={label}
      className="input mx-1 inline-block w-16 min-h-0 px-2 py-0.5 text-center"
      value={Number.isNaN(value) ? "" : value}
      readOnly={!onChange}
      onChange={(e) => set(e.target.value === "" ? NaN : Number(e.target.value))}
    />
  );

  const { plain, pick } = usePlain();
  const rows = [
    {
      id: rule.locked[0]?.id ?? "SR1",
      body: pick(rule.locked[0]?.rule, "Every fact has to point to a source and quote it word for word."),
      scope: pick("claims", "facts"),
      effect: pick("claim cannot be saved", "the fact is not kept"),
      locked: true,
    },
    {
      id: "SR2",
      body: (
        <>
          {pick("A dimension score must cite between", "Each score has to rest on between")}
          {num(rule.min, (min) => onChange?.({ min }), "Minimum claims per score")}
          and {num(rule.max, (max) => onChange?.({ max }), "Maximum claims per score")} {pick("claims", "facts")}.
        </>
      ),
      scope: pick("dimensions", "scores"),
      effect: pick("score not assigned", "no score is given"),
      locked: false,
    },
    {
      id: rule.locked[1]?.id ?? "SR3",
      body: pick(rule.locked[1]?.rule, "A required research question that no fact answers is flagged as an open question."),
      scope: pick("prompts", "research questions"),
      effect: pick("U# created", "an open question is flagged"),
      locked: true,
    },
    {
      id: "SR4",
      body: (
        <>
          {pick(
            "A dimension whose required Collection Prompt is uncovered cannot score above",
            "While a research question an area depends on is unanswered, the area cannot score above",
          )}
          {num(rule.cap, (cap) => onChange?.({ cap }), "Score cap")}.
        </>
      ),
      scope: pick("dimensions", "scores"),
      effect: pick("score capped", "the score is capped"),
      locked: false,
    },
  ];

  return (
    <>
      <SectionHeader
        title="Sufficiency rule"
        intro={pick(
          "Explicit predicates over claim types, confidence and coverage. Applied mechanically to every statement, prompt and dimension; the outcome is always shown.",
          "When there is enough evidence: how many facts a score has to rest on, and how high a score can go while an important question is still unanswered. Applied the same way to every deal.",
        )}
      />
      {rows.map((r) => (
        <div key={r.id} className="card mb-3 flex-row items-start gap-4 p-4">
          {!plain && <span className="text-muted w-10 pt-0.5 text-meta">{r.id}</span>}
          <div className="flex-1 text-body">
            <div>{r.body}</div>
            <div className="text-muted mt-1 text-meta">
              Applies to: {r.scope} · {pick("On failure", "If not met")}: {r.effect}
            </div>
          </div>
          {r.locked ? LOCK : <span className="tag tag-neutral">Editable</span>}
        </div>
      ))}
    </>
  );
}

const ANCHOR_LABELS: Record<(typeof ANCHOR_KEYS)[number], string> = {
  "0-1": "0–1",
  "2": "2",
  "3": "3",
  "4": "4",
  "5": "5",
};

export function AnchorsSection({
  anchors,
  onChange,
}: {
  anchors: ScoreAnchors;
  onChange?: (anchors: ScoreAnchors) => void;
}) {
  const { pick } = usePlain();
  return (
    <>
      <SectionHeader
        title="Score anchors"
        intro={pick(
          "Fixed interpretations the system must match before assigning a score. Scores make reasoning comparable, not certain.",
          "What each score from 0 to 5 means, so a 3 means the same on every deal and for every analyst. Scores make deals comparable; they don't make them certain.",
        )}
      />
      {ANCHOR_KEYS.map((k) => (
        <div key={k} className="card mb-3 flex-row items-start gap-4 p-4">
          <span className="tag tag-neutral mt-2 w-12 shrink-0 justify-center tabular-nums">
            {ANCHOR_LABELS[k]}
          </span>
          <textarea
            className="input min-h-14 flex-1 text-body"
            aria-label={`Anchor ${ANCHOR_LABELS[k]}`}
            value={anchors[k]}
            readOnly={!onChange}
            onChange={(e) => onChange?.({ ...anchors, [k]: e.target.value })}
          />
        </div>
      ))}
    </>
  );
}

export function VersionsSection({ versions }: { versions: VersionSummary[] }) {
  return (
    <>
      <SectionHeader
        title="Configuration versions"
        intro="Every evaluation records the version it ran under. Changing configuration never rewrites a past evaluation."
      />
      <div className="card overflow-x-auto p-4">
        <table className="w-full text-left text-body">
          <thead className="text-muted text-meta">
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
                  {v.status === "published" && !v.isActive && <Link href={`/settings/config?section=versions&v=${v.version}`}>View</Link>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
