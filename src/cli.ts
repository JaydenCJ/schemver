#!/usr/bin/env node
/**
 * The schemver CLI. Exit codes are script-friendly and stable:
 *   0 — success (and, for `diff`/`bump`, the gate did not trip)
 *   1 — the `--fail-on` gate tripped, or `--check` was insufficient
 *   2 — usage or input error (bad flags, unreadable/invalid JSON, …)
 */
import { readFileSync } from "node:fs";

import { enumFlag, parseArgs, UsageError, type ParsedArgs } from "./args.js";
import { diffSchemas } from "./diff.js";
import { dialectLabel, isObject } from "./normalize.js";
import { RULES } from "./rules.js";
import {
  gateTrips,
  renderBumpText,
  renderDiffText,
  renderJson,
  type FailOn,
  type SourceInfo,
} from "./report.js";
import { applyBump, deliveredBump, formatSemver, parseSemver, satisfiesBump } from "./semver.js";
import type { Json, Mode, Schema } from "./types.js";
import { VERSION } from "./version.js";

const USAGE = `schemver ${VERSION} — diff two JSON Schemas, classify every change as breaking, risky, or additive

Usage:
  schemver diff <old-schema.json> <new-schema.json> [options]
  schemver bump <old-schema.json> <new-schema.json> --current <x.y.z> [--check <x.y.z>] [options]
  schemver rules [--json]

Commands:
  diff    per-path change report with a semver verdict
  bump    print the required bump and the next version; --check gates a proposed one
  rules   print every rule code the engine can emit

Options:
  --mode <backward|forward|full>   whose data must keep validating (default: backward)
  --strict                         treat risky changes as breaking
  --fail-on <breaking|risky|any|none>
                                   when diff exits 1 (default: breaking)
  --current <x.y.z>                the released version (bump command)
  --check <x.y.z>                  the version you intend to release (bump command)
  --json                           machine output
  --help, --version

Exit codes: 0 ok · 1 gate tripped / proposed version insufficient · 2 usage or input error`;

const COMMON_FLAGS = [
  { name: "mode" },
  { name: "strict", boolean: true },
  { name: "fail-on" },
  { name: "current" },
  { name: "check" },
  { name: "json", boolean: true },
  { name: "help", boolean: true },
  { name: "version", boolean: true },
];

interface LoadedSchema {
  schema: Schema;
  info: SourceInfo;
}

function loadSchema(path: string): LoadedSchema {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    throw new UsageError(`cannot read ${path}: ${(error as Error).message}`);
  }
  let parsed: Json;
  try {
    parsed = JSON.parse(text) as Json;
  } catch (error) {
    throw new UsageError(`${path} is not valid JSON: ${(error as Error).message}`);
  }
  if (typeof parsed !== "boolean" && !isObject(parsed)) {
    throw new UsageError(`${path} is not a JSON Schema (expected an object or boolean, got ${Array.isArray(parsed) ? "an array" : JSON.stringify(parsed)})`);
  }
  const schema = parsed as Schema;
  return { schema, info: { source: path, dialect: dialectLabel(schema) } };
}

function loadPair(parsed: ParsedArgs, command: string): [LoadedSchema, LoadedSchema] {
  const [oldPath, newPath, ...rest] = parsed.positionals;
  if (oldPath === undefined || newPath === undefined) {
    throw new UsageError(`${command} needs two schema files: schemver ${command} <old> <new>`);
  }
  if (rest.length > 0) {
    throw new UsageError(`unexpected argument: ${rest[0]}`);
  }
  return [loadSchema(oldPath), loadSchema(newPath)];
}

/**
 * Reject flags that belong to a different command instead of silently
 * ignoring them — `schemver diff --check 2.0.0` must not leave the user
 * believing the version gate is active.
 */
function rejectForeignFlags(parsed: ParsedArgs, foreign: [name: string, hint: string][]): void {
  for (const [name, hint] of foreign) {
    if (parsed.flags.has(name)) throw new UsageError(`--${name} ${hint}`);
  }
}

function runDiff(parsed: ParsedArgs, out: (line: string) => void): number {
  rejectForeignFlags(parsed, [
    ["current", `belongs to the bump command — did you mean "schemver bump"?`],
    ["check", `belongs to the bump command — did you mean "schemver bump"? (diff gates via --fail-on)`],
  ]);
  const mode = enumFlag<Mode>(parsed, "mode", ["backward", "forward", "full"], "backward");
  const failOn = enumFlag<FailOn>(parsed, "fail-on", ["breaking", "risky", "any", "none"], "breaking");
  const strict = parsed.flags.get("strict") === true;
  const [oldSide, newSide] = loadPair(parsed, "diff");
  const report = diffSchemas(oldSide.schema, newSide.schema, { mode, strict });
  const trips = gateTrips(report, failOn);
  if (parsed.flags.get("json") === true) {
    out(renderJson(report, oldSide.info, newSide.info, { gate: { failOn, trips } }));
  } else {
    out(renderDiffText(report, oldSide.info, newSide.info));
  }
  return trips ? 1 : 0;
}

