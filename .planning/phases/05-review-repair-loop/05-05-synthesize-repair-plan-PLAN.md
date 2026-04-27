---
phase: 05-review-repair-loop
plan: 05
type: execute
wave: 2
depends_on: [01, 04]
files_modified:
  - packages/repair/src/index.ts
  - packages/repair/src/synthesize-repair-plan.ts
  - packages/repair/src/synthesize-repair-plan.test.ts
  - packages/repair/src/compute-repair-subgraph.ts
  - packages/repair/src/compute-repair-subgraph.test.ts
autonomous: true
requirements: [LOOP-03, LOOP-04]
must_haves:
  truths:
    - "`synthesizeRepairPlan(input): RepairPlan` is a pure function (no fs, no network, no Date.now())"
    - "Mechanical findings group by `repairTaskId` (already on ReviewFinding); model critiques group by `JudgeCritique.taskRefs`"
    - "`computeRepairSubgraph(plan, repairTaskIds)` returns topologically ordered union of `repairTaskIds ∪ allDescendantsOf(repairTaskIds)`"
    - "Q-03 example tests pass: A→B→C plan with C-fail re-runs only [C]; A-fail re-runs [A,B,C] in topo order"
  artifacts:
    - path: packages/repair/src/synthesize-repair-plan.ts
      provides: "synthesizeRepairPlan pure transform"
    - path: packages/repair/src/compute-repair-subgraph.ts
      provides: "computeRepairSubgraph topo helper"
    - path: packages/repair/src/index.ts
      provides: "barrel exports"
  key_links:
    - from: packages/repair/src/synthesize-repair-plan.ts
      to: "@protostar/review (ReviewFinding, ReviewGate, JudgeCritique types)"
      via: "type imports"
      pattern: "from \"@protostar/review\""
    - from: packages/repair/src/synthesize-repair-plan.ts
      to: "@protostar/planning (AdmittedPlanExecutionArtifact)"
      via: "type imports"
      pattern: "from \"@protostar/planning\""
---

<objective>
Implement the pure-transform `@protostar/repair` package: `synthesizeRepairPlan` (Q-04, Q-05) and `computeRepairSubgraph` (Q-03 helper). Both are deterministic, zero-side-effect functions consumed by the loop in Plan 05-10.

Per Q-05: v0.1 implementation is "a straightforward fan-in (collect findings + critiques, group by `planTaskId`, attach)". Phase 8 layers repair POLICY on top — this plan ships only the fan-in.

Purpose: Single point of authorship that's NOT the review package — review remains a verdict-emitter, not a plan-author. Pure-transform package is testable in isolation.
Output: Two pure functions + tests covering happy paths, dependent-graph traversal, and Q-03 worked examples.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/05-review-repair-loop/05-CONTEXT.md
@packages/review/src/repair-types.ts
@packages/review/src/judge-types.ts
@packages/planning/src/index.ts
@packages/dogpile-adapter/src/index.ts

Structural template: `packages/dogpile-adapter` is the closest pure-transform sibling. Mirror its module layout.

