**VC-BA-App Basic Description:** 

**In one sentence:**  
The app helps a VC analyst decide whether a startup is worth investing in, and it builds the final report so that every conclusion can be traced back, step by step, to the document it came from. 

**Why the app exist:**  
If you hand an LLM a pitch deck and ask "should we invest?", you get a fluent memo. But you can't tell which sentences rest on real evidence, which rest only on the founder's own marketing, and which were simply made up. The app never lets the LLM write that kind of free memo. Instead it pushes the evaluation through a fixed pipeline in which every piece of the final report has to be built from smaller, source-linked pieces. 

**How it works:**  
To make it concrete, imagine an analyst evaluating a fictional startup, "Nordwind", which sells predictive-maintenance software for wind turbines. 

**1\. Quick Screen.** Before doing any heavy work, the analyst answers 1 to 7 short screening questions that the fund has defined in the settings (e.g., "Is this plausibly a winner-takes-most market?"), each in 1 to 2 sentences. 

The result is a short **Quick Screen Memo** containing: 

- a one-sentence preliminary thesis;   
- a verdict of **Proceed**, **Watch** or **Pass**, with a one-sentence justification;   
- the two most decision-critical uncertainties. 

A Pass stops the process and records what would reopen the case. A Watch records what the case is waiting on. Only a Proceed leads to the full evaluation. 

**2\. Evidence Collection.** The analyst uploads everything available on Nordwind (pitch deck, founder LinkedIn profiles, press articles). The system then does four things: 

- converts the documents to text;   
- checks each one against the fund's **Collection Prompts** (guiding questions like "What is the go-to-market path, and what evidence supports it?");   
- runs a web search for additional sources;   
- sorts every source into a tier: **Primary** (from the company or the original event, e.g., the pitch deck), **Secondary** (independent analysis, e.g., journalism) or **Tertiary** (weak commentary, e.g., blogs). 

The result is the **Source Table**, where every source gets an ID: S1, S2, S3, and so on. 

**3\. Claim Extraction.** From each source, the system pulls the 2 to 6 most decision-relevant statements and rewrites them as **atomic claims**: one concrete, checkable proposition each (e.g., "Nordwind has 12 paying customers"). Every claim gets: 

- a **type**: Fact (directly supported by a source), Inference (derived from several sources or facts) or Speculation (an explicit hypothesis without source support);   
- the **source ID(s)** it rests on, plus the exact **excerpt** from that source;   
- a **confidence level** (High / Medium / Low), based on the tier and independence of its sources. 

Duplicate claims are merged. When two claims contradict each other, both are kept and the contradiction is logged in the **Conflict Register** (CR1, CR2, …). The result is the **Claim Table**: C1, C2, C3, and so on. 

**4\. Counter-Case and Uncertainty.** The system deliberately attacks the emerging investment case, guided by **Counter-Case Prompts** such as "What is the strongest competitor response?" or "Which assumption is most fragile?". This step produces three things: 

- the **three strongest arguments against** investing, each linked to the claims it is based on  
- an **Uncertainty List** of 5 to 10 open questions the sources can't answer (U1, U2, …), each flagged as decision-critical or not;   
- **Falsification Criteria** (F1, F2, …): 2 to 4 observable conditions under which the thesis should be dropped (e.g., "fewer than 3 of the next 10 customers are won without the founder personally selling"). 

**5\. Dimension Analysis.** The company is scored on about 10 **Evaluation Dimensions** that the fund has defined (e.g., Team & Execution, Moats, Problem Criticality, Go-to-Market). For each dimension, the system: 

- answers that dimension's diagnostic questions using claims from the Claim Table;   
- names the strongest counter-signal;   
- gives a score from 0 to 5, anchored to fixed definitions (e.g., 3 \= "credibly supported, but important uncertainties remain") and justified with 2 to 5 claim IDs. 

The result is the **Dimension Assessment Table** (D1, D2, …). 

**What comes out: three documents** 

**Thesis Card:** a one-page summary of the case. It holds the thesis, the outlier scenario, the base, upside and failure cases, the moat, the entry wedge, the falsifiers, the de-risking milestones, the dimension scores and the open questions. 

**Evidence Pack:** the verification layer behind the Thesis Card. It bundles the Source Table, Claim Table, Conflict Register, Uncertainty List and Dimension Assessment. 

**Decision Snapshot:** the final verdict (Proceed / Watch / Pass) with a short justification citing the scores. It also lists the three strongest arguments for investing, the main risks, a research agenda of 3 to 7 open questions, and the event that should trigger a re-evaluation. 

**The glue: the ID system** 

Because everything carries an ID (S\#, C\#, CR\#, U\#, F\#, D\#), a reader can follow any statement down to its origin: 

Thesis Card sentence: "Nordwind has early commercial traction \[C4\]" → Claim Table, C4: "Nordwind has 12 paying customers" (Fact) → excerpt: "we currently serve 12 paying customers…" → Source Table, S1: Pitch deck (Primary) 

**What the fund sets once, and what stays fixed** 

