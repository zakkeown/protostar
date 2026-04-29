---
phase: 11-headless-mode-e2e-stress
plan: 15
subsystem: factory-cli
tags: [headless, llm-backend, mock-adapter, selector, stress]

requires:
  - phase: 11-headless-mode-e2e-stress
    provides: "LLM backend config/CLI literals plus hosted adapter package"
provides:
  - "Pure-tier @protostar/mock-llm-adapter package"
  - "Deterministic mock ExecutionAdapter with stress fault modes"
  - "Factory-cli selector wiring for lmstudio, hosted-openai-compatible, and mock"
  - "Hosted/mock package dependency and TypeScript reference wiring"
affects: [11-10, 11-11, 11-13, 11-14, factory-cli, admission-e2e]

tech-stack:
  added:
    - "@protostar/mock-llm-adapter"
  patterns:
    - "Mock backend remains pure tier: no fs, no network, sideEffects false, deterministic in-memory events."
    - "Factory-cli remains the composition root for choosing concrete ExecutionAdapter implementations."
    - "Mock stress fault modes use observable evidence labels that later drivers can assert."

key-files:
  created:
    - packages/mock-llm-adapter/package.json
    - packages/mock-llm-adapter/tsconfig.json
    - packages/mock-llm-adapter/src/index.ts
    - packages/mock-llm-adapter/src/coder-adapter.ts
    - packages/mock-llm-adapter/src/coder-adapter.test.ts
    - packages/mock-llm-adapter/src/no-net.contract.test.ts
  modified:
    - apps/factory-cli/package.json
    - apps/factory-cli/tsconfig.json
    - apps/factory-cli/src/main.ts
    - apps/factory-cli/src/wiring/execution-adapter.ts
    - apps/factory-cli/src/wiring/execution-adapter.test.ts
    - apps/factory-cli/src/main.real-execution.test.ts
    - AGENTS.md
    - tsconfig.json
    - tsconfig.base.json
    - pnpm-lock.yaml

key-decisions:
  - "Kept disk-full and abort-signal as runner-level mechanisms for Plan 11-11 instead of faking them inside the adapter."
  - "Defaulted mock mode to ttt-success so stress smokes can run without hosted/local model cost."
  - "Kept hosted API-key lookup and redaction inside the hosted adapter while selector wiring only passes config."

patterns-established:
  - "Use PROTOSTAR_MOCK_LLM_MODE to select network-drop or llm-timeout for deterministic stress fault injection."
  - "Selector tests should inject adapter factories so backend literal routing stays unit-testable without live services."

requirements-completed: [STRESS-06, STRESS-07]

duration: 55min
completed: 2026-04-29
---

# Phase 11 Plan 15: Mock Adapter Selector Wiring Summary

**Deterministic mock backend plus complete hosted/mock selector wiring for headless stress runs**

## Performance

- **Duration:** 55 min
- **Completed:** 2026-04-29
- **Tasks:** 2
- **Files modified:** 15 implementation, test, manifest, lockfile, and policy-mirror files

## Accomplishments

- Added `@protostar/mock-llm-adapter` as a pure-tier workspace package with Node 22 engine metadata, `sideEffects: false`, local no-net contract coverage, and no external runtime dependencies.
- Implemented `createMockCoderAdapter` with deterministic `empty-diff`, `ttt-success`, `transient-failure`, `network-drop`, and `llm-timeout` modes.
- Made `network-drop` produce observable `adapter-network-refusal` evidence and made `llm-timeout` observable through the adapter `AbortSignal` path as `llm-abort-timeout`.
- Replaced Plan 11-06 placeholder selector errors with real `createHostedOpenAiCompatibleCoderAdapter` and `createMockCoderAdapter` imports/usages.
- Wired factory-cli package dependencies, TypeScript project references, root path aliases, root project references, lockfile metadata, and the AGENTS tier mirror.

## Task Commits

Each implementation task was committed atomically:

1. **Task 1: Scaffold mock adapter package and pure-tier wiring** - `40ee9f1` (test) and `bf326cc` (feat)
2. **Task 2: Implement deterministic mock adapter and selector branches** - `077c95c` (test) and `13bceec` (feat)

Supporting verification hygiene:

- `3da511d` updates a factory-cli source-shape test to follow the Phase 12 delivery-wiring extraction.

**Plan metadata:** this summary plus ROADMAP/STATE tracking are recorded in the final docs commit after verification.

## Files Created/Modified

