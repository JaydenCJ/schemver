// The policy layer: effect → severity under each mode, strict
// promotion, the semver bump ladder, deterministic ordering, and the
// contract that every emitted code exists in the rule registry.
import test from "node:test";
import assert from "node:assert/strict";

import {
  diffSchemas,
  requiredBump,
  ruleByCode,
  RULES,
  severityFor,
} from "../dist/index.js";
import { changes } from "./helpers.mjs";

test("severityFor implements the mode table exactly", () => {
  // backward: protects old producers — narrowing breaks them.
  assert.equal(severityFor("narrowed", "backward"), "breaking");
  assert.equal(severityFor("widened", "backward"), "additive");
  // forward: protects old consumers — widening breaks them.
  assert.equal(severityFor("narrowed", "forward"), "additive");
  assert.equal(severityFor("widened", "forward"), "breaking");
  // full: any acceptance change breaks.
  assert.equal(severityFor("narrowed", "full"), "breaking");
  assert.equal(severityFor("widened", "full"), "breaking");
  // mode-independent rows.
  for (const mode of ["backward", "forward", "full"]) {
    assert.equal(severityFor("changed", mode), "breaking");
    assert.equal(severityFor("unknown", mode), "risky");
    assert.equal(severityFor("metadata", mode), "additive");
  }
});

test("the same edit flips severity between backward and forward mode", () => {
  const oldSchema = { type: "object", required: ["a"], properties: { a: { type: "string" } } };
  const newSchema = { type: "object", properties: { a: { type: "string" } } };
  assert.equal(changes(oldSchema, newSchema, { mode: "backward" })[0].severity, "additive");
  assert.equal(changes(oldSchema, newSchema, { mode: "forward" })[0].severity, "breaking");
});

test("strict mode promotes risky to breaking and the bump to major", () => {
  const oldSchema = { format: "email" };
  const newSchema = { format: "idn-email" };
  const lax = diffSchemas(oldSchema, newSchema);
  assert.equal(lax.bump, "minor");
  const strict = diffSchemas(oldSchema, newSchema, { strict: true });
  assert.equal(strict.changes[0].severity, "breaking");
  assert.equal(strict.bump, "major");
  assert.equal(strict.summary.risky, 0);
});

test("the bump ladder: none → patch → minor → major", () => {
  const base = { type: "string" };
  assert.equal(diffSchemas(base, base).bump, "none");
  assert.equal(diffSchemas(base, { ...base, description: "docs" }).bump, "patch");
  assert.equal(diffSchemas(base, { type: ["string", "null"] }).bump, "minor");
  assert.equal(diffSchemas(base, { type: "string", minLength: 1 }).bump, "major");
});

test("metadata does not drown out a semantic change (patch loses to minor)", () => {
  const report = diffSchemas(
    { type: "string" },
    { type: ["string", "null"], description: "docs" },
  );
  assert.equal(report.bump, "minor");
  assert.equal(report.summary.additive, 2);
});

test("changes come out sorted: severity first, then path, then code", () => {
  const report = diffSchemas(
    {
      type: "object",
      additionalProperties: false,
      required: ["a"],
      properties: { a: { type: "string" }, b: { type: "string" }, z: { enum: ["x"] } },
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["a", "b"],
      properties: { a: { type: "string", format: "uuid" }, b: { type: "string" }, z: { enum: ["x", "y"] } },
    },
  );
  const ranks = { breaking: 0, risky: 1, additive: 2 };
  for (let i = 1; i < report.changes.length; i += 1) {
    const prev = report.changes[i - 1];
    const cur = report.changes[i];
    const ordered =
      ranks[prev.severity] < ranks[cur.severity] ||
      (ranks[prev.severity] === ranks[cur.severity] && prev.path <= cur.path);
    assert.ok(ordered, `${prev.severity}${prev.path} should sort before ${cur.severity}${cur.path}`);
  }
});

test("a broad, messy diff only ever emits registered rule codes", () => {
  const oldSchema = {
    type: "object",
    required: ["id"],
    additionalProperties: false,
    minProperties: 1,
    properties: {
      id: { type: "string", format: "uuid" },
      kind: { enum: ["a", "b"] },
      n: { type: "number", minimum: 0, multipleOf: 2 },
      list: { type: "array", items: { type: "string" }, uniqueItems: true },
      gone: { type: "boolean" },
    },
    oneOf: [{ required: ["kind"] }],
    not: { required: ["forbidden"] },
    "x-owner": "team-a",
  };
  const newSchema = {
    type: "object",
    required: ["id", "kind"],
    additionalProperties: { type: "string" },
    properties: {
      id: { type: "string" },
      kind: { enum: ["b", "c"] },
      n: { type: "integer", minimum: 5, multipleOf: 3 },
      list: { type: "array", items: { type: "string", pattern: "^s" } },
    },
    oneOf: [{ required: ["kind"] }, { required: ["n"] }],
    if: { required: ["n"] },
    then: { required: ["list"] },
    default: {},
    "x-owner": "team-b",
  };
  const list = changes(oldSchema, newSchema);
  assert.ok(list.length >= 10, `expected a rich diff, got ${list.length} changes`);
  for (const change of list) {
    assert.ok(ruleByCode(change.code), `unregistered rule code: ${change.code}`);
  }
});

test("the registry itself is well-formed: unique codes, non-empty summaries", () => {
  const codes = new Set();
  for (const rule of RULES) {
    assert.ok(!codes.has(rule.code), `duplicate code ${rule.code}`);
    codes.add(rule.code);
    assert.ok(rule.summary.length > 10, `summary too thin for ${rule.code}`);
    assert.ok(rule.keyword.length > 0);
  }
  assert.ok(RULES.length >= 40, "registry should stay substantial");
});
