import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { AddMemberForm } from "./add-member-form";

export const metadata: Metadata = {
  title: "Team · Tracer",
};

export default async function TeamPage() {
  const user = await requireUser();

  if (user.role !== "admin") {
    return (
      <>
        <h1 className="mb-1.5 text-3xl">Team</h1>
        <p className="text-muted text-[13px]">Not allowed. Only fund admins can manage the team.</p>
      </>
    );
  }

  // RLS limits profiles to the admin's fund.
  const supabase = await createClient();
  const { data: members } = await supabase
    .from("profiles")
    .select("id, display_name, role, created_at")
    .order("created_at");

  // Emails live in auth.users, which only the Auth admin API can read.
  const admin = createAdminClient();
  const emails = new Map(
    await Promise.all(
      (members ?? []).map(async (m) => {
        const { data } = await admin.auth.admin.getUserById(m.id);
        return [m.id, data.user?.email ?? ""] as const;
      }),
    ),
  );

  return (
    <>
      <p className="mb-2 text-[13px]">
        <Link href="/settings">← Fund settings</Link>
      </p>
      <h1 className="mb-1.5 text-3xl">Team</h1>
      <p className="text-muted mb-8 text-[13px]">
        Everyone here sees all of {user.fundName}&apos;s deals. Admins also edit fund settings and
        the team.
      </p>

      <div className="card mb-8 overflow-x-auto">
        <table className="w-full text-left text-[13px]">
          <thead className="text-muted text-xs">
            <tr>
              <th className="pb-2 font-normal">Name</th>
              <th className="pb-2 font-normal">Email</th>
              <th className="pb-2 font-normal">Role</th>
              <th className="pb-2 font-normal">Added</th>
            </tr>
          </thead>
          <tbody>
            {(members ?? []).map((m) => (
              <tr key={m.id} className="border-t border-[var(--color-divider)]">
                <td className="py-2 pr-4">
                  {m.display_name ?? "—"}
                  {m.id === user.id && <span className="text-muted"> (you)</span>}
                </td>
                <td className="py-2 pr-4">{emails.get(m.id)}</td>
                <td className="py-2 pr-4">
                  <span className="tag tag-neutral">{m.role}</span>
                </td>
                <td className="text-muted py-2">{new Date(m.created_at).toLocaleDateString("en-GB")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2 className="text-lg">Add a member</h2>
        <p className="text-muted mb-2 text-[13px]">
          The account works immediately. Send them the email and password yourself.
        </p>
        <AddMemberForm />
      </div>
    </>
  );
}
