"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  CLAIM_TYPE_LABELS,
  CONFIDENCE_LABELS,
  type ClaimLinkView,
  type ClaimTableView,
  type ClaimType,
  type ClaimView,
} from "@/lib/claim-shared";
import { CONFLICT_STATUS_LABELS, CONFLICT_STATUS_SHORT, type ConflictView } from "@/lib/conflict-shared";
import { isRunActive, TIER_LABELS, type RunView } from "@/lib/source-shared";
import { ConflictRegister } from "./conflict-register";
import { RerunControl, RunCallsLink } from "./rerun-control";

const FILTERS = ["all", "fact", "inference", "speculation"] as const;
type Filter = (typeof FILTERS)[number];

const TYPE_TAG: Record<ClaimType, string> = { fact: "tag-accent", inference: "tag-neutral", speculation: "tag-outline" };

// Step 3: Claim Table (C#) with conflict badges, a trace drawer that shows each
// excerpt in its source, and the uncertainties written by the sufficiency rule.
export function ClaimsTab({
  evaluationId,
  canExtract,
  table,
  conflicts,
  canStressTest,
  stressTestStarted,
  hasOutputs,
}: {
  evaluationId: string;
  canExtract: boolean;
  table: ClaimTableView;
  conflicts: ConflictView[];
  canStressTest: boolean;
  stressTestStarted: boolean;
  hasOutputs: boolean;
}) {
  const router = useRouter();
  const [run, setRun] = useState<RunView | null>(table.run);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const active = isRunActive(run);
  const { claims, prompts } = table;
  // Step 3 writes the prompt-derived U#; the full list is on the Counter-Case tab.
  const uncertainties = table.uncertainties.filter((u) => u.fromPrompt !== null);
  const open = claims.find((c) => c.id === openId) ?? null;

  useEffect(() => {
    if (!run || !isRunActive(run)) return;
    const timer = setInterval(async () => {
      const res = await fetch(`/api/evaluations/${evaluationId}/runs/${run.id}`);
      if (!res.ok) return;
      const next: RunView = await res.json();
      setRun(next);
      if (!isRunActive(next)) router.refresh();
    }, 2000);
    return () => clearInterval(timer);
  }, [evaluationId, run, router]);

  // Step 4 starts from here; the Counter-Case tab shows its progress.
  function stressTest() {
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/evaluations/${evaluationId}/counter-case`, { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Couldn't start the counter-case.");
        return;
      }
      router.push(`/deals/${evaluationId}?tab=counter-case`);
    });
  }

  function extract() {
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/evaluations/${evaluationId}/claims/extract`, { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Couldn't start claim extraction.");
        return;
      }
      setRun({ id: data.runId, status: "queued", progress: 0, error: null, warnings: [], notes: [] });
      router.refresh();
    });
  }

  const count = (t: ClaimType) => claims.filter((c) => c.type === t).length;
  const conf = (l: string) => claims.filter((c) => c.confidence === l).length;
  const shown = filter === "all" ? claims : claims.filter((c) => c.type === filter);
  const openConflicts = new Set(claims.flatMap((c) => c.conflicts.filter((x) => x.status === "open").map((x) => x.code)));
  const links = claims.flatMap((c) => c.links);
  const markedWrong = links.filter((l) => l.markedWrong).length;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="mb-1 text-[22px]">Claim Extraction</h2>
        <p className="text-muted text-[13px]">
          Source Table → atomic claims (C#), each Fact or Inference with a verbatim excerpt and S#; duplicates merged,
          contradictions recorded, confidence assigned by rule.
        </p>
      </div>

      {(claims.length === 0 || run) && (
        <section className="card gap-3">
          {claims.length === 0 && !active && (
            <div className="flex flex-wrap items-center gap-3">
              <button className="btn btn-primary" onClick={extract} disabled={!canExtract || pending}>
                {run?.status === "failed" ? "Try again" : "Extract claims"}
              </button>
              <span className="text-muted text-[13px]">Runs over every source in the Source Table.</span>
            </div>
          )}
          {active && run && (
            <div className="flex flex-col gap-1.5" data-testid="run-progress">
              <div className="text-[13px]">
                Step 3 · {run.status === "queued" ? "Waiting for the background worker…" : `Extracting claims · ${run.progress}%`}
              </div>
              <div className="h-1.5 overflow-hidden rounded bg-[var(--color-neutral-900)]">
                <div className="h-full bg-[var(--color-accent)] transition-all" style={{ width: `${Math.max(run.progress, 3)}%` }} />
              </div>
            </div>
          )}
          {run && !active && (
            <div className="flex flex-col gap-1 text-[13px]" data-testid="run-result">
              {run.status === "failed" ? (
                <p role="alert" className="text-danger">
                  Claim extraction failed: {(run.error ?? "unknown error").replace(/\.$/, "")}. Try again.
                </p>
              ) : (
                <p>Claim Table built{run.status === "done_with_warnings" ? " with warnings" : ""}.</p>
              )}
              {run.warnings.map((w) => (
                <p key={w} className="text-danger text-xs" data-testid="run-warning">
                  ⚠ {w}
                </p>
              ))}
              {run.notes.map((n) => (
                <p key={n} className="text-muted text-xs">
                  {n}
                </p>
              ))}
              <RunCallsLink evaluationId={evaluationId} run={run} />
            </div>
          )}
          {error && claims.length === 0 && (
            <p role="alert" className="text-danger text-[13px]">
              {error}
            </p>
          )}
        </section>
      )}

      {claims.length > 0 && (
        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-muted mr-2">
              {claims.length} claims · {count("fact")} Fact · {count("inference")} Inference · {count("speculation")}{" "}
              Speculation · H {conf("high")} · M {conf("medium")} · L {conf("low")} · {openConflicts.size} open conflict
              {openConflicts.size === 1 ? "" : "s"}
              {markedWrong > 0 && (
                <span data-testid="false-link-rate">
                  {" "}
                  · {markedWrong} of {links.length} links marked wrong ({Math.round((markedWrong / links.length) * 100)}%)
                </span>
              )}
            </span>
            <div className="ml-auto flex gap-1" role="group" aria-label="Filter by type">
              {FILTERS.map((f) => (
                <button
                  key={f}
                  className={`btn px-2.5 py-1 text-xs ${filter === f ? "btn-primary" : ""}`}
                  aria-pressed={filter === f}
                  onClick={() => setFilter(f)}
                >
                  {f === "all" ? "All" : CLAIM_TYPE_LABELS[f]}
                </button>
              ))}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-[13px]" data-testid="claim-table">
              <thead className="text-muted text-xs">
                <tr className="border-b border-[var(--color-divider)]">
                  <th className="w-11 py-2 pr-3 font-normal">ID</th>
                  <th className="py-2 pr-3 font-normal">Claim</th>
                  <th className="w-24 py-2 pr-3 font-normal">Type</th>
                  <th className="py-2 pr-3 font-normal">Source excerpt</th>
                  <th className="w-20 py-2 pr-3 font-normal">Source</th>
                  <th className="w-20 py-2 font-normal">Conf.</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => setOpenId(c.id)}
                    className="cursor-pointer border-b border-[var(--color-divider)] align-top hover:bg-[var(--color-surface)]"
                    data-testid="claim-row"
                    data-type={c.type}
                  >
                    <td className="py-2 pr-3 font-mono text-[11px] text-[var(--color-neutral-300)]">{c.code}</td>
                    <td className="py-2 pr-3">
                      {c.statement}
                      {c.conflicts.map((x) => (
                        <span
                          key={x.id}
                          className={`tag ml-1.5 ${x.status === "open" ? "text-danger" : "tag-neutral"}`}
                          title={`${x.description} (contradicts ${x.otherCode})`}
                          data-testid="claim-conflict-badge"
                        >
                          {x.status === "open" && "⚠ "}
                          {x.code} · {CONFLICT_STATUS_SHORT[x.status]}
                        </span>
                      ))}
                    </td>
                    <td className="py-2 pr-3">
                      <span className={`tag ${TYPE_TAG[c.type]}`}>{CLAIM_TYPE_LABELS[c.type]}</span>
                    </td>
                    <td className="text-muted py-2 pr-3 text-xs" data-testid="claim-excerpt">
                      {c.links.length ? (
                        <span className={c.links[0].markedWrong ? "line-through" : ""}>“{c.links[0].excerpt}”</span>
                      ) : (
                        <span className="italic">No excerpt (speculation)</span>
                      )}
                      {c.links.length > 1 && ` +${c.links.length - 1} more`}
                    </td>
                    <td className="py-2 pr-3 font-mono text-[11px]" data-testid="claim-sources">
                      {c.links.length
                        ? c.links.map((l, i) => (
                            <span key={l.id} className={l.markedWrong ? "text-muted line-through" : ""}>
                              {i > 0 && ", "}
                              {l.sourceCode}
                            </span>
                          ))
                        : "—"}
                    </td>
                    <td className="py-2 text-xs" data-testid="claim-confidence">
                      {c.confidence ? CONFIDENCE_LABELS[c.confidence] : <span className="text-muted">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-muted text-[11px]">
            Speculation carries no evidence link by definition; any statement resting on it is marked as unsupported.
          </p>
        </section>
      )}

      {(claims.length > 0 || uncertainties.length > 0) && (
        <section className="card gap-2 p-4" data-testid="uncertainties">
          <div className="text-[10px] tracking-widest text-[var(--color-accent)] uppercase">
            Uncovered Collection Prompts → Uncertainty List
          </div>
          {uncertainties.length === 0 ? (
            <p className="text-muted text-[13px]">Every required Collection Prompt has an answering Fact or Inference.</p>
          ) : (
            uncertainties.map((u) => (
              <div key={u.id} className="border-t border-[var(--color-divider)] pt-2 text-[13px]" data-testid="uncertainty">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="font-mono text-[11px]">{u.code}</span>
                  <span className="flex-1">{u.question}</span>
                  <span className={`tag ${u.decisionCritical ? "tag-accent" : "tag-neutral"}`}>
                    {u.decisionCritical ? "Decision-critical" : "Nice to know"}
                  </span>
                  {u.fromPrompt && <span className="tag tag-outline">from prompt {u.fromPrompt}</span>}
                </div>
                <p className="text-muted mt-1 text-xs">{u.whyUnresolved}</p>
                {u.minEvidence && <p className="text-muted text-xs">Minimum evidence: {u.minEvidence}</p>}
              </div>
            ))
          )}
          <p className="text-muted text-[11px]">
            Written by the sufficiency rule: a required prompt without an answering Fact or Inference becomes an
            uncertainty. The full Uncertainty List is completed with the counter-case.
          </p>
        </section>
      )}

      <ConflictRegister evaluationId={evaluationId} conflicts={conflicts} />

      {claims.length > 0 && !active && (
        <section className="card gap-2" data-testid="next-step">
          {stressTestStarted ? (
            <Link href={`/deals/${evaluationId}?tab=counter-case`}>Counter-Case →</Link>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <button className="btn btn-primary" onClick={stressTest} disabled={!canStressTest || pending}>
                Stress-test thesis
              </button>
              <span className="text-muted text-[13px]">
                Next step: the three strongest arguments against, the full Uncertainty List and falsifiers, all citing
                this Claim Table. Review links and conflicts first.
              </span>
            </div>
          )}
          {error && (
            <p role="alert" className="text-danger text-[13px]">
              {error}
            </p>
          )}
          <div className="border-t border-[var(--color-divider)] pt-2">
            <RerunControl
              evaluationId={evaluationId}
              step={3}
              label="claim extraction"
              start={{ path: "claims/extract", tab: "claims" }}
              hasOutputs={hasOutputs}
            />
          </div>
        </section>
      )}

      {open && (
        <ClaimDrawer
          key={open.id}
          evaluationId={evaluationId}
          claim={open}
          prompts={prompts}
          onOpen={(code) => setOpenId(claims.find((c) => c.code === code)?.id ?? openId)}
          onClose={() => setOpenId(null)}
        />
      )}
    </div>
  );
}

