"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setDevMode } from "@/app/actions/preferences";

// Personal preferences, shown to admins and analysts alike.
export function Preferences({ devMode }: { devMode: boolean }) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(devMode);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggle() {
    const next = !enabled;
    setEnabled(next);
    setError(null);
    startTransition(async () => {
      const result = await setDevMode(next);
      if (result.error) {
        setEnabled(!next);
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <section className="card p-5" data-testid="preferences">
      <div className="flex items-start gap-4">
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-labelledby="dev-mode-label"
          onClick={toggle}
          disabled={pending}
          data-testid="dev-mode-toggle"
          className={`relative mt-0.5 inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors disabled:opacity-60 ${
            enabled
              ? "bg-[var(--color-accent)]"
              : "bg-[var(--color-neutral-700)]"
          }`}
        >
          <span
            className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
              enabled ? "translate-x-[18px]" : "translate-x-0.5"
            }`}
          />
        </button>
        <div>
          <div id="dev-mode-label" className="text-reading font-medium">
            Dev mode
          </div>
          <p className="text-muted text-body">
            Shows developer views: the model calls behind each run and, for
            admins, the Study tab.
          </p>
          {error && <p className="text-danger mt-1 text-body">{error}</p>}
        </div>
      </div>
    </section>
  );
}
