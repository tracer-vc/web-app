import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Fund settings · Tracer",
};

// Placeholder until M3/M4. Admin-only (decision 1); RLS enforces writes separately.
export default async function SettingsPage() {
  const user = await requireUser();

  if (user.role !== "admin") {
    return (
      <>
        <h1 className="mb-1.5 text-3xl">Fund settings</h1>
        <p className="text-muted text-[13px]">
          Not allowed. Only fund admins can edit the framework configuration.
        </p>
      </>
    );
  }

  return (
    <>
      <h1 className="mb-1.5 text-3xl">Fund settings</h1>
      <p className="text-muted mb-6 text-[13px]">
        Active configuration: v{user.activeConfigVersion ?? "–"}. Editing arrives in M3.
      </p>
      <Link href="/settings/team" className="card max-w-sm no-underline">
        <span className="text-[15px] text-[var(--color-text)]">Team</span>
        <span className="text-muted text-[13px]">Add analysts and admins to {user.fundName}.</span>
      </Link>
    </>
  );
}
