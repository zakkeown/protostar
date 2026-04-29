#!/usr/bin/env bash
set -euo pipefail

REFUSAL_MESSAGE="Use apps/factory-cli/src/scripts/stress.ts for concurrency and fault-injection"

SHAPE="sustained-load"
SESSION_ID=""
RUNS=100
LLM_BACKEND="mock"
HEADLESS_MODE="local-daemon"
MAX_RUNS=500
MAX_RUNS_SOURCE="q03-default"
MAX_WALL_CLOCK_DAYS=7
MAX_WALL_CLOCK_SOURCE="q03-default"
SEED_ARCHETYPES="cosmetic-tweak,feature-add"

usage() {
  cat <<'EOF'
Usage: bash scripts/stress.sh --shape sustained-load [options]

Options:
  --session <id>                Stress session id. Defaults to a generated id.
  --runs <n>                    Sequential run count. Defaults to 100.
  --llm-backend <backend>       Factory LLM backend. Defaults to mock.
  --headless-mode <mode>        Factory headless mode. Defaults to local-daemon.
  --max-runs <n>                Run-count cap. Defaults to 500.
  --max-wall-clock-days <n>     Wall-clock cap in days. Defaults to 7.
  --seed-archetypes <csv>       Seed archetypes. Defaults to cosmetic-tweak,feature-add.
  -h, --help                    Show this help.

Example:
  pnpm stress:sustained -- --runs 1 --llm-backend mock --headless-mode local-daemon
EOF
}

fail_usage() {
  echo "$1" >&2
  usage >&2
  exit 2
}

require_value() {
  if [[ $# -lt 2 || -z "$2" || "$2" == --* ]]; then
    fail_usage "missing value for $1"
  fi
}

is_nonnegative_integer() {
  case "$1" in
    ""|*[!0-9]*) return 1 ;;
    *) return 0 ;;
  esac
}

require_nonnegative_integer() {
  if ! is_nonnegative_integer "$2"; then
    fail_usage "$1 must be a nonnegative integer"
  fi
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --shape)
      require_value "$1" "${2:-}"
      SHAPE="$2"
      shift 2
      ;;
    --session)
      require_value "$1" "${2:-}"
      SESSION_ID="$2"
      shift 2
      ;;
    --runs)
      require_value "$1" "${2:-}"
      RUNS="$2"
      shift 2
      ;;
    --llm-backend)
      require_value "$1" "${2:-}"
      LLM_BACKEND="$2"
      shift 2
      ;;
    --headless-mode)
      require_value "$1" "${2:-}"
      HEADLESS_MODE="$2"
      shift 2
      ;;
    --max-runs)
      require_value "$1" "${2:-}"
      MAX_RUNS="$2"
      MAX_RUNS_SOURCE="cli"
      shift 2
      ;;
    --max-wall-clock-days)
      require_value "$1" "${2:-}"
      MAX_WALL_CLOCK_DAYS="$2"
      MAX_WALL_CLOCK_SOURCE="cli"
      shift 2
      ;;
    --seed-archetypes)
      require_value "$1" "${2:-}"
      SEED_ARCHETYPES="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      fail_usage "unknown arg: $1"
      ;;
  esac
done

case "$SHAPE" in
  sustained-load)
    ;;
  concurrency|fault-injection)
    echo "$REFUSAL_MESSAGE" >&2
    exit 2
    ;;
  *)
    fail_usage "unsupported --shape: $SHAPE"
    ;;
esac

require_nonnegative_integer "--runs" "$RUNS"
require_nonnegative_integer "--max-runs" "$MAX_RUNS"
require_nonnegative_integer "--max-wall-clock-days" "$MAX_WALL_CLOCK_DAYS"

if [[ -z "$SEED_ARCHETYPES" ]]; then
  fail_usage "--seed-archetypes must not be empty"
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required for stress input parsing" >&2
  exit 127
fi

if [[ -z "$SESSION_ID" ]]; then
  SESSION_ID="stress_$(date -u +%Y%m%dT%H%M%SZ)_$RANDOM"
fi

stress_step() {
  node apps/factory-cli/dist/main.js __stress-step --session "$SESSION_ID" "$@"
}

