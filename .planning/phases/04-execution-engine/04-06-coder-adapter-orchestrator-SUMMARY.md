---
phase: 04-execution-engine
plan: 06
subsystem: execution
tags: [lmstudio, execution-adapter, sse, retry, timeout, change-set]

requires:
  - phase: 04-execution-engine
    provides: [execution-adapter-contract, lmstudio-stub-fixture, sse-diff-retry-helpers, capability-envelope-1-3-0]
provides:
  - LM Studio coder ExecutionAdapter factory
  - Streaming token events with journal append calls
  - Strict diff change-set construction with pre-image SHA evidence
  - Retry, parse-reformat, timeout, and abort coverage
affects: [04-10-factory-cli-real-executor-wiring, 05-review-repair-loop, 09-operator-surface-resumability]

tech-stack:
  added: []
  patterns: [async-iterable-adapter-events, injected-fetch-tests, chained-abort-controller-cleanup]

key-files:
  created:
    - packages/lmstudio-adapter/src/coder-adapter.ts
    - packages/lmstudio-adapter/src/coder-adapter.test.ts
    - packages/lmstudio-adapter/src/coder-adapter-retry.test.ts
    - packages/lmstudio-adapter/src/coder-adapter-timeout.test.ts
  modified:
    - packages/lmstudio-adapter/src/index.ts

key-decisions:
  - "The adapter returns the plan-required entries-shaped change set structurally while @protostar/repo still exposes an older RepoChangeSet barrel shape."
  - "Per-attempt AbortControllers are chained to ctx.signal and cleaned up after each attempt to avoid listener leaks."

patterns-established:
  - "Adapter tests inject fetch and sleep implementations for deterministic retry/timeout behavior."
  - "Hash 1 of 2 is explicitly commented at the adapter repoReader.readFile site."

requirements-completed: [EXEC-02, EXEC-03, EXEC-05, EXEC-06, EXEC-07]

duration: 9min
completed: 2026-04-27T23:20:56Z
---

# Phase 04 Plan 06: Coder Adapter Orchestrator Summary

**LM Studio coder adapter streams SSE tokens, builds hash-pinned diff change sets, and handles parse, retry, timeout, and abort failures.**

## Performance

- **Duration:** 9 min
- **Started:** 2026-04-27T23:12:03Z
- **Completed:** 2026-04-27T23:20:56Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments

- Added `createLmstudioCoderAdapter(config)` with `id: "lmstudio-coder"` and an `AsyncIterable<AdapterEvent>` result stream ending in one `final` event.
- Streamed every LM Studio delta as `{ kind: "token" }` and through `ctx.journal.appendToken(taskId, attempt, text)`.
- Read every `targetFile` through `ctx.repoReader.readFile`, recorded the pre-image SHA, and attached it to change-set entries.
- Implemented one parse-reformat retry, transient HTTP/network retries with deterministic backoff hooks, and timeout/abort distinction via `signal.reason`.

## Task Commits

Each task was committed atomically where the shared worktree allowed it:

1. **Task 1 RED: Happy path + parse-reformat tests** - `e04dc89` (test)
2. **Task 1 GREEN: Coder adapter implementation** - `a5f98e7` (feat content landed inside a parallel `test(04-08)` commit; see deviation)
3. **Task 2: Retry on transient HTTP + retries-exhausted** - `77b4d8f` (test)
4. **Task 3: Per-task timeout + abort handling** - `647ab8f` (test)
5. **Plan-level failure matrix completion** - `50551f8` (test)

## Files Created/Modified

- `packages/lmstudio-adapter/src/coder-adapter.ts` - LM Studio coder adapter orchestration, SSE streaming, retry loop, abort handling, and change-set construction.
- `packages/lmstudio-adapter/src/coder-adapter.test.ts` - Happy path, parse-reformat, token streaming, hash, parse-no-block, and aux-budget tests.
- `packages/lmstudio-adapter/src/coder-adapter-retry.test.ts` - HTTP/network retry, retry cap, non-transient, unreachable, and deterministic backoff tests.
- `packages/lmstudio-adapter/src/coder-adapter-timeout.test.ts` - Timeout, abort, no-retry-on-timeout, and warning-listener cleanup tests.
- `packages/lmstudio-adapter/src/index.ts` - Barrel export for `createLmstudioCoderAdapter` and `LmstudioAdapterConfig`.

## Adapter Event Sequence

1. Read `task.targetFiles` through `ctx.repoReader.readFile` and store `{ bytes, sha256 }`.
2. Build coder messages from target file contents, acceptance criteria, and archetype.
3. POST streaming chat-completions to `${baseUrl}/chat/completions`.
4. Yield each content delta as `token` and append it to the journal.
5. Parse a single fenced diff block.
6. Return `final` with either `outcome: "change-set"` and entries `{ path, op, diff, preImageSha256 }`, or `outcome: "adapter-failed"` with a typed reason and evidence.

## Failure-Reason Matrix

