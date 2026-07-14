# schemver examples

Three versions of a `user.created` event schema, committed as plain
JSON Schema (draft 2020-12) files. All commands below run from the
repository root after `npm install && npm run build`; replace
`node dist/cli.js` with `schemver` if you installed the package
globally.

## Files

- `user-v1.json` — the released contract: a closed object with `id`,
  `email`, `plan` (enum `free`/`pro`/`enterprise`), optional `age`,
  `tags`, and `referrer`.
- `user-v2.json` — the "cleanup" release that actually breaks five
  things: `signup_source` becomes required, the `free` plan is dropped,
  `age` gains a floor of 13, `email` shrinks to 254 chars, and
  `referrer` disappears from a closed object. It also carries two risky
  edits (a `format` swap and a new `default`) and genuine additive
  changes (a `team` plan, an optional `nickname`, a bigger `maxItems`).
- `user-v2.1.json` — a well-behaved follow-up: only widenings and a
  documentation edit, so the default gate stays green.

## Try it

The flagship diff — everything v2 does to v1's consumers, with reasons:

```bash
node dist/cli.js diff examples/user-v1.json examples/user-v2.json
```

Exit code 1: five breaking changes under backward compatibility. The
well-behaved release passes:

```bash
node dist/cli.js diff examples/user-v2.json examples/user-v2.1.json
```

Flip the perspective — for a response schema, the additive release is
what breaks old *readers*:

```bash
node dist/cli.js diff examples/user-v2.json examples/user-v2.1.json --mode forward
```

Let schemver pick the version number, or veto yours:

```bash
node dist/cli.js bump examples/user-v1.json examples/user-v2.json --current 1.4.2
node dist/cli.js bump examples/user-v1.json examples/user-v2.json --current 1.4.2 --check 1.5.0
```

The second command exits 1: `1.5.0` delivers a minor bump where the
diff requires a major. Add `--json` to any command for machine output.
