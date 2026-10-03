import "server-only";

import type { createClient } from "@/lib/supabase/server";
import { CLAIM_TYPE_LABELS, CONFIDENCE_LABELS } from "@/lib/claim-shared";
import { loadClaimTable } from "@/lib/claims";
import { CONFLICT_STATUS_LABELS } from "@/lib/conflict-shared";
import { loadConflictRegister } from "@/lib/conflicts";
import { loadCounterCase } from "@/lib/counter-case";
import { effectiveScore } from "@/lib/dimension-shared";
import { loadDimensions } from "@/lib/dimensions";
import { TIER_LABELS } from "@/lib/source-shared";
import { loadSourceTable } from "@/lib/sources";
import type { Sheet } from "@/lib/xlsx";

type Supabase = Awaited<ReturnType<typeof createClient>>;

// The Evidence Pack as five sheets (decision 31): Source Table, Claim Table,
// Conflict Register, Uncertainty List, Dimension Assessment, keyed by the IDs
// shown in the UI. RLS as the caller.
export async function evidencePackSheets(supabase: Supabase, id: string, configId: string): Promise<Sheet[]> {
  const [sources, claims, conflicts, counterCase, dimensions] = await Promise.all([
    loadSourceTable(supabase, id, configId),
    loadClaimTable(supabase, id, configId),
    loadConflictRegister(supabase, id),
    loadCounterCase(supabase, id, configId),
    loadDimensions(supabase, id, configId),
  ]);

  const sheets: Sheet[] = [];
  // Rows are objects keyed like the columns; written in column order.
  const sheet = (name: string, columns: { header: string; key: string; width: number }[], rows: Record<string, unknown>[]) =>
    sheets.push({
      name,
      columns,
      rows: rows.map((r) => columns.map((c) => (typeof r[c.key] === "number" ? (r[c.key] as number) : r[c.key] == null ? null : String(r[c.key])))),
    });

  sheet(
    "Source Table",
    [
      { header: "ID", key: "id", width: 6 },
      { header: "Title", key: "title", width: 40 },
      { header: "Origin", key: "origin", width: 40 },
      { header: "Tier", key: "tier", width: 11 },
      { header: "Party", key: "party", width: 24 },
      { header: "Published", key: "published", width: 12 },
      { header: "Accessed", key: "accessed", width: 12 },
      { header: "Relevance note", key: "note", width: 50 },
      { header: "Claims", key: "claims", width: 8 },
    ],
    sources.sources.map((s) => ({
      id: s.code,
      title: s.title,
      origin: s.origin === "upload" ? `Upload: ${s.filename}` : s.url,
      tier: TIER_LABELS[s.tier],
      party: s.party,
      published: s.publishedAt ?? "",
      accessed: s.accessedAt,
      note: s.relevanceNote,
      claims: s.claimCount,
    })),
  );

  sheet(
    "Claim Table",
    [
      { header: "ID", key: "id", width: 6 },
      { header: "Claim", key: "claim", width: 60 },
      { header: "Type", key: "type", width: 12 },
      { header: "Confidence", key: "confidence", width: 11 },
      { header: "Confidence rule (R1)", key: "rule", width: 40 },
      { header: "Sources", key: "sources", width: 10 },
      { header: "Excerpts", key: "excerpts", width: 70 },
      { header: "Links marked wrong", key: "wrong", width: 12 },
      { header: "Read from (image / chart)", key: "visual", width: 26 },
      { header: "Conflicts", key: "conflicts", width: 16 },
    ],
    claims.claims.map((c) => ({
      id: c.code,
      claim: c.statement,
      type: CLAIM_TYPE_LABELS[c.type],
      confidence: c.confidence ? CONFIDENCE_LABELS[c.confidence] : "",
      rule: c.basis?.rule ?? "",
      sources: c.links.map((l) => l.sourceCode).join(", "),
      excerpts: c.links.map((l) => `${l.sourceCode}: "${l.excerpt}"`).join("\n"),
      wrong: c.links.filter((l) => l.markedWrong).map((l) => l.sourceCode).join(", "),
      visual: c.links.filter((l) => l.visual).map((l) => `${l.sourceCode} ${l.visual!.locator}`).join(", "),
      conflicts: c.conflicts.map((x) => `${x.code} (${x.status})`).join(", "),
    })),
  );

  sheet(
    "Conflict Register",
    [
      { header: "ID", key: "id", width: 6 },
      { header: "Kind", key: "kind", width: 8 },
      { header: "Description", key: "description", width: 50 },
      { header: "Side A", key: "a", width: 8 },
      { header: "Passage A", key: "pa", width: 45 },
      { header: "Side B", key: "b", width: 8 },
      { header: "Passage B", key: "pb", width: 45 },
      { header: "Status", key: "status", width: 22 },
      { header: "Rationale", key: "rationale", width: 45 },
      { header: "Resolved by", key: "by", width: 16 },
      { header: "Parent", key: "parent", width: 8 },
    ],
    conflicts.map((c) => ({
      id: c.code,
      kind: c.kind,
      description: c.description,
      a: c.sideA.code,
      pa: c.sideA.passage,
      b: c.sideB.code,
      pb: c.sideB.passage,
      status: CONFLICT_STATUS_LABELS[c.status],
      rationale: c.rationale ?? "",
      by: c.resolvedBy ?? "",
      parent: c.parentCode ?? "",
    })),
  );

  sheet(
    "Uncertainty List",
    [
      { header: "ID", key: "id", width: 6 },
      { header: "Open question", key: "question", width: 60 },
      { header: "Why unresolved", key: "why", width: 50 },
      { header: "Decision-critical", key: "critical", width: 10 },
      { header: "Origin", key: "origin", width: 20 },
      { header: "Minimum evidence", key: "evidence", width: 50 },
      { header: "Falsifiers", key: "falsifiers", width: 10 },
    ],
    counterCase.uncertainties.map((u) => ({
      id: u.code,
      question: u.question,
      why: u.whyUnresolved,
      critical: u.decisionCritical ? "Yes" : "No",
      origin: u.origin,
      evidence: u.minEvidence ?? "",
      falsifiers: u.falsifierCodes.join(", "),
    })),
  );

  sheet(
    "Dimension Assessment",
    [
      { header: "ID", key: "id", width: 6 },
      { header: "Dimension", key: "title", width: 28 },
      { header: "Score", key: "score", width: 7 },
      { header: "Model score", key: "proposed", width: 8 },
      { header: "Capped by", key: "capped", width: 9 },
      { header: "Override", key: "override", width: 30 },
      { header: "Prompts & answers", key: "answers", width: 80 },
      { header: "Strongest counter signal", key: "counter", width: 50 },
      { header: "Cited claims", key: "claims", width: 20 },
    ],
    dimensions.assessments.map((a) => ({
      id: a.code,
      title: a.title,
      score: effectiveScore(a),
      proposed: a.proposedScore,
      capped: a.cappedBy ?? "",
      override: a.override ? `${a.override.score} by ${a.override.by ?? "—"}${a.override.reason ? `: ${a.override.reason}` : ""}` : "",
      answers: a.answers.map((x) => `${x.prompt}\n→ ${x.answer} [${x.claimCodes.join(", ")}]`).join("\n\n"),
      counter: a.counterSignal,
      claims: a.claimCodes.join(", "),
    })),
  );

  return sheets;
}
