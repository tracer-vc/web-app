import type * as z from "zod";

// A versioned prompt (lib/llm/prompts/). Bump `version` whenever the system
// text, the message format or the schema changes; llm_calls records it.
export type PromptDef<Input, Schema extends z.ZodObject> = {
  key: string; // "P1" … "P13"
  version: string;
  name: string; // JSON-schema name sent to the model
  system: string;
  user: (input: Input) => string;
  schema: Schema;
  // Rule checks the JSON schema can't express (e.g. "Pass needs a reopen
  // condition"). Return human-readable violations; empty means valid.
  validate?: (output: z.infer<Schema>, input: Input) => string[];
};
