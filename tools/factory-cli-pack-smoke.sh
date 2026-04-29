#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP_DIR="$(mktemp -d)"
cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

cd "$ROOT"

pnpm --filter @protostar/factory-cli build
PACK_OUTPUT="$(pnpm --filter @protostar/factory-cli pack --pack-destination "$TMP_DIR")"
TARBALL="$(printf '%s\n' "$PACK_OUTPUT" | tail -1)"
if [[ "$TARBALL" != /* ]]; then
  TARBALL="$TMP_DIR/$TARBALL"
fi

npm install --prefix "$TMP_DIR/prefix" "$TARBALL" >/dev/null
HELP_OUTPUT="$("$TMP_DIR/prefix/node_modules/.bin/protostar-factory" --help)"

grep -q "Usage:" <<<"$HELP_OUTPUT"
grep -q "protostar-factory" <<<"$HELP_OUTPUT"

printf 'factory-cli pack smoke passed: %s\n' "$TARBALL"
