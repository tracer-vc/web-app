**Thesis Proposal**

**Working title:** Enforced Evidence Traceability as a Basis for Determining Evidence Sufficiency and Conflict in Generative-AI Decision Support Systems: A Design Science Study in Venture Capital Screening

**Research question:** How can generative-AI decision-support systems determine whether the available evidence is sufficient and whether conflicts exist?

**Method:** Design Science Research (Hevner et al. 2004; Peffers et al. 2007). The contribution is stated as an information systems design theory (ISDT) in the eight components of Gregor & Jones (2007) and instantiated as a web application for venture capital (VC) startup screening. Section 1 gives the motivation (problem, gap, artifact overview), Section 2 the design theory in the order of the eight components, Section 3 the evaluation plan.

| Gregor & Jones (2007) component | Section |
| :---- | :---- |
| 1 Purpose and scope | 2.1 |
| 2 Constructs | 2.2 |
| 3 Principles of form and function | 2.3 |
| 4 Artifact mutability | 2.4 |
| 5 Testable propositions | 2.5 |
| 6 Justificatory knowledge | 2.6 |
| 7 Principles of implementation | 2.7 |
| 8 Expository instantiation | 2.8 |

**1\. Motivation**

**1.1 Problem**

Generative AI makes fluent investment analysis cheap to produce, and its fluency carries no information about grounding: large language models generate "plausible yet nonfactual content" (Huang et al. 2025), and citations do not close the gap, since in generative search engines only 51.5% of generated sentences are fully supported by their citations (Liu, Zhang & Liang 2023). Readers cannot cheaply tell the difference and over-rely on the output; adding explanations does not reduce this (Buçinca, Malaya & Gajos 2021). Two further properties make the output one-sided: models match the user's beliefs over the truth (Sharma et al. 2024), and contradictions among their sources "affect model confidence only marginally" (Chen, Zhang & Choi 2022), so conflicts are smoothed rather than surfaced.

In VC screening these properties are consequential rather than cosmetic. There is rarely a hard number to check a conclusion against: 20% of VCs and 31% of early-stage VCs forecast no cash flows at all (Gompers et al. 2020). The material evaluated is the founder's own submission (Kirsch, Goldfarb & Gera 2009), and founders' self-assessments are systematically over-optimistic (Cooper, Woo & Dunkelberg 1988), so a statement is worth something different depending on whether it rests on the deck or on an independent source. The screen is then decided on by an investment committee (Malenko et al. 2023), whose members are exactly the readers who cannot cheaply verify it.

A generative-AI screening output does not reveal whether the evidence behind a conclusion is sufficient, or whether the evidence contradicts itself, because the output is written as prose and its evidentiary structure is not represented.

**1.2 Gap**

Existing approaches leave this structure implicit. Generic LLM memo generators produce free text with optional citations and no conflict handling. Citation-generating LLM systems attach sentence-level citations, but the citation frequently does not support the sentence (Liu, Zhang & Liang 2023; Gao et al. 2023\) and nothing represents sufficiency or conflict. Argument-mapping tools structure claims and evidence, but the structure is optional, not tied to source quality, and not integrated into an evaluation workflow. VC deal-flow tools track that a deal exists, not why a conclusion holds. In the IS literature, decision support systems have long been designed to counter cognitive bias and restrict analyst discretion (Silver 1991), but no design theory specifies how a generative-AI decision-support system can make evidence sufficiency and conflicts *determinable by construction*.

What the proposed artifact does differently: an evaluative statement cannot exist in an output unless it is built from a typed, confidence-rated claim that is linked to a tiered source with its excerpt; sufficiency is therefore read off the structure (what type of support, at what confidence, covering which required questions) rather than judged from the prose; and contradictions between claims are first class objects that must carry a resolution status. Traceability is enforced, not offered, which is what turns sufficiency and conflict from impressions into determinable properties of the output.

**1.3 The proposed artifact**

