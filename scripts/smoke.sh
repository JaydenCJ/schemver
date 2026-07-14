#!/usr/bin/env bash
# Smoke test for schemver: exercises the real CLI end to end against the
# committed example schemas. No network, idempotent, runs from a clean
# checkout (after `npm install`). Prints "SMOKE OK" on success.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."
ROOT="$(pwd)"

WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT

fail() {
  echo "SMOKE FAIL: $1" >&2
  exit 1
}

V1=examples/user-v1.json
V2=examples/user-v2.json
V21=examples/user-v2.1.json

# 1. Build (idempotent).
npm run build >/dev/null 2>&1 || fail "npm run build failed"
CLI="node $ROOT/dist/cli.js"
echo "[smoke] build ok"

# 2. --version matches package.json; --help documents every command.
PKG_VERSION="$(node -p "require('$ROOT/package.json').version")"
CLI_VERSION="$($CLI --version)"
[ "$CLI_VERSION" = "$PKG_VERSION" ] || fail "--version mismatch: $CLI_VERSION != $PKG_VERSION"
HELP="$($CLI --help)"
for word in diff bump rules --mode --fail-on --strict "Exit codes"; do
  echo "$HELP" | grep -q -- "$word" || fail "--help missing $word"
done
echo "[smoke] --help/--version ok ($CLI_VERSION)"

# 3. Error handling: bad flags, bad values and bad inputs exit 2.
set +e
$CLI diff "$V1" "$V2" --frobnicate >/dev/null 2>&1; [ $? -eq 2 ] || { set -e; fail "unknown flag should exit 2"; }
$CLI diff "$V1" >/dev/null 2>&1; [ $? -eq 2 ] || { set -e; fail "missing operand should exit 2"; }
$CLI diff missing.json "$V2" >/dev/null 2>&1; [ $? -eq 2 ] || { set -e; fail "missing file should exit 2"; }
$CLI diff "$V1" "$V2" --mode sideways >/dev/null 2>&1; [ $? -eq 2 ] || { set -e; fail "bad mode should exit 2"; }
$CLI bump "$V1" "$V2" --current oops >/dev/null 2>&1; [ $? -eq 2 ] || { set -e; fail "bad --current should exit 2"; }
printf 'not json' > "$WORKDIR/broken.json"
$CLI diff "$WORKDIR/broken.json" "$V2" >/dev/null 2>&1; [ $? -eq 2 ] || { set -e; fail "invalid JSON should exit 2"; }
set -e
echo "[smoke] error handling ok (exit 2)"

# 4. The flagship diff: v1 → v2 has breaking changes — exit 1.
set +e
DIFF="$($CLI diff "$V1" "$V2")"; DIFF_EXIT=$?
set -e
[ "$DIFF_EXIT" -eq 1 ] || fail "diff should exit 1 at the default gate, got $DIFF_EXIT"
for want in "BREAKING (5)" "required-added" 'enum value "free" removed' \
            "property-removed-now-forbidden" "format-changed" "verdict: MAJOR"; do
  echo "$DIFF" | grep -qF "$want" || fail "diff output missing: $want"
done
echo "[smoke] breaking diff ok (exit 1, per-path reasons present)"

# 5. A purely additive release passes the default gate — exit 0.
ADDITIVE="$($CLI diff "$V2" "$V21")" || fail "additive diff should exit 0"
echo "$ADDITIVE" | grep -qF "BREAKING (0)" || fail "additive diff should have no breaking changes"
echo "$ADDITIVE" | grep -qF "verdict: MINOR" || fail "additive diff should be MINOR"
echo "[smoke] additive diff ok (exit 0)"

# 6. Modes flip the verdict; --fail-on tunes the gate.
set +e
$CLI diff "$V2" "$V21" --mode forward >/dev/null; [ $? -eq 1 ] || { set -e; fail "forward mode should break on widening"; }
$CLI diff "$V2" "$V21" --fail-on any >/dev/null; [ $? -eq 1 ] || { set -e; fail "--fail-on any should trip"; }
set -e
$CLI diff "$V1" "$V2" --fail-on none >/dev/null || fail "--fail-on none should exit 0"
echo "[smoke] modes and --fail-on gate ok"

# 7. --json is valid, carries the verdict, and two runs are byte-identical.
A="$($CLI diff "$V1" "$V2" --json --fail-on none)"
B="$($CLI diff "$V1" "$V2" --json --fail-on none)"
[ "$A" = "$B" ] || fail "diff --json is not deterministic"
echo "$A" | node -e "
  const d = JSON.parse(require('fs').readFileSync(0, 'utf8'));
  if (d.tool !== 'schemver') throw new Error('tool');
  if (d.bump !== 'major') throw new Error('bump');
  if (d.summary.breaking !== 5) throw new Error('summary: ' + JSON.stringify(d.summary));
  if (!d.changes.some(c => c.path === '/signup_source' && c.code === 'required-added')) throw new Error('changes');
  if (d.gate.trips !== false) throw new Error('gate');
" || fail "diff --json is not structurally intact"
echo "[smoke] --json + determinism ok"

# 8. bump: required bump, next version, and the --check gate.
BUMP="$($CLI bump "$V1" "$V2" --current 1.4.2)" || fail "bump should exit 0 without --check"
echo "$BUMP" | grep -qE "required bump +major" || fail "bump should require major"
echo "$BUMP" | grep -qE "next +2\.0\.0" || fail "bump should suggest 2.0.0"
set +e
$CLI bump "$V1" "$V2" --current 1.4.2 --check 1.5.0 >/dev/null; [ $? -eq 1 ] || { set -e; fail "--check 1.5.0 should be insufficient"; }
set -e
$CLI bump "$V1" "$V2" --current 1.4.2 --check 2.0.0 >/dev/null || fail "--check 2.0.0 should pass"
echo "[smoke] bump + --check gate ok"

# 9. Identical schemas: verdict NONE, no changes.
cp "$V1" "$WORKDIR/same.json"
SAME="$($CLI diff "$V1" "$WORKDIR/same.json")" || fail "identical schemas should exit 0"
echo "$SAME" | grep -qF "verdict: NONE" || fail "identical schemas should be NONE"
echo "[smoke] identical schemas ok (NONE)"

# 10. rules documents the registry, including the polarity-sensitive ones.
RULES="$($CLI rules)"
for code in required-added property-removed-now-forbidden pattern-changed oneof-arms-changed keyword-unknown; do
  echo "$RULES" | grep -q "^$code " || fail "rules missing $code"
done
echo "[smoke] rules registry ok"

# 11. Pipeline etiquette: a reader that hangs up early (head) must not crash the CLI.
PIPED="$($CLI rules 2>&1 | head -n 2)" || fail "rules | head should not fail"
echo "$PIPED" | grep -q "EPIPE" && fail "CLI crashed with EPIPE when piped to head"
echo "[smoke] early-close pipe ok (no EPIPE crash)"

echo "SMOKE OK"
