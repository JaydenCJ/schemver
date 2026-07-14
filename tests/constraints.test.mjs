// Scalar constraints: types, enums, const, bounds, multipleOf, pattern,
// format. Each test pins the acceptance effect the engine must report —
// these directions are the whole point of the tool, so every one is
// asserted explicitly rather than snapshotted.
import test from "node:test";
import assert from "node:assert/strict";

import { changes, codes, onlyChange } from "./helpers.mjs";

test("identical schemas produce no changes at all", () => {
  const schema = { type: "object", properties: { a: { type: "string" } } };
  assert.deepEqual(changes(schema, schema), []);
});

test("type removal narrows and names the lost type; type addition widens", () => {
  const removal = onlyChange({ type: ["string", "null"] }, { type: "string" });
  assert.equal(removal.code, "type-removed");
  assert.equal(removal.effect, "narrowed");
  assert.match(removal.reason, /"null"/);
  const addition = onlyChange({ type: "string" }, { type: ["string", "null"] });
  assert.equal(addition.code, "type-added");
  assert.equal(addition.effect, "widened");
});

test("number/integer subtyping: number → integer narrows, integer → number only widens", () => {
  const change = onlyChange({ type: "number" }, { type: "integer" });
  assert.equal(change.code, "type-removed");
  assert.match(change.reason, /"number"/);
  assert.deepEqual(codes({ type: "integer" }, { type: "number" }), ["type-added"]);
});

test("a full type swap reports one removal and one addition", () => {
  assert.deepEqual(codes({ type: "string" }, { type: "boolean" }), ["type-added", "type-removed"]);
});

test("enum value removal narrows by name; a swap reports removal and addition separately", () => {
  const change = onlyChange({ enum: ["a", "b", "c"] }, { enum: ["a", "b"] });
  assert.equal(change.code, "enum-values-removed");
  assert.equal(change.effect, "narrowed");
  assert.match(change.reason, /"c"/);
  assert.deepEqual(codes({ enum: ["a", "b"] }, { enum: ["a", "c"] }), [
    "enum-values-added",
    "enum-values-removed",
  ]);
});

test("enum values compare structurally, not by reference", () => {
  assert.deepEqual(changes({ enum: [{ k: 1 }, "x"] }, { enum: ["x", { k: 1 }] }), []);
});

test('enum: ["only"] and const: "only" are the same schema', () => {
  assert.deepEqual(changes({ enum: ["only"] }, { const: "only" }), []);
});

test("shrinking an enum to one value is a single narrowing, not enum→const churn", () => {
  const change = onlyChange({ enum: ["x", "y"] }, { enum: ["x"] });
  assert.equal(change.code, "enum-values-removed");
  assert.equal(change.effect, "narrowed");
  const reverse = onlyChange({ const: "x" }, { enum: ["x", "y"] });
  assert.equal(reverse.code, "enum-values-added");
  assert.equal(reverse.effect, "widened");
});

test("replacing a const is a two-way break in every mode", () => {
  for (const mode of ["backward", "forward", "full"]) {
    const change = onlyChange({ const: "v1" }, { const: "v2" }, { mode });
    assert.equal(change.code, "const-changed");
    assert.equal(change.severity, "breaking", `mode ${mode}`);
  }
});

test("bounds: raising minimum or adding maxLength tightens, the reverses relax", () => {
  assert.equal(onlyChange({ minimum: 0 }, { minimum: 13 }).code, "bound-tightened");
  assert.equal(onlyChange({ minimum: 13 }, { minimum: 0 }).code, "bound-relaxed");
  assert.equal(onlyChange({ type: "string" }, { type: "string", maxLength: 10 }).code, "bound-tightened");
  assert.equal(onlyChange({ type: "string", maxLength: 10 }, { type: "string" }).code, "bound-relaxed");
});

test("minimum → exclusiveMinimum at the same value is a single tightening", () => {
  const change = onlyChange({ minimum: 5 }, { exclusiveMinimum: 5 });
  assert.equal(change.code, "bound-tightened");
  assert.match(change.reason, />= 5 to > 5/);
});

test("draft-04 boolean exclusiveMinimum compares against the numeric form", () => {
  assert.deepEqual(changes({ minimum: 5, exclusiveMinimum: true }, { exclusiveMinimum: 5 }), []);
});

test("multipleOf: a divisible step tightens, its inverse relaxes, incommensurable steps break both ways", () => {
  assert.equal(onlyChange({ multipleOf: 2 }, { multipleOf: 4 }).code, "multipleof-tightened");
  assert.equal(onlyChange({ multipleOf: 4 }, { multipleOf: 2 }).code, "multipleof-relaxed");
  const change = onlyChange({ multipleOf: 2 }, { multipleOf: 3 });
  assert.equal(change.code, "multipleof-changed");
  assert.equal(change.effect, "changed");
  // Divisibility must survive floating-point steps.
  assert.equal(onlyChange({ multipleOf: 0.1 }, { multipleOf: 0.3 }).code, "multipleof-tightened");
});

test("uniqueItems: requiring it narrows, dropping it widens", () => {
  assert.equal(onlyChange({}, { uniqueItems: true }).effect, "narrowed");
  assert.equal(onlyChange({ uniqueItems: true }, {}).effect, "widened");
  assert.deepEqual(changes({ uniqueItems: false }, {}), []);
});

test("pattern: added narrows, removed widens, rewritten is honestly unknown", () => {
  assert.equal(onlyChange({}, { pattern: "^a" }).code, "pattern-added");
  assert.equal(onlyChange({ pattern: "^a" }, {}).code, "pattern-removed");
  const change = onlyChange({ pattern: "^a" }, { pattern: "^b" });
  assert.equal(change.code, "pattern-changed");
  assert.equal(change.effect, "unknown");
});

test("format and content keyword drift is risky, never silently additive", () => {
  const format = onlyChange({ format: "email" }, { format: "idn-email" });
  assert.equal(format.code, "format-changed");
  assert.equal(format.severity, "risky");
  const content = onlyChange({ contentMediaType: "application/json" }, {});
  assert.equal(content.code, "content-changed");
  assert.equal(content.effect, "unknown");
});
