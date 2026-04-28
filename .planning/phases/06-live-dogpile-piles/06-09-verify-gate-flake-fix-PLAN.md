---
phase: 06-live-dogpile-piles
plan: 09
type: execute
wave: 5
depends_on: [07, 08]
gap_closure: true
files_modified:
  - apps/factory-cli/src/run-real-execution.test.ts
  - apps/factory-cli/src/run-real-execution.ts
autonomous: true
requirements: [PLAN-A-03]
tags: [verify-gate, flake-fix, abort-controller, run-real-execution, plan-a-03, gap-closure]
must_haves:
  truths:
    - "`pnpm run verify` exits 0 deterministically across at least 5 consecutive invocations from the working tree (no cancelled subtests, no `Promise resolution is still pending but the event loop has already resolved` errors)"
    - "`apps/factory-cli/src/run-real-execution.test.ts` passes when run as part of the chained verify script (after `@protostar/repair` and `@protostar/intent` test runs), not just in isolation"
    - "Subtest 9 ('reruns repair subgraph tasks with repair context and repair attempt evidence', line 240 — the LOOP-04 closure test from Phase 5) completes deterministically on the verify gate path"
    - "Every async resource opened inside `runRealExecution` (AbortControllers, timers, stream consumers, journal writers) is awaited or torn down before the function resolves; no dangling listeners outlive the parent test scope"
    - "Root cause is identified and documented in the SUMMARY (e.g. open AbortController, unawaited stream consumer, parent-test timeout interaction) — not papered over with a `--bail` or test-skip"
  artifacts:
    - path: "apps/factory-cli/src/run-real-execution.ts"
      provides: "Deterministic teardown of per-task AbortControllers, timers, and abort listeners"
      contains: "removeEventListener"
    - path: "apps/factory-cli/src/run-real-execution.test.ts"
      provides: "Subtest 9 ('reruns repair subgraph tasks with repair context and repair attempt evidence') that runs deterministically under the chained verify script"
      contains: "reruns repair subgraph tasks with repair context and repair attempt evidence"
  key_links:
    - from: "apps/factory-cli/src/run-real-execution.ts"
      to: "input.rootSignal"
      via: "addEventListener('abort', onRootAbort, { once: true })"
      pattern: "rootSignal\\.addEventListener"
    - from: "apps/factory-cli/src/run-real-execution.ts"
      to: "AbortController teardown"
      via: "removeEventListener / clearTimeout in finally block"
      pattern: "removeEventListener|clearTimeout"
---

<objective>
Make `pnpm run verify` deterministically green by diagnosing and fixing the flake in `apps/factory-cli/src/run-real-execution.test.ts`. Two consecutive verify runs both fail at the factory-cli leg with 8 cancelled subtests (parent suite `runRealExecution`, not ok 19) emitting "Promise resolution is still pending but the event loop has already resolved" / `failureType=cancelledByParent` on subtests 4-11. The same target passes 146/146 in isolation. **Subtest 9 is the LOOP-04 closure test from Phase 5** (`reruns repair subgraph tasks with repair context and repair attempt evidence`, line 240) — the flake means LOOP-04's repair-context-and-repair-attempt-evidence behavior is not deterministically observable at the verify gate, which carries a Phase 5 gap-reopen risk.

Purpose: Close Gap 2 from `06-VERIFICATION.md`. Restore the Phase 1 PLAN-A-03 invariant ("admission contracts cannot regress silently") so the entire program's gate is meaningful again. Re-confirm Phase 5 LOOP-04 closure as a side effect.

Output: Root cause identified, fix applied, verify gate green across ≥5 consecutive runs, SUMMARY documenting the diagnosis.

This plan MUST land before Plan 06-10 (exec-coord runtime wiring) — Plan 06-10 will extend `run-real-execution.test.ts` and/or `main.test.ts` with new pile-trigger tests, and those tests must inherit a deterministic harness, not amplify a pre-existing flake.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/06-live-dogpile-piles/06-VERIFICATION.md
@.planning/phases/05-review-repair-loop/05-VERIFICATION.md
@apps/factory-cli/src/run-real-execution.ts
@apps/factory-cli/src/run-real-execution.test.ts
@apps/factory-cli/src/main.real-execution.test.ts
@package.json

<symptoms>
From `06-VERIFICATION.md` Gap 2:

