---
phase: 06-live-dogpile-piles
plan: 06
type: execute
wave: 2
depends_on: [04]
files_modified:
  - packages/repair/src/execution-coordination-pile-result.ts
  - packages/repair/src/execution-coordination-pile-result.test.ts
  - packages/repair/src/admit-repair-plan-proposal.ts
  - packages/repair/src/admit-repair-plan-proposal.test.ts
  - packages/repair/src/index.ts
  - packages/planning/src/admit-work-slicing.ts
  - packages/planning/src/admit-work-slicing.test.ts
  - packages/planning/src/index.ts
autonomous: true
requirements: [PILE-03]
tags: [repair, planning, exec-coord, q-15, q-18]
must_haves:
  truths:
    - "ExecutionCoordinationPileResult has shape `{ output: string, source?: PileSource }` mirroring PlanningPileResult; output is JSON-stringified discriminated union (Q-18)"
    - "parseExecutionCoordinationPileResult discriminates between work-slicing and repair-plan variants by output's `kind` field"
    - "admitRepairPlanProposal validates a repair-plan proposal against existing RepairPlan structural rules (Phase 5 Q-04/Q-05); rejects malformed proposals with typed errors"
    - "admitWorkSlicing accepts a work-slicing proposal and returns either a re-admitted AdmittedPlan or a refusal artifact (PILE-03 re-admission seam)"
  artifacts:
    - path: "packages/repair/src/execution-coordination-pile-result.ts"
      provides: "Q-18 wire format + parser for exec-coord pile output"
      contains: "export function parseExecutionCoordinationPileResult"
    - path: "packages/repair/src/admit-repair-plan-proposal.ts"
      provides: "Q-15 repair-plan-trigger admission validator"
      contains: "export function admitRepairPlanProposal"
    - path: "packages/planning/src/admit-work-slicing.ts"
      provides: "Q-15 work-slicing-trigger re-admission via Phase 1 admission path"
      contains: "export function admitWorkSlicing"
  key_links:
    - from: "packages/repair/src/execution-coordination-pile-result.ts"
      to: "packages/planning/src (TaskSlice / AdmittedPlan types)"
      via: "import type"
      pattern: "from \\\"@protostar/planning\\\""
---

<objective>
Wave 2 part B — supply the execution-coordination pile output contract and its two admission seams: `admitRepairPlanProposal` in `@protostar/repair` (repair-plan trigger) and `admitWorkSlicing` in `@protostar/planning` (work-slicing trigger). Per CONTEXT Q-18 / Claude's discretion, ExecutionCoordinationPileResult co-locates in `@protostar/repair`.

Purpose: PILE-03 — `executionCoordinationPilePreset` invoked at TWO trigger points (Q-15). Plan 04 provided the mission builder; this plan provides the parser + admission validators that close the loop.

Output: Wire format + parser + two admission helpers + barrel re-exports.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/06-live-dogpile-piles/06-CONTEXT.md
@.planning/phases/06-live-dogpile-piles/06-RESEARCH.md
@packages/repair/src/index.ts
@packages/planning/src/index.ts
@packages/dogpile-adapter/src/index.ts

<interfaces>
<!-- Wire format mirrors PlanningPileResult / ReviewPileResult -->

```ts
// In @protostar/repair:
export interface ExecutionCoordinationPileResult {
  readonly output: string;          // JSON-stringified ExecutionCoordinationProposal
  readonly source?: PileSource;
}

export type ExecutionCoordinationProposal =
  | { readonly kind: "work-slicing"; readonly slices: readonly TaskSlice[] }
  | { readonly kind: "repair-plan"; readonly repairPlan: RepairPlanProposal };

// TaskSlice + AdmittedPlan come from @protostar/planning; the parser imports types and uses them structurally.
// RepairPlanProposal comes from existing @protostar/repair shapes (Phase 5 Q-04 — confirm at execution time).
```

PILE-03 dual-trigger flow (Q-15):
- WORK-SLICING trigger: factory-cli (Plan 07) detects `shouldInvokeWorkSlicing(admittedPlan)` (heuristic: targetFiles>3 OR estimatedTurns>5 — defaults from CONTEXT). If true, runFactoryPile is called with mode=work-slicing mission. Output → parseExecutionCoordinationPileResult → admitWorkSlicing → re-admitted plan replaces the original.
- REPAIR-PLAN trigger: after `synthesizeRepairPlan` (Phase 5), exec-coord pile is OPTIONALLY invoked. Output → parseExecutionCoordinationPileResult → admitRepairPlanProposal. If admission rejects, the deterministic RepairPlan stands.

