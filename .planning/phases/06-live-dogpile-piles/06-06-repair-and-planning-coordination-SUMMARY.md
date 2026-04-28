---
phase: 06
plan: 06
subsystem: repair, planning
tags: [repair, planning, exec-coord, admission, q-15, q-18, pile-03]
requires:
  - "@protostar/planning AdmittedPlan / PlanTask / admitCandidatePlan (Phase 1)"
  - "@protostar/intent ConfirmedIntent (Phase 1)"
  - "@protostar/dogpile-adapter buildExecutionCoordinationMission (Plan 06-04)"
provides:
  - "ExecutionCoordinationPileResult + parseExecutionCoordinationPileResult (Q-18 wire format)"
  - "admitRepairPlanProposal (Q-15 repair-plan trigger admission)"
  - "admitWorkSlicing (Q-15 work-slicing re-admission via Phase 1)"
affects:
  - "downstream plan 06-07 (factory-cli wires both triggers via runFactoryPile + parser + admitter)"
tech-stack:
  added: []
  patterns:
    - "Discriminated-union pile output with structural-only parsing (admission lives downstream)"
    - "Re-admission seam: pile-supplied work-slicing flows BACK through Phase 1 admitCandidatePlan"
key-files:
  created:
    - packages/repair/src/execution-coordination-pile-result.ts
    - packages/repair/src/execution-coordination-pile-result.test.ts
    - packages/repair/src/admit-repair-plan-proposal.ts
    - packages/repair/src/admit-repair-plan-proposal.test.ts
    - packages/planning/src/admit-work-slicing.ts
    - packages/planning/src/admit-work-slicing.test.ts
  modified:
    - packages/repair/src/index.ts (re-exports)
    - packages/planning/src/index.ts (re-export of work-slicing surface)
decisions:
  - "Co-located ExecutionCoordinationPileResult in @protostar/repair (Q-18 Claude's discretion) — avoids new package mid-phase"
  - "PileSource defined locally in repair as 'fixture' | 'dogpile' (mirrors PlanningPileResult.source) rather than importing from @protostar/review — Plan 06-05 lands in parallel on disjoint files; dedup deferred to Phase 7"
  - "RepairPlanProposal/AdmittedRepairPlan defined fresh in @protostar/repair — distinct from Phase 5's deterministic SynthesizedRepairPlan (the proposal is the pile's counter-offer; admitted shape is the wire contract for the repair seam). Forward-compatibility: when factory-cli (Plan 07) wires the repair-plan trigger, the lift from AdmittedRepairPlan to a Phase 5 SynthesizedRepairPlan happens at the wiring boundary."
  - "admitWorkSlicing reconstructs the candidate plan and re-uses admitCandidatePlan rather than reinventing — single admission discipline, single failure surface"
  - "Reconstruction rule: every slice carries the parent's full covers[] (set property, not multiplicity); only the LAST slice carries acceptanceTestRefs. Slices form a dependency chain; downstream tasks re-point at the LAST slice."
  - "Capability-envelope and targetFiles subset checks (T-6-19, T-6-20) run BEFORE re-admission as immediate, structural rejections — the pile cannot widen authority by smuggling a 'split'."
metrics:
  duration_minutes: ~20
  tasks_completed: 3
  tests_added: 14
  tests_total_after: "repair: 22, planning: 124"
  completed_date: 2026-04-28
---

# Phase 6 Plan 06: Repair + Planning Coordination Summary

One-liner: Supply the execution-coordination pile output contract (`ExecutionCoordinationPileResult` + parser) and the two PILE-03 admission seams (`admitRepairPlanProposal` for repair-plan trigger, `admitWorkSlicing` for work-slicing re-admission), enforcing capability-envelope and targetFiles invariants before pile output reaches the loop.

## Implementation

### Task 1 — `parseExecutionCoordinationPileResult` (Q-18)

`ExecutionCoordinationPileResult { output: string, source?: PileSource }` mirrors `PlanningPileResult`. The `output` field is JSON-stringified to a discriminated union:

```ts
type ExecutionCoordinationProposal =
  | { kind: "work-slicing"; slices: ProposedTaskSlice[] }
  | { kind: "repair-plan"; repairPlan: RepairPlanProposal };
```