- `packages/mock-llm-adapter/src/coder-adapter.ts` - Deterministic mock `ExecutionAdapter` and mode parser.
- `packages/mock-llm-adapter/src/coder-adapter.test.ts` - Stable success/failure/fault-mode coverage, including repeat byte-stability for `ttt-success`.
- `packages/mock-llm-adapter/src/no-net.contract.test.ts` - Pure-tier no-network static scan.
- `apps/factory-cli/src/wiring/execution-adapter.ts` - Real hosted and mock selector branches.
- `apps/factory-cli/src/wiring/execution-adapter.test.ts` - Literal-routing coverage for LM Studio, hosted, and mock backends.
- `apps/factory-cli/src/main.ts` - Threads hosted config/env and mock mode env into selector construction.
- `apps/factory-cli/src/main.real-execution.test.ts` - Keeps source-shape assertions aligned with extracted delivery wiring.
- Workspace manifests, TypeScript references, root path aliases, AGENTS tier mirror, and `pnpm-lock.yaml` - Complete package wiring.

## Decisions Made

- The mock adapter is a deterministic stress backend, not a hidden network simulator; network-drop and llm-timeout emit stable evidence labels while actual disk-full and abort-signal mechanisms remain in the runner layer.
- Selector construction accepts injected factories in tests so unit coverage does not depend on real LM Studio, hosted APIs, or mock package side effects.
- Hosted selector config uses `PROTOSTAR_HOSTED_LLM_API_KEY` as an env-key reference, preserving redaction behavior and keeping secrets out of selector output.

## Deviations from Plan

### Auto-fixed Issues

**1. Refreshed a delivery source-shape test after Phase 12 extraction**
- **Found during:** Full factory-cli verification.
- **Issue:** `main.real-execution.test.ts` still expected gated-delivery authorization text directly in `main.ts`, but Phase 12 had moved that logic to `apps/factory-cli/src/wiring/delivery.ts`.
- **Fix:** Updated the test to assert authorization payload and gated-delivery text in the extracted delivery wiring module while keeping `resolveDeliveryMode` and CLI flag assertions in their current owning files.
- **Verification:** `pnpm --filter @protostar/factory-cli test` passed with 397/397 tests.

---

**Total deviations:** 1 auto-fixed
**Impact on plan:** Test alignment only; product behavior and authority boundaries are unchanged.

## Issues Encountered

- A local ignored `.protostar/factory-config.json` still used the pre-Phase-12 object form for `mechanicalChecks.commands`, which made factory-cli tests fail before exercising the code. It was normalized locally to the current closed-command schema; the file is ignored and not part of the tracked plan output.
- `pnpm install` was required to link the new workspace package into `apps/factory-cli/node_modules`; no tracked install-only churn remained outside the intended lockfile/workspace wiring.

## Known Stubs

None introduced. The mock backend is intentionally deterministic and bounded for stress smokes; it is not a replacement for real hosted or LM Studio execution.

## Threat Flags

No unresolved threat flags. T-11-59 through T-11-62 are mitigated by pure-tier package metadata, no-net static scanning, deterministic tests, exact selector literal coverage, and complete package/reference wiring.

## Verification

- `pnpm --filter @protostar/mock-llm-adapter test` passed.
- `pnpm --filter @protostar/hosted-llm-adapter test` passed.
- `pnpm --filter @protostar/factory-cli run typecheck` passed.
- `node --test apps/factory-cli/dist/wiring/execution-adapter.test.js` passed.
- `pnpm --filter @protostar/factory-cli test` passed with 397/397 tests.
- `pnpm --filter @protostar/admission-e2e test` passed with 170/170 tests.
- `rg -n "hosted-backend-package-missing|mock-backend-package-missing" apps/factory-cli/src` returned no matches.
- `rg -n "createHostedOpenAiCompatibleCoderAdapter|createMockCoderAdapter" apps/factory-cli/src/wiring/execution-adapter.ts` found both imports/usages.
- `rg -n "network-drop|llm-timeout|adapter-network-refusal|llm-abort-timeout" packages/mock-llm-adapter/src apps/factory-cli/src/wiring` found mock mechanism support and tests.
- `git diff --check` passed before staging.
- `pnpm run verify` passed after this summary/tracking update.

## User Setup Required

None for the mock backend. Optional stress fault selection uses `PROTOSTAR_MOCK_LLM_MODE=network-drop` or `PROTOSTAR_MOCK_LLM_MODE=llm-timeout`.

## Next Phase Readiness

Wave 5 can now start. Plan 11-10 can run sustained-load sessions through the deterministic mock backend, and Plan 11-11 can use `network-drop` and `llm-timeout` as adapter-level observed fault mechanisms while layering disk-full and abort-signal at the runner level.

## Self-Check: PASSED

- Summary file exists at `.planning/phases/11-headless-mode-e2e-stress/11-15-SUMMARY.md`.
- Required created implementation and test files exist.
- Task commits exist: `40ee9f1`, `bf326cc`, `077c95c`, `13bceec`.
- Requirement IDs from the plan frontmatter are recorded: `STRESS-06`, `STRESS-07`.

---
*Phase: 11-headless-mode-e2e-stress*
*Completed: 2026-04-29*
