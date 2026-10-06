import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { Preferences } from "./preferences";

export const metadata: Metadata = {
  title: "Preferences · Tracer",
};

// Personal preferences, for every member. Team and fund configuration sit
// next to it in the settings sidebar (admins only).
export default async function PreferencesPage() {
  const user = await requireUser();

  return (
    <div className="max-w-[880px]">
      <h1 className="mb-1.5 text-page">Preferences</h1>
      <p className="text-muted mb-8 text-body">
        Personal settings for your account.
        {user.role !== "admin" && " The fund's framework configuration is edited by fund admins."}
      </p>
      <Preferences devMode={user.devMode} />
    </div>
  );
}
