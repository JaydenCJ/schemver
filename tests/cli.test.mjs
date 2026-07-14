// CLI integration: the built binary run as a child process against the
// committed examples and freshly written temp schemas — commands,
// flags, exit codes (0 ok / 1 gate / 2 usage) and JSON output.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { VERSION } from "../dist/index.js";
import { runCli } from "./helpers.mjs";

const V1 = "examples/user-v1.json";
const V2 = "examples/user-v2.json";
const V21 = "examples/user-v2.1.json";

function withTempFile(content, fn) {
  const dir = mkdtempSync(join(tmpdir(), "schemver-test-"));
  try {
    const path = join(dir, "schema.json");
    writeFileSync(path, content);
    return fn(path);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("--version prints the package version; --help documents every command and flag", () => {
  const version = runCli(["--version"]);
  assert.equal(version.status, 0);
  assert.equal(version.stdout.trim(), VERSION);
  const help = runCli(["--help"]);
  assert.equal(help.status, 0);
  for (const word of ["diff", "bump", "rules", "--mode", "--fail-on", "--strict", "Exit codes"]) {
    assert.ok(help.stdout.includes(word), `help missing ${word}`);
  }
});

test("no arguments prints usage and exits 2", () => {
  const { status, stdout } = runCli([]);
  assert.equal(status, 2);
  assert.match(stdout, /Usage:/);
});

test("usage errors all exit 2 with a pointer to --help", () => {
  const cases = [
    ["frobnicate"],
    ["diff", V1],
    ["diff", V1, V2, "--frobnicate"],
    ["diff", V1, V2, "--mode", "sideways"],
    ["diff", V1, V2, "--fail-on", "everything"],
    ["diff", V1, V2, V21],
    ["bump", V1, V2],
    ["bump", V1, V2, "--current", "not-semver"],
    ["diff", "does-not-exist.json", V2],
  ];
  for (const args of cases) {
    const { status, stderr } = runCli(args);
    assert.equal(status, 2, `expected exit 2 for: ${args.join(" ")}`);
    assert.match(stderr, /schemver: /);
    assert.match(stderr, /--help/);
  }
});

test("flags of another command are rejected, not silently ignored", () => {
  // `diff --check` must not leave the user believing the gate is active.
  const check = runCli(["diff", V1, V2, "--check", "2.0.0"]);
  assert.equal(check.status, 2);
  assert.match(check.stderr, /bump/);
  const failOn = runCli(["bump", V1, V2, "--current", "1.0.0", "--fail-on", "any"]);
  assert.equal(failOn.status, 2);
  assert.match(failOn.stderr, /--check/);
  const rules = runCli(["rules", "--mode", "forward"]);
  assert.equal(rules.status, 2);
  assert.match(rules.stderr, /does not apply/);
});

test("invalid JSON and non-schema JSON are input errors (exit 2)", () => {
  withTempFile("{ not json", (path) => {
    const { status, stderr } = runCli(["diff", path, V2]);
    assert.equal(status, 2);
    assert.match(stderr, /not valid JSON/);
  });
  withTempFile("[1, 2, 3]", (path) => {
    const { status, stderr } = runCli(["diff", path, V2]);
    assert.equal(status, 2);
    assert.match(stderr, /not a JSON Schema/);
  });
});

test("the flagship diff: v1 → v2 finds breaking changes and exits 1", () => {
  const { status, stdout } = runCli(["diff", V1, V2]);
  assert.equal(status, 1);
  for (const want of [
    "BREAKING (5)",
    "required-added",
    'enum value "free" removed',
    "property-removed-now-forbidden",
    "verdict: MAJOR",
  ]) {
    assert.ok(stdout.includes(want), `diff output missing: ${want}`);
  }
});

test("a purely additive release passes the default gate (exit 0)", () => {
  const { status, stdout } = runCli(["diff", V2, V21]);
  assert.equal(status, 0);
  assert.match(stdout, /BREAKING \(0\)/);
  assert.match(stdout, /verdict: MINOR/);
});

test("--fail-on tunes the gate; --mode flips the verdict", () => {
  assert.equal(runCli(["diff", V1, V2, "--fail-on", "none"]).status, 0);
  assert.equal(runCli(["diff", V2, V21, "--fail-on", "any"]).status, 1);
  // Under forward compatibility the additive v2.1 release breaks readers.
  const forward = runCli(["diff", V2, V21, "--mode", "forward"]);
  assert.equal(forward.status, 1);
  assert.match(forward.stdout, /verdict: MAJOR/);
});

test("--strict promotes the risky format change to breaking", () => {
  const lax = runCli(["diff", V2, V21, "--strict"]);
  assert.equal(lax.status, 0, "no risky changes in v2 → v2.1, strict changes nothing");
  const { stdout } = runCli(["diff", V1, V2, "--strict"]);
  assert.match(stdout, /BREAKING \(7\)/);
  assert.match(stdout, /RISKY \(0\)/);
});

test("diff --json is valid, structurally complete, and deterministic", () => {
  const a = runCli(["diff", V1, V2, "--json", "--fail-on", "none"]);
  const b = runCli(["diff", V1, V2, "--json", "--fail-on", "none"]);
  assert.equal(a.status, 0);
  assert.equal(a.stdout, b.stdout, "JSON output must be byte-identical across runs");
  const doc = JSON.parse(a.stdout);
  assert.equal(doc.tool, "schemver");
  assert.equal(doc.bump, "major");
  assert.equal(doc.old.dialect, "2020-12");
  assert.equal(doc.gate.trips, false);
  const paths = doc.changes.map((c) => c.path);
  assert.ok(paths.includes("/signup_source"));
});

test("bump prints the required bump and next version", () => {
  const { status, stdout } = runCli(["bump", V1, V2, "--current", "1.4.2"]);
  assert.equal(status, 0);
  assert.match(stdout, /required bump {2}major/);
  assert.match(stdout, /next {11}2\.0\.0/);
});

test("bump --check gates an insufficient proposal with exit 1", () => {
  const bad = runCli(["bump", V2, V21, "--current", "2.0.0", "--check", "2.0.1"]);
  assert.equal(bad.status, 1);
  assert.match(bad.stdout, /INSUFFICIENT/);
  const good = runCli(["bump", V2, V21, "--current", "2.0.0", "--check", "2.1.0"]);
  assert.equal(good.status, 0);
  assert.match(good.stdout, /OK \(delivers a minor bump, minor required\)/);
});

test("bump --json carries the semver block", () => {
  const { stdout } = runCli(["bump", V1, V2, "--current", "1.4.2", "--check", "1.5.0", "--json"]);
  const doc = JSON.parse(stdout);
  assert.deepEqual(doc.semver, {
    current: "1.4.2",
    required: "major",
    next: "2.0.0",
    proposed: "1.5.0",
    satisfies: false,
    delivered: "minor",
  });
});

test("rules lists the registry in text and JSON", () => {
  const text = runCli(["rules"]);
  assert.equal(text.status, 0);
  assert.match(text.stdout, /required-added/);
  assert.match(text.stdout, /keyword-unknown/);
  const json = runCli(["rules", "--json"]);
  const doc = JSON.parse(json.stdout);
  assert.ok(doc.rules.length >= 40);
  assert.ok(doc.rules.every((rule) => rule.code && rule.summary));
});
