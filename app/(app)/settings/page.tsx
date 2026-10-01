import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { listVersions, loadConfig } from "@/lib/config";
import { createClient } from "@/lib/supabase/server";
import { SettingsEditor } from "./settings-editor";

export const metadata: Metadata = {
  title: "Fund settings · Tracer",
};

// Fund settings: admin-only (decision 1). RLS and the config functions enforce
// it again on every write.
export default async function SettingsPage({ searchParams }: PageProps<"/settings">) {
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

  const supabase = await createClient();
  const [active, draft, versions] = await Promise.all([
    loadConfig(supabase, { active: true }),
    loadConfig(supabase, { draft: true }),
    listVersions(supabase),
  ]);

  // ?v=N shows that version read-only (e.g. an older, inactive one).
  const { v } = await searchParams;
  const requested = typeof v === "string" ? Number.parseInt(v, 10) : NaN;
  const viewing =
    Number.isInteger(requested) && requested !== active?.version && requested !== draft?.version
      ? await loadConfig(supabase, { version: requested })
      : null;

  return (
    <SettingsEditor
      // Remount (fresh editor state) whenever the server data changes version.
      key={`${active?.id}:${draft?.id}:${viewing?.id}`}
      fundName={user.fundName}
      active={active}
      draft={draft}
      viewing={viewing}
      versions={versions}
    />
  );
}
