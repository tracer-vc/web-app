"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  CONFLICT_STATUS_LABELS,
  MAX_RATIONALE_LENGTH,
  type ConflictSideView,
  type ConflictStatus,
  type ConflictView,
} from "@/lib/conflict-shared";

const STATUSES: ConflictStatus[] = ["open", "resolved_a", "resolved_b", "unresolvable"];

const fmtDateTime = (d: string) =>
  new Date(d).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

// Conflict Register (ui_design.html): both sides retained, status mandatory,
// a resolution needs a rationale. The database stamps who and when.
export function ConflictRegister({
  evaluationId,
  conflicts,
  title = "Conflict Register",
}: {
  evaluationId: string;
  conflicts: ConflictView[];
  title?: string;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = conflicts.find((c) => c.id === openId) ?? null;
  const openCount = conflicts.filter((c) => c.status === "open").length;
  if (conflicts.length === 0) return null;

  return (
    <section className="card gap-3 p-4" data-testid="conflict-register">
      <div className="flex flex-wrap items-baseline gap-2">
        <div className="text-[10px] tracking-widest text-[var(--color-accent)] uppercase">{title}</div>
        <span className="text-muted text-xs">
          {conflicts.length} conflict{conflicts.length === 1 ? "" : "s"} · {openCount} open · both sides retained · status is
          mandatory
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-[13px]">
          <thead className="text-muted text-xs">
            <tr className="border-b border-[var(--color-divider)]">
              <th className="w-14 py-2 pr-3 font-normal">ID</th>
              <th className="py-2 pr-3 font-normal">Side A</th>
              <th className="py-2 pr-3 font-normal">Side B</th>
              <th className="w-[300px] py-2 font-normal">Resolution status</th>
            </tr>
          </thead>
          <tbody>
            {conflicts.map((c) => (
              <ConflictRow key={c.id} evaluationId={evaluationId} conflict={c} onOpen={() => setOpenId(c.id)} />
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-muted text-[11px]">
        An open claim conflict lowers both claims&apos; confidence one level (decision 9); recording a resolution lifts it.
        Open conflicts don&apos;t block later steps; they are shown as open in the outputs.
      </p>
      {open && <ConflictDrawer conflict={open} conflicts={conflicts} onOpen={setOpenId} onClose={() => setOpenId(null)} />}
    </section>
  );
}

function Side({ side }: { side: ConflictSideView }) {
  return (
    <div className="flex flex-col gap-0.5">
      <div>
        <span className="font-mono text-[11px] text-[var(--color-neutral-300)]">{side.code}</span> {side.text}
      </div>
      <div className="text-muted text-[11px]">{side.meta}</div>
      <div className="text-muted text-xs">“{side.passage}”</div>
    </div>
  );
}

function ConflictRow({ evaluationId, conflict, onOpen }: { evaluationId: string; conflict: ConflictView; onOpen: () => void }) {
  const router = useRouter();
  const [status, setStatus] = useState<ConflictStatus>(conflict.status);
  const [rationale, setRationale] = useState(conflict.rationale ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const changed = status !== conflict.status || rationale.trim() !== (conflict.rationale ?? "");

  function record() {
    setError(null);
    setSaved(false);
    if (status !== "open" && !rationale.trim()) {
      setError("A resolution needs a rationale.");
      return;
    }
    startTransition(async () => {
      const res = await fetch(`/api/evaluations/${evaluationId}/conflicts/${conflict.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, rationale: rationale.trim() || undefined }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Couldn't record the resolution.");
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <tr className="border-b border-[var(--color-divider)] align-top" data-testid="conflict-row" data-code={conflict.code}>
      <td className="py-2 pr-3">
        <button className="font-mono text-[11px] underline" onClick={onOpen}>
          {conflict.code}
        </button>
        <div className="text-muted text-[10px]">{conflict.kind}</div>
      </td>
      <td className="py-2 pr-3">
        <Side side={conflict.sideA} />
      </td>
      <td className="py-2 pr-3">
        <Side side={conflict.sideB} />
      </td>
      <td className="py-2">
        <div className="mb-1 text-xs">{conflict.description}</div>
        <div className="flex flex-col gap-1.5">
          <select
            className="input"
            aria-label={`Status of ${conflict.code}`}
            value={status}
            onChange={(e) => setStatus(e.target.value as ConflictStatus)}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {CONFLICT_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
          <textarea
            className="input min-h-16 text-xs"
            aria-label={`Rationale for ${conflict.code}`}
            placeholder="Rationale (required to resolve): which side holds and why"
            maxLength={MAX_RATIONALE_LENGTH}
            value={rationale}
            onChange={(e) => setRationale(e.target.value)}
          />
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn btn-primary text-xs" onClick={record} disabled={pending || !changed}>
              {pending ? "Saving…" : "Record resolution"}
            </button>
            {saved && <span className="text-xs">Recorded and logged.</span>}
          </div>
          {error && (
            <p role="alert" className="text-danger text-xs">
              {error}
            </p>
          )}
          {conflict.status !== "open" && conflict.resolvedAt && (
            <p className="text-muted text-[11px]" data-testid="resolution-meta">
              {CONFLICT_STATUS_LABELS[conflict.status]} by {conflict.resolvedBy ?? "a former member"} ·{" "}
              {fmtDateTime(conflict.resolvedAt)}
            </p>
          )}
        </div>
      </td>
    </tr>
  );
}

function ConflictDrawer({
  conflict,
  conflicts,
  onOpen,
  onClose,
}: {
  conflict: ConflictView;
  conflicts: ConflictView[];
  onOpen: (id: string) => void;
  onClose: () => void;
}) {
  const byCode = (code: string) => conflicts.find((c) => c.code === code);
  const related = [conflict.parentCode, ...conflict.childCodes].filter((c): c is string => !!c);
  return (
    <aside
      className="fixed top-0 right-0 z-20 flex h-full w-full max-w-xl flex-col gap-4 overflow-y-auto border-l border-[var(--color-divider)] bg-[var(--color-surface)] p-6 shadow-2xl"
      data-testid="conflict-drawer"
    >
      <div className="flex items-start gap-3">
        <div>
          <div className="text-[10px] tracking-widest text-[var(--color-accent)] uppercase">
            Conflict {conflict.code} · {conflict.kind}
          </div>
          <h3 className="text-lg leading-snug">{conflict.description}</h3>
        </div>
        <button className="btn ml-auto" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className={`tag ${conflict.status === "open" ? "text-danger tag-outline" : "tag-accent"}`}>
          {CONFLICT_STATUS_LABELS[conflict.status]}
        </span>
        <span className="text-muted">detected during {conflict.kind === "source" ? "evidence collection" : "claim extraction"}</span>
      </div>
      {(["A", "B"] as const).map((k) => {
        const side = k === "A" ? conflict.sideA : conflict.sideB;
        const wins = conflict.status === (k === "A" ? "resolved_a" : "resolved_b");
        return (
          <div
            key={k}
            className={`rounded-md border p-3 text-[13px] ${wins ? "border-[var(--color-accent)]" : "border-[var(--color-divider)]"}`}
          >
            <div className="text-muted mb-1 text-xs">
              Side {k}
              {wins && " · holds"}
            </div>
            <Side side={side} />
          </div>
        );
      })}
      <div className="text-[13px]">
        <div className="text-muted mb-1 text-xs">Rationale</div>
        {conflict.rationale ? conflict.rationale : <span className="text-muted">No resolution recorded yet.</span>}
        {conflict.status !== "open" && conflict.resolvedAt && (
          <div className="text-muted mt-1 text-xs">
            by {conflict.resolvedBy ?? "a former member"} · {fmtDateTime(conflict.resolvedAt)}
          </div>
        )}
      </div>
      {related.length > 0 && (
        <div className="text-[13px]">
          <div className="text-muted mb-1 text-xs">{conflict.parentCode ? "Repeats source conflict" : "Repeated by claim conflicts"}</div>
          <div className="flex gap-2">
            {related.map((code) => (
              <button key={code} className="tag tag-neutral" onClick={() => byCode(code) && onOpen(byCode(code)!.id)}>
                {code}
              </button>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}
