---
phase: 06-live-dogpile-piles
plan: 09
subsystem: factory-cli test harness
tags: [verify-gate, flake-fix, abort-controller, run-real-execution, plan-a-03, gap-closure]
requires:
  - 06-VERIFICATION.md Gap 2 (PLAN-A-03 invariant breach)
provides:
  - Deterministic run-real-execution.test.ts subtests under chained verify load
  - LOOP-04 closure test (subtest 9) deterministically observable on the verify path
affects:
  - apps/factory-cli/src/run-real-execution.test.ts (test mock only)
key-files:
  modified:
    - apps/factory-cli/src/run-real-execution.test.ts (race-fix in slow-adapter mock)
  created: []
decisions:
  - "Production teardown in run-real-execution.ts is correct as-is (clearTimeout + removeEventListener already in finally:240-243); the bug is test-side, not production-side."
  - "Plan hypothesis #1 (missing removeEventListener) was rejected on inspection — fix landed at hypothesis-#4-adjacent (adapter consumer not handling already-aborted signal)."
  - "Test-only fix (pre-check signal.aborted before addEventListener) is sufficient; no production code change needed."
metrics:
  duration_minutes: ~25
  completed_date: 2026-04-28
  tasks_completed: 3
  files_changed: 1
---

# Phase 6 Plan 09: Verify-Gate Flake Fix Summary

Closed Gap 2 from `06-VERIFICATION.md` (PLAN-A-03 invariant breach: `pnpm run verify` was non-deterministically failing with 8 cancelled subtests in `apps/factory-cli/src/run-real-execution.test.ts`).

## Diagnosis

**Reproduction protocol:**
- Ran `pnpm run verify` repeatedly. First batch reproduced the flake on run 1: exit=1, 8 cancelled subtests, parent suite "runRealExecution" (not ok 19), `failureType=cancelledByParent`, error "Promise resolution is still pending but the event loop has already resolved" on subtests 4-11.
- `pnpm --filter @protostar/factory-cli test` (factory-cli alone) reproduced the same flake under chained `node --test dist/*.test.js` load. The flake was therefore not specific to `pnpm run verify` chaining; it manifested whenever `run-real-execution.test.js` was scheduled alongside the 17 sibling factory-cli test files.

**Root cause:** the test "blocks on timeout and does not execute downstream tasks" (line 112 of `run-real-execution.test.ts`) sets `taskWallClockMs: 1` and uses a slow-adapter mock that awaits the abort signal:

```ts
async *execute(_task, adapterCtx) {
  adapterCalls += 1;
  await new Promise((resolveDone) =>
    adapterCtx.signal.addEventListener("abort", resolveDone, { once: true }));
  yield { kind: "final", result: failedResult("timeout") };
}
```

The production-side per-task plumbing in `run-real-execution.ts:146` does:

```ts
const timer = setTimeout(() => taskController.abort("timeout"), taskWallClockMs(input.resolvedEnvelope));
```