<interfaces>
```typescript
// synthesize-repair-plan.ts
import type {
  ReviewFinding,
  ReviewGate,
  JudgeCritique,
  ModelReviewResult,
  RepairPlan,
  RepairTask
} from "@protostar/review";
import type { AdmittedPlanExecutionArtifact } from "@protostar/planning";

export interface SynthesizeRepairPlanInput {
  readonly runId: string;
  readonly attempt: number;                  // current attempt (the one that just failed); next iteration is attempt+1
  readonly plan: AdmittedPlanExecutionArtifact;
  readonly mechanical: ReviewGate;           // findings carry repairTaskId
  readonly model?: ModelReviewResult;        // optional — undefined when mechanical was non-pass and we skipped model (Q-02)
  readonly dependentTaskIds: readonly string[]; // pre-computed by loop using computeRepairSubgraph
}

export function synthesizeRepairPlan(input: SynthesizeRepairPlanInput): RepairPlan;

// compute-repair-subgraph.ts
export interface ComputeRepairSubgraphInput {
  readonly plan: AdmittedPlanExecutionArtifact;
  readonly repairTaskIds: readonly string[];   // task ids that produced repair-required findings
}

// Returns topo-ordered task ids: union of `repairTaskIds` and all descendants
// (tasks whose dependsOn chain includes any repair task). Order matches plan.tasks
// topological order (which is already topo-sorted on AdmittedPlan per Phase 1).
export function computeRepairSubgraph(input: ComputeRepairSubgraphInput): readonly string[];
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: computeRepairSubgraph + Q-03 worked-example tests</name>
  <files>packages/repair/src/compute-repair-subgraph.ts, packages/repair/src/compute-repair-subgraph.test.ts</files>
  <read_first>
    - .planning/phases/05-review-repair-loop/05-CONTEXT.md §Q-03 (verbatim worked examples)
    - packages/planning/src/index.ts (find PlanTask shape — `dependsOn` field; grep `interface PlanTask` and read ±30 lines)
    - packages/planning/src/index.ts (find AdmittedPlanExecutionArtifact.tasks shape)
  </read_first>
  <behavior>
    - Test 1 (Q-03 verbatim case A): Plan A→B→C, repairTaskIds = ["task-c"] → returns ["task-c"] (C has no descendants).
    - Test 2 (Q-03 verbatim case B): Plan A→B→C, repairTaskIds = ["task-a"] → returns ["task-a", "task-b", "task-c"] in topo order.
    - Test 3: Plan with diamond A→{B,C}→D, repairTaskIds = ["task-b"] → returns ["task-b", "task-d"] (only B and its single descendant).
    - Test 4: repairTaskIds = [] → returns [] (no-op).
    - Test 5: repairTaskIds containing an id not in the plan → throws (typed error: `UnknownRepairTaskError` with the bad id in the message).
    - Test 6: Output preserves topological order matching the plan's task order (assert deep equality against expected ordered array).
  </behavior>
  <action>
1. Create `packages/repair/src/compute-repair-subgraph.ts`. Implementation:
   - Read `input.plan.tasks` (already topo-sorted per Phase 1 admission).
   - Build a forward adjacency map: for each task, collect tasks whose `dependsOn` includes it (descendant relation).
   - BFS/DFS from each id in `repairTaskIds` collecting descendants into a Set.
   - Add the seed `repairTaskIds` to the Set.
   - Return tasks in original `plan.tasks` order, filtered to set membership. This preserves topo order.
   - Throw `UnknownRepairTaskError` (extend `Error`) if a seed id isn't in the plan.
2. Tests cover the six behaviors above. Use small hand-built `AdmittedPlanExecutionArtifact` fixtures (you may need an internal test-builder — if `@protostar/planning` exports one via `./internal/test-builders`, use it; otherwise inline-construct minimal fixtures with `as unknown as AdmittedPlanExecutionArtifact` and a TODO).

NO fs/network. Verify with grep.
  </action>
  <verify>
    <automated>cd /Users/zakkeown/Code/protostar && grep -c 'export function computeRepairSubgraph' packages/repair/src/compute-repair-subgraph.ts && grep -c 'UnknownRepairTaskError' packages/repair/src/compute-repair-subgraph.ts && grep -cE 'node:fs|node:net|fetch\(' packages/repair/src/compute-repair-subgraph.ts && pnpm --filter @protostar/repair test 2>&1 | tail -10</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c 'export function computeRepairSubgraph' packages/repair/src/compute-repair-subgraph.ts` == 1
    - `grep -c 'UnknownRepairTaskError' packages/repair/src/compute-repair-subgraph.ts` ≥ 1
    - `grep -cE 'node:fs|node:net|fetch\(' packages/repair/src/compute-repair-subgraph.ts` == 0
    - All 6 tests pass via `pnpm --filter @protostar/repair test`
  </acceptance_criteria>
  <done>Topo subgraph computation pinned; Plan 05-10 loop calls this before invoking the executor.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: synthesizeRepairPlan fan-in + grouping tests</name>
  <files>packages/repair/src/synthesize-repair-plan.ts, packages/repair/src/synthesize-repair-plan.test.ts, packages/repair/src/index.ts</files>
  <read_first>
    - .planning/phases/05-review-repair-loop/05-CONTEXT.md §Q-04, §Q-05
    - packages/review/src/repair-types.ts (RepairPlan, RepairTask shapes)
    - packages/review/src/judge-types.ts (JudgeCritique shape — taskRefs grouping key)
    - packages/review/src/index.ts (ReviewFinding shape — find `repairTaskId` field via grep)
  </read_first>
  <behavior>
    - Test 1 (mechanical-only): Input with `mechanical` containing 3 findings on 2 distinct `repairTaskId`s, `model: undefined`. Output: `repairs.length === 2`; each `RepairTask.modelCritiques` is `undefined`; `mechanicalCritiques` are the original findings grouped by id.
    - Test 2 (mechanical + model): Input with 1 mechanical finding on `task-a` + 1 JudgeCritique with `taskRefs: ["task-a"]`. Output: 1 `RepairTask` with both `mechanicalCritiques.length === 1` AND `modelCritiques.length === 1`.
    - Test 3 (model-only on a different task): mechanical finding on `task-a`, JudgeCritique with `taskRefs: ["task-b"]` only. Output: 2 `RepairTask`s (one for each id).
    - Test 4 (JudgeCritique with multi-task ref): JudgeCritique with `taskRefs: ["task-a", "task-b"]` → critique appears in BOTH RepairTask entries.
    - Test 5 (dependentTaskIds passthrough): Input `dependentTaskIds: ["task-z", "task-y"]` → output `RepairPlan.dependentTaskIds` is the same array (deep equal).
    - Test 6 (deterministic ordering): Two calls with semantically identical inputs produce strictly equal outputs (same JSON.stringify result). Order of `repairs` is deterministic — sort by `planTaskId` ascending OR preserve plan-task input order (planner pick: prefer plan-task input order; document choice).
    - Test 7 (no findings, no critiques): Mechanical verdict is "pass" but caller invoked synthesize anyway (defensive) → throws `EmptyRepairSynthesisError` (caller bug — only mechanical/model non-pass should reach here).
  </behavior>
  <action>