function runBump(parsed: ParsedArgs, out: (line: string) => void): number {
  rejectForeignFlags(parsed, [
    ["fail-on", "belongs to the diff command — bump gates via --check <x.y.z>"],
  ]);
  const mode = enumFlag<Mode>(parsed, "mode", ["backward", "forward", "full"], "backward");
  const strict = parsed.flags.get("strict") === true;
  const currentRaw = parsed.flags.get("current");
  if (typeof currentRaw !== "string") {
    throw new UsageError("bump needs --current <x.y.z> (the released version)");
  }
  const current = parseSemver(currentRaw);
  if (current === undefined) {
    throw new UsageError(`--current ${currentRaw} is not a semver version`);
  }
  const [oldSide, newSide] = loadPair(parsed, "bump");
  const report = diffSchemas(oldSide.schema, newSide.schema, { mode, strict });
  const next = formatSemver(applyBump(current, report.bump));

  const checkRaw = parsed.flags.get("check");
  let check: { proposed: string; satisfies: boolean; delivered: ReturnType<typeof deliveredBump> } | undefined;
  if (typeof checkRaw === "string") {
    const proposed = parseSemver(checkRaw);
    if (proposed === undefined) {
      throw new UsageError(`--check ${checkRaw} is not a semver version`);
    }
    check = {
      proposed: formatSemver(proposed),
      satisfies: satisfiesBump(current, proposed, report.bump),
      delivered: deliveredBump(current, proposed),
    };
  }

  if (parsed.flags.get("json") === true) {
    const semver: { [key: string]: Json } = {
      current: formatSemver(current),
      required: report.bump,
      next,
    };
    if (check !== undefined) {
      semver.proposed = check.proposed;
      semver.satisfies = check.satisfies;
      semver.delivered = check.delivered ?? null;
    }
    out(renderJson(report, oldSide.info, newSide.info, { semver }));
  } else {
    out(renderBumpText(report, oldSide.info, newSide.info, formatSemver(current), next, check));
  }
  return check !== undefined && !check.satisfies ? 1 : 0;
}

function runRules(parsed: ParsedArgs, out: (line: string) => void): number {
  if (parsed.positionals.length > 0) {
    throw new UsageError(`unexpected argument: ${parsed.positionals[0]}`);
  }
  rejectForeignFlags(
    parsed,
    ["mode", "strict", "fail-on", "current", "check"].map((name) => [
      name,
      "does not apply to the rules command",
    ]),
  );
  if (parsed.flags.get("json") === true) {
    out(
      JSON.stringify(
        { tool: "schemver", version: VERSION, rules: RULES.map((rule) => ({ ...rule })) },
        null,
        2,
      ),
    );
    return 0;
  }
  const codeWidth = Math.max(...RULES.map((rule) => rule.code.length));
  const keywordWidth = Math.max(...RULES.map((rule) => rule.keyword.length));
  const effectWidth = Math.max(...RULES.map((rule) => rule.effect.length));
  out(`schemver ${VERSION} — ${RULES.length} rules (effect column: typical acceptance effect)`);
  out("");
  for (const rule of RULES) {
    out(
      `${rule.code.padEnd(codeWidth)}  ${rule.keyword.padEnd(keywordWidth)}  ${rule.effect.padEnd(effectWidth)}  ${rule.summary}`,
    );
  }
  return 0;
}

/** Entry point, exported for tests. Returns the process exit code. */
export function main(argv: string[], out: (line: string) => void, err: (line: string) => void): number {
  let parsed: ParsedArgs;
  try {
    parsed = parseArgs(argv, COMMON_FLAGS);
  } catch (error) {
    err(`schemver: ${(error as Error).message}`);
    err(`Run "schemver --help" for usage.`);
    return 2;
  }

  if (parsed.flags.get("version") === true) {
    out(VERSION);
    return 0;
  }
  if (parsed.flags.get("help") === true || parsed.positionals.length === 0) {
    out(USAGE);
    return parsed.flags.get("help") === true ? 0 : 2;
  }

  const [command, ...rest] = parsed.positionals;
  const restParsed: ParsedArgs = { positionals: rest, flags: parsed.flags };
  try {
    switch (command) {
      case "diff":
        return runDiff(restParsed, out);
      case "bump":
        return runBump(restParsed, out);
      case "rules":
        return runRules(restParsed, out);
      default:
        throw new UsageError(`unknown command: ${command}`);
    }
  } catch (error) {
    if (error instanceof UsageError) {
      err(`schemver: ${error.message}`);
      err(`Run "schemver --help" for usage.`);
      return 2;
    }
    throw error;
  }
}

// Exit quietly when the reader goes away (`schemver rules | head`) instead
// of crashing with an unhandled EPIPE — standard pipeline etiquette.
const exitOnEpipe = (error: Error & { code?: string }): void => {
  if (error.code === "EPIPE") process.exit(0);
  throw error;
};
process.stdout.on("error", exitOnEpipe);
process.stderr.on("error", exitOnEpipe);

process.exitCode = main(
  process.argv.slice(2),
  (line) => process.stdout.write(`${line}\n`),
  (line) => process.stderr.write(`${line}\n`),
);
