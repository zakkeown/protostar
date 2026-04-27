---
phase: 05-review-repair-loop
plan: 09
type: execute
wave: 2
depends_on: [03]
files_modified:
  - packages/repo/src/apply-change-set.ts
  - packages/repo/src/apply-change-set.test.ts
autonomous: true
requirements: [LOOP-01]
must_haves:
  truths:
    - "`applyChangeSet` rejects with `cosmetic-archetype-multifile` reason when change set touches >1 distinct path AND archetype === 'cosmetic-tweak'"
    - "Rejection happens BEFORE any file write (atomic refusal)"
    - "Non-cosmetic archetypes are unaffected"
    - "Existing applyChangeSet behavior preserved (Phase 3 Plan 03-07 contract intact)"
  artifacts:
    - path: packages/repo/src/apply-change-set.ts
      provides: "applyChangeSet with archetype-aware ≤1-file gate"
  key_links:
    - from: packages/repo/src/apply-change-set.ts
      to: ApplyChangeSetInput
      via: "new optional `archetype` parameter"
      pattern: "archetype\\?: \"cosmetic-tweak\""
---

<objective>
Add the per-task ≤1-file enforcement (Q-08, FIRST defense) to `applyChangeSet`. When `archetype === "cosmetic-tweak"` and the change set touches >1 distinct path, refuse the apply with reason `'cosmetic-archetype-multifile'` BEFORE any file write happens.

Per Q-08: "Both — execution-time per-task check (cap each task's `RepoChangeSet` at 1 file when archetype is `cosmetic-tweak`) AND review-time run-level check." This plan ships the per-task check; Plan 05-07 ships the run-level check.

Purpose: Smallest blast radius — catches an offending diff before it lands in the workspace, saves wasted execution downstream. Phase 4 Q-19 run-bail-on-apply-failure dovetails: a per-task violation surfaces as adapter-failed.
Output: Type-only widening of `ApplyChangeSetInput` + runtime check + tests.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/05-review-repair-loop/05-CONTEXT.md
@packages/repo/src/apply-change-set.ts
@.planning/phases/03-repo-runtime-sandbox/03-07-apply-change-set-PLAN.md

<interfaces>
Diff against Phase 3 Plan 03-07's contract:

```typescript
// apply-change-set.ts
export interface ApplyChangeSetInput {
  // ... existing fields ...
  readonly archetype?: "cosmetic-tweak" | "feature-add" | "refactor" | "bugfix";
}

export type ApplyChangeSetRefusalReason =
  | "hash-mismatch"
  | "binary-content"
  | "patch-parse-error"
  | "outside-workspace"
  | "cosmetic-archetype-multifile";   // NEW (Phase 5 Q-08)
```

Pre-write enforcement order:
1. Validate input shape.
2. **NEW:** if `archetype === "cosmetic-tweak"` AND `distinctPaths(changeSet) > 1` → refuse with `cosmetic-archetype-multifile`, evidence `{ touchedFiles: string[] }`. NO writes.
3. SHA-256 pre-image gating (Phase 3 existing).
4. parsePatch / applyPatch / write (Phase 3 existing).
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add cosmetic-tweak archetype gate to applyChangeSet</name>
  <files>packages/repo/src/apply-change-set.ts, packages/repo/src/apply-change-set.test.ts</files>
  <read_first>
    - packages/repo/src/apply-change-set.ts (Phase 3 Plan 03-07 deliverable — current full file)
    - packages/repo/src/apply-change-set.test.ts (existing test patterns — 8 tests from Plan 03-07)
    - .planning/phases/05-review-repair-loop/05-CONTEXT.md §Q-08 ("Per-task check lives in `@protostar/repo` (or as an adapter post-processor) — `applyChangeSet` rejects with a typed reason `'cosmetic-archetype-multifile'`")
  </read_first>
  <behavior>
    - Test 1 (cosmetic 1-file OK): archetype="cosmetic-tweak", changeSet touches 1 file → applies normally (existing Phase 3 behavior).
    - Test 2 (cosmetic 2-file refused): archetype="cosmetic-tweak", changeSet touches 2 distinct paths → ApplyResult is refusal with reason `cosmetic-archetype-multifile`, evidence.touchedFiles lists both paths, NO disk writes occurred (verify by checking workspace timestamps / file content unchanged).
    - Test 3 (cosmetic 1-file with multiple hunks in same file): archetype="cosmetic-tweak", 1 file but 3 patch hunks → applies normally (gate counts distinct paths, not hunks).
    - Test 4 (non-cosmetic 5-file OK): archetype="feature-add", 5 files → no archetype gate triggers; existing Phase 3 behavior governs.
    - Test 5 (archetype undefined): archetype field omitted → no archetype gate triggers; backward compatible with Phase 3 callers.
    - Test 6 (refusal is atomic): Force a 2-file cosmetic change set; assert that EVEN THE FIRST FILE was not written (atomic-refuse-before-any-write semantics).
  </behavior>
  <action>
