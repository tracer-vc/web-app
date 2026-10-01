# Implementation plan

Built from the spec in `docs/` (thesis proposal, app summaries, `data_flow.html`, `ui_design.html`) and the resolutions in `docs/decisions.md`. Where this plan and the spec disagree, the spec wins; update this file when a decision changes.

**Stack:** Next.js 16 (App Router) on Vercel · Supabase (Postgres, Auth, Storage) · OpenAI `gpt-6-luna` · Tavily · Inngest.

**Ground rules for every milestone**

- Schema changes: a new file in `supabase/migrations/`, applied with the Supabase MCP `apply_migration`, followed by a security `get_advisors` check.
- RLS is enabled on every table in the migration that creates it.
- Each milestone adds only the tables it needs, together with the enforcement triggers that protect them. The invariant core is enforced by the database from the moment a table exists.
- RLS model (applies to every migration): every table carries `fund_id` (copied from its parent by the `set_fund_id()` trigger). Members of a fund can `select` all rows of that fund. Users write only what the UI lets them write: admins write draft configs; analysts create companies, evaluations, quick-screen answers, documents, conflict resolutions and overrides. Everything the pipeline produces (sources, claims, conflicts, statements, …) is written by the Inngest worker with the service-role key, so users get no insert/update policy on those tables.
- The milestone ends with `npm run build` passing and the app running (locally and, from M2 on, on Vercel).
- Each milestone lists a manual test. It is done when every step of that test passes.

**Milestone overview**

| # | Milestone | Pipeline step |
| :- | :- | :- |
| M1 | Foundation schema: funds, profiles, framework config, seed | 0 |
| M2 | Auth, fund sign-up, team, app shell and Vercel deploy | — |
| M3 | Fund settings: versioning and prompt lists | 0 |
| M4 | Fund settings: dimensions and rule editors | 0 |
| M5 | LLM layer, deals list, Quick Screen | 1 |
| M6 | Document upload and text extraction | 2a |
| M7 | Inngest pipeline runs and Source Table from uploads | 2b |
| M8 | Web search and source conflicts | 2b |
| M9 | Claim extraction and Claim Table | 3 |
| M10 | Conflict Register and analyst evidence actions | 3–6 |
| M11 | Counter-case, Uncertainty List, falsifiers | 4 |
| M12 | Dimension analysis | 5 |
| M13 | Synthesis and output documents | 6 |
| M14 | Re-runs, error hardening, exports | all |
| M15 | Baseline run for Study 2 | — |

---

## M1 — Foundation schema: funds, profiles, framework config, seed

**Goal.** The tables everything else hangs off exist with RLS, and the fund's configuration v1 is seeded. Later milestones add their own tables on top.

**Migrations** (one file each, applied in order):

1. `helpers` — shared enums (`user_role`, `config_status`, `source_tier`); helper functions `current_fund_id()` and `is_fund_admin()` (security definer, fixed `search_path`); the `set_fund_id()` trigger function used by all later tables.
2. `fund_and_profiles` — `funds`, `profiles` (→ `auth.users`, `fund_id`, `role`). Trigger on `auth.users` insert that creates a `profiles` row in the single fund with role `analyst`.
3. `framework_config` — `framework_configs` (`version`, `status` draft | published, `is_active`; at most one active published config and one draft per fund; jsonb `tier_definitions`, `confidence_rules`, `sufficiency_rule`, `score_anchors`, `classification_criteria`), `quick_screen_questions`, `collection_prompts` (`required`), `counter_case_prompts`, `dimensions`, `dimension_prompts` (concrete prompts as rows, decision 30), `dimension_required_prompts` (dimension → collection prompt, for the score cap). Triggers: rows of a published config are read-only; at most 7 quick-screen questions per config.
4. `seed_config` — one fund; config v1 (published, active) with tier definitions, R1 confidence rules (decision 9), sufficiency rule (decision 16), score anchors, R3 classification predicates (decision 12), the 9 Collection Prompts, the 3 Counter-Case Prompts, the 2 Quick Screen questions, and the 2 defined dimensions with their concrete prompts.

**Pages/routes.** None. The Next.js app is unchanged.

**Manual test** (Supabase SQL editor):

