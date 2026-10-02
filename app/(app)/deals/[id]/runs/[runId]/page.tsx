import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Run · Tracer",
};

const STEP_LABELS: Record<number, string> = {
  1: "Quick Screen",
  2: "Source Table",
  3: "Claim extraction",
  4: "Counter-case",
  5: "Dimension scoring",
  6: "Outputs",
};

const fmt = (d: string | null) =>
  d ? new Date(d).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—";

// A pipeline run with every model call it made (the llm_calls audit log):
// where a failed or warned run went wrong.
export default async function RunPage({ params }: PageProps<"/deals/[id]/runs/[runId]">) {
  await requireUser();
  const { id, runId } = await params;
  const supabase = await createClient();

  const [{ data: run }, { data: calls }] = await Promise.all([
    supabase
      .from("pipeline_runs")
      .select("id, step, status, progress, error, warnings, notes, started_at, finished_at, superseded_at, evaluation:evaluations(company:companies(name))")
      .eq("id", runId)
      .eq("evaluation_id", id)
      .maybeSingle(),
    supabase
      .from("llm_calls")
      .select("id, prompt_key, prompt_version, model, attempt, input, output, validation_errors, error, input_tokens, output_tokens, latency_ms, created_at")
      .eq("run_id", runId)
      .order("created_at"),
  ]);
  if (!run) notFound();
  const list = calls ?? [];
  const failed = list.filter((c) => c.error || c.validation_errors);

  return (
    <>
      <p className="mb-2 text-[13px]">
        <Link href={`/deals/${id}`}>← {run.evaluation.company.name}</Link>
      </p>
      <h1 className="mb-1.5 text-3xl">
        Step {run.step} · {STEP_LABELS[run.step] ?? "Run"}
      </h1>
      <p className="text-muted mb-6 text-[13px]" data-testid="run-status">
        {run.status}
        {run.superseded_at && " · superseded by a re-run"} · started {fmt(run.started_at)} · finished {fmt(run.finished_at)} ·{" "}
        {list.length} model call{list.length === 1 ? "" : "s"}, {failed.length} rejected or failed
      </p>

      {(run.error || run.warnings.length > 0 || run.notes.length > 0) && (
        <section className="card mb-6 gap-1 text-[13px]">
          {run.error && (
            <p role="alert" className="text-danger" data-testid="run-error">
              {run.error}
            </p>
          )}
          {run.warnings.map((w) => (
            <p key={w} className="text-danger text-xs">
              ⚠ {w}
            </p>
          ))}
          {run.notes.map((n) => (
            <p key={n} className="text-muted text-xs">
              {n}
            </p>
          ))}
        </section>
      )}

      <div className="flex flex-col gap-2">
        {list.map((c) => {
          const bad = Boolean(c.error || c.validation_errors);
          const errors = (c.validation_errors as string[] | null) ?? [];
          return (
            <details
              key={c.id}
              className={`card gap-2 p-3 text-[13px] ${bad ? "border border-[var(--color-danger)]/50" : ""}`}
              open={bad}
              data-testid="llm-call"
              data-failed={bad}
            >
              <summary className="cursor-pointer">
                <span className="font-mono">
                  {c.prompt_key} v{c.prompt_version}
                </span>{" "}
                · attempt {c.attempt} · {c.model} · {c.latency_ms ?? "—"} ms · {c.input_tokens ?? "—"}/{c.output_tokens ?? "—"} tokens ·{" "}
                <span className={bad ? "text-danger" : "text-muted"}>{c.error ? "failed" : errors.length ? "rejected by validation" : "ok"}</span>
                <span className="text-muted"> · {fmt(c.created_at)}</span>
              </summary>
              {c.error && (
                <p className="text-danger text-xs" data-testid="call-error">
                  {c.error}
                </p>
              )}
              {errors.length > 0 && (
                <ul className="text-danger list-disc pl-5 text-xs">
                  {errors.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              )}
              <div className="grid gap-2 md:grid-cols-2">
                <div>
                  <div className="text-muted mb-1 text-xs">Input</div>
                  <pre className="max-h-80 overflow-auto rounded bg-[var(--color-bg)] p-2 text-[11px] whitespace-pre-wrap">
                    {JSON.stringify(c.input, null, 2)}
                  </pre>
                </div>
                <div>
                  <div className="text-muted mb-1 text-xs">Output</div>
                  <pre className="max-h-80 overflow-auto rounded bg-[var(--color-bg)] p-2 text-[11px] whitespace-pre-wrap">
                    {c.output === null ? "—" : JSON.stringify(c.output, null, 2)}
                  </pre>
                </div>
              </div>
            </details>
          );
        })}
        {list.length === 0 && <p className="text-muted text-[13px]">No model calls were made in this run.</p>}
      </div>
    </>
  );
}
