import "server-only";

import JSZip from "jszip";
import { CLAIM_TYPE_LABELS, CONFIDENCE_LABELS } from "@/lib/claim-shared";
import { loadClaimTable } from "@/lib/claims";
import { CONFLICT_STATUS_LABELS } from "@/lib/conflict-shared";
import { loadConflictRegister } from "@/lib/conflicts";
import { loadCounterCase } from "@/lib/counter-case";
import { effectiveScore } from "@/lib/dimension-shared";
import { loadDimensions } from "@/lib/dimensions";
import { evidencePackSheets } from "@/lib/evidence-pack-sheets";
import type { B1Output } from "@/lib/llm/prompts/b1-baseline-memo";
import { CLASSIFICATION_LABELS, refCodes, type Section, type StatementView } from "@/lib/output-shared";
import { loadOutputs } from "@/lib/outputs";
import { toHtml, toMarkdown, type Block, type Cited, type RunDoc } from "@/lib/run-doc";
import { toPdf } from "@/lib/run-doc-pdf";
import { TIER_LABELS } from "@/lib/source-shared";
import { loadSourceTable } from "@/lib/sources";
import type { createClient } from "@/lib/supabase/server";
import type { Enums } from "@/lib/supabase/database.types";
import { writeXlsx } from "@/lib/xlsx";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type StudyFormat = "pdf" | "html" | "md";

export type BaselineRef = { n: number; source_code: string; title: string; origin: string; url: string | null };

export type StudyView = {
  original: { id: string; status: Enums<"evaluation_status">; classification: Enums<"verdict"> | null; hasSources: boolean };
  copies: {
    id: string;
    run: number;
    status: Enums<"evaluation_status">;
    currentStep: number;
    classification: Enums<"verdict"> | null;
    lastRun: { step: number; status: Enums<"run_status">; error: string | null } | null;
  }[];
  baselines: {
    id: string;
    run: number;
    status: Enums<"run_status">;
    error: string | null;
    recommendation: Enums<"verdict"> | null;
    createdAt: string;
    content: B1Output | null;
    refs: BaselineRef[];
  }[];
};

// The Study tab (decision 44): artifact runs (the deal and its hidden copies)
// and baseline memos. Baseline rows are readable by fund admins only (RLS).
export async function loadStudy(supabase: Supabase, evaluationId: string): Promise<StudyView> {
  const [original, copies, baselines, sources] = await Promise.all([
    supabase.from("evaluations").select("id, status, decision:decisions(classification)").eq("id", evaluationId).single(),
    supabase
      .from("evaluations")
      .select("id, study_run, status, current_step, decision:decisions(classification), runs:pipeline_runs(step, status, error, created_at, superseded_at)")
      .eq("study_parent_id", evaluationId)
      .order("study_run"),
    supabase
      .from("baseline_memos")
      .select("id, run_number, status, error, recommendation, created_at, content, refs")
      .eq("evaluation_id", evaluationId)
      .order("run_number"),
    supabase.from("sources").select("id", { count: "exact", head: true }).eq("evaluation_id", evaluationId),
  ]);
  for (const r of [original, copies, baselines]) if (r.error) throw r.error;
  return {
    original: {
      id: original.data!.id,
      status: original.data!.status,
      classification: original.data!.decision?.classification ?? null,
      hasSources: (sources.count ?? 0) > 0,
    },
    copies: copies.data!.map((c) => {
      const last = [...c.runs].filter((r) => !r.superseded_at).sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
      return {
        id: c.id,
        run: c.study_run!,
        status: c.status,
        currentStep: c.current_step,
        classification: c.decision?.classification ?? null,
        lastRun: last ? { step: last.step, status: last.status, error: last.error } : null,
      };
    }),
    baselines: baselines.data!.map((b) => ({
      id: b.id,
      run: b.run_number,
      status: b.status,
      error: b.error,
      recommendation: b.recommendation,
      createdAt: b.created_at,
      content: (b.content as B1Output | null) ?? null,
      refs: (b.refs as BaselineRef[] | null) ?? [],
    })),
  };
}

// ---------------------------------------------------------------------------
// Documents per run
// ---------------------------------------------------------------------------

const today = () => new Date().toISOString().slice(0, 10);

