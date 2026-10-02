// M12 in the database: dimension assessments (D#) cite claims within the
// sufficiency range, the score cap from open prompt-derived U#, and analyst
// overrides. Run: npm test
import assert from "node:assert/strict";
import { before, test } from "node:test";
import { createDb } from "./harness.mjs";

let h, uid, evaluationId, other, run, team, moat, teamPrompt, moatPrompt;

const answers = (promptId, codes = ["C1"]) => [{ prompt_id: promptId, prompt: "Prompt", answer: "Answer.", claim_codes: codes }];
const assessment = (dimension_id, prompt, score, codes) => ({
  dimension_id,
  answers: answers(prompt),
  counter_signal: "The strongest counter-signal.",
  proposed_score: score,
  claim_codes: codes,
});
const record = (items, ev = evaluationId) =>
  h.svc(`select record_dimension_assessments($1, $2, $3::jsonb, '{}', '{}') as n`, [ev, run, JSON.stringify(items)]);

before(async () => {
  h = await createDb();
  ({ uid, evaluationId } = await h.seedDeal("ann@test"));
  other = await h.seedDeal("xi@test");
  const s = await h.addSource(evaluationId, "primary", "Nordwind");
  for (let i = 1; i <= 6; i++) await h.addFact(evaluationId, [s], `Fact ${i}.`); // C1..C6
  const dims = await h.query(
    `select d.id, d.position, (select p.id from dimension_prompts p where p.dimension_id = d.id order by p.position limit 1) prompt
     from dimensions d join evaluations e on e.config_id = d.config_id where e.id = $1 order by d.position`,
    [evaluationId],
  );
  [team, moat] = dims.map((d) => d.id);
  [teamPrompt, moatPrompt] = dims.map((d) => d.prompt);
  // The Moat dimension requires Collection Prompt 7; make it an open U#.
  const [{ id: p7 }] = await h.query(
    `select p.id from collection_prompts p join evaluations e on e.config_id = p.config_id where e.id = $1 and p.position = 7`,
    [evaluationId],
  );
  await h.query(
    `insert into uncertainties (evaluation_id, code, question, why_unresolved, decision_critical, from_prompt_id)
     values ($1, 'U0', 'Who are the competitors?', 'No source covers competition.', true, $2)`,
    [evaluationId, p7],
  );
  [{ id: run }] = await h.query(`insert into pipeline_runs (evaluation_id, step, status) values ($1, 5, 'running') returning id`, [evaluationId]);
});

test("a score citing one claim fails at commit (plan M12 test 5)", async () => {
  await assert.rejects(
    record([assessment(team, teamPrompt, 4, ["C1"]), assessment(moat, moatPrompt, 3, ["C2", "C3"])]),
    /must cite 2 to 5 claims \(got 1\)/,
  );
  assert.equal((await h.query(`select count(*)::int n from dimension_assessments`))[0].n, 0);
});

test("a score citing six claims fails", async () => {
  await assert.rejects(
    record([assessment(team, teamPrompt, 4, ["C1", "C2", "C3", "C4", "C5", "C6"]), assessment(moat, moatPrompt, 3, ["C2", "C3"])]),
    /must cite 2 to 5 claims \(got 6\)/,
  );
});

test("every dimension must be assessed exactly once", async () => {
  await assert.rejects(record([assessment(team, teamPrompt, 4, ["C1", "C2"])]), /every dimension/);
  await assert.rejects(
    record([assessment(team, teamPrompt, 4, ["C1", "C2"]), assessment(team, teamPrompt, 4, ["C1", "C2"])]),
    /every dimension/,
  );
});

test("unknown claim codes in answers are rejected", async () => {
  const bad = assessment(team, teamPrompt, 4, ["C1", "C2"]);
  bad.answers = answers(teamPrompt, ["C42"]);
  await assert.rejects(record([bad, assessment(moat, moatPrompt, 3, ["C2", "C3"])]), /unknown claim C42/);
});

test("records D# in dimension order and caps a score by the open U# of a required prompt", async () => {
  // listed out of order on purpose
  await record([assessment(moat, moatPrompt, 4, ["C3", "C4"]), assessment(team, teamPrompt, 4, ["C1", "C2", "C3"])]);
  const rows = await h.query(
    `select a.code, a.proposed_score, a.score, u.code capped_by from dimension_assessments a
     left join uncertainties u on u.id = a.score_capped_by where a.evaluation_id = $1 order by a.code`,
    [evaluationId],
  );
  assert.deepEqual(
    rows.map((r) => `${r.code}:${r.proposed_score}->${r.score}:${r.capped_by}`),
    ["D1:4->4:null", "D2:4->2:U1"],
  );
});

test("a second step-5 write is rejected", async () => {
  await assert.rejects(record([]), /already has dimension scores/);
});

test("removing a cited claim below the minimum fails at commit", async () => {
  await assert.rejects(
    h.exec(`begin; delete from dimension_assessment_claims where assessment_id = (select id from dimension_assessments where code = 'D2') and claim_id = (select id from claims where code = 'C3'); commit;`),
    /must cite 2 to 5 claims/,
  );
});

test("an analyst overrides a score: original kept, stamped, logged; scores themselves are fixed", async () => {
  await h.as(uid, `update dimension_assessments set override_score = 3, override_reason = 'Pilot data in the data room.' where code = 'D2'`);
  const [row] = await h.query(`select score, override_score, override_by, override_at from dimension_assessments where code = 'D2'`);
  assert.equal(row.score, 2);
  assert.equal(row.override_score, 3);
  assert.equal(row.override_by, uid);
  assert.ok(row.override_at);
  const logged = await h.query(`select action, before, after from analyst_actions where target_table = 'dimension_assessments'`);
  assert.equal(logged.length, 1);
  assert.equal(logged[0].action, "dimension.score_overridden");
  assert.equal(logged[0].after.override_score, 3);
  await assert.rejects(h.as(uid, `update dimension_assessments set score = 5 where code = 'D2'`), /permission denied/);
  await assert.rejects(h.as(uid, `update dimension_assessments set override_by = null where code = 'D2'`), /permission denied/);
  await assert.rejects(h.as(uid, `update dimension_assessments set override_score = 6 where code = 'D2'`), /check constraint/);
});

test("clearing an override is logged", async () => {
  await h.as(uid, `update dimension_assessments set override_score = null where code = 'D2'`);
  const [row] = await h.query(`select override_score, override_reason, override_by from dimension_assessments where code = 'D2'`);
  assert.deepEqual([row.override_score, row.override_reason, row.override_by], [null, null, null]);
  assert.equal((await h.query(`select count(*)::int n from analyst_actions where action = 'dimension.override_cleared'`))[0].n, 1);
});

test("another fund sees and changes nothing", async () => {
  assert.equal((await h.as(other.uid, `select count(*)::int n from dimension_assessments`))[0].n, 0);
  assert.equal((await h.as(other.uid, `update dimension_assessments set override_score = 0 returning id`)).length, 0);
});

test("deleting the fund removes its assessments", async () => {
  const [{ fund_id }] = await h.query(`select fund_id from evaluations where id = $1`, [evaluationId]);
  await h.query(`delete from profiles where fund_id = $1`, [fund_id]);
  await h.query(`delete from funds where id = $1`, [fund_id]);
  assert.equal((await h.query(`select count(*)::int n from dimension_assessments`))[0].n, 0);
});
