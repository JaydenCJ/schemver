// Combinators and references: allOf/anyOf/oneOf arm tracking, the `not`
// polarity flip, conditionals, $ref resolution and cycle breaking. The
// polarity tests matter most — a tool that calls a change "safe" when it
// sits under a `not` has the verdict exactly backwards.
import test from "node:test";
import assert from "node:assert/strict";

import { changes, codes, onlyChange } from "./helpers.mjs";

test("adding an allOf arm narrows, removing one widens, an accept-all arm is a no-op", () => {
  const base = { allOf: [{ type: "object" }] };
  const more = { allOf: [{ type: "object" }, { required: ["id"] }] };
  assert.equal(onlyChange(base, more).code, "allof-arm-added");
  assert.equal(onlyChange(base, more).effect, "narrowed");
  assert.equal(onlyChange(more, base).code, "allof-arm-removed");
  assert.deepEqual(changes(base, { allOf: [{ type: "object" }, {}] }), []);
});

test("adding an anyOf alternative widens; removing one narrows", () => {
  const base = { anyOf: [{ type: "string" }] };
  const more = { anyOf: [{ type: "string" }, { type: "number" }] };
  assert.equal(onlyChange(base, more).code, "anyof-arm-added");
  assert.equal(onlyChange(base, more).effect, "widened");
  assert.equal(onlyChange(more, base).effect, "narrowed");
});

test("reordering combinator arms is not a change", () => {
  assert.deepEqual(
    changes(
      { anyOf: [{ type: "string" }, { type: "number" }] },
      { anyOf: [{ type: "number" }, { type: "string" }] },
    ),
    [],
  );
});

test("editing one arm among equals recurses instead of reporting churn", () => {
  const change = onlyChange(
    { anyOf: [{ type: "string" }, { type: "number" }] },
    { anyOf: [{ type: "string", minLength: 2 }, { type: "number" }] },
  );
  assert.equal(change.code, "bound-tightened");
  assert.equal(change.schemaPath, "#/anyOf/0");
});

test("oneOf arm count changes are undecidable and say so", () => {
  const change = onlyChange(
    { oneOf: [{ type: "string" }] },
    { oneOf: [{ type: "string" }, { type: "number" }] },
  );
  assert.equal(change.code, "oneof-arms-changed");
  assert.equal(change.effect, "unknown");
  assert.match(change.reason, /1 to 2 arms/);
});

test("adding a not narrows; removing it widens", () => {
  assert.equal(onlyChange({}, { not: { type: "null" } }).code, "not-added");
  assert.equal(onlyChange({ not: { type: "null" } }, {}).code, "not-removed");
});

test("tightening INSIDE a not widens the outer schema; a double not cancels the flip", () => {
  const flipped = onlyChange(
    { not: { type: "string" } },
    { not: { type: "string", minLength: 5 } },
  );
  assert.equal(flipped.code, "bound-tightened");
  assert.equal(flipped.effect, "widened");
  assert.match(flipped.reason, /inverted/);
  const doubled = onlyChange(
    { not: { not: { type: "string" } } },
    { not: { not: { type: "string", minLength: 5 } } },
  );
  assert.equal(doubled.effect, "narrowed");
});

test("if/then/else drift is one honest unknown, not a guessed recursion", () => {
  const change = onlyChange(
    { if: { required: ["a"] }, then: { required: ["b"] } },
    { if: { required: ["a"] }, then: { required: ["c"] } },
  );
  assert.equal(change.code, "conditional-changed");
  assert.equal(change.effect, "unknown");
  assert.match(change.reason, /then/);
});

test("$ref targets are compared through the pointer, at the ref site's path", () => {
  const oldRoot = {
    type: "object",
    properties: { home: { $ref: "#/$defs/addr" } },
    $defs: { addr: { type: "object", required: ["city"] } },
  };
  const newRoot = {
    type: "object",
    properties: { home: { $ref: "#/$defs/addr" } },
    $defs: { addr: { type: "object", required: ["city", "zip"] } },
  };
  const change = onlyChange(oldRoot, newRoot);
  assert.equal(change.code, "required-added");
  assert.equal(change.path, "/home/zip");
});

test("recursive schemas terminate and still report the real change once", () => {
  const make = (extra) => ({
    $defs: {
      node: {
        type: "object",
        required: ["value", ...extra],
        properties: {
          value: { type: "string" },
          children: { type: "array", items: { $ref: "#/$defs/node" } },
        },
      },
    },
    $ref: "#/$defs/node",
  });
  const list = changes(make([]), make(["id"]));
  assert.deepEqual(list.map((c) => c.code), ["required-added"]);
});

test("external refs: identical are trusted, changed or dangling are flagged risky", () => {
  assert.deepEqual(
    changes({ $ref: "https://example.test/a.json" }, { $ref: "https://example.test/a.json" }),
    [],
  );
  const change = onlyChange(
    { $ref: "https://example.test/a.json" },
    { $ref: "https://example.test/b.json" },
  );
  assert.equal(change.code, "ref-unresolved");
  assert.equal(change.severity, "risky");
  // Dangling local refs are reported, never silently skipped.
  assert.equal(onlyChange({ $ref: "#/$defs/ghost" }, { type: "string" }).code, "ref-unresolved");
});

test("$ref siblings are honored (a maxLength next to the ref still diffs)", () => {
  const root = (max) => ({
    $defs: { name: { type: "string" } },
    $ref: "#/$defs/name",
    maxLength: max,
  });
  const change = onlyChange(root(10), root(5));
  assert.equal(change.code, "bound-tightened");
});

test("unknown extension keywords are risky in every mode", () => {
  for (const mode of ["backward", "forward", "full"]) {
    const change = onlyChange({ "x-internal": 1 }, { "x-internal": 2 }, { mode });
    assert.equal(change.code, "keyword-unknown");
    assert.equal(change.severity, "risky", `mode ${mode}`);
  }
});

test("annotations are metadata; readOnly flips and unevaluated* drift are risky", () => {
  assert.equal(onlyChange({ description: "a" }, { description: "b" }).effect, "metadata");
  const dep = onlyChange({}, { deprecated: true });
  assert.equal(dep.code, "deprecated-toggled");
  assert.equal(dep.severity, "additive");
  assert.equal(onlyChange({}, { readOnly: true }).code, "access-changed");
  const uneval = onlyChange({ unevaluatedProperties: false }, {});
  assert.equal(uneval.code, "unevaluated-changed");
  assert.equal(uneval.severity, "risky");
});
