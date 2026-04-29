---
phase: 11-headless-mode-e2e-stress
plan: 06
subsystem: cli-config
tags: [headless-mode, llm-backend, execution-adapter, factory-cli, lmstudio]

requires:
  - phase: 11-headless-mode-e2e-stress/11-05
    provides: "Validated factory config and CLI override precedence for headless mode."
provides:
  - "Strict factory.llmBackend enum with default lmstudio."
  - "protostar-factory run --llm-backend override with CLI > config > default precedence."
  - "factory-cli composition selector that preserves the existing LM Studio adapter path."
  - "Typed unavailable composition errors for hosted-openai-compatible and mock until later plans provide packages."
affects: [11-07, 11-09, 11-15, factory-cli, lmstudio-adapter]

tech-stack:
  added: []
  patterns:
    - "Backend selection resolves in factory-cli composition and returns the existing ExecutionAdapter contract."
    - "LM Studio admission/preflight remains backend-specific and only runs for the lmstudio backend."

key-files:
  created:
    - apps/factory-cli/src/wiring/execution-adapter.ts
    - apps/factory-cli/src/wiring/execution-adapter.test.ts
  modified:
    - apps/factory-cli/src/cli-args.ts
    - apps/factory-cli/src/cli-args.test.ts
    - apps/factory-cli/src/coder-adapter-admission.test.ts
    - apps/factory-cli/src/commands/run.ts
    - apps/factory-cli/src/commands/run.test.ts
    - apps/factory-cli/src/load-factory-config.ts
    - apps/factory-cli/src/load-factory-config.test.ts
    - apps/factory-cli/src/main.ts
    - apps/factory-cli/src/main.test.ts
    - apps/factory-cli/src/wiring/review-loop.test.ts
    - docs/cli/root.txt
    - docs/cli/run.txt
    - packages/admission-e2e/src/fixtures/help/root-help.txt
    - packages/admission-e2e/src/fixtures/help/run-help.txt
    - packages/lmstudio-adapter/src/factory-config.schema.json
    - packages/lmstudio-adapter/src/factory-config.test.ts
    - packages/lmstudio-adapter/src/factory-config.ts
    - packages/lmstudio-adapter/src/index.ts

key-decisions:
  - "Kept LM Studio as the default backend and kept @protostar/lmstudio-adapter unchanged."
  - "Rejected provider aliases such as openai and anthropic; only Phase 11 literals are accepted."
  - "Represented hosted and mock backend choices as typed unavailable errors until their implementation plans land."

patterns-established:
  - "CLI > config file > package default precedence now covers llmBackend."
  - "Execution backend wiring is selected at the orchestration tier, not in pure packages or Dogpile."

requirements-completed: [STRESS-06]

duration: 12 min
completed: 2026-04-29
---

# Phase 11 Plan 06: LLM Backend Selection Summary

**Default-preserving LLM backend selection with strict config/CLI literals and a factory-cli execution adapter selector.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-04-29T17:49:24Z
- **Completed:** 2026-04-29T18:01:14Z
- **Tasks:** 2
- **Files modified:** 20 implementation, test, and CLI snapshot files

## Accomplishments

- Added `factory.llmBackend` with exact values `lmstudio`, `hosted-openai-compatible`, and `mock`, defaulting to `lmstudio`.
- Added `protostar-factory run --llm-backend <backend>` and parser coverage for CLI > config > default precedence.
- Added `selectExecutionAdapter` in `apps/factory-cli` so composition stays on the existing `ExecutionAdapter` contract without importing future packages.
- Preserved LM Studio as the only available runtime backend in this plan while returning typed unavailable errors for later hosted/mock work.

## Task Commits

Each task was committed atomically:

1. **Task 1: Pin backend selector behavior before composition changes** - `adb7eae` (test)
2. **Task 2: Implement config, CLI, and composition-root backend selection** - `14a9773` (feat)

## Files Created/Modified

- `apps/factory-cli/src/wiring/execution-adapter.ts` - Selects the backend implementation at the orchestration boundary and emits typed unavailable errors for deferred backends.
- `apps/factory-cli/src/wiring/execution-adapter.test.ts` - Pins LM Studio factory selection and hosted/mock unavailable behavior.
- `packages/lmstudio-adapter/src/factory-config.ts` - Adds the `LlmBackend` type, strict runtime validation, and default `llmBackend`.
- `packages/lmstudio-adapter/src/factory-config.schema.json` - Adds the matching JSON schema enum/default.
- `apps/factory-cli/src/load-factory-config.ts` - Exposes `resolveLlmBackend` with CLI > config > default precedence.
- `apps/factory-cli/src/commands/run.ts` and `apps/factory-cli/src/cli-args.ts` - Add and parse `--llm-backend`.
- `apps/factory-cli/src/main.ts` - Uses `selectExecutionAdapter` and keeps LM Studio preflight specific to the LM Studio backend.
- CLI help snapshots and existing tests were refreshed for the new flag and config field.

