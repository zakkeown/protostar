---
phase: 05-review-repair-loop
plan: 06
type: execute
wave: 2
depends_on: [04]
files_modified:
  - packages/execution/src/adapter-contract.ts
  - packages/execution/src/adapter-contract.test.ts
  - packages/execution/src/index.ts
autonomous: true
requirements: [LOOP-03, LOOP-04]
must_haves:
  truths:
    - "`AdapterContext` (Phase 4) gains optional `repairContext?: RepairContext` field"
    - "`AdapterEvidence.retries[].retryReason` union widens from `'transient' | 'parse-reformat'` to `'transient' | 'parse-reformat' | 'repair'`"
    - "`TaskJournalEvent.task-failed.retryReason` union also includes `'repair'` (Phase 4 Plan 04-02 added `'orphaned-by-crash'`; Phase 5 adds `'repair'`)"
    - "Type-only addition — no runtime behavior change in `@protostar/execution`"
  artifacts:
    - path: packages/execution/src/adapter-contract.ts
      provides: "extended AdapterContext + AdapterEvidence retryReason union"
  key_links:
    - from: packages/execution/src/adapter-contract.ts
      to: "@protostar/planning (RepairContext type import — neutral leaf, breaks cycle with review)"
      via: "type import"
      pattern: "from \"@protostar/planning\""
---

<objective>
Extend Phase 4's `AdapterContext` to carry an optional `repairContext` field (Q-06 verbatim). Widen `retryReason` taxonomy (Q-06 deferred-ideas note: `'transient' | 'parse-reformat' | 'repair'`). All type-only — no runtime change in execution package.

Per Q-06: "Phase 4's `AdapterContext` (`ctx`) gains `repairContext?: RepairContext`. Adapter prompt template adds a 'Previous attempt failed:' section when present. Journal entry on a repair attempt includes `retryReason: 'repair'` and an `evidenceArtifact` pointing at the matching `repair-plan.json`."

