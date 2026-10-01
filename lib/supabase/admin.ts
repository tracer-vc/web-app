import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

// Service-role client for background pipeline workers (Steps 2b, 3, 5). Bypasses RLS.
// Server-only: never import this from a Client Component.
export function createAdminClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
