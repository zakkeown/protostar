---
phase: 11-headless-mode-e2e-stress
plan: 02
type: execute
wave: 1
depends_on:
  - 11-01
files_modified:
  - .planning/PROJECT.md
  - packages/intent/src/archetypes.ts
  - packages/intent/src/admission-paths.ts
  - packages/intent/src/capability-admission.ts
  - packages/intent/src/capability-envelope.ts
  - packages/intent/src/archetype-intent-fixtures.test.ts
  - packages/intent/src/capability-envelope-repair-loop-count.test.ts
  - packages/policy/src/archetypes/index.ts
  - packages/admission-e2e/src/parameterized-admission.test.ts
autonomous: true
requirements:
  - STRESS-02
must_haves:
  truths:
    - "Feature-add, bugfix, and refactor are wired admission archetypes, not unsupported stubs."
    - "Cosmetic-tweak remains additive and unchanged for Phase 10 compatibility."
    - "Per-archetype repair-loop caps remain iteration-count based."
  artifacts:
    - path: "packages/intent/src/archetypes.ts"
      provides: "wired policy rows and registry entries"
      contains: "feature-add"
    - path: "packages/intent/src/capability-admission.ts"
      provides: "grant-producing admission functions for non-cosmetic archetypes"
      contains: "admitFeatureAddCapabilityEnvelope"
    - path: ".planning/PROJECT.md"
      provides: "Phase 11 lock revision removing non-cosmetic archetypes from out-of-scope"
      contains: "Phase 11 archetype lift"
  key_links:
    - from: "packages/intent/src/archetypes.ts"
      to: "packages/intent/src/capability-admission.ts"
      via: "GOAL_ARCHETYPE_POLICY_TABLE caps consumed by admission"
      pattern: "maxRepairLoops"
    - from: "packages/intent/src/admission-paths.ts"
      to: "packages/admission-e2e/src/parameterized-admission.test.ts"
      via: "unsupported-goal-archetype no longer emitted for wired archetypes"
      pattern: "unsupported-goal-archetype"
---

<objective>
Lift Phase 11 admission beyond cosmetic-tweak by wiring `feature-add`, `bugfix`, and `refactor` as narrow supported archetypes.

Purpose: TTT delivery and mixed-seed stress both require real non-cosmetic admission while preserving Phase 10's cosmetic path.
Output: updated intent admission policy, capability grants, tests, and project lock revision.
</objective>

<execution_context>
@/Users/zakkeown/.codex/get-shit-done/workflows/execute-plan.md
@/Users/zakkeown/.codex/get-shit-done/templates/summary.md
</execution_context>

<context>
@AGENTS.md
@.planning/PROJECT.md
@.planning/phases/11-headless-mode-e2e-stress/11-CONTEXT.md
@.planning/phases/11-headless-mode-e2e-stress/11-RESEARCH.md
@.planning/phases/11-headless-mode-e2e-stress/11-PATTERNS.md
@packages/intent/src/archetypes.ts
@packages/intent/src/admission-paths.ts
@packages/intent/src/capability-admission.ts
@packages/intent/src/capability-envelope.ts
@packages/policy/src/archetypes/index.ts
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Pin non-cosmetic admission behavior before implementation</name>
  <read_first>
    - packages/intent/src/archetype-intent-fixtures.test.ts
    - packages/intent/src/capability-envelope-repair-loop-count.test.ts
    - packages/admission-e2e/src/parameterized-admission.test.ts
    - .planning/phases/11-headless-mode-e2e-stress/11-RESEARCH.md
  </read_first>
  <files>packages/intent/src/archetype-intent-fixtures.test.ts, packages/intent/src/capability-envelope-repair-loop-count.test.ts, packages/admission-e2e/src/parameterized-admission.test.ts</files>
  <action>
    Add failing tests first. Assert `INTENT_ARCHETYPE_REGISTRY["feature-add"].supported`, `["bugfix"].supported`, and `["refactor"].supported` are `true`; assert `supportStatus: "supported"` and `capabilityCapStatus: "wired"`.
    Add capability-envelope tests for exact caps: `cosmetic-tweak.maxRepairLoops <= 1` remains accepted and `2` remains refused unless existing code already changed it; `feature-add.maxRepairLoops <= 9`, `bugfix <= 5`, and `refactor <= 5` are accepted; one over each cap is refused with repair-loop-count evidence.
    Add admission-e2e fixtures or cases that prove these three archetypes no longer produce `unsupported-goal-archetype`. Do not add `factory-scaffold` support.
  </action>
  <verify>
    <automated>pnpm --filter @protostar/intent test</automated>
  </verify>
  <acceptance_criteria>
    - Tests fail before source changes because feature-add/bugfix/refactor are still stubs.
    - Test names include `feature-add`, `bugfix`, `refactor`, and exact cap values `9` and `5`.
    - No test changes modify Phase 10 cosmetic seed expectations.
  </acceptance_criteria>
</task>