- Two consecutive `pnpm run verify` invocations both fail at `apps/factory-cli`.
- Failures localized to `apps/factory-cli/src/run-real-execution.test.ts`, parent suite "runRealExecution" (not ok 19).
- 8 cancelled subtests (subtests 4-11 of the parent), `failureType=cancelledByParent`.
- Error message: "Promise resolution is still pending but the event loop has already resolved".
- Specific lines flagged: 109, 132, 151, 186, 200, 270, 285.
- Subtest at line 240 ("reruns repair subgraph tasks with repair context and repair attempt evidence") is the **Phase 5 LOOP-04 closure test**.
- `pnpm --filter @protostar/factory-cli test` passes 146/146 deterministically in isolation.
- `pnpm run verify` chains: `typecheck && repair test && intent test && factory-cli test`. Failure is on the chained run only.
</symptoms>

<root_cause_hypotheses>
Ordered by likelihood given the failure shape:

1. **Open per-task AbortController listener.** `run-real-execution.ts:144` registers `input.rootSignal.addEventListener("abort", onRootAbort, { once: true })` but the cleanup path may miss `removeEventListener` on the success branch — when the parent test's `rootSignal` (a fresh AbortController in `testContext()`) is GC'd or aborted late, the listener fires after the test has resolved, producing "Promise resolution is still pending but the event loop has already resolved."
2. **Unawaited timer.** `run-real-execution.ts:146` creates `setTimeout(...)` for task wall-clock; the timer may not be cleared on the early-return path (e.g. when adapter resolves quickly), leaving an unref'd timer that fires after the test resolved.
3. **Parent-test timeout interaction with chained pnpm filters.** Node's `node:test` parent-test default timeout is 30s; chained verify runs accumulate enough wall-clock that the parent test scope hits its budget while subtests are still resolving — this surfaces as `cancelledByParent`. May compound with #1/#2.
4. **Adapter stream not drained on early return.** `executeToFinal` consumes adapter `execute()` async iterators; if any iterator yields after `final` and the consumer breaks early without `iterator.return()`, the generator is suspended and its cleanup never runs.

Plan 06-08 SUMMARY noted: "Initial run reported 8 cancelled in factory-cli; re-run was 146/146 clean — pre-existing flake unrelated to this plan, factory-cli passes deterministically when run directly." This pre-existing flake is now blocking; the gap report says it MUST be fixed.
</root_cause_hypotheses>

