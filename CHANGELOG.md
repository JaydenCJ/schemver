# Changelog

All notable changes to this project are documented in this file.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [0.1.0] - 2026-07-13

### Added

- The flagship `diff` command: walk two JSON Schemas in parallel and
  classify every change as **breaking**, **risky**, or **additive**
  under a chosen compatibility mode (`backward`, `forward`, `full`),
  with a per-path reason, the old/new values, and a semver verdict
  (`major`/`minor`/`patch`/`none`) for the whole change set.
- An acceptance-effect engine that reasons about the *set of accepted
  instances*, not text: bounds that tighten vs. relax (including
  `minimum`/`exclusiveMinimum` compared as one effective bound and
  draft-04 boolean exclusives), `multipleOf` divisibility with
  float-tolerant arithmetic, enum/const treated as one value-set
  constraint, and `number`⊃`integer` subtyping.
- Compatibility-aware object rules: properties added or removed are
  judged against what actually governed them (`additionalProperties`,
  `patternProperties`) — added to a closed object is additive, added
  over an open one is risky, removed while extras are forbidden is
  breaking, removed into an open object is drift.
- Polarity tracking through `not`: a constraint tightened inside a
  `not` correctly reports as a *widening* of the outer schema (and a
  double `not` cancels the flip).
- Honest `risky` verdicts where static analysis cannot decide: rewritten
  `pattern` regexes, `format`/content keyword drift, `oneOf` arm churn,
  `if`/`then`/`else` edits, `default` changes, `unevaluated*`, unknown
  extension keywords, and unresolvable `$ref`s.
- Cross-draft normalization so old and new drafts diff on equal
  footing: boolean schemas, array-form `items`/`additionalItems` →
  `prefixItems`/`items`, draft-07 `dependencies` → `dependentRequired`/
  `dependentSchemas`, single-value `enum` → `const`.
- Local `$ref` resolution through JSON Pointers with sibling-keyword
  merging, cycle breaking for recursive schemas, and trust-but-flag
  handling of external refs.
- The `bump` command: compute the required bump and the next version
  from `--current`, and gate a proposed release with `--check` (exit 1
  when the proposal under-delivers).
- The `rules` command: print the full 54-rule registry (text or
  `--json`) that every emitted change code traces to.
- A CI exit-code gate: `--fail-on breaking` (default), `risky`, `any`,
  or `none`; `--strict` promotes risky changes to breaking; exit codes
  are script-friendly (0 ok / 1 gate tripped / 2 usage or input error).
- Public programmatic API (`diffSchemas`, `walkSchemas`, `severityFor`,
  `parseSemver`, `gateTrips`, …) with type declarations.
- Committed example schemas — a `user.created` event in three versions
  (v1 → v2 breaking, v2 → v2.1 additive) — used by the README, the
  test suite, and the smoke script.
- Test suite: 91 node:test tests (engine units + CLI integration as a
  child process) and an end-to-end `scripts/smoke.sh` against the
  bundled examples.

[0.1.0]: https://github.com/JaydenCJ/schemver/releases/tag/v0.1.0