The artifact is a web application that takes a VC analyst from uploaded deal materials to a screening recommendation through a fixed pipeline. The analyst uploads everything available on a startup (pitch deck, founder profiles, press, technical documents); the system converts the documents to text, adds web sources, and sorts every source into a reliability tier. From each source it extracts *atomic claims*: single, checkable propositions such as "the company has 12 paying customers", each labelled as Fact, Inference or Speculation, linked to the source and the exact excerpt it rests on, and rated High, Medium or Low confidence by fixed rules. Claims that contradict each other are both kept and logged in a conflict register; questions the sources cannot answer are logged as uncertainties. The company is then scored on a set of evaluation dimensions, and three output documents are produced: a one-page Thesis Card, an Evidence Pack containing all the tables, and a Decision Snapshot with the recommendation. Every sentence in the outputs cites the claims it rests on, and every claim cites its source, so a reader can follow any statement to its origin in seconds. The system never writes a free memo; it assembles the outputs from claims. It does not check whether a claim is true; it shows the excerpt so that a human can. A worked example and the full workflow are given in Section 2.8.

**2\. Design theory**

**2.1 Purpose and scope**

**Purpose.** A design theory for generative-AI decision-support systems in which every evaluative output statement is bound to its evidence, so that the sufficiency of that evidence and the existence of conflicts within it can be determined from the output itself.

**Scope.** Early-stage VC screening from uploaded deal materials and web sources; the outputs are the evaluation documents an analyst hands to an investment committee. The theory covers the evidence, sufficiency and conflict structure of the output. Standardization of outputs across analysts and fund-level configuration are implemented but not claimed as contributions. Counter-case generation and falsification criteria are implemented in the instantiation but lie outside the design theory.

**Meta-requirements.**

| ID | The artifact must … |
| :---- | :---- |
| MR1 | make every evaluative statement traceable to an atomic claim, and every Fact or Inference claim traceable to a tiered source with its supporting excerpt |
| MR2 | make the sufficiency of evidence determinable: the support type and confidence of every statement, and the coverage of the evidence questions the evaluation requires, are explicit, and unmet coverage is reported as open uncertainty |
| MR3 | detect contradictions among sources or claims, retain both sides, and surface each conflict with an explicit resolution status |

**Boundary statement.** The artifact guarantees typed, checkable traceability: every evaluative statement is bound to a typed, confidence-rated claim, and every Fact or Inference claim carries its source IDs and the supporting excerpt inline. Sufficiency is determined structurally: the artifact establishes whether support exists, of which type, at which confidence, and whether required coverage is met. It does not determine whether a link is true: an LLM places claims and source assignments and can attach a source that does not support the claim. Because the excerpt is shown next to the claim, verifying a statement means reading one short excerpt, a matter of seconds, rather than reconstructing its basis from the corpus. Correctness remains a human judgment, deliberately made cheap.

**2.2 Constructs**

