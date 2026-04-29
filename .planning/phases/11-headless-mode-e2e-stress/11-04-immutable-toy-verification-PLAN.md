---
phase: 11-headless-mode-e2e-stress
plan: 04
type: execute
wave: 1
depends_on:
  - 11-01
files_modified:
  - packages/planning/src/immutable-target-files.ts
  - packages/planning/src/immutable-target-files.test.ts
  - packages/planning/src/index.ts
  - apps/factory-cli/src/toy-verification-preflight.ts
  - apps/factory-cli/src/toy-verification-preflight.test.ts
  - packages/admission-e2e/src/immutable-toy-verification.contract.test.ts
  - .planning/phases/11-headless-mode-e2e-stress/11-TOY-VERIFICATION-GATE.md
autonomous: false
requirements:
  - STRESS-04
must_haves:
  truths:
    - "Factory-generated plans cannot target `e2e/**` in the toy repo."
    - "Factory-generated plans cannot target `tests/ttt-state.property.test.ts` in the toy repo."
    - "TTT delivery refuses to start if immutable verification files are absent."
    - "Operator-authored toy verification files are confirmed before final TTT delivery."
  artifacts:
    - path: "packages/planning/src/immutable-target-files.ts"
      provides: "pure target-file refusal helper"
      contains: "immutable-target-file"
    - path: "apps/factory-cli/src/toy-verification-preflight.ts"
      provides: "orchestration preflight for required toy repo files"
      contains: "e2e/ttt.spec.ts"
    - path: "packages/admission-e2e/src/immutable-toy-verification.contract.test.ts"
      provides: "cross-package pin that immutable verification cannot be modified"
      contains: "tests/ttt-state.property.test.ts"
    - path: ".planning/phases/11-headless-mode-e2e-stress/11-TOY-VERIFICATION-GATE.md"
      provides: "operator-authored toy verification evidence gate"
      contains: "../protostar-toy-ttt/e2e/ttt.spec.ts"
  key_links:
    - from: "packages/planning/src/index.ts"
      to: "packages/planning/src/immutable-target-files.ts"
      via: "planning admission violation"
      pattern: "immutable-target-file"
    - from: "apps/factory-cli/src/toy-verification-preflight.ts"
      to: "../protostar-toy-ttt"
      via: "preflight existence check before TTT run"
      pattern: "ttt.spec.ts"
---

<objective>
Make toy repo verification files an immutable Wave 1 gate.

Purpose: Phase 11 can only prove TTT delivery if Playwright and property tests are operator-authored on toy `main` and immune to factory edits.
Output: pure planning refusal helper, factory-cli preflight, admission-e2e contract, and a non-autonomous operator verification gate artifact.
</objective>

<execution_context>
@/Users/zakkeown/.codex/get-shit-done/workflows/execute-plan.md
@/Users/zakkeown/.codex/get-shit-done/templates/summary.md
</execution_context>

