# Design decisions (resolving gaps in the spec)

Agreed 2026-10-01. These close ambiguities and contradictions in the other `docs/` files and are part of the spec. Where they conflict with an older doc, this file wins.

## A. Users, access, tenancy

1. **Roles.** `admin` edits fund settings (framework config). `analyst` and `admin` both run evaluations. All members of a fund see all of that fund's deals.
2. **Onboarding** (revised 2026-10-01; replaces "one fund, seeded accounts only").
   - Funds sign up themselves at `/signup` (fund name, name, email, password). The email must be confirmed; on confirmation the app creates the fund, makes the person its `admin`, and gives the fund a draft config v1 (copy of the default template), which the guided setup publishes (decision 47).
   - Admins add members in the app (Fund settings → Team): email, name, initial password, role `analyst` or `admin`. No email is sent; the admin passes the password on. More than one admin per fund is allowed.
   - Profiles are created only by server code (service role), never from user-supplied metadata, so sign-up can only ever create a new fund, never join an existing one.
3. **Auth.** Email + password via Supabase Auth.
   - Every member can change their password in Settings → Preferences; the current password is required.
   - "Forgot password?" on the login form sends a reset link (same answer whether or not the email has an account). The link goes through `/auth/confirm`, which sets a signed, httpOnly reset cookie (15 minutes) for that user; `/reset-password` sets a new password only with that cookie, so an ordinary open session can't skip the current-password check.

## B. External services

4. **LLM.** OpenAI, model `gpt-6-luna` as the default. The model name is stored per fund in `funds.llm_model`; the API key comes from `OPENAI_API_KEY`.
5. **Web search.** Tavily.
6. **Company / Media tabs.** Out of scope for now. If built later, populated only from items already in the Source Table (no LinkedIn/X scraping).
7. **OCR.** ~~None. Documents without extractable text are flagged "no text extracted".~~ Replaced by decision 45: visual content (including scans) is read by the model.
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
    - Excerpts are at most 300 characters (one sentence, bullet or line). A citation that is too long or not verbatim is dropped when the answer keeps at least one valid citation; only an answer left without any usable excerpt is a violation that triggers a retry. Stored excerpts are therefore always verbatim. A question reference with trailing punctuation ("Q1.") counts as "Q1" (2026-10-07).
    - If the materials don't answer a question, the answer is "Not stated in the materials." with no citations; nothing is guessed. P1 treats such answers as open.
    - The analyst reviews and may edit every answer before P1 writes the memo; the AI's original answer and its citations are kept, so edits stay visible.
    - Uploads only: no web search in the Quick Screen. Typing answers by hand still works when there are no materials.
    - Documents can be added or removed only while the deal is in the Quick Screen phase (screening, passed, watch, collecting).

35. **No temperature for `gpt-6-luna`** (verified 2026-10-02, as plan M5 asks). The model supports strict JSON-schema structured output but rejects `temperature` ("Unsupported parameter: 'temperature' is not supported with this model"), like other reasoning models. Calls therefore use strict JSON schema without a temperature; runs are not bit-for-bit repeatable. Repeatability rests on the rest of the design: versioned prompts, schema plus code-side validation (decision 25), rules computed by code (R1, R3), and every attempt logged in `llm_calls` with its prompt version and input. `lib/llm/call.ts` sends `temperature: 0` to models that accept it.

36. **Web search settings** (agreed 2026-10-02; fills in decisions 5 and 6 for step 2b). P3 proposes up to 8 queries; each runs as a Tavily *basic* search (1 credit) with up to 4 results, the page text returned by Tavily itself (`include_raw_content`, no extra credit) instead of a separate fetch + readability step. Results are de-duplicated by URL and capped at 12 web sources per deal (pages kept up to 30,000 characters). LinkedIn, X, Facebook and Instagram are excluded (decision 6). A result without page text (paywall, blocked) is skipped with a run warning; a missing or rejected Tavily key or exhausted credits skip the web part with a warning, and the uploads still produce a Source Table. P4 then checks all sources (uploads and web) for material factual disagreements; its quoted passages must occur verbatim in the sources. About 8 Tavily credits per deal; uploads-only deals use none.

