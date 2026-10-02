import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { PIPELINE_STEPS, STATUS_LABELS, VERDICT_LABELS } from "@/lib/evaluation-shared";
import { listDeals } from "@/lib/evaluations";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Deals · Tracer",
};

export default async function DealsPage() {
  await requireUser();
  const deals = await listDeals(await createClient());

  return (
    <>
      <div className="mb-8 flex flex-wrap items-end gap-4">
        <div>
          <h1 className="mb-1.5 text-3xl">Deals</h1>
          <p className="text-muted text-[13px]">
            {deals.length} deal{deals.length === 1 ? "" : "s"}
          </p>
        </div>
        <Link href="/deals/new" className="btn btn-primary ml-auto no-underline">
          + New deal
        </Link>
      </div>

      {deals.length === 0 ? (
        <div className="card text-[13px]">
          <p>No deals yet.</p>
          <p className="text-muted">Start with a Quick Screen: create a deal and answer the fund&apos;s questions.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg">
          <table className="w-full min-w-[760px] text-left text-[13px]">
            <thead className="text-muted text-xs">
              <tr className="border-b border-[var(--color-divider)]">
                <th className="py-2 pr-4 font-normal">Company</th>
                <th className="py-2 pr-4 font-normal">Pipeline</th>
                <th className="py-2 pr-4 font-normal">Verdict</th>
                <th className="py-2 pr-4 font-normal whitespace-nowrap">Conflicts</th>
                <th className="py-2 pr-4 font-normal whitespace-nowrap">Critical U</th>
                <th className="py-2 pr-4 font-normal">Config</th>
                <th className="py-2 font-normal">Updated</th>
              </tr>
            </thead>
            <tbody>
              {deals.map((d) => (
                <tr key={d.id} className="border-b border-[var(--color-divider)] hover:bg-[var(--color-surface)]">
                  <td className="py-3 pr-4">
                    <Link href={`/deals/${d.id}`} className="text-[15px] font-medium text-[var(--color-text)] no-underline">
                      {d.name}
                    </Link>
                    <div className="text-muted text-xs whitespace-nowrap">
                      {[d.stage, d.sector].filter(Boolean).join(" · ") || "—"}
                    </div>
                  </td>
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-[3px]" aria-hidden>
                      {PIPELINE_STEPS.map((s) => (
                        <span
                          key={s.key}
                          title={s.label}
                          className="h-[5px] w-[22px] rounded-sm"
                          style={{
                            background:
                              s.step < d.currentStep || d.status === "complete"
                                ? "var(--color-accent)"
                                : s.step === d.currentStep
                                  ? "var(--color-accent-800)"
                                  : "var(--color-neutral-800)",
                          }}
                        />
                      ))}
                    </div>
                    <div className="text-muted mt-1 text-[11px]">{STATUS_LABELS[d.status]}</div>
                  </td>
                  <td className="py-3 pr-4">
                    {d.classification ? (
                      <span className="tag tag-accent" title="Classification by rule (R3)" data-testid="deal-classification">
                        {VERDICT_LABELS[d.classification]}
                      </span>
                    ) : d.verdict ? (
                      <span className="tag tag-neutral">
                        {VERDICT_LABELS[d.verdict]}
                        {d.overridden && " · overridden"}
                      </span>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td className={`py-3 pr-4 tabular-nums ${d.openConflicts ? "text-danger" : "text-muted"}`} data-testid="deal-conflicts">
                    {d.currentStep >= 2 ? `${d.openConflicts} open` : "—"}
                  </td>
                  <td className="text-muted py-3 pr-4 tabular-nums" data-testid="deal-critical">
                    {d.currentStep >= 3 ? d.openCriticalUncertainties : "—"}
                  </td>
                  <td className="py-3 pr-4 tabular-nums">v{d.configVersion}</td>
                  <td className="text-muted py-3 whitespace-nowrap">
                    {new Date(d.updatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
