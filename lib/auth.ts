import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Enums } from "@/lib/supabase/database.types";

export type CurrentUser = {
  id: string;
  email: string | null;
  displayName: string;
  role: Enums<"user_role">;
  fundId: string;
  fundName: string;
  activeConfigVersion: number | null;
};

// Verified session + profile for the current request, or null when logged out.
// Memoised per render pass, so layout and page share one lookup.
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();

  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = claimsData?.claims;
  if (!claims) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, display_name, role, fund_id, funds(name)")
    .eq("id", claims.sub)
    .maybeSingle();
  if (!profile || !profile.funds) return null;

  // RLS limits framework_configs to the user's fund.
  const { data: config } = await supabase
    .from("framework_configs")
    .select("version")
    .eq("is_active", true)
    .maybeSingle();

  const email = typeof claims.email === "string" ? claims.email : null;

  return {
    id: profile.id,
    email,
    displayName: profile.display_name ?? email ?? "Unknown user",
    role: profile.role,
    fundId: profile.fund_id,
    fundName: profile.funds.name,
    activeConfigVersion: config?.version ?? null,
  };
});

// For pages and Server Functions that need a logged-in user.
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
