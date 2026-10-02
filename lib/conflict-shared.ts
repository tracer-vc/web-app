// Conflict Register view types shared by server and client code.
import type { Enums } from "@/lib/supabase/database.types";

export type ConflictStatus = Enums<"conflict_status">;

export const MAX_RATIONALE_LENGTH = 2000;

export const CONFLICT_STATUS_LABELS: Record<ConflictStatus, string> = {
  open: "Open",
  resolved_a: "Resolved in favour of A",
  resolved_b: "Resolved in favour of B",
  unresolvable: "Unresolvable",
};
export const CONFLICT_STATUS_SHORT: Record<ConflictStatus, string> = {
  open: "open",
  resolved_a: "resolved: A",
  resolved_b: "resolved: B",
  unresolvable: "unresolvable",
};

export type ConflictSideView = {
  id: string;
  code: string; // S# or C#
  text: string; // source title or claim statement
  meta: string; // tier · party, or type · confidence · S#
  passage: string;
};

export type ConflictView = {
  id: string;
  code: string;
  kind: Enums<"conflict_kind">;
  description: string;
  status: ConflictStatus;
  rationale: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  parentCode: string | null; // claim conflict → its source conflict
  childCodes: string[]; // source conflict → claim conflicts repeating it
  sideA: ConflictSideView;
  sideB: ConflictSideView;
};