export function ClaimDrawer({
  evaluationId,
  claim,
  prompts,
  onOpen,
  onClose,
}: {
  evaluationId: string;
  claim: ClaimView;
  prompts: ClaimTableView["prompts"];
  onOpen: (code: string) => void;
  onClose: () => void;
}) {
  const [shownLink, setShownLink] = useState<ClaimLinkView | null>(claim.links[0] ?? null);
  const answers = prompts.map((p, i) => ({ ...p, n: i + 1 })).filter((p) => claim.promptIds.includes(p.id));

  return (
    <aside
      className="fixed top-0 right-0 z-20 flex h-full w-full max-w-xl flex-col gap-4 overflow-y-auto border-l border-[var(--color-divider)] bg-[var(--color-surface)] p-6 shadow-2xl"
      data-testid="claim-drawer"
    >
      <div className="flex items-start gap-3">
        <div>
          <div className="text-[10px] tracking-widest text-[var(--color-accent)] uppercase">Claim {claim.code}</div>
          <h3 className="text-lg leading-snug">{claim.statement}</h3>
        </div>
        <button className="btn ml-auto" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className={`tag ${TYPE_TAG[claim.type]}`}>{CLAIM_TYPE_LABELS[claim.type]}</span>
        {claim.confidence && (
          <span className="tag tag-neutral" data-testid="drawer-confidence">
            Confidence: {CONFIDENCE_LABELS[claim.confidence]}
          </span>
        )}
      </div>
      {claim.basis && (
        <p className="text-muted text-xs" data-testid="confidence-rule">
          R1 · {claim.basis.rule}
        </p>
      )}
      {claim.type === "speculation" && (
        <p className="text-muted text-[13px]">
          Speculation carries no evidence link by definition. Any statement resting on it is marked as unsupported.
        </p>
      )}

      {claim.conflicts.map((x) => (
        <div
          key={x.id}
          className={`rounded-md border p-3 text-[13px] ${
            x.status === "open" ? "border-[var(--color-danger)]/40" : "border-[var(--color-divider)]"
          }`}
          data-testid="drawer-conflict"
        >
          <div className={x.status === "open" ? "text-danger" : ""}>
            {x.status === "open" ? "⚠ In conflict" : "Conflict"} · {x.code} · {CONFLICT_STATUS_LABELS[x.status]}
          </div>
          <div className="text-muted text-xs">
            Contradicts{" "}
            <button className="underline" onClick={() => onOpen(x.otherCode)}>
              {x.otherCode}
            </button>
            {x.parentCode && <> · repeats source conflict {x.parentCode}</>} · {x.description}
          </div>
        </div>
      ))}

      {claim.links.length > 0 && (
        <div className="flex flex-col gap-2 text-[13px]">
          <div className="text-muted text-xs">Evidence links</div>
          {claim.links.map((l) => (
            <EvidenceLink
              key={l.id}
              evaluationId={evaluationId}
              claimId={claim.id}
              link={l}
              selected={shownLink?.id === l.id}
              onSelect={() => setShownLink(l)}
            />
          ))}
        </div>
      )}

      <div className="text-[13px]">
        <div className="text-muted mb-1 text-xs">Collection Prompts it answers</div>
        {answers.length ? (
          <ul className="flex flex-col gap-1">
            {answers.map((p) => (
              <li key={p.id}>
                <span className="text-muted tabular-nums">{p.n}.</span> {p.question}
              </li>
            ))}
          </ul>
        ) : (
          <span className="text-muted">None.</span>
        )}
      </div>
      <div className="text-[13px]">
        <div className="text-muted mb-1 text-xs">Cited by</div>
        {claim.citedBy.length ? (
          <div className="flex flex-wrap gap-1.5" data-testid="cited-by">
            {claim.citedBy.map((c) => (
              <span key={c} className="tag tag-neutral">
                {c}
              </span>
            ))}
          </div>
        ) : (
          <span className="text-muted">Not cited yet.</span>
        )}
      </div>

      {shownLink && <SourceText key={shownLink.id} evaluationId={evaluationId} link={shownLink} />}
    </aside>
  );
}