const st = (s: StatementView | undefined, detailLabel?: string): Cited | null =>
  s ? { text: s.text, detail: s.detail && detailLabel ? `${detailLabel}: ${s.detail}` : undefined, refs: refCodes(s.refs) } : null;

export async function artifactRunDoc(
  supabase: Supabase,
  evaluationId: string,
  configId: string,
  label: string,
  company: string,
): Promise<RunDoc> {
  const [outputs, counterCase, dimensions, claims, sources, conflicts] = await Promise.all([
    loadOutputs(supabase, evaluationId, configId),
    loadCounterCase(supabase, evaluationId, configId),
    loadDimensions(supabase, evaluationId, configId),
    loadClaimTable(supabase, evaluationId, configId),
    loadSourceTable(supabase, evaluationId, configId),
    loadConflictRegister(supabase, evaluationId),
  ]);
  const d = outputs.decision!;
  const one = (s: Section, detailLabel?: string) => st(outputs.statements[s]?.[0], detailLabel);
  const many = (s: Section) => (outputs.statements[s] ?? []).map((x) => st(x)!);
  const p = (title: string, item: Cited | null): Block[] => (item ? [{ kind: "h3", text: title }, { kind: "p", item }] : []);
  const open = conflicts.filter((c) => c.status === "open");

  const blocks: Block[] = [
    { kind: "h1", text: `${label}: ${company}` },
    { kind: "meta", text: `Tracer artifact run · classification ${CLASSIFICATION_LABELS[d.classification]} (by rule) · exported ${today()}` },
    { kind: "h2", text: "Decision Snapshot" },
    { kind: "p", item: { label: "Classification", text: CLASSIFICATION_LABELS[d.classification] } },
    { kind: "p", item: { label: "Rule applied", text: d.ruleApplied } },
    ...p("Justification", one("justification")),
    { kind: "h3", text: "Three strongest supporting arguments" },
    { kind: "list", ordered: true, items: many("supporting_arg") },
    { kind: "h3", text: "Primary risks (ranked counter-case)" },
    { kind: "list", ordered: true, items: counterCase.arguments.map((a) => ({ text: a.argument, detail: `Mechanism: ${a.mechanism}`, refs: a.claimCodes })) },
    ...(open.length
      ? ([{ kind: "h3", text: "Open conflicts" }, { kind: "list", ordered: false, items: open.map((c) => ({ label: c.code, text: c.description, detail: "open" })) }] as Block[])
      : []),
    { kind: "h3", text: "Research agenda" },
    {
      kind: "table",
      head: ["Open question", "Evidence that would resolve it", "IDs"],
      widths: [5, 5, 2],
      rows: (outputs.statements.research_agenda ?? []).map((r) => [r.text, r.detail ?? "", refCodes(r.refs).join(", ")]),
    },
    ...p("Re-evaluation trigger", one("reeval_trigger")),
    { kind: "h2", text: "Thesis Card" },
    ...p("One-sentence thesis", one("thesis")),
    ...p("Outlier scenario & mechanism", one("outlier")),
    ...p("Base case", one("base_case", "Gating variables")),
    ...p("Upside case", one("upside_case", "Gating variables")),
    ...p("Failure case", one("failure_case", "Dominant failure mode")),
    ...p("Moat hypothesis", one("moat")),
    ...p("Entry wedge", one("entry_wedge")),
    { kind: "h3", text: "De-risking milestones" },
    { kind: "list", ordered: true, items: many("milestone") },
    { kind: "h3", text: "Falsifiers" },
    { kind: "list", ordered: true, items: counterCase.falsifiers.map((f) => ({ label: f.code, text: f.criterion, detail: `Check: ${f.outcomeCheck}`, refs: [...f.claimCodes, ...f.uncertaintyCodes] })) },
    { kind: "h3", text: "Dimension scores" },
    {
      kind: "table",
      head: ["ID", "Dimension", "Score", "Strongest counter-signal", "Claims"],
      widths: [1, 3, 1.4, 7, 2.2],
      rows: dimensions.assessments.map((a) => [
        a.code,
        a.title,
        `${effectiveScore(a)}/5${a.cappedBy ? ` (capped by ${a.cappedBy})` : ""}${a.override ? " (override)" : ""}`,
        a.counterSignal,
        a.claimCodes.join(", "),
      ]),
    },
    { kind: "h3", text: "Open questions" },
    {
      kind: "list",
      ordered: true,
      items: counterCase.uncertainties.filter((u) => u.decisionCritical && u.status === "open").map((u) => ({ text: u.question, refs: [u.code] })),
    },
    { kind: "h2", text: "Appendix: Claim Table" },
    {
      kind: "table",
      head: ["ID", "Claim", "Type", "Conf.", "Sources", "Excerpt"],
      widths: [1, 6, 1.6, 1.6, 1.4, 6],
      rows: claims.claims.map((c) => [
        c.code,
        c.statement,
        CLAIM_TYPE_LABELS[c.type],
        c.confidence ? CONFIDENCE_LABELS[c.confidence] : "—",
        c.links.map((l) => l.sourceCode).join(", ") || "—",
        c.links[0] ? `${c.links[0].visual ? `[${c.links[0].visual.locator}] ` : ""}"${c.links[0].excerpt}"` : "—",
      ]),
    },
    { kind: "h2", text: "Appendix: Sources" },
    {
      kind: "table",
      head: ["ID", "Title", "Tier", "Party", "Origin"],
      widths: [1, 6, 1.6, 3, 5],
      rows: sources.sources.map((s) => [s.code, s.title, TIER_LABELS[s.tier], s.party, s.origin === "upload" ? `Upload: ${s.filename}` : (s.url ?? "")]),
    },
    { kind: "h2", text: "Appendix: Uncertainty List" },
    {
      kind: "table",
      head: ["ID", "Open question", "Critical", "Origin"],
      widths: [1, 9, 1.4, 2.6],
      rows: counterCase.uncertainties.map((u) => [u.code, u.question, u.decisionCritical ? "Yes" : "No", u.origin]),
    },
    { kind: "h2", text: "Appendix: Conflict Register" },
    {
      kind: "table",
      head: ["ID", "Kind", "Side A", "Side B", "Description", "Status"],
      widths: [1, 1.4, 1.2, 1.2, 7, 3],
      rows: conflicts.map((c) => [c.code, c.kind, c.sideA.code, c.sideB.code, c.description, CONFLICT_STATUS_LABELS[c.status]]),
    },
  ];
  return { title: `${label}: ${company}`, blocks };
}

