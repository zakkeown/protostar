---
phase: 05-review-repair-loop
plan: 12
subsystem: factory-cli
tags: [review-loop, factory-cli, lmstudio, preflight, mechanical-checks]

requires:
  - phase: 05-review-repair-loop
    provides: runReviewRepairLoop, ReviewPersistence, mechanical-checks adapter, LM Studio judge adapter
provides:
  - factory-cli wiring for concrete mechanical checker, model reviewer, executor, and review persistence services
  - runFactory invocation of runReviewRepairLoop instead of the old mechanical-only loop
  - coder-and-judge LM Studio preflight
  - LMSTUDIO_JUDGE_MODEL documentation in .env.example
affects: [phase-05-review-repair-loop, phase-07-delivery, factory-cli]

tech-stack:
  added: [@protostar/mechanical-checks dependency in @protostar/factory-cli]
  patterns:
    - factory-cli owns concrete fs, subprocess, and HTTP-bound service construction
    - review-loop wiring exposes injectable factories for tests without real LM Studio or subprocess calls

key-files:
  created:
    - apps/factory-cli/src/wiring/review-loop.ts
    - apps/factory-cli/src/wiring/review-loop.test.ts
    - apps/factory-cli/src/wiring/preflight.ts
    - apps/factory-cli/src/wiring/preflight.test.ts
    - apps/factory-cli/src/wiring/index.ts
  modified:
    - apps/factory-cli/src/main.ts
    - apps/factory-cli/src/main.test.ts
    - apps/factory-cli/package.json
    - apps/factory-cli/tsconfig.json
    - pnpm-lock.yaml
    - .env.example

key-decisions:
  - "Factory CLI constructs review services and delegates iteration semantics to runReviewRepairLoop."
  - "Dry-run composition uses synthetic review services while the real-executor path uses concrete mechanical and LM Studio judge services."
  - "LM Studio preflight now checks coder first, then judge, and short-circuits on the first missing model or unreachable service."

patterns-established:
  - "Concrete review service wiring lives under apps/factory-cli/src/wiring."
  - "Mechanical-checks fs and subprocess capabilities are injected from the factory-cli boundary."
  - "Review loop approved output is adapted back into existing manifest/evaluation surfaces until Phase 7 consumes DeliveryAuthorization directly."

requirements-completed: [LOOP-01, LOOP-02, LOOP-04, LOOP-05]

duration: not captured by SDK
completed: 2026-04-28
---

# Phase 05 Plan 12: Factory CLI Wiring Summary

**Factory CLI now constructs the real review-repair-loop services, checks both LM Studio models, and invokes runReviewRepairLoop as the delivery gate source.**

## Performance

- **Duration:** Not captured; GSD SDK was unavailable in this workspace session
- **Started:** Not captured
- **Completed:** 2026-04-28T01:45:52Z
- **Tasks:** 3
- **Files modified:** 11

## Accomplishments

- Added `buildReviewRepairServices`, wiring `createMechanicalChecksAdapter`, `createLmstudioJudgeAdapter`, and `createReviewPersistence` from the authorized factory-cli boundary.
- Added `preflightCoderAndJudge`, which verifies the coder model first and the judge model second before real execution.
- Replaced the old `runMechanicalReviewExecutionLoop` callsite in `runFactory` with `runReviewRepairLoop`.
- Preserved dry-run fixture behavior with synthetic review services while real execution uses the concrete mechanical checker, model reviewer, executor, and persistence.
- Documented `LMSTUDIO_JUDGE_MODEL` in `.env.example`.

## Task Commits

Each task was committed atomically:

1. **Task 1 RED: review loop wiring tests** - `c669de2` (test)
2. **Task 1 GREEN: review repair services wiring** - `e2bb71c` (feat)
3. **Task 2 RED: coder and judge preflight tests** - `c7b090b` (test)
4. **Task 2 GREEN: coder and judge preflight wiring** - `00eab45` (feat)
5. **Task 3: factory CLI loop swap** - `8664962` (feat)

## Files Created/Modified

- `apps/factory-cli/src/wiring/review-loop.ts` - Builds concrete review-loop services and exposes a durable wrapper.
- `apps/factory-cli/src/wiring/review-loop.test.ts` - Pins factory invocation, mechanical wrapper behavior, injected fs/subprocess capability wiring, defaults, and persistence pathing.
- `apps/factory-cli/src/wiring/preflight.ts` - Verifies coder and judge LM Studio models sequentially.
- `apps/factory-cli/src/wiring/preflight.test.ts` - Covers ready, coder missing, judge missing, unreachable, and HTTP-error preflight outcomes.
- `apps/factory-cli/src/wiring/index.ts` - Exports the wiring helpers.
- `apps/factory-cli/src/main.ts` - Calls `runReviewRepairLoop`, builds concrete services, maps approved/blocked results, and uses dual-model preflight for real execution.
- `apps/factory-cli/src/main.test.ts` - Updates factory CLI expectations around the review-loop integration.
- `apps/factory-cli/package.json`, `apps/factory-cli/tsconfig.json`, `pnpm-lock.yaml` - Adds the mechanical-checks dependency/reference required by the wiring layer.
- `.env.example` - Documents `LMSTUDIO_JUDGE_MODEL`.

