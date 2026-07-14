// Shared test helpers: thin wrappers over the built engine plus a
// child-process runner for the CLI. Everything is deterministic and
// offline — schemas are built inline, temp files live under mkdtemp.
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { diffSchemas } from "../dist/index.js";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Diff two schemas and return the classified change list. */
export function changes(oldSchema, newSchema, options = {}) {
  return diffSchemas(oldSchema, newSchema, options).changes;
}

/** Diff two schemas and return the sorted list of rule codes emitted. */
export function codes(oldSchema, newSchema, options = {}) {
  return changes(oldSchema, newSchema, options)
    .map((change) => change.code)
    .sort();
}

/** The single change a minimal diff is expected to produce. */
export function onlyChange(oldSchema, newSchema, options = {}) {
  const list = changes(oldSchema, newSchema, options);
  if (list.length !== 1) {
    throw new Error(
      `expected exactly one change, got ${list.length}: ${JSON.stringify(list, null, 2)}`,
    );
  }
  return list[0];
}

/** Run the built CLI with args; returns { status, stdout, stderr }. */
export function runCli(args, opts = {}) {
  const result = spawnSync(
    process.execPath,
    [join(ROOT, "dist", "cli.js"), ...args],
    { encoding: "utf8", cwd: opts.cwd ?? ROOT },
  );
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}