1. `list_tables` shows the 10 tables above, all with RLS enabled; `get_advisors` (security) reports nothing.
2. `select` the seeded config → v1, published, active, with 9 Collection Prompts, 3 Counter-Case Prompts, 2 Quick Screen questions, 2 dimensions and their prompts.
3. Update a Collection Prompt of v1 → fails (published config is read-only).
4. Insert a second active published config for the fund → fails.
5. Insert an 8th Quick Screen question into a draft → fails.
6. Create a test user in the Supabase dashboard → a `profiles` row appears with role `analyst`.
7. Query as that user (`set role authenticated` + JWT claims) → sees the config; as a user of a second test fund → sees 0 rows.
8. `npm run build` passes.

---

## M2 — Auth, fund sign-up, team, app shell and Vercel deploy

**Goal.** A fund signs up, confirms its email and lands in the app as admin with its own config v1; the admin adds analysts and admins; every page except `/login`, `/signup` and `/auth/*` requires a session; the app shell (Deals, Fund settings, fund name, active config version) matches `ui_design.html`; the app runs on Vercel. (Decision 2, revised.)

**Migrations.** `simplify_handle_new_user`, then `self_service_funds` (drops the `auth.users` trigger; `create_fund_with_admin()` for the service role creates fund + admin profile + default config v1) and `allow_fund_deletion` (a fund can be deleted by the service role once it has no members; published configs stay locked otherwise).

**Pages/routes.**

- `/signup` — fund name, name, email, password → `supabase.auth.signUp` with a confirmation email.
- `/auth/confirm` — verifies the email link (token hash or PKCE code), signs in, runs onboarding (`lib/onboarding.ts`), redirects to `/deals`.
- `/login` — email + password (Server Function calling `signInWithPassword`); sign-out action in the shell.
- `proxy.ts` — redirects unauthenticated requests to `/login`.
- `app/(app)/layout.tsx` — shell; `/deals` placeholder; `/settings` placeholder and `/settings/team` (member list + add member), both admin-only and checked server-side.
- Vercel project with env vars. Supabase Auth: sign-up and "Confirm email" on, custom SMTP, Site URL and redirect URLs (`<origin>/auth/confirm`) for localhost and the Vercel domain, "Confirm signup" email template linking to `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`.

**Manual test.**

1. Open `/deals` logged out → redirected to `/login`.
2. Wrong password → error message, no redirect.
3. Sign up a new fund → "check your email"; open the link → lands on `/deals` as admin with the fund name and "Config v1"; "Fund settings" is in the nav.
4. Fund settings → Team → add an analyst → listed; adding the same email again → error.
5. Sign out → back on `/login`; the back button doesn't show the app.
6. Log in as the analyst → same fund, "Fund settings" isn't in the nav; typing `/settings` or `/settings/team` shows "not allowed".
7. Sign up a second fund → its admin sees only its own fund and members.
8. Repeat 1–6 on the Vercel URL.

---

## M3 — Fund settings: versioning and prompt lists

**Goal.** An admin edits the framework configuration as a draft and publishes it as a new version; old versions stay unchanged. This milestone covers the list-type settings.

**Migration** `config_versioning`: Postgres functions `create_config_draft()` (copies the active version and all child rows) and `publish_config()`; `analyst_actions` (audit log: actor, action, target table/id, before/after jsonb).

**DB tables.** `framework_configs`, `quick_screen_questions`, `collection_prompts`, `counter_case_prompts`, `analyst_actions` (new).

**Pages/routes.**

- `/settings` — sections: Fixed mechanism (read-only text), Source tiers, Quick Screen questions (1–7), Collection Prompts (add/edit/delete/reorder, "required" toggle), Counter-Case Prompts, Configuration versions (list with date, author, number of evaluations using it).
- "Edit" creates a draft by copying the active version (`create_config_draft()`); "Discard draft"; "Publish as vN" (`publish_config()`: marks draft published and active, previous one inactive).
- `GET /api/settings/config`, `PUT /api/settings/config` (per data-flow doc), used by the page.

**Manual test.**

