# The classification model

This document is the contract behind every verdict schemver prints:
what an "acceptance effect" is, how effects map to severities under
each compatibility mode, and — just as importantly — what the engine
refuses to decide. `schemver rules` prints the full registry of change
codes; the test suite asserts the engine never emits an unregistered
code.

## Acceptance effects

A JSON Schema denotes a *set of instances it accepts*. Every change the
walker detects is tagged with how it moves that set:

| Effect | Meaning | Example |
|---|---|---|
| `narrowed` | The new schema accepts strictly less. | `required` gains a name; `minimum` 0 → 13; an enum value is dropped. |
| `widened` | The new schema accepts strictly more. | a type is added; `maxItems` 10 → 20; `required` loses a name. |
| `changed` | The accepted set was replaced, not shrunk or grown. | `const: "v1"` → `const: "v2"`; `multipleOf` 2 → 3. |
| `unknown` | Undecidable statically. | a rewritten `pattern`; `oneOf` arm churn; an unrecognized keyword. |
| `metadata` | Annotations only; validation untouched. | `title`, `description`, `examples`, `$comment`, `deprecated`. |

Effects are computed from concrete values, not keyword names: raising
`minimum` narrows but lowering it widens; `multipleOf` 2 → 4 narrows
(every multiple of 4 is a multiple of 2) while 2 → 3 is `changed`
because the steps are incommensurable. `minimum`/`exclusiveMinimum`
are compared as one effective bound, so trading one spelling for the
other at the same value reads as a single tightening — not a removal
plus an addition.

### Polarity

Inside `not`, directions invert: tightening the inner schema means the
outer schema rejects less, i.e. *widens*. The walker threads a polarity
bit through the recursion, flips `narrowed`/`widened` under an odd
number of `not`s, and appends an explanation to the reason. A double
`not` cancels out. `changed`, `unknown` and `metadata` are unaffected.

## Modes: whose data must keep validating

| Mode | Protects | `narrowed` | `widened` | Use for |
|---|---|---|---|---|
| `backward` *(default)* | old producers/writers | **breaking** | additive | request bodies, event/message schemas, config files |
| `forward` | old consumers/readers | additive | **breaking** | response bodies, published documents |
| `full` | both | **breaking** | **breaking** | shared contracts where either side may lag |

Mode-independent rows: `changed` is always breaking, `unknown` is
always **risky**, `metadata` is always additive. `--strict` promotes
risky to breaking for teams that prefer a false major over a missed
break.

## The semver ladder

- any breaking change → **major**
- any risky change, or any additive change that moves acceptance → **minor**
- metadata-only changes → **patch**
- no changes → **none**

`schemver bump --current 1.4.2` turns the ladder into a concrete next
version; `--check 1.5.0` exits 1 when the proposal under-delivers.

## Context-aware object rules

Naive diff tools treat `properties` as a plain map. schemver judges
each added or removed property against what *governed* that name
before/after — `patternProperties` first, then `additionalProperties`:

| Change | Old object was | Verdict |
|---|---|---|
| property added | closed (`additionalProperties: false`) | additive — old data cannot carry it |
| property added | open | **risky** — previously any value was legal there |
| property added | governed by a subschema | recursive diff against that subschema |
| property removed | new object closed | **breaking** — data carrying it is rejected |
| property removed | new object open | **risky** — values drift unvalidated |
| property removed | governed by a subschema | recursive diff against that subschema |

The same recursion applies to schema-form `additionalProperties`
(reported at `path/*`), `patternProperties` (at `path/(regex)`),
`items` (at `path/*`), `prefixItems` positions, `propertyNames`,
`dependentSchemas`, and combinator arms.

## What schemver refuses to decide

Honesty is a feature: a wrong "safe" flips a CI gate. These are always
`risky`, with the reason stating why:

- **`pattern` rewrites** — regex containment is undecidable statically.
- **`format` / content keywords** — annotations by spec, assertions in
  many real validators; a swap can reject data in one deployment and
  not another.
- **`oneOf` arm addition/removal** — a new arm can make a previously
  valid instance match *two* arms and fail exclusivity.
- **`if`/`then`/`else` edits** — which instances the branch applies to
  depends on the data.
- **`default` changes** — validation is unaffected, but consumers that
  fill in the default change behavior.
- **`unevaluatedProperties`/`unevaluatedItems`** — their meaning
  depends on sibling combinators and `$ref`s.
- **Unknown extension keywords** — schemver cannot know what `x-foo`
  enforces.

## `$ref` handling and known limits

- Document-local pointers (`#/$defs/…`, `#/definitions/…`) are resolved
  and compared at the ref site's instance path; cycles in recursive
  schemas are broken by tracking the ref pair on the recursion stack.
- Sibling keywords next to `$ref` are merged over the target with the
  sibling winning on conflict — an approximation of 2020-12 semantics
  (where both would apply as separate assertions) that is exact except
  when the target defines the same keyword.
- External refs are never fetched. Identical URLs on both sides are
  trusted as "same target"; differing or dangling refs are `risky`.
- `$anchor`/`$dynamicRef` resolution and unreferenced `$defs` are out
  of scope in 0.1.0: a def nobody points at is invisible to the diff.
- Combinator arms are matched structurally first (reordering is not a
  change); leftover arms pair by position, so heavy simultaneous
  editing of many arms can attribute a change to a neighboring arm —
  the codes and reasons still describe real deltas.
