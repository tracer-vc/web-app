import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { AuthShell } from "../auth-shell";
import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = {
  title: "Reset password · Tracer",
};

export default async function ForgotPasswordPage() {
  if (await getCurrentUser()) redirect("/deals");

  return (
    <AuthShell
      title="Reset your password"
      subtitle="Enter your account's email and we'll send you a link to choose a new password."
      footer={
        <>
          Remembered it? <Link href="/login">Sign in</Link>
        </>
      }
    >
      <ForgotPasswordForm />
    </AuthShell>
  );
}
