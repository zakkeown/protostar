#!/usr/bin/env bash
# Dark dogfood driver. No .protostar/dogfood writes; no business logic. Just orchestrates subcommand calls.
set -euo pipefail

RUNS=10
SESSION_ID=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --runs) RUNS="$2"; shift 2 ;;
    --resume) SESSION_ID="$2"; shift 2 ;;
    *) echo "unknown arg: $1" 1>&2; exit 2 ;;
  esac
done

if [[ -z "$SESSION_ID" ]]; then
  SESSION_ID="$(date -u +%Y%m%dT%H%M%SZ)-$RANDOM"
fi

CLI="node apps/factory-cli/dist/main.js"
DOGFOOD_GITHUB_TOKEN="${PROTOSTAR_DOGFOOD_PAT:-${PROTOSTAR_GITHUB_TOKEN:-${GITHUB_TOKEN:-}}}"

$CLI __dogfood-step --session "$SESSION_ID" --action begin --total "$RUNS"

while true; do
  set +e
  SEED_JSON=$($CLI __dogfood-step --session "$SESSION_ID" --action next-seed --json 2>/dev/null)
  RC=$?
  set -e
  if [[ "$RC" -ne 0 ]]; then
    break
  fi

  SEED_DRAFT=$(echo "$SEED_JSON" | jq -r .draftPath)
  CONFIRMED_JSON=$($CLI __dogfood-step --session "$SESSION_ID" --action sign-intent --json)
  CONFIRMED_INTENT=$(echo "$CONFIRMED_JSON" | jq -r .confirmedIntentPath)
  RUN_START="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  BEFORE_SNAPSHOT=$(mktemp)
  $CLI __dogfood-step --session "$SESSION_ID" --action snapshot-runs --out "$BEFORE_SNAPSHOT"

  set +e
  PROTOSTAR_GITHUB_TOKEN="$DOGFOOD_GITHUB_TOKEN" \
  GITHUB_TOKEN="$DOGFOOD_GITHUB_TOKEN" \
    node apps/factory-cli/dist/main.js run \
      --draft "$SEED_DRAFT" \
      --out .protostar/runs \
      --intent-mode brownfield \
      --executor real \
      --planning-mode live \
      --review-mode fixture \
      --exec-coord-mode fixture \
      --delivery-mode auto \
      --trust trusted \
      --confirmed-intent "$CONFIRMED_INTENT" \
      >/dev/null 2>/dev/null
  RUN_RC=$?
  set -e

  RUN_ID=$($CLI __dogfood-step --session "$SESSION_ID" --action discover-run-id --before-snapshot "$BEFORE_SNAPSHOT" 2>/dev/null || echo "")
  if [[ -z "$RUN_ID" ]]; then
    RUN_ID="missing-run-$(date -u +%Y%m%dT%H%M%SZ)-$RANDOM"
  fi

  PR_URL=""
  if [[ "$RUN_RC" -eq 0 && -n "$RUN_ID" ]]; then
    DELIVERY_RESULT=".protostar/runs/$RUN_ID/delivery/delivery-result.json"
    if [[ -f "$DELIVERY_RESULT" ]]; then
      PR_URL=$(jq -r '.prUrl // empty' "$DELIVERY_RESULT" || echo "")
    fi
  fi

  OUTCOME="run-failed"
  CI_VERDICT="skipped"
  if [[ "$RUN_RC" -eq 0 && -n "$PR_URL" ]]; then
    CI_JSON=$($CLI __dogfood-step --session "$SESSION_ID" --action watch-ci --pr-url "$PR_URL" --timeout-seconds 600 --json)
    CI_VERDICT=$(echo "$CI_JSON" | jq -r .verdict)
    case "$CI_VERDICT" in
      success) OUTCOME="pr-ready" ;;
      timeout) OUTCOME="ci-timeout" ;;
      failure) OUTCOME="ci-failed" ;;
    esac
  elif [[ "$RUN_RC" -eq 0 ]]; then
    OUTCOME="no-pr"
  fi
  RUN_END="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

  $CLI __dogfood-step --session "$SESSION_ID" --action record \
    --runId "$RUN_ID" \
    --pr-url "$PR_URL" \
    --ci-verdict "$CI_VERDICT" \
    --outcome "$OUTCOME" \
    --started-at "$RUN_START" \
    --finished-at "$RUN_END"

  rm -f "$BEFORE_SNAPSHOT"
done

$CLI __dogfood-step --session "$SESSION_ID" --action finalize
