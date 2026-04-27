---
phase: 05-review-repair-loop
plan: 10
type: execute
wave: 4
depends_on: [04, 05, 06, 07, 08]
files_modified:
  - packages/review/src/run-review-repair-loop.ts
  - packages/review/src/run-review-repair-loop.test.ts
  - packages/review/src/persist-iteration.ts
  - packages/review/src/persist-iteration.test.ts
  - packages/review/src/load-delivery-authorization.ts
  - packages/review/src/load-delivery-authorization.test.ts
  - packages/review/src/index.ts
autonomous: true
requirements: [LOOP-01, LOOP-02, LOOP-03, LOOP-04, LOOP-05, LOOP-06]
must_haves:
  truths:
    - "`runReviewRepairLoop({ admittedPlan, execution, executor, mechanicalChecker, modelReviewer, budget, now? }): Promise<ReviewRepairLoopResult>` exists in @protostar/review"
    - "Loop runs strict mechanical→model serial: model only invoked when mechanical verdict is 'pass' (Q-02)"
    - "Loop reads `budget.maxRepairLoops` from confirmedIntent.capabilityEnvelope (Q-12); hardcoded review-package default is removed"
    - "Loop calls `synthesizeRepairPlan` from `@protostar/repair` after non-pass; calls `computeRepairSubgraph` to derive dependents (Q-03)"
    - "Loop calls `executor.executeRepairTasks(repairPlan, ctx)` to re-execute repair subgraph (Q-04, Q-06)"
    - "On approved exit: writes `runs/{id}/review/review-decision.json` AND mints DeliveryAuthorization brand (Q-15)"
    - "On block exit: writes `runs/{id}/review/review-block.json` with full iteration history + reason discriminator (Q-14)"
    - "Per-iteration directory `runs/{id}/review/iter-{N}/` contains mechanical-result.json, model-result.json (when present), repair-plan.json (when generated) (Q-17)"
    - "review.jsonl contains append-only ReviewLifecycleEvent entries; fsync before each subsequent durable artifact write (Q-18)"
    - "Old `runMechanicalReviewExecutionLoop` export remains as `@deprecated` re-export to runReviewRepairLoop"
    - "loadDeliveryAuthorization(decisionPath) re-mints brand from durable file (Q-15)"
  artifacts:
    - path: packages/review/src/run-review-repair-loop.ts
      provides: "runReviewRepairLoop main loop"
    - path: packages/review/src/persist-iteration.ts
      provides: "writeIterationDir, writeReviewBlock, writeReviewDecision, appendReviewLifecycleEvent"
    - path: packages/review/src/load-delivery-authorization.ts
      provides: "loadDeliveryAuthorization re-mint helper"
  key_links:
    - from: packages/review/src/run-review-repair-loop.ts
      to: synthesizeRepairPlan
      via: "named import"
      pattern: "from \"@protostar/repair\""
    - from: packages/review/src/run-review-repair-loop.ts
      to: mintDeliveryAuthorization
      via: "named import"
      pattern: "mintDeliveryAuthorization"
    - from: packages/review/src/persist-iteration.ts
      to: fs writes (tmp+rename)
      via: "injected FsAdapter"
      pattern: "FsAdapter"
---

<objective>
Implement the central control loop. Composes Phase 4 execution + Phase 5 mechanical-checks + Phase 5 judge + Phase 5 repair package. Replaces `runMechanicalReviewExecutionLoop` with `runReviewRepairLoop`.

Loop inputs (Q-01 verbatim): `{ admittedPlan, execution, executor, mechanicalChecker, modelReviewer, budget, now? }`.

Per Q-01: "Promote `runMechanicalReviewExecutionLoop` → `runReviewRepairLoop` (rename, keep a deprecated re-export pointing to the new function for Phase 4 tests until they update). Inline `runExecutionDryRun` callsite is replaced with the injected `executor.executeRepairTasks(...)`."

Per Q-13: hierarchical envelope — outer loop counts repair iterations (≤ maxRepairLoops); inner adapter retries (Phase 4 Q-14 adapterRetriesPerTask) nest under it. Worst case = `maxRepairLoops × |repairSubgraph| × adapterRetriesPerTask`.

