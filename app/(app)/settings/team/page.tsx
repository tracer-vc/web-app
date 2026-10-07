import type { Metadata } from "next";
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
        <h1 className="mb-1.5 text-page">Team</h1>
        <p className="text-muted text-body">Not allowed. Only fund admins can manage the team.</p>
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
      <h1 className="mb-1.5 text-page">Team</h1>
      <p className="text-muted mb-8 text-body">
        Everyone here sees all of {user.fundName}&apos;s deals. Admins also edit fund settings and
        the team.
      </p>

      <h2 className="text-section mb-3 font-semibold">Members</h2>
      <div className="panel mb-8 overflow-x-auto">
        <table className="data-table w-full text-left text-body">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Added</th>
            </tr>
          </thead>
          <tbody>
            {(members ?? []).map((m) => (
              <tr key={m.id}>
                <td>
                  {m.display_name ?? "—"}
                  {m.id === user.id && <span className="text-muted"> (you)</span>}
                </td>
                <td>{emails.get(m.id)}</td>
                <td>
                  <span className="tag tag-neutral">{m.role}</span>
                </td>
                <td className="text-muted">{new Date(m.created_at).toLocaleDateString("en-GB")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2 className="text-section font-semibold">Add a member</h2>
        <p className="text-muted mb-2 text-body">
          The account works immediately. Send them the email and password yourself.
        </p>
        <AddMemberForm />
      </div>
    </>
  );
}
