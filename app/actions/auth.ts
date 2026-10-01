"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ensureFundMembership } from "@/lib/onboarding";
import { MIN_PASSWORD_LENGTH } from "@/lib/passwords";
import { createClient } from "@/lib/supabase/server";

export type SignInState = { error?: string; email?: string } | undefined;

export async function signIn(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Enter your email and password.", email };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    const message =
      error.code === "invalid_credentials"
        ? "Wrong email or password."
        : error.code === "email_not_confirmed"
          ? "Confirm your email first. Check your inbox for the link."
          : "Sign-in failed. Try again.";
    // Same message for unknown email and wrong password.
    return { error: message, email };
  }

  // Completes a fund sign-up whose onboarding didn't finish at confirmation.
  if (!(await ensureFundMembership(data.user.id))) {
    await supabase.auth.signOut();
    return { error: "This account doesn't belong to a fund. Ask your fund admin.", email };
  }

  redirect("/deals");
}

export type SignUpState =
  | { error?: string; sentTo?: string; values?: { fundName: string; displayName: string; email: string } }
  | undefined;

export async function signUp(_prev: SignUpState, formData: FormData): Promise<SignUpState> {
  const fundName = String(formData.get("fund_name") ?? "").trim();
  const displayName = String(formData.get("display_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const values = { fundName, displayName, email };

  if (!fundName || !displayName || !email) {
    return { error: "Fill in every field.", values };
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`, values };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${await siteOrigin()}/auth/confirm`,
      data: { fund_name: fundName, display_name: displayName },
    },
  });

  if (error) {
    const message =
      error.code === "weak_password"
        ? "Choose a stronger password."
        : error.code === "email_address_invalid"
          ? "Enter a valid email address."
          : error.code === "over_email_send_rate_limit"
            ? "Too many sign-up emails. Try again in a few minutes."
            : error.code === "signup_disabled"
              ? "Sign-up is currently disabled."
              : "Sign-up failed. Try again.";
    return { error: message, values };
  }

  // Supabase answers the same way for an already-registered email, so the
  // form never reveals which addresses have accounts.
  return { sentTo: email };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

async function siteOrigin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