export function baselineRunDoc(b: StudyView["baselines"][number], label: string, company: string): RunDoc {
  const m = b.content!;
  const refs = (r: number[]) => r.map(String);
  const c = (x: { text: string; refs: number[] }, detail?: string): Cited => ({ text: x.text, detail, refs: refs(x.refs) });
  const p = (title: string, item: Cited): Block[] => [{ kind: "h3", text: title }, { kind: "p", item }];
  const blocks: Block[] = [
    { kind: "h1", text: `${label}: ${company}` },
    { kind: "meta", text: `Baseline memo (same LLM, corpus and fund config; no claim layer) · exported ${today()}` },
    { kind: "h2", text: "Decision Snapshot" },
    { kind: "p", item: { label: "Recommendation", text: CLASSIFICATION_LABELS[m.recommendation] } },
    ...p("Justification", c(m.justification)),
    { kind: "h3", text: "Three strongest supporting arguments" },
    { kind: "list", ordered: true, items: m.supporting_arguments.map((x) => c(x)) },
    { kind: "h3", text: "Primary risks" },
    { kind: "list", ordered: true, items: m.risks.map((x) => c(x)) },
    { kind: "h3", text: "Research agenda" },
    {
      kind: "table",
      head: ["Open question", "Evidence that would resolve it", "Refs"],
      widths: [5, 5, 2],
      rows: m.research_agenda.map((r) => [r.text, r.evidence, refs(r.refs).map((n) => `[${n}]`).join(" ")]),
    },
    ...p("Re-evaluation trigger", c(m.reeval_trigger)),
    { kind: "h2", text: "Thesis Card" },
    ...p("One-sentence thesis", c(m.thesis)),
    ...p("Outlier scenario & mechanism", c(m.outlier)),
    ...p("Base case", c(m.base_case, `Gating variables: ${m.base_case.detail}`)),
    ...p("Upside case", c(m.upside_case, `Gating variables: ${m.upside_case.detail}`)),
    ...p("Failure case", c(m.failure_case, `Dominant failure mode: ${m.failure_case.detail}`)),
    ...p("Moat hypothesis", c(m.moat)),
    ...p("Entry wedge", c(m.entry_wedge)),
    { kind: "h3", text: "De-risking milestones" },
    { kind: "list", ordered: true, items: m.milestones.map((x) => c(x)) },
    { kind: "h3", text: "Falsifiers" },
    { kind: "list", ordered: true, items: m.falsifiers.map((x) => c(x)) },
    { kind: "h3", text: "Dimension scores" },
    {
      kind: "table",
      head: ["Dimension", "Score", "Strongest counter-signal", "Refs"],
      widths: [3, 1.2, 8, 2],
      rows: m.dimension_scores.map((d) => [d.dimension, `${d.score}/5`, d.counter_signal, d.refs.map((n) => `[${n}]`).join(" ")]),
    },
    { kind: "h3", text: "Open questions" },
    { kind: "list", ordered: true, items: m.open_questions.map((x) => c(x)) },
    { kind: "h2", text: "References" },
    {
      kind: "table",
      head: ["Ref", "Title", "Origin"],
      widths: [1, 7, 6],
      rows: b.refs.map((r) => [`[${r.n}]`, r.title, r.origin]),
    },
  ];
  return { title: `${label}: ${company}`, blocks };
}

