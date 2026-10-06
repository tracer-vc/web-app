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
import { Drawer } from "@/app/motion";
import { conflictTagClass, RowTag } from "./id-tag";

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
  if (conflicts.length === 0) return null;

  return (
    <section className="card gap-3 p-4" data-testid="conflict-register">
      <div className="text-panel font-semibold">{title}</div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-body">
          <thead className="text-muted text-meta">
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
      <p className="text-muted text-meta">
        An open claim conflict lowers both claims&apos; confidence one level (decision 9); recording a resolution lifts it.
        Open conflicts don&apos;t block later steps; they are shown as open in the outputs.
      </p>
      <Drawer open={Boolean(open)}>
        {open && (
          <ConflictDrawer
            key={open.id}
            evaluationId={evaluationId}
            conflict={open}
            conflicts={conflicts}
            onOpen={setOpenId}
            onClose={() => setOpenId(null)}
          />
        )}
      </Drawer>
    </section>
  );
}

function Side({ evaluationId, side }: { evaluationId: string; side: ConflictSideView }) {
  return (
    <div className="flex flex-col gap-0.5">
      <div>
        <RowTag evaluationId={evaluationId} code={side.code} className="mr-1.5 align-[1px]" />
        {side.text}
      </div>
      <div className="text-muted text-meta">{side.meta}</div>
      <div className="text-muted text-meta">“{side.passage}”</div>
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
    <tr
      id={`conflict-${conflict.code}`}
      className="border-b border-[var(--color-divider)] align-top"
      data-testid="conflict-row"
      data-code={conflict.code}
    >
      <td className="py-2 pr-3">
        <button
          type="button"
          onClick={onOpen}
          title="Open the conflict"
          className={conflictTagClass(conflict.status === "open")}
        >
          {conflict.code}
        </button>
      </td>
      <td className="py-2 pr-3">
        <Side evaluationId={evaluationId} side={conflict.sideA} />
      </td>
      <td className="py-2 pr-3">
        <Side evaluationId={evaluationId} side={conflict.sideB} />
      </td>
      <td className="py-2">
        <div className="mb-1 text-meta">{conflict.description}</div>
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
            className="input min-h-16 text-meta"
            aria-label={`Rationale for ${conflict.code}`}
            placeholder="Rationale (required to resolve): which side holds and why"
            maxLength={MAX_RATIONALE_LENGTH}
            value={rationale}
            onChange={(e) => setRationale(e.target.value)}
          />
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn btn-primary text-meta" onClick={record} disabled={pending || !changed}>
              {pending ? "Saving…" : "Record resolution"}
            </button>
            {saved && <span className="text-meta">Recorded and logged.</span>}
          </div>
          {error && (
            <p role="alert" className="text-danger text-meta">
              {error}
            </p>
          )}
          {conflict.status !== "open" && conflict.resolvedAt && (
            <p className="text-muted text-meta" data-testid="resolution-meta">
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
  evaluationId,
  conflict,
  conflicts,
  onOpen,
  onClose,
}: {
  evaluationId: string;
  conflict: ConflictView;
  conflicts: ConflictView[];
  onOpen: (id: string) => void;
  onClose: () => void;
}) {
  const byCode = (code: string) => conflicts.find((c) => c.code === code);
  const related = [conflict.parentCode, ...conflict.childCodes].filter((c): c is string => !!c);
  return (
    <div
      className="flex flex-col gap-4"
      data-testid="conflict-drawer"
    >
      <div className="flex items-start gap-3">
        <div>
          <div className="mb-1.5 text-meta font-medium text-[var(--color-accent-text)]">
            Conflict {conflict.code} · {conflict.kind}
          </div>
          <h3 className="text-section leading-snug">{conflict.description}</h3>
        </div>
        <button className="btn ml-auto" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-meta">
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
            className={`rounded-md border p-3 text-body ${wins ? "border-[var(--color-accent)]" : "border-[var(--color-divider)]"}`}
          >
            <div className="text-muted mb-1 text-meta">
              Side {k}
              {wins && " · holds"}
            </div>
            <Side evaluationId={evaluationId} side={side} />
          </div>
        );
      })}
      <div className="text-body">
        <div className="text-muted mb-1 text-meta">Rationale</div>
        {conflict.rationale ? conflict.rationale : <span className="text-muted">No resolution recorded yet.</span>}
        {conflict.status !== "open" && conflict.resolvedAt && (
          <div className="text-muted mt-1 text-meta">
            by {conflict.resolvedBy ?? "a former member"} · {fmtDateTime(conflict.resolvedAt)}
          </div>
        )}
      </div>
      {related.length > 0 && (
        <div className="text-body">
          <div className="text-muted mb-1 text-meta">{conflict.parentCode ? "Repeats source conflict" : "Repeated by claim conflicts"}</div>
          <div className="flex gap-2">
            {related.map((code) => (
              <button
                key={code}
                type="button"
                className={conflictTagClass(byCode(code)?.status === "open")}
                onClick={() => byCode(code) && onOpen(byCode(code)!.id)}
              >
                {code}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
