// R1 in SQL (private.recompute_confidence) against the cases shared with the
// TypeScript implementation (lib/rules/confidence-cases.json). Run: npm test
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { before, test } from "node:test";
import { createDb } from "./harness.mjs";

const { cases } = JSON.parse(readFileSync(new URL("../../lib/rules/confidence-cases.json", import.meta.url), "utf8"));

let h;
let evaluationId;
before(async () => {
  h = await createDb();
  ({ evaluationId } = await h.seedDeal());
});

for (const c of cases) {
  test(`SQL: ${c.name}`, async () => {
    const sourceIds = [];
    for (const s of c.sources) sourceIds.push(await h.addSource(evaluationId, s.tier, s.party));
    const claim = await h.addFact(evaluationId, sourceIds);
    for (const [i, s] of c.sources.entries()) {
      if (s.marked_wrong) await h.query(`update claim_sources set marked_wrong_at = now() where claim_id = $1 and source_id = $2`, [claim, sourceIds[i]]);
    }
    if (c.open_conflict) {
      const other = await h.addFact(evaluationId, [sourceIds[0]], "Nordwind has eight customers.");
      await h.query(
        `insert into conflicts (evaluation_id, code, kind, side_a_id, side_b_id, description, passage_a, passage_b)
         values ($1, 'CR0', 'claim', $2, $3, 'customers differ', '12', 'eight')`,
        [evaluationId, claim, other],
      );
    }
    const [{ level }] = await h.query(`select private.recompute_confidence($1) as level`, [claim]);
    const [row] = await h.query(`select confidence, confidence_basis from claims where id = $1`, [claim]);
    assert.equal(level, c.level);
    assert.equal(row.confidence, c.level);
    assert.equal(row.confidence_basis.rule, c.rule);
    assert.equal(row.confidence_basis.downgraded, / → /.test(c.rule));
  });
}

test("SQL: speculation has no confidence", async () => {
  const [{ id }] = await h.query(
    `insert into claims (evaluation_id, code, statement, type) values ($1, 'C0', 'Could lead the market.', 'speculation') returning id`,
    [evaluationId],
  );
  const [{ level }] = await h.query(`select private.recompute_confidence($1) as level`, [id]);
  assert.equal(level, null);
});