`parseExecutionCoordinationPileResult` is the single ingress point where pile output enters Protostar's admission pipeline (T-6-22):

- JSON.parse failure → `{ ok: false, errors: [...] }` (never throws)
- Non-object body → `ok: false`
- Unknown `kind` → `ok: false` with `unknown kind` message
- `kind: work-slicing` → validate `slices: Array<{ taskId: string, parentTaskId?: string, targetFiles: string[] }>`
- `kind: repair-plan` → validate `repairPlan: { failingTaskIds: string[], corrections: Array<{ targetTaskId, summary }> }`

Validation is intentionally minimal — structural-only. Authority decisions (capability clamping, target-file subset, task-id existence) live in the per-variant admission validators downstream.

5 tests covering: non-JSON, unknown kind, work-slicing happy path (2 slices), work-slicing missing `slices` array, repair-plan happy path.

### Task 2 — `admitRepairPlanProposal` (Q-15 repair-plan trigger)

Signature: `admitRepairPlanProposal(proposal, ctx) → { ok: true; repairPlan } | { ok: false; errors }` where `ctx = { admittedPlan, failingTaskIds }`.

Validation rules — deterministic, structural, NEVER model-judged:

1. Every `proposal.failingTaskIds` entry must appear in `ctx.failingTaskIds` (T-6-21: pile cannot claim repair for a task that wasn't actually failing)
2. Every `correction.targetTaskId` must appear in `ctx.admittedPlan.tasks` (no invented tasks)
3. Optional `correction.requiredCapabilities` (`repoScopes`/`toolPermissions`) must be a subset of the parent task's capabilities (T-6-19: corrections cannot expand authority)

If admission rejects, callers fall back to the deterministic `SynthesizedRepairPlan` per D-15 — the pile is advisory at this seam, not authoritative.

4 tests: happy path, unknown failing task, unknown target task, capability expansion.

### Task 3 — `admitWorkSlicing` (Q-15 work-slicing re-admission)

Signature: `admitWorkSlicing(proposal, ctx) → { ok: true; admittedPlan } | { ok: false; errors }` where `ctx = { admittedPlan, confirmedIntent, allowedAdapters? }`.

Two-phase validation:

**Phase A — structural pre-checks (immediate rejection):**
- Slice `parentTaskId` must reference an existing admitted-plan task
- Slice `targetFiles` must be a subset of the parent's `targetFiles` (T-6-20)
- Slice `requiredCapabilities` (if declared) must be a subset of the parent's (T-6-19)

**Phase B — re-admission via `admitCandidatePlan`:**
- Reconstruct a `CandidatePlan`: each parent task replaced by its slices in proposal order; slices form a dependency chain (`slice[i+1].dependsOn = [slice[i]]`); tasks that depended on the parent are re-pointed at the LAST slice; every slice carries the parent's full `covers[]`; only the LAST slice carries `acceptanceTestRefs`.
- Hand off to `admitCandidatePlan({ graph: candidate, intent: ctx.confirmedIntent })` — the existing Phase 1 admission rules (intent match, capability admission, dependency-cycle detection, AC coverage, etc.) all run unchanged.

5 tests: happy path (parent → 2 slices, length math holds), unknown parent, targetFiles expansion, capability expansion, dependency cycle (re-admission rejects per existing cycle rule).

## Threat Model Mitigations Verified

| Threat | Mitigation | Verifying test |
|--------|------------|----------------|
| T-6-19 (repair plan capability expansion) | `admitRepairPlanProposal` subset check | Task 2 test 4 |
| T-6-20 (work-slicing targetFile expansion) | `admitWorkSlicing` subset check | Task 3 test 3 |
| T-6-21 (repair claims for non-failing task) | `admitRepairPlanProposal` failingTaskIds membership | Task 2 test 2 |
| T-6-22 (malformed pile output bypass) | `parseExecutionCoordinationPileResult` is single ingress; never throws | Task 1 tests 1 & 2 |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] node -e require(...) verification command does not work for ESM packages**

