---
phase: 05-review-repair-loop
verified: 2026-04-28T02:10:04Z
status: gaps_found
score: 4/6 must-haves verified
overrides_applied: 0
gaps:
  - truth: "LOOP-03 and LOOP-04: failed verdicts produce a typed RepairPlan consumed by execution, and repair re-execution emits the same lifecycle events within maxRepairLoops"
    status: failed
    reason: "The core loop synthesizes RepairPlan values and calls an injected executor, but the production runFactory wiring supplies an executor whose executeRepairTasks implementation only returns the original execution result. No production path re-runs the repair subgraph through runRealExecution or passes repairContext into the coder adapter, so repair plans are not actually consumed by execution end-to-end."
    artifacts:
      - path: "apps/factory-cli/src/main.ts"
        issue: "createReviewTaskExecutor receives executeRepairTasks: async () => executionRunResultFromDry(executionResult), so every repair attempt reuses the stale initial execution result."
      - path: "apps/factory-cli/src/run-real-execution.ts"
        issue: "runRealExecution has no repair-plan/subgraph input and executeToFinal builds AdapterContext without repairContext."
    missing:
      - "Wire TaskExecutorService.executeRepairTasks in runFactory to execute the RepairPlan dependentTaskIds subgraph through the real execution path."
      - "Build per-task AdapterContext.repairContext from RepairPlan critiques when dispatching repair attempts."
      - "Persist repair execution lifecycle events/evidence with attempt > 0 so LOOP-04 is observable."
---

# Phase 5: Review Repair Loop Verification Report

**Phase Goal:** The central control loop. Mechanical first, model second, repair plans typed, re-execution under shared budget. No delivery unless this loop exits `pass`.
**Verified:** 2026-04-28T02:10:04Z
**Status:** gaps_found
**Re-verification:** No - initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|---|---|---|
| 1 | LOOP-01: Mechanical review runs first, covering build/lint, cosmetic diff size, and AC presence | VERIFIED | `runReviewRepairLoop` invokes `mechanicalChecker` before any model call at `packages/review/src/run-review-repair-loop.ts:106`; model review is inside the mechanical pass branch at line 145. `buildFindings` emits command failures, cosmetic multi-file critical findings, and `ac-uncovered` findings at `packages/mechanical-checks/src/findings.ts:41`, `:46`, and `:55`. |
| 2 | LOOP-02: Model review runs second and Phase 8 can plug into this seam | VERIFIED | `ModelReviewer` is an injected interface and is called only after mechanical pass (`packages/review/src/run-review-repair-loop.ts:145`). `createLmstudioJudgeAdapter` implements the seam and direct tests pass. |
| 3 | LOOP-03: Failed verdicts produce a typed RepairPlan consumed by execution | FAILED | RepairPlan synthesis exists (`packages/review/src/run-review-repair-loop.ts:287`) and core tests pass, but production `runFactory` wires `executeRepairTasks` as a stale-result no-op (`apps/factory-cli/src/main.ts:658-660`). Execution does not actually consume the repair plan end-to-end. |
| 4 | LOOP-04: Re-execution under repair plan emits the same lifecycle events within maxRepairLoops | FAILED | The loop reads `maxRepairLoops` from the confirmed intent (`packages/review/src/run-review-repair-loop.ts:93`) and calls the injected executor (`:320`), but `runFactory` does not re-run real execution for repairs. `runRealExecution` has no repair-plan input and no `repairContext` in `AdapterContext` (`apps/factory-cli/src/run-real-execution.ts:240-266`). |
| 5 | LOOP-05: Only mechanical pass plus model pass authorizes delivery | VERIFIED | Approved exit only occurs in the model pass branch, writes `review-decision.json`, and mints `DeliveryAuthorization` (`packages/review/src/run-review-repair-loop.ts:169-208`). `loadDeliveryAuthorization` accepts only strict `mechanical: "pass"` and `model: "pass"` (`packages/review/src/load-delivery-authorization.ts:39-49`). Delivery contract requires the brand (`packages/delivery/src/delivery-contract.ts:24-27`). |
| 6 | LOOP-06: Budget exhaustion produces evidence-bearing block with critiques captured | VERIFIED | Budget exhaustion writes `review-block.json` via `budgetExhausted` (`packages/review/src/run-review-repair-loop.ts:236-256`, `:369-394`). Iterations include mechanical/model/repairPlan records; closure fixes persist unattributed findings and model exceptions as block artifacts. |

