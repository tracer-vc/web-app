import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import {
  OUTPUT_TABS,
  PIPELINE_STEPS,
  QUICK_SCREEN_STATUSES,
  STATUS_LABELS,
  VERDICT_LABELS,
  isStepUnlocked,
  type PipelineTab,
} from "@/lib/evaluation-shared";
import { loadClaimTable } from "@/lib/claims";
import { loadConflictRegister } from "@/lib/conflicts";
import { loadCounterCase } from "@/lib/counter-case";
import { loadDimensions } from "@/lib/dimensions";
import { loadOutputs } from "@/lib/outputs";
import { loadEvaluation } from "@/lib/evaluations";
import { isRunActive } from "@/lib/source-shared";
import { loadSourceTable } from "@/lib/sources";
import { createClient } from "@/lib/supabase/server";
import { ClaimsTab } from "./claims-tab";
import { CounterCaseTab } from "./counter-case-tab";
import { DimensionsTab } from "./dimensions-tab";
import { OutputsTab } from "./outputs";
import { EvidenceTab } from "./evidence-tab";
import { QuickScreenTab } from "./quick-screen-tab";

export const metadata: Metadata = {
  title: "Deal · Tracer",
};

export default async function DealPage({ params, searchParams }: PageProps<"/deals/[id]">) {
  await requireUser();
  const { id } = await params;
  const { tab: tabParam } = await searchParams;

  const supabase = await createClient();
  const deal = await loadEvaluation(supabase, id);
  if (!deal) notFound();

  const requested = [...PIPELINE_STEPS, ...OUTPUT_TABS].find((s) => s.key === tabParam);
  const tab: PipelineTab =
    requested && isStepUnlocked(requested.step, deal.status, deal.currentStep) ? requested.key : "quick-screen";

  return (
    <>
      <p className="mb-2 text-[13px] print:hidden">
        <Link href="/deals">← All deals</Link>
      </p>
      <div className="mb-6 flex flex-wrap items-end gap-4 print:hidden">
        <div>
          <h1 className="mb-1.5 text-3xl">{deal.company.name}</h1>
          <p className="text-muted text-[13px]">
            {[deal.company.stage, deal.company.sector].filter(Boolean).join(" · ") || "No stage or sector"}
          </p>
        </div>
        <div className="ml-auto flex flex-col items-end gap-1 text-xs">
          {deal.memo && (
            <span className="tag tag-neutral">
              {VERDICT_LABELS[deal.memo.verdict]} · Quick Screen{deal.memo.overridden && " · overridden"}
            </span>
          )}
          <span className="text-muted">
            {STATUS_LABELS[deal.status]} · Evaluator {deal.evaluator ?? "—"} · Config v{deal.configVersion}
          </span>
        </div>
      </div>

      <nav className="mb-8 flex flex-wrap gap-1 border-b border-[var(--color-divider)] pb-2 print:hidden" aria-label="Pipeline">
        {PIPELINE_STEPS.map((s) => {
          const unlocked = isStepUnlocked(s.step, deal.status, deal.currentStep);
          const active = s.key === tab;
          const dot = (
            <span
              className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] ${
                active ? "bg-[var(--color-accent-800)] text-[var(--color-accent-300)]" : "bg-[var(--color-neutral-800)]"
              }`}
            >
              {s.step}
            </span>
          );
          return unlocked ? (
            <Link
              key={s.key}
              href={`/deals/${deal.id}?tab=${s.key}`}
              aria-current={active ? "page" : undefined}
              className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-[13px] no-underline ${
                active ? "bg-[var(--color-accent-800)]/40 text-[var(--color-accent-300)]" : "text-[var(--color-neutral-300)]"
              }`}
            >
              {dot}
              {s.label}
            </Link>
          ) : (
            <span
              key={s.key}
              title="Locked until the pipeline reaches this step"
              className="flex cursor-not-allowed items-center gap-2 px-3 py-1.5 text-[13px] text-[var(--color-neutral-600)]"
            >
              {dot}
              {s.label}
            </span>
          );
        })}
        <span className="mx-2 self-center text-[var(--color-neutral-700)]" aria-hidden>
          |
        </span>
        {OUTPUT_TABS.map((s) => {
          const unlocked = isStepUnlocked(s.step, deal.status, deal.currentStep);
          const active = s.key === tab;
          return unlocked ? (
            <Link
              key={s.key}
              href={`/deals/${deal.id}?tab=${s.key}`}
              aria-current={active ? "page" : undefined}
              className={`rounded-md px-3 py-1.5 text-[13px] no-underline ${
                active ? "bg-[var(--color-accent-800)]/40 text-[var(--color-accent-300)]" : "text-[var(--color-neutral-300)]"
              }`}
            >
              {s.label}
            </Link>
          ) : (
            <span
              key={s.key}
              title="Unlocks once outputs are generated"
              className="cursor-not-allowed px-3 py-1.5 text-[13px] text-[var(--color-neutral-600)]"
            >
              {s.label}
            </span>
          );
        })}
      </nav>

      {tab === "quick-screen" ? (
        <QuickScreenTab
          evaluationId={deal.id}
          fundId={deal.fundId}
          questions={deal.questions}
          answers={deal.answers}
          documents={deal.documents}
          memo={deal.memo}
          editable={QUICK_SCREEN_STATUSES.includes(deal.status)}
        />
      ) : tab === "evidence" ? (
        <EvidenceSection deal={deal} supabase={supabase} />
      ) : tab === "claims" ? (
        <ClaimsTab
          evaluationId={deal.id}
          canExtract={deal.status === "collecting" || deal.status === "extracting"}
          table={await loadClaimTable(supabase, deal.id, deal.configId)}
          conflicts={await loadConflictRegister(supabase, deal.id)}
          canStressTest={deal.status === "extracting"}
          stressTestStarted={deal.currentStep >= 4}
        />
      ) : tab === "counter-case" ? (
        <CounterCaseTab
          evaluationId={deal.id}
          canRun={deal.status === "stress_testing"}
          view={await loadCounterCase(supabase, deal.id, deal.configId)}
          claimTable={await loadClaimTable(supabase, deal.id, deal.configId)}
          conflicts={await loadConflictRegister(supabase, deal.id)}
          canScore={deal.status === "stress_testing"}
          scoringStarted={deal.currentStep >= 5}
        />
      ) : tab === "dimensions" ? (
        <DimensionsTab
          evaluationId={deal.id}
          canRun={deal.status === "scoring"}
          view={await loadDimensions(supabase, deal.id, deal.configId)}
          counterCase={await loadCounterCase(supabase, deal.id, deal.configId)}
          claimTable={await loadClaimTable(supabase, deal.id, deal.configId)}
          canSynthesize={deal.status === "scoring"}
          synthesisStarted={deal.currentStep >= 6}
        />
      ) : (
        <OutputsSection deal={deal} supabase={supabase} doc={tab} />
      )}
    </>
  );
}