Purpose: Lock the contract widening so Wave 2 adapters (mechanical-checks doesn't need it; coder + judge do) and Wave 3 loop (which sets repairContext on each repair iteration) compile against a stable shape.
Output: Type-only addition in `@protostar/execution`; tests assert constructibility with and without the new field.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/05-review-repair-loop/05-CONTEXT.md
@packages/execution/src/adapter-contract.ts
@packages/execution/src/journal-types.ts
@packages/review/src/repair-types.ts
@.planning/phases/04-execution-engine/04-02-execution-contracts-PLAN.md

<interfaces>
Diff against Phase 4's adapter-contract.ts:

```typescript
// Cycle-break: RepairContext lives in @protostar/planning (neutral leaf).
// @protostar/execution already depends on @protostar/planning; @protostar/review
// also depends on planning. Importing from review here would force review→exec
// AND exec→review project references, which `tsc --build` rejects.
import type { RepairContext } from "@protostar/planning";

export interface AdapterContext {
  // ... existing fields ...
  readonly repairContext?: RepairContext;   // Phase 5 Q-06 — present on repair iterations only
}

export interface AdapterEvidence {
  // ... existing fields ...
  readonly retries: readonly {
    readonly attempt: number;
    readonly retryReason: "transient" | "parse-reformat" | "repair";  // 'repair' added by Phase 5 Q-06
    readonly errorClass?: string;
    readonly durationMs: number;
  }[];
}
```

Diff against Phase 4's journal-types.ts:

```typescript
| { readonly kind: "task-failed";    readonly reason: string; readonly retryReason?: "transient" | "parse-reformat" | "orphaned-by-crash" | "repair"; readonly errorClass?: string; readonly evidenceArtifact?: StageArtifactRef }
```
</interfaces>

**Cycle resolution (locked decision, see 05-04):** `@protostar/review` already depends on `@protostar/execution`. Adding `@protostar/review` as a dep of `@protostar/execution` here would close that cycle and break `tsc --build`. Resolution: `RepairContext` (and `AdapterAttemptRef`) live in `@protostar/planning` (neutral leaf, owned by 05-04), and `@protostar/execution` imports from there. `@protostar/review` re-exports `RepairContext` for back-compat. **Do NOT add `@protostar/review` to execution's package.json deps.** The Wave-2 ordering (05-04 lands first) guarantees the planning leaf exists when this plan executes.
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Extend AdapterContext + AdapterEvidence retry union</name>
  <files>packages/execution/src/adapter-contract.ts, packages/execution/src/adapter-contract.test.ts, packages/execution/package.json</files>
  <read_first>
    - packages/execution/src/adapter-contract.ts (full file — locate AdapterContext + AdapterEvidence)
    - packages/planning/src/repair-context.ts (RepairContext export — created by 05-04 in same wave; this is the neutral-leaf import target)
    - packages/review/package.json (confirm review→execution dep exists; that is what forces this neutral-leaf resolution)
    - packages/execution/package.json (current dependencies — already includes @protostar/planning, so NO new dep needed)
    - .planning/phases/05-review-repair-loop/05-CONTEXT.md §Q-06
  </read_first>
  <behavior>
    - Test 1: Construct `AdapterContext` WITHOUT `repairContext` — compiles (optional field).
    - Test 2: Construct `AdapterContext` WITH `repairContext: { previousAttempt: { planTaskId: "t-1", attempt: 1 }, mechanicalCritiques: [] }` — compiles.
    - Test 3: AdapterEvidence retries array accepts entry with `retryReason: "repair"` — compiles.
    - Test 4: `retryReason: "unknown-reason"` is rejected (literal union — `@ts-expect-error` line).
  </behavior>
  <action>
1. **Confirm cycle-break is in place:** run `node -e "console.log(require('"'"'./packages/planning/package.json'"'"').name)"` and `grep -l '"'"'export interface RepairContext'"'"' packages/planning/src/*.ts` — both must succeed. If 05-04 has not yet landed `packages/planning/src/repair-context.ts`, STOP and report the wave-ordering violation (this plan declares `depends_on: [04]` and 05-04 belongs to wave 1 — Wave 2 cannot start until Wave 1 has landed).
2. **Cycle-check (defensive):** run `pnpm -w exec tsc --build packages/planning` first; it must exit 0 before any edit to execution. This proves the neutral leaf compiles standalone with no review/execution deps.
3. In `packages/execution/src/adapter-contract.ts`:
   - Add `import type { RepairContext } from "@protostar/planning";` at top (NOT from `@protostar/review` — that direction would close the cycle since review→execution).
   - In `AdapterContext` interface, append `readonly repairContext?: RepairContext;`.
   - In `AdapterEvidence.retries[].retryReason` union, add `| "repair"`.
4. In `packages/execution/src/journal-types.ts`:
   - In the `task-failed` variant, add `| "repair"` to the `retryReason` union.
5. **Do NOT** add `@protostar/review` to `packages/execution/package.json` deps — `@protostar/planning` is already a dep, no new entry needed.
6. **Do NOT** add a `tsconfig.json` `{ "path": "../review" }` reference to execution. The reference to `../planning` already exists.
7. Tests cover the 4 behaviors. Use existing mock-adapter pattern from Phase 4 Plan 04-02 Task 1.
8. **Final cycle check:** run `pnpm -w exec tsc --build packages/planning packages/execution packages/review` — MUST exit 0. If TS6202 (cyclic project reference) appears, the import in step 3 was mis-routed (e.g. `@protostar/review` instead of `@protostar/planning`); fix and re-run.
  </action>
  <verify>
    <automated>cd /Users/zakkeown/Code/protostar && grep -c 'repairContext' packages/execution/src/adapter-contract.ts && grep -c '"repair"' packages/execution/src/adapter-contract.ts && grep -c '"repair"' packages/execution/src/journal-types.ts && pnpm --filter @protostar/execution build 2>&1 | tail -5 && pnpm --filter @protostar/execution test 2>&1 | tail -10</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c 'repairContext' packages/execution/src/adapter-contract.ts` ≥ 1
    - `grep -c 'from "@protostar/planning"' packages/execution/src/adapter-contract.ts` ≥ 1 (RepairContext sourced from neutral leaf)
    - `grep -c 'from "@protostar/review"' packages/execution/src/adapter-contract.ts` == 0 (no review import — would cycle)
    - `grep -cE '"repair"' packages/execution/src/adapter-contract.ts` ≥ 1 (within retryReason union)
    - `grep -cE '"repair"' packages/execution/src/journal-types.ts` ≥ 1
    - `grep -c '@protostar/review' packages/execution/package.json` == 0 (no new dep added)
    - `pnpm -w exec tsc --build packages/planning packages/execution packages/review` exits 0 (no TS6202 cyclic project reference; passes after both 05-04, 05-06, and 05-10 land)
    - `pnpm --filter @protostar/execution build` exits 0
    - `pnpm --filter @protostar/execution test` exits 0 with new tests included
  </acceptance_criteria>
  <done>AdapterContext + AdapterEvidence + journal `task-failed` carry the repair-aware shape; Wave 2 + Wave 3 plans compile against stable types.</done>
</task>

</tasks>

<threat_model>
| Boundary | Description |
|----------|-------------|
| execution ↔ review type imports | cycle risk |

| Threat ID | Category | Component | Disposition | Mitigation |
|-----------|----------|-----------|-------------|------------|
| T-05-11 | Tampering | adapter mistakes a repair retry for transient | mitigate | retryReason literal union widened to include "repair"; consumers exhaustively switch |
| T-05-12 | Denial of Service | dependency cycle execution↔review | mitigate | RepairContext relocated to @protostar/planning (neutral leaf, owned by 05-04); execution imports from planning, never from review; AC asserts `grep -c "@protostar/review" execution/package.json == 0` and `tsc --build` 3-package cycle-check exits 0 |
</threat_model>

<verification>
- `pnpm --filter @protostar/execution build` green (no cycle)
- `pnpm --filter @protostar/execution test` green
</verification>

<success_criteria>
- AdapterContext carries optional `repairContext`
- retryReason taxonomy includes `"repair"` in both adapter-contract and journal-types
</success_criteria>

<output>
Create `.planning/phases/05-review-repair-loop/05-06-SUMMARY.md`: documents the type widening, confirms the neutral-leaf import (`@protostar/planning` for RepairContext), and records the `pnpm -w exec tsc --build packages/planning packages/execution packages/review` cycle-free verification result.
</output>
</content>
</invoke>