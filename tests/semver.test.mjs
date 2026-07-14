// The semver module: parsing, bumping, and the delivered-vs-required
// gate arithmetic behind `schemver bump --check`.
import test from "node:test";
import assert from "node:assert/strict";

import {
  applyBump,
  deliveredBump,
  formatSemver,
  parseSemver,
  satisfiesBump,
} from "../dist/index.js";

test("parseSemver accepts plain, v-prefixed, prerelease, and build forms — and nothing else", () => {
  assert.deepEqual(parseSemver("1.2.3"), { major: 1, minor: 2, patch: 3 });
  assert.deepEqual(parseSemver("v0.1.0"), { major: 0, minor: 1, patch: 0 });
  assert.equal(parseSemver("2.0.0-rc.1").prerelease, "rc.1");
  assert.equal(parseSemver("2.0.0+build.5").build, "build.5");
  for (const bad of ["1.2", "1.2.3.4", "01.2.3", "a.b.c", "", "1.2.x"]) {
    assert.equal(parseSemver(bad), undefined, bad);
  }
});

test("formatSemver round-trips parseSemver", () => {
  for (const input of ["1.2.3", "0.1.0", "2.0.0-rc.1+build.5"]) {
    assert.equal(formatSemver(parseSemver(input)), input);
  }
});

test("applyBump moves the right component and zeroes the lower ones", () => {
  const base = parseSemver("1.4.2");
  assert.equal(formatSemver(applyBump(base, "major")), "2.0.0");
  assert.equal(formatSemver(applyBump(base, "minor")), "1.5.0");
  assert.equal(formatSemver(applyBump(base, "patch")), "1.4.3");
  assert.equal(formatSemver(applyBump(base, "none")), "1.4.2");
});

test("applyBump drops prerelease/build — the next release line starts clean", () => {
  const pre = parseSemver("1.4.2-rc.1+build.9");
  assert.equal(formatSemver(applyBump(pre, "minor")), "1.5.0");
});

test("deliveredBump reads the actual jump between two versions", () => {
  const from = parseSemver("1.4.2");
  assert.equal(deliveredBump(from, parseSemver("2.0.0")), "major");
  assert.equal(deliveredBump(from, parseSemver("1.5.0")), "minor");
  assert.equal(deliveredBump(from, parseSemver("1.4.3")), "patch");
  assert.equal(deliveredBump(from, parseSemver("1.4.2")), "none");
});

test("deliveredBump refuses downgrades (they deliver nothing)", () => {
  const from = parseSemver("1.4.2");
  assert.equal(deliveredBump(from, parseSemver("1.3.9")), undefined);
  assert.equal(deliveredBump(from, parseSemver("0.9.0")), undefined);
  // A lower minor under a same major is a downgrade even with a higher patch.
  assert.equal(deliveredBump(from, parseSemver("1.3.99")), undefined);
});

test("satisfiesBump: over-delivering is fine, under-delivering is not", () => {
  const from = parseSemver("1.4.2");
  assert.equal(satisfiesBump(from, parseSemver("2.0.0"), "minor"), true);
  assert.equal(satisfiesBump(from, parseSemver("1.5.0"), "minor"), true);
  assert.equal(satisfiesBump(from, parseSemver("1.4.3"), "minor"), false);
  assert.equal(satisfiesBump(from, parseSemver("1.4.2"), "none"), true);
  assert.equal(satisfiesBump(from, parseSemver("1.3.0"), "none"), false);
});
