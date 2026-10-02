// Runs all migrations in an in-memory Postgres (PGlite) with minimal stand-ins
// for Supabase's auth and storage schemas, and helpers to act as a signed-in
// user or as the service role. Used by supabase/tests/*.test.mjs (npm test).
import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";

const MIGRATIONS = new URL("../migrations/", import.meta.url);

export async function createDb() {
  const db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key default gen_random_uuid(), email text, email_confirmed_at timestamptz,
      raw_app_meta_data jsonb default '{}', raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create schema storage;
    create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
    grant usage on schema auth, public, storage to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  `);
  for (const f of readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(new URL(f, MIGRATIONS), "utf8"));
  }

  // Run as a signed-in user (RLS applies) / as the service role.
  const as = async (uid, sql, params) => {
    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false)`);
    try {
      return (await db.query(sql, params)).rows;
    } finally {
      await db.exec("rollback").catch(() => {});
      await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false)`);
    }
  };
  const svc = async (sql, params) => {
    await db.exec("set role service_role");
    try {
      return (await db.query(sql, params)).rows;
    } finally {
      await db.exec("reset role");
    }
  };
  // Superuser (no RLS); multi-statement scripts run in one transaction.
  const exec = async (sql) => {
    try {
      await db.exec(sql);
    } catch (e) {
      await db.exec("rollback").catch(() => {});
      throw e;
    }
  };
  const query = async (sql, params) => (await db.query(sql, params)).rows;

  // A fund with its admin and one evaluation moved to claim extraction.
  async function seedDeal(email = "a@test") {
    const uid = crypto.randomUUID();
    await db.query(`insert into auth.users (id, email, email_confirmed_at) values ($1, $2, now())`, [uid, email]);
    await db.query(`select create_fund_with_admin($1, 'Fund ' || $2, 'Ann')`, [uid, email]);
    const [{ create_evaluation: evaluationId }] = await as(uid, `select create_evaluation('Nordwind', '', '', '')`);
    await db.query(`update evaluations set status = 'extracting', current_step = 3 where id = $1`, [evaluationId]);
    return { uid, evaluationId };
  }

  // A web source (S# assigned in insertion order).
  async function addSource(evaluationId, tier, party, text = "We currently serve 12 paying customers. The company works with eight customers.") {
    const [{ id }] = await query(
      `insert into sources (evaluation_id, code, origin, title, url, tier, party, content_text)
       values ($1, 'S0', 'web', 'Source', 'https://example.test/' || gen_random_uuid(), $2, $3, $4) returning id`,
      [evaluationId, tier, party, text],
    );
    return id;
  }

  // A Fact claim linked to the given sources (one transaction, deferred checks).
  async function addFact(evaluationId, sourceIds, statement = "Nordwind serves 12 paying customers.") {
    const id = crypto.randomUUID();
    const links = sourceIds
      .map((s) => `insert into claim_sources (claim_id, source_id, excerpt, excerpt_start, excerpt_end) values ('${id}', '${s}', 'serve 12', 13, 21);`)
      .join("\n");
    await exec(`begin;
      insert into claims (id, evaluation_id, code, statement, type, confidence) values ('${id}', '${evaluationId}', 'C0', '${statement}', 'fact', 'low');
      ${links}
      commit;`);
    return id;
  }

  return { db, as, svc, exec, query, seedDeal, addSource, addFact };
}
