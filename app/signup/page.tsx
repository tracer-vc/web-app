import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { AuthShell } from "../auth-shell";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = {
  title: "Create fund account · Tracer",
};

export default async function SignupPage() {
  if (await getCurrentUser()) redirect("/deals");

  return (
    <AuthShell
      title="Create your fund account"
      subtitle="You become the fund's admin and can add your analysts."
      footer={
        <>
          Already have an account? <Link href="/login">Sign in</Link>
        </>
      }
    >
      <SignupForm />
    </AuthShell>
  );
}