<context>
@AGENTS.md
@.planning/phases/11-headless-mode-e2e-stress/11-CONTEXT.md
@.planning/phases/11-headless-mode-e2e-stress/11-RESEARCH.md
@.planning/phases/11-headless-mode-e2e-stress/11-PATTERNS.md
@packages/planning/src/index.ts
@packages/planning/src/admit-work-slicing.ts
@apps/factory-cli/src/delivery-preflight-wiring.ts
@packages/admission-e2e/src/delivery-no-merge-repo-wide.contract.test.ts
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add immutable target-file admission tests</name>
  <read_first>
    - packages/planning/src/index.ts
    - packages/planning/src/admit-work-slicing.ts
    - packages/admission-e2e/src/admitted-plan-handoff.contract.test.ts
  </read_first>
  <files>packages/planning/src/immutable-target-files.test.ts, apps/factory-cli/src/toy-verification-preflight.test.ts, packages/admission-e2e/src/immutable-toy-verification.contract.test.ts</files>
  <action>
    Add tests for a pure helper `validateImmutableTargetFiles({ targetFiles, immutableGlobs })`.
    Required immutable patterns are exactly `e2e/**` and `tests/ttt-state.property.test.ts`.
    Assert `src/App.tsx` and `src/components/Board.tsx` pass; `e2e/ttt.spec.ts`, `e2e/helpers/play-game.ts`, and `tests/ttt-state.property.test.ts` fail with code `immutable-target-file`.
    Add factory-cli preflight tests for `assertToyVerificationPreflight` with both files present, one missing, both missing, and normalized path output.
    Add an admission-e2e contract that constructs a candidate task with `targetFiles` containing those forbidden paths and asserts the planning admission artifact includes `immutable-target-file`.
  </action>
  <verify>
    <automated>pnpm --filter @protostar/planning test && pnpm --filter @protostar/factory-cli test -- --test-name-pattern "toy verification|immutable" && pnpm --filter @protostar/admission-e2e test</automated>
  </verify>
  <acceptance_criteria>
    - Tests fail before the helper is implemented.
    - The literal code `immutable-target-file` appears in tests.
    - No toy repo files under `../protostar-toy-ttt` are modified by this plan.
  </acceptance_criteria>
</task>

<task type="auto">
  <name>Task 2: Implement immutable target-file refusal and toy preflight</name>
  <read_first>
    - packages/planning/src/index.ts
    - packages/planning/src/immutable-target-files.test.ts
    - apps/factory-cli/src/toy-verification-preflight.test.ts
    - .planning/phases/11-headless-mode-e2e-stress/11-CONTEXT.md
  </read_first>
  <files>packages/planning/src/immutable-target-files.ts, packages/planning/src/index.ts, apps/factory-cli/src/toy-verification-preflight.ts, apps/factory-cli/src/toy-verification-preflight.test.ts</files>
  <action>
    Create `packages/planning/src/immutable-target-files.ts` exporting `IMMUTABLE_TOY_VERIFICATION_PATTERNS` with `["e2e/**", "tests/ttt-state.property.test.ts"]` and `validateImmutableTargetFiles`.
    Match `e2e/**` using POSIX-style normalized paths only; reject backslash-normalized equivalents too. Return violations with `{ code: "immutable-target-file", path, message }`.
    Call this helper from planning admission wherever task `targetFiles` are validated. Do not make it toy-repo-specific by workspace path; it is a target-file invariant for Phase 11 TTT plans.
    Re-export public types only if existing planning export patterns require it.
    Create `assertToyVerificationPreflight` with injected `exists(path: string): Promise<boolean>` and required files exactly `["e2e/ttt.spec.ts", "tests/ttt-state.property.test.ts"]`.
    Return `{ ok: true, files }` when both exist. Return `{ ok: false, code: "toy-verification-missing", missingFiles }` when any file is absent. The helper must not write files and must not shell out; callers may adapt it to local fs or `gh api` later.
  </action>
  <verify>
    <automated>pnpm --filter @protostar/planning test && pnpm --filter @protostar/factory-cli test -- --test-name-pattern "toy verification|immutable" && pnpm --filter @protostar/admission-e2e test</automated>
  </verify>
  <acceptance_criteria>
    - `rg -n "IMMUTABLE_TOY_VERIFICATION_PATTERNS|immutable-target-file" packages/planning/src` finds implementation and tests.
    - Planning tests prove `e2e/**` and `tests/ttt-state.property.test.ts` are refused before execution.
    - Factory-cli tests cover missing-file refusal without depending on `../protostar-toy-ttt` existing locally.
  </acceptance_criteria>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 3: Confirm operator-authored toy verification files before final delivery</name>
  <read_first>
    - .planning/phases/11-headless-mode-e2e-stress/11-CONTEXT.md
    - apps/factory-cli/src/toy-verification-preflight.ts
  </read_first>
  <files>.planning/phases/11-headless-mode-e2e-stress/11-TOY-VERIFICATION-GATE.md</files>
  <action>
    Pause after the automated immutable-path and preflight code passes. The operator must author or confirm the toy repo files outside factory-generated plans: `../protostar-toy-ttt/e2e/ttt.spec.ts` and `../protostar-toy-ttt/tests/ttt-state.property.test.ts`.
    The agent may inspect and run verification commands, but must not create, edit, overwrite, or patch those two toy repo files. If either file is absent, stop and ask the operator to create it manually in the toy repo.
    After the files exist, create `.planning/phases/11-headless-mode-e2e-stress/11-TOY-VERIFICATION-GATE.md` recording the toy repo path, current HEAD SHA if available, file paths, commands run, and pass/fail results. This gate artifact is a prerequisite for Plan 11-14 final TTT delivery.
  </action>
  <verify>
    <automated>test -f ../protostar-toy-ttt/e2e/ttt.spec.ts && test -f ../protostar-toy-ttt/tests/ttt-state.property.test.ts && rg -n "e2e/ttt.spec.ts|tests/ttt-state.property.test.ts|operator-authored" .planning/phases/11-headless-mode-e2e-stress/11-TOY-VERIFICATION-GATE.md</automated>
  </verify>
  <what-built>Planning admission refuses edits to immutable toy verification paths, and factory-cli has a preflight helper that refuses missing verification files.</what-built>
  <how-to-verify>
    1. From the Protostar repo, run `test -f ../protostar-toy-ttt/e2e/ttt.spec.ts && test -f ../protostar-toy-ttt/tests/ttt-state.property.test.ts`.
    2. From `../protostar-toy-ttt`, run the toy repo Playwright/property commands documented in its package scripts or CI workflow.
    3. Confirm `11-TOY-VERIFICATION-GATE.md` records both files as operator-authored and passing.
  </how-to-verify>
  <resume-signal>Type "approved" after the gate artifact records both files and passing commands, or describe the missing/failing toy verification item.</resume-signal>
  <acceptance_criteria>
    - `../protostar-toy-ttt/e2e/ttt.spec.ts` and `../protostar-toy-ttt/tests/ttt-state.property.test.ts` exist before Plan 11-14 runs final delivery.
    - `11-TOY-VERIFICATION-GATE.md` records that those files are operator-authored and not factory-generated.
    - No factory-generated plan edits either immutable toy verification file.
  </acceptance_criteria>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| generated plan -> target repo | Model-generated targetFiles could attempt to weaken verification. |
