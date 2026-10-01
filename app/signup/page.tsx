import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = {
  title: "Create fund account · Tracer",
};

export default async function SignupPage() {
  if (await getCurrentUser()) redirect("/deals");

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="card w-full max-w-sm">
        <div className="nav-brand mb-2">
          <span className="nav-brand-dot" />
          Tracer
        </div>
        <p className="text-muted mb-3 text-[13px]">
          Create an account for your fund. You become its admin and can add your analysts.
        </p>
        <SignupForm />
      </div>
    </main>
  );
}
