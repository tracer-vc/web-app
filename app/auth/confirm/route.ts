import type { EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { ensureFundMembership } from "@/lib/onboarding";
import { createClient } from "@/lib/supabase/server";

// Target of the sign-up confirmation email. Verifies the link, signs the user
// in and finishes fund onboarding. Accepts the token-hash link (works on any
// device) and the PKCE code link (same browser as the sign-up only).
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const tokenHash = params.get("token_hash");
  const type = params.get("type") as EmailOtpType | null;
  const code = params.get("code");

  const supabase = await createClient();
  let userId: string | undefined;

  if (tokenHash && type) {
    const { data, error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) userId = data.user?.id;
  } else if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) userId = data.user?.id;
  }

  if (!userId) redirect("/login?error=confirm");

  if (!(await ensureFundMembership(userId))) {
    await supabase.auth.signOut();
    redirect("/login?error=onboarding");
  }

  redirect("/deals");
}
