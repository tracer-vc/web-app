// Unit tests for the verbatim-excerpt check (R4). Run: npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { checkClaimExcerpts, ExcerptIndex, findExcerpt, sliceCodePoints } from "./excerpt.ts";

const text = "Traction\n\nWe currently  serve 12 paying customers across Germany and Denmark — and “growing”.";

test("finds an excerpt despite case, whitespace and typographic quotes, with code-point offsets", () => {
  const span = findExcerpt(text, 'we currently serve 12 paying customers');
  assert.deepEqual(span, { start: 10, end: 49 });
  assert.equal(sliceCodePoints(text, span.start, span.end), "We currently  serve 12 paying customers");
  assert.ok(findExcerpt(text, 'Denmark - and "growing".'));
});

test("offsets count code points, not UTF-16 units", () => {
  const t = "🚀 Launch: 3 pilots signed.";
  const span = findExcerpt(t, "3 pilots signed");
  assert.deepEqual(span, { start: 10, end: 25 });
  assert.equal(sliceCodePoints(t, span.start, span.end), "3 pilots signed");
});

test("a paraphrased excerpt is rejected (plan M9 test 6)", () => {
  // P5 output with one verbatim and one paraphrased excerpt
  const claims = [
    { statement: "Nordwind has 12 paying customers.", type: "fact", excerpt: "serve 12 paying customers" },
    { statement: "Nordwind sells in two countries.", type: "fact", excerpt: "customers in Germany and Denmark" },
    { statement: "Nordwind could lead the market.", type: "speculation", excerpt: "" },
    { statement: "Growth is strong.", type: "inference", excerpt: "" },
  ];
  const { kept, rejected } = checkClaimExcerpts(new ExcerptIndex(text), claims);
  assert.deepEqual(kept.map((c) => c.statement), ["Nordwind has 12 paying customers.", "Nordwind could lead the market."]);
  assert.equal(kept[0].verbatim, "serve 12 paying customers");
  assert.equal(kept[1].span, null);
  assert.deepEqual(
    rejected.map((c) => c.reason),
    ["excerpt not found verbatim in the source", "a inference needs a verbatim excerpt"],
  );
});

test("a speculation with an excerpt is rejected", () => {
  const { rejected } = checkClaimExcerpts(new ExcerptIndex(text), [{ type: "speculation", excerpt: "12 paying" }]);
  assert.equal(rejected.length, 1);
});
