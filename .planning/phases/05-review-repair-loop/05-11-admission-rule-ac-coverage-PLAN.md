---
phase: 05-review-repair-loop
plan: 11
type: execute
wave: 3
depends_on: [03]
files_modified:
  - packages/policy/src/admission.ts
  - packages/policy/src/admission.test.ts
  - packages/planning/src/index.ts
  - packages/planning/src/index.test.ts
  - examples/planning-results/
  - packages/admission-e2e/src/
autonomous: true
requirements: [LOOP-01]
must_haves:
  truths:
    - "Plan admission rejects any candidate plan whose union of `task.acceptanceTestRefs[].acId` does NOT cover every `intent.acceptanceCriteria[].id`"
    - "Rejection produces a no-plan-admitted artifact with reason `'ac-coverage-incomplete'` listing missing AC ids"
    - "Existing passing-plan fixtures in `examples/planning-results/` and `packages/admission-e2e` updated with `acceptanceTestRefs` to satisfy the new rule"
    - "Cosmetic-tweak archetype default fixture demonstrates the AC-test pairing pattern (Q-09 lock)"
  artifacts:
    - path: packages/policy/src/admission.ts
      provides: "AC-coverage gate added to plan admission path"
  key_links:
    - from: packages/policy/src/admission.ts
      to: PlanTask.acceptanceTestRefs
      via: "field read at admission time"
      pattern: "acceptanceTestRefs"
---

<objective>
Land the AC-coverage admission rule (Q-09 admission side). Plan-level coverage: every `intent.acceptanceCriteria[].id` MUST be covered by ≥1 task's `acceptanceTestRefs[].acId`. Failure → no-plan-admitted with `reason: 'ac-coverage-incomplete'`.

Per Q-09: "Admission rule (Phase 1 update): reject plans whose union of `acceptanceTestRefs` doesn't cover every `intent.acceptanceCriteria[i].id`."

Per advisor #4: this gate WILL break existing admission-e2e fixtures. The cascade task in this plan updates every passing-plan fixture in the repo to include `acceptanceTestRefs`.

Purpose: Forces the planner (whether fixture or pile) to pair ACs with tests at admission. Mechanical review (Plan 05-07) verifies the test files exist in the diff and the test names appear in stdout.
Output: Admission rule + rejected-fixture test + cascade fixture updates.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/05-review-repair-loop/05-CONTEXT.md
@packages/policy/src/admission.ts
@packages/planning/src/index.ts
@packages/intent/src/index.ts
@examples/planning-results

