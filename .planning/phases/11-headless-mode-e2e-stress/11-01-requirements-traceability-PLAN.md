---
phase: 11-headless-mode-e2e-stress
plan: 01
type: execute
wave: 0
depends_on: []
files_modified:
  - .planning/REQUIREMENTS.md
  - .planning/ROADMAP.md
  - .planning/STATE.md
  - .planning/phases/11-headless-mode-e2e-stress/11-VALIDATION.md
autonomous: true
requirements:
  - STRESS-01
must_haves:
  truths:
    - "Phase 11 has STRESS-01 through STRESS-14 requirement rows before implementation begins."
    - "The roadmap lists every Phase 11 plan with wave and dependency information."
    - "The validation map can trace every Phase 11 task to a requirement and verification command."
  artifacts:
    - path: ".planning/REQUIREMENTS.md"
      provides: "Phase 11 STRESS-01..STRESS-14 requirement block and traceability rows"
      contains: "STRESS-14"
    - path: ".planning/ROADMAP.md"
      provides: "Final Phase 11 plan list and wave structure"
      contains: "11-14-ttt-delivery-and-stress-gate-PLAN.md"
    - path: ".planning/phases/11-headless-mode-e2e-stress/11-VALIDATION.md"
      provides: "Nyquist validation map for the final plan set"
      contains: "11-14-01"
  key_links:
    - from: ".planning/REQUIREMENTS.md"
      to: ".planning/ROADMAP.md"
      via: "same STRESS requirement ids"
      pattern: "STRESS-01"
    - from: ".planning/phases/11-headless-mode-e2e-stress/11-VALIDATION.md"
      to: ".planning/phases/11-headless-mode-e2e-stress/*-PLAN.md"
      via: "plan/task identifiers"
      pattern: "11-01-01"
---

<objective>
Create the traceability foundation for Phase 11 before source-code implementation begins.

Purpose: downstream executors and verifiers need stable STRESS requirement ids, plan file names, wave ordering, and validation commands.
Output: updated planning documents only; no runtime source changes.
</objective>

<execution_context>
@/Users/zakkeown/.codex/get-shit-done/workflows/execute-plan.md
@/Users/zakkeown/.codex/get-shit-done/templates/summary.md
</execution_context>

<context>
@AGENTS.md
@.planning/PROJECT.md
@.planning/STATE.md
@.planning/ROADMAP.md
@.planning/REQUIREMENTS.md
@.planning/phases/11-headless-mode-e2e-stress/11-CONTEXT.md
@.planning/phases/11-headless-mode-e2e-stress/11-RESEARCH.md
@.planning/phases/11-headless-mode-e2e-stress/11-VALIDATION.md
@.planning/phases/11-headless-mode-e2e-stress/11-PATTERNS.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add Phase 11 STRESS requirements and traceability rows</name>
  <read_first>
    - .planning/REQUIREMENTS.md
    - .planning/phases/11-headless-mode-e2e-stress/11-RESEARCH.md
    - .planning/phases/11-headless-mode-e2e-stress/11-CONTEXT.md
  </read_first>
  <files>.planning/REQUIREMENTS.md</files>
  <action>
    Add a new `### Phase 11 - Headless Mode + E2E Stress` section immediately after the Phase 10.1 section. Create exactly fourteen unchecked rows:
    `STRESS-01` requirements traceability, `STRESS-02` all-three narrow archetype admission lift, `STRESS-03` per-archetype seed library with TTT feature seed, `STRESS-04` immutable toy verification preflight/refusal, `STRESS-05` headless mode config and CLI selection, `STRESS-06` LLM backend selector while preserving LM Studio default, `STRESS-07` deterministic mock backend, `STRESS-08` hosted OpenAI-compatible backend, `STRESS-09` bounded `pnpm add` allowlist, `STRESS-10` stress report schema plus append-only event artifacts, `STRESS-11` shared stress session core, `STRESS-12` sustained-load bash driver, `STRESS-13` TypeScript concurrency/fault driver, and `STRESS-14` CI/headless/security and final TTT plus stress gate.
    Add matching rows to the `## Traceability` table with Phase `Phase 11` and Status `Pending`. Do not edit Phase 12 rows or artifacts.
  </action>
  <verify>
    <automated>rg -n "STRESS-01|STRESS-14|Phase 11 - Headless Mode \\+ E2E Stress" .planning/REQUIREMENTS.md</automated>
  </verify>
  <acceptance_criteria>
    - `.planning/REQUIREMENTS.md` contains exactly one Phase 11 section.
    - `rg "STRESS-(0[1-9]|1[0-4])" .planning/REQUIREMENTS.md` returns all fourteen ids in the requirement block and traceability table.
    - No `POST-06`, `POST-07`, or `POST-08` deferred rows are edited; Phase 11 owns the lift.
  </acceptance_criteria>
