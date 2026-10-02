"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type NewDealState = { error?: string; values?: Record<string, string> } | undefined;

// Same as POST /api/evaluations, as a Server Action so the form also works
// before the page has hydrated.
export async function createDeal(_prev: NewDealState, formData: FormData): Promise<NewDealState> {
  await requireUser();
  const field = (k: string, max: number) => String(formData.get(k) ?? "").trim().slice(0, max);
  const values = {
    name: field("name", 200),
    stage: field("stage", 60),
    sector: field("sector", 200),
    website: field("website", 500),
  };
  if (!values.name) return { error: "Enter the company name.", values };

  const supabase = await createClient();
  const { data: id, error } = await supabase.rpc("create_evaluation", {
    p_name: values.name,
    p_stage: values.stage,
    p_sector: values.sector,
    p_website: values.website,
  });
  if (error) {
    return {
      error: error.code === "23514" ? error.message : "Couldn't create the deal. Try again.",
      values,
    };
  }

  redirect(`/deals/${id}`);
}