1. As admin: add a 10th Collection Prompt, reorder two, delete one Counter-Case Prompt → draft shows the changes; version list still says v1 active.
2. Discard draft → changes gone.
3. Make changes again → Publish → v2 active, v1 listed as inactive and unchanged.
4. Try to add an 8th Quick Screen question → blocked with a message.
5. As analyst: the settings API returns 403 for `PUT`.

---

## M4 — Fund settings: dimensions and rule editors

**Goal.** An admin fully manages dimensions (decision 30) and the rule settings.

**DB tables.** No new tables. Writes `dimensions`, `dimension_prompts`, `dimension_required_prompts`, `framework_configs` (jsonb: `confidence_rules`, `sufficiency_rule`, `score_anchors`, `classification_criteria`).

**Pages/routes.**

- `/settings` gains: Evaluation dimensions (create, delete, edit title/question/claim coverage/high- and low-score signals/disqualifying threshold; per dimension add, edit, reorder, delete concrete prompts; pick required Collection Prompts), Confidence rules (read-only table showing the mechanical rule), Sufficiency rule (locked rows shown with a lock, editable: claims-per-score range, cap value), Score anchors (edit text for 0–1 … 5), Proceed/Watch/Pass criteria (structured predicate editor + free-text note; fixed next-step action shown read-only).
- Validation with zod on the server for every jsonb shape.

**Manual test.**

1. Create dimension "Problem Criticality" with 3 concrete prompts, mark Collection Prompts 4 and 8 as required → publish v3.
2. Delete "Monopoly Path & Moats" in a new draft → publish v4 → v3 still lists it.
3. Set claims-per-score to 3–5 → publish → shown in the version.
4. Try to save a dimension with no question, or a predicate with an invalid score → validation error.
5. Try to edit the "Fact needs ≥1 source" rule → not possible (locked).

---

## M5 — LLM layer, deals list, Quick Screen

**Goal.** An analyst creates a deal, answers the Quick Screen questions and gets the Quick Screen memo with a Proceed / Watch / Pass verdict. The LLM layer every later step uses is built here.

**Migration** `evaluations_and_quick_screen`: `companies`, `evaluations` (`config_id` pinned, `status` enum, `current_step`, `uploads_only`), `quick_screen_answers`, `quick_screen_memos` (+ `original_verdict`, `verdict_overridden_by/at`), `pipeline_runs` (status incl. `done_with_warnings`; synchronous steps log here too), `llm_calls` (→ `pipeline_runs`, prompt key/version, model, input/output, validation errors, tokens, latency).

**DB tables.** The six above (new), `analyst_actions`.

**LLM layer** (`lib/llm/`): OpenAI client; `callLlm({promptKey, promptVersion, schema, input})` with JSON-schema structured output, temperature 0 (verify `gpt-6-luna` supports both; fall back to the closest supported settings and record it in `decisions.md`), zod validation, up to 2 retries (decision 25), logging every attempt to `llm_calls` with tokens and latency. Prompts live as versioned files in `lib/llm/prompts/`.

**Pages/routes.**

