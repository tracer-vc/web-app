import "server-only";

import type { PromptClaim } from "@/lib/llm/prompts/claim-table";
import type { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

const codeNumber = (code: string) => Number(code.replace(/^\D+/, ""));

// The Claim Table with its open conflicts and the Uncertainty List, as the
// later prompts (P8–P11) see them. Links marked wrong are left out.
export async function loadClaimContext(admin: Admin, evaluationId: string) {
  const [claims, conflicts, uncertainties] = await Promise.all([
    admin
      .from("claims")
      .select("id, code, type, confidence, statement, links:claim_sources(marked_wrong_at, source:sources(code))")
      .eq("evaluation_id", evaluationId),
    admin.from("conflicts").select("code, kind, side_a_id, side_b_id, description, status").eq("evaluation_id", evaluationId),
    admin.from("uncertainties").select("code, question, decision_critical").eq("evaluation_id", evaluationId),
  ]);
  for (const r of [claims, conflicts, uncertainties]) if (r.error) throw r.error;
  const open = conflicts.data!.filter((c) => c.status === "open");
  return {
    claims: [...claims.data!]
      .sort((a, b) => codeNumber(a.code) - codeNumber(b.code))
      .map(
        (c): PromptClaim => ({
          code: c.code,
          type: c.type,
          confidence: c.confidence,
          statement: c.statement,
          sources: [...new Set(c.links.filter((l) => !l.marked_wrong_at).map((l) => l.source.code))].sort(
            (a, b) => codeNumber(a) - codeNumber(b),
          ),
          openConflicts: open
            .filter((x) => x.kind === "claim" && (x.side_a_id === c.id || x.side_b_id === c.id))
            .map((x) => x.code),
        }),
      ),
    openConflicts: open.map((c) => ({ code: c.code, description: c.description })),
    uncertainties: [...uncertainties.data!]
      .sort((a, b) => codeNumber(a.code) - codeNumber(b.code))
      .map((u) => ({ code: u.code, question: u.question, decisionCritical: u.decision_critical })),
  };
}