Purpose: The single control plane between mutation (Phase 4) and delivery (Phase 7). LOOP-01 through LOOP-06 all land here.
Output: Loop body + persistence layer + brand re-mint helper + deprecated re-export shim.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/05-review-repair-loop/05-CONTEXT.md
@packages/review/src/index.ts
@packages/review/src/repair-types.ts
@packages/review/src/judge-types.ts
@packages/review/src/delivery-authorization.ts
@packages/review/src/lifecycle-events.ts
@packages/repair/src/synthesize-repair-plan.ts
@packages/repair/src/compute-repair-subgraph.ts
@packages/execution/src/index.ts
@packages/repo/src/fs-adapter.ts
@packages/artifacts/src/index.ts

<interfaces>
```typescript
// run-review-repair-loop.ts
// Cycle-break: ExecutionRunResult lives in @protostar/planning (neutral leaf,
// owned by 05-04). Importing from @protostar/execution here would close the
// review→execution cycle that 05-06 already opened (execution→planning for
// RepairContext). Both directions resolved by anchoring on planning leaf.
import type { AdmittedPlanExecutionArtifact, ExecutionRunResult } from "@protostar/planning";
import type { ConfirmedIntent } from "@protostar/intent";
import type {
  MechanicalChecker,
  ModelReviewer,
  RepairPlan,
  DeliveryAuthorization,
  ReviewLifecycleEvent
} from "./index.js";

export interface ReviewRepairLoopInput {
  readonly runId: string;
  readonly confirmedIntent: ConfirmedIntent;       // for budget.maxRepairLoops + envelope
  readonly admittedPlan: AdmittedPlanExecutionArtifact;
  readonly initialExecution: ExecutionRunResult;   // Phase 4 first-pass execution result
  readonly executor: TaskExecutorService;          // injected — see below
  readonly mechanicalChecker: MechanicalChecker;
  readonly modelReviewer: ModelReviewer;
  readonly persistence: ReviewPersistence;         // injected fs writers (Q-17, Q-18)
  readonly now?: () => Date;                       // testability
}

export interface TaskExecutorService {
  executeRepairTasks(input: {
    readonly repairPlan: RepairPlan;
    readonly admittedPlan: AdmittedPlanExecutionArtifact;
    readonly attempt: number;
  }): Promise<ExecutionRunResult>;
}

export interface ReviewPersistence {
  writeIterationDir(input: { readonly runId: string; readonly attempt: number; readonly mechanical: unknown; readonly model?: unknown; readonly repairPlan?: RepairPlan }): Promise<void>;
  writeReviewDecision(input: { readonly runId: string; readonly artifact: unknown }): Promise<{ readonly decisionPath: string }>;
  writeReviewBlock(input: { readonly runId: string; readonly artifact: unknown }): Promise<{ readonly blockPath: string }>;
  appendLifecycleEvent(input: { readonly runId: string; readonly event: ReviewLifecycleEvent }): Promise<void>;
}

export type ReviewRepairLoopResult =
  | { readonly status: "approved"; readonly authorization: DeliveryAuthorization; readonly finalAttempt: number; readonly decisionPath: string }
  | { readonly status: "blocked"; readonly reason: "budget-exhausted" | "critical-finding" | "mechanical-block" | "model-block"; readonly finalAttempt: number; readonly blockPath: string };

export function runReviewRepairLoop(input: ReviewRepairLoopInput): Promise<ReviewRepairLoopResult>;
```

Loop pseudocode (Q-02 verbatim):
```
attempt = 0
execution = input.initialExecution
while attempt <= maxRepairLoops:
  emit "review-iteration-started" at attempt
  mech = await mechanicalChecker({ admittedPlan, executionResult: execution, attempt, runId })
  emit "mechanical-verdict" with mech.gate.verdict + findingsCount
  if mech.gate.verdict === "block":
    persist iteration, write review-block.json with reason="mechanical-block", emit "loop-blocked"
    return { status: "blocked", reason: "mechanical-block", ... }
  if mech.gate.verdict === "pass":
    model = await modelReviewer({ admittedPlan, executionResult: execution, mechanicalGate: mech.gate, diff: <derived from mechanical>, repairContext })
    emit "model-verdict" with model.verdict + judgeIds
    if model.verdict === "pass":
      persist iteration, write review-decision.json, mint DeliveryAuthorization, emit "loop-approved"
      return { status: "approved", authorization, finalAttempt: attempt, decisionPath }
    if model.verdict === "block":
      persist iteration, write review-block.json with reason="model-block", emit "loop-blocked"
      return { status: "blocked", reason: "model-block", ... }
    // model verdict === "repair" — fall through to repair-plan synth
  // mech.verdict === "repair" or model.verdict === "repair"
  if attempt === maxRepairLoops:
    persist iteration, write review-block.json with reason="budget-exhausted", emit "loop-budget-exhausted"
    return { status: "blocked", reason: "budget-exhausted", ... }
  repairTaskIds = uniqueRepairTaskIds(mech.gate)  // existing helper in review/src/index.ts:302
  dependents = computeRepairSubgraph({ plan: admittedPlan, repairTaskIds })
  repairPlan = synthesizeRepairPlan({ runId, attempt, plan: admittedPlan, mechanical: mech.gate, model, dependentTaskIds: dependents })
  persist iteration (with repairPlan), emit "repair-plan-emitted"
  execution = await executor.executeRepairTasks({ repairPlan, admittedPlan, attempt: attempt+1 })
  attempt += 1

// fall-through (defensive — shouldn't reach here given the mech.verdict === "block" early-exits and budget-exhausted check above)
```