**Score:** 4/6 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `packages/review/src/run-review-repair-loop.ts` | Core mechanical -> model -> repair loop | VERIFIED | Substantive implementation, strict serialization, envelope budget, block/decision paths, and closure fixes present. |
| `packages/repair/src/synthesize-repair-plan.ts` | Pure typed repair synthesis | VERIFIED | Groups mechanical and model critiques by plan task and preserves dependentTaskIds. |
| `packages/repair/src/compute-repair-subgraph.ts` | Failed task plus dependents | VERIFIED | Computes topo-ordered descendant set; package tests pass. |
| `packages/mechanical-checks/src/create-mechanical-checks-adapter.ts` | Mechanical command adapter | VERIFIED | Runs configured/default commands, captures evidence, computes diffNameOnly, uses injected readFile/subprocess. |
| `packages/lmstudio-adapter/src/create-judge-adapter.ts` | ModelReviewer implementation | VERIFIED | Produces pass/repair/block critiques and validates judge preflight. |
| `apps/factory-cli/src/main.ts` | Production loop wiring | FAILED | Calls `runReviewRepairLoop`, but repair executor is a no-op returning the initial execution result. |

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `runReviewRepairLoop` | `mechanicalChecker` then `modelReviewer` | Direct calls | WIRED | Model call is mechanically gated. |
| `runReviewRepairLoop` | `synthesizeRepairPlan` / `computeRepairSubgraph` | Named imports | WIRED | RepairPlan is generated before executor call. |
| `runReviewRepairLoop` | `TaskExecutorService.executeRepairTasks` | Injected service | PARTIAL | Core loop calls it, but factory production implementation does not execute repairs. |
| `runFactory` | `runReviewRepairLoop` | Direct invocation | WIRED | Main composition calls the new loop. |
| `runFactory` | real repair re-execution | `executeRepairTasks` | NOT_WIRED | No-op stale result at `apps/factory-cli/src/main.ts:660`. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|---|---|---|---|---|
| `runReviewRepairLoop` | `repairPlan` | `synthesizeRepairPlan` from mechanical/model critiques | Yes | VERIFIED |
| `runReviewRepairLoop` | `execution` for next iteration | `executor.executeRepairTasks` return value | Interface yes, production no | HOLLOW in `runFactory` |
| `createReviewPersistence` | iteration/block/decision artifacts | injected `FsAdapter` writes | Yes | VERIFIED |
| `preflightCoderAndJudge` | coder/judge readiness | `preflightLmstudioModel` for separate base URLs | Yes | VERIFIED |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| Review loop core tests | `pnpm --filter @protostar/review test` | 45 tests passed | PASS |
| Mechanical checks tests | `pnpm --filter @protostar/mechanical-checks test` | 19 tests passed | PASS |
| Repair package tests | `pnpm --filter @protostar/repair test` | 13 tests passed | PASS |
| Factory CLI package tests | `pnpm --filter @protostar/factory-cli test` | 122 tests passed | PASS |
| Preflight closure fix | `pnpm --filter @protostar/factory-cli exec node --test --test-name-pattern preflightCoderAndJudge dist/wiring/preflight.test.js` | 5 tests passed | PASS |
| Judge adapter behavior | `pnpm --filter @protostar/lmstudio-adapter exec node --test --test-name-pattern createLmstudioJudgeAdapter dist/src/create-judge-adapter.test.js` | 7 tests passed | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|---|---|---|---|---|
| LOOP-01 | Roadmap / 05-07 / 05-10 | Mechanical review runs first | SATISFIED | Strict call order in loop plus build/lint/diff/AC findings. |
| LOOP-02 | Roadmap / 05-08 / 05-10 | Model review runs second | SATISFIED | Injected ModelReviewer called only after mechanical pass; judge adapter present. |
| LOOP-03 | Roadmap / 05-05 / 05-10 / 05-12 | RepairPlan generation consumed by execution | BLOCKED | RepairPlan exists, but production executor does not consume it. |
| LOOP-04 | Roadmap / 05-03 / 05-06 / 05-10 / 05-12 | Re-execution under repair plan with shared budget | BLOCKED | `maxRepairLoops` is enforced in core, but production repair re-execution is not wired. |
| LOOP-05 | Roadmap / 05-10 / 05-13 | Strict pass/pass delivery gate | SATISFIED | Decision artifact and brand mint only on model pass; delivery contract requires brand. |
| LOOP-06 | Roadmap / 05-10 | Budget exhaustion block with critiques | SATISFIED | Block artifact includes iterations and model critiques; closure fixes cover exception and unattributed-finding cases. |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|---|---:|---|---|---|
| `apps/factory-cli/src/main.ts` | 660 | `executeRepairTasks: async () => executionRunResultFromDry(executionResult)` | BLOCKER | Makes production repair attempts reuse stale execution output instead of executing the repair plan. |
| `apps/factory-cli/src/run-real-execution.ts` | 246 | `AdapterContext` built without `repairContext` | BLOCKER | Repair critiques cannot reach the coder adapter during actual repair execution. |

### Human Verification Required

None for this decision. The blocking gap is observable statically in production wiring.

### Gaps Summary

Phase 5 is mostly implemented at the package-contract level: strict mechanical/model ordering, typed repair synthesis, durable review artifacts, strict delivery authorization, model-exception hardening, and separate coder/judge preflight URLs are all present and tested.

The remaining blocker is the production repair path. `runReviewRepairLoop` can call an injected executor, but `runFactory` injects an executor that ignores the `RepairPlan` and returns the initial execution result. That means a real factory run cannot repair and re-execute the failed subgraph, and repair critiques do not flow into real adapter calls. This misses the phase goal and LOOP-03/LOOP-04 until the factory executor is wired to actual repair re-execution.

---

_Verified: 2026-04-28T02:10:04Z_
_Verifier: the agent (gsd-verifier)_