## H. Claim extraction

37. **R4 failures and claim assembly** (agreed 2026-10-02; fills in decisions 24 and 25 for step 3).
    - P5 runs once per source chunk: chunks of up to 15,000 characters, at most 6 per source, with a run warning if a source is longer. P5 returns at most 6 claims per chunk. It has no minimum, so a thin chunk isn't padded.
    - R4 is part of P5's validation: every Fact/Inference excerpt must be found in the source's *full* text (normalised match: case, typographic quotes and dashes, whitespace). A miss triggers the normal retries.
    - If the last attempt still fails, the claims that pass R4 and the other checks are kept. Each rejected claim is logged as a run warning with its statement and excerpt, and the run ends `done_with_warnings`. One bad excerpt therefore doesn't discard a whole source.
    - The stored excerpt is the original source text at the matched span, never the model's copy. `excerpt_start`/`excerpt_end` are code-point offsets (the unit of Postgres `length()`), so the database can bound-check them and the UI can highlight the exact span.
    - P6 merges only same-type claims that state the same proposition, so every merged excerpt supports the kept statement in full. A general claim is not merged into a more specific one, because the specific claim would inherit evidence that doesn't support it and could gain confidence it hasn't earned. The kept claim gets the union of evidence links and prompts; dropped candidates are not stored. Contradictions are only between Fact/Inference claims, and never on a dropped side.
    - A claim conflict gets `parent_conflict_id` when its two claims cite the two sides of a source conflict from step 2b. Both sides of a new claim conflict are open, so R1 downgrades both claims one level.

38. **P7 output** (agreed 2026-10-02; extends data_flow.html P7 with the fields `uncertainties` stores). Besides `{question, why_unresolved}`, P7 returns `decision_critical` (could resolving it change Proceed / Watch / Pass) and `min_evidence_to_resolve`. R2 decides in code which required prompts are uncovered; only a Fact or Inference covers a prompt. If P7 fails, the U# is still written, with the prompt text as the question and a run warning.

## I. Analyst evidence actions

39. **Resolutions, link marking and recompute** (agreed 2026-10-02; fills in decisions 9, 14, 22 and 23 for M10).
    - The Conflict Register lists source and claim conflicts. Each is resolved on its own: resolving a source conflict does not resolve the claim conflicts that repeat it. A source conflict has no effect on confidence; only an open *claim* conflict downgrades its two claims (decision 9). The register shows which claim conflicts repeat a source conflict.
    - The analyst sends only the status and the rationale; the database stamps who and when (`resolved_by`, `resolved_at`) and logs every change in `analyst_actions`. A resolution can be changed or reopened; reopening clears who and when, and the downgrade returns.
    - "Mark link as wrong" sets `marked_wrong_at`; the database stamps who and when and logs it. The link is kept and shown struck through, but no longer counts for R1. Unmarking reverses it, also logged. The share of marked links is shown as the false-link rate. A Fact whose links are all marked wrong stays in the table at the floor level ("Low: no source").
    - `private.recompute_confidence(claim_id)` is R1 in SQL, with the same result and rule text as `lib/rules/confidence.ts`; both are tested against `lib/rules/confidence-cases.json` (`npm test`). Triggers run it after a claim conflict's status changes, a link is marked or unmarked, and a source's tier or party changes.

## J. Counter-case

40. **Step 4 details** (agreed 2026-10-02; fills in data_flow.html P8–P10 and decisions 11, 17, 18 for M11).
    - **Prompt link:** `counter_arguments.counter_case_prompt_id` (nullable) records which Counter-Case Prompt an argument answers, so the view can show prompt → argument → mechanism → C# as ui_design.html does. P8 also answers every prompt; those answers are kept only in `llm_calls`.
    - **Ranking:** P8 returns exactly three arguments, strongest first; the order is the rank (decision 18).
    - **Citations:** every argument and every falsifier cites at least one C#. This is checked at commit by deferred triggers and by prompt validation.
    - **Uncertainty List:** P9 sees the recorded U# and returns only new questions, at most 10 minus the number already recorded, with no padding (decision 17). If 10 or more are recorded, P9 is skipped. New U# continue after the step-3 ones and show the origin "uncertainty analysis".
    - **Falsifiers:** P10 may cite the new U# by the codes they will receive. The database resolves every cited C#/U# within the evaluation in the same transaction, so an unknown ID fails the write. A falsifier needs a number or date in its criterion or outcome check.
    - **Failures:** P8 and P10 are required; if either fails after its retries, the run fails and can be retried. A failed P9 adds nothing and leaves a run warning.
    - **Re-runs:** a second run is rejected until re-runs arrive (M14).
    - **Conflicts:** they can also be resolved from the Counter-Case tab (data_flow.html).