async function OutputsSection({
  deal,
  supabase,
  doc,
}: {
  deal: NonNullable<Awaited<ReturnType<typeof loadEvaluation>>>;
  supabase: Awaited<ReturnType<typeof createClient>>;
  doc: "thesis-card" | "decision-snapshot" | "evidence-pack";
}) {
  const [outputs, claimTable, counterCase, dimensions, sourceTable, conflicts] = await Promise.all([
    loadOutputs(supabase, deal.id, deal.configId),
    loadClaimTable(supabase, deal.id, deal.configId),
    loadCounterCase(supabase, deal.id, deal.configId),
    loadDimensions(supabase, deal.id, deal.configId),
    loadSourceTable(supabase, deal.id, deal.configId),
    loadConflictRegister(supabase, deal.id),
  ]);
  return (
    <OutputsTab
      doc={doc}
      evaluationId={deal.id}
      header={{
        name: deal.company.name,
        stage: deal.company.stage,
        sector: deal.company.sector,
        evaluator: deal.evaluator,
        configVersion: deal.configVersion,
      }}
      outputs={outputs}
      bundle={{ claimTable, counterCase, dimensions, sources: sourceTable.sources, conflicts }}
      canRun={deal.status === "synthesizing"}
    />
  );
}

async function EvidenceSection({
  deal,
  supabase,
}: {
  deal: NonNullable<Awaited<ReturnType<typeof loadEvaluation>>>;
  supabase: Awaited<ReturnType<typeof createClient>>;
}) {
  const [table, conflicts] = await Promise.all([
    loadSourceTable(supabase, deal.id, deal.configId),
    loadConflictRegister(supabase, deal.id),
  ]);
  const started = table.sources.length > 0 || isRunActive(table.run);
  return (
    <EvidenceTab
      evaluationId={deal.id}
      fundId={deal.fundId}
      documents={deal.documents}
      uploadsOnly={deal.uploadsOnly}
      canBuild={deal.status === "collecting"}
      claimsStarted={deal.currentStep >= 3}
      materialsEditable={QUICK_SCREEN_STATUSES.includes(deal.status) && !started}
      table={table}
      conflicts={conflicts.filter((c) => c.kind === "source")}
    />
  );
}
