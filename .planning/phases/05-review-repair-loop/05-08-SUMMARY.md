---
phase: 05-review-repair-loop
plan: 08
subsystem: review
tags: [lmstudio, judge-adapter, model-review, factory-config, typescript]

requires:
  - phase: 04-execution-engine
    provides: "LM Studio coder adapter, SSE parsing, retry classification, factory-config resolver/preflight patterns"
  - phase: 05-review-repair-loop
    provides: "ModelReviewer and JudgeCritique contracts from Plan 05-04"
provides:
  - "Shared LM Studio chat/preflight client consumed by the coder adapter and judge adapter"
  - "Panel-of-one createLmstudioJudgeAdapter ModelReviewer for Qwen3-80B via LM Studio"
  - "Factory-config schema and resolver support for adapters.judge alongside adapters.coder"
affects: [05-10-run-review-repair-loop, 05-12-factory-cli-wiring, 06-live-dogpile-piles, 08-evaluation-evolution]

tech-stack:
  added: []
  patterns:
    - "Shared OpenAI-compatible LM Studio client for streaming and JSON chat completions"
    - "Panel-of-one judge returns exactly one JudgeCritique with open-key rubric scores"
    - "Judge parse failures throw LmstudioJudgeParseError for Plan 05-10 model-block handling"

key-files:
  created:
    - packages/lmstudio-adapter/src/lmstudio-client.ts
    - packages/lmstudio-adapter/src/lmstudio-client.test.ts
    - packages/lmstudio-adapter/src/create-judge-adapter.ts
    - packages/lmstudio-adapter/src/create-judge-adapter.test.ts
  modified:
    - packages/lmstudio-adapter/src/coder-adapter.ts
    - packages/lmstudio-adapter/src/index.ts
    - packages/lmstudio-adapter/src/factory-config.ts
    - packages/lmstudio-adapter/src/factory-config.test.ts
    - packages/lmstudio-adapter/src/factory-config.schema.json
    - packages/lmstudio-adapter/package.json
    - packages/lmstudio-adapter/tsconfig.json
    - pnpm-lock.yaml

key-decisions:
  - "Kept the judge adapter inside @protostar/lmstudio-adapter so coder and judge share LM Studio HTTP/SSE/preflight machinery."
  - "Preflight is deferred to first review call, preserving synchronous adapter construction."
  - "Factory-config JSON schema requires both adapters.coder and adapters.judge; the exported FactoryConfig type keeps judge optional for existing downstream literal compatibility while resolver output includes judge."

patterns-established:
  - "callLmstudioChatStream emits token/done/error events while preserving coder retry ownership."
  - "callLmstudioChatJson returns the OpenAI-compatible response envelope; adapter-specific modules parse message content."
  - "Judge taskRefs are all admitted task ids in v0.1; Phase 8 owns granular attribution and N-judge consensus."

requirements-completed: [LOOP-02]

duration: 14min
completed: 2026-04-28
---

# Phase 05 Plan 08: Judge Adapter Summary

**LM Studio now has a shared client plus a real panel-of-one Qwen3-80B ModelReviewer that emits structured JudgeCritique results.**

## Performance

- **Duration:** 14 min
- **Started:** 2026-04-28T00:40:49Z
- **Completed:** 2026-04-28T00:54:32Z
- **Tasks:** 2
- **Files modified:** 13

## Accomplishments

- Extracted reusable LM Studio chat streaming, JSON chat, and model preflight helpers into `lmstudio-client.ts`.
- Refactored the coder adapter to consume the shared streaming client without regressing retry, parse-reformat, timeout, or evidence behavior.
- Added `createLmstudioJudgeAdapter(config): ModelReviewer`, returning exactly one `JudgeCritique` with open-key rubric scores, verdict, rationale, model, judgeId, and full-plan taskRefs.
- Extended factory-config resolver/schema coverage so resolved configs include both coder and judge adapter blocks.

## Task Commits

1. **Task 1: Extract shared lmstudio-client.ts from coder-adapter** - `4c33ef7` (refactor)
2. **Task 2 RED: judge adapter contract tests** - `db8f89c` (test)
3. **Task 2 GREEN: judge adapter + factory-config schema** - `b7cdd78` (feat)

## Files Created/Modified

- `packages/lmstudio-adapter/src/lmstudio-client.ts` - Shared LM Studio stream, JSON chat, and model preflight helper module.
- `packages/lmstudio-adapter/src/lmstudio-client.test.ts` - Direct shared-client coverage against stub LM Studio and injected fetches.
- `packages/lmstudio-adapter/src/coder-adapter.ts` - Refactored to use `callLmstudioChatStream`.
- `packages/lmstudio-adapter/src/create-judge-adapter.ts` - Panel-of-one LM Studio `ModelReviewer` implementation.
- `packages/lmstudio-adapter/src/create-judge-adapter.test.ts` - Six judge behavior tests plus config resolver coverage.
- `packages/lmstudio-adapter/src/factory-config.ts` and `.schema.json` - Added `adapters.judge` resolver/schema support.
- `packages/lmstudio-adapter/src/index.ts` - Re-exported shared client and judge adapter.
- `packages/lmstudio-adapter/package.json`, `tsconfig.json`, `pnpm-lock.yaml` - Added `@protostar/review` dependency/reference.

## Decisions Made