Persistence file shapes:
- `runs/{runId}/review/iter-{N}/mechanical-result.json` — serialized MechanicalCheckResult
- `runs/{runId}/review/iter-{N}/model-result.json` — serialized ModelReviewResult (only when model invoked)
- `runs/{runId}/review/iter-{N}/repair-plan.json` — serialized RepairPlan (only on non-terminal non-pass)
- `runs/{runId}/review/review.jsonl` — append-only ReviewLifecycleEvent entries
- `runs/{runId}/review/review-decision.json` — schema per Q-15 (model: "pass" exactly, no "skipped")
- `runs/{runId}/review/review-block.json` — schema per Q-14
</interfaces>

**Critical:** loop is in `@protostar/review` package. Per AGENTS.md authority boundary: `@protostar/review` MUST NOT do fs I/O. The `ReviewPersistence` interface is INJECTED — concrete implementation lives in `apps/factory-cli` (Plan 05-12). This package only declares the interface and consumes it. Tests use a stub persistence that records calls in memory.

The `loadDeliveryAuthorization` helper (Q-15) is similar — accepts a `readJson` function pointer; doesn't import `node:fs` itself.
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: runReviewRepairLoop core + Q-02/Q-03/Q-13 behavior</name>
  <files>packages/review/src/run-review-repair-loop.ts, packages/review/src/run-review-repair-loop.test.ts, packages/review/src/index.ts</files>
  <read_first>
    - packages/review/src/index.ts (existing runMechanicalReviewExecutionLoop:149 — survives as deprecated re-export; many internal helpers reused)
    - packages/repair/src/synthesize-repair-plan.ts (Plan 05-05)
    - packages/repair/src/compute-repair-subgraph.ts (Plan 05-05)
    - packages/review/src/repair-types.ts (Plan 05-04 — MechanicalChecker, ModelReviewer, RepairContext)
    - packages/review/src/delivery-authorization.ts (Plan 05-04 — mintDeliveryAuthorization)
    - packages/review/src/lifecycle-events.ts (Plan 05-04)
    - .planning/phases/05-review-repair-loop/05-CONTEXT.md §Q-01, §Q-02, §Q-03, §Q-12, §Q-13
  </read_first>
  <behavior>
    - Test 1 (mechanical block first iteration): mechanicalChecker returns verdict='block' on attempt 0 → loop returns `{ status: "blocked", reason: "mechanical-block", finalAttempt: 0 }`; modelReviewer NEVER called; persistence.writeReviewBlock called once.
    - Test 2 (mechanical pass + model pass first iteration): both pass on attempt 0 → returns `{ status: "approved", finalAttempt: 0 }` with branded DeliveryAuthorization; persistence.writeReviewDecision called once.
    - Test 3 (mechanical repair on attempt 0, pass on attempt 1): mech.verdict=repair → executor.executeRepairTasks invoked once with repairPlan; attempt 1 returns mech=pass + model=pass → approved; finalAttempt=1.
    - Test 4 (budget exhaustion at maxRepairLoops=2): every iteration returns mech.verdict=repair → after 2 repairs (attempt 0, 1, 2), block with reason='budget-exhausted'; iterations array length === 3 (Q-14: `iterations.length === maxRepairLoops + 1`).
    - Test 5 (model serial discipline): mechanical.verdict='repair' → modelReviewer NEVER called this iteration (Q-02 strict); only invoked when mech === 'pass'.
    - Test 6 (Q-03 worked example): A→B→C plan; first execution fails task A (synthetic); repair subgraph = [A,B,C]; assert executor.executeRepairTasks called with `repairPlan.dependentTaskIds === ['A','B','C']`.
    - Test 7 (RepairContext propagation Q-06): on iteration 1, executor receives repair plan whose tasks carry the iteration-0 critiques; assert `repairPlan.repairs[0].mechanicalCritiques` deep-equals iteration-0 mech findings for that task.
    - Test 8 (maxRepairLoops sourced from envelope Q-12): construct confirmedIntent with `budget.maxRepairLoops: 1`; assert loop terminates after 2 iterations (initial + 1 repair) on perpetual-repair scenario; reject if hardcoded default is used (assertion: vary maxRepairLoops between 1, 2, 3 and confirm matching iteration counts).
    - Test 9 (deprecated re-export): `runMechanicalReviewExecutionLoop` is still a callable export — but it's a thin shim calling `runReviewRepairLoop` with a stub persistence (or marked unsupported). Document.
  </behavior>
  <action>
