---
phase: 04-execution-engine
plan: 05
subsystem: execution
tags: [sse, diff-parser, retry, backoff, lmstudio]

requires:
  - phase: 04-execution-engine
    provides: [execution-adapter-contract, lmstudio-stub-fixture, lmstudio-config-preflight]
provides:
  - SSE data-frame parser for LM Studio streaming responses
  - Strict single-fence diff parser and coder prompt builder
  - Centralized transient failure classifier and deterministic retry backoff
affects: [04-06-coder-adapter-orchestrator, 04-09-journal-snapshot-orphan, 04-10-factory-cli-real-executor-wiring]

tech-stack:
  added: []
  patterns: [pure-helper-modules, node-test-tdd, deterministic-retry-jitter]

key-files:
  created:
    - packages/lmstudio-adapter/src/sse-parser.ts
    - packages/lmstudio-adapter/src/sse-parser.test.ts
    - packages/lmstudio-adapter/src/diff-parser.ts
    - packages/lmstudio-adapter/src/diff-parser.test.ts
    - packages/lmstudio-adapter/src/prompt-builder.ts
    - packages/lmstudio-adapter/src/prompt-builder.test.ts
    - packages/execution/src/retry-classifier.ts
    - packages/execution/src/retry-classifier.test.ts
    - packages/execution/src/backoff.ts
    - packages/execution/src/backoff.test.ts
  modified:
    - packages/lmstudio-adapter/src/index.ts
    - packages/execution/src/index.ts

key-decisions:
  - "Diff parsing rejects prose by requiring the single fenced block to be the whole trimmed response."
  - "Retry and backoff helpers live in @protostar/execution so adapter retry budgets can be enforced centrally."

patterns-established:
  - "SSE parsing drains every complete event from the buffer before reading again, then yields [DONE] before returning."
  - "Backoff uses injected RNG for deterministic tests and Math.random-compatible production composition."

requirements-completed: [EXEC-03, EXEC-06]

duration: 35min
completed: 2026-04-27
---

# Phase 04 Plan 05: SSE Diff Retry Helpers Summary

**Pure LM Studio streaming, strict diff parsing, prompt assembly, retry classification, and deterministic backoff helpers for the real coder adapter.**

## Performance

- **Duration:** 35 min
- **Started:** 2026-04-27T22:25:00Z
- **Completed:** 2026-04-27T23:00:20Z
- **Tasks:** 3
- **Files modified:** 12

## Accomplishments

- Added `parseSseStream()` with `[DONE]` sentinel handling, multi-line data support, chunk-boundary safety, and `releaseLock()` cleanup.
- Added `parseDiffBlock()` with `DIFF_FENCE_RE`, strict single-fence enforcement, and prose/multi-fence rejection.
- Added `buildCoderMessages()` and `buildReformatNudgeMessages()` for Plan 06's Qwen coder adapter loop.
- Added `isTransientFailure()` and `nextBackoffMs()` / `createDeterministicRng()` in `@protostar/execution`.

## Task Commits

1. **Task 1 RED: SSE parser tests** - `c1dad35` (test)
2. **Task 1 GREEN: SSE parser implementation** - `37af2ca` (feat)
3. **Task 2 RED: Diff parser and prompt tests** - `f3eb582` (test)
4. **Task 2 GREEN: Diff parser and prompt builder** - `a7bd172` (feat)
5. **Task 3 RED: Retry and backoff tests** - `659d005` (test)
6. **Task 3 GREEN: Retry classifier and backoff** - `0b6590d` (feat)

## Files Created/Modified

- `packages/lmstudio-adapter/src/sse-parser.ts` - Streaming SSE data-frame parser.
- `packages/lmstudio-adapter/src/diff-parser.ts` - Strict fenced diff extractor.
- `packages/lmstudio-adapter/src/prompt-builder.ts` - Coder and reformat retry message builder.
- `packages/execution/src/retry-classifier.ts` - Transient HTTP/network/timeout classifier.
- `packages/execution/src/backoff.ts` - Exponential backoff with capped base and +/-20% jitter.
- `packages/lmstudio-adapter/src/index.ts` - Barrel exports for new LM Studio helpers.
- `packages/execution/src/index.ts` - Barrel exports for retry/backoff helpers.

## Usage Snippet

```ts
const messages = buildCoderMessages({ task, fileContents, acceptanceCriteria, archetype });
for await (const event of parseSseStream(response.body)) {
  if (event.data === "[DONE]") break;
  // assemble LM Studio delta content
}
const parsed = parseDiffBlock(assistantContent);
const retry = isTransientFailure({ kind: "http", status });
const delayMs = nextBackoffMs(attempt, createDeterministicRng(seed));
```

## Verification

- `pnpm --filter @protostar/lmstudio-adapter test` - PASS (33 tests).
- `pnpm --filter @protostar/execution test` - PASS (36 tests).
- Isolated Task 3 helper compile/test - PASS (12 tests) via `/tmp/protostar-04-05-execution-tests`.
- `pnpm run verify` - FAIL outside this plan: `@protostar/intent` currently has parallel schema/envelope changes with failing intent tests and fixture expectations.

## Decisions Made

- Kept helper modules pure; no filesystem, network, subprocess, or authority minting was added.
- Preserved the exported canonical `DIFF_FENCE_RE` while adding a whole-response equality guard so prose drift fails as required.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Strict parser whole-response guard**
- **Found during:** Task 2 (Diff parser + prompt builder)
- **Issue:** The plan's sample `DIFF_FENCE_RE` uses multiline anchoring; by itself it can match a fence after prose, conflicting with the required `parse-no-block` behavior for `proseDriftDiffSample`.
- **Fix:** Count fenced blocks, then require the single fenced block to equal the trimmed whole response before extracting the diff.
- **Files modified:** `packages/lmstudio-adapter/src/diff-parser.ts`
- **Verification:** `pnpm --filter @protostar/lmstudio-adapter test` passes; prose preamble test passes.
- **Committed in:** `a7bd172`

---

**Total deviations:** 1 auto-fixed (1 bug).
**Impact on plan:** The fix preserves the plan's strict parsing requirement and prevents prose drift from bypassing the reformat retry path.

## Issues Encountered

- Initial `lmstudio-adapter` test runs inside the sandbox could not bind `127.0.0.1` for the existing stub preflight tests (`listen EPERM`). Re-ran with approved escalation; tests passed.
- During Task 3, `pnpm --filter @protostar/execution test` briefly failed before reaching this plan's files because parallel `@protostar/intent` schema changes were mid-flight. After those moved forward, the execution package test passed.
- `pnpm run verify` still fails in `@protostar/intent` tests unrelated to this plan's files.

## Known Stubs

None.

## Threat Flags

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Plan 06 can compose these helpers for the LM Studio coder adapter: prompt construction, SSE token streaming, strict diff extraction, one-shot reformat retry, transient retry classification, and deterministic backoff are all exported.

## Self-Check: PASSED

- Found all created helper and test files.
- Found task commits: `c1dad35`, `37af2ca`, `f3eb582`, `a7bd172`, `659d005`, `0b6590d`.
- Verified no tracked files were deleted by task commits.

---
*Phase: 04-execution-engine*
*Completed: 2026-04-27*
