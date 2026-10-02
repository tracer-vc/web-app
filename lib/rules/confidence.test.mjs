// Unit tests for R1 confidence (decision 9). Run: npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { computeConfidence } from "./confidence.ts";

// The default rules seeded for every fund (supabase/migrations/*_seed_config.sql).
const rules = {
  evaluation: "first_match",
  levels: [
    { level: "high", min_parties: 2, min_parties_in_tiers: { tiers: ["primary", "secondary"], min: 1 }, description: "" },
    { level: "medium", min_parties: 1, min_parties_in_tiers: { tiers: ["primary", "secondary"], min: 1 }, description: "" },
    { level: "low", min_parties: 1, description: "" },
  ],
  open_conflict_downgrade: 1,
  independence: "",
};
const src = (code, tier, party) => ({ code, tier, party });

test("one Primary party is Medium", () => {
  const { level, basis } = computeConfidence(rules, [src("S1", "primary", "Nordwind")], false);
  assert.equal(level, "medium");
  assert.equal(basis.rule, "Medium: one Primary party (Nordwind)");
  assert.equal(basis.downgraded, false);
});

test("two sources from the same party count as one party", () => {
  const { level, basis } = computeConfidence(
    rules,
    [src("S1", "primary", "Nordwind"), src("S2", "tertiary", " nordwind ")],
    false,
  );
  assert.equal(level, "medium");
  assert.deepEqual(basis.parties, [{ party: "Nordwind", tiers: ["primary", "tertiary"], sources: ["S1", "S2"] }]);
});

test("two independent parties with one Secondary is High", () => {
  const { level } = computeConfidence(rules, [src("S1", "tertiary", "Blog"), src("S3", "secondary", "Windpower Weekly")], false);
  assert.equal(level, "high");
});

test("Tertiary only is Low, however many parties", () => {
  const { level } = computeConfidence(rules, [src("S1", "tertiary", "Blog A"), src("S2", "tertiary", "Blog B")], false);
  assert.equal(level, "low");
});

test("an open conflict downgrades one level", () => {
  assert.equal(computeConfidence(rules, [src("S1", "primary", "Nordwind")], true).level, "low");
  const high = computeConfidence(rules, [src("S1", "primary", "A"), src("S2", "secondary", "B")], true);
  assert.equal(high.level, "medium");
  assert.equal(high.basis.base_level, "high");
  assert.match(high.basis.rule, /→ Medium: in an open conflict$/);
});

test("Low cannot drop further", () => {
  const { level, basis } = computeConfidence(rules, [src("S1", "tertiary", "Blog")], true);
  assert.equal(level, "low");
  assert.equal(basis.downgraded, false);
});
