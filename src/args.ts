/**
 * A tiny, dependency-free argv parser: positionals plus a declared set
 * of flags (`--flag value` or `--flag=value`). Unknown flags are hard
 * errors — a CI gate must never silently ignore a typo like
 * `--fail-onn breaking`.
 */

export interface FlagSpec {
  /** Flag name without the leading dashes. */
  name: string;
  /** Boolean flags take no value. */
  boolean?: boolean;
}

export interface ParsedArgs {
  positionals: string[];
  flags: Map<string, string | true>;
}

export class UsageError extends Error {}

/** Parse argv against the declared flags. Throws UsageError on misuse. */
export function parseArgs(argv: string[], specs: FlagSpec[]): ParsedArgs {
  const byName = new Map(specs.map((spec) => [spec.name, spec]));
  const positionals: string[] = [];
  const flags = new Map<string, string | true>();
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] as string;
    if (!arg.startsWith("--")) {
      if (arg.startsWith("-") && arg !== "-") {
        throw new UsageError(`unknown option: ${arg}`);
      }
      positionals.push(arg);
      continue;
    }
    const eq = arg.indexOf("=");
    const name = eq >= 0 ? arg.slice(2, eq) : arg.slice(2);
    const spec = byName.get(name);
    if (spec === undefined) throw new UsageError(`unknown option: --${name}`);
    if (spec.boolean === true) {
      if (eq >= 0) throw new UsageError(`--${name} takes no value`);
      flags.set(name, true);
      continue;
    }
    let value: string;
    if (eq >= 0) {
      value = arg.slice(eq + 1);
    } else {
      const next = argv[i + 1];
      if (next === undefined) throw new UsageError(`--${name} requires a value`);
      value = next;
      i += 1;
    }
    flags.set(name, value);
  }
  return { positionals, flags };
}

/** Read a string flag with a validated set of allowed values. */
export function enumFlag<T extends string>(
  parsed: ParsedArgs,
  name: string,
  allowed: readonly T[],
  fallback: T,
): T {
  const value = parsed.flags.get(name);
  if (value === undefined) return fallback;
  if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) {
    throw new UsageError(`--${name} must be one of: ${allowed.join(", ")}`);
  }
  return value as T;
}
