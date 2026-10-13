"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { LuTrash2 } from "react-icons/lu";

// "Delete deal" in the deal sidebar: confirm inline, delete the deal with all
// its materials and outputs, then go back to the deal list.
export function DeleteDeal({ evaluationId, companyName }: { evaluationId: string; companyName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function confirm() {
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/evaluations/${evaluationId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Couldn't delete the deal.");
        return;
      }
      router.push("/deals");
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button type="button" className="sidebar-item text-danger w-full text-left" onClick={() => setOpen(true)} data-testid="delete-deal">
        <LuTrash2 aria-hidden className="sidebar-icon" />
        Delete deal
      </button>
    );
  }
  return (
    <div className="mx-2.5 mt-1 flex flex-col gap-2 rounded-md border border-[var(--color-danger)]/50 p-3 text-meta" data-testid="delete-deal-confirm">
      <p>
        Delete <span className="font-medium">{companyName}</span> with all its materials, sources, claims and outputs? This can&apos;t
        be undone. The deletion is logged.
      </p>
      <div className="flex gap-2">
        <button type="button" className="btn btn-primary text-meta" onClick={confirm} disabled={pending}>
          {pending ? "Deleting…" : "Delete"}
        </button>
        <button type="button" className="btn text-meta" onClick={() => setOpen(false)} disabled={pending}>
          Cancel
        </button>
      </div>
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
