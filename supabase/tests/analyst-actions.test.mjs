// M10 in the database: conflict resolution, "mark link as wrong", tier/party
// edits, each logged and followed by an R1 recompute. Run: npm test
import assert from "node:assert/strict";
import { before, test } from "node:test";
import { createDb } from "./harness.mjs";

let h, uid, evaluationId, other, s1, s2, cA, cB, cr;
const confidence = async (id) => (await h.query(`select confidence, confidence_basis from claims where id = $1`, [id]))[0];
const actions = async (action) => h.query(`select * from analyst_actions where action = $1 order by created_at`, [action]);

before(async () => {
  h = await createDb();
  ({ uid, evaluationId } = await h.seedDeal("ann@test"));
  other = await h.seedDeal("xi@test");
  s1 = await h.addSource(evaluationId, "primary", "Nordwind");
  s2 = await h.addSource(evaluationId, "secondary", "Windpower Weekly");
  cA = await h.addFact(evaluationId, [s1], "Nordwind serves 12 paying customers.");
  cB = await h.addFact(evaluationId, [s2], "Nordwind works with eight customers.");
  [{ id: cr }] = await h.query(
    `insert into conflicts (evaluation_id, code, kind, side_a_id, side_b_id, description, passage_a, passage_b)
     values ($1, 'CR0', 'claim', $2, $3, 'customers differ', '12', 'eight') returning id`,
    [evaluationId, cA, cB],
  );
  await h.query(`select private.recompute_confidence($1), private.recompute_confidence($2)`, [cA, cB]);
});

test("both sides of an open claim conflict are downgraded", async () => {
  assert.equal((await confidence(cA)).confidence, "low");
  assert.equal((await confidence(cB)).confidence, "low");
});

test("resolving without a rationale is rejected", async () => {
  await assert.rejects(h.as(uid, `update conflicts set status = 'resolved_b' where id = $1`, [cr]), /resolution_is_explained/);
  await assert.rejects(
    h.as(uid, `update conflicts set status = 'resolved_b', rationale = '   ' where id = $1`, [cr]),
    /resolution_is_explained/,
  );
});

test("the analyst cannot set who resolved it", async () => {
  await assert.rejects(h.as(uid, `update conflicts set resolved_by = $2 where id = $1`, [cr, uid]), /permission denied/);
});

test("resolving for side B stamps author and time, logs it and lifts the downgrade", async () => {
  await h.as(uid, `update conflicts set status = 'resolved_b', rationale = 'Press figure is later and independent.' where id = $1`, [cr]);
  const [row] = await h.query(`select status, resolved_by, resolved_at from conflicts where id = $1`, [cr]);
  assert.equal(row.status, "resolved_b");
  assert.equal(row.resolved_by, uid);
  assert.ok(row.resolved_at);
  const logged = await actions("conflict.resolved");
  assert.equal(logged.length, 1);
  assert.equal(logged[0].actor_id, uid);
  assert.equal(logged[0].after.status, "resolved_b");
  const a = await confidence(cA);
  assert.equal(a.confidence, "medium");
  assert.equal(a.confidence_basis.rule, "Medium: one Primary party (Nordwind)");
  assert.equal((await confidence(cB)).confidence, "medium");
});

test("reopening clears the author and downgrades again", async () => {
  await h.as(uid, `update conflicts set status = 'open' where id = $1`, [cr]);
  const [row] = await h.query(`select resolved_by, resolved_at, rationale from conflicts where id = $1`, [cr]);
  assert.equal(row.resolved_by, null);
  assert.equal(row.resolved_at, null);
  assert.equal((await confidence(cA)).confidence, "low");
  assert.equal((await actions("conflict.reopened")).length, 1);
  await h.as(uid, `update conflicts set status = 'unresolvable', rationale = 'Dates unknown.' where id = $1`, [cr]);
});

test("a conflict's sides cannot change", async () => {
  await assert.rejects(h.as(uid, `update conflicts set side_a_id = $2 where id = $1`, [cr, cB]), /permission denied/);
});

test("marking a link wrong keeps it, stamps it, logs it and recomputes", async () => {
  const c = await h.addFact(evaluationId, [s1, s2], "Nordwind charges per turbine.");
  await h.query(`select private.recompute_confidence($1)`, [c]);
  assert.equal((await confidence(c)).confidence, "high");
  const [{ id: link }] = await h.query(`select id from claim_sources where claim_id = $1 and source_id = $2`, [c, s2]);
  await h.as(uid, `update claim_sources set marked_wrong_at = '2000-01-01' where id = $1`, [link]);
  const [row] = await h.query(`select marked_wrong_by, marked_wrong_at from claim_sources where id = $1`, [link]);
  assert.equal(row.marked_wrong_by, uid);
  assert.ok(new Date(row.marked_wrong_at).getFullYear() > 2000, "time stamped by the database");
  assert.equal((await confidence(c)).confidence, "medium");
  assert.equal((await actions("link.marked_wrong")).length, 1);
  await assert.rejects(h.as(uid, `update claim_sources set excerpt = 'x' where id = $1`, [link]), /permission denied/);
  await assert.rejects(h.as(uid, `delete from claim_sources where id = $1`, [link]), /permission denied/);
  // unmark
  await h.as(uid, `update claim_sources set marked_wrong_at = null where id = $1`, [link]);
  assert.equal((await confidence(c)).confidence, "high");
  assert.equal((await actions("link.unmarked")).length, 1);
});

test("a tier edit recomputes every claim citing the source", async () => {
  await h.as(uid, `update sources set tier = 'tertiary' where id = $1`, [s1]);
  const a = await confidence(cA);
  assert.equal(a.confidence, "low");
  assert.equal(a.confidence_basis.rule, "Low: one Tertiary party (Nordwind)");
  await h.as(uid, `update sources set tier = 'primary' where id = $1`, [s1]);
  assert.equal((await confidence(cA)).confidence, "medium");
});

test("a party edit merging two parties lowers independence", async () => {
  const c = await h.addFact(evaluationId, [s1, s2], "Nordwind prices per turbine.");
  await h.query(`select private.recompute_confidence($1)`, [c]);
  assert.equal((await confidence(c)).confidence, "high");
  await h.as(uid, `update sources set party = 'Nordwind' where id = $1`, [s2]);
  assert.equal((await confidence(c)).confidence, "medium");
  await h.as(uid, `update sources set party = 'Windpower Weekly' where id = $1`, [s2]);
});

test("another fund's analyst can neither see nor change them", async () => {
  const rows = await h.as(other.uid, `update conflicts set status = 'resolved_a', rationale = 'x' where id = $1 returning id`, [cr]);
  assert.equal(rows.length, 0);
  const links = await h.as(other.uid, `update claim_sources set marked_wrong_at = now() returning id`);
  assert.equal(links.length, 0);
  assert.equal((await h.as(other.uid, `select count(*)::int n from conflicts`))[0].n, 0);
});

test("the service role still writes without stamping", async () => {
  await h.svc(`update conflicts set rationale = 'Dates unknown; both kept.' where id = $1`, [cr]);
  const [row] = await h.query(`select resolved_by from conflicts where id = $1`, [cr]);
  assert.equal(row.resolved_by, uid);
});