## K. Dimensions

41. **Step 5 details** (agreed 2026-10-02; fills in decisions 14–16 and data_flow.html P11 for M12).
    - **One assessment per dimension:** P11 runs once per dimension of the evaluation's pinned config, in parallel. Every dimension must be assessed; if one fails after its retries, the run fails and can be retried.
    - **Answers:** each concrete prompt gets one answer, citing C# where the claims support it. An answer may say the claims don't address the prompt and then cites nothing. The score's justification cites claims within the config's claims-per-score range (default 2–5). This is checked in P11 validation and again at commit by a deferred trigger.
    - **Score cap (decision 15)** is applied in the database by `record_dimension_assessments`. If a required Collection Prompt of the dimension has an open prompt-derived U#, the score is capped at the config's cap (default 2) and `score_capped_by` names that U#. The model's `proposed_score` is kept, so the view can say "capped by U# (proposed 4)". A proposal at or below the cap is not marked as capped.
    - **Override (decision 14):** `override_score` and an optional reason sit beside the model score, which never changes. The database stamps who and when and logs every override and every clearing. The score that counts is the override if one exists, otherwise the (capped) score. An override may exceed the cap: it is the analyst's logged judgement.
    - **Assessments are fixed once written:** answers, counter-signal and scores cannot be edited; a new run belongs to re-runs (M14).

## L. Outputs