factory_run() {
  node apps/factory-cli/dist/main.js run "$@"
}

record_cap_breach() {
  local cap_kind="$1"
  local cap_value="$2"
  local cap_limit="$3"
  local cap_source="$4"

  stress_step \
    --action cap-breach \
    --shape "$SHAPE" \
    --cap-kind "$cap_kind" \
    --cap-value "$cap_value" \
    --cap-limit "$cap_limit" \
    --cap-source "$cap_source"
}

stress_step --action begin --shape "$SHAPE"

START_EPOCH="$(date -u +%s)"
MAX_WALL_CLOCK_SECONDS=$((MAX_WALL_CLOCK_DAYS * 86400))
RUN_INDEX=0

while [[ "$RUN_INDEX" -lt "$RUNS" ]]; do
  if [[ "$RUN_INDEX" -ge "$MAX_RUNS" ]]; then
    record_cap_breach "run-count" "$((RUN_INDEX + 1))" "$MAX_RUNS" "$MAX_RUNS_SOURCE"
    exit 1
  fi

  NOW_EPOCH="$(date -u +%s)"
  ELAPSED_SECONDS=$((NOW_EPOCH - START_EPOCH))
  if [[ "$ELAPSED_SECONDS" -ge "$MAX_WALL_CLOCK_SECONDS" ]]; then
    record_cap_breach "wall-clock" "$ELAPSED_SECONDS" "$MAX_WALL_CLOCK_SECONDS" "$MAX_WALL_CLOCK_SOURCE"
    exit 1
  fi

  RUN_NUMBER=$((RUN_INDEX + 1))
  RUN_SUFFIX="$(printf "%04d" "$RUN_NUMBER")"
  RUN_ID="stress_${SESSION_ID}_${RUN_SUFFIX}"

  NEXT_SEED_JSON="$(stress_step \
    --action next-seed \
    --seed-archetypes "$SEED_ARCHETYPES" \
    --run-index "$RUN_INDEX" \
    --json)"
  SEED_ID="$(echo "$NEXT_SEED_JSON" | jq -r .seedId)"
  ARCHETYPE="$(echo "$NEXT_SEED_JSON" | jq -r .archetype)"

  DRAFT_JSON="$(stress_step \
    --action materialize-draft \
    --seed-archetypes "$SEED_ARCHETYPES" \
    --seed-id "$SEED_ID" \
    --run-index "$RUN_INDEX" \
    --run-id "$RUN_ID" \
    --json)"
  DRAFT_PATH="$(echo "$DRAFT_JSON" | jq -r .draftPath)"

  CONFIRMED_JSON="$(stress_step \
    --action sign-intent \
    --run-id "$RUN_ID" \
    --draft "$DRAFT_PATH" \
    --json)"
  CONFIRMED_INTENT_PATH="$(echo "$CONFIRMED_JSON" | jq -r .confirmedIntentPath)"

  RUN_START_EPOCH="$(date -u +%s)"
  set +e
  factory_run \
    --draft "$DRAFT_PATH" \
    --confirmed-intent "$CONFIRMED_INTENT_PATH" \
    --out .protostar/runs \
    --executor real \
    --planning-mode live \
    --review-mode live \
    --delivery-mode auto \
    --trust trusted \
    --run-id "$RUN_ID" \
    --intent-mode brownfield \
    --llm-backend "$LLM_BACKEND" \
    --headless-mode "$HEADLESS_MODE" \
    --non-interactive
  RUN_RC=$?
  set -e
  RUN_END_EPOCH="$(date -u +%s)"
  RUN_DURATION_MS=$(((RUN_END_EPOCH - RUN_START_EPOCH) * 1000))

  OUTCOME="pass"
  if [[ "$RUN_RC" -ne 0 ]]; then
    OUTCOME="failed"
  fi

  stress_step \
    --action record-run \
    --run-id "$RUN_ID" \
    --seed-id "$SEED_ID" \
    --archetype "$ARCHETYPE" \
    --outcome "$OUTCOME" \
    --duration-ms "$RUN_DURATION_MS"

  RUN_INDEX=$((RUN_INDEX + 1))
done

stress_step --action finalize --headless-mode "$HEADLESS_MODE" --llm-backend "$LLM_BACKEND"