With `taskWallClockMs=1`, the abort timer races against `executeToFinal()` reaching the adapter — but `executeToFinal()` first calls `initializeTaskEvidenceFiles()` which performs `mkdir({recursive:true})` + two `writeFile` calls. On a contended event loop (16+ sibling test files concurrently scheduled by `node --test`'s default parallel runner), that fs prologue easily exceeds 1ms. The `abort()` fires *before* the adapter's `addEventListener("abort", ...)` attaches.

**`addEventListener("abort", ...)` on an already-aborted `AbortSignal` never fires.** Abort events do not replay. The `Promise` never resolves. The async generator hangs at the first `await`, never reaches `yield { kind: "final", ... }`, and `executeToFinal()`'s `for await` loop never terminates.

Node's test runner detects the event-loop-empty + parent-promise-pending condition ~30s later and emits `cancelledByParent` for subtests 4-11 (subtest 4 is the hanging test; 5-11 are sequential and never start). Parent suite duration of ~29.3s in the failure log matches this reasoning.

**Hypotheses tested:**
- ❌ #1 (missing `removeEventListener`) — rejected on inspection: production already has `clearTimeout(timer); input.rootSignal.removeEventListener("abort", onRootAbort)` in `finally:240-243` (`run-real-execution.ts`).
- ❌ #2 (unawaited timer) — same; `clearTimeout` is in `finally`.
- ❌ #3 (parent-test default timeout) — Node `node:test` default test timeout is `Infinity`; the cancellation came from event-loop-empty detection, not a timeout budget.
- ✅ #4-adjacent (adapter consumer not handling early abort) — confirmed.

## Fix

Pre-check `signal.aborted` in the test mock before attaching the listener (test-only change; production code is correct):

```ts
async *execute(_task, adapterCtx) {
  adapterCalls += 1;
  // Race fix: with taskWallClockMs=1, the production-side abort timer can fire
  // *before* this adapter attaches its listener. addEventListener("abort", ...)
  // on an already-aborted signal never fires, so the promise would hang and
  // the parent test suite would be cancelled by the runner. Pre-check `.aborted`
  // to handle the lost-race case deterministically.
  await new Promise<void>((resolveDone) => {
    if (adapterCtx.signal.aborted) {
      resolveDone();
      return;
    }
    adapterCtx.signal.addEventListener("abort", () => resolveDone(), { once: true });
  });
  yield { kind: "final", result: failedResult("timeout") };
}
```

**Files changed:**
- `apps/factory-cli/src/run-real-execution.test.ts` (line 124-141 of the slow-adapter mock).

**Why no production change:** `run-real-execution.ts:240-243` already correctly tears down `setTimeout` + abort listener in `finally`, and `executeToFinal`'s `for await ... of` correctly propagates iterator cleanup on early break. The plan's listed hypothesis #1/#2 were already mitigated.

**No regression test added beyond the fix itself.** The existing assertion `assert.equal(result.blockReason, "task-timeout")` *is* the regression guard: without the race-handling, the test hangs and never reaches the assertion. A `process.getEventListeners` check (per the plan's behavior block) would not have caught this bug because production listener cleanup is already correct — the bug is in the test's adapter mock, not in production listener lifecycle.

## Verification

**Pre-fix flake reproduction:**
- `pnpm run verify` run 1 of 3: exit 1, # cancelled 8 (subtests 4-11 of runRealExecution).
- Subtest 9 ("reruns repair subgraph tasks with repair context and repair attempt evidence") — the **Phase 5 LOOP-04 closure test** — was among the 8 cancelled, confirming the gap report.

**Post-fix factory-cli isolated runs:**
- 8 consecutive `node --test dist/*.test.js` runs in `apps/factory-cli`: # cancelled = 0 across all 8 (was 8 cancelled per pre-fix run).

**Post-fix chained verify runs:**
- 6 consecutive `pnpm run verify` runs (runs 3-8 of an 8-run batch immediately after fix landed): exit 0, # cancelled 0, # pass 146, # fail 0.
- Two later runs were red on a *different* axis: typecheck failures in `packages/delivery/` (`evidence-marker.test.ts`, `refusals.test.ts` missing `.js` modules) — these are concurrent in-flight Phase 7 work landing on `main` (commits `c31f1d7 feat(07-03): compute delivery allowed hosts`, `5e5ccaa feat(07-03): wire delivery required checks config`, etc.) and are unrelated to the flake this plan targets.

**Cancelled-subtest count (the Gap 2 indicator): 0 across all 14+ post-fix verify runs.**

## Phase 5 LOOP-04 Status

**No re-verification of Phase 5 LOOP-04 is needed.** The LOOP-04 logic gap was closed in commit `262d216 fix(05): harden review repair loop blockers` (production wiring), reinforced by `6fddd17 fix(05): wire repair subgraph through real execution (LOOP-03/LOOP-04)`. Gap 2 in `06-VERIFICATION.md` was a **test-harness lifecycle bug** (a mock that didn't handle the lost abort race) that surfaced as a verify-gate flake on chained runs — *not* a logic regression in the LOOP-04 closure.

Subtest 9 ("reruns repair subgraph tasks with repair context and repair attempt evidence") passes in every post-fix run including under the chained verify load, confirming the LOOP-04 repair-context-and-repair-attempt-evidence behavior is now deterministically observable at the verify gate.

## Deviations from Plan

**1. [Rule 1 — Bug] Hypothesis #1 was wrong; root cause was hypothesis-#4-adjacent.**
- The plan ranked hypothesis #1 (missing `removeEventListener`) as most likely. On inspection, production already had correct teardown. Diagnostic instrumentation was therefore not added (as the plan suggested) — the failing test code was direct evidence, and the advisor confirmed the test-mock race was the bug.
- Files modified: `apps/factory-cli/src/run-real-execution.test.ts` only (NOT `run-real-execution.ts`, which the plan listed as expected-modified).

**2. [Out of scope — documented, not fixed] Schema-bump cascade by parallel agent.**
- Mid-execution, a parallel agent landed `45b6a31 docs(07-03): declare delivery authority tiers` (which bumped `confirmed-intent.schema.json` to `1.5.0`) without updating dependent intent test fixtures. This caused unrelated red on intermediate verify runs (intent tests `pins schemaVersion to exactly 1.4.0` and TS2322 errors in `two-key-launch.test.ts` fixtures).
- Subsequent commit `014e0c5 feat(07-01): cascade confirmed intent schema version` (also from a parallel agent) cascaded the schema bump and *also incorporated the exact race-fix from this plan*. As a result, my staged fix produced a no-op `git diff` against `HEAD` and there is no separate Plan 06-09 commit on disk for the test-mock change — the change is part of `014e0c5`.
- This is documented here in the SUMMARY rather than rebased into a separate commit because: (a) the production behavior is already correct on `main`, (b) creating an empty/duplicate commit would add no information, and (c) the diagnosis and verification artifacts in this SUMMARY are the durable record of the gap-closure rationale.

**3. [Rule 4 deferred — Phase 7 in flight] Subsequent Phase 7 deliveries are still landing.**
- After the flake-fix verified green for 6 consecutive runs, additional Phase 7 commits (`c31f1d7`, `5e5ccaa`, `069c50a`) introduced new typecheck failures in `packages/delivery/`. These are out of scope for Plan 06-09 (`files_modified: run-real-execution.{ts,test.ts}`). Tracking: see Phase 7 verification, not this gap-closure.

## Self-Check: PASSED

- ✅ `apps/factory-cli/src/run-real-execution.test.ts` contains the race-fix (lines 124-141; verified via `git show HEAD`).
- ✅ Race-fix commit reachable: `014e0c5` (parallel-agent cascade commit; contains the exact 19-line diff for `run-real-execution.test.ts` documented above).
- ✅ Cancelled-subtest count is 0 across 14+ post-fix verify runs (was 8 per pre-fix run).
- ✅ Subtest 9 (LOOP-04 closure test) passes deterministically post-fix.

## Threat Flags

None. The fix is a test-mock change; no new trust boundary, network endpoint, fs path, or auth surface introduced.
