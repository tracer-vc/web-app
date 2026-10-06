import Link from "next/link";
import { LuArrowLeft, LuCheck, LuFileText, LuFlaskConical, LuGauge, LuLock, LuPackage } from "react-icons/lu";
import {
  OUTPUT_TABS,
  PIPELINE_STEPS,
  STATUS_LABELS,
  VERDICT_LABELS,
  isStepUnlocked,
  type EvaluationView,
  type PipelineTab,
} from "@/lib/evaluation-shared";
import { NavHighlight } from "@/app/motion";

const OUTPUT_ICONS = {
  "thesis-card": LuFileText,
  "decision-snapshot": LuGauge,
  "evidence-pack": LuPackage,
} as const;

function initials(name: string) {
  const parts = name.split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : name.slice(0, 2)).toUpperCase();
}

// Deal navigation and summary: fixed to the left edge below the top bar on
// wide screens (same shell as the settings sidebar).
export function DealSidebar({
  deal,
  tab,
  showStudy,
}: {
  deal: EvaluationView;
  tab: PipelineTab | "study";
  showStudy: boolean;
}) {
  const stoppedEarly = deal.status === "passed" || deal.status === "watch";
  const href = (key: string) => `/deals/${deal.id}?tab=${key}`;
  const subtitle = [deal.company.stage, deal.company.sector].filter(Boolean).join(" · ") || "No stage or sector";

  return (
    <aside className="app-sidebar print:hidden" aria-label="Deal">
      <Link href="/deals" className="sidebar-item mb-3 w-fit text-meta">
        <LuArrowLeft aria-hidden className="h-3.5 w-3.5" />
        All deals
      </Link>

      <div className="mx-2.5 mb-2 flex items-center gap-3">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--color-accent-tint)] text-body font-medium text-[var(--color-accent-text)]">
          {initials(deal.company.name)}
        </span>
        <div className="min-w-0">
          <h1 className="text-section truncate font-semibold tracking-normal" title={deal.company.name}>
            {deal.company.name}
          </h1>
          <p className="text-muted truncate text-meta" title={subtitle}>
            {subtitle}
          </p>
        </div>
      </div>


      <div className="sidebar-group">Outputs</div>
      {OUTPUT_TABS.map((s) => {
        const unlocked = isStepUnlocked(s.step, deal.status, deal.currentStep);
        const Icon = OUTPUT_ICONS[s.key];
        return unlocked ? (
          <Link key={s.key} href={href(s.key)} aria-current={tab === s.key ? "page" : undefined} className="sidebar-item">
            {tab === s.key && <NavHighlight id="deal-nav" />}
            <Icon aria-hidden className="sidebar-icon" />
            {s.label}
          </Link>
        ) : (
          <span key={s.key} title="Unlocks once outputs are generated" className="sidebar-item sidebar-item-locked">
            <Icon aria-hidden className="sidebar-icon" />
            {s.label}
            <LuLock aria-hidden className="ml-auto h-3 w-3" />
          </span>
        );
      })}

      <div className="sidebar-group">Pipeline</div>
      {PIPELINE_STEPS.map((s) => {
        const unlocked = isStepUnlocked(s.step, deal.status, deal.currentStep);
        const done = deal.status === "complete" || s.step < deal.currentStep || (stoppedEarly && s.step === 1);
        const current = !done && s.step === deal.currentStep;
        const marker = (
          <span
            className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-meta tabular-nums ${
              done
                ? "bg-[var(--color-accent)] text-white"
                : current
                  ? "bg-[var(--color-accent-tint)] text-[var(--color-accent-text)] shadow-[inset_0_0_0_1px_var(--color-accent-chip)]"
                  : "bg-[var(--color-surface)] text-[var(--color-neutral-500)] shadow-[inset_0_0_0_1px_var(--color-neutral-700)]"
            }`}
          >
            {done ? <LuCheck aria-hidden className="h-3 w-3" strokeWidth={3} /> : s.step}
          </span>
        );
        return unlocked ? (
          <Link key={s.key} href={href(s.key)} aria-current={tab === s.key ? "page" : undefined} className="sidebar-item">
            {tab === s.key && <NavHighlight id="deal-nav" />}
            {marker}
            {s.label}
          </Link>
        ) : (
          <span key={s.key} title="Locked until the pipeline reaches this step" className="sidebar-item sidebar-item-locked">
            {marker}
            {s.label}
          </span>
        );
      })}

      {showStudy && (
        <>
          <div className="sidebar-group">Developer</div>
          <Link href={href("study")} aria-current={tab === "study" ? "page" : undefined} className="sidebar-item">
            {tab === "study" && <NavHighlight id="deal-nav" />}
            <LuFlaskConical aria-hidden className="sidebar-icon" />
            Study
          </Link>
        </>
      )}

      <div className="min-h-5 shrink-0" />
      <dl className="mx-2.5 mt-auto grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 border-t border-[var(--color-neutral-800)] pt-4 text-meta">
        {deal.memo && (
          <>
            <dt className="text-muted">Quick Screen</dt>
            <dd className="m-0 text-right font-medium">
              {VERDICT_LABELS[deal.memo.verdict]}
              {deal.memo.overridden && <span className="text-muted font-normal"> · overridden</span>}
            </dd>
          </>
        )}
        <dt className="text-muted">Status</dt>
        <dd className="m-0 text-right">{STATUS_LABELS[deal.status]}</dd>
        <dt className="text-muted">Evaluator</dt>
        <dd className="m-0 truncate text-right">{deal.evaluator ?? "—"}</dd>
        <dt className="text-muted">Config</dt>
        <dd className="m-0 text-right">v{deal.configVersion}</dd>
      </dl>
    </aside>
  );
}
