import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import {
  OUTPUT_TABS,
  PIPELINE_STEPS,
  QUICK_SCREEN_STATUSES,
  isStepUnlocked,
  type PipelineTab,
} from "@/lib/evaluation-shared";
import { loadClaimTable } from "@/lib/claims";
import { loadConflictRegister } from "@/lib/conflicts";
import { loadCounterCase } from "@/lib/counter-case";
import { loadDimensions } from "@/lib/dimensions";
import { loadOutputs } from "@/lib/outputs";
import { baselineRunDoc, loadStudy } from "@/lib/study";
import { loadEvaluation } from "@/lib/evaluations";
import { isRunActive } from "@/lib/source-shared";
import { loadSourceTable } from "@/lib/sources";
import { createClient } from "@/lib/supabase/server";
import { FadeIn } from "@/app/motion";
import { ClaimsTab } from "./claims-tab";
import { CounterCaseTab } from "./counter-case-tab";
import { DealSidebar } from "./deal-sidebar";
import { DimensionsTab } from "./dimensions-tab";
import { OutputsTab } from "./outputs";
import { StudyTab } from "./study-tab";
import { EvidenceTab } from "./evidence-tab";
import { QuickScreenTab } from "./quick-screen-tab";

export const metadata: Metadata = {
  title: "Deal · Tracer",
};

export default async function DealPage({ params, searchParams }: PageProps<"/deals/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const { tab: tabParam } = await searchParams;

  const supabase = await createClient();
  const deal = await loadEvaluation(supabase, id);
  if (!deal) notFound();

  const requested = [...PIPELINE_STEPS, ...OUTPUT_TABS].find((s) => s.key === tabParam);
  // Study 2 (decision 44): fund admins, on original deals only.
  const showStudy = user.devMode && user.role === "admin" && deal.studyParentId === null;
  const tab: PipelineTab | "study" =
    tabParam === "study" && showStudy
      ? "study"
      : requested && isStepUnlocked(requested.step, deal.status, deal.currentStep)
        ? requested.key
        : "quick-screen";

  return (
    <>
      <DealSidebar deal={deal} tab={tab} showStudy={showStudy} />
      <div className="md:ml-[264px] print:ml-0">
        {deal.studyParentId && (
          <p className="tag tag-outline mb-6 print:hidden" data-testid="study-copy-banner">
            Study 2 · artifact run {deal.studyRun} (hidden copy) ·{" "}
            <Link href={`/deals/${deal.studyParentId}?tab=study`} className="ml-1">
              back to the original deal
            </Link>
          </p>
        )}
        {/* Re-keyed per tab: switching tabs fades the new step in; live refreshes of the same tab don't. */}
        <FadeIn key={tab}>
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
              key={deal.updatedAt}
              hasOutputs={deal.status === "complete"}
              evaluationId={deal.id}
              canExtract={deal.status === "collecting" || deal.status === "extracting"}
              table={await loadClaimTable(supabase, deal.id, deal.configId)}
              conflicts={await loadConflictRegister(supabase, deal.id)}
              canStressTest={deal.status === "extracting"}
              stressTestStarted={deal.currentStep >= 4}
            />
          ) : tab === "counter-case" ? (
            <CounterCaseTab
              key={deal.updatedAt}
              hasOutputs={deal.status === "complete"}
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
              key={deal.updatedAt}
              hasOutputs={deal.status === "complete"}
              evaluationId={deal.id}
              canRun={deal.status === "scoring"}
              view={await loadDimensions(supabase, deal.id, deal.configId)}
              counterCase={await loadCounterCase(supabase, deal.id, deal.configId)}
              claimTable={await loadClaimTable(supabase, deal.id, deal.configId)}
              canSynthesize={deal.status === "scoring"}
              synthesisStarted={deal.currentStep >= 6}
            />
          ) : tab === "study" ? (
            <StudySection deal={deal} supabase={supabase} />
          ) : (
            <OutputsSection deal={deal} supabase={supabase} doc={tab} />
          )}
        </FadeIn>
      </div>
    </>
  );
}

async function StudySection({
  deal,
  supabase,
}: {
  deal: NonNullable<Awaited<ReturnType<typeof loadEvaluation>>>;
  supabase: Awaited<ReturnType<typeof createClient>>;
}) {
  const study = await loadStudy(supabase, deal.id);
  const baselineDocs = Object.fromEntries(
    study.baselines.filter((b) => b.content).map((b) => [b.id, baselineRunDoc(b, `Baseline run ${b.run}`, deal.company.name)]),
  );
  return <StudyTab key={deal.updatedAt} evaluationId={deal.id} study={study} baselineDocs={baselineDocs} />;
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
      key={deal.updatedAt}
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
      key={deal.updatedAt}
      hasOutputs={deal.status === "complete"}
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
