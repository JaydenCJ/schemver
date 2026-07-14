/**
 * Severity assignment: map raw acceptance effects to consumer-facing
 * severities under a compatibility mode, then map severities to the
 * semver bump the release requires. This is the policy layer — the
 * walker states facts, this module judges them.
 */
import type { RawChange } from "./compare.js";
import type { Bump, Change, Effect, Mode, Severity, Summary } from "./types.js";

/**
 * The mode table. Narrowing rejects data old producers still send —
 * that breaks `backward`. Widening admits data old consumers have never
 * seen — that breaks `forward`. `changed` replaces the accepted set and
 * breaks both. `unknown` is always risky: schemver refuses to guess.
 */
export function severityFor(effect: Effect, mode: Mode): Severity {
  switch (effect) {
    case "metadata":
      return "additive";
    case "unknown":
      return "risky";
    case "changed":
      return "breaking";
    case "narrowed":
      return mode === "forward" ? "additive" : "breaking";
    case "widened":
      return mode === "backward" ? "additive" : "breaking";
  }
}

const SEVERITY_RANK: Record<Severity, number> = { breaking: 0, risky: 1, additive: 2 };

/** Deterministic ordering: severity, then path, then code, then keyword. */
export function compareChanges(a: Change, b: Change): number {
  const bySeverity = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
  if (bySeverity !== 0) return bySeverity;
  if (a.path !== b.path) return a.path < b.path ? -1 : 1;
  if (a.code !== b.code) return a.code < b.code ? -1 : 1;
  if (a.keyword !== b.keyword) return a.keyword < b.keyword ? -1 : 1;
  return 0;
}

/**
 * Attach severities to raw changes. With `strict`, risky changes are
 * promoted to breaking — the posture for teams that would rather cut an
 * unnecessary major than ship an undetected break.
 */
export function classifyChanges(raw: RawChange[], mode: Mode, strict: boolean): Change[] {
  const changes = raw.map((change): Change => {
    let severity = severityFor(change.effect, mode);
    if (strict && severity === "risky") severity = "breaking";
    return { ...change, severity };
  });
  changes.sort(compareChanges);
  return changes;
}

/** Count changes per severity. */
export function summarize(changes: Change[]): Summary {
  const summary: Summary = { breaking: 0, risky: 0, additive: 0 };
  for (const change of changes) summary[change.severity] += 1;
  return summary;
}

/**
 * The semver bump a change set requires:
 * - any breaking change → major;
 * - any risky change, or any additive change that moves acceptance → minor;
 * - metadata-only changes → patch;
 * - identical schemas → none.
 */
export function requiredBump(changes: Change[]): Bump {
  let bump: Bump = "none";
  for (const change of changes) {
    if (change.severity === "breaking") return "major";
    if (change.severity === "risky" || change.effect !== "metadata") bump = "minor";
    else if (bump === "none") bump = "patch";
  }
  return bump;
}
