"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { DocumentView } from "@/lib/evaluation-shared";
import { MaterialsSection } from "./materials-section";

// Step 2: the deal's materials (shared with the Quick Screen, decision 34),
// the uploads-only switch (decision 28) and, from M7, the Source Table.
export function EvidenceTab({
  evaluationId,
  fundId,
  documents,
  uploadsOnly,
  editable,
}: {
  evaluationId: string;
  fundId: string;
  documents: DocumentView[];
  uploadsOnly: boolean;
  editable: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState(uploadsOnly);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const readable = documents.filter((d) => d.status === "extracted").length;

  function toggle(next: boolean) {
    setError(null);
    setValue(next);
    startTransition(async () => {
      const res = await fetch(`/api/evaluations/${evaluationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uploads_only: next }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setValue(!next);
        setError(data?.error ?? "Couldn't change the setting.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="mb-1 text-[22px]">Evidence Collection</h2>
        <p className="text-muted text-[13px]">
          Uploads {value ? "only" : "+ web search"} → Source Table (S#), each source tiered and checked against the
          Collection Prompts.
        </p>
      </div>

      <MaterialsSection evaluationId={evaluationId} fundId={fundId} documents={documents} editable={editable} />

      <section className="card gap-3">
        <label className="flex items-start gap-3 text-[13px]">
          <input
            type="checkbox"
            className="mt-1"
            checked={value}
            disabled={!editable || pending}
            onChange={(e) => toggle(e.target.checked)}
            data-testid="uploads-only"
          />
          <span>
            <span className="font-medium">Uploads only (no web search)</span>
            <span className="text-muted block">
              Build the Source Table from the uploaded materials alone. Can be changed until the Source Table is
              built.
            </span>
          </span>
        </label>
        {error && (
          <p role="alert" className="text-danger text-[13px]">
            {error}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3 border-t border-[var(--color-divider)] pt-3">
          <button className="btn btn-primary" disabled title="Arrives in M7">
            Build Source Table
          </button>
          <span className="text-muted text-[13px]">
            {readable} document{readable === 1 ? "" : "s"} with readable text. Building the Source Table arrives in
            the next milestone.
          </span>
        </div>
      </section>
    </div>
  );
}
