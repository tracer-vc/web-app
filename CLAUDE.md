@AGENTS.md

# Tracer — VC screening app (thesis instantiation)

Next.js (App Router) on Vercel + Supabase (Postgres, Storage, Auth, Realtime) + OpenAI (LLM) + Tavily (web search) + Inngest (background pipeline steps). The app takes an analyst from uploaded deal materials to a Proceed / Watch / Pass recommendation through a fixed pipeline in which every output statement traces to a claim (C#), and every Fact/Inference claim to a tiered source (S#) with a verbatim excerpt.

## The spec is the source of truth

The documents in `docs/` define what to build. When code and spec disagree, the spec wins; when the spec is ambiguous or silent, ask rather than invent.

- `docs/description_as_thesis_proposal.md` — design theory: meta-requirements MR1–MR3, principles P1–P3, the invariant core (section 2.4) and principles of implementation (section 2.7).
- `docs/app_summary.md` — framework detail: output fields, ID conventions, workflow steps, example tables.
- `docs/app_short_summary.md` — plain-language overview.
- `docs/data_flow.html` — pipeline, route handlers, LLM prompts P0–P13, hard rules R1–R4, database schema, endpoints.
- `docs/ui_design.html` — screens and components.
- `docs/decisions.md` — agreed resolutions of gaps and contradictions in the docs above, plus core vs nice-to-have scope. Takes precedence where it conflicts with them.
- `docs/plan.md` — implementation plan in milestones M1–M15, each with tables, routes and a manual test. Work one milestone at a time; a milestone is done when its manual test passes.

The two `.html` files are self-unpacking bundles (gzip + base64 inside `<script type="__bundler/...">` tags); open them in a browser or decode the manifest/template to read them.

Never weaken the invariant core: mandatory C# on every evaluative statement, mandatory S# + excerpt on every Fact/Inference, three claim types, mandatory conflict status, outputs rendered from rows (never free LLM text), the shared ID scheme (S#, C#, CR#, U#, F#, D#). These are enforced in the database (constraints/triggers), not only in application code. Confidence (R1) and classification (R3) are computed by code, never chosen by the model.

## Database

- Every schema change goes into `supabase/migrations/` as a new SQL file named `<YYYYMMDDHHMMSS>_<short_description>.sql`, then is applied to the project with the Supabase MCP `apply_migration` tool using the same name and SQL. Never change the schema via `execute_sql`, the dashboard, or by editing an already-applied migration.
- Row Level Security is enabled on every table, with explicit policies, in the same migration that creates the table. Scope access by `fund_id` (through the user's `profiles` row). No table ships without RLS.
- Storage bucket `deal-documents` is private; its policies mirror `evaluations`.
- After applying a migration, run the Supabase MCP `get_advisors` (security) check and fix anything it reports.

## Supabase clients

- `lib/supabase/client.ts` — Client Components (browser, RLS as the user).
- `lib/supabase/server.ts` — Server Components, Server Functions, Route Handlers (RLS as the user). Create one per request.
- `lib/supabase/admin.ts` — service-role client. Bypasses RLS; never import it into client code. Allowed only in background pipeline workers and in server code that needs the Auth admin API or service-only functions: fund onboarding (`lib/onboarding.ts`) and admin-checked team management (`app/actions/team.ts`, `/settings/team`).
- `proxy.ts` (Next 16's replacement for `middleware.ts`) refreshes the auth session via `lib/supabase/proxy.ts`.

Env vars are listed in `.env.local.example`. `.env.local` is gitignored and must never be committed.

## Before finishing a task

Run `npm run build` and make sure it passes. Report failures honestly rather than finishing with a broken build.
