// M13 in the database: statements with typed references (decision 11), the
// source-alongside-claim rule, and the R3 decision. Run: npm test
import assert from "node:assert/strict";
import { before, test } from "node:test";
import { createDb } from "./harness.mjs";

let h, uid, evaluationId, other, run;

const stmt = (o) => ({ document: "thesis_card", position: 1, claim_codes: [], source_codes: [], uncertainty_codes: [], falsifier_codes: [], ...o });
const record = (statements, ev = evaluationId) =>
  h.svc(`select record_synthesis($1, $2, $3::jsonb, 'watch', '{"fired":"watch"}'::jsonb, 'Re-evaluate after Q2 2027.', '{}', '{}') as n`, [
    ev,
    run,
    JSON.stringify(statements),
  ]);
const insertStatement = (section, document = "thesis_card") =>
  `insert into statements (id, evaluation_id, document, section, position, text) values ('11111111-1111-1111-1111-111111111111', '${evaluationId}', '${document}', '${section}', 9, 'Text.');`;

before(async () => {
  h = await createDb();
  ({ uid, evaluationId } = await h.seedDeal("ann@test"));
  other = await h.seedDeal("xi@test");
  const s1 = await h.addSource(evaluationId, "primary", "Nordwind"); // S1
  await h.addSource(evaluationId, "secondary", "Windpower Weekly"); // S2
  await h.addFact(evaluationId, [s1], "Nordwind serves 12 paying customers."); // C1 (cites S1 only)
  await h.query(`insert into uncertainties (evaluation_id, code, question, why_unresolved, decision_critical) values ($1, 'U0', 'Q?', 'W', true)`, [evaluationId]);
  const os = await h.addSource(other.evaluationId, "primary", "Other");
  await h.addFact(other.evaluationId, [os], "Other fact.");
  [{ id: run }] = await h.query(`insert into pipeline_runs (evaluation_id, step, status) values ($1, 6, 'running') returning id`, [evaluationId]);
});

test("a thesis statement without references fails at commit (plan M13 test 6)", async () => {
  await assert.rejects(h.exec(`begin; ${insertStatement("thesis")} commit;`), /thesis statement must cite at least one claim/);
});

test("an open_question statement with only a U# reference succeeds", async () => {
  const [{ id: u1 }] = await h.query(`select id from uncertainties where evaluation_id = $1`, [evaluationId]);
  await h.exec(`begin; ${insertStatement("open_question")}
    insert into statement_refs (statement_id, ref_kind, ref_id) values ('11111111-1111-1111-1111-111111111111', 'uncertainty', '${u1}');
    commit;`);
  await h.exec(`delete from statements where id = '11111111-1111-1111-1111-111111111111'`);
});

test("a research_agenda item without a U# fails, even with a claim", async () => {
  const [{ id: c1 }] = await h.query(`select id from claims where evaluation_id = $1 and code = 'C1'`, [evaluationId]);
  await assert.rejects(
    h.exec(`begin; ${insertStatement("research_agenda", "decision_snapshot")}
      insert into statement_refs (statement_id, ref_kind, ref_id) values ('11111111-1111-1111-1111-111111111111', 'claim', '${c1}');
      commit;`),
    /research_agenda statement must cite at least one uncertainty/,
  );
});

test("a source the cited claim doesn't use is rejected; its own source is fine", async () => {
  await assert.rejects(record([stmt({ section: "thesis", text: "T", claim_codes: ["C1"], source_codes: ["S2"] })]), /next to a claim that cites it/);
  await assert.rejects(record([stmt({ section: "thesis", text: "T", source_codes: ["S1"] })]), /must cite at least one claim/);
});

test("unknown codes and foreign rows are rejected", async () => {
  await assert.rejects(record([stmt({ section: "thesis", text: "T", claim_codes: ["C9"] })]), /unknown claim C9/);
  const [{ id: foreign }] = await h.query(`select id from claims where evaluation_id = $1`, [other.evaluationId]);
  await assert.rejects(
    h.exec(`begin; ${insertStatement("thesis")}
      insert into statement_refs (statement_id, ref_kind, ref_id) values ('11111111-1111-1111-1111-111111111111', 'claim', '${foreign}');
      commit;`),
    /only cite claim of its own evaluation/,
  );
});

test("a section must belong to its document", async () => {
  await assert.rejects(record([stmt({ section: "justification", text: "J", claim_codes: ["C1"] })]), /section_fits_document/);
});

test("records statements, the decision, and completes the evaluation", async () => {
  const [{ n }] = await record([
    stmt({ section: "thesis", text: "Nordwind can become the default layer.", claim_codes: ["C1"], source_codes: ["S1"] }),
    stmt({ section: "base_case", text: "Steady growth.", detail: "Gating: renewals.", claim_codes: ["C1"] }),
    stmt({ document: "decision_snapshot", section: "research_agenda", text: "Q?", detail: "Customer list", uncertainty_codes: ["U1"] }),
    stmt({ document: "decision_snapshot", section: "justification", text: "Watch because…", claim_codes: ["C1"] }),
  ]);
  assert.equal(n, 4);
  const [d] = await h.query(`select classification, rule_trace, reeval_trigger from decisions where evaluation_id = $1`, [evaluationId]);
  assert.equal(d.classification, "watch");
  assert.equal(d.rule_trace.fired, "watch");
  const [e] = await h.query(`select status from evaluations where id = $1`, [evaluationId]);
  assert.equal(e.status, "complete");
  const refs = await h.query(
    `select s.section, r.ref_kind, r.position from statement_refs r join statements s on s.id = r.statement_id where s.section = 'thesis' order by r.ref_kind`,
  );
  assert.deepEqual(refs.map((r) => `${r.ref_kind}:${r.position}`), ["claim:1", "source:1"]);
});

test("a second synthesis is rejected", async () => {
  await assert.rejects(record([]), /already has outputs/);
});

test("removing a statement's only claim reference fails at commit", async () => {
  await assert.rejects(
    h.exec(`begin; delete from statement_refs where statement_id = (select id from statements where section = 'base_case'); commit;`),
    /must cite at least one claim/,
  );
});

test("members read their own fund only and cannot write", async () => {
  assert.equal((await h.as(uid, `select count(*)::int n from statements`))[0].n, 4);
  assert.equal((await h.as(other.uid, `select count(*)::int n from decisions`))[0].n, 0);
  await assert.rejects(h.as(uid, `update statements set text = 'x'`), /permission denied/);
  await assert.rejects(h.as(uid, `update decisions set classification = 'proceed'`), /permission denied/);
});
