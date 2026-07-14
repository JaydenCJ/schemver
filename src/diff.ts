/**
 * The public entry point of the engine: walk, classify, summarize.
 */
import { classifyChanges, requiredBump, summarize } from "./classify.js";
import { walkSchemas } from "./compare.js";
import type { DiffOptions, DiffReport, Schema } from "./types.js";

/**
 * Diff two JSON Schemas and classify every change under the given
 * compatibility mode. Pure and deterministic: the same inputs always
 * produce the same report, changes sorted by severity, path, code.
 */
export function diffSchemas(
  oldSchema: Schema,
  newSchema: Schema,
  options: DiffOptions = {},
): DiffReport {
  const mode = options.mode ?? "backward";
  const strict = options.strict === true;
  const { changes: raw, comparedNodes } = walkSchemas(oldSchema, newSchema);
  const changes = classifyChanges(raw, mode, strict);
  return {
    mode,
    strict,
    changes,
    summary: summarize(changes),
    bump: requiredBump(changes),
    comparedNodes,
  };
}
