---
phase: 04-execution-engine
plan: 01
type: execute
wave: 0
depends_on: []
files_modified:
  - packages/execution/src/index.ts
  - packages/execution/src/lifecycle.test.ts
  - packages/execution/src/admitted-artifact-integration.test.ts
  - packages/execution/src/admitted-plan-runtime-admission.test.ts
autonomous: true
requirements: [EXEC-01]
must_haves:
  truths:
    - "ExecutionTaskStatus union is exactly: pending | running | succeeded | failed | timeout | cancelled (no `passed`, no `blocked`)"
    - "ExecutionLifecycleEventType union is exactly: task-pending | task-running | task-succeeded | task-failed | task-timeout | task-cancelled"
    - "runDryRunExecution emits the new event names and returns succeeded/failed terminal states only"
    - "All existing execution tests pass against the new vocab with no compatibility shim"
  artifacts:
    - path: packages/execution/src/index.ts
      provides: "State-machine vocab + lifecycle event union + dry-run executor"
      contains: '"succeeded" | "failed" | "timeout" | "cancelled"'
    - path: packages/execution/src/lifecycle.test.ts
      provides: "Vocab pin tests"
  key_links:
    - from: "packages/execution/src/index.ts"
      to: "downstream Phase 5 review subscribers"
      via: "ExecutionLifecycleEventType discriminated union"
      pattern: "task-succeeded|task-failed|task-timeout|task-cancelled"
---

<objective>
Flip the dry-run executor's state-machine vocabulary from `pending|running|passed|failed|blocked` to the EXEC-01 vocabulary `pending|running|succeeded|failed|timeout|cancelled`. Per D-Q-01 (CONTEXT.md): no compatibility shim, no widened union, full lockstep rewrite of types + dry-run executor + tests in a single plan.

Purpose: Lock the vocabulary that Phase 5 review and Phase 9 inspect will switch on exhaustively.
Output: Rewritten `packages/execution/src/index.ts` with new unions; dry-run tests updated; new `lifecycle.test.ts` pinning the vocab.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/phases/04-execution-engine/04-CONTEXT.md
@.planning/phases/04-execution-engine/04-RESEARCH.md
@.planning/phases/04-execution-engine/04-PATTERNS.md
@packages/execution/src/index.ts
@AGENTS.md

<interfaces>
Current shape (packages/execution/src/index.ts:8, :25-30, :43-47):
```typescript
export type ExecutionTaskStatus = "pending" | "running" | "passed" | "failed" | "blocked";
export type ExecutionLifecycleEventType =
  | "task-pending" | "task-running" | "task-passed" | "task-failed" | "task-blocked";
export interface ExecutionDryRunTaskResult extends ExecutionTask {
  readonly status: "passed" | "failed" | "blocked";
  ...
}
```

New shape (target):
```typescript
export type ExecutionTaskStatus =
  | "pending" | "running" | "succeeded" | "failed" | "timeout" | "cancelled";
export type ExecutionLifecycleEventType =
  | "task-pending" | "task-running" | "task-succeeded"
  | "task-failed" | "task-timeout" | "task-cancelled";
export interface ExecutionDryRunTaskResult extends ExecutionTask {
  readonly status: "succeeded" | "failed";  // dry-run only emits these two
  ...
}
```