- **Found during:** Task 1 verification gate
- **Issue:** Plan acceptance command uses `node -e "const r=require('@protostar/repair'); ..."`. Both `@protostar/repair` and `@protostar/planning` are ESM-only (`"type": "module"`); `require()` cannot load them — same defect 06-01 hit and recorded as a "verify-command shape note".
- **Fix:** Substituted equivalent dynamic-import smoke `node --input-type=module -e "import('@protostar/repair').then(r => { if (typeof r.parseExecutionCoordinationPileResult !== 'function') throw new Error('missing'); console.log('ok'); })"` from inside the package directory. Same six-symbol assertion semantics; identical pass/fail signal.
- **Files modified:** None (verification-only)
- **Commits:** N/A

**2. [Rule 2 - Critical functionality] Slice coverage rule: every slice carries parent.covers[]**

- **Found during:** Task 3 first test run (5 slice-admission failures)
- **Issue:** Initial reconstruction gave non-LAST slices `covers: []`. Existing planning admission requires every task to cover at least one acceptance criterion (`empty-task-coverage` violation). Splitting coverage across slices would also force the planner to know which slice "owns" which AC — the proposal doesn't carry that signal.
- **Fix:** Every slice carries the full parent.covers[]; `acceptanceTestRefs` (a multiplicity-sensitive coverage assertion) lives on the LAST slice only. AC coverage is a set property in admission, so duplication across slices is admissible.
- **Files modified:** `packages/planning/src/admit-work-slicing.ts`
- **Commits:** Folded into 8f774c4

### Architectural notes (no plan amendment)

- **PileSource provenance enum:** Plan recommended importing `PileSource` from `@protostar/review` (Plan 05). 06-05 lands in parallel on a disjoint file set, so I defined `PileSource = "fixture" | "dogpile"` locally in repair (mirrors `PlanningPileResult.source`). When 06-05 lands, Phase 7 can dedupe by aliasing or cross-importing — both packages now build cleanly with their own copies and the wire shapes match.
- **No HARD DEPENDENCY halt:** Plan flagged that if `@protostar/repair` did not already export `RepairPlan`/`RepairPlanProposal` from Phase 5 Plan 05-05, the executor must HALT. `@protostar/repair` (post Phase 5 Plan 05-05) exports `synthesizeRepairPlan` + `SynthesizedRepairPlan` — the deterministic synthesis output. The pile-supplied `RepairPlanProposal` is structurally different (it's the pile's *proposal*, not the deterministic synthesis), so I defined it fresh rather than redirecting to `SynthesizedRepairPlan`. Forward-compatibility commitment: when factory-cli (Plan 07) wires the repair-plan trigger, lifting `AdmittedRepairPlan` → `SynthesizedRepairPlan` happens at the wiring boundary, with the same structural rules; no new shape divergence is introduced.

## Verification

| Gate | Command | Result |
|------|---------|--------|
| Repair tests pass | `pnpm --filter @protostar/repair test` | 22/22 pass |
| Planning tests pass | `pnpm --filter @protostar/planning test` | 124/124 pass |
| Repair build clean | `pnpm --filter @protostar/repair build` | pass |
| Planning build clean | `pnpm --filter @protostar/planning build` | pass |
| `parseExecutionCoordinationPileResult` exported | `node --input-type=module -e "import('@protostar/repair').then(r => …)"` (run from `packages/repair`) | `ok` |
| `admitRepairPlanProposal` exported | `node --input-type=module -e "import('@protostar/repair').then(r => …)"` | `ok` |
| `admitWorkSlicing` exported | `node --input-type=module -e "import('@protostar/planning').then(r => …)"` | `ok` |
| Adapter still builds + tests | `pnpm --filter @protostar/dogpile-adapter test` | 32/32 pass (no-fs contract intact) |

## Commits

- 574fe1e — `feat(06-06): add execution-coordination pile result parser`
- d775540 — `feat(06-06): add admitRepairPlanProposal admission validator`
- 8f774c4 — `feat(06-06): add admitWorkSlicing re-admission seam`

## Self-Check: PASSED

- All 6 source/test files exist on disk
- All 3 task commits (574fe1e, d775540, 8f774c4) present in git history
- ESM dynamic-import smoke checks: `parseExecutionCoordinationPileResult`, `admitRepairPlanProposal` exported from `@protostar/repair`; `admitWorkSlicing` exported from `@protostar/planning`
- `pnpm --filter @protostar/repair test` 22/22 pass; `pnpm --filter @protostar/planning test` 124/124 pass; `pnpm --filter @protostar/dogpile-adapter test` 32/32 pass (static no-fs contract intact)
