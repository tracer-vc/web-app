import type { EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { ensureFundMembership } from "@/lib/onboarding";
import { grantPasswordReset } from "@/lib/reset-grant";
import { createClient } from "@/lib/supabase/server";

// Target of the sign-up confirmation and password-reset emails. Verifies the
// link, signs the user in and finishes fund onboarding; a reset link then goes
// on to /reset-password. Accepts the token-hash link (works on any device) and
// the PKCE code link (same browser as the request only).
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const tokenHash = params.get("token_hash");
  const type = params.get("type") as EmailOtpType | null;
  const code = params.get("code");
  const recovery = type === "recovery" || params.get("next") === "/reset-password";

  const supabase = await createClient();
  let userId: string | undefined;

  if (tokenHash && type) {
    const { data, error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) userId = data.user?.id;
  } else if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) userId = data.user?.id;
  }

  if (!userId) redirect(recovery ? "/login?error=reset" : "/login?error=confirm");

  if (!(await ensureFundMembership(userId))) {
    await supabase.auth.signOut();
    redirect("/login?error=onboarding");
  }

  if (recovery) {
    await grantPasswordReset(userId);
    redirect("/reset-password");
  }
  redirect("/deals");
}
