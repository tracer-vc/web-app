import * as z from "zod";
import { dbErrorResponse, jsonError, memberContext } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET = "deal-documents";

const Body = z.object({ uploads_only: z.boolean() });

// Decision 28: per-evaluation "uploads only" switch (no web search in 2b).
// Column-granted to members; the database allows changes only before
// Evidence Collection starts.
export async function PATCH(request: Request, ctx: RouteContext<"/api/evaluations/[id]">) {
  const member = await memberContext();
  if (member instanceof Response) return member;
  const { id } = await ctx.params;

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "Send { uploads_only: true | false }.");

  const { data, error } = await member.supabase
    .from("evaluations")
    .update({ uploads_only: parsed.data.uploads_only })
    .eq("id", id)
    .select("uploads_only");
  if (error) return dbErrorResponse(error);
  if (!data.length) return jsonError(404, "Deal not found.");

  return Response.json({ uploadsOnly: data[0].uploads_only });
}

// Delete a deal with everything that belongs to it, including its Study 2
// copies. The database checks fund membership, refuses while a pipeline step
// runs and logs the deletion. The deal's files are removed afterwards with the
// service role: once the rows are gone, the storage policies no longer match.
export async function DELETE(_request: Request, ctx: RouteContext<"/api/evaluations/[id]">) {
  const member = await memberContext();
  if (member instanceof Response) return member;
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return jsonError(404, "Deal not found.");

  const { data: deals, error: readError } = await member.supabase
    .from("evaluations")
    .select("id, fund_id")
    .or(`id.eq.${id},study_parent_id.eq.${id}`);
  if (readError) return dbErrorResponse(readError);
  if (!deals.some((d) => d.id === id)) return jsonError(404, "Deal not found.");

  const { error } = await member.supabase.rpc("delete_evaluation", { p_evaluation_id: id });
  if (error) return dbErrorResponse(error);

  const storage = createAdminClient().storage.from(BUCKET);
  try {
    const paths = (await Promise.all(deals.map((d) => listFiles(storage, `${d.fund_id}/${d.id}`)))).flat();
    for (let i = 0; i < paths.length; i += 1000) {
      const { error: removeError } = await storage.remove(paths.slice(i, i + 1000));
      if (removeError) throw removeError;
    }
  } catch (e) {
    // The deal is gone either way; leftover files are unreachable without its rows.
    console.error(`delete deal ${id}: files not removed`, e);
  }

  return new Response(null, { status: 204 });
}

type Storage = ReturnType<ReturnType<typeof createAdminClient>["storage"]["from"]>;

// Every file below a folder ({fund}/{deal}/{doc}.{ext}, {fund}/{deal}/visuals/{doc}/{n}.{ext}).
async function listFiles(storage: Storage, folder: string): Promise<string[]> {
  const { data, error } = await storage.list(folder, { limit: 1000 });
  if (error) throw error;
  const nested = await Promise.all(
    data.map((f) => (f.id === null ? listFiles(storage, `${folder}/${f.name}`) : Promise.resolve([`${folder}/${f.name}`]))),
  );
  return nested.flat();
}
