import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { collectSources } from "@/lib/inngest/functions/collect-sources";

// Inngest calls this endpoint to run function steps (decision 8).
export const { GET, POST, PUT } = serve({ client: inngest, functions: [collectSources] });
