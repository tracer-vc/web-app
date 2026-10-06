import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { loadConfig } from "@/lib/config";
import { createClient } from "@/lib/supabase/server";
import { UserMenu } from "../(app)/user-menu";
import { SetupWizard } from "./setup-wizard";

export const metadata: Metadata = {
  title: "Set up your fund · Tracer",
};

// Guided fund setup (decision 47): a new fund's admin walks through the
// fund-specific parts of the framework configuration (a draft copy of the
// default template) and publishes it as v1. Afterwards everything is changed in
// Settings.
export default async function SetupPage() {
  const user = await requireUser();
  if (user.fundSetupDone || user.role !== "admin") redirect("/deals");

  const draft = await loadConfig(await createClient(), { draft: true });

  return (
    <div className="flex min-h-screen flex-col">
      <header className="nav print:hidden">
        <Link href="/setup" className="nav-brand">
          <span className="nav-brand-dot" />
          Tracer
        </Link>
        <span className="text-muted text-body">Fund setup</span>
        <div className="ml-auto flex items-center gap-4 text-meta whitespace-nowrap text-[var(--color-neutral-500)]">
          <span>{user.fundName}</span>
          <UserMenu displayName={user.displayName} email={user.email} role={user.role} fundName={user.fundName} />
        </div>
      </header>
      {draft ? (
        <SetupWizard fundName={user.fundName} displayName={user.displayName} draft={draft} />
      ) : (
        <main className="mx-auto max-w-xl px-6 py-16">
          <h1 className="mb-2 text-page">Fund setup</h1>
          <p className="text-muted text-reading">
            The setup draft for {user.fundName} is missing. Sign out and back in; if it stays missing, contact support.
          </p>
        </main>
      )}
    </div>
  );
}