## Decisions Made

- The real-executor path now uses concrete services built by `buildReviewRepairServices`; dry-run keeps synthetic mechanical/model outcomes so existing fixture tests do not spawn real mechanical commands.
- Review loop output is adapted into the existing manifest/evaluation flow for Phase 5, while Phase 7 will consume the minted `DeliveryAuthorization` directly.
- The preflight helper short-circuits on coder failure before checking judge, matching the operator requirement that the coding model must be ready before review can matter.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added factory-cli dependency on mechanical-checks**
- **Found during:** Task 1
- **Issue:** The new wiring module imports `createMechanicalChecksAdapter`, but `@protostar/factory-cli` did not depend on `@protostar/mechanical-checks`.
- **Fix:** Added the package dependency, TypeScript project reference, and lockfile entry.
- **Files modified:** `apps/factory-cli/package.json`, `apps/factory-cli/tsconfig.json`, `pnpm-lock.yaml`
- **Verification:** `pnpm --filter @protostar/factory-cli build`
- **Committed in:** `e2bb71c`

**2. [Rule 3 - Blocking] Verified nested wiring tests explicitly**
- **Found during:** Task 1
- **Issue:** The package test script runs top-level compiled tests, while the new wiring tests compile under `dist/wiring/*.test.js`.
- **Fix:** Kept the existing test script unchanged to avoid broad test-runner churn and verified the new nested tests directly.
- **Files modified:** None
- **Verification:** `pnpm --filter @protostar/factory-cli build && node --test apps/factory-cli/dist/wiring/*.test.js`
- **Committed in:** N/A

**3. [Rule 3 - Blocking] GSD SDK unavailable for state handlers**
- **Found during:** Plan setup/closeout
- **Issue:** The local `@gsd-build/sdk` CLI was not installed under `node_modules`, and `gsd-sdk` was not available on PATH.
- **Fix:** Performed the required SUMMARY, roadmap, and state updates manually.
- **Files modified:** `.planning/phases/05-review-repair-loop/05-12-SUMMARY.md`, `.planning/STATE.md`, `.planning/ROADMAP.md`
- **Verification:** Planning self-check below
- **Committed in:** Final docs commit

---

**Total deviations:** 3 auto-fixed (Rule 3)
**Impact on plan:** All were needed to complete or verify the requested wiring; no package boundary expansion beyond the AGENTS.md-authorized factory-cli construction site.

## Issues Encountered

- `pnpm run verify:full` initially failed in the sandbox when LM Studio adapter tests attempted to bind loopback test servers on `127.0.0.1` (`EPERM`). The command was rerun with approved escalation for loopback test binding and passed.
- `pnpm run factory` built and stopped at the expected workspace-trust gate with exit code 2. That proves the CLI composition still boots without requiring a trusted workspace or live LM Studio run in this plan.

## Verification

- `pnpm --filter @protostar/factory-cli build` - passed.
- `pnpm --filter @protostar/factory-cli build && node --test apps/factory-cli/dist/wiring/*.test.js` - passed, 11/11 tests.
- `pnpm --filter @protostar/factory-cli test` - passed as part of full verification, 122/122 tests.
- `pnpm run verify:full` - passed after approved loopback escalation.
- `pnpm run factory` - built and exited at expected workspace-trust gate (`workspace is not trusted`).
- `grep -rn 'runMechanicalReviewExecutionLoop' apps/factory-cli/src/ | grep -v '@deprecated' | wc -l` - 0.
- `grep -c 'runReviewRepairLoop' apps/factory-cli/src/main.ts` - 2.
- `grep -c 'preflightCoderAndJudge' apps/factory-cli/src/main.ts` - 2.
- `grep -c 'LMSTUDIO_JUDGE_MODEL' .env.example` - 1.

## Known Stubs

None. The dry-run synthetic review services are compatibility wiring for factory-cli dry-run tests; real execution uses concrete mechanical, model, executor, and persistence services.

## Threat Flags

None. This plan intentionally wires fs/subprocess/HTTP-bound services inside `apps/factory-cli`, the AGENTS.md-authorized construction boundary.

## User Setup Required

For real non-dry-run execution, LM Studio must have both configured models loaded:

- `LMSTUDIO_MODEL`
- `LMSTUDIO_JUDGE_MODEL`

No new secret value is required by this plan.

## Next Phase Readiness

Phase 5 now has its factory-cli callsite. Phase 7 can consume the `DeliveryAuthorization` returned by the approved review loop and wire delivery planning around it.

## Self-Check: PASSED

- Summary exists: `.planning/phases/05-review-repair-loop/05-12-SUMMARY.md`.
- Task commits exist: `c669de2`, `e2bb71c`, `c7b090b`, `00eab45`, `8664962`.
- Roadmap marks `05-12-factory-cli-wiring-PLAN.md` complete.
- Requirements listed in plan frontmatter were already marked complete in `.planning/REQUIREMENTS.md`: `LOOP-01`, `LOOP-02`, `LOOP-04`, `LOOP-05`.

Final file and commit existence checks will be appended after planning updates and before the final docs commit.

---
*Phase: 05-review-repair-loop*
*Completed: 2026-04-28*
