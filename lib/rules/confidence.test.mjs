// Unit tests for R1 confidence (decision 9). Run: npm test
// The cases are shared with the SQL implementation (supabase/tests/confidence.test.mjs).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { computeConfidence } from "./confidence.ts";

const { rules, cases } = JSON.parse(readFileSync(new URL("./confidence-cases.json", import.meta.url), "utf8"));

for (const c of cases) {
  test(c.name, () => {
    // Links marked wrong are left out before R1 (the worker never produces them;
    // the SQL function filters them).
    const sources = c.sources.filter((s) => !s.marked_wrong).map((s, i) => ({ code: `S${i + 1}`, tier: s.tier, party: s.party }));
    const { level, basis } = computeConfidence(rules, sources, c.open_conflict);
    assert.equal(level, c.level);
    assert.equal(basis.rule, c.rule);
    assert.equal(basis.downgraded, / → /.test(c.rule));
  });
}

test("parties list their tiers in tier order and their sources", () => {
  const { basis } = computeConfidence(
    rules,
    [
      { code: "S1", tier: "tertiary", party: "Nordwind" },
      { code: "S2", tier: "primary", party: " nordwind " },
    ],
    false,
  );
  assert.deepEqual(basis.parties, [{ party: "Nordwind", tiers: ["primary", "tertiary"], sources: ["S1", "S2"] }]);
});