Note: `blocked` semantic (dependency unreachable) moves to plan-graph "unreachable" status — NOT a task state. Document inline. Dry-run drops the prior `blocked` branch entirely; pre-existing tests asserting `blocked` are rewritten to assert `failed` with `reason: 'dependency-failed'` per D-Q-01.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add vocab pin tests (RED)</name>
  <files>packages/execution/src/lifecycle.test.ts</files>
  <read_first>
    - packages/execution/src/index.ts (full file)
    - .planning/phases/04-execution-engine/04-CONTEXT.md §Q-01, §Q-04
  </read_first>
  <behavior>
    - Test 1: `ExecutionTaskStatus` accepts the six new literals and rejects `"passed"` and `"blocked"` at type level (use `expectAssignable`/`expectNotAssignable` style or runtime const-assertion arrays).
    - Test 2: `ExecutionLifecycleEventType` includes `task-succeeded`, `task-timeout`, `task-cancelled`; excludes `task-passed`, `task-blocked`.
    - Test 3: A runtime helper exhaustiveness check (switch with `never` default) covers all six statuses.
    - Test 4: `runDryRunExecution` over a fixture plan with one `pending` task emits events of types `task-pending` then `task-succeeded` (verbatim strings).
  </behavior>
  <action>
    Create `packages/execution/src/lifecycle.test.ts` per D-Q-01/Q-04. Import `ExecutionTaskStatus`, `ExecutionLifecycleEventType`, `runDryRunExecution`, `prepareExecutionRun` from `./index.js`. Use `node:test` and `node:assert/strict`. Build runtime const-assertion arrays:
    ```ts
    const STATUSES: readonly ExecutionTaskStatus[] = ["pending","running","succeeded","failed","timeout","cancelled"] as const;
    const EVENTS: readonly ExecutionLifecycleEventType[] = ["task-pending","task-running","task-succeeded","task-failed","task-timeout","task-cancelled"] as const;
    ```
    Assert no `"passed"` or `"blocked"` literal appears in either array. Add an exhaustiveness switch helper used to assert at compile time.
    For Test 4, build a minimal `ExecutionRunPlan` via `prepareExecutionRun` against a one-task admitted plan fixture (reuse fixture pattern from `admitted-artifact-integration.test.ts`) and call `runDryRunExecution`; assert emitted event types in order.
    Tests MUST fail initially (file imports new literals not yet in source). Commit RED.
  </action>
  <verify>
    <automated>cd packages/execution && pnpm run build 2>&1 | grep -E "(error TS|passed)" || true; node --test dist/lifecycle.test.js 2>&1 | tail -20</automated>
  </verify>
  <acceptance_criteria>
    - `packages/execution/src/lifecycle.test.ts` exists
    - Build fails OR test fails with reference to missing `succeeded`/`timeout`/`cancelled` literals
    - File greps positive for `"task-succeeded"`, `"task-timeout"`, `"task-cancelled"`: `grep -c '"task-succeeded"' packages/execution/src/lifecycle.test.ts` ≥ 1
  </acceptance_criteria>
  <done>RED test committed; running it fails with clear "vocab not yet flipped" signal.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Flip vocab + rewrite dry-run executor (GREEN)</name>
  <files>packages/execution/src/index.ts, packages/execution/src/admitted-artifact-integration.test.ts, packages/execution/src/admitted-plan-runtime-admission.test.ts</files>
  <read_first>
    - packages/execution/src/index.ts (full file, especially lines 1-100 and the dry-run runner)
    - packages/execution/src/admitted-artifact-integration.test.ts
    - packages/execution/src/admitted-plan-runtime-admission.test.ts
    - .planning/phases/04-execution-engine/04-PATTERNS.md §"state-machine vocab flip"
  </read_first>
  <behavior>
    - lifecycle.test.ts (Task 1) passes
    - All previously-green tests in `packages/execution` continue to pass after literal substitutions
  </behavior>
  <action>
    Per D-Q-01/Q-04 and PATTERNS.md "Lines to rewrite verbatim":
    1. Line 8: `ExecutionTaskStatus` → `"pending" | "running" | "succeeded" | "failed" | "timeout" | "cancelled"`.
    2. Lines 25-30: `ExecutionLifecycleEventType` → `"task-pending" | "task-running" | "task-succeeded" | "task-failed" | "task-timeout" | "task-cancelled"`. DELETE `task-blocked`. ADD `task-timeout`, `task-cancelled`.
    3. Lines 43-47: `ExecutionDryRunTaskResult.status` → `"succeeded" | "failed"`. Drop `blocked` arm. Drop `blockedBy` from this interface (still allowed on `ExecutionLifecycleEvent` if a future timeout/cancel needs it; otherwise remove).
    4. Inside `runDryRunExecution` (currently emits `task-passed`, possibly `task-blocked`): replace every `"task-passed"` with `"task-succeeded"`, every `"passed"` status literal with `"succeeded"`. DELETE the entire `blocked` branch (where a task whose dependency failed previously emitted `task-blocked` with `blockedBy`). Replace with: dependency-failed tasks emit `task-failed` with `reason: "dependency-failed"` and `blockedBy: [...]` carried in event metadata only (not status).
    5. Update `taskEvidenceRef`'s status param type if present from `"passed" | "failed"` to `"succeeded" | "failed"`.
    6. Update `admitted-artifact-integration.test.ts` and `admitted-plan-runtime-admission.test.ts`: every `"passed"` → `"succeeded"`, every `"task-passed"` → `"task-succeeded"`. Any `"blocked"` assertions → expect `"failed"` with `reason: "dependency-failed"`. NO `--no-shim` flag, no compat re-exports — verbatim flip.
    Add a 1-line code comment above the unions: `// EXEC-01 vocab — see Phase 4 Q-01/Q-04. blocked moved to plan-graph.`
  </action>
  <verify>
    <automated>cd /Users/zakkeown/Code/protostar && pnpm --filter @protostar/execution test 2>&1 | tail -30 && grep -c '"passed"' packages/execution/src/index.ts | grep -E "^0$" && grep -c '"blocked"' packages/execution/src/index.ts | grep -E "^0$" && grep -v '^//' packages/execution/src/index.ts | grep -c '"succeeded"' </automated>
  </verify>
  <acceptance_criteria>
    - `pnpm --filter @protostar/execution test` exits 0
    - `grep -c '"passed"' packages/execution/src/index.ts` returns `0`
    - `grep -c '"blocked"' packages/execution/src/index.ts` returns `0`
    - `grep -v '^//' packages/execution/src/index.ts | grep -c '"succeeded"'` returns ≥ 3
    - lifecycle.test.ts assertions all pass
  </acceptance_criteria>
  <done>State machine flipped; all execution-package tests green against new vocab; zero compat shim.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| execution package ↔ Phase 5 review consumers | downstream subscribers switch on the lifecycle event union exhaustively; literal drift = silent miss |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-04-01 | Tampering | `ExecutionLifecycleEventType` union | mitigate | Vocab pin test (Task 1) asserts exact literal set; CI fails if a literal is added/removed silently |
| T-04-02 | Repudiation | dry-run executor emits unknown event type | mitigate | Exhaustiveness `never`-switch test in Task 1 catches new variants without consumer update |
</threat_model>

<verification>
- `pnpm --filter @protostar/execution test` green
- `pnpm run verify` shows no other packages broke (note: `apps/factory-cli` likely consumes these types — Plan 10 owns wiring; this plan must NOT break the existing dry-run consumer call site, only the literals)
- `grep -rn '"task-passed"\|"task-blocked"' packages/execution/src/` returns zero matches
</verification>

<success_criteria>
- Vocab union exactly matches EXEC-01
- Zero `passed`/`blocked` task-state literals remain in `packages/execution/src/`
- All execution-package tests pass against new vocab
- One inline code comment marks the EXEC-01 lock for future maintainers
</success_criteria>

<output>
Create `.planning/phases/04-execution-engine/04-01-SUMMARY.md` with: files changed (3), tests added/modified, the new union as canonical reference, and any incidental fixture renames.
</output>