<task type="auto">
  <name>Task 2: Wire feature-add, bugfix, and refactor admission paths</name>
  <read_first>
    - packages/intent/src/archetypes.ts
    - packages/intent/src/admission-paths.ts
    - packages/intent/src/capability-admission.ts
    - packages/intent/src/capability-envelope.ts
    - packages/policy/src/archetypes/index.ts
  </read_first>
  <files>packages/intent/src/archetypes.ts, packages/intent/src/admission-paths.ts, packages/intent/src/capability-admission.ts, packages/intent/src/capability-envelope.ts, packages/policy/src/archetypes/index.ts</files>
  <action>
    In `GOAL_ARCHETYPE_POLICY_TABLE`, change `feature-add`, `bugfix`, and `refactor` from `status: "stub"` to `status: "wired"`.
    Set exact caps: feature-add `timeoutMs: 900_000`, `repair_loop_count: 9`, `budgetCaps.maxRepairLoops: 9`; bugfix `timeoutMs: 600_000`, `repair_loop_count: 5`, `budgetCaps.maxRepairLoops: 5`; refactor `timeoutMs: 600_000`, `repair_loop_count: 5`, `budgetCaps.maxRepairLoops: 5`. Preserve cosmetic-tweak's existing cap and rationale.
    In `INTENT_ARCHETYPE_REGISTRY`, set these three rows to `supportStatus: "supported"`, `supported: true`, and `capabilityCapStatus: "wired"`.
    Replace unconditional unsupported findings in `featureAddAdmissionPathFindings`, `bugfixAdmissionPathFindings`, and `refactorAdmissionPathFindings` with positive path findings that mirror cosmetic-tweak severity/shape and do not emit `unsupported-goal-archetype` when the policy row is wired.
    Add exported grant functions `admitFeatureAddCapabilityEnvelope`, `admitBugfixCapabilityEnvelope`, and `admitRefactorCapabilityEnvelope` using the same normalization and validation pipeline as `admitCosmeticTweakCapabilityEnvelope`; the `source` literals must be `feature-add-policy-admission`, `bugfix-policy-admission`, and `refactor-policy-admission`.
    If hidden coupling makes all-three wiring exceed the plan context budget, stop with a blocking checkpoint and evidence listing the extra files; do not silently switch to feature-add-only.
  </action>
  <verify>
    <automated>pnpm --filter @protostar/intent test && pnpm --filter @protostar/admission-e2e test</automated>
  </verify>
  <acceptance_criteria>
    - `rg -n 'supportStatus: "unsupported"|status: "stub"' packages/intent/src/archetypes.ts` shows no matches for feature-add, bugfix, or refactor rows.
    - `rg -n 'feature-add-policy-admission|bugfix-policy-admission|refactor-policy-admission' packages/intent/src/capability-admission.ts` finds all three source literals.
    - `factory-scaffold` remains unsupported/stubbed.
  </acceptance_criteria>
</task>

<task type="auto">
  <name>Task 3: Record the Phase 11 archetype lift lock revision</name>
  <read_first>
    - .planning/PROJECT.md
    - .planning/phases/11-headless-mode-e2e-stress/11-CONTEXT.md
  </read_first>
  <files>.planning/PROJECT.md</files>
  <action>
    In `.planning/PROJECT.md`, revise the Out of Scope entry that says non-cosmetic archetypes are out of scope for v0.1. Add a dated lock revision `Phase 11 archetype lift (2026-04-29)` stating that `feature-add`, `bugfix`, and `refactor` are wired with caps `9`, `5`, and `5`, respectively; `factory-scaffold` remains out of scope; Phase 10 cosmetic dogfood artifacts remain unchanged.
  </action>
  <verify>
    <automated>rg -n "Phase 11 archetype lift|feature-add.*9|bugfix.*5|refactor.*5|factory-scaffold" .planning/PROJECT.md</automated>
  </verify>
  <acceptance_criteria>
    - PROJECT.md no longer says feature-add, bugfix, and refactor are post-v1 deferred.
    - PROJECT.md explicitly says Phase 10 cosmetic dogfood remains unchanged.
  </acceptance_criteria>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| draft intent -> capability grant | Untrusted operator-authored archetype claims become executable capability envelopes. |
| policy table -> execution budget | Repair-loop caps constrain later execution/repair loops. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-11-05 | Elevation of Privilege | `packages/intent/src/capability-admission.ts` | mitigate | Grant only exact wired archetypes; keep `factory-scaffold` unsupported; tests assert unsupported archetypes still block. |
| T-11-06 | Denial of Service | repair-loop caps | mitigate | Keep iteration-count caps: feature-add 9, bugfix/refactor 5, cosmetic existing cap; over-cap tests must fail admission. |
| T-11-07 | Tampering | Phase 10 cosmetic path | mitigate | Preserve existing cosmetic rows and seed expectations; this is additive per Q-07. |
| T-11-08 | Repudiation | PROJECT.md lock revision | mitigate | Record the exact dated lock revision so future agents cannot treat non-cosmetic support as deferred. |
</threat_model>

<verification>
Run `pnpm --filter @protostar/intent test`, `pnpm --filter @protostar/admission-e2e test`, and `pnpm run verify`.
Schema push: not applicable; this plan introduces no ORM/database schema files.
</verification>

<success_criteria>
All three selected non-cosmetic archetypes are wired, tested, and documented; cosmetic-tweak and factory-scaffold boundaries remain explicit.
</success_criteria>

<output>
After completion, create `.planning/phases/11-headless-mode-e2e-stress/11-02-SUMMARY.md`.
</output>
