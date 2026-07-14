// Rendering and the exit-code gate: the text report's shape, the JSON
// document's structure, and byte-identical determinism across runs.
import test from "node:test";
import assert from "node:assert/strict";

import { diffSchemas, gateTrips, renderDiffText, renderJson, VERSION } from "../dist/index.js";

const OLD = {
  type: "object",
  additionalProperties: false,
  required: ["a"],
  properties: { a: { type: "string" }, b: { enum: ["x", "y"] } },
};
const NEW = {
  type: "object",
  additionalProperties: false,
  required: ["a", "b"],
  properties: { a: { type: "string", format: "uuid" }, b: { enum: ["x"] } },
};
const INFO = { source: "old.json", dialect: "no $schema" };
const INFO2 = { source: "new.json", dialect: "no $schema" };

test("the text report carries all three sections, marks, and a verdict", () => {
  const report = diffSchemas(OLD, NEW);
  const text = renderDiffText(report, INFO, INFO2);
  assert.match(text, new RegExp(`^schemver ${VERSION.replace(/\./g, "\\.")}`));
  assert.match(text, /BREAKING \(2\)/);
  assert.match(text, /RISKY \(1\)/);
  assert.match(text, /ADDITIVE \(0\)/);
  assert.match(text, / {2}! \/b/);
  assert.match(text, /verdict: MAJOR — 2 breaking, 1 risky, 0 additive \(mode: backward\)/);
});

test("an empty diff renders a NONE verdict; the root path renders as (root)", () => {
  const empty = renderDiffText(diffSchemas(OLD, OLD), INFO, INFO2);
  assert.match(empty, /BREAKING \(0\)\n {2}none/);
  assert.match(empty, /verdict: NONE — the schemas accept the same instances/);
  const root = diffSchemas({ type: "object" }, { type: "string" });
  assert.match(renderDiffText(root, INFO, INFO2), /\(root\)/);
});

test("renderJson is valid JSON with the documented top-level shape", () => {
  const report = diffSchemas(OLD, NEW);
  const doc = JSON.parse(renderJson(report, INFO, INFO2, { gate: { failOn: "breaking", trips: true } }));
  assert.equal(doc.tool, "schemver");
  assert.equal(doc.version, VERSION);
  assert.equal(doc.mode, "backward");
  assert.equal(doc.bump, "major");
  assert.deepEqual(doc.summary, { breaking: 2, risky: 1, additive: 0 });
  assert.equal(doc.changes.length, 3);
  for (const change of doc.changes) {
    for (const key of ["code", "path", "schemaPath", "keyword", "effect", "severity", "reason"]) {
      assert.ok(key in change, `change missing ${key}`);
    }
  }
  assert.deepEqual(doc.gate, { failOn: "breaking", trips: true });
});

test("identical inputs render byte-identical text and JSON", () => {
  const a = diffSchemas(OLD, NEW);
  const b = diffSchemas(OLD, NEW);
  assert.equal(renderDiffText(a, INFO, INFO2), renderDiffText(b, INFO, INFO2));
  assert.equal(renderJson(a, INFO, INFO2), renderJson(b, INFO, INFO2));
});

test("gateTrips honors each --fail-on level", () => {
  const breaking = diffSchemas(OLD, NEW);
  const riskyOnly = diffSchemas({ format: "email" }, { format: "uri" });
  const additiveOnly = diffSchemas({ type: "string" }, { type: "string", description: "d" });
  const empty = diffSchemas(OLD, OLD);
  assert.equal(gateTrips(breaking, "breaking"), true);
  assert.equal(gateTrips(riskyOnly, "breaking"), false);
  assert.equal(gateTrips(riskyOnly, "risky"), true);
  assert.equal(gateTrips(additiveOnly, "risky"), false);
  assert.equal(gateTrips(additiveOnly, "any"), true);
  assert.equal(gateTrips(empty, "any"), false);
  assert.equal(gateTrips(breaking, "none"), false);
});
