import * as z from "zod";
import type { PromptDef } from "../types";

// P6 Merge & contradictions (data_flow.html §04): over all candidate claims of
// a deal. Merges come first so paraphrases aren't reported as conflicts.
// Candidates carry temporary refs (K1…); C# is assigned after the merge.

export type P6Input = {
  claims: { ref: string; type: "fact" | "inference" | "speculation"; statement: string; source: string; excerpt: string | null }[];
};

const schema = z.object({
  merges: z.array(
    z.object({
      keep: z.string().describe("Ref of the most precise claim of the group, e.g. K3."),
      drop: z.array(z.string()).describe("Refs of the equivalent claims merged into it."),
    }),
  ),
  contradictions: z.array(
    z.object({
      a: z.string().describe("Ref of one claim."),
      b: z.string().describe("Ref of the claim it cannot both be true with."),
      description: z.string().describe("One sentence naming what they disagree on."),
    }),
  ),
});

export type P6Output = z.infer<typeof schema>;

export const P6: PromptDef<P6Input, typeof schema> = {
  key: "P6",
  version: "2",
  name: "merge_claims",
  system: [
    "Given all candidate claims with their source IDs: (1) group semantically equivalent claims and pick the most precise as canonical; (2) among the remaining, list pairs that cannot both be true. Never drop a side of a contradiction.",
    "Merge only claims of the same type that state the same proposition (paraphrases, possibly from different sources): after the merge, every excerpt of the group must support the kept statement in full, because the kept claim cites all of them.",
    "Do not merge a general claim into a more specific one (e.g. \"X is CEO\" into \"X spent nine years at Y\", or \"charges per turbine\" into \"charges EUR 3,200 per turbine\"): if one claim adds a detail, figure, name or date that another claim's excerpt does not state, keep both. Do not merge claims whose figures, dates or scope differ: those are separate claims and possibly a contradiction.",
    "Report a contradiction only between fact or inference claims, using the canonical refs (never a dropped ref). Different figures for the same quantity (e.g. number of customers) cannot both be true. Report each pair once. Describe what they disagree on in words, without mentioning the refs.",
    "If nothing merges or contradicts, return empty lists.",
  ].join("\n"),
  user: ({ claims }) =>
    claims
      .map((c) => `${c.ref} [${c.type}] (${c.source}) ${c.statement}${c.excerpt ? `\n   excerpt: "${c.excerpt}"` : ""}`)
      .join("\n"),
  schema,
  validate: (o, input) => {
    const errors: string[] = [];
    const byRef = new Map(input.claims.map((c) => [c.ref, c]));
    const grouped = new Set<string>();
    const dropped = new Set<string>();
    for (const m of o.merges) {
      const keep = byRef.get(m.keep);
      if (!keep) {
        errors.push(`merge keeps unknown ref ${m.keep}`);
        continue;
      }
      if (m.drop.length === 0) errors.push(`merge into ${m.keep} drops nothing`);
      for (const ref of [m.keep, ...m.drop]) {
        if (grouped.has(ref)) errors.push(`${ref} appears in more than one merge`);
        grouped.add(ref);
      }
      for (const ref of m.drop) {
        const c = byRef.get(ref);
        if (!c) errors.push(`merge drops unknown ref ${ref}`);
        else if (ref === m.keep) errors.push(`${ref} both kept and dropped`);
        else if (c.type !== keep.type) errors.push(`${ref} (${c.type}) cannot merge into ${m.keep} (${keep.type})`);
        dropped.add(ref);
      }
    }
    const pairs = new Set<string>();
    for (const x of o.contradictions) {
      const a = byRef.get(x.a);
      const b = byRef.get(x.b);
      if (!a || !b) {
        errors.push(`contradiction ${x.a}/${x.b} names an unknown ref`);
        continue;
      }
      if (x.a === x.b) errors.push(`${x.a} contradicts itself`);
      for (const [ref, c] of [
        [x.a, a],
        [x.b, b],
      ] as const) {
        if (c.type === "speculation") errors.push(`${ref} is a speculation; contradictions are between fact or inference claims`);
        if (dropped.has(ref)) errors.push(`${ref} is dropped by a merge; never drop a side of a contradiction`);
      }
      if (!x.description.trim()) errors.push(`${x.a}/${x.b}: description is empty`);
      // K refs are temporary; the description is shown next to the final C#s.
      else if (/\bK\d+\b/.test(x.description)) errors.push(`${x.a}/${x.b}: describe the disagreement in words, without refs`);
      const key = [x.a, x.b].sort().join("|");
      if (pairs.has(key)) errors.push(`${x.a}/${x.b} reported twice`);
      pairs.add(key);
    }
    return errors;
  },
};