0. **Cycle-break confirmation (Wave 4 → ensure Wave 1+2 leaves landed):** run `pnpm -w exec tsc --build packages/planning packages/execution packages/review` BEFORE any edits in this task. Must exit 0. If TS6202 (cyclic project reference) appears, halt — 05-06 mis-routed its `RepairContext` import (it should target `@protostar/planning`, not `@protostar/review`). Do not proceed until that is fixed at the source. This task imports `ExecutionRunResult` from `@protostar/planning` (not `@protostar/execution`) — match the interface block above verbatim.
1. Read existing `packages/review/src/index.ts` to identify reusable helpers:
   - `createReviewGate` (lines 128-147) — keep as-is, mechanicalChecker calls it indirectly
   - `uniqueRepairTaskIds` (line 302) — keep, loop uses it to derive seed task ids
   - `runMechanicalReviewExecutionLoop` (line 149) — KEEP DEFINITION but mark `@deprecated`; have it call into `runReviewRepairLoop` via a stub persistence + stub modelReviewer (or throw "model-reviewer required, use runReviewRepairLoop directly").

2. Create `packages/review/src/run-review-repair-loop.ts`. Implement per `<interfaces>` pseudocode. Use the `now ?? () => new Date()` pattern for testability — every event timestamp comes from `input.now()`.

3. Read `confirmedIntent.capabilityEnvelope.budget.maxRepairLoops` for the loop bound. If the envelope doesn't have it (e.g. parsing pre-Phase-5 artifact), throw a typed `MissingMaxRepairLoopsError` — do NOT silently default.

4. Wire computeRepairSubgraph: seed = `uniqueRepairTaskIds(mech.gate)` (existing helper); dependents = `computeRepairSubgraph({ plan, repairTaskIds: seed })`.

5. Wire synthesizeRepairPlan: pass `model` only if mechanical was 'pass' AND model was non-pass; otherwise pass `model: undefined`.

6. Build `RepairContext` per attempt for the next iteration's executor:
   ```typescript
   const repairContext: RepairContext = {
     previousAttempt: { planTaskId: <first repair task>, attempt: attempt },
     mechanicalCritiques: mech.gate.findings.filter(f => f.repairTaskId === ...),
     modelCritiques: model?.critiques
   };
   ```
   Pass via a side channel — the executor service interface receives `repairPlan` which carries the critiques per-task; `RepairContext` is built by the executor from the repairPlan when dispatching to the adapter (Plan 05-12 wiring detail).

7. Update `packages/review/src/index.ts` barrel: `export * from "./run-review-repair-loop.js";`. Mark `runMechanicalReviewExecutionLoop` with `@deprecated Use runReviewRepairLoop` JSDoc.

8. Tests: stub `mechanicalChecker`, `modelReviewer`, `executor`, `persistence` (in-memory record). Cover all 9 behaviors above.