<scope_clarifications>
- This is NOT a Plan 05 reopen. The `262d216 fix(05): harden review repair loop blockers` commit closed the LOOP-04 logic gap; the flake is in test-harness lifecycle, not in the repair-context wiring being tested. Once green, no separate Phase 5 gap-closure is needed beyond noting the verify-path confirmation in this plan's SUMMARY.
- Do NOT introduce `--bail` or skip the flaky subtests. PLAN-A-03 demands the gate be deterministic, not muted.
- Do NOT split the verify script. The chained `repair → intent → factory-cli` order is intentional (faster-first-fail).
- If the root cause turns out to be in a shared test helper (e.g. `testContext()`, `createJournalWriter`, `executeToFinal` in `run-real-execution.ts`), fix it at the source — do not patch each subtest independently.
</scope_clarifications>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Reproduce the flake deterministically</name>
  <files>apps/factory-cli/src/run-real-execution.test.ts</files>
  <read_first>
    - apps/factory-cli/src/run-real-execution.test.ts (full file — survey all 8 cancelled subtests at lines 109, 132, 151, 186, 200, 240, 270, 285)
    - apps/factory-cli/src/run-real-execution.ts (full file — async resource lifecycle: rootSignal listener at :144, setTimeout at :146, executeToFinal at :149)
  </read_first>
  <action>
    Reproduce the failure mode the gap report described. Run `pnpm run verify` from the repo root at least 3 times consecutively. For each run, capture:
    - Exit code
    - Which subtests failed (by name, not just line number — names are stable across edits)
    - The full error chain for the first failing subtest (look for "Promise resolution is still pending" / `cancelledByParent`)
    - Whether `pnpm --filter @protostar/factory-cli test` passes 146/146 in isolation immediately after the verify failure

    Then add diagnostic instrumentation to `run-real-execution.ts` (TEMPORARY — to be removed in Task 3):
    - Log when `rootSignal.addEventListener('abort', ...)` is registered and when the corresponding `removeEventListener` is called (or note absence of removal).
    - Log when `setTimeout(...)` is created (line ~146) and when it is cleared (or note absence of clearing).
    - Log when each adapter `execute()` async iterator is created and when it terminates.

    Re-run `pnpm run verify` and capture the diagnostic trace from the failing run. The trace should pinpoint which resource(s) outlive the test scope.

    **Do NOT commit the diagnostic logging.** It is local-only investigation.

    Document the reproduction protocol and observed trace in a working note that becomes part of the SUMMARY's "Diagnosis" section.
  </action>
  <verify>
    <automated>cd /Users/zakkeown/Code/protostar &amp;&amp; (for i in 1 2 3; do echo "=== run $i ==="; pnpm run verify 2>&amp;1 | tail -50; done) | tee /tmp/verify-flake-repro.log &amp;&amp; grep -c "cancelledByParent\|Promise resolution is still pending" /tmp/verify-flake-repro.log</automated>
  </verify>
  <done>
    Flake is reproduced at least once across 3 verify runs. Diagnostic trace identifies the specific async resource(s) outliving the test scope. The hypothesis from the plan's `<root_cause_hypotheses>` block is either confirmed (which one) or rejected (with new evidence).
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Fix the flake at its source and add a regression guard</name>
  <files>apps/factory-cli/src/run-real-execution.ts, apps/factory-cli/src/run-real-execution.test.ts</files>
  <read_first>
    - apps/factory-cli/src/run-real-execution.ts (specifically the per-task loop body at lines 126-200 — the AbortController/timer/listener trio is the most likely culprit)
    - Working note from Task 1 (root cause identified)
  </read_first>
  <behavior>
    The fix MUST guarantee:
    1. Every `rootSignal.addEventListener("abort", onRootAbort, { once: true })` registration is paired with `rootSignal.removeEventListener("abort", onRootAbort)` on every exit path of the per-task loop body (success, timeout, error, abort, break) — typically via a `try { ... } finally { ... }` block.
    2. Every `setTimeout` for task wall-clock is paired with `clearTimeout` on every exit path (same finally block).
    3. Adapter `execute()` async iterators are properly disposed when the consumer breaks early (use `for await ... of` which auto-calls `iterator.return()`, or explicit `iterator.return()` on early break).
    4. No new async resources are leaked by the fix itself.

    Add at least one regression test in `run-real-execution.test.ts` that:
    - Constructs an `AbortController`, runs `runRealExecution` to completion (success path), and asserts that the controller's signal has zero remaining `abort` listeners. Use `process.getEventListeners?.(controller.signal, 'abort')?.length ?? 0` (Node ≥ 19) or wrap with a `Proxy` that counts add/remove pairs.
    - Constructs an `AbortController`, runs `runRealExecution` through a timeout path, and asserts the same listener-leak invariant.
  </behavior>
  <action>
    TDD ordering:

    **RED** — Write the listener-leak regression test first. It should fail against the current `run-real-execution.ts` (or pass spuriously due to the very flake we're chasing — in which case run it 5x to confirm it catches the leak deterministically).

    **GREEN** — Apply the fix at the root cause identified in Task 1. Common shapes:
    ```ts
    const onRootAbort = () => taskController.abort(input.rootSignal.reason);
    input.rootSignal.addEventListener("abort", onRootAbort, { once: true });
    const timer = setTimeout(() => taskController.abort("timeout"), taskWallClockMs(input.resolvedEnvelope));
    try {
      // ... existing per-task body ...
    } finally {
      clearTimeout(timer);
      input.rootSignal.removeEventListener("abort", onRootAbort);
    }
    ```
    The `{ once: true }` option self-removes on fire, but if the signal NEVER aborts the listener stays registered until GC — which is exactly the flake shape. The explicit `removeEventListener` in `finally` closes the leak.

    **REFACTOR** — Extract a small helper if the same pattern is used in multiple places (`installPerTaskAbortPlumbing(rootSignal, wallClockMs): { signal, dispose }` returning an `{ signal, dispose }` pair).

    Verify deterministically:
    - `pnpm --filter @protostar/factory-cli test` passes 146+regressions/146+regressions across 3 consecutive runs.
    - `pnpm run verify` exits 0 across at least 5 consecutive runs from the working tree.

    Remove the diagnostic logging added in Task 1.

    Commit shape: `fix(06-09): tear down per-task abort listener and timer to close verify-gate flake` (single atomic commit; reference 06-VERIFICATION.md gap 2 in the body).
  </action>
  <verify>
    <automated>cd /Users/zakkeown/Code/protostar &amp;&amp; pnpm --filter @protostar/factory-cli test &amp;&amp; (for i in 1 2 3 4 5; do echo "=== verify run $i ==="; pnpm run verify 2>&amp;1 | tail -5 || exit 1; done) &amp;&amp; echo "ALL 5 VERIFY RUNS GREEN"</automated>
  </verify>
  <done>
    `pnpm run verify` exits 0 across 5 consecutive runs. New regression test (listener-leak invariant) passes. No diagnostic logging remains. Commit message references the gap and the root cause.
  </done>
</task>

<task type="auto">
  <name>Task 3: Confirm Phase 5 LOOP-04 closure on the verify path and write SUMMARY</name>
  <files>.planning/phases/06-live-dogpile-piles/06-09-SUMMARY.md</files>
  <read_first>
    - .planning/phases/05-review-repair-loop/05-VERIFICATION.md (the original LOOP-04 gap)
    - apps/factory-cli/src/run-real-execution.test.ts:240 (the LOOP-04 closure test — "reruns repair subgraph tasks with repair context and repair attempt evidence")
  </read_first>
  <action>
    Run the LOOP-04 closure test specifically as part of the chained verify script ≥3 times in a row to confirm Phase 5's repair-context-and-repair-attempt-evidence behavior is now deterministically observable at the verify gate. Capture the test count (subtest-level pass/fail).

    Write `.planning/phases/06-live-dogpile-piles/06-09-SUMMARY.md` documenting:
    - Diagnosis section: hypothesis tested, root cause confirmed, the diagnostic trace excerpt that proved it (sanitized — no machine-specific paths).
    - Fix section: the code change applied, the regression test added, why it closes the leak.
    - Verification section: 5 consecutive `pnpm run verify` exit-0 runs, factory-cli isolated test count, LOOP-04 confirmation.
    - "Phase 5 LOOP-04 status" subsection: explicitly confirm whether re-verification of Phase 5's LOOP-04 is needed (expected answer: no, the LOOP-04 logic was closed in `262d216`; Gap 2 was a test-harness lifecycle bug surfacing as a verify-gate flake, not a logic regression).
  </action>
  <verify>
    <automated>test -f /Users/zakkeown/Code/protostar/.planning/phases/06-live-dogpile-piles/06-09-SUMMARY.md &amp;&amp; grep -q "LOOP-04" /Users/zakkeown/Code/protostar/.planning/phases/06-live-dogpile-piles/06-09-SUMMARY.md &amp;&amp; cd /Users/zakkeown/Code/protostar &amp;&amp; (for i in 1 2 3; do pnpm run verify &gt; /dev/null 2&gt;&amp;1 || exit 1; done) &amp;&amp; echo "VERIFY STABLE 3x"</automated>
  </verify>
  <done>
    SUMMARY.md exists and explicitly addresses LOOP-04 status. Verify gate is green 3 consecutive times immediately before commit. Commit shape: `docs(06-09): document verify-gate flake fix and LOOP-04 confirmation`.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Test-harness AbortController → runRealExecution per-task plumbing | Authority boundary: parent signal must cascade exactly once and tear down cleanly |
| Node `node:test` parent test scope → subtest async resources | Lifecycle boundary: subtests must not outlive their parent's promise resolution |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-6-27 | Repudiation | Verify gate is non-deterministic; bad commits ship past CI | mitigate | Task 2 fix + Task 2 regression test (listener-leak invariant); ≥5 consecutive verify-green runs gate the commit |
| T-6-28 | DoS (test-harness) | Open AbortController listeners accumulate across the test suite, slowing or hanging chained pnpm runs | mitigate | Explicit `removeEventListener` in `finally` closes the leak; regression test pins zero-listener-after-completion invariant |
| T-6-29 | Tampering | Diagnostic logging accidentally committed, leaking timing info | mitigate | Task 2 explicitly removes diagnostic logging; reviewer/checker scans for `console.log` in the diff |
</threat_model>

<verification>
- `pnpm run verify` exits 0 across 5 consecutive runs from the working tree.
- `pnpm --filter @protostar/factory-cli test` passes deterministically (146 + regression tests, all 3 runs).
- Subtest 9 ("reruns repair subgraph tasks with repair context and repair attempt evidence") is observed pass on the verify path.
- No `console.log`/diagnostic logging remains in `run-real-execution.ts` or `run-real-execution.test.ts`.
</verification>

<success_criteria>
- PLAN-A-03 invariant restored: verify gate is deterministic.
- Gap 2 from `06-VERIFICATION.md` closed.
- Phase 5 LOOP-04 closure confirmed on the verify path (no Phase 5 re-open required).
- Plan 06-10 inherits a stable test harness for the new exec-coord trigger tests.
</success_criteria>

<output>
After completion, create `.planning/phases/06-live-dogpile-piles/06-09-SUMMARY.md` with the diagnosis, fix, verification log, and LOOP-04 confirmation per Task 3.
</output>
