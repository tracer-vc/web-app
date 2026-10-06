"use client";

import Link from "next/link";
import { flashTo } from "./jump";

// One shape for every ID tag in the app (C#, S#, U#, F#, D#, CR#): fixed
// height, so it looks the same next to any text size.
export const TAG_SHAPE =
  "inline-flex h-[18px] shrink-0 items-center rounded px-1.5 font-mono text-tag leading-none no-underline";

// Clickable IDs that trace to a claim, source, uncertainty, falsifier or dimension.
export const ID_TAG_CLASS = `${TAG_SHAPE} bg-[var(--color-accent-tint)] text-[var(--color-accent-text)] hover:bg-[var(--color-accent-800)]`;

// Plain (non-clickable) ID, e.g. U# in the Uncertainty List.
export const PLAIN_TAG_CLASS = `${TAG_SHAPE} bg-[var(--color-neutral-900)] text-[var(--color-neutral-300)]`;

// CR# conflict tags: red while open, grey once resolved.
export const conflictTagClass = (open: boolean) =>
  `${TAG_SHAPE} border transition-colors ${
    open
      ? "border-[color-mix(in_srgb,var(--color-danger)_30%,white)] bg-[color-mix(in_srgb,var(--color-danger)_6%,white)] text-[var(--color-danger)] hover:border-[var(--color-danger)]"
      : "border-[var(--color-neutral-700)] bg-[var(--color-surface)] text-[var(--color-neutral-300)] hover:border-[var(--color-neutral-500)]"
  }`;

// An S# or C# that leads to its row: scrolls there when the row is on this
// page, otherwise opens the step that lists it (Evidence for S#, Claims for C#).
export function RowTag({
  evaluationId,
  code,
  muted = false,
  className = "",
}: {
  evaluationId: string;
  code: string;
  muted?: boolean; // e.g. an evidence link marked wrong
  className?: string;
}) {
  const id = `${code.startsWith("S") ? "source" : "claim"}-${code}`;
  const tab = code.startsWith("S") ? "evidence" : "claims";
  return (
    <Link
      href={`/deals/${evaluationId}?tab=${tab}#${id}`}
      onClick={(e) => {
        e.stopPropagation();
        if (flashTo(id)) e.preventDefault();
      }}
      className={`${
        muted
          ? `${TAG_SHAPE} bg-[var(--color-neutral-900)] text-[var(--color-neutral-500)] line-through`
          : ID_TAG_CLASS
      } ${className}`}
      title={`Show ${code}`}
    >
      {code}
    </Link>
  );
}

// The tag for any ID: CR# as a conflict tag, everything else as a trace tag.
export const tagClassFor = (code: string) => (code.startsWith("CR") ? conflictTagClass(true) : ID_TAG_CLASS);
