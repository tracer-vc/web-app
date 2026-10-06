"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
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
import { Hint } from "./hint";
import { flashTo } from "./jump";
import { conflictTagClass, ID_TAG_CLASS, PLAIN_TAG_CLASS, RowTag, tagClassFor } from "./id-tag";
import { RerunControl, RunCallsLink } from "./rerun-control";
import { ContinueLink, NextIcon, StepBar } from "./step-bar";

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
  // ?source=S# (from the Source Table's claim counts): claims citing that source.
  const sourceFilter = useSearchParams().get("source");
  const shown = (filter === "all" ? claims : claims.filter((c) => c.type === filter)).filter(
    (c) => !sourceFilter || c.links.some((l) => l.sourceCode === sourceFilter),
  );
  const openConflicts = new Set(claims.flatMap((c) => c.conflicts.filter((x) => x.status === "open").map((x) => x.code)));
  const links = claims.flatMap((c) => c.links);
  const markedWrong = links.filter((l) => l.markedWrong).length;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="mb-1 text-page">Claim Extraction</h2>
        <p className="text-muted text-body">
          Individual claims pulled from your sources, each quoting its source word for word. Duplicates are merged,
          contradictions recorded and confidence set by rule.
        </p>
      </div>

      {run && !active && (
        <section className="card gap-3">
          {run && !active && (
            <div className="flex flex-col gap-1 text-body" data-testid="run-result">
              {run.status === "failed" ? (
                <p role="alert" className="text-danger">
                  Claim extraction failed: {(run.error ?? "unknown error").replace(/\.$/, "")}. Try again.
                </p>
              ) : (
                <p>Claim Table built{run.status === "done_with_warnings" ? " with warnings" : ""}.</p>
              )}
              {run.warnings.map((w) => (
                <p key={w} className="text-danger text-meta" data-testid="run-warning">
                  ⚠ {w}
                </p>
              ))}
              {run.notes.map((n) => (
                <p key={n} className="text-muted text-meta">
                  {n}
                </p>
              ))}
              <RunCallsLink evaluationId={evaluationId} run={run} />
            </div>
          )}
          {error && claims.length === 0 && (
            <p role="alert" className="text-danger text-body">
              {error}
            </p>
          )}
        </section>
      )}

      {claims.length > 0 && (
        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2 text-meta">
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
            {sourceFilter && (
              <Link
                href={`/deals/${evaluationId}?tab=claims`}
                className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-[var(--color-accent-tint)] px-2.5 py-1 text-meta font-medium text-[var(--color-accent-text)] no-underline hover:bg-[var(--color-accent-800)]"
                title="Show all claims"
                data-testid="source-filter"
              >
                Citing {sourceFilter} · {shown.length}
                <span aria-hidden>×</span>
              </Link>
            )}
            <div className={`${sourceFilter ? "" : "ml-auto "}flex gap-1`} role="group" aria-label="Filter by type">
              {FILTERS.map((f) => (
                <button
                  key={f}
                  className={`btn px-2.5 py-1 text-meta ${filter === f ? "btn-primary" : ""}`}
                  aria-pressed={filter === f}
                  onClick={() => setFilter(f)}
                >
                  {f === "all" ? "All" : CLAIM_TYPE_LABELS[f]}
                </button>
              ))}
            </div>
          </div>
          <div className="panel overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-body" data-testid="claim-table">
              <thead className="text-muted text-meta">
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
                    id={`claim-${c.code}`}
                    onClick={() => setOpenId(c.id)}
                    className="cursor-pointer border-b border-[var(--color-divider)] align-top hover:bg-[var(--color-hover)]"
                    data-testid="claim-row"
                    data-type={c.type}
                  >
                    <td className="py-2 pr-3">
                      <button type="button" className={ID_TAG_CLASS} title={`Trace ${c.code}`}>
                        {c.code}
                      </button>
                    </td>
                    <td className="py-2 pr-3">
                      {c.statement}
                      {c.conflicts.map((x) => (
                        <button
                          key={x.id}
                          type="button"
                          className={`${conflictTagClass(x.status === "open")} ml-1.5 gap-1 align-[1px]`}
                          title={`${x.description} (contradicts ${x.otherCode}). Click to see it in the Conflict Register.`}
                          onClick={(e) => {
                            e.stopPropagation();
                            flashTo(`conflict-${x.code}`);
                          }}
                          data-testid="claim-conflict-badge"
                        >
                          {x.code}
                          <span className="font-sans">· {CONFLICT_STATUS_SHORT[x.status]}</span>
                        </button>
                      ))}
                    </td>
                    <td className="py-2 pr-3">
                      <span className={`tag ${TYPE_TAG[c.type]}`}>{CLAIM_TYPE_LABELS[c.type]}</span>
                    </td>
                    <td className="text-muted py-2 pr-3" data-testid="claim-excerpt">
                      {c.links.length ? (
                        <span className={c.links[0].markedWrong ? "line-through" : ""}>“{c.links[0].excerpt}”</span>
                      ) : (
                        <span className="italic">No excerpt (speculation)</span>
                      )}
                      {c.links.length > 1 && ` +${c.links.length - 1} more`}
                      {c.links.some((l) => l.visual) && (
                        <span className="tag tag-outline ml-1" title="Quoted from an image or chart in the document" data-testid="from-visual">
                          {c.links.some((l) => l.visual?.kind !== "chart") ? "image" : "chart"}
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-3" data-testid="claim-sources">
                      {c.links.length ? (
                        <span className="flex flex-wrap gap-1">
                          {c.links.map((l) => (
                            <RowTag key={l.id} evaluationId={evaluationId} code={l.sourceCode} muted={l.markedWrong} />
                          ))}
                        </span>
                      ) : (
                        <span className="text-muted text-meta">—</span>
                      )}
                    </td>
                    <td className="py-2" data-testid="claim-confidence">
                      {c.confidence ? CONFIDENCE_LABELS[c.confidence] : <span className="text-muted">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-muted text-meta">
            Speculation carries no evidence link by definition; any statement resting on it is marked as unsupported.
          </p>
        </section>
      )}

      {(claims.length > 0 || uncertainties.length > 0) && (
        <section className="card gap-0 overflow-hidden p-0" data-testid="uncertainties">
          <div className="px-4 pt-4 pb-3 text-panel font-semibold">
            <Hint info="Written by the sufficiency rule: a required Collection Prompt without an answering Fact or Inference becomes an uncertainty. The full Uncertainty List is completed with the counter-case.">
              Uncertainty List (Uncovered Collection Prompts)
            </Hint>
          </div>
          {uncertainties.length === 0 ? (
            <p className="text-muted px-4 pb-4 text-body">
              Every required Collection Prompt has an answering Fact or Inference.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table w-full min-w-[820px] text-left text-body">
                <thead>
                  <tr>
                    <th className="w-14">ID</th>
                    <th className="w-[28%]">Open question</th>
                    <th>Why it&apos;s open</th>
                    <th>Evidence that would resolve it</th>
                    <th className="w-36">Priority</th>
                  </tr>
                </thead>
                <tbody>
                  {uncertainties.map((u) => (
                    <tr key={u.id} data-testid="uncertainty">
                      <td>
                        <span className={PLAIN_TAG_CLASS}>
                          {u.code}
                        </span>
                      </td>
                      <td className="font-medium">{u.question}</td>
                      <td className="text-[var(--color-neutral-300)]">{u.whyUnresolved}</td>
                      <td className="text-[var(--color-neutral-300)]">{u.minEvidence ?? <span className="text-muted">—</span>}</td>
                      <td>
                        <span className={`tag ${u.decisionCritical ? "tag-accent" : "tag-neutral"}`}>
                          {u.decisionCritical ? "Decision-critical" : "Nice to know"}
                        </span>
                        {u.fromPrompt && (
                          <div className="text-muted mt-1 text-meta">Collection Prompt {u.fromPrompt}</div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      <ConflictRegister evaluationId={evaluationId} conflicts={conflicts} />

      {claims.length > 0 && !active && (
        <section className="flex flex-col gap-2">
          <div>
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

      <StepBar
        error={error}
        step={3}
        title="Claim Extraction"
        done={claims.length > 0 && !active}
        progress={active && run ? run.progress : undefined}
        status={
          active && run
            ? run.status === "queued"
              ? "Waiting for the background worker…"
              : `Extracting claims · ${run.progress}%`
            : claims.length > 0
              ? `${claims.length} claim${claims.length === 1 ? "" : "s"} extracted` +
                (stressTestStarted ? "" : " · review links and conflicts, then stress-test the thesis")
              : run?.status === "failed"
                ? "The last run failed · try again"
                : "Extract atomic claims from every source in the Source Table"
        }
      >
        {claims.length === 0 && !active && (
          <button className="btn btn-primary" onClick={extract} disabled={!canExtract || pending}>
            {run?.status === "failed" ? "Try again" : "Extract claims"}
          </button>
        )}
        {claims.length > 0 &&
          !active &&
          (stressTestStarted ? (
            <ContinueLink href={`/deals/${evaluationId}?tab=counter-case`} label="Continue to Counter-Case" />
          ) : (
            <button className="btn btn-primary" onClick={stressTest} disabled={!canStressTest || pending}>
              Stress-test thesis
              <NextIcon />
            </button>
          ))}
      </StepBar>

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
          <div className="mb-1.5 text-meta font-medium text-[var(--color-accent-text)]">Claim {claim.code}</div>
          <h3 className="text-section leading-snug">{claim.statement}</h3>
        </div>
        <button className="btn ml-auto" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-meta">
        <span className={`tag ${TYPE_TAG[claim.type]}`}>{CLAIM_TYPE_LABELS[claim.type]}</span>
        {claim.confidence && (
          <span className="tag tag-neutral" data-testid="drawer-confidence">
            Confidence: {CONFIDENCE_LABELS[claim.confidence]}
          </span>
        )}
      </div>
      {claim.basis && (
        <p className="text-muted text-meta" data-testid="confidence-rule">
          R1 · {claim.basis.rule}
        </p>
      )}
      {claim.type === "speculation" && (
        <p className="text-muted text-body">
          Speculation carries no evidence link by definition. Any statement resting on it is marked as unsupported.
        </p>
      )}

      {claim.conflicts.map((x) => (
        <div
          key={x.id}
          className={`rounded-md border p-3 text-body ${
            x.status === "open" ? "border-[var(--color-danger)]/40" : "border-[var(--color-divider)]"
          }`}
          data-testid="drawer-conflict"
        >
          <div className={x.status === "open" ? "text-danger" : ""}>
            {x.status === "open" ? "⚠ In conflict" : "Conflict"} · {x.code} · {CONFLICT_STATUS_LABELS[x.status]}
          </div>
          <div className="text-muted text-meta">
            Contradicts{" "}
            <button className={`${ID_TAG_CLASS} align-[1px]`} onClick={() => onOpen(x.otherCode)}>
              {x.otherCode}
            </button>
            {x.parentCode && <> · repeats source conflict {x.parentCode}</>} · {x.description}
          </div>
        </div>
      ))}

      {claim.links.length > 0 && (
        <div className="flex flex-col gap-2 text-body">
          <div className="text-muted text-meta">Evidence links</div>
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

      <div className="text-body">
        <div className="text-muted mb-1 text-meta">Collection Prompts it answers</div>
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
      <div className="text-body">
        <div className="text-muted mb-1 text-meta">Cited by</div>
        {claim.citedBy.length ? (
          <div className="flex flex-wrap gap-1.5" data-testid="cited-by">
            {claim.citedBy.map((c) =>
              /^(C|S|U|F|D|CR)\d+$/.test(c) ? (
                <button key={c} type="button" className={tagClassFor(c)} onClick={() => onOpen(c)}>
                  {c}
                </button>
              ) : (
                <span key={c} className="tag tag-neutral">
                  {c}
                </span>
              ),
            )}
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
        <div className="flex flex-wrap items-center gap-2 text-meta">
          <span className={ID_TAG_CLASS}>{link.sourceCode}</span>
          <span>{link.sourceTitle}</span>
          <span className="tag tag-neutral">{TIER_LABELS[link.tier]}</span>
          <span className="text-muted">party: {link.party}</span>
          {link.markedWrong && <span className="tag text-danger">marked wrong</span>}
        </div>
        <div className={`mt-1 ${link.markedWrong ? "text-muted line-through" : ""}`}>“{link.excerpt}”</div>
        {link.visual && (
          <div className="mt-2 flex flex-col gap-1.5 text-meta" data-testid="visual-origin">
            <span className="tag tag-outline w-fit">
              From {link.visual.locator} ·{" "}
              {link.visual.kind === "chart" ? "chart data read from the file" : "AI transcription of the image"}
            </span>
            {link.visual.hasImage && (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element -- private, authenticated image route */}
                <img
                  src={`/api/evaluations/${evaluationId}/documents/${link.visual.documentId}/visuals/${link.visual.id}`}
                  alt={`${link.sourceTitle}, ${link.visual.locator}`}
                  className="max-h-72 w-fit max-w-full rounded border border-[var(--color-divider)] bg-white"
                  data-testid="visual-image"
                />
                <span className="text-muted">The excerpt quotes the AI transcription of this image; check it against the image.</span>
              </>
            )}
          </div>
        )}
      </button>
      <div className="mt-2 flex items-center gap-2">
        <button className="btn px-2.5 py-1 text-meta" onClick={() => mark(!link.markedWrong)} disabled={pending}>
          {pending ? "Saving…" : link.markedWrong ? "Unmark link" : "Mark link as wrong"}
        </button>
        {error && (
          <span role="alert" className="text-danger text-meta">
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
    <div className="text-body">
      <div className="text-muted mb-1 text-meta">
        {link.sourceCode} · source text, excerpt highlighted
      </div>
      <pre
        className="max-h-[45vh] overflow-auto rounded-md bg-[var(--color-bg)] p-3 text-meta whitespace-pre-wrap"
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