1. Create `packages/repair/src/synthesize-repair-plan.ts` per `<interfaces>`. Implementation:
   - Build a `Map<planTaskId, { mechanicalCritiques: ReviewFinding[]; modelCritiques: JudgeCritique[] }>`.
   - For each finding in `mechanical.findings` with a `repairTaskId`, append to the map entry.
   - For each critique in `model?.critiques ?? []`, for each `taskRef` in `critique.taskRefs`, append.
   - Materialize `RepairTask[]` in plan-task order: walk `input.plan.tasks` in order, emit a RepairTask for each id present in the map.
   - Throw `EmptyRepairSynthesisError extends Error` if the map is empty.
   - Return `{ runId, attempt, repairs, dependentTaskIds }` exactly per `<interfaces>`.
2. Update `packages/repair/src/index.ts` barrel to export both modules:
   ```ts
   export * from "./synthesize-repair-plan.js";
   export * from "./compute-repair-subgraph.js";
   ```
   Remove the placeholder `__REPAIR_PACKAGE_SKELETON__` from Plan 05-01.
3. Tests cover 7 behaviors. Use deterministic plan fixtures (3-task linear chain for Tests 1-2; 2-task plan for Test 3-4).

NO fs/network. Pure transform. No `Date.now()`, no `crypto.randomUUID()` — every input that varies must come from `SynthesizeRepairPlanInput`.
  </action>
  <verify>
    <automated>cd /Users/zakkeown/Code/protostar && grep -c 'export function synthesizeRepairPlan' packages/repair/src/synthesize-repair-plan.ts && grep -cE 'Date\.now|Math\.random|crypto\.' packages/repair/src/synthesize-repair-plan.ts && grep -cE 'node:fs|node:net|fetch\(' packages/repair/src/synthesize-repair-plan.ts && grep -c 'export \* from "./synthesize-repair-plan' packages/repair/src/index.ts && pnpm --filter @protostar/repair test 2>&1 | tail -10</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c 'export function synthesizeRepairPlan' packages/repair/src/synthesize-repair-plan.ts` == 1
    - `grep -cE 'Date\.now|Math\.random|crypto\.' packages/repair/src/synthesize-repair-plan.ts` == 0 (pure)
    - `grep -cE 'node:fs|node:net|fetch\(' packages/repair/src/synthesize-repair-plan.ts` == 0
    - `grep -c 'export \\* from "./synthesize-repair-plan' packages/repair/src/index.ts` == 1
    - `grep -c 'export \\* from "./compute-repair-subgraph' packages/repair/src/index.ts` == 1
    - All 7 tests pass
  </acceptance_criteria>
  <done>Pure-transform repair package complete; loop (Plan 05-10) invokes synthesizeRepairPlan after each non-pass iteration.</done>
</task>

</tasks>

<threat_model>
| Boundary | Description |
|----------|-------------|
| `@protostar/repair` ↔ side effects | repair must be deterministic |

| Threat ID | Category | Component | Disposition | Mitigation |
|-----------|----------|-----------|-------------|------------|
| T-05-09 | Tampering | non-deterministic repair plan (Date.now, randomness) | mitigate | grep gate forbids Date.now/Math.random/crypto in source; deterministic-equality test (Test 6) |
| T-05-10 | Information Disclosure | repair package gains fs imports | mitigate | grep gate forbids node:fs / node:net / fetch |
</threat_model>

<verification>
- `pnpm --filter @protostar/repair test` green
- Pure-function discipline enforced via grep
- Q-03 worked examples pass verbatim
</verification>

<success_criteria>
- synthesizeRepairPlan + computeRepairSubgraph implemented as pure functions
- All Q-03 worked examples pass
- Repair package exports both functions via barrel
</success_criteria>

<output>
Create `.planning/phases/05-review-repair-loop/05-05-SUMMARY.md`: documents the two new exports and notes that Plan 05-10 is the consumer.
</output>
</content>
</invoke>