---
phase: 06-live-dogpile-piles
plan: 10
type: execute
wave: 6
depends_on: [06, 07, 08, 09]
gap_closure: true
files_modified:
  - packages/review/src/run-review-repair-loop.ts
  - packages/review/src/run-review-repair-loop.test.ts
  - packages/review/src/index.ts
  - apps/factory-cli/src/main.ts
  - apps/factory-cli/src/main.test.ts
  - apps/factory-cli/src/exec-coord-trigger.ts
  - apps/factory-cli/src/exec-coord-trigger.test.ts
  - packages/admission-e2e/src/pile-integration-smoke.contract.test.ts
autonomous: true
requirements: [PILE-03]
tags: [factory-cli, review-loop, pile-execution-coordination, work-slicing, repair-plan, q-15, gap-closure]
must_haves:
  truths:
    - "PILE-03 runtime invocation wired: when `pileModes.executionCoordination === 'live'` AND the work-slicing heuristic trips on the admitted plan, factory-cli invokes `runFactoryPile(buildExecutionCoordinationMission(intent, 'work-slicing', input), ctx)` and routes the parsed output through `admitWorkSlicing`"
    - "PILE-03 runtime invocation wired: when `pileModes.executionCoordination === 'live'` AND `runReviewRepairLoop` synthesizes a repair plan, the optional `repairPlanRefiner` hook (threaded from factory-cli) invokes `runFactoryPile(buildExecutionCoordinationMission(intent, 'repair-plan-generation', repairPlan), ctx)` and admits the refined plan via `admitRepairPlanProposal`; admission rejection leaves the deterministic `synthesizeRepairPlan` output standing (no silent substitution)"
    - "`runReviewRepairLoop` accepts an optional `repairPlanRefiner?: (repairPlan: RepairPlan, ctx: { runId, attempt, admittedPlan, intent }) => Promise<RepairPlan>` parameter; when absent, behavior is byte-identical to today (deterministic synthesis only)"
    - "The negative-grep deferral pins in `pile-integration-smoke.contract.test.ts:99-129` (`work-slicing-trigger` and `repair-plan-trigger` blocks) are flipped to positive wiring assertions matching the planning-pile-live block style"
    - "Q-06 no-auto-fallback honored at both new seams: pile failures (ok=false OR parse error OR admission rejection on a refined-plan proposal that EXPANDS authority) write `pile-execution-coordination` refusals; pure refinement-rejection (proposal is no-op or rejected as redundant) falls back to the deterministic plan with a non-fatal lifecycle event"
    - "Work-slicing heuristic configurable via `factory-config.json: piles.executionCoordination.workSlicing.{maxTargetFiles,maxEstimatedTurns}` with defaults `maxTargetFiles=3`, `maxEstimatedTurns=5` per RESEARCH.md and Q-15"
    - "End-to-end integration test exercises both triggers via DI-stubbed `runFactoryPile` and asserts: (a) work-slicing pile invoked, output admitted, sliced plan replaces original; (b) repair-plan pile invoked from inside the review-repair loop, refined plan admitted, executor receives the refined plan; (c) both triggers persist artifacts at `runs/{id}/piles/execution-coordination/iter-{N}/`"
  artifacts:
    - path: "packages/review/src/run-review-repair-loop.ts"
      provides: "Optional repairPlanRefiner hook in ReviewRepairLoopInput; called after synthesizeRepairPlan and before persistence/executor invocation"
      contains: "repairPlanRefiner"
    - path: "apps/factory-cli/src/exec-coord-trigger.ts"
      provides: "shouldInvokeWorkSlicing(admittedPlan, config) heuristic + invokeWorkSlicingPile(...) + invokeRepairPlanRefinementPile(...) wrappers around runFactoryPile + admit*"
      contains: "shouldInvokeWorkSlicing"
    - path: "apps/factory-cli/src/main.ts"
      provides: "Work-slicing trigger invocation after planning admission; repairPlanRefiner construction passed to runReviewRepairLoop"
      contains: "admitWorkSlicing"
    - path: "packages/admission-e2e/src/pile-integration-smoke.contract.test.ts"
      provides: "Positive wiring assertions for work-slicing-trigger and repair-plan-trigger (replaces negative-grep deferral pins)"
      contains: "admitWorkSlicing"
  key_links:
    - from: "apps/factory-cli/src/main.ts"
      to: "@protostar/planning admitWorkSlicing"
      via: "import + post-admission invocation gated on shouldInvokeWorkSlicing(admittedPlan, config)"
      pattern: "admitWorkSlicing"
    - from: "apps/factory-cli/src/main.ts"
      to: "@protostar/repair admitRepairPlanProposal"
      via: "imported into a repairPlanRefiner closure passed to runReviewRepairLoop"
      pattern: "admitRepairPlanProposal"
    - from: "apps/factory-cli/src/main.ts"
      to: "@protostar/dogpile-adapter buildExecutionCoordinationMission, executionCoordinationPilePreset"
      via: "import + invocation at both work-slicing and repair-plan triggers"
      pattern: "buildExecutionCoordinationMission|executionCoordinationPilePreset"
    - from: "packages/review/src/run-review-repair-loop.ts"
      to: "ReviewRepairLoopInput.repairPlanRefiner"
      via: "called after synthesizeRepairPlan (run-review-repair-loop.ts:287) and before iteration persistence (:312)"
      pattern: "repairPlanRefiner"
    - from: "apps/factory-cli/src/exec-coord-trigger.ts"
      to: "@protostar/repair parseExecutionCoordinationPileResult"
      via: "import + parse outcome.result.output before admission"
      pattern: "parseExecutionCoordinationPileResult"
