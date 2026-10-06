// Guided fund setup (decision 47) in the database: a new fund starts with a
// draft v1 and no active config; complete_fund_setup() publishes it. Run: npm test
import assert from "node:assert/strict";
import { before, test } from "node:test";
import { createDb } from "./harness.mjs";

let h, admin, analyst, fundId;
const configs = () => h.query(`select version, status, is_active from framework_configs where fund_id = $1`, [fundId]);
const setupAt = async () => (await h.query(`select setup_completed_at from funds where id = $1`, [fundId]))[0].setup_completed_at;

before(async () => {
  h = await createDb();
  admin = crypto.randomUUID();
  analyst = crypto.randomUUID();
  await h.query(`insert into auth.users (id, email, email_confirmed_at) values ($1, 'ann@test', now()), ($2, 'bo@test', now())`, [
    admin,
    analyst,
  ]);
  [{ create_fund_with_admin: fundId }] = await h.query(`select create_fund_with_admin($1, 'Setup Fund', 'Ann')`, [admin]);
  await h.query(`insert into profiles (id, fund_id, display_name, role) values ($1, $2, 'Bo', 'analyst')`, [analyst, fundId]);
});

test("a new fund starts with a draft v1 and is not set up", async () => {
  assert.deepEqual(await configs(), [{ version: 1, status: "draft", is_active: false }]);
  assert.equal(await setupAt(), null);
});

test("no deal can be created before the setup is finished", async () => {
  await assert.rejects(h.as(admin, `select create_evaluation('Nordwind', '', '', '')`), /no active configuration/);
});

test("an analyst cannot finish the setup", async () => {
  await assert.rejects(h.as(analyst, `select complete_fund_setup()`), /only fund admins/);
  assert.equal(await setupAt(), null);
});

test("the admin finishes the setup: v1 published and active, fund marked, action logged", async () => {
  const [{ complete_fund_setup: version }] = await h.as(admin, `select complete_fund_setup()`);
  assert.equal(version, 1);
  assert.deepEqual(await configs(), [{ version: 1, status: "published", is_active: true }]);
  assert.notEqual(await setupAt(), null);
  const logged = await h.query(`select action from analyst_actions where fund_id = $1 and action = 'fund.setup_completed'`, [fundId]);
  assert.equal(logged.length, 1);
  const [{ create_evaluation: id }] = await h.as(admin, `select create_evaluation('Nordwind', '', '', '')`);
  assert.ok(id);
});

test("the setup cannot be finished twice", async () => {
  await assert.rejects(h.as(admin, `select complete_fund_setup()`), /already set up/);
});