42. **Synthesis and output documents** (agreed 2026-10-02; fills in data_flow.html P12, P13, R3 and decisions 11, 18 for M13).
    - **What the model writes vs. what comes from rows.** P12 writes the Thesis Card sections: thesis, outlier, base/upside/failure case, moat, entry wedge, 2–3 milestones. P13 writes the Snapshot's justification, three supporting arguments, the 3–7 item research agenda and the re-evaluation trigger. Everything else is rendered from its own rows rather than restated by a model: the Thesis Card's falsifiers (F#), dimension scores (D#) and open questions (open decision-critical U#), and the Snapshot's three risks, which are the ranked counter-case arguments (decision 18).
    - **Statement shape:** each statement has a `text` and an optional `detail`. For base and upside case the detail holds the gating variables, for the failure case the dominant failure mode, and for a research-agenda item the evidence that would resolve it. IDs live only in the reference lists, never in the text; the view shows them as `[C#]` links.
    - **Citations (decision 11):** checked by the prompts (retried up to 2 times, then the run fails and nothing is saved) and again at commit by the database. A statement cites at least one C#; research-agenda and open-question items cite at least one U#; a S# only next to a claim that cites it. The failure case must cite at least one claim of the strongest counter-argument.
    - **R3 classification:** `lib/rules/classification.ts`, unit-tested. It runs on the score that counts (an override, else the capped score), open decision-critical U# and open conflicts. Rules are evaluated Pass → Watch → Proceed. The full trace is stored in `decisions.rule_trace`, and its one-line summary is shown as "Rule applied". P13 is told the classification and must not argue for another.
    - **Completion:** a deal is `complete` once its outputs are recorded. The output tabs unlock when synthesis starts and show its progress until then.
    - **One printed page:** the Thesis Card prints on one A4 page. To keep it there:
      - P12 items are short: the thesis up to 300 characters, other items up to 260, details up to 160.
      - Each item cites at most 5 claims and 8 IDs in total; P13 items have the same ID limits.
      - P10 falsifiers are short too (criterion up to 220 characters, outcome check up to 300).
      - Open questions print in two columns, and counter-signals are clamped on paper. The full text is in the Evidence Pack and the drawers.
    - **Retries with feedback (extends decision 25):** when an answer fails validation, the next attempt receives the list of violations. `llm_calls.input.feedback` records it.

## M. Robustness and exports

43. **Re-runs, failures and exports** (agreed 2026-10-02; fills in decisions 20, 25 and 31 for M14).
    - **Re-run step N (2–6):** `reset_from_step` deletes step N's rows and every later step's in one transaction. Step 4 removes only the uncertainties P9 added; step 3 removes all of them, including the R2 ones. It marks those steps' runs as superseded (`pipeline_runs.superseded_at`; the tabs ignore superseded runs), sets the deal back to step N, logs `pipeline.reset` with what was cleared, and starts the step again. Codes restart because they are assigned as count + 1. Analyst actions on cleared rows (link marks, overrides, resolutions of claim conflicts) are gone with them; the log keeps them.
    - **Frozen IDs (decision 20):** once outputs exist, any re-run needs an explicit full-reset confirmation (UI checkbox and a database check). A re-run is refused while a run is active.
    - **Materials after 2b:** documents stay locked by the database once a Source Table exists. "Change materials" resets from 2b, which unlocks them; the Source Table is then rebuilt.
    - **Failures:** a missing or rejected key or a rejected model fails a background run at once (not retried with back-off), with the readable message stored on the run. Every finished run links to a page listing its model calls (llm_calls: prompt and version, attempt, latency, tokens, error or validation errors, input and output).
    - **Exports:** the Evidence Pack `.xlsx` has five sheets (Source Table, Claim Table, Conflict Register, Uncertainty List, Dimension Assessment), keyed by the same IDs as the UI. It is written with the existing `jszip` dependency, since a spreadsheet library would need file-system junctions Turbopack can't create on this drive. Thesis Card and Snapshot print through the browser's print view (one A4 page for the card).
    - **Deals list:** shows the R3 classification once outputs exist (else the Quick Screen verdict), open conflicts and open decision-critical uncertainties.

## N. Study 2

44. **Baseline and artifact runs** (agreed 2026-10-02 with the user; fills in decisions 27 and 29 for M15).
    - **Baseline corpus:** the deal's Source Table texts, the same texts the artifact worked from, including web pages found in 2b. They are numbered [1]…[n] by S# order and shown with title and origin only; the artifact's tiers and parties are not given. Long corpora are shortened evenly (200,000 characters in total).
    - **Baseline prompt (B1):** the same LLM and fund config (dimensions with their concrete prompts, score anchors, outcome notes) and the deal's Quick Screen memo. It writes a memo under the same headings as the Thesis Card and Decision Snapshot, citing documents [n]. It has no claim layer, no sufficiency rule, no conflict register and no rule-based classification: the model picks the recommendation. Items are asked to be 1–2 sentences but not length-checked. Validation checks only that cited [n] exist and that every section and dimension is present. Each memo is stored in `baseline_memos` with its `llm_calls` row.
    - **Artifact runs:** "Run artifact again" copies the deal as a hidden study copy: same company, config version (even if a newer one has been published), Quick Screen (answers and memo) and documents (files copied in Storage, extracted text reused). It then runs steps 2b–6 back to back through the same workers as the buttons. The original is run 1 and copies are numbered from 2. Copies are not in the deals list; they open from the Study tab and show a banner. A failed step stops the run; the copy can be continued from its own deal page.
    - **Visibility:** the Study tab and baseline memos are for fund admins only (RLS on `baseline_memos`; admin-only routes).
    - **Export (user's choice of format):** a zip with one file per completed run (`artifact-run-k`, `baseline-run-k`) and a README, as PDF + xlsx, HTML + xlsx, or Markdown.
      - Artifact files contain the Decision Snapshot and Thesis Card plus appendices (Claim Table, Sources, Uncertainty List, Conflict Register), so every ID can be looked up without the app. With PDF and HTML, each artifact run also gets its Evidence Pack `.xlsx`.
      - Baseline files contain the memo and its numbered References.
      - PDFs are generated with `pdf-lib`'s standard fonts; characters outside their character set are mapped to close equivalents.

## O. Visual content

45. **Reading images, scans and charts** (agreed 2026-10-03 with the user; replaces decision 7).
    - **What is read:** every PDF page (rendered on the server), images embedded in PPTX and DOCX, and uploaded images (PNG, JPEG, WebP). Native PowerPoint/Word charts are read from their data in the file, not by the model.
      - Skipped: images under 2 KB, repeated images (logos) and formats the model can't read (EMF, WMF, SVG, TIFF).
      - At most 40 pages, images and charts per document; the summary names what was left out.
    - **When:** at upload, in a background job after text extraction. The Quick Screen draft and the Source Table wait until it has finished.
    - **How (V1):** one model call per image, with the text already extracted from that page or slide. The model transcribes only what the image adds: chart values with labels and units, tables, diagram labels, text in screenshots or scans, legible customer/partner logos. It must be faithful (no interpretation, no estimating, "[illegible]" where unreadable) and reports decorative images as not informative.
    - **As evidence (the user's choice: citable, flagged):** informative content is appended to the document's text as labelled blocks ("[Slide 5 · image 2 — AI transcription of the image]", "[Slide 4 · chart 1 — chart data read from the file]"). Claims can cite it verbatim like any text; R4 is unchanged, and R1 is unchanged. `document_visuals` records each block's position and the stored image. The trace drawer marks such links "From Slide 5 · image 2 · AI transcription", shows the image next to the excerpt, and asks the analyst to check the excerpt against the image. The Claim Table and exports mark these claims.
    - **Integrity:** the text only grows by appending (database check) and is frozen once the Source Table exists, so offsets stay valid. A scan or image upload without a text layer becomes usable once its images have been read. Removing a document removes its images. Study copies carry the same images and text.
    - **Rendering:** PDF pages are rendered with `unpdf` and `@napi-rs/canvas`. The native module is imported at runtime and traced into deployments (`next.config.ts`), because bundling it needs file-system links the development drive doesn't support.

## P. Interface

46. **Light theme and dev mode** (agreed 2026-10-03 with the user).
    - **Theme:** the app is light only. Colours, fonts and shapes follow decision 48 (they replaced the teal theme of 2026-10-03). The tokens are defined in `app/globals.css`.
    - **Dev mode:** a personal toggle under Settings → Your preferences, for admins and analysts alike (stored as `profiles.dev_mode`, set via `set_dev_mode`; off by default). It only changes what is shown: the "Model calls for this run" links and, for admins, the Study tab appear only when it is on. Access is unchanged; the run pages and the study routes keep their own checks.
    - **Navigation:** the top bar has no page links. The Tracer logo leads to the deals list, and the avatar opens an account menu with Settings (every member), Team (admins) and Sign out. Settings has a fixed sidebar: Preferences (`/settings`, everyone), Team (`/settings/team`) and the fund configuration sections (`/settings/config?section=…`), the last two admin-only (decision 1). Switching configuration sections keeps unsaved draft edits; leaving the configuration with unsaved edits asks first.
    - **Deal page:** a fixed sidebar like the settings one holds the deal summary (company, Quick Screen verdict, status, evaluator, config version), the five pipeline steps (done / current / locked), the three outputs and, in dev mode for admins, Study. The content area shows only the selected step.
    - **Step bar:** every pipeline step ends in a bar pinned to the bottom of the window: "Step N of 5 · <step>", the step's state in one line (progress while it runs, errors in red), and the one primary action that moves the deal forward (start the step, or continue to the next). Secondary controls (draft answers, re-run, change materials, edit verdict) stay with the content they affect.
    - **Type:** no all-caps text; table headers and section labels use normal capitalisation. One size per role, defined as theme tokens in `app/globals.css`: `text-page` 24px (page/step headings), `text-section` 16px (headings above tables and panel groups, drawer titles), `text-panel` 14px (titles inside cards), `text-reading` 14px (output documents, memo text, arguments), `text-body` 13px (every table cell and panel text), `text-meta` 12px (table headers, labels, lines under a cell, notes), `text-tag` 11px (tags and ID chips). Display sizes (thesis statement, verdict, stat numbers) stay explicit.
    - **Motion** (`motion` package, `app/motion.tsx`; agreed 2026-10-06): subtle and only where it explains a change. 150–250 ms, ease-out, at most 8px of travel, no bounce. Drawers slide in and out from the right (one drawer stays open while moving between IDs); the selected item's background glides between sidebar items and deal filters; switching a deal tab fades the new step in; setup steps slide in from the direction of travel; the account menu and select lists fade in from their trigger; `<details>` sections open with a height transition; score and tier bars grow when they appear. Tables, lists and output documents don't animate. Reduced-motion users (OS setting) get fades only, and the CSS animations are off for them.

## Q. Guided fund setup

47. **Guided fund setup** (agreed 2026-10-05 with the user).
    - A new fund's first admin is taken to `/setup` before the dashboard. The wizard walks through the fund-specific parts of the framework configuration, each pre-filled from the default template: Quick Screen questions, Collection Prompts, Counter-Case Prompts, Evaluation dimensions, Score anchors, Proceed / Watch / Pass, then one "Review the defaults" step (source tiers, confidence rules read-only, sufficiency rule), an optional "Your team" step (add analysts/admins), and "Ready".
    - Versions: the template is created as draft v1 at sign-up; each step saves the draft; finishing (`complete_fund_setup()`) publishes it as v1 and sets `funds.setup_completed_at`. "Skip and use the defaults" publishes the template unchanged. Until then the fund has no active config, so no deal can be created; analysts who are added early see a notice. Funds created before this change count as set up.
    - Afterwards the configuration is changed in Settings as before (new draft, new version).

## R. Design language

48. **Tracer design language, calm version** (agreed 2026-10-06 with the user; `docs/tracer_design_language.md`).
    - **Adopted from the doc:** the palette (ink #0e1530 text, cobalt #2b4bff for actions, links and selection, warm page #f7f7f4, white surfaces, the text and line ramps, the status colours), the fonts (Bricolage Grotesque for headings, Inter for text, JetBrains Mono for IDs, step numbers and meta labels), corners of 4px at most (2–3px for tags and markers, no pills or circles), square step markers with mono numbers ("01") joined by a timeline line, status tags (positive, neutral, warning), no gradients, no teal or green, no all caps, sentence case.
    - **Toned down (the full doc looked too playful for the app):** no hard offset shadows, no press-in buttons and no yellow "signature" shadows. Borders are thin light grey (#e1e5ea; #c9cdda for inputs and secondary buttons), not ink outlines. Buttons are flat: white with a grey border, or cobalt for the primary action. The selected sidebar item and deal filter get a cobalt tint. Only floating layers (menus, select lists, tooltips, toasts, the pinned step bar, drawers) get a light soft shadow.
    - **Yellow** is only a highlighter: Fact tags and cited text (excerpt highlights, a row jumped to). Emphasis tags (decision-critical, resolved, Proceed) use the cobalt tint; warnings (Speculation, open conflicts, Pass) use the red status colours. ID chips are cobalt on a cobalt tint, in mono.
    - **Sizes:** the app keeps its dense type scale (decision 46); only the page heading grows to 28px. Copy keeps the app's terms; em dashes are removed from UI sentences (a lone "—" still marks an empty cell). Icons stay where they help navigation (sidebars, account menu, arrows, lock, check); the decorative icons in output panel titles are gone.
    - The Study exports (HTML, PDF) use ink and cobalt as well.

## Scope

**Core:** auth + fund-scoped RLS; versioned framework config with seed data; Quick Screen (P1); upload, extraction and Source Table (P2); claim extraction with R4, P6, R1, R2/P7; Conflict Register with resolution; counter-case, uncertainties, falsifiers (P8–P10); dimension scoring with R2 caps (P11); synthesis with DB-enforced `statement_refs`, R3, P12/P13; outputs rendered from rows with click-through trace; `llm_calls` audit log; step runs with progress (polling); baseline memo generator; uploads-only switch.

**Core, switchable:** web search (P3, P4 over web hits).

**Nice-to-have:** Company/Media tabs; P0 prompt suggestions; PDF export, copy link, export deal; Realtime progress; OCR; claim edit, Undo merge, change-log UI; deals-list filters; config version comparison UI.
