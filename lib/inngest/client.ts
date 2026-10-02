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