- `LmstudioJudgeParseError` carries raw malformed model content as `cause`; Plan 05-10 should catch it and synthesize a `model-block` critique.
- First-call preflight checks the judge model is loaded before calling chat completions; construction remains synchronous.
- `FactoryConfig.adapters.judge` remains optional at the TypeScript literal boundary to avoid forcing unrelated factory-cli fixtures to change in this parallel wave, while the resolver output and JSON schema include/require judge.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Corrected factory-config schema path**
- **Found during:** Task 2
- **Issue:** The plan listed `packages/intent/schema/factory-config.schema.json`, but Phase 4 created and wired the factory-config schema under `packages/lmstudio-adapter/src/factory-config.schema.json`.
- **Fix:** Updated the existing owning schema/resolver/test files in `@protostar/lmstudio-adapter` rather than adding a duplicate schema under `packages/intent`.
- **Files modified:** `packages/lmstudio-adapter/src/factory-config.ts`, `packages/lmstudio-adapter/src/factory-config.schema.json`, `packages/lmstudio-adapter/src/factory-config.test.ts`
- **Verification:** `pnpm --filter @protostar/lmstudio-adapter test`; schema/config grep checks.
- **Committed in:** `b7cdd78`

**2. [Rule 3 - Blocking] Added review package dependency/reference**
- **Found during:** Task 2
- **Issue:** The judge adapter imports `ModelReviewer` and `JudgeCritique` from `@protostar/review`, but `@protostar/lmstudio-adapter` did not yet depend on or reference review.
- **Fix:** Added the workspace dependency, TypeScript project reference, and lockfile importer edge.
- **Files modified:** `packages/lmstudio-adapter/package.json`, `packages/lmstudio-adapter/tsconfig.json`, `pnpm-lock.yaml`
- **Verification:** `pnpm --filter @protostar/lmstudio-adapter test`; `pnpm run verify`.
- **Committed in:** `b7cdd78`

**3. [Rule 1 - Bug] Preserved transient network and abort classification after client extraction**
- **Found during:** Task 1
- **Issue:** Moving fetch into the shared client initially stripped wrapped network error codes and turned already-aborted signals into unreachable failures.
- **Fix:** Preserved error-code hints in shared-client error messages and taught the coder adapter to reconstruct classifier input and honor abort reasons before retry classification.
- **Files modified:** `packages/lmstudio-adapter/src/lmstudio-client.ts`, `packages/lmstudio-adapter/src/coder-adapter.ts`
- **Verification:** `pnpm --filter @protostar/lmstudio-adapter test`
- **Committed in:** `4c33ef7`

**4. [Rule 1 - Bug] Kept downstream factory-cli typecheck compatible**
- **Found during:** Plan-level `pnpm run verify`
- **Issue:** Requiring `FactoryConfig.adapters.judge` at the TypeScript interface boundary broke an existing factory-cli coder-only fixture outside this plan's write scope.
- **Fix:** Kept the exported TypeScript literal type backward-compatible with optional `judge`, while resolver output and JSON schema still include/require the judge block.
- **Files modified:** `packages/lmstudio-adapter/src/factory-config.ts`, `packages/lmstudio-adapter/src/factory-config.test.ts`, `packages/lmstudio-adapter/src/create-judge-adapter.test.ts`
- **Verification:** `pnpm --filter @protostar/lmstudio-adapter test`; `pnpm run verify`
- **Committed in:** `b7cdd78`

---

**Total deviations:** 4 auto-fixed (Rule 1: 2, Rule 3: 2)
**Impact on plan:** The shipped behavior matches the model-review seam and schema intent. The only compatibility relaxation is TypeScript-only and avoids editing unrelated factory-cli files during the parallel wave.

## Issues Encountered

- Sandbox loopback binding blocked stub server tests with `listen EPERM 127.0.0.1`; the package test command was rerun with approved escalation and passed.
- `pnpm run factory` built successfully and then stopped at the expected workspace-trust escalation gate with exit code 2.

## Verification

- `pnpm --filter @protostar/lmstudio-adapter test` passed: 66 tests, including coder regression, shared client, judge adapter, and factory-config coverage.
- Factory-config resolver accepted a config containing both `adapters.coder` and `adapters.judge`.
- Acceptance greps passed for `createLmstudioJudgeAdapter`, the barrel export, `"judge"` in the schema, and `LmstudioJudgeParseError`.
- `pnpm run verify` passed.
- `pnpm run factory` built, then stopped at the expected workspace-trust gate.

## Known Stubs

None found. Stub-pattern scan hits were local test arrays/strings and ordinary parser sentinels, not unresolved product stubs.

## Threat Flags

None beyond the plan's declared LM Studio loopback HTTP trust boundary. No new external network destination, filesystem authority path, auth path, or durable secret storage was added.

## User Setup Required

None - no external service configuration required for tests. Runtime use still depends on the operator's LM Studio model being loaded, which Plan 05-12 will preflight for both coder and judge.

## Next Phase Readiness

Plan 05-10 can consume `createLmstudioJudgeAdapter` as the `ModelReviewer` and catch `LmstudioJudgeParseError` as a model-block input. Plan 05-12 can extend factory-cli preflight to verify both coder and judge model ids from factory config before run start.

## Self-Check: PASSED

- Created files exist: `lmstudio-client.ts`, `lmstudio-client.test.ts`, `create-judge-adapter.ts`, and `create-judge-adapter.test.ts`.
- Task commits exist in git history: `4c33ef7`, `db8f89c`, `b7cdd78`.
- Barrel exports are present for `lmstudio-client` and `create-judge-adapter`.
- `factory-config.schema.json` requires `adapters.coder` and `adapters.judge`.

---
*Phase: 05-review-repair-loop*
*Completed: 2026-04-28*