| factory-cli preflight -> external toy repo | Local/GitHub checks determine whether TTT delivery may start. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-11-13 | Tampering | `e2e/**` and property tests | mitigate | Planning admission refuses those targetFiles before execution. |
| T-11-14 | Repudiation | TTT delivery evidence | mitigate | Preflight returns structured `toy-verification-missing` with exact missing files; blocking checkpoint records operator-authored file evidence before final delivery. |
| T-11-15 | Elevation of Privilege | factory-generated plans | mitigate | Refusal is pure planning logic, not an executor convention. |
| T-11-16 | Tampering | accidental merge/update-branch authority | mitigate | This plan only adds preflight/admission checks and no delivery merge code. |
</threat_model>

<verification>
Run `pnpm --filter @protostar/planning test`, `pnpm --filter @protostar/factory-cli test`, `pnpm --filter @protostar/admission-e2e test`, `test -f ../protostar-toy-ttt/e2e/ttt.spec.ts && test -f ../protostar-toy-ttt/tests/ttt-state.property.test.ts`, and `pnpm run verify`.
Schema push: not applicable; this plan introduces no ORM/database schema files.
</verification>

<success_criteria>
The factory cannot edit the operator-authored toy verification files, TTT delivery can refuse early when those files are absent, and a blocking evidence gate confirms those files exist before final delivery.
</success_criteria>

<output>
After completion, create `.planning/phases/11-headless-mode-e2e-stress/11-04-SUMMARY.md`.
</output>
