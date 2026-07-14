# Contributing to schemver

Issues, discussions and pull requests are all welcome — this project
aims to stay small, zero-dependency at runtime, fully offline, and
honest about what static schema analysis can and cannot decide.

## Getting started

Requirements: Node.js >= 22.13 (for the stable `node:test` runner used by the suite).

```bash
git clone https://github.com/JaydenCJ/schemver.git
cd schemver
npm install            # installs typescript, the only devDependency
npm run build          # compile TypeScript to dist/
npm test               # build + 91 node:test tests
bash scripts/smoke.sh  # end-to-end CLI check against examples/
```

`scripts/smoke.sh` exercises the real CLI (the flagship breaking diff
and its exit codes, mode flips, every `--fail-on` gate level, JSON
output with deterministic re-runs, and the `bump --check` gate) against
the bundled example schemas and must print `SMOKE OK`.

## Before you open a pull request

1. `npx tsc -p tsconfig.json --noEmit` — the tree must type-check clean (strict mode is enforced).
2. `npm test` — all tests must pass.
3. `bash scripts/smoke.sh` — must print `SMOKE OK`.
4. Add tests for behavior changes; keep logic in pure, unit-testable
   modules (the engine takes schemas and returns changes — only
   `cli.ts` touches the filesystem or the process).
5. Changes to rule directions are compatibility-relevant: a wrong
   narrow/widen call flips a CI verdict. Explain the acceptance-set
   reasoning in the PR, register any new code in `src/rules.ts`, and
   update [docs/rules.md](docs/rules.md).

## Ground rules

- **No runtime dependencies.** The zero-dependency install is a core
  feature; adding one needs justification in the PR and will usually be
  declined. The semver parser and the JSON pointer walker are in-repo
  on purpose.
- No network calls, ever — schemver reads local files only. `$ref`
  targets outside the document are reported as risky, never fetched.
- Determinism is API: same schemas and same version, byte-identical
  report, change order and exit code — no clocks, no randomness, no
  locale-dependent comparisons.
- Never guess: when an effect is statically undecidable (regex
  rewrites, `oneOf` arm churn, unknown keywords), the verdict is
  `risky` with a reason — not a silent pass and not a fabricated
  direction.
- Code comments and doc comments are written in English.

## Reporting bugs

Please include: `schemver --version` output, the exact command line,
and a *minimal* pair of schemas that reproduces the problem — a change
the engine missed, or one it classified in the wrong direction. Inline
JSON in the issue is perfect; the whole engine is pure, so two small
schemas always reproduce.

## Security

Do not open public issues for security problems (e.g. an input that
makes the walker hang or misreport a breaking change as additive); use
GitHub private vulnerability reporting on this repository instead.
