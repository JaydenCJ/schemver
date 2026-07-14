/**
 * schemver — diff two JSON Schemas and classify every change as
 * breaking, risky, or additive, with per-path reasons and the semver
 * bump the release requires.
 *
 * Programmatic use:
 *
 * ```ts
 * import { diffSchemas } from "schemver";
 * const report = diffSchemas(oldSchema, newSchema, { mode: "backward" });
 * if (report.bump === "major") throw new Error(report.changes[0].reason);
 * ```
 */
export { diffSchemas } from "./diff.js";
export { walkSchemas, isVacuous, type RawChange, type WalkResult } from "./compare.js";
export {
  classifyChanges,
  compareChanges,
  requiredBump,
  severityFor,
  summarize,
} from "./classify.js";
export {
  acceptedTypes,
  deepEqual,
  dialectLabel,
  displayValue,
  isObject,
  JSON_TYPES,
  normalizeNode,
  resolveRef,
  stableStringify,
  type JsonTypeName,
} from "./normalize.js";
export { RULES, ruleByCode, type Rule } from "./rules.js";
export {
  applyBump,
  deliveredBump,
  formatSemver,
  parseSemver,
  satisfiesBump,
  type SemVer,
} from "./semver.js";
export {
  gateTrips,
  renderBumpText,
  renderDiffText,
  renderJson,
  type FailOn,
  type SourceInfo,
} from "./report.js";
export type {
  Bump,
  Change,
  DiffOptions,
  DiffReport,
  Effect,
  Json,
  Mode,
  Schema,
  SchemaObject,
  Severity,
  Summary,
} from "./types.js";
export { VERSION } from "./version.js";
