import * as z from "zod";

// The fund's selection-criteria note per outcome, from
// framework_configs.classification_criteria. P1 classifies against these
// (decision 13); the structured predicates are for R3 at synthesis.
export const CriteriaNotes = z
  .object({
    rules: z.array(z.object({ outcome: z.enum(["pass", "watch", "proceed"]), note: z.string() })),
  })
  .transform(({ rules }) => {
    const note = (o: "pass" | "watch" | "proceed") =>
      rules.find((r) => r.outcome === o)?.note.trim() || "No criteria given.";
    return { pass: note("pass"), watch: note("watch"), proceed: note("proceed") };
  });
