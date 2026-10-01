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

// `key` is a client-only React key; `id` is the database row id (absent for
// rows added in this session).
export type Row<T> = T & { key: string; id?: string };

export const newKey = () => crypto.randomUUID();

export function SectionHeader({ title, intro }: { title: string; intro: string }) {
  return (
    <>
      <h2 className="mb-1.5 text-[22px]">{title}</h2>
      <p className="text-muted mb-6 max-w-[640px] text-[13.5px] leading-relaxed">{intro}</p>
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
            <span className="text-muted w-5 pt-2 text-right text-xs tabular-nums">{i + 1}</span>
            <div className="flex-1">
              {renderRow(
                row,
                (patch) => onChange?.(rows.map((r) => (r.key === row.key ? { ...r, ...patch } : r))),
                readOnly,
              )}
            </div>
            {!readOnly && (
              <div className={`flex ${compact ? "flex-row" : "flex-col"}`}>
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
          {atMax && <span className="text-muted text-[13px]">{maxMessage}</span>}
        </div>
      )}
      {readOnly && rows.length === 0 && <p className="text-muted text-[13px]">None.</p>}
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

// R1 is a fixed mechanism (decision 9): shown so a reader can recompute a
// label, never edited.
export function ConfidenceSection({ rules }: { rules: ConfidenceRules }) {
  return (
    <>
      <SectionHeader
        title="Confidence rules"
        intro="Assigned by rule from tier and independence, so a reader can recompute a label from the visible links. Computed by code, never chosen by the model; not configurable."
      />
      <div className="card p-4">
        <table className="w-full text-left text-[13px]">
          <thead className="text-muted text-xs">
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
      <p className="text-muted mt-3 text-[13px]">
        A claim in an open conflict is downgraded {rules.open_conflict_downgrade === 1 ? "one level" : `${rules.open_conflict_downgrade} levels`}.{" "}
        {rules.independence}
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

  const rows = [
    { id: rule.locked[0]?.id ?? "SR1", body: rule.locked[0]?.rule, scope: "claims", effect: "claim cannot be saved", locked: true },
    {
      id: "SR2",
      body: (
        <>
          A dimension score must cite between {num(rule.min, (min) => onChange?.({ min }), "Minimum claims per score")}
          and {num(rule.max, (max) => onChange?.({ max }), "Maximum claims per score")} claims.
        </>
      ),
      scope: "dimensions",
      effect: "score not assigned",
      locked: false,
    },
    { id: rule.locked[1]?.id ?? "SR3", body: rule.locked[1]?.rule, scope: "prompts", effect: "U# created", locked: true },
    {
      id: "SR4",
      body: (
        <>
          A dimension whose required Collection Prompt is uncovered cannot score above
          {num(rule.cap, (cap) => onChange?.({ cap }), "Score cap")}.
        </>
      ),
      scope: "dimensions",
      effect: "score capped",
      locked: false,
    },
  ];

  return (
    <>
      <SectionHeader
        title="Sufficiency rule"
        intro="Explicit predicates over claim types, confidence and coverage. Applied mechanically to every statement, prompt and dimension; the outcome is always shown."
      />
      {rows.map((r) => (
        <div key={r.id} className="card mb-3 flex-row items-start gap-4 p-4">
          <span className="text-muted w-10 pt-0.5 text-xs">{r.id}</span>
          <div className="flex-1 text-[13.5px]">
            <div>{r.body}</div>
            <div className="text-muted mt-1 text-xs">
              Applies to: {r.scope} · On failure: {r.effect}
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
  return (
    <>
      <SectionHeader
        title="Score anchors"
        intro="Fixed interpretations the system must match before assigning a score. Scores make reasoning comparable, not certain."
      />
      {ANCHOR_KEYS.map((k) => (
        <div key={k} className="card mb-3 flex-row items-start gap-4 p-4">
          <span className="w-10 pt-2 text-lg tabular-nums">{ANCHOR_LABELS[k]}</span>
          <textarea
            className="input min-h-14 flex-1 text-[13px]"
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
