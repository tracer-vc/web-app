// M14 in the database: reset_from_step clears a step and all later ones,
// supersedes their runs, renumbers on the next run, and needs a full-reset
// confirmation once outputs exist (decision 20). Run: npm test
import assert from "node:assert/strict";
import { before, test } from "node:test";
import { createDb } from "./harness.mjs";

let h, uid, evaluationId, team, moat, teamPrompt, moatPrompt;
const count = async (table, where = "") =>
  (await h.query(`select count(*)::int n from ${table} where evaluation_id = $1 ${where}`, [evaluationId]))[0].n;
const reset = (step, confirm = false) =>
  h.svc(`select reset_from_step($1, $2, $3, $4) as cleared`, [evaluationId, step, confirm, uid]);
const run = async (step) =>
  (await h.query(`insert into pipeline_runs (evaluation_id, step, status) values ($1, $2, 'done') returning id`, [evaluationId, step]))[0].id;

async function stepsFourToSix() {
  await h.query(`update evaluations set status = 'stress_testing', current_step = 4 where id = $1`, [evaluationId]);
  await h.svc(`select record_counter_case($1, $2, $3::jsonb, $4::jsonb, $5::jsonb, '{}', '{}')`, [
    evaluationId,
    await run(4),
    JSON.stringify([1, 2, 3].map((r) => ({ rank: r, argument: `A${r}`, mechanism: "M", claim_codes: ["C1"] }))),
    JSON.stringify([{ question: "P9 question?", why_unresolved: "W", decision_critical: true }]),
    JSON.stringify([
      { criterion: "Fewer than 20 customers by 2027", outcome_check: "List", claim_codes: ["C1"], uncertainty_codes: ["U2"] },
      { criterion: "Price below EUR 2,000", outcome_check: "Contracts", claim_codes: ["C2"] },
    ]),
  ]);
  await h.query(`update evaluations set status = 'scoring', current_step = 5 where id = $1`, [evaluationId]);
  const a = (dimension_id, prompt) => ({
    dimension_id,
    answers: [{ prompt_id: prompt, prompt: "P", answer: "A", claim_codes: ["C1"] }],
    counter_signal: "CS",
    proposed_score: 3,
    claim_codes: ["C1", "C2"],
  });
  await h.svc(`select record_dimension_assessments($1, $2, $3::jsonb, '{}', '{}')`, [
    evaluationId,
    await run(5),
    JSON.stringify([a(team, teamPrompt), a(moat, moatPrompt)]),
  ]);
  await h.query(`update evaluations set status = 'synthesizing', current_step = 6 where id = $1`, [evaluationId]);
  await h.svc(`select record_synthesis($1, $2, $3::jsonb, 'watch', '{}'::jsonb, 'T', '{}', '{}')`, [
    evaluationId,
    await run(6),
    JSON.stringify([{ document: "thesis_card", section: "thesis", position: 1, text: "T", claim_codes: ["C1"] }]),
  ]);
}

before(async () => {
  h = await createDb();
  ({ uid, evaluationId } = await h.seedDeal("ann@test"));
  const s1 = await h.addSource(evaluationId, "primary", "Nordwind");
  const s2 = await h.addSource(evaluationId, "secondary", "Windpower Weekly");
  await run(2);
  const c1 = await h.addFact(evaluationId, [s1], "Nordwind serves 12 paying customers.");
  const c2 = await h.addFact(evaluationId, [s2], "Nordwind works with eight customers.");
  await h.query(
    `insert into conflicts (evaluation_id, code, kind, side_a_id, side_b_id, description, passage_a, passage_b)
     values ($1, 'CR0', 'source', $2, $3, 'counts differ', '12', 'eight'), ($1, 'CR0', 'claim', $4, $5, 'counts differ', '12', 'eight')`,
    [evaluationId, s1, s2, c1, c2],
  );
  const [{ id: p7 }] = await h.query(
    `select p.id from collection_prompts p join evaluations e on e.config_id = p.config_id where e.id = $1 and p.position = 7`,
    [evaluationId],
  );
  await h.query(
    `insert into uncertainties (evaluation_id, code, question, why_unresolved, decision_critical, from_prompt_id) values ($1, 'U0', 'R2 question?', 'W', true, $2)`,
    [evaluationId, p7],
  );
  await run(3);
  const dims = await h.query(
    `select d.id, (select p.id from dimension_prompts p where p.dimension_id = d.id order by p.position limit 1) prompt
     from dimensions d join evaluations e on e.config_id = d.config_id where e.id = $1 order by d.position`,
    [evaluationId],
  );
  [team, moat] = dims.map((d) => d.id);
  [teamPrompt, moatPrompt] = dims.map((d) => d.prompt);
  await stepsFourToSix();
});

