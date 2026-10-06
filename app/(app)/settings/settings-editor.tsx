"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import type { ConfigView, VersionSummary } from "@/lib/config-shared";
import { call, toBody, toModel, type Model } from "./config-model";
import { ConfigSectionBody } from "./config-section-body";
import { toConfigSection } from "./config-sections";
import { useUnsaved } from "./unsaved";

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
  const section = toConfigSection(useSearchParams().get("section"));
  const { setDirty } = useUnsaved();
  const [model, setModel] = useState<Model | null>(draft ? toModel(draft) : null);
  const [saved, setSaved] = useState(() => (draft ? JSON.stringify(toBody(toModel(draft))) : ""));
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  const dirty = useMemo(() => (model ? JSON.stringify(toBody(model)) !== saved : false), [model, saved]);
  const editing = !!model && !viewing;
  const shown = viewing ?? draft ?? active;
  // Read-only views use the same model shape as the editor.
  const view = useMemo(() => (editing ? model! : shown ? toModel(shown) : null), [editing, model, shown]);

  useEffect(() => {
    setDirty(dirty);
    return () => setDirty(false);
  }, [dirty, setDirty]);

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
  const saveDraft = () =>
    run(async () => {
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

  const update =
    <K extends keyof Model>(key: K) =>
    (value: Model[K]) =>
      setModel((m) => (m ? { ...m, [key]: value } : m));

  return (
    <>
      {/* Status bar: which version is shown and what can be done with it.
          Pinned below the top bar so the draft actions stay in reach. */}
      <div className="sticky top-[60px] z-[3] -mt-6 max-w-[880px] bg-[var(--color-bg)] pt-6 pb-6">
        <div className="panel flex flex-wrap items-center gap-x-4 gap-y-3 px-5 py-3.5" data-testid="config-status">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <span
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-meta font-medium whitespace-nowrap ${
                viewing || (draft && dirty)
                  ? "bg-[var(--color-neutral-900)] text-[var(--color-neutral-300)]"
                  : "bg-[var(--color-accent-tint)] text-[var(--color-accent-text)]"
              }`}
              data-testid="config-version"
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  viewing || (draft && dirty) ? "bg-[var(--color-neutral-500)]" : "bg-[var(--color-accent)]"
                }`}
              />
              {viewing ? `Viewing v${viewing.version}` : draft ? `Draft v${draft.version}` : `Active v${active?.version ?? "–"}`}
            </span>
            <span className="text-muted min-w-0 text-body">
              {viewing
                ? `${viewing.status === "draft" ? "Draft" : viewing.isActive ? "Active" : "Inactive"} version, read-only. Published versions never change.`
                : draft
                  ? `${dirty ? "Unsaved changes" : "All changes saved"} · v${active?.version ?? "–"} stays active until you publish.`
                  : "Applied unchanged to every new evaluation. Deals keep the version they started with."}
            </span>
          </div>
          <div className="flex shrink-0 gap-1.5">
            {viewing ? (
              <Link className="btn" href={`/settings/config?section=${section}`}>
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
          <p role={error ? "alert" : "status"} className={`mt-3 px-1 text-body ${error ? "text-danger" : ""}`}>
            {error ?? notice}
          </p>
        )}
      </div>

      <div className="max-w-[880px]">
        <ConfigSectionBody
          section={section}
          view={view}
          shown={shown}
          update={editing ? update : undefined}
          versions={versions}
          fundName={fundName}
        />
        </div>
    </>
  );
}
