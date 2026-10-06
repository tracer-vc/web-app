import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { hasPasswordResetGrant } from "@/lib/reset-grant";
import { AuthShell } from "../auth-shell";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = {
  title: "Choose a new password · Tracer",
};

// Reached from a password-reset link (via /auth/confirm). Only a session
// opened by that link may set a password here; a normal session changes it in
// Settings, where the current password is required.
export default async function ResetPasswordPage() {
  const user = await requireUser();
  if (!(await hasPasswordResetGrant(user.id))) redirect("/settings");

  return (
    <AuthShell title="Choose a new password" subtitle={<>For {user.email ?? user.displayName}.</>}>
      <ResetPasswordForm />
    </AuthShell>
  );
}
