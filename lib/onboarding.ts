import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

// After a fund admin confirms their email: create the fund, their admin profile
// and the default config v1 (create_fund_with_admin, service role only).
// No-op for users who already have a profile, e.g. analysts added by an admin.
// Returns false when the user has no profile and no pending fund sign-up.
export async function ensureFundMembership(userId: string): Promise<boolean> {
  const admin = createAdminClient();

  const { data: profile } = await admin
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle();
  if (profile) return true;

  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error || !data.user) return false;

  // Set by the sign-up form. User-controlled, but it can only name a new fund.
  const meta = data.user.user_metadata ?? {};
  const fundName = typeof meta.fund_name === "string" ? meta.fund_name.trim() : "";
  if (!fundName) return false;

  const { error: rpcError } = await admin.rpc("create_fund_with_admin", {
    p_user_id: userId,
    p_fund_name: fundName,
    p_display_name: typeof meta.display_name === "string" ? meta.display_name : "",
  });
  if (rpcError) {
    console.error("create_fund_with_admin failed", rpcError);
    return false;
  }
  return true;
}
