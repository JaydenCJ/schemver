// Object and array structure: required, property add/remove under the
// three governance regimes (forbidden / open / schema-governed),
// additionalProperties, patternProperties, dependents, items, tuples.
// This is where naive diff tools call everything "changed" — the tests
// pin the compatibility-aware verdicts instead.
import test from "node:test";
import assert from "node:assert/strict";

import { changes, codes, onlyChange } from "./helpers.mjs";

const closed = (props, required = []) => ({
  type: "object",
  additionalProperties: false,
  required,
  properties: props,
});

test("required: adding narrows at the property's own path, removing widens", () => {
  const added = onlyChange(
    closed({ a: { type: "string" } }),
    closed({ a: { type: "string" } }, ["a"]),
  );
  assert.equal(added.code, "required-added");
  assert.equal(added.path, "/a");
  assert.equal(added.effect, "narrowed");
  const removed = onlyChange(
    closed({ a: { type: "string" } }, ["a"]),
    closed({ a: { type: "string" } }),
  );
  assert.equal(removed.code, "required-removed");
  assert.equal(removed.effect, "widened");
});

test("property added: widens on a closed object, risky on an OPEN one, no-op when unconstrained", () => {
  const onClosed = onlyChange(
    closed({ a: { type: "string" } }),
    closed({ a: { type: "string" }, b: { type: "number" } }),
  );
  assert.equal(onClosed.code, "property-added");
  assert.equal(onClosed.path, "/b");
  assert.equal(onClosed.effect, "widened");
  // Open object: values under `b` were legal with ANY shape before.
  const onOpen = onlyChange(
    { type: "object" },
    { type: "object", properties: { b: { type: "number" } } },
  );
  assert.equal(onOpen.code, "property-added-was-open");
  assert.equal(onOpen.effect, "unknown");
  assert.equal(onOpen.severity, "risky");
  // A declared-but-unconstrained property changes nothing at all.
  assert.deepEqual(changes({ type: "object" }, { type: "object", properties: { b: {} } }), []);
});

test("property removed: narrows on a closed object, risky (drift) on an open one", () => {
  const onClosed = onlyChange(
    closed({ a: { type: "string" }, b: { type: "number" } }),
    closed({ a: { type: "string" } }),
  );
  assert.equal(onClosed.code, "property-removed-now-forbidden");
  assert.equal(onClosed.path, "/b");
  assert.equal(onClosed.effect, "narrowed");
  const onOpen = onlyChange(
    { type: "object", properties: { b: { type: "number" } } },
    { type: "object" },
  );
  assert.equal(onOpen.code, "property-removed-now-open");
  assert.equal(onOpen.severity, "risky");
});

test("a property newly governed by a schema-form additionalProperties diffs against it", () => {
  // Old: `b` had its own schema. New: `b` falls under additionalProperties
  // { type: "number", maximum: 10 } — the real delta is the new maximum.
  const list = changes(
    { type: "object", properties: { b: { type: "number" } }, additionalProperties: { type: "number" } },
    { type: "object", additionalProperties: { type: "number", maximum: 10 } },
  );
  const atB = list.filter((c) => c.path === "/b").map((c) => c.code);
  assert.deepEqual(atB, ["bound-tightened"]);
});

test("closing an object (additionalProperties → false) narrows", () => {
  const change = onlyChange(closed({}, []), { ...closed({}, []), additionalProperties: true });
  assert.equal(change.code, "additionalproperties-allowed");
  const reverse = onlyChange({ type: "object" }, { type: "object", additionalProperties: false });
  assert.equal(reverse.code, "additionalproperties-forbidden");
  assert.equal(reverse.effect, "narrowed");
});

test("schema-form additionalProperties diffs recursively at /*", () => {
  const change = onlyChange(
    { type: "object", additionalProperties: { type: "string" } },
    { type: "object", additionalProperties: { type: "string", maxLength: 5 } },
  );
  assert.equal(change.code, "bound-tightened");
  assert.equal(change.path, "/*");
});

