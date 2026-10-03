import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { collectSources } from "@/lib/inngest/functions/collect-sources";
import { extractClaims } from "@/lib/inngest/functions/extract-claims";
import { scoreDimensions } from "@/lib/inngest/functions/score-dimensions";
import { stressTest } from "@/lib/inngest/functions/stress-test";
import { synthesize } from "@/lib/inngest/functions/synthesize";
import { baselineMemo } from "@/lib/inngest/functions/baseline-memo";
import { documentVisuals } from "@/lib/inngest/functions/document-visuals";
import { studyArtifactRun } from "@/lib/inngest/functions/study-artifact-run";

// Inngest calls this endpoint to run function steps (decision 8).
export const { GET, POST, PUT } = serve({ client: inngest, functions: [collectSources, extractClaims, stressTest, scoreDimensions, synthesize, baselineMemo, studyArtifactRun, documentVisuals] });