</task>

<task type="auto">
  <name>Task 2: Finalize roadmap and validation map for the 15-plan dependency graph</name>
  <read_first>
    - .planning/ROADMAP.md
    - .planning/STATE.md
    - .planning/phases/11-headless-mode-e2e-stress/11-VALIDATION.md
    - .planning/phases/11-headless-mode-e2e-stress/11-PATTERNS.md
  </read_first>
  <files>.planning/ROADMAP.md, .planning/STATE.md, .planning/phases/11-headless-mode-e2e-stress/11-VALIDATION.md</files>
  <action>
    Replace Phase 11's tentative requirements note with `**Requirements:** STRESS-01, STRESS-02, STRESS-03, STRESS-04, STRESS-05, STRESS-06, STRESS-07, STRESS-08, STRESS-09, STRESS-10, STRESS-11, STRESS-12, STRESS-13, STRESS-14`.
    Set `**Plans:** 15 plans across 8 waves` and list these files with their wave/deps:
    W0 `11-01-requirements-traceability-PLAN.md`;
    W1 `11-02-archetype-admission-lift-PLAN.md`, `11-04-immutable-toy-verification-PLAN.md`, `11-05-headless-mode-config-cli-PLAN.md`, `11-08-stress-artifact-schema-and-events-PLAN.md`;
    W2 `11-03-seed-library-ttt-PLAN.md`, `11-06-llm-backend-selection-PLAN.md`, `11-12-pnpm-add-allowlist-PLAN.md` (depends on 11-02 and 11-04 so feature-add `pnpm.allowedAdds` admission reuses immutable toy-file refusal);
    W3 `11-07-hosted-and-mock-adapters-PLAN.md`, `11-09-stress-session-core-PLAN.md` (depends on 11-06 and 11-08 to serialize `apps/factory-cli/src/main.ts`);
    W4 `11-15-mock-adapter-selector-wiring-PLAN.md`;
    W5 `11-10-sustained-load-bash-driver-PLAN.md`, `11-11-concurrency-fault-ts-driver-PLAN.md`;
    W6 `11-13-ci-headless-security-gates-PLAN.md`;
    W7 `11-14-ttt-delivery-and-stress-gate-PLAN.md`.
    Update the Phase 11 row in `.planning/STATE.md` from discuss/planning-in-progress to planned with these 15 plans. In `11-VALIDATION.md`, ensure the per-task map references the exact plan filenames above and keeps `nyquist_compliant: true`.
  </action>
  <verify>
    <automated>rg -n "11-01-requirements-traceability-PLAN.md|11-15-mock-adapter-selector-wiring-PLAN.md|11-14-ttt-delivery-and-stress-gate-PLAN.md|15 plans across 8 waves" .planning/ROADMAP.md .planning/STATE.md .planning/phases/11-headless-mode-e2e-stress/11-VALIDATION.md</automated>
  </verify>
  <acceptance_criteria>
    - `.planning/ROADMAP.md` Phase 11 names all fifteen required plan files.
    - The roadmap dependency list contains no Phase 12 plan file names.
    - `.planning/STATE.md` states Phase 11 is planned and does not mark it executed or verified.
  </acceptance_criteria>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| planner docs -> executors | Plan and requirement ids direct source-code mutation in later waves. |
| roadmap -> phase runner | Wave/dependency metadata determines execution order. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-11-01 | Tampering | `.planning/ROADMAP.md` plan graph | mitigate | Pin exact filenames, waves, and deps so executor does not run final gates before foundations. |
| T-11-02 | Repudiation | `.planning/REQUIREMENTS.md` trace table | mitigate | Add every STRESS id to both requirements and traceability rows before implementation. |
| T-11-03 | Denial of Service | CI/headless planning | mitigate | Plan 11-13 must add no-interactive-prompt contracts; this trace plan records STRESS-14 as required. |
| T-11-04 | Tampering | delivery authority | mitigate | Keep DELIVER-07 no-merge invariant in Phase 11 final gates; no plan may introduce merge/update-branch authority. |
</threat_model>

<verification>
Run `rg -n "STRESS-14|11-14-ttt-delivery-and-stress-gate-PLAN.md" .planning/REQUIREMENTS.md .planning/ROADMAP.md .planning/phases/11-headless-mode-e2e-stress/11-VALIDATION.md`.
Schema push: not applicable; this plan introduces no ORM/database schema files.
</verification>

<success_criteria>
Phase 11 traceability is complete: all fourteen STRESS ids exist, all fifteen plan files are listed, and validation references the final dependency graph.
</success_criteria>

<output>
After completion, create `.planning/phases/11-headless-mode-e2e-stress/11-01-SUMMARY.md`.
</output>
