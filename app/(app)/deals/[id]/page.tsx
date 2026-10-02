import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import {
  PIPELINE_STEPS,
  QUICK_SCREEN_STATUSES,
  STATUS_LABELS,
  VERDICT_LABELS,
  isStepUnlocked,
  type PipelineTab,
} from "@/lib/evaluation-shared";
import { loadEvaluation } from "@/lib/evaluations";
import { createClient } from "@/lib/supabase/server";
import { EvidenceTab } from "./evidence-tab";
import { QuickScreenTab } from "./quick-screen-tab";

export const metadata: Metadata = {
  title: "Deal · Tracer",
};

export default async function DealPage({ params, searchParams }: PageProps<"/deals/[id]">) {
  await requireUser();
  const { id } = await params;
  const { tab: tabParam } = await searchParams;

  const deal = await loadEvaluation(await createClient(), id);
  if (!deal) notFound();

  const requested = PIPELINE_STEPS.find((s) => s.key === tabParam);
  const tab: PipelineTab =
    requested && isStepUnlocked(requested.step, deal.status, deal.currentStep) ? requested.key : "quick-screen";

  return (
    <>
      <p className="mb-2 text-[13px]">
        <Link href="/deals">← All deals</Link>
      </p>
      <div className="mb-6 flex flex-wrap items-end gap-4">
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

      <nav className="mb-8 flex flex-wrap gap-1 border-b border-[var(--color-divider)] pb-2" aria-label="Pipeline">
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
        <EvidenceTab
          evaluationId={deal.id}
          fundId={deal.fundId}
          documents={deal.documents}
          uploadsOnly={deal.uploadsOnly}
          editable={QUICK_SCREEN_STATUSES.includes(deal.status)}
        />
      ) : (
        <div className="card text-[13px]">
          <p>{PIPELINE_STEPS.find((s) => s.key === tab)?.label}</p>
          <p className="text-muted">This step arrives in a later milestone.</p>
        </div>
      )}
    </>
  );
}
