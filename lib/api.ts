import "server-only";

import { getCurrentUser, type CurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;
type Context = { user: CurrentUser; supabase: Supabase };

export function jsonError(status: number, error: string, extra?: Record<string, unknown>) {
  return Response.json({ error, ...extra }, { status });
}

// Signed-in fund member (any role), or a 401 response.
export async function memberContext(): Promise<Context | Response> {
  const user = await getCurrentUser();
  if (!user) return jsonError(401, "Not signed in.");
  return { user, supabase: await createClient() };
}

// Signed-in fund admin, or a 401/403 response. RLS and the database functions
// check the role again; this gives a clean status code first.
export async function adminContext(): Promise<Context | Response> {
  const ctx = await memberContext();
  if (ctx instanceof Response) return ctx;
  if (ctx.user.role !== "admin") return jsonError(403, "Only fund admins can change fund settings.");
  return ctx;
}

// Postgres errors raised by our functions/triggers -> HTTP status + message.
export function dbErrorResponse(error: { code?: string; message: string }) {
  const status =
    error.code === "42501" // insufficient_privilege
      ? 403
      : error.code === "P0002" // no_data_found
        ? 409
        : error.code === "23514" || error.code === "23505" // check / unique violation
          ? 422
          : 500;
  return jsonError(status, status === 500 ? "Something went wrong. Try again." : error.message);
}
