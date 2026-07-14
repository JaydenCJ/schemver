/**
 * Shared types for the schemver engine.
 *
 * The model in one paragraph: every detected difference between two
 * schemas is a {@link Change} with an *acceptance effect* — did the set
 * of instances the schema accepts get narrower, wider, replaced, or is
 * the effect statically undecidable? A compatibility {@link Mode} then
 * maps effects to severities (breaking / risky / additive), and the
 * severities map to the semver bump the release requires.
 */

/** A JSON value, as parsed from a schema document. */
export type Json =
  | null
  | boolean
  | number
  | string
  | Json[]
  | { [key: string]: Json };

/** A JSON Schema node: an object schema or a boolean schema. */
export type Schema = boolean | SchemaObject;

/** An object-form schema node. Keys are draft keywords or extensions. */
export interface SchemaObject {
  [keyword: string]: Json | undefined;
}

/**
 * How a change moves the set of accepted instances.
 *
 * - `narrowed`  — the new schema accepts strictly less (a constraint
 *   was added or tightened). Old-valid data can become invalid.
 * - `widened`   — the new schema accepts strictly more (a constraint
 *   was removed or relaxed). New-valid data can be unreadable by
 *   consumers built against the old schema.
 * - `changed`   — the accepted set was replaced, not shrunk or grown
 *   (e.g. `const` rewritten). Breaks in both directions.
 * - `unknown`   — the effect cannot be decided statically (a `pattern`
 *   rewrite, a `format` swap, an unrecognized keyword).
 * - `metadata`  — annotations only (`title`, `description`, …);
 *   validation is untouched.
 */
export type Effect = "narrowed" | "widened" | "changed" | "unknown" | "metadata";

/** Consumer-facing severity of one change under the active mode. */
export type Severity = "breaking" | "risky" | "additive";

/**
 * Compatibility mode — whose data must keep validating.
 *
 * - `backward` — instances valid under the OLD schema must stay valid
 *   (protects existing producers; the right mode for request/input and
 *   event schemas whose writers upgrade last).
 * - `forward`  — instances valid under the NEW schema must also be
 *   valid under the old one (protects existing consumers/readers; the
 *   right mode for response/output schemas whose readers upgrade last).
 * - `full`     — both at once; any acceptance change is breaking.
 */
export type Mode = "backward" | "forward" | "full";

/** The semver bump a set of changes requires. */
export type Bump = "major" | "minor" | "patch" | "none";

/** One classified difference between the two schemas. */
export interface Change {
  /** Stable rule code, e.g. `required-added`. Listed by `schemver rules`. */
  code: string;
  /**
   * Instance-space path the change applies to: `/email`, `/tags/*`,
   * `""` for the root. `*` stands for "any array item".
   */
  path: string;
  /** JSON Pointer into the schema document where the change lives. */
  schemaPath: string;
  /** The keyword that changed. */
  keyword: string;
  /** Acceptance effect, already adjusted for `not` polarity. */
  effect: Effect;
  /** Severity under the mode the diff was run with. */
  severity: Severity;
  /** One human sentence explaining the consumer impact. */
  reason: string;
  /** The old value of the keyword, when it helps (JSON). */
  before?: Json;
  /** The new value of the keyword, when it helps (JSON). */
  after?: Json;
}

/** Options accepted by the diff engine. */
export interface DiffOptions {
  /** Compatibility mode. Default: `backward`. */
  mode?: Mode;
  /** Treat `risky` changes as `breaking` (promotes the bump to major). */
  strict?: boolean;
}

/** Aggregate counts by severity. */
export interface Summary {
  breaking: number;
  risky: number;
  additive: number;
}

/** The complete result of diffing two schemas. */
export interface DiffReport {
  mode: Mode;
  strict: boolean;
  changes: Change[];
  summary: Summary;
  /** The semver bump these changes require. */
  bump: Bump;
  /** Number of schema node pairs the walker compared. */
  comparedNodes: number;
}
