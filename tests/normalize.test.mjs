// Normalization and JSON utilities: draft folding, $ref resolution,
// type-set semantics — the ground the comparator stands on. A wrong
// answer here silently misclassifies every diff built on top of it.
import test from "node:test";
import assert from "node:assert/strict";

import {
  acceptedTypes,
  deepEqual,
  dialectLabel,
  normalizeNode,
  resolveRef,
  stableStringify,
} from "../dist/index.js";

test("deepEqual treats objects structurally and arrays order-sensitively", () => {
  assert.equal(deepEqual({ a: 1, b: [2, 3] }, { b: [2, 3], a: 1 }), true);
  assert.equal(deepEqual([1, 2], [2, 1]), false);
  assert.equal(deepEqual(null, {}), false);
  assert.equal(deepEqual(0, false), false);
});

test("stableStringify sorts object keys so equal values share one identity", () => {
  assert.equal(stableStringify({ b: 1, a: { d: 2, c: 3 } }), stableStringify({ a: { c: 3, d: 2 }, b: 1 }));
  assert.equal(stableStringify(["x", null]), '["x",null]');
});

test("boolean schemas normalize: true accepts all, false rejects all", () => {
  assert.deepEqual(normalizeNode(true), {});
  assert.deepEqual(normalizeNode(false), { not: {} });
});

test("draft-04 boolean exclusiveMinimum folds into the numeric form", () => {
  assert.deepEqual(normalizeNode({ minimum: 5, exclusiveMinimum: true }), { exclusiveMinimum: 5 });
  assert.deepEqual(normalizeNode({ minimum: 5, exclusiveMinimum: false }), { minimum: 5 });
  assert.deepEqual(normalizeNode({ maximum: 9, exclusiveMaximum: true }), { exclusiveMaximum: 9 });
});

test("array-form items becomes prefixItems, additionalItems becomes items", () => {
  const node = normalizeNode({ items: [{ type: "string" }], additionalItems: false });
  assert.deepEqual(node.prefixItems, [{ type: "string" }]);
  assert.equal(node.items, false);
  assert.equal("additionalItems" in node, false);
});

test("draft-07 dependencies split into dependentRequired and dependentSchemas", () => {
  const node = normalizeNode({
    dependencies: { card: ["billing"], promo: { required: ["code"] } },
  });
  assert.deepEqual(node.dependentRequired, { card: ["billing"] });
  assert.deepEqual(node.dependentSchemas, { promo: { required: ["code"] } });
  assert.equal("dependencies" in node, false);
});

test("one-value enum folds to const, one-name type arrays flatten, untouched nodes are not copied", () => {
  assert.deepEqual(normalizeNode({ enum: ["only"] }), { const: "only" });
  assert.deepEqual(normalizeNode({ type: ["string"] }), { type: "string" });
  const node = { type: "string", minLength: 3 };
  assert.equal(normalizeNode(node), node);
});

test("acceptedTypes: absent type accepts everything", () => {
  assert.equal(acceptedTypes(undefined).size, 7);
});

test("acceptedTypes: number covers integer, integer does not cover number", () => {
  const number = acceptedTypes("number");
  assert.equal(number.has("integer"), true);
  const integer = acceptedTypes("integer");
  assert.equal(integer.has("number"), false);
});

test("resolveRef walks JSON Pointers (with ~0/~1 escapes) and refuses external/dangling refs", () => {
  const root = { $defs: { "a/b": { type: "string" }, "c~d": { type: "integer" } } };
  assert.deepEqual(resolveRef(root, "#/$defs/a~1b"), { type: "string" });
  assert.deepEqual(resolveRef(root, "#/$defs/c~0d"), { type: "integer" });
  assert.equal(resolveRef(root, "#"), root);
  assert.equal(resolveRef(root, "https://example.test/other.json#/x"), undefined);
  assert.equal(resolveRef(root, "#anchor"), undefined);
  assert.equal(resolveRef(root, "#/$defs/ghost"), undefined);
});

test("dialectLabel recognizes 2020-12, draft-07, and schemas without $schema", () => {
  assert.equal(dialectLabel({ $schema: "https://json-schema.org/draft/2020-12/schema" }), "2020-12");
  assert.equal(dialectLabel({ $schema: "http://json-schema.org/draft-07/schema#" }), "draft-07");
  assert.equal(dialectLabel({ type: "object" }), "no $schema");
  assert.equal(dialectLabel(true), "no $schema");
});