The constructs are the vocabulary in which MR1 to MR3 and the principles are stated. Each is instantiated by a named element of the application (Section 2.8). They are grouped by the meta-requirement they serve; a shared identifier scheme (S\#, C\#, CR\#, U\#, D\#) lets a reader move between them.

**Evidence layer (MR1)**

| Construct | Definition | Instantiated as |
| :---- | :---- | :---- |
| Source | An external document or web page used in the evaluation; recorded with title, link, tier, date accessed, relevance note and full extracted text | Source Table entry (S\#) |
| Source Tier | Primary (first-order, originating from the company or the event: decks, filings, patents, founder interviews, customer case studies), Secondary (independent analysis by third parties: reputable journalism, analyst and academic research), Tertiary (weakly validated commentary: blogs, social media, newsletters); fixes how much confidence a source can justify | Tier column of the Source Table; definitions configured once per fund |
| Source Independence | Whether two sources supporting the same claim originate from different parties; a deck and a press release that repeats the deck count as one independent source | Input to the confidence rule |
| Source Excerpt | The verbatim passage of a source on which a claim rests | "Source Excerpt" column of the Claim Table |
| Claim | An atomic proposition (one statement, concrete and falsifiable) extracted from sources or inferred from other claims; semantically equivalent claims are merged | Claim Table entry (C\#) |
| Claim Type | Fact (directly supported by a source), Inference (derived from several sources or claims), Speculation (explicit hypothesis without source support, marked as such) | "Type" column of the Claim Table |
| Confidence Level | High (Tier 1 and/or multiple independent sources), Medium (Tier 1 with limitations such as indirect, dated or partially conflicting support, or Tier 2), Low (Tier 3 only); assigned by fixed rules from tier and independence, so it can be recomputed from the visible links | "Confidence" column of the Claim Table; rules configured once per fund |
| Evidence Link | The reference from a claim to the source(s) and excerpt it rests on; mandatory for Facts and Inferences, absent by definition for Speculations | "Source" column of the Claim Table (S\# references) |
| Evaluative Statement | Any sentence in an output that asserts an assessment of the company; must cite at least one claim (C\#); a source ID may appear only alongside the claim it supports | Every entry of the Thesis Card, Decision Snapshot and Dimension Assessment Table |

**Sufficiency layer (MR2)**

| Construct | Definition | Instantiated as |
| :---- | :---- | :---- |
| Collection Prompt (coverage requirement) | A guiding question the evaluation must answer, for example "Who are credible customers, and what evidence exists?"; the set of prompts defines what evidence is required | Collection Prompts, configured once per fund, applied during evidence collection |
| Coverage | For each Collection Prompt, the set of claims that answer it, with their types and confidence levels | Derived from the Claim Table, which must provide coverage across all prompts |
| Sufficiency Rule | An explicit, configurable rule over claim types, confidence levels and coverage that decides whether a statement, a prompt or a dimension is sufficiently supported; the instantiation already enforces three such rules: a Fact requires at least one source, a dimension score must cite two to five claims, and a prompt without an answering claim becomes an Uncertainty | Claim-extraction and scoring rules, made explicit and computable |
| Uncertainty | A question that remains unresolved after evidence collection and claim extraction because the available sources cannot answer it, recorded with the reason it is unresolved | Uncertainty List entry (U\#); five to ten per evaluation |
| Decision-Criticality | The flag on an Uncertainty stating whether resolving it would change the recommendation (Proceed / Watch / Pass) | "Decision Critical: yes / no" column of the Uncertainty List |

**Conflict layer (MR3)**

| Construct | Definition | Instantiated as |
| :---- | :---- | :---- |
| Conflict | A recorded material disagreement between two sources or two claims; both sides are retained | Conflict Register entry (CR\#); created for conflicting sources during collection and for contradicting claims during extraction |
| Resolution Status | The mandatory recorded state of a conflict: open; resolved in favour of one side, with rationale; or unresolvable on current evidence. Tiers inform the resolution but do not decide it | "Resolution status" field of the Conflict Register |

**Output layer (all MRs)**

| Construct | Definition | Instantiated as |
| :---- | :---- | :---- |
| Evaluation Dimension | A thematic lens (for example Team & Execution, Moats, Problem Criticality, Go-to-Market) with diagnostic prompts, under which evaluative statements are grouped and scored | Dimension Assessment Table entry (D\#); about ten per fund, configured once |
| Dimension Score | A score from 0 to 5 anchored to fixed interpretations (for example 3 \= "credibly supported, but important uncertainties remain"), justified by citing two to five claims and naming the strongest counter-signal | "Score" and "Strongest Counter Signal" columns of the Dimension Assessment Table |
| Evidence Pack | The verification layer of an evaluation: Source Table, Claim Table, Conflict Register, Uncertainty List, Dimension Assessment Table | Output document 2 |
| Output Document | A document composed entirely of evaluative statements: the one-page Thesis Card (thesis, scenarios, moat, entry wedge, milestones, falsifiers, dimension scores, open questions) and the Decision Snapshot (recommendation with justification, strongest arguments, risks, research agenda, re-evaluation trigger) | Output documents 1 and 3 |
| Identifier Scheme | The shared IDs S\#, C\#, CR\#, U\#, D\# (and F\# for falsifiers in the instantiation) that let any statement be followed to its origin | All tables and documents |
| Framework Configuration | The fund-level parameters set once and applied unchanged to every evaluation: tier definitions, confidence rules, sufficiency rule, Collection Prompts, dimensions and their prompts, score anchors | Application settings |

*Instantiated but outside the design theory:* Quick Screen questions and memo, Counter-Case Prompts and Counter-Case Section, Falsification Criteria (F\#), De-risking Milestones, Proceed / Watch / Pass classification criteria. They remain in the application because the outputs require them; no meta-requirement or principle rests on them. Three constructs together make insufficiency and conflict visible: a Speculation marks a statement without support, an Uncertainty marks a required question without support, a Conflict marks support that contradicts itself.

**2.3 Principles of form and function**

| ID | Principle | Meets | Statement |
| :---- | :---- | :---- | :---- |
| P1 | Enforced Evidence Traceability by Design | MR1 | Evaluative statements are formed from claims, and Fact/Inference claims from source links, so a statement without evidence cannot be produced. An optional link is ambiguous (missing because unsupported, or because skipped); a mandatory link makes the representation complete and unambiguous: a Fact or Inference without a link is known to be unsupported, and a statement without source support can exist only as a marked Speculation. |
| P2 | Explicit Evidence Weighting and Sufficiency | MR2 | Each claim carries a type and a confidence label derived by fixed rules from its visible source support, so the weight a statement can bear is readable and checkable. Coverage of the Collection Prompts is computed from the claims, an explicit sufficiency rule is applied to statements, prompts and dimensions, and unmet coverage becomes an Uncertainty. A thesis resting on High-confidence Facts is visibly stronger than one resting on Low-confidence Speculation, and the difference is read directly off the labels. |
| P3 | Explicit Conflict Handling | MR3 | Contradictions are detected, both sides retained, and logged with a mandatory resolution status, so contradictory evidence is neither smoothed over nor silently dropped. Tiers inform the resolution but never decide it automatically, since Tier 1 means first-order, not correct, and an automatic higher-tier-wins rule would systematically prefer founder self-reporting over independent verification. |

The three principles share one design move: they impose the structure that free-text output lacks. P1 makes the evidence behind each statement present, P2 makes its weight and completeness readable, P3 makes its contradictions visible. Their justification is given in Section 2.6.

**2.4 Artifact mutability**

The theory anticipates change at three levels and fixes an invariant core.

- **Parameter mutability.** Tier definitions, confidence rules, the sufficiency rule, Collection Prompts, dimensions and score anchors are configuration, set once per fund and applied unchanged to every evaluation of that fund. A fund may change them between evaluations; each evaluation records the configuration version it ran under.  
- **Technology mutability.** The language model, the document extraction, the web search and the storage layer are replaceable. The principles are stated in terms of claims, links, labels and registers, not of any model, and they hold whether a human or an LLM produces the claims. Better models will lower the false-link rate (Section 3\) but do not change the theory.  
- **Domain mutability.** The evaluation of soft, partly self-reported evidence from documents of uneven reliability is not specific to VC. The same mechanism transfers, by re-configuring prompts, tiers and dimensions, to other evidence-based evaluation tasks such as grant review, credit assessment or acquisition due diligence. This transfer is a claim of the theory, not something the thesis evaluates.  
- **Invariant core.** What must not change for the theory to apply: the mandatory claim reference on every evaluative statement, the mandatory source link and excerpt on every Fact and Inference, the three-way claim type, the mandatory resolution status on every conflict, rendering of outputs from claims rather than free text, and the shared identifier scheme. A configuration that made any of these optional would leave the scope of the theory.

**2.5 Testable propositions**

**Feasibility propositions (discharged by the instantiation).**

- TPF1: Uploaded deal materials and web sources can be transformed into atomic, typed, confidence-rated claims, each linked through an Evidence Link to one or more tiered sources with excerpts (P1, P2).  
- TPF2: Traceability can be enforced at output synthesis: every evaluative statement in the Thesis Card, Decision Snapshot and Dimension Assessment is bound to a claim, and any statement resting on Speculation is marked (P1).  
- TPF3: For every evaluative statement, Collection Prompt and dimension, the system can determine whether the sufficiency rule is met and report unmet prompts as Uncertainties (P2).  
- TPF4: Contradictions between claims or sources can be detected automatically and logged in a register whose entries cannot leave the status "open" without a recorded resolution (P3).

**Outcome propositions**

- TPO1 (P1): Evaluative statements produced under enforced traceability are confirmed as supported by independent reviewers at a higher rate and in less time than statements in a baseline memo; the share of artifact links whose excerpt does not support the claim (false-link rate) is bounded and reported.  
- TPO2 (P2): Evidence gaps present in the materials are reported as Uncertainties by the artifact, whereas the baseline asserts conclusions over the same gaps; reviewers identify insufficiently supported statements more accurately when type and confidence are explicit.  
- TPO3 (P3): Contradictions present in the source material survive into the final output under the artifact and are lost or smoothed in the baseline.

**2.6 Justificatory knowledge**

The problem literature in Section 1.1 explains why the problem exists; the kernel theories below explain why each principle should work.

| Principle | Kernel theory | What it explains |
| :---- | :---- | :---- |
| P1 | Wand & Wang (1996), ontological foundations of data quality | A representation is deficient when it is incomplete (a real-world state has no representation) or ambiguous (one representation maps to several real-world states). An optional evidence link is exactly such an ambiguous representation: "no link" can mean unsupported or merely undocumented. Making the link mandatory removes the ambiguity, so every output state maps to exactly one evidentiary state. |
| P1 | Gregor & Benbasat (1999), explanations from intelligent systems | Explanations that expose the basis of a system's conclusion (provenance) support user verification and appropriate trust; the traceability chain is such an explanation, provided by construction rather than added afterwards. |
| P1 | Silver (1991), system restrictiveness | A decision support system shapes decision processes by restricting what its users can do; enforcement is restrictiveness applied to output formation, deliberately chosen so that the undesirable process (asserting without evidence) is not available. |
| P2 | Guyatt et al. (2008), GRADE | Evidence quality can be graded by explicit rules from the type and independence of the studies behind it, so that the strength a recommendation can carry is read off a label rather than argued case by case; source tiers and confidence levels are the analogue for claims. |
| P2 | Rashkin et al. (2023), attribution in natural language generation | A generated statement is attributable if a given source supports it, and this is checkable by a reader; the Fact / Inference / Speculation type extends the two-way attributable / not-attributable distinction with an intermediate level for statements derived from several sources. |
| P3 | Wand & Wang (1996), as for P1 | An output that presents one side of a contradiction is an incomplete representation of the evidence state; retaining both sides and the conflict as a first-class object restores completeness. |
| P3 | Nuseibeh, Easterbrook & Russo (2000), leveraging inconsistency | Inconsistency should be detected, tolerated and managed with an explicit handling decision rather than eliminated on discovery, because premature resolution loses information; the mandatory resolution status is this managed handling. |
| P3 | Higgins et al. (2003), measuring inconsistency in meta-analyses | Disagreement between evidence sources is itself a measurable and reportable property of an evidence base, not noise to be averaged away. |

**2.7 Principles of implementation**

1. **Data model.** An evaluative statement cannot be persisted without a claim reference; a Fact or Inference claim cannot be persisted without a source reference and excerpt; a Speculation is persisted only with its type flag set; a Conflict cannot be persisted without a status.  
2. **Synthesis by rendering.** Output documents are generated from claims, not written as free text with citations attached afterwards, so an unbacked statement cannot be formed. Source IDs may appear in an output only alongside the claim ID they support.  
3. **Labels by rule, not by judgment.** Claim type and confidence are assigned by the fixed rules in the Framework Configuration from tier and independence, so a reader can recompute them from the visible links.  
4. **Sufficiency as an explicit rule.** The sufficiency rule is a stated, configurable predicate over labels and coverage; it is applied mechanically to every statement, prompt and dimension, and its outcome is shown. A reader can disagree with the rule but cannot miss its result. Prompts the rule marks as uncovered are written to the Uncertainty List.  
5. **Conflict detection.** Claims are compared pairwise by the LLM for contradiction, and sources are checked against each other during collection; every detected pair is written to the Conflict Register with status "open". Duplicate claims are merged before comparison so that a paraphrase is not mistaken for a conflict.  
6. **Division of labour.** The LLM extracts claims, assigns sources, computes coverage and detects conflicts; it does not judge whether a link is correct. The interface shows the excerpt beside every claim so that the correctness judgment stays with the analyst and is cheap.  
7. **Fixed mechanism, configured parameters.** Tier definitions, confidence rules, sufficiency rule, Collection Prompts, dimensions and anchors are set once per fund; the enforcement mechanism, the identifier scheme and the mandatory output objects are not configurable. Each evaluation records the configuration version it ran under.

**2.8 Expository instantiation**

The instantiation is a web application (analyst interface, LLM pipeline, document storage, fund-level settings) that implements a five-step workflow. Steps 2, 3 and 5 and the three output documents realize the design theory; steps 1 and 4 are part of the screening framework the application serves but outside the theory.

1. **Quick Screen** (outside the theory). The analyst answers one to seven fund-defined screening questions in one or two sentences each; the result is a memo with a preliminary thesis, a Proceed / Watch / Pass verdict and the two most decision-critical uncertainties. Only Proceed continues.  
2. **Evidence Collection** (MR1, MR2, MR3). The analyst uploads all available materials; the system converts them to text, checks each against the Collection Prompts, runs a web search for further sources, assigns every source a tier, and records conflicting sources in the Conflict Register. Output: the Source Table (S1 … Sn).  
3. **Claim Extraction** (MR1, MR2, MR3). For each source the system extracts the two to six most decision-relevant statements, rewrites them as atomic claims, types them, attaches source IDs and excerpts, assigns confidence by rule, merges duplicates, and records contradicting claims in the Conflict Register. Output: the Claim Table (C1 … Cn), which must cover all Collection Prompts; uncovered prompts become Uncertainties.  
4. **Counter-Case and Uncertainty** (Uncertainty List inside the theory; counter-case and falsifiers outside). The system compiles the Uncertainty List (U\#) of five to ten unresolved questions, each flagged as decision-critical or not, and, outside the theory, three counter-arguments and two to four falsification criteria (F\#).  
5. **Dimension Analysis** (MR1, MR2). For each of about ten fund-defined dimensions the system answers the diagnostic prompts from claims, names the strongest counter-signal and assigns a 0 to 5 score anchored to fixed interpretations, citing two to five claims. Output: the Dimension Assessment Table (D\#).

**Outputs.** The Thesis Card (one page: thesis, outlier scenario, base / upside / failure cases, moat, entry wedge, falsifiers, milestones, dimension scores, open questions), the Evidence Pack (all five tables) and the Decision Snapshot (recommendation with justification, three strongest arguments, primary risks, research agenda, re-evaluation trigger). Every evaluative statement cites C\#.

**Worked trace.** Thesis Card: "Nordwind has early commercial traction \[C4\]" → Claim Table, C4: "Nordwind has 12 paying customers", Fact, confidence Medium, source S1 → excerpt: "we currently serve 12 paying customers …" → Source Table, S1: pitch deck, Tier 1 (company-originated). A reader sees in one step that the statement rests on a single company-originated source and can weigh it accordingly. If a press article (S3, Tier 2\) reported eight customers, C4 and the claim extracted from S3 would both remain in the Claim Table and appear as CR1 in the Conflict Register with status "open" until the analyst records a resolution. If no source addressed the Collection Prompt on go-to-market feasibility, that prompt would appear as U2 in the Uncertainty List, and any dimension depending on it could not be scored above the level the sufficiency rule allows.

**Mapping of principles to features.**

| Principle | Realized by |
| :---- | :---- |
| P1 | Claim Table with mandatory Source and Source Excerpt columns; outputs rendered from claims; statements without C\# cannot be saved |
| P2 | Type and Confidence columns computed by rule; coverage check of Claim Table against Collection Prompts; sufficiency rule in settings; Uncertainty List with decision-criticality flag; dimension scores requiring two to five claims |
| P3 | Conflict Register with mandatory Resolution Status; conflict detection during collection and extraction; both claims retained in the Claim Table |

**3\. Evaluation plan**

The evaluation follows the demonstrate-then-evaluate sequence of Peffers et al. (2007) and Hevner's guideline 3 (Hevner et al. 2004): the feasibility propositions are discharged by construction and demonstration, the outcome propositions by a controlled comparison and a practitioner review. Three studies build on each other; each maps to specific propositions and metrics (Table 3.4).

**3.1 Study 1: Demonstration (TPF1 to TPF4).** The artifact is run end to end on two deals: a fictional company for which the corpus is constructed with a known ground truth (see 3.2), and a real early-stage company with public materials (deck or public pitch, founder profiles, press). For each run the thesis reports the Source Table, Claim Table, Conflict Register, Uncertainty List and outputs, with counts (sources by tier, claims by type and confidence, conflicts, uncertainties by criticality) and at least one complete trace from a Thesis Card sentence through C\# and the excerpt to S\#. A feasibility proposition is discharged if the corresponding artifact behaviour is observed on both deals: no output statement without a C\# (TPF2), every Fact/Inference with an S\# and excerpt (TPF1), every uncovered prompt in the Uncertainty List (TPF3), every detected contradiction in the register with a status (TPF4).

**3.2 Study 2: Controlled comparison with planted ground truth (TPO1 to TPO3).** *Materials.* A synthetic deal corpus for the fictional company is built so that the truth is known: a set of atomic ground-truth facts (about 40\) distributed across a pitch deck, two founder profiles, a customer case study, two press articles and two blog posts (so that all three tiers occur); a fixed number of planted contradictions between sources (about 8, including Tier 1 vs Tier 2 and Tier 1 vs Tier 1 cases); a fixed number of planted evidence gaps (about 6 Collection Prompts for which the corpus deliberately contains no answer); and decoy material that is relevant-looking but does not bear on any prompt. *Conditions.* (A) Artifact. (B) Baseline: the same LLM, the same corpus and the same fund configuration, instructed to write an investment memo of the same length with citations to the source documents, without the claim layer, sufficiency rule or conflict register. Because LLM output varies between runs, each condition is run five times; metrics are reported per run and as means. *Measures.*

- Conflict survival rate (TPO3): share of the planted contradictions that are visible in the final output (artifact: present in the Conflict Register and referenced in the outputs; baseline: coded by reviewers as explicitly mentioned). Also reported: false conflict rate, the share of register entries that are not real contradictions.  
- Gap detection rate (TPO2): share of the planted gaps reported as Uncertainties by the artifact versus the share the baseline acknowledges as missing evidence; and the unsupported assertion rate, the share of gap prompts on which the baseline nevertheless asserts a conclusion.  
- Substantiation rate and time to verify (TPO1): two trained independent reviewers each check a random sample of 30 evaluative statements per output; for the artifact they read the presented excerpt, for the baseline they locate support in the corpus themselves; recorded are the judgment (supported / not supported) and the time per statement.  
- False-link rate (TPO1, boundary): among the artifact's Fact and Inference claims, the share whose excerpt does not support the claim on inspection. This is the precision of the LLM's evidence placement and is the quantity the boundary statement leaves to human judgment.  
- Claim recall (TPF1, supplementary): share of ground-truth facts that appear as claims in the Claim Table. *Reliability and analysis.* Reviewers are blind to the hypothesis where the format allows it (it cannot be fully hidden, since the artifact's format is visible); inter-rater agreement is reported (Cohen's kappa) and disagreements are resolved by discussion. Given the small number of runs, results are reported descriptively with effect sizes and ranges rather than significance tests. Success criteria are stated before the runs: conflict survival above 80% for the artifact and higher than the baseline in every run; gap detection higher than the baseline in every run; substantiation rate higher and time to verify lower for the artifact; false-link rate reported without a threshold, as it measures the boundary rather than the principle.

**3.3 Study 3: Practitioner evaluation (TPO1, TPO2, relevance of MR1 to MR3).** Three to five VC practitioners (analysts, associates or partners who screen deals) each receive both outputs for the real deal from Study 1, in counterbalanced order. Session (60 minutes): (i) a verification task in which they check five statements per output aloud, timed; (ii) a conflict and gap task in which they name the contradictions and missing evidence they can identify from each output; (iii) ratings on 7-point scales for auditability, rigor, trust, visibility of evidence gaps and visibility of conflicts, for each output; (iv) a semi-structured interview on whether the sufficiency rule and the conflict register match how they judge evidence, what they would change, and whether the output would be usable in their committee process. Ratings are reported descriptively per participant; interviews are transcribed and coded thematically against the three meta-requirements. This study establishes relevance and perceived usefulness; it is not sized to test differences statistically.

**3.4 Mapping of propositions to studies.**

| Proposition | Study | Metric | Success criterion |
| :---- | :---- | :---- | :---- |
| TPF1 | 1 | every Fact/Inference has S\# and excerpt; claim recall | observed on both deals; recall reported |
| TPF2 | 1 | no evaluative statement without C\#; Speculations marked | observed on both deals |
| TPF3 | 1 | uncovered prompts appear as U\# | observed on both deals |
| TPF4 | 1 | contradictions in register with status | observed on both deals |
| TPO1 | 2, 3 | substantiation rate, time to verify, false-link rate | artifact higher / faster than baseline; false-link rate reported |
| TPO2 | 2, 3 | gap detection rate, unsupported assertion rate, ratings | artifact higher than baseline in every run |
| TPO3 | 2, 3 | conflict survival rate, false conflict rate | above 80% and above baseline in every run |

**3.5 Threats to validity and limits.** The synthetic corpus is built by the author, so planted contradictions and gaps may be easier or harder than real ones; the real deal in Studies 1 and 3 partly compensates. A single LLM is used; the design theory is stated independently of the model, but the measured rates are model-specific. The number of runs, reviewers and practitioners is small, so results are indicative, not statistical. Reviewer blinding is imperfect. The false-link rate is the honest limit of the artifact: enforcement guarantees that a link exists and is checkable, not that it is right, and this study measures how often it is wrong.

**References**

Buçinca, Z., Malaya, M. B., & Gajos, K. Z. (2021). To trust or to think: Cognitive forcing functions can reduce overreliance on AI in AI-assisted decision-making. *Proceedings of the ACM on Human-Computer Interaction* 5(CSCW1), Article 188\. Chen, H.-T., Zhang, M. J. Q., & Choi, E. (2022). Rich knowledge sources bring complex knowledge conflicts: Recalibrating models to reflect conflicting evidence. *Proceedings of EMNLP 2022*. Cooper, A. C., Woo, C. Y., & Dunkelberg, W. C. (1988). Entrepreneurs' perceived chances for success. *Journal of Business Venturing* 3(2), 97–108. Gao, T., Yen, H., Yu, J., & Chen, D. (2023). Enabling large language models to generate text with citations. *Proceedings of EMNLP 2023*. Gompers, P., Gornall, W., Kaplan, S. N., & Strebulaev, I. A. (2020). How do venture capitalists make decisions? *Journal of Financial Economics* 135(1), 169–190. Gregor, S., & Benbasat, I. (1999). Explanations from intelligent systems: Theoretical foundations and implications for practice. *MIS Quarterly* 23(4), 497–530. Gregor, S., & Jones, D. (2007). The anatomy of a design theory. *Journal of the Association for Information Systems* 8(5), 312–335. Guyatt, G. H., Oxman, A. D., Vist, G. E., Kunz, R., Falck-Ytter, Y., Alonso-Coello, P., & Schünemann, H. J. (2008). GRADE: An emerging consensus on rating quality of evidence and strength of recommendations. *BMJ* 336, 924–926. Hevner, A. R., March, S. T., Park, J., & Ram, S. (2004). Design science in information systems research. *MIS Quarterly* 28(1), 75–105. Higgins, J. P. T., Thompson, S. G., Deeks, J. J., & Altman, D. G. (2003). Measuring inconsistency in meta-analyses. *BMJ* 327, 557–560. Huang, L. et al. (2025). A survey on hallucination in large language models: Principles, taxonomy, challenges, and open questions. *ACM Transactions on Information Systems* 43(2), Article 42\. Kirsch, D., Goldfarb, B., & Gera, A. (2009). Form or substance: The role of business plans in venture capital decision making. *Strategic Management Journal* 30(5), 487–515. Liu, N. F., Zhang, T., & Liang, P. (2023). Evaluating verifiability in generative search engines. *Findings of EMNLP 2023*. Malenko, A., Nanda, R., Rhodes-Kropf, M., & Sundaresan, S. (2023). Catching outliers: Committee voting and the limits of consensus when financing innovation. Harvard Business School Working Paper 21-131, forthcoming in *Journal of Finance*. Nuseibeh, B., Easterbrook, S., & Russo, A. (2000). Leveraging inconsistency in software development. *IEEE Computer* 33(4), 24–29. Peffers, K., Tuunanen, T., Rothenberger, M. A., & Chatterjee, S. (2007). A design science research methodology for information systems research. *Journal of Management Information Systems* 24(3), 45–77. Rashkin, H., Nikolaev, V., Lamm, M., Aroyo, L., Collins, M., Das, D., Petrov, S., Tomar, G. S., Turc, I., & Reitter, D. (2023). Measuring attribution in natural language generation models. *Computational Linguistics* 49(4), 777–840. Sharma, M. et al. (2024). Towards understanding sycophancy in language models. *Proceedings of ICLR 2024*. Silver, M. S. (1991). *Systems that support decision makers: Description and analysis.* Chichester: Wiley. Wand, Y., & Wang, R. Y. (1996). Anchoring data quality dimensions in ontological foundations. *Communications of the ACM* 39(11), 86–95.