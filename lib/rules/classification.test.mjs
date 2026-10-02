// Unit tests for R3 classification (decisions 12, 33). Run: npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { classify } from "./classification.ts";

// The default criteria seeded for every fund.
const criteria = {
  rules: [
    { outcome: "pass", match: "any", predicates: [{ type: "any_dimension_disqualifying" }], note: "" },
    {
      outcome: "watch",
      match: "any",
      predicates: [
        { type: "min_dimension_score", op: "<=", value: 2 },
        { type: "open_decision_critical_uncertainties", op: ">=", value: 1 },
      ],
      note: "",
    },
    { outcome: "proceed", match: "all", predicates: [], note: "" },
  ],
};
const dims = (...scores) =>
  scores.map(([score, below = null], i) => ({ code: `D${i + 1}`, title: `Dim ${i + 1}`, score, disqualifyingBelow: below }));
const facts = (d, u = 0, c = 0) => ({ dimensions: d, openDecisionCriticalUncertainties: u, openConflicts: c });

test("a disqualifying dimension means Pass, even if Watch would also match", () => {
  const t = classify(criteria, facts(dims([1, 2], [4]), 3));
  assert.equal(t.classification, "pass");
  assert.equal(t.rule_applied, "Pass: disqualifying: D1 Dim 1 1 < 2");
  assert.deepEqual(t.rules.map((r) => `${r.outcome}:${r.matched}`), ["pass:true", "watch:true", "proceed:true"]);
});

test("lowest score at or below 2 means Watch, naming the dimension", () => {
  const t = classify(criteria, facts(dims([4], [2]), 0));
  assert.equal(t.classification, "watch");
  assert.equal(t.rule_applied, "Watch: lowest dimension score 2 <= 2 (D2 Dim 2)");
});

test("an open decision-critical uncertainty alone means Watch", () => {
  const t = classify(criteria, facts(dims([4], [3]), 2));
  assert.equal(t.classification, "watch");
  assert.equal(t.rule_applied, "Watch: open decision-critical uncertainties 2 >= 1");
});

test("Proceed when neither Pass nor Watch matches, with the evaluated conditions", () => {
  const t = classify(criteria, facts(dims([4], [3]), 0));
  assert.equal(t.classification, "proceed");
  assert.match(t.rule_applied, /^Proceed: neither the Pass nor the Watch conditions matched \(no dimension below/);
});

test("'all' needs every condition; rules are evaluated Pass → Watch → Proceed regardless of order", () => {
  const c = {
    rules: [
      { outcome: "proceed", match: "all", predicates: [], note: "" },
      {
        outcome: "watch",
        match: "all",
        predicates: [
          { type: "avg_dimension_score", op: "<", value: 3.5 },
          { type: "open_conflicts", op: ">", value: 0 },
        ],
        note: "",
      },
    ],
  };
  assert.equal(classify(c, facts(dims([3], [3]), 0, 0)).classification, "proceed");
  const t = classify(c, facts(dims([3], [3]), 0, 1));
  assert.equal(t.classification, "watch");
  assert.equal(t.rule_applied, "Watch: average dimension score 3 < 3.5 and open conflicts 1 > 0");
});

test("a rule without conditions never matches except the Proceed fallback", () => {
  const c = { rules: [{ outcome: "pass", match: "all", predicates: [], note: "" }] };
  assert.equal(classify(c, facts(dims([0]))).classification, "proceed");
});