1. Locate `applyChangeSet` in `packages/repo/src/apply-change-set.ts`. Read the full file to understand its return shape and where existing refusal reasons branch.
2. Add `archetype?: "cosmetic-tweak" | "feature-add" | "refactor" | "bugfix";` to the input interface.
3. Widen the refusal-reason union to include `"cosmetic-archetype-multifile"`.
4. Insert the archetype gate as the FIRST runtime check (after input shape validation, BEFORE the SHA-256 pre-image step):
   ```typescript
   if (input.archetype === "cosmetic-tweak") {
     const distinctPaths = new Set(input.changeSet.files.map((f) => f.path));
     if (distinctPaths.size > 1) {
       return {
         status: "refused",
         reason: "cosmetic-archetype-multifile",
         evidence: { touchedFiles: Array.from(distinctPaths).sort() }
       };
     }
   }
   ```
   (Adapt to the actual return shape — the existing function may return `ApplyResult[]` per file. Read the file first; if it's per-file, return a refusal entry for the FIRST file with the multi-file reason and skip the rest.)

5. Tests cover the 6 behaviors above. Use Phase 3's `buildSacrificialRepo` test fixture for deterministic git state.

**Atomicity verification:** for Test 6, capture file mtimes before the call; after refusal, assert mtimes are unchanged. If `applyChangeSet` is per-file (loops and writes incrementally), the gate MUST run BEFORE the loop.
  </action>
  <verify>
    <automated>cd /Users/zakkeown/Code/protostar && grep -c 'cosmetic-archetype-multifile' packages/repo/src/apply-change-set.ts && grep -c 'archetype' packages/repo/src/apply-change-set.ts && pnpm --filter @protostar/repo test 2>&1 | tail -15</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c 'cosmetic-archetype-multifile' packages/repo/src/apply-change-set.ts` ≥ 1
    - `grep -c 'archetype' packages/repo/src/apply-change-set.ts` ≥ 2 (interface + check)
    - All 6 new tests pass
    - All existing Phase 3 Plan 03-07 tests still pass (zero regression)
  </acceptance_criteria>
  <done>Per-task ≤1-file gate live; Plan 05-07 supplies the run-level second-defense check.</done>
</task>

</tasks>

<threat_model>
| Boundary | Description |
|----------|-------------|
| applyChangeSet ↔ workspace files | atomic refusal must precede any write |

| Threat ID | Category | Component | Disposition | Mitigation |
|-----------|----------|-----------|-------------|------------|
| T-05-19 | Tampering | cosmetic-tweak diff sneaks 2-file change in | mitigate | per-task gate refuses pre-write; run-level gate (Plan 05-07) is second-defense |
| T-05-20 | Tampering | gate runs after partial writes | mitigate | Test 6 asserts atomic-refuse-before-any-write |
</threat_model>

<verification>
- `pnpm --filter @protostar/repo test` green
- All Phase 3 Plan 03-07 tests still pass
</verification>

<success_criteria>
- applyChangeSet refuses cosmetic-tweak multi-file change sets pre-write
- Reason taxonomy includes `cosmetic-archetype-multifile`
- Backward compatible (archetype is optional)
</success_criteria>

<output>
Create `.planning/phases/05-review-repair-loop/05-09-SUMMARY.md`: documents the new refusal reason and notes the per-task / run-level dual-defense pairing with Plan 05-07.
</output>
</content>
</invoke>