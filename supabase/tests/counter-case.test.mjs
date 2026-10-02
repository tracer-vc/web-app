// M11 in the database: counter arguments, P9 uncertainties and falsifiers
// recorded in one transaction; every argument and falsifier cites a claim;
// citations stay within the evaluation. Run: npm test
import assert from "node:assert/strict";
import { before, test } from "node:test";
import { createDb } from "./harness.mjs";

let h, uid, evaluationId, other, run;

const args = (codes = [["C1"], ["C2"], ["C1", "C2"]]) =>
  codes.map((c, i) => ({ rank: i + 1, argument: `Argument ${i + 1}`, mechanism: `Mechanism ${i + 1}`, claim_codes: c }));
const record = (a, u, f, ev = evaluationId) =>
  h.svc(`select record_counter_case($1, $2, $3::jsonb, $4::jsonb, $5::jsonb, '{}', '{}') as n`, [
    ev,
    run,
    JSON.stringify(a),
    JSON.stringify(u),
    JSON.stringify(f),
  ]);

before(async () => {
  h = await createDb();
  ({ uid, evaluationId } = await h.seedDeal("ann@test"));
  other = await h.seedDeal("xi@test");
  const s1 = await h.addSource(evaluationId, "primary", "Nordwind");
  await h.addFact(evaluationId, [s1], "Nordwind serves 12 paying customers."); // C1
  await h.addFact(evaluationId, [s1], "Nordwind charges EUR 3,200 per turbine."); // C2
  await h.query(`insert into uncertainties (evaluation_id, code, question, why_unresolved, decision_critical) values ($1, 'U0', 'Q1?', 'Why', true)`, [evaluationId]); // U1
  const os = await h.addSource(other.evaluationId, "primary", "Other");
  await h.addFact(other.evaluationId, [os], "Other fact."); // C1 of the other deal
  [{ id: run }] = await h.query(`insert into pipeline_runs (evaluation_id, step, status) values ($1, 4, 'running') returning id`, [evaluationId]);
});

test("a falsifier without a claim fails the whole write", async () => {
  await assert.rejects(
    record(args(), [], [
      { criterion: "A", outcome_check: "x", claim_codes: ["C1"], uncertainty_codes: [] },
      { criterion: "B", outcome_check: "y", claim_codes: [], uncertainty_codes: ["U1"] },
    ]),
    /falsifier must cite at least one claim/,
  );
  assert.equal((await h.query(`select count(*)::int n from counter_arguments`))[0].n, 0);
});

test("a counter argument without a claim fails", async () => {
  await assert.rejects(
    record(args([["C1"], [], ["C2"]]), [], [
      { criterion: "A", outcome_check: "x", claim_codes: ["C1"] },
      { criterion: "B", outcome_check: "y", claim_codes: ["C2"] },
    ]),
    /counter argument must cite at least one claim/,
  );
});

test("unknown or foreign codes are rejected", async () => {
  await assert.rejects(
    record(args([["C1"], ["C9"], ["C2"]]), [], [
      { criterion: "A", outcome_check: "x", claim_codes: ["C1"] },
      { criterion: "B", outcome_check: "y", claim_codes: ["C2"] },
    ]),
    /unknown claim C9/,
  );
  await assert.rejects(
    record(args(), [], [
      { criterion: "A", outcome_check: "x", claim_codes: ["C1"], uncertainty_codes: ["U7"] },
      { criterion: "B", outcome_check: "y", claim_codes: ["C2"] },
    ]),
    /unknown uncertainty U7/,
  );
});

test("exactly three arguments and two to four falsifiers", async () => {
  await assert.rejects(record(args().slice(0, 2), [], []), /exactly three/);
  await assert.rejects(record(args(), [], [{ criterion: "A", outcome_check: "x", claim_codes: ["C1"] }]), /2 to 4/);
});

test("records the counter-case; new U# continue and can be cited by falsifiers", async () => {
  const [{ n }] = await record(
    args(),
    [
      { question: "Q2?", why_unresolved: "W2", decision_critical: true, min_evidence_to_resolve: "E2" },
      { question: "Q3?", why_unresolved: "W3", decision_critical: false },
    ],
    [
      { criterion: "Fewer than 20 customers by Q4 2027", outcome_check: "Customer list", claim_codes: ["C1"], uncertainty_codes: ["U1", "U2"] },
      { criterion: "Price below EUR 2,000", outcome_check: "Signed contracts", claim_codes: ["C2"], uncertainty_codes: ["U3"] },
    ],
  );
  assert.equal(n, 2);
  const us = await h.query(`select code, question from uncertainties where evaluation_id = $1 order by code`, [evaluationId]);
  assert.deepEqual(us.map((u) => `${u.code}:${u.question}`), ["U1:Q1?", "U2:Q2?", "U3:Q3?"]);
  const fs = await h.query(
    `select f.code, array_agg(u.code order by u.code) us from falsifiers f join falsifier_uncertainties fu on fu.falsifier_id = f.id
     join uncertainties u on u.id = fu.uncertainty_id group by f.code order by f.code`,
  );
  assert.deepEqual(fs.map((f) => `${f.code}:${f.us.join("+")}`), ["F1:U1+U2", "F2:U3"]);
  const [r] = await h.query(`select status from pipeline_runs where id = $1`, [run]);
  assert.equal(r.status, "done");
});

test("a second counter-case is rejected", async () => {
  await assert.rejects(record(args(), [], []), /already has a counter-case/);
});

test("a link cannot cross evaluations", async () => {
  const [{ id: foreignClaim }] = await h.query(`select id from claims where evaluation_id = $1`, [other.evaluationId]);
  const [{ id: arg }] = await h.query(`select id from counter_arguments where rank = 1`);
  await assert.rejects(
    h.query(`insert into counter_argument_claims (argument_id, claim_id) values ($1, $2)`, [arg, foreignClaim]),
    /within one evaluation/,
  );
});

test("removing the last claim link of a falsifier fails at commit", async () => {
  await assert.rejects(
    h.exec(`begin; delete from falsifier_claims where falsifier_id = (select id from falsifiers where code = 'F2'); commit;`),
    /falsifier must cite at least one claim/,
  );
});

test("analysts read their own fund only and cannot write", async () => {
  assert.equal((await h.as(uid, `select count(*)::int n from counter_arguments`))[0].n, 3);
  assert.equal((await h.as(other.uid, `select count(*)::int n from falsifiers`))[0].n, 0);
  await assert.rejects(h.as(uid, `update falsifiers set criterion = 'x'`), /permission denied/);
  await assert.rejects(h.as(uid, `delete from counter_argument_claims`), /permission denied/);
});