test("new patternProperties: risky over an open object, widening over a closed one", () => {
  const overOpen = onlyChange(
    { type: "object" },
    { type: "object", patternProperties: { "^x-": { type: "string" } } },
  );
  assert.equal(overOpen.code, "patternproperties-added");
  assert.equal(overOpen.severity, "risky");
  const overClosed = onlyChange(
    { type: "object", additionalProperties: false },
    { type: "object", additionalProperties: false, patternProperties: { "^x-": { type: "string" } } },
  );
  assert.equal(overClosed.effect, "widened");
});

test("editing the subschema of a shared patternProperties rule recurses", () => {
  const change = onlyChange(
    { type: "object", patternProperties: { "^x-": { type: "string" } } },
    { type: "object", patternProperties: { "^x-": { type: "string", minLength: 1 } } },
  );
  assert.equal(change.code, "bound-tightened");
  assert.equal(change.path, "/(^x-)");
});

test("a property matching a patternProperties rule diffs against that rule when it moves", () => {
  // Old: x-trace declared explicitly. New: covered by the ^x- pattern
  // with the same schema — no acceptance change at all.
  assert.deepEqual(
    changes(
      { type: "object", properties: { "x-trace": { type: "string" } }, patternProperties: { "^x-": { type: "string" } } },
      { type: "object", patternProperties: { "^x-": { type: "string" } } },
    ),
    [],
  );
});

test("dependentRequired additions narrow and name both properties", () => {
  const change = onlyChange(
    { type: "object" },
    { type: "object", dependentRequired: { card: ["billing"] } },
  );
  assert.equal(change.code, "dependency-added");
  assert.match(change.reason, /"card"/);
  assert.match(change.reason, /"billing"/);
});

test("draft-07 dependencies and 2020-12 dependentRequired are the same constraint", () => {
  assert.deepEqual(
    changes(
      { dependencies: { card: ["billing"] } },
      { dependentRequired: { card: ["billing"] } },
    ),
    [],
  );
});

test("propertyNames constraints diff precisely (added maxLength shows as a tightening)", () => {
  const list = changes({ type: "object" }, { type: "object", propertyNames: { maxLength: 8 } });
  assert.deepEqual(list.map((c) => c.code), ["bound-tightened"]);
  assert.equal(list[0].schemaPath, "#/propertyNames");
});

test("item schema changes report at /*; dropping the item schema widens", () => {
  const change = onlyChange(
    { type: "array", items: { type: "string" } },
    { type: "array", items: { type: "string", maxLength: 3 } },
  );
  assert.equal(change.path, "/*");
  assert.equal(change.code, "bound-tightened");
  const dropped = onlyChange({ type: "array", items: { type: "string" } }, { type: "array" });
  assert.equal(dropped.effect, "widened");
});

test("old tuple syntax (items array + additionalItems) equals its 2020-12 spelling", () => {
  assert.deepEqual(
    changes(
      { type: "array", items: [{ type: "string" }], additionalItems: false },
      { type: "array", prefixItems: [{ type: "string" }], items: false },
    ),
    [],
  );
});

test("growing a tuple is flagged as undecidable, and shared positions still diff", () => {
  const list = changes(
    { prefixItems: [{ type: "string" }] },
    { prefixItems: [{ type: "string", minLength: 1 }, { type: "number" }] },
  );
  const byCode = Object.fromEntries(list.map((c) => [c.code, c]));
  assert.ok(byCode["prefixitems-extended"], "expected prefixitems-extended");
  assert.equal(byCode["prefixitems-extended"].effect, "unknown");
  assert.equal(byCode["bound-tightened"].path, "/0");
});

test("adding contains narrows even when the contained schema is vacuous", () => {
  // `contains: {}` still forces the array to be non-empty.
  const change = onlyChange({ type: "array" }, { type: "array", contains: {} });
  assert.equal(change.code, "items-constrained");
  assert.equal(change.effect, "narrowed");
});