Phase 5 dependency note (RepairPlan shape from Phase 5 Q-04):
- @protostar/repair currently a 4-line skeleton (per RESEARCH).
- The full RepairPlanProposal/RepairPlan shapes are defined by Phase 5 Plan 05-05 (synthesizeRepairPlan).
- **HARD DEPENDENCY:** Executor reads the latest packages/repair/src/index.ts at execution time. If @protostar/repair does NOT export RepairPlan / RepairPlanProposal (Phase 5 Plan 05-05 has not landed), the executor MUST HALT this plan and escalate to the operator. **Do NOT invent a parallel shape** — silent shape divergence between Phase 5 and Phase 6 is the failure mode this rule prevents. Operator decides: (a) land Phase 5 Plan 05-05 first, or (b) explicitly authorize Phase 6 to define the shape with a forward-compatibility commitment recorded in this plan's SUMMARY.
</interfaces>
</context>

## Notes

Adapter ergonomic re-exports are deferred for v0.1 — factory-cli imports directly from owning packages.

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: ExecutionCoordinationPileResult shape + parseExecutionCoordinationPileResult (Q-18)</name>
  <files>packages/repair/src/execution-coordination-pile-result.ts, packages/repair/src/execution-coordination-pile-result.test.ts, packages/repair/src/index.ts</files>
  <read_first>
    - packages/repair/src/index.ts (current 4-line skeleton — see what's there from Phase 5 Plan 05-01)
    - packages/planning/src/index.ts (locate TaskSlice / Task type definitions; confirm what's exported)
    - .planning/phases/05-review-repair-loop/05-CONTEXT.md §"Q-04" / §"Q-05" (RepairPlan shape — required for proposal validation)
    - packages/planning/src/index.ts §PlanningPileResult (lines 206-212 mirror pattern)
  </read_first>
  <behavior>
    - `ExecutionCoordinationPileResult` exported with `{ output: string, source?: PileSource }` shape (PileSource imported or aliased from @protostar/review per Plan 05).
    - `ExecutionCoordinationProposal` is a discriminated union with `kind: "work-slicing" | "repair-plan"`.
    - `parseExecutionCoordinationPileResult(input): { ok: true; proposal: ExecutionCoordinationProposal } | { ok: false; errors: readonly string[] }`:
      - JSON.parse output; on failure → ok=false with parse error.
      - Validate `body.kind` is one of the two literals; on neither → ok=false.
      - For `work-slicing`: validate `body.slices` is an array; each slice has at minimum `taskId: string` and `targetFiles: string[]`.
      - For `repair-plan`: validate `body.repairPlan` has the Phase 5 RepairPlanProposal shape (read Phase 5 CONTEXT Q-04 for fields; minimum: `failingTaskIds: string[]`, `corrections: object[]`).
    - Pure function.
  </behavior>
  <action>
    Tests (5) in `execution-coordination-pile-result.test.ts`:
    1. **exec-coord-parser** non-JSON output → ok=false with parse-error message.
    2. **exec-coord-parser** unknown `kind` → ok=false with "unknown kind" error.
    3. work-slicing variant — valid body with 2 slices → ok=true, proposal.kind === "work-slicing", proposal.slices.length === 2.
    4. work-slicing missing `slices` array → ok=false.
    5. repair-plan variant valid body → ok=true, proposal.kind === "repair-plan".

    Run RED. Implement. GREEN.

    Update `packages/repair/src/index.ts` to re-export `ExecutionCoordinationPileResult`, `ExecutionCoordinationProposal`, `parseExecutionCoordinationPileResult`, and `PileSource` (or import from @protostar/review and re-export).

    **Do NOT edit `packages/dogpile-adapter/src/index.ts` in this plan** — Wave 2 file-ownership disjointness rule (see Plan 05 for the same constraint). Downstream consumers (Plan 07 factory-cli) import directly: `import { parseExecutionCoordinationPileResult } from "@protostar/repair"`. Ergonomic re-export through dogpile-adapter is deferred — the import path established here is final for v0.1.

    Per D-18 (Q-18): wire-format symmetry with PlanningPileResult; co-located in @protostar/repair per Claude's discretion (avoids new package mid-phase per RESEARCH §"Owning package").
  </action>
  <verify>
    <automated>pnpm --filter @protostar/repair test --grep exec-coord-parser &amp;&amp; pnpm --filter @protostar/repair build &amp;&amp; node -e "const r=require('@protostar/repair'); if (typeof r.parseExecutionCoordinationPileResult !== 'function') throw new Error('repair missing parseExecutionCoordinationPileResult'); console.log('ok')"</automated>
  </verify>
  <acceptance_criteria>
    - Command exits 0: `pnpm --filter @protostar/repair test --grep exec-coord-parser &amp;&amp; pnpm --filter @protostar/repair build &amp;&amp; node -e "const r=require('@protostar/repair'); if (typeof r.parseExecutionCoordinationPileResult !== 'function') throw new Error('repair missing parseExecutionCoordinationPileResult'); console.log('ok')"`
    - All grep/test invocations inside the command match (the command's `&&` chain enforces this — any failed step fails the whole gate).
    - No subjective judgment used; verification is binary on the shell exit status of the automated command above.
    - Note: dogpile-adapter ergonomic re-export is intentionally deferred (see action body — Wave 2 file-ownership disjointness rule); acceptance tests @protostar/repair surface only.
  </acceptance_criteria>
  <done>
    All 5 parser tests pass; @protostar/repair builds and exports parseExecutionCoordinationPileResult; static no-fs test for dogpile-adapter still green. (Adapter re-export deferred per Wave 2 disjointness.)
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: admitRepairPlanProposal in @protostar/repair (Q-15 repair-plan trigger)</name>
  <files>packages/repair/src/admit-repair-plan-proposal.ts, packages/repair/src/admit-repair-plan-proposal.test.ts, packages/repair/src/index.ts</files>
  <read_first>
    - packages/repair/src/execution-coordination-pile-result.ts (Task 1 — RepairPlanProposal shape)
    - .planning/phases/05-review-repair-loop/05-CONTEXT.md §"Q-04"+"Q-05" (RepairPlan structural rules)
    - packages/repair/src/index.ts (existing exports — synthesizeRepairPlan if present from Phase 5)
  </read_first>
  <behavior>
    - Signature: `admitRepairPlanProposal(proposal: RepairPlanProposal, ctx: { admittedPlan: AdmittedPlan; failingTaskIds: readonly string[] }): { ok: true; repairPlan: RepairPlan } | { ok: false; errors: readonly string[] }`.
    - Validation rules (deterministic, structural — NOT model-judged):
      - Every `proposal.failingTaskIds` entry must appear in `ctx.failingTaskIds` (no proposal can claim repair for a task not actually failing).
      - Every correction's `targetTaskId` must appear in `ctx.admittedPlan.tasks` (no repair invents new tasks).
      - Corrections cannot expand capability envelope (no required-capabilities in repair beyond the original task's).
    - Pure: no I/O.
  </behavior>
  <action>
    Tests (4):
    1. happy path → ok=true with repairPlan.
    2. proposal includes failingTaskId not in ctx → ok=false with "unknown failing task".
    3. correction targets non-existent task → ok=false with "unknown target task".
    4. correction expands capability envelope → ok=false with "capability expansion".

    Run RED. Implement. GREEN.

    Update `packages/repair/src/index.ts` to export `admitRepairPlanProposal`.

    Per D-15 (Q-15): repair-plan trigger admits via deterministic validation; pile output is the proposal, admission is the gate.
  </action>
  <verify>
    <automated>pnpm --filter @protostar/repair test --grep admit-repair-plan</automated>
  </verify>
  <acceptance_criteria>
    - Command exits 0: `pnpm --filter @protostar/repair test --grep admit-repair-plan`
    - All grep/test invocations inside the command match (the command's `&&` chain enforces this — any failed step fails the whole gate).
    - No subjective judgment used; verification is binary on the shell exit status of the automated command above.
  </acceptance_criteria>
  <done>
    All 4 tests pass; `admitRepairPlanProposal` exported from `@protostar/repair`.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: admitWorkSlicing in @protostar/planning (Q-15 work-slicing re-admission)</name>
  <files>packages/planning/src/admit-work-slicing.ts, packages/planning/src/admit-work-slicing.test.ts, packages/planning/src/index.ts</files>
  <read_first>
    - packages/planning/src/index.ts (admitCandidatePlans + AdmittedPlan + Task shapes)
    - packages/planning/src/candidate-plan-admission.test.ts (existing admission test pattern to mirror)
    - .planning/phases/06-live-dogpile-piles/06-CONTEXT.md §"Q-15" lines 134-139 (work-slicing flow: pile output → re-admit through Phase 1 → AdmittedPlan)
  </read_first>
  <behavior>
    - Signature: `admitWorkSlicing(proposal: WorkSlicingProposal, ctx: { admittedPlan: AdmittedPlan; confirmedIntent: ConfirmedIntent }): { ok: true; admittedPlan: AdmittedPlan } | { ok: false; errors: readonly string[] }`.
    - Validation rules:
      - Every slice's `parentTaskId` must exist in `ctx.admittedPlan.tasks`.
      - Slices preserve the original task's required capabilities (no envelope expansion).
      - Sliced task targetFiles must be a SUBSET of the parent task's targetFiles.
      - The reconstructed plan (parent tasks replaced by slices, dependencies re-wired) passes the existing `admitCandidatePlans` admission rules (this function INTERNALLY calls or replicates existing admission validators — re-use, don't reinvent).
    - On ok=true returns the new `AdmittedPlan` carrying the sliced task set.
  </behavior>
  <action>
    Tests (5):
    1. **admit-work-slicing** happy path — single parent task with 2 slices; assert ok=true and `admittedPlan.tasks.length` === original.length - 1 + 2.
    2. slice parentTaskId unknown → ok=false.
    3. slice targetFiles introduces a NEW file (not a subset) → ok=false with "targetFiles expansion".
    4. slice expands required capabilities → ok=false.
    5. slice produces a plan that fails existing dependency-cycle admission → ok=false (re-uses existing admission rule).

    Run RED. Implement `admit-work-slicing.ts`. Re-use existing planning admission rules where possible (`admitCandidatePlans` and the contract files in packages/planning/src/). Re-run GREEN.

    Update `packages/planning/src/index.ts` to export `admitWorkSlicing` and `WorkSlicingProposal` type.

    Per D-15 (Q-15): work-slicing flows BACK through Phase 1 admission — `admitWorkSlicing` is the seam. PILE-03 requirement: "invoked when execution proposes work-slicing or repair-plan generation" — admission is mandatory at both seams.
  </action>
  <verify>
    <automated>pnpm --filter @protostar/planning test --grep admit-work-slicing</automated>
  </verify>
  <acceptance_criteria>
    - Command exits 0: `pnpm --filter @protostar/planning test --grep admit-work-slicing`
    - All grep/test invocations inside the command match (the command's `&&` chain enforces this — any failed step fails the whole gate).
    - No subjective judgment used; verification is binary on the shell exit status of the automated command above.
  </acceptance_criteria>
  <done>
    All 5 tests pass; `admitWorkSlicing` + `WorkSlicingProposal` exported from `@protostar/planning`; existing planning tests still pass.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Pile output → parseExecutionCoordinationPileResult | Untrusted model output. |
| Pile-derived proposal → admitRepairPlanProposal / admitWorkSlicing | Authority elevation boundary: pile cannot expand capability envelope or invent tasks. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-6-19 | Elevation of Privilege | Pile-supplied repair plan expands capability envelope beyond original task | mitigate | admitRepairPlanProposal Test 4 enforces; admission helper compares envelopes structurally |
| T-6-20 | Elevation of Privilege | Pile-supplied work-slicing proposal introduces new targetFiles | mitigate | admitWorkSlicing Test 3 enforces subset rule |
| T-6-21 | Spoofing | Pile claims to repair a task that wasn't failing | mitigate | admitRepairPlanProposal Test 2 enforces ctx.failingTaskIds membership |
| T-6-22 | Tampering | Malformed pile output bypasses parser | mitigate | parseExecutionCoordinationPileResult is the single ingress; Tests 1.1-1.2 cover non-JSON and unknown-kind cases |
</threat_model>

<verification>
- All Plan 06 tests pass.
- `pnpm --filter @protostar/repair test`, `pnpm --filter @protostar/planning test`, `pnpm --filter @protostar/dogpile-adapter build` all pass.
- The static no-fs contract test on dogpile-adapter (Plan 01) still passes.
</verification>

<success_criteria>
- factory-cli (Plan 07) can build the work-slicing trigger by calling: runFactoryPile → parseExecutionCoordinationPileResult → admitWorkSlicing.
- factory-cli can build the repair-plan trigger by calling: runFactoryPile → parseExecutionCoordinationPileResult → admitRepairPlanProposal.
- PILE-03's dual-trigger requirement is satisfied at the contract level.
</success_criteria>

<output>
After completion, create `.planning/phases/06-live-dogpile-piles/06-06-SUMMARY.md` recording: parser shape, both admission helpers, owning packages, capability-envelope invariants enforced.
</output>