## Decisions Made

- Kept `@protostar/lmstudio-adapter` as-is; no generic `@protostar/llm-adapter` package was created.
- Kept backend selection inside `apps/factory-cli`, matching the plan threat model and AGENTS.md authority tiers.
- Chose throwing typed composition errors for `hosted-openai-compatible` and `mock` so future plans can replace those branches without weakening current fail-closed behavior.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Updated handmade factory config fixtures for the new required field**
- **Found during:** Task 2 (Implement config, CLI, and composition-root backend selection)
- **Issue:** Existing tests that construct complete factory config objects by hand needed `llmBackend` once the config type became strict.
- **Fix:** Added `llmBackend: "lmstudio"` to the affected test fixtures.
- **Files modified:** `apps/factory-cli/src/coder-adapter-admission.test.ts`, `apps/factory-cli/src/wiring/review-loop.test.ts`
- **Verification:** `pnpm --filter @protostar/factory-cli test`
- **Committed in:** `14a9773`

**2. [Rule 3 - Blocking] Refreshed CLI help snapshots after adding the run flag**
- **Found during:** Task 2 (Implement config, CLI, and composition-root backend selection)
- **Issue:** The new `--llm-backend` flag changed generated help output checked by repository snapshots.
- **Fix:** Updated root/run CLI help snapshots and admission-e2e help fixtures.
- **Files modified:** `docs/cli/root.txt`, `docs/cli/run.txt`, `packages/admission-e2e/src/fixtures/help/root-help.txt`, `packages/admission-e2e/src/fixtures/help/run-help.txt`
- **Verification:** `pnpm --filter @protostar/factory-cli test`, `pnpm run verify`
- **Committed in:** `14a9773`

---

**Total deviations:** 2 auto-fixed (2 Rule 3)
**Impact on plan:** Both fixes were necessary fallout from the planned strict config/CLI surface; no package boundary or runtime authority expansion was added.

## Issues Encountered

- `pnpm --filter @protostar/lmstudio-adapter test` hit the sandbox loopback bind restriction (`listen EPERM` on `127.0.0.1`) during local-server tests. The same command passed after approved escalation.
- `pnpm run factory` built successfully and stopped at the expected workspace-trust gate; the generated refusal-index line was treated as verification residue and removed from the working tree.

## Known Stubs

- `apps/factory-cli/src/wiring/execution-adapter.ts` intentionally throws `hosted-backend-package-missing` and `mock-backend-package-missing` for `hosted-openai-compatible` and `mock`. This is the plan-approved fail-closed placeholder until Plans 11-07 and 11-15 add real adapter packages and selector imports.

## User Setup Required

None - no external service configuration was added. Existing LM Studio local-server requirements are unchanged.

## Threat Flags

None. The config/CLI-to-backend and factory-cli-to-adapter trust boundaries were already identified in the plan threat model, and this implementation kept selection in `apps/factory-cli`.

## Verification

- `pnpm --filter @protostar/lmstudio-adapter test` - RED failed before implementation, passed after implementation with approved loopback escalation.
- `pnpm --filter @protostar/factory-cli test -- --test-name-pattern "backend|execution adapter|main"` - RED failed before implementation, passed after implementation.
- `pnpm --filter @protostar/factory-cli test` - passed.
- `pnpm run verify` - passed.
- `pnpm run factory` - built and stopped at the expected workspace-trust gate.
- Acceptance greps confirmed the backend literals, `--llm-backend`, and `selectExecutionAdapter` surfaces; no `@protostar/llm-adapter` package or dependency was created.

## Next Phase Readiness

Plan 11-07 can add the hosted OpenAI-compatible backend package and replace the hosted unavailable branch. Plan 11-15 can add the deterministic mock backend package and replace the mock unavailable branch. Plan 11-09 can depend on the new `llmBackend` config surface when materializing stress-session inputs.

## Self-Check: PASSED

- Summary file exists: `.planning/phases/11-headless-mode-e2e-stress/11-06-SUMMARY.md`
- Selector files exist: `apps/factory-cli/src/wiring/execution-adapter.ts`, `apps/factory-cli/src/wiring/execution-adapter.test.ts`
- Task commits found: `adb7eae`, `14a9773`
- Requirement and roadmap state updated for `STRESS-06` / `11-06-llm-backend-selection-PLAN.md`
- `git diff --check` passed

---
*Phase: 11-headless-mode-e2e-stress*
*Completed: 2026-04-29*