**Universal vs cosmetic-only rule (advisor #4 surfaced):** CONTEXT Q-09 reads as universal — "every AC declared on confirmed intent must be covered". This plan applies the rule UNIVERSALLY (all archetypes). Non-cosmetic archetypes are stub-archetypes per `.planning/PROJECT.md` so most of them have no fixtures yet — universal application is safe and catches drift early. If the cascade audit reveals a stub-archetype fixture that can't reasonably carry test refs (e.g. a feature-add fixture pre-Phase-6), surface to operator and either (a) update the fixture with reasonable test refs or (b) gate this rule on `archetype === "cosmetic-tweak"` only with a TODO for Phase 6+ to widen.

<interfaces>
Admission rule (added to `packages/policy/src/admission.ts` plan-admission path):

```typescript
function checkAcceptanceTestRefsCoverage(input: {
  readonly plan: ParsedPlan;
  readonly intent: ConfirmedIntent;
}): { readonly status: "pass" } | { readonly status: "fail"; readonly missingAcIds: readonly string[] } {
  const declaredAcIds = new Set(input.intent.acceptanceCriteria.map((ac) => ac.id));
  const coveredAcIds = new Set<string>();
  for (const task of input.plan.tasks) {
    for (const ref of task.acceptanceTestRefs ?? []) {
      coveredAcIds.add(ref.acId);
    }
  }
  const missingAcIds = Array.from(declaredAcIds).filter((id) => !coveredAcIds.has(id));
  return missingAcIds.length === 0
    ? { status: "pass" }
    : { status: "fail", missingAcIds };
}
```

Rejection-artifact reason literal: `"ac-coverage-incomplete"`. Add to the existing no-plan-admitted reason union (find via grep `no-plan-admitted` in `packages/policy/src` and `packages/planning/src`).
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add ac-coverage-incomplete admission rule</name>
  <files>packages/policy/src/admission.ts, packages/policy/src/admission.test.ts</files>
  <read_first>
    - packages/policy/src/admission.ts (full file — locate plan admission path; trace from `admitCandidatePlans` or similar entry point)
    - packages/planning/src/index.ts (PlanTask shape with acceptanceTestRefs from Plan 05-03 — line ~580)
    - packages/intent/src/index.ts (ConfirmedIntent.acceptanceCriteria shape)
    - .planning/phases/05-review-repair-loop/05-CONTEXT.md §Q-09
    - .planning/phases/01-intent-planning-admission/ (search for prior admission-rule patterns: `grep -l 'no-plan-admitted' .planning/phases/01-*/*.md`)
  </read_first>
  <behavior>
    - Test 1 (full coverage): intent has `acceptanceCriteria: [{id:'ac-1'},{id:'ac-2'}]`; plan tasks union covers both → admission passes (existing happy path unaffected).
    - Test 2 (missing 1 AC): intent has 2 ACs, plan covers only 'ac-1' → admission rejects with `reason: 'ac-coverage-incomplete', missingAcIds: ['ac-2']`.
    - Test 3 (no acceptanceTestRefs at all): plan tasks have ZERO `acceptanceTestRefs` entries; intent has 1 AC → reject with `missingAcIds: ['ac-1']`.
    - Test 4 (multiple tasks cover same AC): two tasks both have `acId: 'ac-1'` → admission passes (set semantics; redundant coverage is fine).
    - Test 5 (intent has zero ACs): no ACs declared → admission passes regardless of refs (vacuous coverage).
    - Test 6 (rejection artifact shape): rejected admission produces a no-plan-admitted artifact whose JSON contains `reason: 'ac-coverage-incomplete'` and `missingAcIds` array.
  </behavior>
  <action>
1. Locate the plan admission entry path. Likely `admitCandidatePlans` in `packages/policy/src/admission.ts` or a sibling. Read full file.
2. Add the `checkAcceptanceTestRefsCoverage` helper per `<interfaces>`.
3. Insert call site INSIDE the per-candidate validation loop. Order: existing checks run first; AC coverage runs LAST (so existing parse/structural failures are reported with their original reason taxonomy, not masked by AC failures).
4. Widen the no-plan-admitted reason union to include `"ac-coverage-incomplete"`. Find the union via `grep -rn "no-plan-admitted\\|admission.*reason" packages/policy/src packages/planning/src` and add the new literal.
5. Update rejection-artifact serialization to include `missingAcIds` field when reason is `ac-coverage-incomplete`.
6. Tests cover the 6 behaviors. Use existing admission test fixtures or build minimal inline ConfirmedIntent + ParsedPlan.

**Cross-package edit:** if the `no-plan-admitted` artifact schema lives in `packages/intent/schema/` or `packages/planning/schema/`, bump that schema too (likely a minor JSON schema literal addition: `"ac-coverage-incomplete"` to the reason enum). Read the schema first; add the literal.
  </action>
  <verify>
    <automated>cd /Users/zakkeown/Code/protostar && grep -c 'ac-coverage-incomplete' packages/policy/src/admission.ts && grep -c 'acceptanceTestRefs' packages/policy/src/admission.ts && pnpm --filter @protostar/policy test 2>&1 | tail -10</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c 'ac-coverage-incomplete' packages/policy/src/admission.ts` ≥ 1
    - `grep -c 'acceptanceTestRefs' packages/policy/src/admission.ts` ≥ 1
    - `grep -c 'missingAcIds' packages/policy/src/admission.ts` ≥ 1
    - All 6 tests pass
  </acceptance_criteria>
  <done>Admission rule live; new gate fires for any plan missing AC coverage.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Cascade — update existing passing-plan fixtures with acceptanceTestRefs</name>
  <files>examples/planning-results/**/*.json, packages/admission-e2e/src/**/*.ts, packages/planning/src/**/*.test.ts, packages/policy/src/**/*.test.ts</files>
  <read_first>
    - .planning/phases/05-review-repair-loop/05-CONTEXT.md "Specifics" §"Capability-envelope bump cluster" + "Q-09"
    - .planning/phases/01-intent-planning-admission/01-09-parameterized-admission-e2e-PLAN.md (admission-e2e fixture pattern)
    - examples/planning-results (list current fixtures via `ls examples/planning-results/`)
  </read_first>
  <action>
1. Audit every fixture under `examples/planning-results/` (run `find examples/planning-results -name '*.json' -path '*/good/*'` or `grep -L 'bad' examples/planning-results/*.json`):
   - For each PASSING-PLAN fixture (i.e. one expected to be admitted):
     - Read its companion intent fixture (path follows `examples/intents/<id>.json` convention).
     - For each `acceptanceCriteria[].id` in the intent:
       - Add ≥1 `acceptanceTestRefs` entry to some task in the plan with matching `acId`. Use plausible `testFile` and `testName` values:
         - `testFile`: prefer `<task.targetFiles[0]>.test.ts` or a sibling test path
         - `testName`: descriptive — e.g. `"renders updated button color"` for the cosmetic-tweak fixture

2. Audit `packages/admission-e2e/src/` and `packages/admission-e2e/test-data/` (if exists). Update inline plan fixtures the same way.

3. Update any tests in `packages/planning/src/`, `packages/policy/src/` that build inline plan literals expecting admission to pass.

4. Add ≥1 new BAD fixture under `examples/planning-results/bad/` named `bad-ac-coverage-incomplete.json` — a plan that's structurally valid but misses an AC. The admission-e2e parameterized harness (Plan 01-09) automatically covers it.

5. Run `pnpm run verify:full`; if any test still fails on AC coverage, audit grep `examples/planning-results -name '*.json' | xargs grep -L acceptanceTestRefs` and fix.

**Document the new bad fixture in `examples/planning-results/bad/README.md`** if such a README exists; otherwise add a leading comment to the new JSON file describing the missing AC.
  </action>
  <verify>
    <automated>cd /Users/zakkeown/Code/protostar && find examples/planning-results -name '*.json' -path '*/good/*' 2>/dev/null | xargs grep -L 'acceptanceTestRefs' 2>/dev/null | wc -l | grep -q '^0$' && find examples/planning-results -name 'bad-ac-coverage*' 2>/dev/null | wc -l | awk '{exit ($1 >= 1) ? 0 : 1}' && pnpm run verify:full 2>&1 | tail -20</automated>
  </verify>
  <acceptance_criteria>
    - Every passing-plan fixture under `examples/planning-results/good/` (or wherever) contains the literal `acceptanceTestRefs` field
    - At least one new bad fixture exists matching pattern `bad-ac-coverage*`
    - `pnpm run verify:full` exits 0 (cascade complete; new gate satisfied)
  </acceptance_criteria>
  <done>Fixtures cascade complete; admission gate is fully exercised end-to-end.</done>
</task>

</tasks>

<threat_model>
| Boundary | Description |
|----------|-------------|
| plan admission ↔ AC coverage | structural rule, not heuristic |

| Threat ID | Category | Component | Disposition | Mitigation |
|-----------|----------|-----------|-------------|------------|
| T-05-25 | Tampering | plan slips through with regex-mention AC instead of test ref | mitigate | structural acId match (set membership) — no regex on free text |
| T-05-26 | Denial of Service | existing fixtures break, blocking ship | mitigate | Task 2 cascade updates every passing fixture; verify:full enforces |
</threat_model>

<verification>
- `pnpm run verify:full` green
- No passing-plan fixture missing `acceptanceTestRefs`
- New bad fixture for ac-coverage-incomplete is admitted-rejected
</verification>

<success_criteria>
- AC coverage admission rule live
- Cascade complete; verify:full green
- Bad fixture exists for the new gate
</success_criteria>

<output>
Create `.planning/phases/05-review-repair-loop/05-11-SUMMARY.md`: documents the new rule, the cascade scope (file count touched), and notes that Plan 05-07 (mechanical adapter) verifies the test refs at runtime via diff + stdout match.
</output>
</content>
</invoke>