// ---------------------------------------------------------------------------
// Export: one file per run (+ Evidence Pack .xlsx per artifact run for PDF and
// HTML), zipped with a README. RLS as the caller (fund admin).
// ---------------------------------------------------------------------------

export async function buildStudyExport(supabase: Supabase, evaluationId: string, format: StudyFormat): Promise<Uint8Array> {
  const [{ data: ev, error }, study] = await Promise.all([
    supabase.from("evaluations").select("id, config_id, company:companies(name), config:framework_configs(version)").eq("id", evaluationId).single(),
    loadStudy(supabase, evaluationId),
  ]);
  if (error) throw error;
  const company = ev.company.name;
  const zip = new JSZip();
  const render = async (doc: RunDoc) => (format === "pdf" ? await toPdf(doc) : format === "html" ? toHtml(doc) : toMarkdown(doc));
  const ext = format;

  const artifactRuns = [
    { id: ev.id, run: 1, done: study.original.classification !== null },
    ...study.copies.map((c) => ({ id: c.id, run: c.run, done: c.classification !== null })),
  ];
  const included: string[] = [];
  const skipped: string[] = [];
  for (const r of artifactRuns) {
    if (!r.done) {
      skipped.push(`Artifact run ${r.run}: outputs not generated`);
      continue;
    }
    const name = `artifact-run-${r.run}`;
    zip.file(`${name}.${ext}`, await render(await artifactRunDoc(supabase, r.id, ev.config_id, `Artifact run ${r.run}`, company)));
    included.push(`${name}.${ext}`);
    if (format !== "md") {
      zip.file(`${name}-evidence-pack.xlsx`, await writeXlsx(await evidencePackSheets(supabase, r.id, ev.config_id)));
      included.push(`${name}-evidence-pack.xlsx`);
    }
  }
  for (const b of study.baselines) {
    if (!b.content) {
      skipped.push(`Baseline run ${b.run}: ${b.status}${b.error ? ` (${b.error})` : ""}`);
      continue;
    }
    const name = `baseline-run-${b.run}`;
    zip.file(`${name}.${ext}`, await render(baselineRunDoc(b, `Baseline run ${b.run}`, company)));
    included.push(`${name}.${ext}`);
  }

  zip.file(
    "README.md",
    [
      `# Study 2 export: ${company}`,
      "",
      `Exported ${today()} from Tracer. Fund config v${ev.config.version}; every run used the same configuration and corpus.`,
      "",
      "- **Artifact runs** went through the full pipeline (Source Table → claims → counter-case → dimensions → outputs). " +
        "[C#] claims, [S#] sources, [U#] uncertainties, [F#] falsifiers and [CR#] conflicts are listed in each file's appendices" +
        (format === "md" ? "." : " and in the accompanying Evidence Pack .xlsx."),
      "- **Baseline runs** are memos written by the same LLM from the same documents and fund config, without the claim layer, " +
        "sufficiency rule or conflict register. [n] refers to the numbered References in each file.",
      "",
      "## Files",
      ...included.map((f) => `- ${f}`),
      ...(skipped.length ? ["", "## Not included", ...skipped.map((s) => `- ${s}`)] : []),
      "",
    ].join("\n"),
  );
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}
