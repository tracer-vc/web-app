# Design decisions (resolving gaps in the spec)

Agreed 2026-10-01. These close ambiguities and contradictions in the other `docs/` files and are part of the spec. Where they conflict with an older doc, this file wins.

## A. Users, access, tenancy

1. **Roles.** `admin` edits fund settings (framework config). `analyst` and `admin` both run evaluations. All members of a fund see all of that fund's deals.
2. **Onboarding** (revised 2026-10-01; replaces "one fund, seeded accounts only").
   - Funds sign up themselves at `/signup` (fund name, name, email, password). The email must be confirmed; on confirmation the app creates the fund, makes the person its `admin`, and gives the fund its own published config v1 (copy of the default template).
   - Admins add members in the app (Fund settings → Team): email, name, initial password, role `analyst` or `admin`. No email is sent; the admin passes the password on. More than one admin per fund is allowed.
   - Profiles are created only by server code (service role), never from user-supplied metadata, so sign-up can only ever create a new fund, never join an existing one.
3. **Auth.** Email + password via Supabase Auth.

## B. External services

4. **LLM.** OpenAI, model `gpt-6-luna` as the default. The model name is stored per fund in `funds.llm_model`; the API key comes from `OPENAI_API_KEY`.
5. **Web search.** Tavily.
6. **Company / Media tabs.** Out of scope for now. If built later, populated only from items already in the Source Table (no LinkedIn/X scraping).
7. **OCR.** None. Documents without extractable text are flagged "no text extracted".
8. **Hosting.** Vercel. Long pipeline steps (2b, 3, 5) run as Inngest functions; route handlers enqueue and return 202.

## C. Rules

9. **Confidence (R1), fully mechanical:**
   - High = ≥2 independent parties, at least one Primary or Secondary.
   - Medium = a single Primary or Secondary party.
   - Low = Tertiary only.
   - A claim in an open conflict is downgraded one level.
