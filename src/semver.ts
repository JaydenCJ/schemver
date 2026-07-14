/**
 * A minimal, dependency-free semver: parse `x.y.z(-pre)?(+build)?`,
 * apply a bump, and decide whether a proposed version delivers at least
 * the bump a change set requires. Only what schemver needs — this is
 * not a general range engine.
 */
import type { Bump } from "./types.js";

export interface SemVer {
  major: number;
  minor: number;
  patch: number;
  prerelease?: string;
  build?: string;
}

const SEMVER_RE =
  /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?(?:\+([0-9A-Za-z.-]+))?$/;

/** Parse a version string; returns undefined when it is not semver. */
export function parseSemver(input: string): SemVer | undefined {
  const match = SEMVER_RE.exec(input.trim());
  if (!match) return undefined;
  const version: SemVer = {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
  if (match[4] !== undefined) version.prerelease = match[4];
  if (match[5] !== undefined) version.build = match[5];
  return version;
}

/** Render a SemVer back to a string (build metadata is preserved). */
export function formatSemver(version: SemVer): string {
  let out = `${version.major}.${version.minor}.${version.patch}`;
  if (version.prerelease !== undefined) out += `-${version.prerelease}`;
  if (version.build !== undefined) out += `+${version.build}`;
  return out;
}

/**
 * Apply a bump to a version. Prerelease and build metadata are dropped:
 * the next release line starts clean.
 */
export function applyBump(current: SemVer, bump: Bump): SemVer {
  switch (bump) {
    case "major":
      return { major: current.major + 1, minor: 0, patch: 0 };
    case "minor":
      return { major: current.major, minor: current.minor + 1, patch: 0 };
    case "patch":
      return { major: current.major, minor: current.minor, patch: current.patch + 1 };
    case "none":
      return { major: current.major, minor: current.minor, patch: current.patch };
  }
}

/**
 * The bump a version pair actually delivers: which component grew,
 * viewed from `from`. Returns undefined when `to` is not an increase
 * (equal or a downgrade) — you cannot deliver any bump by going
 * backward.
 */
export function deliveredBump(from: SemVer, to: SemVer): Bump | undefined {
  if (to.major > from.major) return "major";
  if (to.major < from.major) return undefined;
  if (to.minor > from.minor) return "minor";
  if (to.minor < from.minor) return undefined;
  if (to.patch > from.patch) return "patch";
  if (to.patch < from.patch) return undefined;
  return "none";
}

const BUMP_RANK: Record<Bump, number> = { none: 0, patch: 1, minor: 2, major: 3 };

/**
 * Does a proposed version satisfy the required bump from `current`?
 * A bigger bump than required always satisfies (releasing 2.0.0 when
 * only a minor was needed is allowed, just generous).
 */
export function satisfiesBump(current: SemVer, proposed: SemVer, required: Bump): boolean {
  const delivered = deliveredBump(current, proposed);
  if (delivered === undefined) return false;
  return BUMP_RANK[delivered] >= BUMP_RANK[required];
}