**No fs writes in this file.** All durable I/O goes through `input.persistence` injected interface.
  </action>
  <verify>
    <automated>cd /Users/zakkeown/Code/protostar && grep -c 'export function runReviewRepairLoop\|export async function runReviewRepairLoop' packages/review/src/run-review-repair-loop.ts && grep -cE 'node:fs|node:net|fetch\(|spawn\(' packages/review/src/run-review-repair-loop.ts && grep -c '@deprecated' packages/review/src/index.ts && grep -c 'budget.maxRepairLoops\|maxRepairLoops' packages/review/src/run-review-repair-loop.ts && pnpm --filter @protostar/review test 2>&1 | tail -15</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c 'runReviewRepairLoop' packages/review/src/run-review-repair-loop.ts` ≥ 1
    - `grep -cE 'node:fs|node:net|spawn\\(|fetch\\(' packages/review/src/run-review-repair-loop.ts` == 0 (zero fs/network in review package)
    - `grep -c 'from "@protostar/planning"' packages/review/src/run-review-repair-loop.ts` ≥ 1 (ExecutionRunResult sourced from neutral leaf)
    - `grep -c 'ExecutionRunResult.*from "@protostar/execution"' packages/review/src/run-review-repair-loop.ts` == 0 (no execution import — would cycle, since review→execution would close after 05-06's exec→planning leaf already broke the original)
    - `pnpm -w exec tsc --build packages/planning packages/execution packages/review` exits 0 (3-package cycle-free build proof — same gate as 05-06 AC)
    - `grep -c '@deprecated' packages/review/src/index.ts` ≥ 1 (old loop marked deprecated)
    - `grep -c 'maxRepairLoops' packages/review/src/run-review-repair-loop.ts` ≥ 1
    - All 9 tests pass
  </acceptance_criteria>
  <done>Loop body lands; persistence is injected; brand minted on approved exit.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: ReviewPersistence concrete impl + Q-14/Q-15/Q-17 file shapes</name>
  <files>packages/review/src/persist-iteration.ts, packages/review/src/persist-iteration.test.ts</files>
  <read_first>
    - packages/repo/src/fs-adapter.ts (Phase 3 Plan 03-05 FsAdapter — review imports type-only; impl injected from factory-cli per AGENTS.md)
    - packages/review/src/lifecycle-events.ts (event union)
    - .planning/phases/05-review-repair-loop/05-CONTEXT.md §Q-14, §Q-15, §Q-17, §Q-18
    - .planning/phases/04-execution-engine/04-09-journal-snapshot-orphan-PLAN.md (tmp+rename + append+fsync pattern)
  </read_first>
  <behavior>
    - Test 1 (writeIterationDir creates 3 files when all present): with mechanical, model, repairPlan inputs → directory `iter-N/` contains 3 .json files; each is JSON-parsable.
    - Test 2 (writeIterationDir omits model file when undefined): with model=undefined → only mechanical-result.json + repair-plan.json present.
    - Test 3 (writeReviewDecision shape Q-15): output JSON has `schemaVersion: "1.0.0"`, `mechanical: "pass"`, `model: "pass"` (literally — never "skipped").
    - Test 4 (writeReviewBlock reason discriminator Q-14): supplied `reason: "budget-exhausted"` produces JSON with that literal; schema validates 4 reason values only.
    - Test 5 (appendLifecycleEvent JSONL append+fsync Q-18): two consecutive appends produce a file with exactly 2 lines, each a valid JSON-parsed event; mtime / fsync-via-flag set (or file is closed cleanly between calls).
    - Test 5b (Q-17/Q-18 wiring contract — explicit `appendFile` call assertion): with a stub `FsAdapter` that records all method calls, invoke `createReviewPersistence({ fs: stubFs, runsRoot: "/runs" }).appendLifecycleEvent({ runId: "r-1", event: {...} })`. Assert `stubFs.appendFile` was called EXACTLY once with `path === "/runs/r-1/review/review.jsonl"` and `content` ending in `"\\n"`. This pins the per-run path pattern for Q-17 and the append semantics for Q-18, preventing escape from Phase 5 unverified.
    - Test 5c (per-iteration directory pattern Q-17): `writeIterationDir({ runId: "r-1", attempt: 2, mechanical: {...}, model: {...}, repairPlan: {...} })` produces three `stubFs.writeFile` calls with paths matching `/runs/r-1/review/iter-2/{mechanical-result,model-result,repair-plan}.json` exactly.
    - Test 6 (atomic tmp+rename Q-17 footnote): mechanical-result.json never seen in partial state — concurrent reader either sees full file or nothing (test by writing a 1MB JSON and reading it back; assert no JSON parse errors).
  </behavior>
  <action>
1. Create `packages/review/src/persist-iteration.ts` implementing `ReviewPersistence` against an injected `FsAdapter` (Phase 3 Plan 03-05 contract):
   ```typescript
   import type { FsAdapter } from "@protostar/repo";
   import type { RepairPlan, ReviewLifecycleEvent } from "./index.js";

   export function createReviewPersistence(input: {
     readonly fs: FsAdapter;
     readonly runsRoot: string;     // e.g. ".protostar/runs"
   }): ReviewPersistence;
   ```
2. Each method tmp+renames per file (mechanical-result.json, model-result.json, repair-plan.json) — same pattern Phase 4 Plan 04-09 established.
3. `appendLifecycleEvent` uses append+fsync semantics (open with 'a', write line, fsync, close — or hold a file handle and fsync before each subsequent durable artifact write).
4. Schema versions:
   - review-decision.json: `schemaVersion: "1.0.0"`
   - review-block.json: `schemaVersion: "1.0.0"`
   - mechanical-result.json: inherits from MechanicalCheckResult (1.0.0)
   - repair-plan.json: `schemaVersion: "1.0.0"` (add to RepairPlan if not already present)
5. Tests use a real tmpdir (test fixture) via `node:fs` directly to set up + verify, but the IMPLEMENTATION goes through FsAdapter. NOTE: `node:fs` in TESTS is OK; in source-of-truth `persist-iteration.ts` must NOT import `node:fs` — it uses the injected `FsAdapter`.

**Authority caveat:** `@protostar/review` cannot import `node:fs` per AGENTS.md. The `createReviewPersistence` factory accepts an `FsAdapter` (Phase 3 contract) and uses ONLY adapter methods. The concrete `FsAdapter` is wired in `apps/factory-cli` (Plan 05-12). Re-confirm by reading Phase 3 Plan 03-05's FsAdapter shape — if it lacks an `appendFile` operation needed for JSONL, surface the gap. If `FsAdapter.appendFile` is absent, EXTEND the FsAdapter contract in this plan (cross-package edit) and document.
  </action>
  <verify>
    <automated>cd /Users/zakkeown/Code/protostar && grep -c 'export function createReviewPersistence' packages/review/src/persist-iteration.ts && grep -cE 'node:fs|node:net' packages/review/src/persist-iteration.ts && grep -c 'iter-' packages/review/src/persist-iteration.ts && grep -c 'review.jsonl\|review-decision.json\|review-block.json' packages/review/src/persist-iteration.ts | awk '$1 >= 3 {print "ok"}' | grep -q ok && pnpm --filter @protostar/review test 2>&1 | tail -10</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c 'export function createReviewPersistence' packages/review/src/persist-iteration.ts` == 1
    - `grep -cE 'node:fs|node:net' packages/review/src/persist-iteration.ts` == 0 (uses FsAdapter)
    - Test 5b explicitly asserts `appendFile` called with path `/runs/{runId}/review/review.jsonl` (Q-18 pinned in this plan, not deferred to 05-12)
    - Test 5c explicitly asserts `writeFile` called with `/runs/{runId}/review/iter-{N}/{mechanical-result|model-result|repair-plan}.json` (Q-17 per-iteration path pattern pinned)
    - All 8 tests pass (was 6; Q-17/Q-18 path-pattern tests added per checker warning #6)
  </acceptance_criteria>
  <done>Persistence layer ready; loop wires it via injection; durable artifacts conform to Q-14/Q-15/Q-17/Q-18.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: loadDeliveryAuthorization re-mint helper</name>
  <files>packages/review/src/load-delivery-authorization.ts, packages/review/src/load-delivery-authorization.test.ts</files>
  <read_first>
    - packages/review/src/delivery-authorization.ts (Plan 05-04 — mint, brand symbol)
    - .planning/phases/05-review-repair-loop/05-CONTEXT.md §Q-15 ("re-minted by `loadDeliveryAuthorization(decisionPath): DeliveryAuthorization | null` (validates file then brands)")
  </read_first>
  <behavior>
    - Test 1 (valid decision file): supply readJson stub returning Q-15 schema-conformant artifact → returns branded DeliveryAuthorization with runId + decisionPath populated.
    - Test 2 (model: "skipped"): readJson returns artifact with `model: "skipped"` → returns null (Q-15 strict pass/pass at brand mint).
    - Test 3 (mechanical not pass): readJson returns artifact with `mechanical: "block"` → returns null.
    - Test 4 (file not found): readJson throws ENOENT-like error → returns null.
    - Test 5 (malformed JSON): readJson returns non-conformant shape → returns null.
    - Test 6 (round-trip): mint → write → load → assert deep-equal runId + decisionPath; brand symbol present.
  </behavior>
  <action>
1. Create `packages/review/src/load-delivery-authorization.ts`:
   ```typescript
   import { mintDeliveryAuthorization } from "./delivery-authorization.js";
   import type { DeliveryAuthorization } from "./delivery-authorization.js";

   export interface LoadDeliveryAuthorizationInput {
     readonly decisionPath: string;
     readonly readJson: (path: string) => Promise<unknown>;
   }

   export async function loadDeliveryAuthorization(
     input: LoadDeliveryAuthorizationInput
   ): Promise<DeliveryAuthorization | null> {
     try {
       const raw = await input.readJson(input.decisionPath);
       if (!isApprovedReviewDecision(raw)) return null;
       return mintDeliveryAuthorization({
         runId: raw.runId,
         decisionPath: input.decisionPath
       });
     } catch {
       return null;
     }
   }

   function isApprovedReviewDecision(value: unknown): value is { schemaVersion: "1.0.0"; runId: string; planId: string; mechanical: "pass"; model: "pass"; ... } {
     // Strict shape check — model MUST be "pass" exactly (Q-15 lock).
   }
   ```
2. The shape check enforces Q-15 strict: `mechanical === "pass"` AND `model === "pass"`. Anything else → null.
3. Tests use stub `readJson` functions returning various shapes; cover all 6 behaviors.
4. NO fs imports — `readJson` is an injected function pointer.
  </action>
  <verify>
    <automated>cd /Users/zakkeown/Code/protostar && grep -c 'export async function loadDeliveryAuthorization' packages/review/src/load-delivery-authorization.ts && grep -cE 'node:fs|node:net' packages/review/src/load-delivery-authorization.ts && grep -c '"pass"' packages/review/src/load-delivery-authorization.ts && pnpm --filter @protostar/review test 2>&1 | tail -10</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c 'export async function loadDeliveryAuthorization' packages/review/src/load-delivery-authorization.ts` == 1
    - `grep -cE 'node:fs|node:net' packages/review/src/load-delivery-authorization.ts` == 0
    - `grep -c '"skipped"' packages/review/src/load-delivery-authorization.ts` == 0 (strict pass/pass)
    - All 6 tests pass
  </acceptance_criteria>
  <done>loadDeliveryAuthorization re-mints brand from durable artifact; Phase 7 + Phase 9 consume.</done>
</task>

</tasks>

<threat_model>
| Boundary | Description |
|----------|-------------|
| review package ↔ durable artifacts | brand mint must coincide with artifact write |
| review package ↔ filesystem | review MUST NOT import node:fs (AGENTS.md) |

| Threat ID | Category | Component | Disposition | Mitigation |
|-----------|----------|-----------|-------------|------------|
| T-05-21 | Tampering | brand minted without artifact write | mitigate | persistence.writeReviewDecision called BEFORE mintDeliveryAuthorization (assertion in Task 1 Test 2) |
| T-05-22 | Repudiation | review.jsonl misses an event after a crash | mitigate | append+fsync per Q-18; Phase 4 Plan 04-09 pattern reused |
| T-05-23 | Spoofing | DeliveryAuthorization re-minted from forged file | mitigate | loadDeliveryAuthorization performs shape check; signature field is reserved (Q-15) for Phase 9+ tamper detection |
| T-05-24 | Elevation of Privilege | review imports node:fs | mitigate | grep gate forbids; FsAdapter injected from factory-cli |
</threat_model>

<verification>
- `pnpm --filter @protostar/review test` green (all 21 tests across 3 tasks)
- No fs/network imports in any source file under packages/review/src/
- `runMechanicalReviewExecutionLoop` still callable but @deprecated
</verification>

<success_criteria>
- runReviewRepairLoop implements LOOP-01..LOOP-06 end-to-end
- Persistence layer durable per Q-14/Q-15/Q-17/Q-18
- DeliveryAuthorization minted only on pass/pass; loadable from durable artifact
- review package zero-fs preserved
</success_criteria>

<output>
Create `.planning/phases/05-review-repair-loop/05-10-SUMMARY.md`: documents the loop's strict ordering, the persistence injection pattern, the brand-mint timing relative to artifact write, and notes that Plan 05-12 wires concrete persistence + executor service.
</output>
</content>
</invoke>