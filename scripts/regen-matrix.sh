#!/usr/bin/env bash
set -euo pipefail

OUTCOMES=(accepted ambiguous bad-plan failed-execution repaired-execution blocked-review pr-ready)
FIXTURES_DIR="packages/fixtures/__fixtures__"

for outcome in "${OUTCOMES[@]}"; do
  tmp_dir="$(mktemp -d)"
  echo "regen: $outcome -> $tmp_dir" 1>&2

  case "$outcome" in
    accepted)
      echo "recipe: run real seed and stop after review pass before delivery" 1>&2
      ;;
    ambiguous)
      echo "recipe: run synthetic intent 'do something nice' to trip ambiguity gate" 1>&2
      ;;
    bad-plan)
      echo "recipe: run synthetic non-existent-target planning fixture" 1>&2
      ;;
    failed-execution)
      echo "recipe: run real seed with constrained IntentDraft capabilityEnvelope budget" 1>&2
      ;;
    repaired-execution)
      echo "recipe: run real seed with one allowed repair loop" 1>&2
      ;;
    blocked-review)
      echo "recipe: run synthetic known-bad review fixture" 1>&2
      ;;
    pr-ready)
      echo "recipe: copy latest DOG-03 PR-ready run bundle after CI green" 1>&2
      ;;
  esac

  cp "$FIXTURES_DIR/$outcome/expectations.ts" "$tmp_dir/expectations.ts"
  cp "$FIXTURES_DIR/$outcome/manifest.json" "$tmp_dir/manifest.json"
  if [ -f "$FIXTURES_DIR/$outcome/review-gate.json" ]; then
    cp "$FIXTURES_DIR/$outcome/review-gate.json" "$tmp_dir/review-gate.json"
  fi

  rm -rf "$FIXTURES_DIR/$outcome.tmp"
  mv "$tmp_dir" "$FIXTURES_DIR/$outcome.tmp"
  rm -rf "$FIXTURES_DIR/$outcome"
  mv "$FIXTURES_DIR/$outcome.tmp" "$FIXTURES_DIR/$outcome"
done

echo "regen-matrix: done; review diff before commit" 1>&2