test("once outputs exist, a re-run needs a full-reset confirmation", async () => {
  await assert.rejects(reset(4), /confirm a full reset/);
  assert.equal(await count("decisions"), 1);
});

test("only steps 2–6 can be re-run, and not while a run is active", async () => {
  await assert.rejects(reset(1, true), /only steps 2 to 6/);
  const [{ id }] = await h.query(`insert into pipeline_runs (evaluation_id, step, status) values ($1, 6, 'running') returning id`, [evaluationId]);
  await assert.rejects(reset(6, true), /run is in progress/);
  await h.query(`update pipeline_runs set status = 'failed' where id = $1`, [id]);
});

test("re-running step 4 clears steps 4–6 and keeps steps 2–3", async () => {
  const [{ cleared }] = await reset(4, true);
  assert.equal(cleared.counter_arguments, 3);
  assert.equal(cleared.uncertainties_p9, 1);
  assert.deepEqual(
    await Promise.all([count("counter_arguments"), count("falsifiers"), count("dimension_assessments"), count("statements"), count("decisions")]),
    [0, 0, 0, 0, 0],
  );
  assert.deepEqual(await Promise.all([count("sources"), count("claims"), count("conflicts"), count("uncertainties")]), [2, 2, 2, 1]);
  const [e] = await h.query(`select status, current_step from evaluations where id = $1`, [evaluationId]);
  assert.deepEqual([e.status, e.current_step], ["stress_testing", 4]);
  const runs = await h.query(`select step, superseded_at is not null superseded from pipeline_runs where evaluation_id = $1 order by step`, [evaluationId]);
  assert.ok(runs.filter((r) => r.step >= 4).every((r) => r.superseded));
  assert.ok(runs.filter((r) => r.step < 4).every((r) => !r.superseded));
  const [log] = await h.query(`select actor_id, after from analyst_actions where action = 'pipeline.reset'`);
  assert.equal(log.actor_id, uid);
  assert.equal(log.after.rerun_from_step, 4);
});

test("the next run renumbers: P9 U# continue after the step-3 ones, F# and D# restart", async () => {
  await stepsFourToSix();
  const us = await h.query(`select code, question from uncertainties where evaluation_id = $1 order by code`, [evaluationId]);
  assert.deepEqual(us.map((u) => `${u.code}:${u.question}`), ["U1:R2 question?", "U2:P9 question?"]);
  const fs = await h.query(`select code from falsifiers where evaluation_id = $1 order by code`, [evaluationId]);
  assert.deepEqual(fs.map((f) => f.code), ["F1", "F2"]);
  const ds = await h.query(`select code from dimension_assessments where evaluation_id = $1 order by code`, [evaluationId]);
  assert.deepEqual(ds.map((d) => d.code), ["D1", "D2"]);
});

test("re-running step 3 clears claims, claim conflicts and all uncertainties; source conflicts stay", async () => {
  await reset(3, true);
  assert.deepEqual(
    await Promise.all([count("claims"), count("uncertainties"), count("conflicts", "and kind = 'claim'"), count("conflicts", "and kind = 'source'"), count("sources")]),
    [0, 0, 0, 1, 2],
  );
  const [e] = await h.query(`select status, current_step from evaluations where id = $1`, [evaluationId]);
  assert.deepEqual([e.status, e.current_step], ["extracting", 3]);
});

test("a step not yet reached cannot be re-run", async () => {
  await assert.rejects(reset(5), /has not been reached/);
});

test("re-running from 2b clears the Source Table and reopens collection", async () => {
  await reset(2);
  assert.deepEqual(await Promise.all([count("sources"), count("conflicts")]), [0, 0]);
  const [e] = await h.query(`select status, current_step from evaluations where id = $1`, [evaluationId]);
  assert.deepEqual([e.status, e.current_step], ["collecting", 2]);
});

test("analysts cannot call reset_from_step directly", async () => {
  await assert.rejects(h.as(uid, `select reset_from_step($1, 2, true, $2)`, [evaluationId, uid]), /permission denied/);
});