| Reason | Coverage |
| --- | --- |
| `parse-no-block` | Out-of-target diff path test |
| `parse-multiple-blocks` | Multiple fenced blocks test |
| `parse-reformat-failed` | Two prose-only attempts test |
| `lmstudio-unreachable` | Non-transient fetch error test |
| `lmstudio-http-error` | 401 non-transient HTTP test |
| `lmstudio-model-not-loaded` | Admission/preflight-only reason; covered by existing preflight model-not-loaded tests, not returned by task execution |
| `retries-exhausted` | Four repeated 503 attempts test |
| `aborted` | Sigint-style abort test |
| `timeout` | Mid-stream timeout abort test |
| `aux-read-budget-exceeded` | Invalid aux-read budget guard test |

## Budget Cap Mapping

- `ctx.budget.adapterRetriesPerTask` is the max attempt count.
- Transient retries add `evidence.retries[]` entries with `retryReason: "transient"` and optional `errorClass`.
- Parse-reformat uses the same attempt budget and records `retryReason: "parse-reformat"`.
- Timeout and abort are terminal immediately and do not consume retry backoff.

## Hash 1 of 2 Location

- `packages/lmstudio-adapter/src/coder-adapter.ts` at the `ctx.repoReader.readFile(path)` site contains the required `Hash 1 of 2` comment.

## Decisions Made

- Kept the adapter filesystem-free; all file bytes come through `ctx.repoReader`.
- Added `fetchImpl` and `sleepMs` config hooks for deterministic tests while defaulting production behavior to global `fetch` and real sleep.
- Used an entries-shaped change set cast at the adapter boundary because Plan 06 expects Phase 3 `applyChangeSet` patch entries, while the current `RepoChangeSet` barrel still exposes a stale workspace/branch/patches shape.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] RepoChangeSet barrel shape lagged the plan contract**
- **Found during:** Task 1 (Coder adapter happy path + parse-reformat)
- **Issue:** `@protostar/execution` imports `RepoChangeSet` from `@protostar/repo`, but the current repo barrel still exposes `workspace/branch/patches` while the plan requires `entries[*].preImageSha256`.
- **Fix:** Built the plan-required entries-shaped object locally and cast it at the adapter result boundary, keeping writes confined to `packages/lmstudio-adapter`.
- **Files modified:** `packages/lmstudio-adapter/src/coder-adapter.ts`, tests.
- **Verification:** `pnpm --filter @protostar/lmstudio-adapter test` passed with 53 tests.
- **Committed in:** `a5f98e7`

**2. [Rule 3 - Blocking] Task 1 GREEN files were swept into a parallel executor commit**
- **Found during:** Task 1 commit step
- **Issue:** While staging the Task 1 implementation, a parallel executor committed `coder-adapter.ts`, `index.ts`, and a test path adjustment inside `a5f98e7` along with 04-08 files.
- **Fix:** Did not rewrite or revert the parallel commit. Recorded `a5f98e7` as the implementation commit and continued with separate Task 2/3 commits.
- **Files modified:** No additional fix files.
- **Verification:** Subsequent scoped package tests passed.
- **Committed in:** `a5f98e7`

---

**Total deviations:** 2 auto-handled (2 Rule 3).
**Impact on plan:** The shipped adapter behavior matches the plan, but Task 1 GREEN was not isolated in history because of shared-worktree parallel commit contention.

## Issues Encountered

- Sandbox runs cannot bind the local `127.0.0.1` stub server (`listen EPERM`). Re-ran package tests with approved escalation; they passed.
- `pnpm run verify` and `pnpm run factory` currently fail outside this plan because parallel planning changes reference undefined `optionalTaskRequiredNetwork` in `packages/planning/src/index.ts`.

## Verification

- `pnpm --filter @protostar/lmstudio-adapter test` - PASS (53 tests, with loopback bind escalation).
- `grep -c "Hash 1 of 2" packages/lmstudio-adapter/src/coder-adapter.ts` - PASS (`1`).
- `grep -n "node:fs" packages/lmstudio-adapter/src/coder-adapter.ts || true` - PASS (no matches).
- `pnpm run verify` - BLOCKED by unrelated parallel planning edits.
- `pnpm run factory` - BLOCKED by unrelated parallel planning edits.

## Known Stubs

None.

## Threat Flags

None beyond planned local LM Studio network I/O and adapter evidence handling. The adapter does not import `node:fs`; workspace content is accessed only through `ctx.repoReader`.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Plan 10 can wire the LM Studio coder adapter into the real executor: the adapter factory, event stream, change-set result, retry evidence, timeout/abort semantics, and Hash 1 of 2 pre-image evidence are in place.

## Self-Check: PASSED

- Summary file exists: `.planning/phases/04-execution-engine/04-06-coder-adapter-orchestrator-SUMMARY.md`
- Task commits found in git history: `e04dc89`, `a5f98e7`, `77b4d8f`, `647ab8f`, `50551f8`
- No tracked files were deleted by this plan's commits.
- Stub scan found no blocking TODO/FIXME/placeholder markers in the plan files.

---
*Phase: 04-execution-engine*
*Completed: 2026-04-27*
