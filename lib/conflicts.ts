import "server-only";

import { CLAIM_TYPE_LABELS, CONFIDENCE_LABELS } from "@/lib/claim-shared";
import type { ConflictView } from "@/lib/conflict-shared";
import { TIER_LABELS } from "@/lib/source-shared";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

const codeNumber = (code: string) => Number(code.replace(/^\D+/, ""));

// The deal's Conflict Register: source and claim conflicts with both sides
// spelled out and the recorded resolution (RLS: the caller's fund only).
export async function loadConflictRegister(supabase: Supabase, evaluationId: string): Promise<ConflictView[]> {
  const [conflicts, sources, claims] = await Promise.all([
    supabase
      .from("conflicts")
      .select(
        "id, code, kind, side_a_id, side_b_id, description, passage_a, passage_b, status, rationale, resolved_at, parent_conflict_id, resolver:profiles(display_name)",
      )
      .eq("evaluation_id", evaluationId),
    supabase.from("sources").select("id, code, title, tier, party").eq("evaluation_id", evaluationId),
    supabase
      .from("claims")
      .select("id, code, statement, type, confidence, links:claim_sources(source:sources(code))")
      .eq("evaluation_id", evaluationId),
  ]);
  for (const r of [conflicts, sources, claims]) if (r.error) throw r.error;

  const sourceById = new Map(sources.data!.map((s) => [s.id, s]));
  const claimById = new Map(claims.data!.map((c) => [c.id, c]));
  const codeById = new Map(conflicts.data!.map((c) => [c.id, c.code]));

  const side = (kind: "source" | "claim", id: string, passage: string) => {
    if (kind === "source") {
      const s = sourceById.get(id);
      return { id, code: s?.code ?? "?", text: s?.title ?? "", meta: s ? `${TIER_LABELS[s.tier]} · ${s.party}` : "", passage };
    }
    const c = claimById.get(id);
    const meta = c
      ? [
          CLAIM_TYPE_LABELS[c.type],
          c.confidence ? CONFIDENCE_LABELS[c.confidence] : null,
          [...new Set(c.links.map((l) => l.source.code))].sort((a, b) => codeNumber(a) - codeNumber(b)).join(", "),
        ]
          .filter(Boolean)
          .join(" · ")
      : "";
    return { id, code: c?.code ?? "?", text: c?.statement ?? "", meta, passage };
  };

  return [...conflicts.data!]
    .sort((a, b) => codeNumber(a.code) - codeNumber(b.code))
    .map((c) => ({
      id: c.id,
      code: c.code,
      kind: c.kind,
      description: c.description,
      status: c.status,
      rationale: c.rationale,
      resolvedBy: c.resolver?.display_name ?? null,
      resolvedAt: c.resolved_at,
      parentCode: c.parent_conflict_id ? (codeById.get(c.parent_conflict_id) ?? null) : null,
      childCodes: conflicts
        .data!.filter((x) => x.parent_conflict_id === c.id)
        .map((x) => x.code)
        .sort((a, b) => codeNumber(a) - codeNumber(b)),
      sideA: side(c.kind, c.side_a_id, c.passage_a),
      sideB: side(c.kind, c.side_b_id, c.passage_b),
    }));
}