---

<objective>
Close Gap 1 from `06-VERIFICATION.md`: PILE-03 runtime invocation. The exec-coord admission seams (`admitWorkSlicing`, `admitRepairPlanProposal`, `parseExecutionCoordinationPileResult`, `buildExecutionCoordinationMission`) exist as exported, unit-tested functions but `apps/factory-cli/src/main.ts` never invokes them. Plan 06-07 deliberately deferred the runtime wiring; Plan 06-08 codified the deferral as negative-grep pins in `pile-integration-smoke.contract.test.ts:99-129`. PILE-03's REQUIREMENTS.md wording is "is invoked" (runtime), not unit-existence — the requirement is not yet met.

Purpose: PILE-03 (executionCoordinationPilePreset is invoked when execution proposes work-slicing or repair-plan generation). Q-15 locked BOTH triggers; this plan ships both.

Output:
1. `runReviewRepairLoop` gains an optional `repairPlanRefiner` hook (interface change is additive — absent = today's behavior).
2. `apps/factory-cli/src/exec-coord-trigger.ts` (new) — pure heuristic + invocation helpers around `runFactoryPile` + admission seams.
3. `apps/factory-cli/src/main.ts` — work-slicing trigger after planning admission; repair-plan refiner construction passed to `runReviewRepairLoop`.
4. Negative-grep deferral pins in `pile-integration-smoke.contract.test.ts` flipped to positive wiring assertions.
5. End-to-end integration test exercising both triggers.

Depends on Plan 06-09 having shipped — this plan extends `main.test.ts` (and possibly `run-real-execution.test.ts`) with new tests; those tests must inherit Plan 06-09's deterministic harness.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/06-live-dogpile-piles/06-CONTEXT.md
@.planning/phases/06-live-dogpile-piles/06-RESEARCH.md
@.planning/phases/06-live-dogpile-piles/06-VERIFICATION.md
@.planning/phases/06-live-dogpile-piles/06-07-factory-cli-pile-wiring-SUMMARY.md
@.planning/phases/06-live-dogpile-piles/06-08-SUMMARY.md
@apps/factory-cli/src/main.ts
@packages/review/src/run-review-repair-loop.ts
@packages/admission-e2e/src/pile-integration-smoke.contract.test.ts
@packages/repair/src/admit-repair-plan-proposal.ts
@packages/planning/src/admit-work-slicing.ts
@packages/dogpile-adapter/src/run-factory-pile.ts

<interfaces>
Existing exports verified at planning time:
- `@protostar/planning` exports `admitWorkSlicing` (planning/src/index.ts:5696).
- `@protostar/repair` exports `admitRepairPlanProposal` (admit-repair-plan-proposal.ts:49) and `parseExecutionCoordinationPileResult` (execution-coordination-pile-result.ts).
- `@protostar/dogpile-adapter` exports `buildExecutionCoordinationMission` (index.ts:53) and `executionCoordinationPilePreset` (index.ts:114).
- `runFactoryPile`, `resolvePileBudget`, `PileRunOutcome`, `PileFailure` already imported into `apps/factory-cli/src/main.ts:14-18`.

NEW interface (additive — does not change existing callers):
```ts
// packages/review/src/run-review-repair-loop.ts
export interface ReviewRepairLoopInput {
  // ...existing fields unchanged...
  readonly repairPlanRefiner?: (
    repairPlan: RepairPlan,
    ctx: {
      readonly runId: string;
      readonly attempt: number;
      readonly admittedPlan: AdmittedPlanExecutionArtifact;
      readonly confirmedIntent: ConfirmedIntent;
    }
  ) => Promise<RepairPlan>;
}
```
Call site: between `synthesizeRepairPlan(...)` (run-review-repair-loop.ts:287) and `recordIteration(...)` (:304). Refiner returns the plan to use; on throw, the caller (factory-cli) is responsible for catching and deciding whether to fall back to the deterministic plan or surface as block. The refiner contract: do not throw — return either the refined plan or the original.

NEW invocation helpers (factory-cli):
```ts
// apps/factory-cli/src/exec-coord-trigger.ts
export interface WorkSlicingHeuristicConfig {
  readonly maxTargetFiles: number;       // default 3 (RESEARCH §59, Q-15)
  readonly maxEstimatedTurns: number;    // default 5
}
export function shouldInvokeWorkSlicing(
  admittedPlan: AdmittedPlanExecutionArtifact,
  config: WorkSlicingHeuristicConfig
): boolean;

export interface InvokeExecCoordPileDeps {
  readonly runFactoryPile: typeof defaultRunFactoryPile;
  readonly buildContext: () => PileRunContext;  // shares runAbortController, provider, budget with planning/review seams
  readonly persist: (outcome: PileRunOutcome, iteration: number, refusal?: { reason: string }) => Promise<void>;
}

export async function invokeWorkSlicingPile(
  intent: ConfirmedIntent,
  admittedPlan: AdmittedPlanExecutionArtifact,
  iteration: number,
  deps: InvokeExecCoordPileDeps
): Promise<{ ok: true; admittedPlan: AdmittedPlanExecutionArtifact } | { ok: false; reason: string }>;

export async function invokeRepairPlanRefinementPile(
  intent: ConfirmedIntent,
  admittedPlan: AdmittedPlanExecutionArtifact,
  deterministicRepairPlan: RepairPlan,
  attempt: number,
  deps: InvokeExecCoordPileDeps
): Promise<RepairPlan>;  // returns refined plan on admission success; deterministic plan on rejection or pile failure (with non-fatal lifecycle log)
```

The exec-coord pile shares `runAbortController` and `buildPileProvider("execution-coordination", ...)` with the existing planning/review seams (Plan 06-07 Task 3a established the parent controller; this plan reuses it).
</interfaces>

<source_anchor_run_review_repair_loop>
The refiner hook lands at `packages/review/src/run-review-repair-loop.ts` between line 287 (`const repairPlan = synthesizeRepairPlan({...})`) and line 304 (`const iteration = recordIteration({...})`):

```ts
const deterministicRepairPlan = synthesizeRepairPlan({...});
const repairPlan = input.repairPlanRefiner
  ? await input.repairPlanRefiner(deterministicRepairPlan, {
      runId: input.runId,
      attempt,
      admittedPlan: input.admittedPlan,
      confirmedIntent: input.confirmedIntent
    })
  : deterministicRepairPlan;

await append(input, {
  kind: "repair-plan-emitted",
  // ...
});

const iteration = recordIteration({...});
```

The refiner contract is "do not throw — return either the refined plan or the original." Factory-cli's `invokeRepairPlanRefinementPile` honors that contract.
</source_anchor_run_review_repair_loop>

<scope_clarifications>
- This plan delivers the exec-coord pile RUNTIME WIRING. It does NOT add new admission unit tests for `admitWorkSlicing`/`admitRepairPlanProposal` — those exist (Plan 06-06).
- It does NOT introduce a separate budget for the exec-coord pile beyond what `executionCoordinationPilePreset.budget` + `intent.capabilityEnvelope.budget` produce via `resolvePileBudget`. Q-15 CONCERNS notes both triggers share one preset budget.
- Q-06 (no auto-fallback) applies WITH NUANCE at the repair-plan-refinement seam: a pile FAILURE (timeout/network/parse) emits a `pile-execution-coordination` refusal AND falls back to the deterministic plan, per Q-15 ("If admission rejects, the deterministic RepairPlan stands"). This is NOT a Q-06 violation — Q-06 forbids silently substituting a fixture for a live pile output; here we substitute the deterministic in-process result, which is a different code path the operator already opted into. The lifecycle event makes the substitution observable. **Document this nuance in the SUMMARY.**
- An admission rejection of a refined plan that ATTEMPTS TO EXPAND AUTHORITY (e.g. adds files outside the original plan's targetFiles, or escalates capabilities) is a HARD failure at the seam — write the refusal and DO NOT fall back. `admitRepairPlanProposal` already enforces this (06-06 SUMMARY). Surface as block.
</scope_clarifications>

<context_budget_check>
This plan touches 8 files across 3 packages with 4 tasks. Estimated context cost per task: 20-30%; total budget ~50%, at the upper bound of single-plan target. Splitting candidates considered:
- Splitting refiner-hook (Task 1) from factory-cli wiring (Tasks 2-3) was considered but rejected: the hook has no consumer without factory-cli, and shipping it alone produces a no-op plan. Tasks share the same context (refiner contract).
- Splitting work-slicing trigger from repair-plan trigger was considered but rejected: Q-15 locked BOTH triggers; the contract test must flip BOTH deferral pins together; main.ts changes are tightly coupled.

Acceptable as a single plan; budget is monitored at task boundaries.
</context_budget_check>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add repairPlanRefiner hook to runReviewRepairLoop</name>
  <files>packages/review/src/run-review-repair-loop.ts, packages/review/src/run-review-repair-loop.test.ts, packages/review/src/index.ts</files>
  <read_first>
    - packages/review/src/run-review-repair-loop.ts (lines 19-29 — ReviewRepairLoopInput shape; lines 280-325 — repair branch where refiner inserts)
    - packages/review/src/run-review-repair-loop.test.ts (existing patterns for repair-branch tests)
    - packages/review/src/index.ts (re-export surface)
  </read_first>
  <behavior>
    1. Extend `ReviewRepairLoopInput` with `readonly repairPlanRefiner?: (repairPlan, ctx) => Promise<RepairPlan>` (signature in `<interfaces>` block above).
    2. In the repair branch, between `synthesizeRepairPlan(...)` (:287) and `recordIteration(...)` (:304), if `input.repairPlanRefiner` is defined, replace the local `repairPlan` const with the awaited refiner output. The refiner is called with `(deterministicPlan, { runId, attempt, admittedPlan, confirmedIntent })`.
    3. The refiner contract is "do not throw — return either the refined plan or the original." If the refiner throws, propagate (this is a programmer error, not a runtime fallback path).
    4. Lifecycle events: emit `repair-plan-refined` lifecycle event (NEW lifecycle event kind) when the refiner returns a plan that is NOT `===` the deterministic input — payload includes `runId`, `attempt`, `at`. When refiner is absent OR returns the same reference, no event is emitted (zero-overhead default path).
    5. Re-export the new lifecycle event kind from `packages/review/src/index.ts` if `ReviewLifecycleEvent` is union-typed there.
  </behavior>
  <action>
    TDD ordering:

    **RED** — Add 4 test cases to `run-review-repair-loop.test.ts`:
    1. `repairPlanRefiner` absent → behavior is byte-identical to today (existing repair-branch test count unchanged on full rerun).
    2. `repairPlanRefiner` returns the deterministic plan unchanged → no `repair-plan-refined` lifecycle event emitted; iteration record uses the deterministic plan.
    3. `repairPlanRefiner` returns a different plan (different `repairs` array reference) → `repair-plan-refined` lifecycle event emitted; iteration record uses the refined plan; `executor.executeRepairTasks({ repairPlan, ... })` receives the refined plan.
    4. `repairPlanRefiner` throws → error propagates; loop does not silently swallow.

    Run RED, confirm failures.

    **GREEN** — Implement minimal change at run-review-repair-loop.ts:287-304 per `<source_anchor_run_review_repair_loop>` block. Add the lifecycle event union variant if needed.

    **REFACTOR** — Extract refiner-call wrapper if the inline form bloats the loop body.

    Per Q-15: this is the seam-only change inside the review package; factory-cli wiring is Task 3.
  </action>
  <verify>
    <automated>cd /Users/zakkeown/Code/protostar &amp;&amp; pnpm --filter @protostar/review test &amp;&amp; pnpm --filter @protostar/review build &amp;&amp; grep -q "repairPlanRefiner" packages/review/src/run-review-repair-loop.ts &amp;&amp; grep -q "repairPlanRefiner" packages/review/src/run-review-repair-loop.test.ts</automated>
  </verify>
  <done>
    All 4 new test cases pass; existing review tests remain passing; build green; refiner hook is exported via the input type. No factory-cli changes yet.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: exec-coord-trigger module — heuristic + invocation wrappers</name>
  <files>apps/factory-cli/src/exec-coord-trigger.ts, apps/factory-cli/src/exec-coord-trigger.test.ts</files>
  <read_first>
    - apps/factory-cli/src/pile-mode-resolver.ts (precedence pattern to mirror)
    - apps/factory-cli/src/pile-persistence.ts (writePileArtifacts signature for the persist dep)
    - packages/repair/src/admit-repair-plan-proposal.ts (admission shape — what counts as "rejected" vs "accepted")
    - packages/planning/src/admit-work-slicing.ts (admission shape; how it folds back to AdmittedPlan)
    - packages/repair/src/execution-coordination-pile-result.ts (parseExecutionCoordinationPileResult shape)
    - packages/dogpile-adapter/src/execution-coordination-mission.ts (buildExecutionCoordinationMission)
  </read_first>
  <behavior>
    Pure module exporting:

    1. `WorkSlicingHeuristicConfig` type + `DEFAULT_WORK_SLICING_HEURISTIC` const = `{ maxTargetFiles: 3, maxEstimatedTurns: 5 }` (Q-15 / RESEARCH §59).
    2. `shouldInvokeWorkSlicing(admittedPlan, config): boolean` — returns true if any task has `targetFiles.length > config.maxTargetFiles` OR `estimatedTurns > config.maxEstimatedTurns`. (If `estimatedTurns` is not present on AdmittedPlan task shape, gate on `targetFiles` only and document that `maxEstimatedTurns` is reserved for Phase 8.)
    3. `invokeWorkSlicingPile(intent, admittedPlan, iteration, deps)` — builds mission via `buildExecutionCoordinationMission(intent, "work-slicing", { admittedPlan })`, calls `deps.runFactoryPile(mission, deps.buildContext())`, parses outcome via `parseExecutionCoordinationPileResult`, routes through `admitWorkSlicing`. Returns `{ ok: true, admittedPlan: refinedPlan }` on accepted slicing; `{ ok: false, reason }` otherwise. Persists artifacts via `deps.persist(outcome, iteration)`. On pile failure (`outcome.ok === false`) returns `{ ok: false, reason: failure.kind }` and persists refusal envelope.
    4. `invokeRepairPlanRefinementPile(intent, admittedPlan, deterministicRepairPlan, attempt, deps)` — symmetric: builds `buildExecutionCoordinationMission(intent, "repair-plan-generation", { admittedPlan, deterministicRepairPlan })`, parses, routes through `admitRepairPlanProposal`. **Returns the refined plan on admission success; returns the deterministic plan on admission rejection (no-op refinement) OR pile failure (with refusal artifact persisted).** Authority-expansion rejection (where the proposal tries to expand capabilities/files outside the original plan) is surfaced via the returned `RepairPlan` being unchanged AND a `pile-execution-coordination` refusal artifact AND a `RefiningRefusedAuthorityExpansion` thrown error (caller surfaces as block — this is the hard-failure path documented in `<scope_clarifications>`).

    Module is pure (no fs); all I/O comes through `deps` parameter.
  </behavior>
  <action>
    TDD ordering:

    **RED** — Write `exec-coord-trigger.test.ts` with these cases (DI-stubbed `runFactoryPile`):

    `shouldInvokeWorkSlicing` (5 cases):
    1. Plan with 1 task, 1 targetFile → false.
    2. Plan with 1 task, 4 targetFiles → true (above default `maxTargetFiles=3`).
    3. Plan with 5 tasks, each 1 targetFile → false (heuristic is per-task, not aggregate).
    4. Custom config `maxTargetFiles=10` raises threshold → false for 4-targetFile plan.
    5. Empty plan → false.

    `invokeWorkSlicingPile` (3 cases):
    1. Pile returns ok=true with valid work-slicing proposal → `admitWorkSlicing` accepts → result `{ ok: true, admittedPlan: refined }`. Artifacts persisted.
    2. Pile returns ok=false (pile-timeout) → `{ ok: false, reason: "pile-timeout" }`; refusal artifact persisted; `admitWorkSlicing` NOT called.
    3. Pile returns ok=true but parse fails → `{ ok: false, reason: "parse-error" }`; refusal artifact persisted.

    `invokeRepairPlanRefinementPile` (4 cases):
    1. Pile returns ok=true with refinement proposal → `admitRepairPlanProposal` accepts → returns refined plan.
    2. Pile returns ok=false (pile-network) → returns DETERMINISTIC plan (Q-15 fallback) + refusal artifact persisted + lifecycle log.
    3. Pile returns ok=true but admission rejects as no-op → returns DETERMINISTIC plan + lifecycle log; NO refusal artifact (admission rejection is not a pile failure).
    4. Pile returns ok=true with authority-expansion proposal → `admitRepairPlanProposal` rejects with authority-expansion error → throws `RefiningRefusedAuthorityExpansion` + refusal artifact persisted.

    Run RED, confirm failures.

    **GREEN** — Implement `exec-coord-trigger.ts` per `<interfaces>` block.

    **REFACTOR** — Extract a `parseAndAdmit` helper if the work-slicing and repair-plan paths share parsing structure beyond the discriminator.

    Per D-15 (Q-15): both triggers share one preset and one budget; mission discriminator differentiates the mode.
  </action>
  <verify>
    <automated>cd /Users/zakkeown/Code/protostar &amp;&amp; pnpm --filter @protostar/factory-cli test --grep "exec-coord-trigger|shouldInvokeWorkSlicing|invokeWorkSlicingPile|invokeRepairPlanRefinementPile" &amp;&amp; pnpm --filter @protostar/factory-cli build</automated>
  </verify>
  <done>
    All 12 test cases pass; module exports the documented surface; build green; no node:fs imports in exec-coord-trigger.ts (purity check).
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Wire both triggers in main.ts (work-slicing post-admission + repairPlanRefiner)</name>
  <files>apps/factory-cli/src/main.ts, apps/factory-cli/src/main.test.ts</files>
  <read_first>
    - apps/factory-cli/src/main.ts:595-650 (planning admission seam where work-slicing trigger inserts)
    - apps/factory-cli/src/main.ts:820-880 (review-repair loop construction where repairPlanRefiner inserts)
    - apps/factory-cli/src/exec-coord-trigger.ts (Task 2 output)
    - packages/review/src/run-review-repair-loop.ts (Task 1 output — refiner hook landed)
    - .planning/phases/06-live-dogpile-piles/06-RESEARCH.md §59 (heuristic defaults)
  </read_first>
  <behavior>
    main.ts modifications:

    1. **After planning admission (around main.ts:625-636), before `admittedPlanHandoff` is computed:**
        ```ts
        let workingAdmittedPlan = candidateAdmission.admittedPlan;
        if (pileModes.executionCoordination === "live"
            && shouldInvokeWorkSlicing(workingAdmittedPlan, factoryConfig.config.piles?.executionCoordination?.workSlicing ?? DEFAULT_WORK_SLICING_HEURISTIC)) {
          const result = await invokeWorkSlicingPile(intent, workingAdmittedPlan, 0, {
            runFactoryPile: dependencies.runFactoryPile,
            buildContext: () => buildExecCoordPileContext(0),
            persist: (outcome, iteration, refusal) => writePileArtifacts({
              runDir, runId, kind: "execution-coordination", iteration, outcome,
              ...(refusal ? { refusal: { ...refusal, stage: "pile-execution-coordination", sourceOfTruth: "ExecutionCoordinationPileResult" } } : {})
            })
          });
          if (result.ok) {
            workingAdmittedPlan = result.admittedPlan;
            // emit lifecycle event "work-slicing-applied"
          } else {
            await appendRefusalIndexEntry(...);
            throw new CliExitError(`Work-slicing pile failure: ${result.reason}`, 1);
          }
        }
        // continue with workingAdmittedPlan instead of candidateAdmission.admittedPlan
        ```
    2. **At the runReviewRepairLoop call site (around main.ts:862):** construct the `repairPlanRefiner` closure when `pileModes.executionCoordination === "live"`:
        ```ts
        const repairPlanRefiner = pileModes.executionCoordination === "live"
          ? async (repairPlan: RepairPlan, ctx) => {
              const iteration = ctx.attempt;  // shared iteration counter with review pile
              return invokeRepairPlanRefinementPile(intent, ctx.admittedPlan, repairPlan, ctx.attempt, {
                runFactoryPile: dependencies.runFactoryPile,
                buildContext: () => buildExecCoordPileContext(iteration),
                persist: (outcome, _it, refusal) => writePileArtifacts({
                  runDir, runId, kind: "execution-coordination", iteration, outcome,
                  ...(refusal ? { refusal: { ...refusal, stage: "pile-execution-coordination", sourceOfTruth: "ExecutionCoordinationPileResult" } } : {})
                })
              });
            }
          : undefined;
        // pass into runReviewRepairLoop input
        ```
    3. **`buildExecCoordPileContext(iteration)`** is a small helper that mirrors the existing planning/review context construction (provider via `buildPileProvider("execution-coordination", ...)`, signal=`runAbortController.signal`, budget=`resolvePileBudget(executionCoordinationPilePreset.budget, intent.capabilityEnvelope.budget)`, now=`Date.now`).
    4. Q-06 nuance: the work-slicing seam HARD-fails on pile failure (no fallback — there is no deterministic alternative). The repair-plan-refinement seam SOFT-falls-back on pile failure (deterministic plan stands) but HARD-fails on `RefiningRefusedAuthorityExpansion` (authority breach is not a fallback path). Both write `pile-execution-coordination` refusal artifacts.
    5. Authority-expansion catch at the refiner: when `invokeRepairPlanRefinementPile` throws `RefiningRefusedAuthorityExpansion`, the refiner closure surfaces this as a thrown error to `runReviewRepairLoop`, which propagates to factory-cli; factory-cli writes the refusal index entry and exits non-zero.
  </behavior>
  <action>
    Tests (4 cases) extending `main.test.ts` — DI-stub the `runFactoryPile` injection:

    1. **work-slicing trigger fires** — `--exec-coord-mode live`; admittedPlan has a task with 4 targetFiles; stub runFactoryPile returns ok=true with a valid work-slicing proposal; assert (a) runFactoryPile invoked exactly once with mission containing `"work-slicing"`, (b) admitWorkSlicing accepted the proposal, (c) the executor receives the SLICED plan (not the original), (d) artifacts at `runs/{id}/piles/execution-coordination/iter-0/{result.json,trace.json}`.

    2. **work-slicing trigger does not fire** — `--exec-coord-mode live`; admittedPlan has 1 task with 1 targetFile; assert runFactoryPile NOT invoked for execution-coordination kind; original plan flows through unchanged.

    3. **repair-plan refinement applies** — `--exec-coord-mode live`; review-repair loop synthesizes a repair plan; stub runFactoryPile returns ok=true with a refinement proposal; assert (a) runFactoryPile invoked with mission containing `"repair-plan-generation"`, (b) executor.executeRepairTasks receives the REFINED plan, (c) `repair-plan-refined` lifecycle event emitted, (d) artifacts at `runs/{id}/piles/execution-coordination/iter-{attempt}/`.

    4. **repair-plan refinement: pile failure → deterministic fallback** — `--exec-coord-mode live`; stub runFactoryPile returns ok=false (pile-timeout); assert (a) deterministic repair plan flows through to executor, (b) `pile-execution-coordination` refusal artifact AND refusals.jsonl entry written, (c) loop continues (does NOT throw — soft fallback per Q-15), (d) lifecycle log indicates fallback.

    5. **repair-plan refinement: authority-expansion → block** — `--exec-coord-mode live`; stub runFactoryPile returns ok=true but with a proposal that expands targetFiles beyond the admitted plan; admitRepairPlanProposal rejects with authority-expansion; assert factory-cli surfaces this as block (refusal artifact + non-zero exit).

    Run RED. Implement minimal main.ts diff. GREEN.

    Per D-06 (Q-06): no auto-fallback at the work-slicing seam (no deterministic alternative). Per D-15 (Q-15): soft fallback at the repair-plan-refinement seam IS the locked behavior (deterministic plan stands on pile failure or no-op refinement); authority-expansion is the only hard-block case.
  </action>
  <verify>
    <automated>cd /Users/zakkeown/Code/protostar &amp;&amp; pnpm --filter @protostar/factory-cli test --grep "work-slicing|repair-plan refinement|exec-coord" &amp;&amp; pnpm --filter @protostar/factory-cli build</automated>
  </verify>
  <done>
    All 5 main.test extensions pass; existing factory-cli tests remain passing (146+); build green; both triggers wired in main.ts; refusal index extended with two new sourceOfTruth-stamped entries.
  </done>
</task>

<task type="auto">
  <name>Task 4: Flip negative-grep deferral pins + run full verify</name>
  <files>packages/admission-e2e/src/pile-integration-smoke.contract.test.ts</files>
  <read_first>
    - packages/admission-e2e/src/pile-integration-smoke.contract.test.ts:99-129 (the deferral pins to flip)
    - packages/admission-e2e/src/pile-integration-smoke.contract.test.ts:46-77 (planning-pile-live block — the style template for positive wiring assertions)
  </read_first>
  <behavior>
    The current `work-slicing-trigger` (lines 99-113) and `repair-plan-trigger` (lines 117-129) blocks ASSERT NEGATIVE — that the seams are NOT in main.ts. With Plan 06-10 Tasks 1-3 landed, those seams ARE in main.ts; the negative-grep test now FAILS, and per the in-line comment at lines 110-111 / 126-127 the test author signaled "when admitWorkSlicing or shouldInvokeWorkSlicing appears in main.ts, replace this deferral pin with positive wiring assertions."

    Replace BOTH blocks with positive wiring assertions in the same style as `planning-pile-live` (lines 46-77).
  </behavior>
  <action>
    Edit `pile-integration-smoke.contract.test.ts`:

    For `work-slicing-trigger`:
    ```ts
    it("work-slicing-trigger: factory-cli main.ts wires admitted-plan work-slicing through admitWorkSlicing", async () => {
      const source = await loadFactorySource();
      assert.match(source, /shouldInvokeWorkSlicing\(/, "work-slicing-trigger: heuristic gate must be invoked in main.ts");
      assert.match(source, /invokeWorkSlicingPile\(/, "work-slicing-trigger: pile invocation wrapper must be called in main.ts");
      assert.match(source, /admitWorkSlicing\b/, "work-slicing-trigger: admission helper must be referenced (via the trigger module) — at minimum the import or call site");
      assert.match(source, /kind:\s*"execution-coordination"/, "work-slicing-trigger: writePileArtifacts must be invoked with kind: \"execution-coordination\"");
      assert.match(source, /stage:\s*"pile-execution-coordination"/, "work-slicing-trigger: refusal stage must be pile-execution-coordination");
    });
    ```

    For `repair-plan-trigger`:
    ```ts
    it("repair-plan-trigger: factory-cli main.ts threads repairPlanRefiner into runReviewRepairLoop calling executionCoordinationPilePreset", async () => {
      const source = await loadFactorySource();
      assert.match(source, /repairPlanRefiner/, "repair-plan-trigger: refiner closure must be constructed in main.ts");
      assert.match(source, /invokeRepairPlanRefinementPile\(/, "repair-plan-trigger: refinement-pile wrapper must be called");
      assert.match(source, /executionCoordinationPilePreset|buildExecutionCoordinationMission/, "repair-plan-trigger: exec-coord preset or mission builder must be imported");
      assert.match(source, /admitRepairPlanProposal/, "repair-plan-trigger: admission helper must be referenced (transitively via the trigger module)");
    });
    ```

    Note: for symbols that flow through the new `exec-coord-trigger.ts` module (e.g. `admitWorkSlicing` may not appear directly in main.ts since the trigger module wraps it), add a secondary check that scans `apps/factory-cli/src/exec-coord-trigger.ts` for those symbols. Pin both layers.

    Add a new aggregate assertion: refusal-stages enumerate all three pile kinds via positive wiring (already covered by the existing `pile-integration-smoke: refusal stages enumerate all three pile kinds in refusals-index` test — verify it still passes).

    Run the full verify gate to confirm Plan 06-09's flake fix still holds with the new code paths.
  </action>
  <verify>
    <automated>cd /Users/zakkeown/Code/protostar &amp;&amp; pnpm --filter @protostar/admission-e2e test --grep "pile-integration-smoke" &amp;&amp; (for i in 1 2 3 4 5; do echo "=== verify run $i ==="; pnpm run verify 2>&amp;1 | tail -5 || exit 1; done) &amp;&amp; echo "ALL 5 VERIFY RUNS GREEN WITH EXEC-COORD WIRED"</automated>
  </verify>
  <done>
    Both deferral pins flipped to positive wiring assertions; admission-e2e contract suite passes; `pnpm run verify` green across 5 consecutive runs with the new exec-coord wiring active. Commit shape: `feat(06-10): wire executionCoordinationPilePreset to work-slicing and repair-plan triggers (PILE-03)`.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Exec-coord pile output → admitWorkSlicing | Network-derived task partition crosses admission; must not expand authority |
| Exec-coord pile output → admitRepairPlanProposal | Network-derived repair plan crosses admission; must not expand authority OR re-introduce closed findings |
| repairPlanRefiner hook → runReviewRepairLoop | Loop-internal contract: refiner must not throw; must return a RepairPlan |
| Soft-fallback path (pile failure → deterministic plan) | Operator must observe the substitution via lifecycle event; not silent |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-6-30 | Tampering | Refined repair plan expands authority (adds files outside original plan, escalates capabilities) | mitigate | `admitRepairPlanProposal` rejects authority-expansion (Plan 06-06); Task 3 surfaces this as block + `pile-execution-coordination` refusal; Task 2 Test 4 enforces |
| T-6-31 | Repudiation | Pile failure at the repair-plan seam silently substitutes the deterministic plan with no operator-visible record | mitigate | Task 2 / Task 3 emit `repair-plan-refined-fallback` lifecycle event AND persist `pile-execution-coordination` refusal artifact on every soft-fallback; SUMMARY documents the Q-06 nuance |
| T-6-32 | Tampering | Work-slicing proposal partitions tasks in a way that hides a failure (e.g. drops a critical task) | mitigate | `admitWorkSlicing` validates that the union of sliced tasks covers the original task set with no drops; admission rejection is a hard-block at the work-slicing seam (no fallback) |
| T-6-33 | DoS | Exec-coord pile budget exhaustion cascades into review-loop budget breach | mitigate | Both triggers share `executionCoordinationPilePreset.budget` clamped via `resolvePileBudget` against envelope; `AbortSignal.any` from Plan 06-04 ensures pile-level timeout aborts only the pile; loop budget (Phase 5 Q-12 maxRepairLoops) is independent |
| T-6-34 | Elevation of Privilege | repairPlanRefiner is mis-implemented and bypasses admission entirely | mitigate | Refiner contract requires returning a RepairPlan; `runReviewRepairLoop` does not re-admit, so Task 2 wraps the pile call in `admitRepairPlanProposal` BEFORE returning; Task 1 Test 4 pins behavior when refiner throws |
</threat_model>

<verification>
- `pnpm --filter @protostar/review test` green (Task 1 4 new cases pass).
- `pnpm --filter @protostar/factory-cli test` green (Task 2 12 cases + Task 3 5 cases pass).
- `pnpm --filter @protostar/admission-e2e test` green (Task 4 deferral pins flipped, contract suite passes).
- `pnpm run verify` green across 5 consecutive runs.
- `apps/factory-cli/src/main.ts` contains `admitWorkSlicing`, `repairPlanRefiner`, `executionCoordinationPilePreset` references (directly or via the trigger module).
- The negative-grep deferral pins from Plan 06-08 are flipped (Task 4).
</verification>

<success_criteria>
- PILE-03 satisfied at the runtime level: `executionCoordinationPilePreset` is invoked by factory-cli at both work-slicing and repair-plan-generation triggers, output flows through `admitWorkSlicing` / `admitRepairPlanProposal`, and the deferral pins are replaced with positive wiring assertions.
- Q-06 honored at the work-slicing seam (hard-fail on pile failure); Q-15's soft-fallback honored at the repair-plan seam (deterministic plan stands on pile failure or admission no-op rejection); authority-expansion always hard-blocks.
- The dark-factory contract holds: every pile-output-derived plan transition is admission-gated and evidence-bearing.
- Plan 06-08's deferral pins flip to positive contracts; verification report's Gap 1 closes.
</success_criteria>

<output>
After completion, create `.planning/phases/06-live-dogpile-piles/06-10-SUMMARY.md` recording:
- The repairPlanRefiner hook contract and its call site in run-review-repair-loop.ts.
- The exec-coord-trigger module surface (heuristic + two invocation wrappers).
- The work-slicing heuristic configuration path (factory-config.json + defaults).
- The Q-06-vs-Q-15 nuance at the repair-plan-refinement seam (soft-fallback for pile failures, hard-block for authority-expansion).
- Verification evidence: 5 consecutive verify-green runs, factory-cli/review/admission-e2e test counts, deferral-pins flipped diff.
- Confirmation that PILE-03 is now runtime-met (Gap 1 from 06-VERIFICATION.md closed).
</output>
