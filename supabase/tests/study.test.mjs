// M15 in the database: study copies of a deal and baseline memos (admin-only).
// Run: npm test
import assert from "node:assert/strict";
import { before, test } from "node:test";
import { createDb } from "./harness.mjs";

let h, uid, evaluationId, other, analyst;

before(async () => {
  h = await createDb();
  ({ uid, evaluationId } = await h.seedDeal("ann@test"));
  other = await h.seedDeal("xi@test");
  // an analyst in Ann's fund
  analyst = crypto.randomUUID();
  await h.query(`insert into auth.users (id, email, email_confirmed_at) values ($1, 'an@test', now())`, [analyst]);
  const [{ fund_id }] = await h.query(`select fund_id from profiles where id = $1`, [uid]);
  await h.query(`update profiles set fund_id = $2, role = 'analyst' where id = $1`, [analyst, fund_id]).catch(async () => {
    await h.query(`insert into profiles (id, fund_id, display_name, role) values ($1, $2, 'An', 'analyst')`, [analyst, fund_id]);
  });
  if (!(await h.query(`select 1 from profiles where id = $1`, [analyst])).length) {
    await h.query(`insert into profiles (id, fund_id, display_name, role) values ($1, $2, 'An', 'analyst')`, [analyst, fund_id]);
  }
  // Quick Screen that proceeds
  const qs = await h.query(
    `select q.id from quick_screen_questions q join evaluations e on e.config_id = q.config_id where e.id = $1`,
    [evaluationId],
  );
  await h.query(`update evaluations set status = 'screening', current_step = 1 where id = $1`, [evaluationId]);
  await h.svc(`select record_quick_screen($1, null, null, $2::jsonb, $3::jsonb)`, [
    evaluationId,
    JSON.stringify(qs.map((q) => ({ question_id: q.id, answer: "A." }))),
    JSON.stringify({ thesis: "T", verdict: "proceed", justification: "J", uncertainties: ["A?", "B?"] }),
  ]);
});

test("a study copy keeps company, config and Quick Screen and lands in Evidence Collection", async () => {
  const [{ id }] = await h.svc(`select create_study_copy($1, $2) as id`, [evaluationId, uid]);
  const [c] = await h.query(
    `select c.status, c.current_step, c.study_run, c.config_id = p.config_id same_config, c.company_id = p.company_id same_company
     from evaluations c join evaluations p on p.id = c.study_parent_id where c.id = $1`,
    [id],
  );
  assert.deepEqual([c.status, c.current_step, c.study_run, c.same_config, c.same_company], ["collecting", 2, 2, true, true]);
  const [{ n }] = await h.query(`select count(*)::int n from quick_screen_answers where evaluation_id = $1`, [id]);
  assert.ok(n > 0);
  const [m] = await h.query(`select preliminary_thesis, verdict from quick_screen_memos where evaluation_id = $1`, [id]);
  assert.deepEqual([m.preliminary_thesis, m.verdict], ["T", "proceed"]);
  const [{ id: third }] = await h.svc(`select create_study_copy($1, $2) as id`, [evaluationId, uid]);
  assert.equal((await h.query(`select study_run from evaluations where id = $1`, [third]))[0].study_run, 3);
});

test("a copy keeps an older config version after a newer one is published", async () => {
  const [{ config_id }] = await h.query(`select config_id from evaluations where id = $1`, [evaluationId]);
  await h.query(`update framework_configs set is_active = false where id = $1`, [config_id]).catch(() => {});
  const [{ id }] = await h.svc(`select create_study_copy($1, $2) as id`, [evaluationId, uid]);
  assert.equal((await h.query(`select config_id from evaluations where id = $1`, [id]))[0].config_id, config_id);
  await h.query(`update framework_configs set is_active = true where id = $1`, [config_id]).catch(() => {});
});

test("copies of copies are refused; study columns cannot change", async () => {
  const [{ id }] = await h.query(`select id from evaluations where study_parent_id = $1 limit 1`, [evaluationId]);
  await assert.rejects(h.svc(`select create_study_copy($1, $2)`, [id, uid]), /copy the original deal/);
  await assert.rejects(h.svc(`update evaluations set study_run = 9 where id = $1`, [id]), /cannot change/);
});

test("analysts cannot create copies or baseline memos directly", async () => {
  await assert.rejects(h.as(uid, `select create_study_copy($1, $2)`, [evaluationId, uid]), /permission denied/);
  await assert.rejects(h.as(uid, `insert into baseline_memos (evaluation_id, run_number) values ($1, 1)`, [evaluationId]), /permission denied/);
});

test("baseline memos are numbered per deal and readable by fund admins only", async () => {
  await h.svc(`insert into baseline_memos (evaluation_id, run_number) values ($1, 0), ($1, 0)`, [evaluationId]);
  const runs = await h.query(`select run_number from baseline_memos where evaluation_id = $1 order by run_number`, [evaluationId]);
  assert.deepEqual(runs.map((r) => r.run_number), [1, 2]);
  assert.equal((await h.as(uid, `select count(*)::int n from baseline_memos`))[0].n, 2);
  assert.ok((await h.as(analyst, `select count(*)::int n from evaluations`))[0].n > 0, "the analyst is a member of the fund");
  assert.equal((await h.as(analyst, `select role from profiles where id = $1`, [analyst]))[0].role, "analyst");
  assert.equal((await h.as(analyst, `select count(*)::int n from baseline_memos`))[0].n, 0);
  assert.equal((await h.as(other.uid, `select count(*)::int n from baseline_memos`))[0].n, 0);
});

test("a finished baseline memo needs content and a recommendation", async () => {
  await assert.rejects(
    h.svc(`update baseline_memos set status = 'done' where evaluation_id = $1 and run_number = 1`, [evaluationId]),
    /done_has_memo/,
  );
  await h.svc(
    `update baseline_memos set status = 'done', content = '{"thesis":{"text":"T","refs":[1]}}', recommendation = 'watch' where evaluation_id = $1 and run_number = 1`,
    [evaluationId],
  );
});