10. **Inference** cites ≥1 source excerpt; no claim-to-claim links. Cross-source inferences arise from merging (P6).
11. **Statement refs.** Every statement cites ≥1 C#, except sections `open_question` and `research_agenda`, which may cite U# only. Falsifiers must cite ≥1 C#.
12. **Classification (R3).** Criteria are structured predicates over scores and counts, evaluated Pass → Watch → Proceed (first match wins). An optional free-text note per outcome is display-only.
13. **Quick Screen verdict** is chosen by the LLM (P1). The analyst may override it; overrides are logged.
14. **Analyst edits.** Allowed: score override and "mark link as wrong", both logged. An edited claim must still pass R4 and has its confidence recomputed. No "Undo merge".
15. **Score cap.** Each dimension lists its required Collection Prompt IDs in settings. If any is uncovered (open U# from R2), the score is capped at 2.
16. **Sufficiency rule.** Locked: "Fact/Inference needs ≥1 source", "uncovered required prompt → U#". Editable per fund: claims-per-score range (default 2–5), which prompts are required, cap value (default 2).
17. **Uncertainty count.** No minimum and no padding. Prompt-derived U#s are unlimited; P9 adds items up to a total of 10.
18. **Risks = counter-case arguments.** P8 returns them ranked; the Failure case must match rank 1.

## D. Pipeline behaviour

19. **Triggering.** Each step has its own button; the analyst reviews between steps.
20. **Re-runs.** Re-running a step clears it and all later steps and renumbers. IDs are frozen once synthesis has run.
21. **Open conflicts** do not block synthesis; they appear as open in the outputs.
22. **Source vs claim conflicts.** Both are kept; a claim conflict links to its parent source conflict when one exists.
23. **Tier and party** are editable by the analyst; confidence is recomputed.
24. **Limits.** Max 20 files, 20 MB each. P5 runs on chunks; R4 checks the excerpt against the full text.
25. **Errors.**
    - Each LLM call retries up to 2 times on invalid JSON or a rule violation; after that the item is dropped and logged.
    - A failing source doesn't fail the step; the run ends as `done_with_warnings`.
    - A document whose text extraction fails is flagged, not fatal.
    - Synthesis fails the run if a section still has no valid statement after retries.
26. **Language.** Outputs in English. Inputs in any language; excerpts are quoted verbatim in the original.

## E. Evaluation support

27. **Baseline (Study 2)** is built in: a hidden "baseline run" (same LLM, same corpus, no claim layer) that logs to `llm_calls` and writes to `baseline_memos`.
28. **Uploads-only mode.** Per-evaluation switch that disables web search.
29. **Reviewer tooling** stays outside the app; the Evidence Pack export contains everything reviewers need.
30. **Dimensions are fully fund-managed.** In settings, a fund can create and delete dimensions, edit every field of a dimension (title, question, claim coverage, high/low-score signals, required prompts, disqualifying threshold), and add, edit, reorder and delete that dimension's concrete prompts (questions). Concrete prompts are stored as their own rows, not a text array. Because configs are versioned, "delete" means the dimension is left out of the next published version; evaluations pinned to earlier versions keep it. Seed data contains the two dimensions defined in `app_summary.md` (Team & Execution, Monopoly Path & Moats); the fund adds the rest.
31. **Exports and sharing.** Print-friendly view and Evidence Pack `.xlsx`. Links work only for logged-in fund members.

## F. Configuration editing

32. **Draft → publish** (agreed 2026-10-01; reconciles `data_flow.html` with `ui_design.html` and `plan.md`). "Edit" copies the active version into one draft per fund (`create_config_draft()`). `PUT /api/settings/config` saves the editor's full state into that draft (`save_config_draft()`, one transaction, row ids kept stable). "Publish as vN" (`POST /api/settings/config/publish`, `publish_config()`) makes the draft the active published version and the previous one inactive. This keeps the spec's rule: a published version is never edited, so evaluations pinned to it are unaffected. Draft created, discarded and published are logged in `analyst_actions`.

33. **R3 fallback** (agreed 2026-10-01; completes decision 12). Pass and Watch each have one or more conditions, combined with "any" or "all". Proceed has no conditions: it applies when neither Pass nor Watch matches, so the classification is always defined. Conditions available: any dimension below its disqualifying threshold; lowest or average dimension score (0–5); number of open decision-critical uncertainties; number of open conflicts.

## G. Quick Screen from materials

34. **The AI drafts the Quick Screen answers** (agreed 2026-10-02; changes decision 13's input and the order of steps 1 and 2a).
    - Deal materials are uploaded at the start (Step 1), before the Quick Screen; Evidence Collection (2b) reuses the same documents. Upload, extraction and the `documents` table therefore arrive with M5 instead of M6.
    - Prompt **P1a** answers each Quick Screen question from the uploaded documents only, with 1–3 verbatim excerpts per answer. Excerpts are checked against the extracted text (normalised substring, the R4 idea); a mismatch is a rule violation and triggers a retry (decision 25).
    - If the materials don't answer a question, the answer is "Not stated in the materials." with no citations; nothing is guessed. P1 treats such answers as open.
    - The analyst reviews and may edit every answer before P1 writes the memo; the AI's original answer and its citations are kept, so edits stay visible.
    - Uploads only: no web search in the Quick Screen. Typing answers by hand still works when there are no materials.
    - Documents can be added or removed only while the deal is in the Quick Screen phase (screening, passed, watch, collecting).

35. **No temperature for `gpt-6-luna`** (verified 2026-10-02, as plan M5 asks). The model supports strict JSON-schema structured output but rejects `temperature` ("Unsupported parameter: 'temperature' is not supported with this model"), like other reasoning models. Calls therefore use strict JSON schema without a temperature; runs are not bit-for-bit repeatable. Repeatability rests on the rest of the design: versioned prompts, schema plus code-side validation (decision 25), rules computed by code (R1, R3), and every attempt logged in `llm_calls` with its prompt version and input. `lib/llm/call.ts` sends `temperature: 0` to models that accept it.

## Scope

**Core:** auth + fund-scoped RLS; versioned framework config with seed data; Quick Screen (P1); upload, extraction and Source Table (P2); claim extraction with R4, P6, R1, R2/P7; Conflict Register with resolution; counter-case, uncertainties, falsifiers (P8–P10); dimension scoring with R2 caps (P11); synthesis with DB-enforced `statement_refs`, R3, P12/P13; outputs rendered from rows with click-through trace; `llm_calls` audit log; step runs with progress (polling); baseline memo generator; uploads-only switch.

**Core, switchable:** web search (P3, P4 over web hits).

**Nice-to-have:** Company/Media tabs; P0 prompt suggestions; PDF export, copy link, export deal; Realtime progress; OCR; claim edit, Undo merge, change-log UI; deals-list filters; config version comparison UI.
