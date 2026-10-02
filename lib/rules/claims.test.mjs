// Unit tests for Claim Table assembly (merges, R2, conflict parents). Run: npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { applyMerges, nearestStatements, parentSourceConflict, uncoveredRequiredPrompts } from "./claims.ts";

const link = (source_id, start) => ({ source_id, excerpt: "x", start, end: start + 5 });
const candidates = [
  { ref: "K1", type: "fact", statement: "Nordwind serves 12 paying customers.", promptIds: ["p4"], links: [link("s1", 0)] },
  { ref: "K2", type: "fact", statement: "Nordwind has eight customers.", promptIds: ["p4"], links: [link("s3", 10)] },
  { ref: "K3", type: "fact", statement: "Nordwind has 12 customers.", promptIds: ["p4", "p2"], links: [link("s2", 7), link("s1", 0)] },
  { ref: "K4", type: "speculation", statement: "Nordwind could lead the market.", promptIds: ["p1"], links: [] },
];

test("a merge keeps the canonical claim with the union of links and prompts", () => {
  const { claims, indexOf } = applyMerges(candidates, [{ keep: "K1", drop: ["K3"] }]);
  assert.equal(claims.length, 3);
  assert.deepEqual(claims[0].refs, ["K1", "K3"]);
  assert.deepEqual(claims[0].links.map((l) => l.source_id), ["s1", "s2"]); // s1 at 0 deduplicated
  assert.deepEqual(claims[0].promptIds, ["p4", "p2"]);
  assert.equal(indexOf.get("K3"), 0);
  assert.equal(indexOf.get("K2"), 1);
});

test("R2: speculation does not cover a prompt; only required prompts count", () => {
  const { claims } = applyMerges(candidates, []);
  const prompts = [
    { id: "p1", required: true },
    { id: "p2", required: true },
    { id: "p9", required: true },
    { id: "p8", required: false },
  ];
  assert.deepEqual(uncoveredRequiredPrompts(claims, prompts).map((p) => p.id), ["p1", "p9"]);
});

test("a claim conflict links to the source conflict between its sides' sources", () => {
  const { claims } = applyMerges(candidates, [{ keep: "K1", drop: ["K3"] }]);
  const sourceConflicts = [
    { id: "cr-other", sideA: "s2", sideB: "s9" },
    { id: "cr1", sideA: "s3", sideB: "s1" },
  ];
  assert.equal(parentSourceConflict(claims[0], claims[1], sourceConflicts), "cr1");
  assert.equal(parentSourceConflict(claims[0], claims[2], sourceConflicts), null);
});

test("nearest statements share words with the prompt", () => {
  const got = nearestStatements("Which constraints could bound scaling of customers?", candidates.map((c) => c.statement), 2);
  assert.deepEqual(got, ["Nordwind serves 12 paying customers.", "Nordwind has eight customers."]);
});