// One evidence link: shows its excerpt in the source text below, and lets the
// analyst mark it as wrong (decision 14: logged, kept, struck through, and no
// longer counted for confidence).
function EvidenceLink({
  evaluationId,
  claimId,
  link,
  selected,
  onSelect,
}: {
  evaluationId: string;
  claimId: string;
  link: ClaimLinkView;
  selected: boolean;
  onSelect: () => void;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function mark(wrong: boolean) {
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/evaluations/${evaluationId}/claims/${claimId}/links/${link.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wrong }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Couldn't save.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div
      className={`rounded-md border p-3 ${selected ? "border-[var(--color-accent)]" : "border-[var(--color-divider)]"}`}
      data-testid="evidence-link"
      data-marked-wrong={link.markedWrong}
    >
      <button onClick={onSelect} className="block w-full text-left">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-mono">{link.sourceCode}</span>
          <span>{link.sourceTitle}</span>
          <span className="tag tag-neutral">{TIER_LABELS[link.tier]}</span>
          <span className="text-muted">party: {link.party}</span>
          {link.markedWrong && <span className="tag text-danger">marked wrong</span>}
        </div>
        <div className={`mt-1 ${link.markedWrong ? "text-muted line-through" : ""}`}>“{link.excerpt}”</div>
      </button>
      <div className="mt-2 flex items-center gap-2">
        <button className="btn px-2.5 py-1 text-xs" onClick={() => mark(!link.markedWrong)} disabled={pending}>
          {pending ? "Saving…" : link.markedWrong ? "Unmark link" : "Mark link as wrong"}
        </button>
        {error && (
          <span role="alert" className="text-danger text-xs">
            {error}
          </span>
        )}
      </div>
    </div>
  );
}

// The source's full text with the excerpt highlighted at its stored offsets.
function SourceText({ evaluationId, link }: { evaluationId: string; link: ClaimLinkView }) {
  const [text, setText] = useState<string | null>(null);
  const markRef = useRef<HTMLElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/evaluations/${evaluationId}/sources/${link.sourceId}`)
      .then((r) => r.json())
      .then((d) => !cancelled && setText(d.text ?? d.error ?? ""))
      .catch(() => !cancelled && setText("Couldn't load the text."));
    return () => {
      cancelled = true;
    };
  }, [evaluationId, link.sourceId]);

  useEffect(() => {
    markRef.current?.scrollIntoView({ block: "center" });
  }, [text]);

  // Offsets are code points (decision: same unit as Postgres length()).
  const chars = text === null ? [] : Array.from(text);
  return (
    <div className="text-[13px]">
      <div className="text-muted mb-1 text-xs">
        {link.sourceCode} · source text, excerpt highlighted
      </div>
      <pre
        className="max-h-[45vh] overflow-auto rounded-md bg-[var(--color-bg)] p-3 text-xs whitespace-pre-wrap"
        data-testid="source-text"
      >
        {text === null ? (
          "Loading…"
        ) : (
          <>
            {chars.slice(0, link.start).join("")}
            <mark ref={markRef} className="excerpt" data-testid="excerpt-highlight">
              {chars.slice(link.start, link.end).join("")}
            </mark>
            {chars.slice(link.end).join("")}
          </>
        )}
      </pre>
    </div>
  );
}
