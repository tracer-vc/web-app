// Unit tests for visual content (decision 45): chart data from Office XML and
// the appended section with its ranges. Run: npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { chartToText, textOf } from "../xml-text.ts";
import { appendVisualSection, SECTION_HEADING } from "./section.ts";

const chartXml = `<c:chartSpace><c:chart><c:title><c:tx><c:rich><a:p><a:r><a:t>Turbines under monitoring</a:t></a:r></a:p></c:rich></c:tx></c:title>
<c:plotArea><c:barChart><c:ser><c:tx><c:strRef><c:strCache><c:pt idx="0"><c:v>Live turbines</c:v></c:pt></c:strCache></c:strRef></c:tx>
<c:cat><c:strRef><c:strCache><c:pt idx="0"><c:v>Q1 25</c:v></c:pt><c:pt idx="1"><c:v>Q2 25</c:v></c:pt></c:strCache></c:strRef></c:cat>
<c:val><c:numRef><c:numCache><c:pt idx="0"><c:v>60</c:v></c:pt><c:pt idx="1"><c:v>120</c:v></c:pt></c:numCache></c:numRef></c:val></c:ser></c:barChart></c:plotArea></c:chart></c:chartSpace>`;

test("native chart data becomes plain sentences", () => {
  assert.equal(
    chartToText(chartXml),
    'Chart "Turbines under monitoring" (data read from the file). Series "Live turbines": Q1 25: 60; Q2 25: 120.',
  );
  assert.equal(chartToText("<c:chartSpace/>"), null);
});

test("slide text keeps paragraphs and decodes entities", () => {
  assert.equal(textOf("<a:p><a:r><a:t>EUR 1.1m &amp; growing</a:t></a:r></a:p><a:p><a:r><a:t>Q4</a:t></a:r></a:p>"), "EUR 1.1m & growing\nQ4");
});

test("the section is appended after the unchanged text, and ranges locate each block", () => {
  const base = "Traction 🚀 slide.";
  const { text, ranges } = appendVisualSection(base, [
    { position: 1, locator: "Slide 1 · image 1", origin: "image", text: "Q4 25: 340 turbines. " },
    { position: 3, locator: "Slide 2 · chart 1", origin: "chart", text: "Series: 60; 120." },
  ]);
  assert.ok(text.startsWith(base + "\n\n" + SECTION_HEADING));
  const chars = Array.from(text);
  assert.deepEqual(
    ranges.map((r) => chars.slice(r.start, r.end).join("")),
    ["Q4 25: 340 turbines.", "Series: 60; 120."],
  );
  assert.ok(text.includes("[Slide 1 · image 1 — AI transcription of the image]"));
  assert.ok(text.includes("[Slide 2 · chart 1 — chart data read from the file]"));
});

test("a document without text (scan, image upload) gets only the section; no blocks leave it unchanged", () => {
  assert.ok(appendVisualSection(null, [{ position: 1, locator: "Page 1", origin: "image", text: "Scanned." }]).text.startsWith(SECTION_HEADING));
  assert.deepEqual(appendVisualSection("Text.", []), { text: "Text.", ranges: [] });
});
