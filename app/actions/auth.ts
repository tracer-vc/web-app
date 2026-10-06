"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ensureFundMembership } from "@/lib/onboarding";
import { MIN_PASSWORD_LENGTH } from "@/lib/passwords";
import { clearPasswordResetGrant, hasPasswordResetGrant } from "@/lib/reset-grant";
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

export type ResetRequestState = { error?: string; sentTo?: string; email?: string } | undefined;

// Sends a password-reset link. The answer is the same whether or not the
// address has an account, so the form never reveals which emails exist.
export async function requestPasswordReset(_prev: ResetRequestState, formData: FormData): Promise<ResetRequestState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { error: "Enter your email.", email };

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${await siteOrigin()}/auth/confirm?next=/reset-password`,
  });
  if (error?.code === "over_email_send_rate_limit") {
    return { error: "Too many emails. Try again in a few minutes.", email };
  }
  if (error?.code === "email_address_invalid") return { error: "Enter a valid email address.", email };
  return { sentTo: email };
}

export type ResetPasswordState = { error?: string } | undefined;

// Sets a new password for a session opened by a reset link (see
// lib/reset-grant.ts). Other sessions change it in Settings with the current one.
export async function resetPassword(_prev: ResetPasswordState, formData: FormData): Promise<ResetPasswordState> {
  const next = String(formData.get("new_password") ?? "");
  const confirm = String(formData.get("confirm_password") ?? "");

  if (next.length < MIN_PASSWORD_LENGTH) {
    return { error: `The new password must be at least ${MIN_PASSWORD_LENGTH} characters.` };
  }
  if (next !== confirm) return { error: "The passwords don't match." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !(await hasPasswordResetGrant(user.id))) {
    return { error: "This reset link has expired. Request a new one." };
  }

  const { error } = await supabase.auth.updateUser({ password: next });
  if (error) {
    return {
      error:
        error.code === "weak_password"
          ? "Choose a stronger password."
          : error.code === "same_password"
            ? "Choose a password different from your old one."
            : "Couldn't set the password. Try again.",
    };
  }
  await clearPasswordResetGrant();
  redirect("/deals");
}
