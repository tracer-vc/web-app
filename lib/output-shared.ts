// Output documents (step 6) view types shared by server and client code.
import type { ClassificationTrace } from "@/lib/rules/classification";
import type { RunView } from "@/lib/source-shared";
import type { Enums } from "@/lib/supabase/database.types";

export type Section = Enums<"statement_section">;

export type StatementRefs = { claims: string[]; sources: string[]; uncertainties: string[]; falsifiers: string[] };

export type StatementView = {
  id: string;
  section: Section;
  position: number;
  text: string;
  detail: string | null;
  refs: StatementRefs;
};

export type StructuralCheck = {
  label: string;
  value: string;
  ok: boolean | null; // null: informational
  note: string;
};

export type OutputsView = {
  decision: {
    classification: Enums<"verdict">;
    ruleApplied: string;
    trace: ClassificationTrace;
    reevalTrigger: string | null;
  } | null;
  statements: Partial<Record<Section, StatementView[]>>;
  checks: StructuralCheck[];
  run: RunView | null;
};

export const CLASSIFICATION_LABELS: Record<Enums<"verdict">, string> = { proceed: "Proceed", watch: "Watch", pass: "Pass" };

// Codes of every ref, in display order.
export const refCodes = (r: StatementRefs) => [...r.claims, ...r.sources, ...r.uncertainties, ...r.falsifiers];