- `/deals` — deals table (company, stage · sector, pipeline step, verdict, open conflicts, critical U#, config version, updated); "New deal".
- `/deals/new` — company name, stage, sector, website; `POST /api/evaluations` pins the active config.
- `/deals/[id]` — deal page with the pipeline tab bar (later steps locked) and the Quick Screen tab: answer form (1–2 sentences each), "Generate memo" → `POST /api/evaluations/[id]/quick-screen` (P1), memo card (thesis, verdict, justification, two uncertainties, reopen condition / gating variable + trigger), "Edit verdict" (override, logged, decision 13).
- Status after memo: `passed`, `watch` or `collecting`; only `collecting` unlocks the Evidence tab.

**Manual test.**

1. Create "Nordwind" (Seed, climate software) → appears in `/deals` with status "Screening" and "v1" (or current version).
2. Give strong answers → memo says Proceed; Evidence tab unlocks.
3. Create a second deal with weak answers ("market is small, no wedge") → Pass with a reopen condition; Evidence tab stays locked.
4. Override the Pass to Watch → verdict changes, `analyst_actions` has a row, memo shows "overridden".
5. `llm_calls` has one row per call with prompt key `P1`, tokens, latency.
6. Set `OPENAI_API_KEY` to an invalid value → the UI shows a readable error, nothing half-saved.

---

## M6 — Document upload and text extraction

**Goal.** An analyst uploads deal documents; the system extracts and stores their text.

**Migration** `documents_and_storage`: `documents` (storage path, filename, mime, bytes, `extracted_text`, `extraction_status`); private bucket `deal-documents` (path `{fund_id}/{evaluation_id}/{document_id}.{ext}`, 20 MB limit) with storage policies mirroring `evaluations`.

**DB tables.** `documents` (new), `evaluations`.

**Pages/routes.**

- Evidence tab: drop zone (PDF, PPTX, DOCX, HTML, TXT; max 20 files, 20 MB each), per-file status (uploading, extracting, done, "no text extracted"), delete button (only before 2b ran), "Uploads only (no web search)" switch (decision 28).
- Client gets a signed upload URL (`createSignedUploadUrl`), uploads directly, then `POST /api/evaluations/[id]/documents` registers it and extracts text (`unpdf` for PDF, `mammoth` for DOCX, a PPTX XML parser, readability for HTML).
- `DELETE /api/evaluations/[id]/documents/[docId]`.
- `fixtures/nordwind/` — a small synthetic test corpus (deck PDF, founder profile, press article, blog post) with one planted conflict ("12 paying customers" vs "eight customers") and one planted gap; used for manual tests from here on and as the seed of the Study 2 corpus.

**Manual test.**

1. Upload the four Nordwind fixtures → all show "done"; clicking one shows extracted text.
2. Upload an image-only PDF → "no text extracted", other files unaffected.
3. Upload a 25 MB file or a 21st file → rejected with a message.
4. Delete a document → file removed from Storage and table.
5. As a user of another fund (second test fund created via SQL) → can't read the file URL.

---

## M7 — Inngest pipeline runs and Source Table from uploads

**Goal.** "Build Source Table" runs in the background and turns uploads into S1…Sn with tier, party, date, relevance note and prompt coverage. Background-job infrastructure used by M8, M9, M12.

**Migration** `sources`: `sources` (`code` S#, `document_id`, `origin` upload | web, title, url, `tier`, `party`, dates, relevance note, `content_text`), `source_prompt_coverage`; unique `(evaluation_id, code)`.

**DB tables.** `sources`, `source_prompt_coverage` (new), `pipeline_runs`, `llm_calls`.

**Pages/routes.**

- Inngest setup: `app/api/inngest/route.ts`, Inngest dev server locally, Inngest Cloud integration on Vercel.
- `POST /api/evaluations/[id]/sources/collect` → creates a `pipeline_runs` row, sends an Inngest event, returns 202.
- Worker (service-role client): P2 per document, assigns S# in insertion order, updates progress; one failing document → `done_with_warnings` (decision 25).
- `GET /api/evaluations/[id]/runs/[runId]` + client polling every 2 s → progress bar ("Step 2 · Classifying S3 of 4").
- Source Table view (ID, title, tier, accessed, relevance note, claims count), "Sources by tier" panel, "Coverage of Collection Prompts" panel, source trace drawer (extracted text, prompts answered), tier/party edit (logged, decision 23).

**Manual test.**

1. Nordwind with "uploads only" on → Build Source Table → progress moves, 4 sources S1–S4 with plausible tiers (deck Primary, press Secondary, blog Tertiary) and parties.
2. Coverage panel shows which of the Collection Prompts are covered; the planted gap is uncovered.
3. Change the blog's tier to Secondary → saved and logged.
4. Break one document's text on purpose (empty string via SQL) → run ends `done_with_warnings`, the others are processed.
5. Same test on Vercel with Inngest Cloud.

---

## M8 — Web search and source conflicts

**Goal.** Step 2b also finds web sources and records conflicting sources.

**Migration** `conflicts`: `conflicts` (`code` CR#, `kind` source | claim, `side_a_id`, `side_b_id`, description, passages, `status not null default 'open'`, `rationale`, `resolved_by/at`, `parent_conflict_id`). Trigger: status can only leave `open` with a non-empty rationale, `resolved_by` and `resolved_at`; both sides must belong to the same evaluation and match `kind`.

**DB tables.** `conflicts` (new), `sources`, `source_prompt_coverage`, `llm_calls`.

**Pages/routes.**

- Worker extended: P3 (≤8 queries from uncovered prompts + the two Quick Screen uncertainties) → Tavily → fetch + readability → P2 per hit → P4 over all sources → CR# for source conflicts. Skipped entirely when "uploads only" is on.
- Source Table shows the origin (upload / web) and link; conflict badge on affected sources.

**Manual test.**

1. A real company with public coverage, uploads only off → web sources appear with URLs and tiers; `llm_calls` shows `P3`, `P2`, `P4`.
2. Nordwind (uploads only) → no web sources, no `P3` call.
3. Nordwind → the planted 12-vs-8 customers conflict appears as a CR# of kind `source`, status open.
4. A search result that fails to fetch (paywall) → skipped, run `done_with_warnings`.
5. SQL: set a conflict to `resolved_a` without a rationale → fails.

---

## M9 — Claim extraction and Claim Table

**Goal.** "Extract claims" produces the Claim Table: atomic, typed, excerpted, confidence-rated claims; duplicates merged; contradictions recorded; uncovered required prompts turned into uncertainties.

**Migration** `claims_and_uncertainties`: `claims` (`code` C#, statement, `type`, `confidence`, `merged_into`, notes), `claim_sources` (`excerpt not null`, `excerpt_start/end`, `marked_wrong_by/at`), `claim_prompt_coverage`, `uncertainties` (`code` U#, question, why unresolved, `decision_critical`, `from_prompt_id`, `min_evidence_to_resolve`). Deferred constraint trigger (checked at commit, so a claim and its links go in one transaction): a claim with type ≠ speculation must have ≥1 `claim_sources` row; a speculation must have none.

**DB tables.** The four above (new), `conflicts` (kind `claim`), `pipeline_runs`, `llm_calls`.

**Pages/routes.**

- `POST /api/evaluations/[id]/claims/extract` → Inngest worker: P5 per source (chunked, decision 24) → R4 excerpt check against full text with offsets → P6 merge + contradictions → R1 confidence (pure function in `lib/rules/confidence.ts`, unit-tested) → R2 coverage → P7 for uncovered required prompts → insert everything in one transaction, C#/CR#/U# assigned after the merge.
- Claim Table view: filter All / Fact / Inference / Speculation, columns ID · claim · type · excerpt · S# · confidence, conflict badge.
- Trace drawer for a claim: text, type, confidence and the rule that produced it ("Medium: one Primary party"), each source with the excerpt highlighted in the source text, "cited by".

**Manual test.**

1. Nordwind → 8–24 claims; every Fact/Inference shows an excerpt and S#; every Speculation has none and is marked.
2. Open a claim → the excerpt is highlighted at the right spot in the source text.
3. The "12 paying customers" and "8 customers" claims both exist and share a CR# of kind `claim` linked to the source conflict from M8.
4. The planted gap appears as a U# with "from prompt N".
5. Check a confidence label by hand against decision 9 for three claims.
6. Force an R4 failure (mock P5 output with a paraphrased excerpt in a unit test) → the claim is rejected after retries and logged.
7. SQL: insert a `fact` claim without `claim_sources` → the commit fails; add a source link in the same transaction → succeeds.

---

## M10 — Conflict Register and analyst evidence actions

**Goal.** Conflicts can be resolved with a mandatory rationale; analysts can mark a link as wrong. Confidence is recomputed whenever its inputs change.

**Migration** `recompute_confidence`: function `recompute_confidence(claim_id)` implementing R1 (decision 9) in SQL so it can run after any analyst change. No new tables.

**DB tables.** `conflicts`, `claim_sources` (`marked_wrong_*`), `claims` (confidence), `analyst_actions`.

**Pages/routes.**

- Conflict Register view: ID, side A, side B (text + tier/meta), status selector (open / resolved in favour of A / B / unresolvable), rationale field, "Record resolution" → `PATCH /api/evaluations/[id]/conflicts/[crId]`.
- Conflict trace drawer.
- "Mark link as wrong" in the claim drawer (logged; does not delete the link; shown struck through; counts toward the false-link rate).
- `recompute_confidence(claim_id)` runs after conflict resolution, tier/party edits and link marking (open conflict downgrade from decision 9). The TypeScript R1 from M9 and the SQL function share one set of test cases.

**Manual test.**

1. Try to resolve CR1 without a rationale → blocked (UI and DB).
2. Resolve CR1 for side B with a rationale → status and author shown; the claim on side A is no longer downgraded, its confidence label updates.
3. Mark one link as wrong → struck through, action logged, claim confidence recomputed.
4. As analyst of another fund → PATCH returns 404/403.

---

## M11 — Counter-case, Uncertainty List, falsifiers

**Goal.** "Stress-test thesis" produces three ranked counter-case arguments, the full Uncertainty List and 2–4 falsifiers, all citing existing IDs.

**Migration** `counter_case_and_falsifiers`: `counter_arguments` (`rank` 1–3, argument, mechanism), `counter_argument_claims`, `falsifiers` (`code` F#, criterion, outcome check), `falsifier_claims`, `falsifier_uncertainties`. Deferred triggers: each counter argument and each falsifier cites ≥1 claim (decision 11); all links stay within one evaluation.

**DB tables.** The five above (new), `uncertainties`.

**Pages/routes.**

- `POST /api/evaluations/[id]/counter-case` → P8 → P9 → P10, each output checked that every cited C#/U# exists in this evaluation (else retry, decision 25); U# numbering continues after the step-3 ones; P9 adds up to 10 total (decision 17).
- Views: Counter-Case (prompt → argument → mechanism → C#), Uncertainty List (ID, question, why unresolved, decision-critical, origin, minimum evidence), Falsification Criteria (ID, criterion, outcome check, links). Every ID is a link into the trace drawer.

**Manual test.**

1. Nordwind → 3 counter arguments ranked 1–3, each citing ≥1 C#.
2. Uncertainty List contains the M9 prompt-derived U# plus new ones, ≤10 total from P9, decision-critical flags shown.
3. Each falsifier has a concrete outcome check and cites ≥1 C#.
4. Click any cited ID → correct drawer opens.

---

## M12 — Dimension analysis

**Goal.** "Score dimensions" produces the Dimension Assessment Table with answers citing claims, the strongest counter-signal, and a 0–5 score that respects the sufficiency rule and score caps.

**Migration** `dimension_assessments`: `dimension_assessments` (`code` D#, `dimension_id`, answers jsonb, counter signal, `score` 0–5, `score_capped_by`, `override_score`, `override_by/at`), `dimension_assessment_claims`. Deferred trigger: the number of cited claims lies within the pinned config's sufficiency range (default 2–5).

**DB tables.** The two above (new), `analyst_actions`.

**Pages/routes.**

- `POST /api/evaluations/[id]/dimensions` → Inngest worker, P11 per dimension in parallel; code enforces the claims-per-score range and caps the score (default 2) when a required prompt of that dimension is an open prompt-derived U#, storing `score_capped_by`.
- Dimension table view and dimension drawer (answers per concrete prompt with C#, counter-signal, score + anchor text, "capped by U#" note).
- "Override score" (logged, shown as "Overridden by analyst", original kept).

**Manual test.**

1. Nordwind → one row per dimension of the pinned config version, each citing within the configured range.
2. A dimension whose required prompt is the planted gap → score ≤ 2 with "capped by U#".
3. Override a score → both values visible, action logged.
4. Evaluate a new deal after publishing a config with a new dimension → the new dimension appears there but not in the old Nordwind evaluation.
5. SQL: insert an assessment citing 1 claim → the commit fails.

---

## M13 — Synthesis and output documents

**Goal.** "Generate outputs" produces the Thesis Card, Decision Snapshot and Evidence Pack, all rendered from rows, with the classification computed by rule.

**Migration** `statements_and_decisions`: `statements` (`document`, `section`, position, text), `statement_refs` (`ref_kind` claim | source | uncertainty | falsifier, `ref_id`), `decisions` (`classification`, `rule_trace`, `reeval_trigger`). Deferred triggers: a statement needs ≥1 claim ref, except sections `open_question` and `research_agenda`, which need ≥1 uncertainty ref (decision 11); a source ref is only allowed if the statement also cites a claim linked to that source; refs stay within one evaluation.

**DB tables.** The three above (new), `evaluations` (status `complete`).

**Pages/routes.**

- `POST /api/evaluations/[id]/synthesize` → P12 → validate refs (every statement cites existing C#, S# only alongside its claim, exemptions from decision 11) → R3 (`lib/rules/classification.ts`, unit-tested, stores `rule_trace`) → P13 → insert; invalid statements are regenerated up to 2 times, then the run fails (decision 25).
- Output tabs (unlock after synthesis):
  - Thesis Card — thesis hero, outlier scenario, base/upside/failure cases with gating variables, moat, entry wedge, milestones, falsifiers, dimension scores, open questions; every `[C#]` chip opens the trace drawer.
  - Decision Snapshot — classification, justification, "Rule applied", 3 supporting arguments, 3 risks (= ranked counter arguments, decision 18), research agenda table, re-evaluation trigger.
  - Evidence Pack — the five tables with counts and the "Structural checks" panel (e.g. "0 statements without C#", "all Facts have S# + excerpt", "open conflicts: 1").
- `GET /api/evaluations/[id]/{thesis-card|evidence-pack|decision-snapshot}`.

**Manual test.**

1. Nordwind → all three documents render; the Thesis Card fits one printed page.
2. Follow one statement: `[C4]` → claim → highlighted excerpt → S1 (the worked trace of the thesis).
3. The open conflict is visible in the Snapshot and Evidence Pack.
4. The Rule applied line matches a manual evaluation of the R3 predicates against the scores.
5. Structural checks all green.
6. SQL: insert a `thesis` statement without refs → fails; an `open_question` statement with only a U# ref → succeeds; a source ref for an S# the cited claim doesn't use → fails.

---

## M14 — Re-runs, error hardening, exports

**Goal.** The pipeline is robust enough for the studies: steps can be re-run, failures are visible, and outputs can be exported.

**DB tables.** All evaluation tables (cascade clearing), `pipeline_runs`, `analyst_actions`.

**Pages/routes.**

- "Re-run step" per step: clears that step and all later steps, renumbers (decision 20); blocked once synthesis has run unless the analyst confirms a full reset. Adding or deleting documents after 2b triggers the same rule.
- Run status UI for `failed` / `done_with_warnings` with the error and a link to the failing `llm_calls` rows.
- Print view for Thesis Card and Snapshot; Evidence Pack `.xlsx` export (one sheet per table, IDs preserved) — decision 31.
- Deals list counters and status labels from real data.

**Manual test.**

1. Re-run step 3 on Nordwind → claims, conflicts from P6, U# from R2, and all step 4–6 data are replaced; step 2 unchanged.
2. Upload a new document after step 3 → the UI requires re-running from 2b.
3. Simulate an OpenAI outage (bad key) mid-run → run shows `failed` with a readable error; retrying works after fixing the key.
4. Export the Evidence Pack → the `.xlsx` opens with five sheets whose IDs match the UI.
5. Print the Thesis Card → one page.

---

## M15 — Baseline run for Study 2

**Goal.** For the controlled comparison, the same deal can produce a baseline memo: same LLM, same corpus, same fund config, instructed to write a cited investment memo of comparable length without the claim layer, sufficiency rule or conflict register. Runs are repeatable (5 per condition).

**Migration** `baseline_memos`: `baseline_memos` (evaluation, run number, text, cited document references, model, prompt version).

**DB tables.** `baseline_memos` (new), `llm_calls`.

**Pages/routes.**

- Hidden "Study" tab on the deal page (admin only): "Run baseline", list of baseline runs with their text; "Run artifact again" that performs steps 2b–6 as a new evaluation copy on the same documents, for the 5-run protocol.
- Export of all runs (artifact outputs + baseline memos) for reviewers.

**Manual test.**

1. Run the baseline 5 times on the Nordwind corpus → 5 memos stored, each with its `llm_calls` row.
2. Run the artifact 5 times → 5 complete evaluation copies with separate IDs.
3. Export → one file per run, readable without the app.

---

## Backlog (nice-to-have, not scheduled)

Company and Media tabs; P0 prompt suggestions from dimensions; PDF export; copy-link sharing; "Export deal"; Supabase Realtime instead of polling; OCR fallback; claim text editing; Undo merge; change-log UI; deals-list filters; configuration-version comparison UI.
