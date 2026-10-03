// Decision 45 in the database: visual content is appended to a document's
// text (never rewritten), blocks lie inside the text, images live next to the
// document, and the text is frozen once the Source Table exists. Run: npm test
import assert from "node:assert/strict";
import { before, test } from "node:test";
import { createDb } from "./harness.mjs";

let h, uid, evaluationId, fundId, other;
const doc = async (status, text) => {
  const id = crypto.randomUUID();
  await h.query(
    `insert into documents (id, evaluation_id, storage_path, filename, mime_type, bytes, extracted_text, extraction_status)
     values ($1, $2, $3, 'deck.pdf', 'application/pdf', 100, $4, $5)`,
    [id, evaluationId, `${fundId}/${evaluationId}/${id}.pdf`, text, status],
  );
  return id;
};
const record = (id, text, visuals, status = "done") =>
  h.svc(`select record_document_visuals($1, $2, $3::jsonb, $4, null, '1 of 1 images read') as n`, [id, text, JSON.stringify(visuals), status]);
const cp = (s) => Array.from(s).length;

before(async () => {
  h = await createDb();
  ({ uid, evaluationId } = await h.seedDeal("ann@test"));
  other = await h.seedDeal("xi@test");
  [{ fund_id: fundId }] = await h.query(`select fund_id from evaluations where id = $1`, [evaluationId]);
  await h.query(`update evaluations set status = 'collecting', current_step = 2 where id = $1`, [evaluationId]);
});

test("visual content is appended and located by its offsets", async () => {
  const id = await doc("extracted", "Traction slide.");
  const header = "\n\n[Slide 1 · image 1 — AI transcription]\n";
  const body = "Turbines under monitoring: Q1 25: 60; Q4 25: 340.";
  const text = "Traction slide." + header + body;
  const start = cp("Traction slide." + header);
  await record(id, text, [
    { position: 1, kind: "image", locator: "Slide 1 · image 1", storage_path: `${fundId}/${evaluationId}/visuals/${id}/1.png`, mime_type: "image/png", informative: true, transcription: body, text_start: start, text_end: start + cp(body) },
    { position: 2, kind: "image", locator: "Slide 1 · image 2", storage_path: `${fundId}/${evaluationId}/visuals/${id}/2.png`, mime_type: "image/png", informative: false },
  ]);
  const [d] = await h.query(`select extracted_text, extraction_status, visual_status, visual_summary from documents where id = $1`, [id]);
  assert.equal(d.extracted_text, text);
  assert.deepEqual([d.extraction_status, d.visual_status], ["extracted", "done"]);
  const [v] = await h.query(`select substr(d.extracted_text, v.text_start + 1, v.text_end - v.text_start) block from document_visuals v join documents d on d.id = v.document_id where v.document_id = $1 and v.position = 1`, [id]);
  assert.equal(v.block, body);
});

test("an image-only document becomes usable once its images are read", async () => {
  const id = await doc("no_text", null);
  const text = "[Page 1 — AI transcription]\nNordwind Sentinel live on 340 turbines.";
  await record(id, text, [{ position: 1, kind: "page", locator: "Page 1", storage_path: `${fundId}/${evaluationId}/visuals/${id}/p1.png`, mime_type: "image/png", informative: true, transcription: "Nordwind Sentinel live on 340 turbines.", text_start: 28, text_end: 67 }]);
  const [d] = await h.query(`select extraction_status from documents where id = $1`, [id]);
  assert.equal(d.extraction_status, "extracted");
});

test("the existing text can't be rewritten, only appended to", async () => {
  const id = await doc("extracted", "Original text.");
  await assert.rejects(record(id, "Changed text. plus more", []), /only be appended/);
});

test("blocks lie inside the text; images live next to the document; charts carry no image", async () => {
  const id = await doc("extracted", "Text.");
  await assert.rejects(
    record(id, "Text. Block", [{ position: 1, kind: "image", locator: "Image 1", informative: true, transcription: "Block", text_start: 6, text_end: 99 }]),
    /inside the document text/,
  );
  await assert.rejects(
    record(id, "Text. Block", [{ position: 1, kind: "image", locator: "Image 1", storage_path: `${fundId}/${evaluationId}/elsewhere.png`, informative: true, transcription: "Block", text_start: 6, text_end: 11 }]),
    /stored under/,
  );
  await assert.rejects(
    record(id, "Text. Block", [{ position: 1, kind: "chart", locator: "Chart 1", storage_path: `${fundId}/${evaluationId}/visuals/${id}/c.png`, informative: true, transcription: "Block", text_start: 6, text_end: 11 }]),
    /chart_has_no_image/,
  );
  await assert.rejects(
    record(id, "Text. Block", [{ position: 1, kind: "image", locator: "Image 1", informative: true }]),
    /informative_has_block/,
  );
});

test("members read visuals of their fund only and cannot write them", async () => {
  assert.ok((await h.as(uid, `select count(*)::int n from document_visuals`))[0].n >= 2);
  assert.equal((await h.as(other.uid, `select count(*)::int n from document_visuals`))[0].n, 0);
  await assert.rejects(h.as(uid, `update document_visuals set transcription = 'x'`), /permission denied/);
  await assert.rejects(h.as(uid, `select record_document_visuals(gen_random_uuid(), '', '[]', 'done', null, null)`), /permission denied/);
});

test("removing a document removes its visuals", async () => {
  const id = await doc("extracted", "T.");
  await record(id, "T. B", [{ position: 1, kind: "image", locator: "Image 1", storage_path: `${fundId}/${evaluationId}/visuals/${id}/1.png`, informative: true, transcription: "B", text_start: 3, text_end: 4 }]);
  await h.as(uid, `delete from documents where id = $1`, [id]);
  assert.equal((await h.query(`select count(*)::int n from document_visuals where document_id = $1`, [id]))[0].n, 0);
});

test("once the Source Table exists, document text is frozen", async () => {
  const id = await doc("extracted", "Deck text.");
  await h.addSource(evaluationId, "primary", "Nordwind");
  await assert.rejects(record(id, "Deck text. more", []), /cannot change once the Source Table is built/);
  await assert.rejects(h.svc(`update documents set extracted_text = 'x' where id = $1`, [id]), /cannot change once the Source Table is built/);
});
