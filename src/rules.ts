/**
 * The rule registry: every change the engine can emit, in one
 * auditable table. `schemver rules` prints it, docs/rules.md documents
 * it, and the test suite asserts the engine never emits a code that is
 * not listed here.
 *
 * `effect` is the *typical* acceptance effect of the rule. A handful of
 * rules are direction-dependent (bounds move both ways) — those are
 * marked `varies`. The effect actually attached to an emitted change is
 * always computed from the concrete values, then flipped if the change
 * sits under an odd number of `not`s.
 */
import type { Effect } from "./types.js";

export interface Rule {
  /** Stable identifier, e.g. `required-added`. */
  code: string;
  /** The keyword (or keyword family) the rule watches. */
  keyword: string;
  /** Typical acceptance effect, or `varies` for direction-dependent rules. */
  effect: Effect | "varies";
  /** One line: what the rule fires on and why a consumer cares. */
  summary: string;
}

export const RULES: readonly Rule[] = [
  // --- types -------------------------------------------------------------
  {
    code: "type-removed",
    keyword: "type",
    effect: "narrowed",
    summary: "an instance type the old schema accepted is no longer allowed",
  },
  {
    code: "type-added",
    keyword: "type",
    effect: "widened",
    summary: "the new schema accepts an instance type the old one rejected",
  },
  // --- values ------------------------------------------------------------
  {
    code: "enum-values-removed",
    keyword: "enum",
    effect: "narrowed",
    summary: "previously legal enum values are now rejected",
  },
  {
    code: "enum-values-added",
    keyword: "enum",
    effect: "widened",
    summary: "new enum values appear that old consumers may not handle",
  },
  {
    code: "enum-added",
    keyword: "enum",
    effect: "narrowed",
    summary: "values are now restricted to a fixed list",
  },
  {
    code: "enum-removed",
    keyword: "enum",
    effect: "widened",
    summary: "the fixed value list was dropped; anything type-valid passes",
  },
  {
    code: "const-added",
    keyword: "const",
    effect: "narrowed",
    summary: "the value is now pinned to a single constant",
  },
  {
    code: "const-removed",
    keyword: "const",
    effect: "widened",
    summary: "the pinned constant was dropped",
  },
  {
    code: "const-changed",
    keyword: "const",
    effect: "changed",
    summary: "the pinned constant was replaced — breaks both directions",
  },
  // --- bounds ------------------------------------------------------------
  {
    code: "bound-tightened",
    keyword: "min*/max*",
    effect: "narrowed",
    summary: "a numeric/length/count bound now excludes previously valid data",
  },
  {
    code: "bound-relaxed",
    keyword: "min*/max*",
    effect: "widened",
    summary: "a bound was loosened or dropped; more instances validate",
  },
  {
    code: "multipleof-tightened",
    keyword: "multipleOf",
    effect: "narrowed",
    summary: "the new step divides evenly into fewer values",
  },
  {
    code: "multipleof-relaxed",
    keyword: "multipleOf",
    effect: "widened",
    summary: "the new step accepts every old value and more",
  },
  {
    code: "multipleof-changed",
    keyword: "multipleOf",
    effect: "changed",
    summary: "the steps are incommensurable — both directions lose values",
  },
  {
    code: "uniqueitems-required",
    keyword: "uniqueItems",
    effect: "narrowed",
    summary: "arrays with duplicate items are now rejected",
  },
  {
    code: "uniqueitems-dropped",
    keyword: "uniqueItems",
    effect: "widened",
    summary: "duplicate items are now allowed",
  },
  // --- strings -----------------------------------------------------------
  {
    code: "pattern-added",
    keyword: "pattern",
    effect: "narrowed",
    summary: "strings must now match a regular expression",
  },
  {
    code: "pattern-removed",
    keyword: "pattern",
    effect: "widened",
    summary: "the regular-expression requirement was dropped",
  },
  {
    code: "pattern-changed",
    keyword: "pattern",
    effect: "unknown",
    summary: "regex containment is undecidable statically — review by hand",
  },
  {
    code: "format-changed",
    keyword: "format",
    effect: "unknown",
    summary: "format is an annotation by default but many validators enforce it",
  },
  {
    code: "content-changed",
    keyword: "contentMediaType/contentEncoding",
    effect: "unknown",
    summary: "content keywords are annotations, but consumers decode by them",
  },
  // --- objects -----------------------------------------------------------
  {
    code: "required-added",
    keyword: "required",
    effect: "narrowed",
    summary: "a property is now mandatory; instances without it are rejected",
  },
  {
    code: "required-removed",
    keyword: "required",
    effect: "widened",
    summary: "a property is now optional; readers can no longer count on it",
  },
  {
    code: "property-added",
    keyword: "properties",
    effect: "widened",
    summary: "a new property is declared where the old schema forbade extras",
  },
  {
    code: "property-added-was-open",
    keyword: "properties",
    effect: "unknown",
    summary:
      "the property was previously accepted with any value; data that misses the new subschema becomes invalid",
  },
  {
    code: "property-removed-now-forbidden",
    keyword: "properties",
    effect: "narrowed",
    summary: "the property was dropped and extras are forbidden — data carrying it is rejected",
  },
  {
    code: "property-removed-now-open",
    keyword: "properties",
    effect: "unknown",
    summary: "the property is no longer described; values drift without validation errors",
  },
  {
    code: "additionalproperties-forbidden",
    keyword: "additionalProperties",
    effect: "narrowed",
    summary: "undeclared properties are now rejected",
  },
  {
    code: "additionalproperties-allowed",
    keyword: "additionalProperties",
    effect: "widened",
    summary: "undeclared properties are now accepted",
  },
  {
    code: "patternproperties-added",
    keyword: "patternProperties",
    effect: "unknown",
    summary: "a new name pattern constrains properties that were previously free",
  },
  {
    code: "patternproperties-removed",
    keyword: "patternProperties",
    effect: "unknown",
    summary: "a name pattern was dropped; matching properties are unvalidated",
  },
  {
    code: "propertynames-added",
    keyword: "propertyNames",
    effect: "narrowed",
    summary: "property names must now validate against a schema",
  },
  {
    code: "propertynames-removed",
    keyword: "propertyNames",
    effect: "widened",
    summary: "the property-name constraint was dropped",
  },
  {
    code: "dependency-added",
    keyword: "dependentRequired/dependentSchemas",
    effect: "narrowed",
    summary: "presence of a property now triggers extra requirements",
  },
  {
    code: "dependency-removed",
    keyword: "dependentRequired/dependentSchemas",
    effect: "widened",
    summary: "a presence-triggered requirement was dropped",
  },
  // --- arrays ------------------------------------------------------------
  {
    code: "items-constrained",
    keyword: "items/contains",
    effect: "narrowed",
    summary: "array items (or a contains requirement) are newly constrained",
  },
  {
    code: "items-unconstrained",
    keyword: "items/contains",
    effect: "widened",
    summary: "an item or contains constraint was dropped",
  },
  {
    code: "prefixitems-extended",
    keyword: "prefixItems",
    effect: "unknown",
    summary: "the tuple grew; new positions leave the old items regime",
  },
  {
    code: "prefixitems-shortened",
    keyword: "prefixItems",
    effect: "unknown",
    summary: "the tuple shrank; trailing positions fall back to items",
  },
  // --- combinators ---------------------------------------------------------
  {
    code: "allof-arm-added",
    keyword: "allOf",
    effect: "narrowed",
    summary: "another schema must now also validate",
  },
  {
    code: "allof-arm-removed",
    keyword: "allOf",
    effect: "widened",
    summary: "one conjoined schema no longer needs to validate",
  },
  {
    code: "anyof-arm-added",
    keyword: "anyOf",
    effect: "widened",
    summary: "a new alternative accepts instances the old schema rejected",
  },
  {
    code: "anyof-arm-removed",
    keyword: "anyOf",
    effect: "narrowed",
    summary: "an alternative was removed; instances that matched only it fail",
  },
  {
    code: "not-added",
    keyword: "not",
    effect: "narrowed",
    summary: "instances matching the excluded schema are now rejected",
  },
  {
    code: "not-removed",
    keyword: "not",
    effect: "widened",
    summary: "a previously excluded shape is accepted again",
  },
  {
    code: "oneof-arms-changed",
    keyword: "oneOf",
    effect: "unknown",
    summary: "oneOf arms were added or removed — exclusivity effects are undecidable",
  },
  {
    code: "conditional-changed",
    keyword: "if/then/else",
    effect: "unknown",
    summary: "a conditional branch changed; applicability depends on the data",
  },
  // --- references ----------------------------------------------------------
  {
    code: "ref-unresolved",
    keyword: "$ref",
    effect: "unknown",
    summary: "a $ref could not be resolved locally; the target was not compared",
  },
  // --- annotations & behavior ----------------------------------------------
  {
    code: "default-changed",
    keyword: "default",
    effect: "unknown",
    summary: "validation is unaffected, but fill-in behavior changes at runtime",
  },
  {
    code: "access-changed",
    keyword: "readOnly/writeOnly",
    effect: "unknown",
    summary: "the read/write contract of the value changed",
  },
  {
    code: "deprecated-toggled",
    keyword: "deprecated",
    effect: "metadata",
    summary: "the deprecation annotation changed; validation is untouched",
  },
  {
    code: "annotation-changed",
    keyword: "title/description/examples/$comment",
    effect: "metadata",
    summary: "documentation-only change",
  },
  {
    code: "unevaluated-changed",
    keyword: "unevaluatedProperties/unevaluatedItems",
    effect: "unknown",
    summary: "unevaluated* interacts with combinators; effect depends on siblings",
  },
  {
    code: "keyword-unknown",
    keyword: "(extension)",
    effect: "unknown",
    summary: "an unrecognized keyword changed; schemver cannot judge its effect",
  },
] as const;

const BY_CODE = new Map(RULES.map((rule) => [rule.code, rule]));

/** Look up a rule by code. */
export function ruleByCode(code: string): Rule | undefined {
  return BY_CODE.get(code);
}
