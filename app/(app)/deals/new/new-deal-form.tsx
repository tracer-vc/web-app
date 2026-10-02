"use client";

import { useActionState } from "react";
import { createDeal } from "@/app/actions/deals";

const STAGES = ["Pre-Seed", "Seed", "Series A", "Series B", "Series C", "Growth"];

export function NewDealForm() {
  const [state, action, pending] = useActionState(createDeal, undefined);
  const v = state?.values;

  return (
    <form action={action} className="card max-w-xl gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-muted text-xs">Company name</span>
        <input className="input" name="name" required maxLength={200} autoFocus defaultValue={v?.name} />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-muted text-xs">Stage</span>
          <input
            className="input"
            name="stage"
            list="stages"
            maxLength={60}
            placeholder="e.g. Seed"
            defaultValue={v?.stage}
          />
          <datalist id="stages">
            {STAGES.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-muted text-xs">Sector</span>
          <input
            className="input"
            name="sector"
            maxLength={200}
            placeholder="e.g. Climate software"
            defaultValue={v?.sector}
          />
        </label>
      </div>
      <label className="flex flex-col gap-1.5">
        <span className="text-muted text-xs">Website</span>
        <input className="input" name="website" maxLength={500} placeholder="https://" defaultValue={v?.website} />
      </label>
      <p className="text-muted text-xs">
        If the company already exists in your fund, this opens a new evaluation for it. The deal uses the
        fund&apos;s current configuration version from now on.
      </p>
      {state?.error && (
        <p role="alert" className="text-danger text-[13px]">
          {state.error}
        </p>
      )}
      <div>
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Creating…" : "Create deal and start Quick Screen"}
        </button>
      </div>
    </form>
  );
}
