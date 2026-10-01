import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
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
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="card w-full max-w-sm">
        <div className="nav-brand mb-2">
          <span className="nav-brand-dot" />
          Tracer
        </div>
        <p className="text-muted mb-3 text-[13px]">Sign in with your fund account.</p>
        {message && (
          <p role="alert" className="text-danger mb-2 text-[13px]">
            {message}
          </p>
        )}
        <LoginForm />
        <p className="text-muted mt-4 text-[13px]">
          New fund? <Link href="/signup">Create a fund account</Link>
        </p>
      </div>
    </main>
  );
}
