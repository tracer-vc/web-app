import { Inngest } from "inngest";

// Background jobs (decision 8). Locally: INNGEST_DEV=1 and the Inngest dev
// server (`npx inngest-cli@latest dev`). On Vercel: INNGEST_EVENT_KEY and
// INNGEST_SIGNING_KEY from Inngest Cloud (docs/open-todos.md).
export const inngest = new Inngest({
  id: "tracer",
  // Several steps may run in one request; stay below Vercel's function limit.
  checkpointing: { maxRuntime: "50s" },
});

export const SOURCES_COLLECT = "tracer/sources.collect";
export type SourcesCollectData = { evaluationId: string; runId: string };

export const CLAIMS_EXTRACT = "tracer/claims.extract";
export type ClaimsExtractData = { evaluationId: string; runId: string };

export const COUNTER_CASE_RUN = "tracer/counter-case.run";
export type CounterCaseRunData = { evaluationId: string; runId: string };

export const DIMENSIONS_SCORE = "tracer/dimensions.score";
export type DimensionsScoreData = { evaluationId: string; runId: string };

export const SYNTHESIZE = "tracer/outputs.synthesize";
export type SynthesizeData = { evaluationId: string; runId: string };

// Study 2 (M15)
export const BASELINE_RUN = "tracer/study.baseline";
export type BaselineRunData = { evaluationId: string; baselineId: string };
export const STUDY_ARTIFACT = "tracer/study.artifact";
export type StudyArtifactData = { evaluationId: string; actorId: string };

// Reading the visual content of an uploaded document (decision 45)
export const DOCUMENT_VISUALS = "tracer/document.visuals";
export type DocumentVisualsData = { documentId: string };
