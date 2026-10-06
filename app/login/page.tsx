import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { AuthShell } from "../auth-shell";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Sign in · Tracer",
};

const ERRORS: Record<string, string> = {
  confirm: "That confirmation link is invalid or has expired. Sign in, or sign up again.",
  onboarding: "Your email is confirmed, but the fund couldn't be set up. Try signing in.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  if (await getCurrentUser()) redirect("/deals");

  const { error } = await searchParams;
  const message = typeof error === "string" ? ERRORS[error] : undefined;

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in with your fund account."
      footer={
        <>
          New fund? <Link href="/signup">Create a fund account</Link>
        </>
      }
    >
      {message && (
        <p role="alert" className="text-danger mb-4 text-body">
          {message}
        </p>
      )}
      <LoginForm />
    </AuthShell>
  );
}
