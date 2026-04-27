---
phase: 01-intent-planning-admission
plan: 03
subsystem: examples-fixtures
tags: [fixtures, admission, refactor]
requires: []
provides:
  - examples/intents/bad/
  - examples/planning-results/bad/
affects:
  - packages/policy/src/example-intent-fixtures.test.ts
  - packages/planning/src/pre-handoff-verification-admission.test.ts
  - apps/factory-cli/src/main.test.ts
tech-stack:
  added: []
  patterns: [directory-as-manifest]
key-files:
  created:
    - examples/intents/bad/missing-capability.json
    - examples/intents/bad/missing-capability.ambiguity.brownfield.json
    - examples/planning-results/bad/capability-envelope-expansion.json
    - examples/planning-results/bad/cyclic-plan-graph.json
    - examples/planning-results/bad/missing-acceptance-coverage.json
    - examples/planning-results/bad/missing-dependency.json
    - examples/planning-results/bad/missing-pr-write-verification.json
    - examples/planning-results/bad/unknown-acceptance-criterion.json
  modified:
    - packages/policy/src/example-intent-fixtures.test.ts
    - packages/planning/src/pre-handoff-verification-admission.test.ts
    - apps/factory-cli/src/main.test.ts
decisions:
  - "Use git mv (renames) so fixture history follows the move; verified via git status R prefix"
  - "Directory layout becomes the manifest per Q-06 — Plan 09 will codify enforcement"
metrics:
  duration: ~5min
  completed: 2026-04-26
  tasks: 2
  commits: 2
requirements: [INTENT-01, PLAN-A-02]
---

# Phase 1 Plan 03: Bad Fixture Relocation Summary

Moved 8 intentionally-bad fixtures into `examples/**/bad/` subdirectories and stripped the `bad-` prefix; updated 6 path references across 3 test files. The fixture directory is now the manifest — Plan 09's parameterized e2e admission test can discover bad fixtures by directory walk.

## Relocated Files (8)

All moved with `git mv` (history-preserving renames, verified via `git show --stat` showing `rename` lines with 100% similarity).

| Old Path | New Path |
|----------|----------|
| `examples/intents/bad-missing-capability.json` | `examples/intents/bad/missing-capability.json` |
| `examples/intents/bad-missing-capability.ambiguity.brownfield.json` | `examples/intents/bad/missing-capability.ambiguity.brownfield.json` |
| `examples/planning-results/bad-capability-envelope-expansion.json` | `examples/planning-results/bad/capability-envelope-expansion.json` |
| `examples/planning-results/bad-cyclic-plan-graph.json` | `examples/planning-results/bad/cyclic-plan-graph.json` |
| `examples/planning-results/bad-missing-acceptance-coverage.json` | `examples/planning-results/bad/missing-acceptance-coverage.json` |
| `examples/planning-results/bad-missing-dependency.json` | `examples/planning-results/bad/missing-dependency.json` |
| `examples/planning-results/bad-missing-pr-write-verification.json` | `examples/planning-results/bad/missing-pr-write-verification.json` |
| `examples/planning-results/bad-unknown-acceptance-criterion.json` | `examples/planning-results/bad/unknown-acceptance-criterion.json` |

File contents byte-identical (rename similarity 100%).

## Edited Test Files

### `packages/policy/src/example-intent-fixtures.test.ts`
- Lines 17–18: `"bad-missing-capability.ambiguity.brownfield.json"` → `"bad/missing-capability.ambiguity.brownfield.json"`; `"bad-missing-capability.json"` → `"bad/missing-capability.json"` (in `REQUIRED_EXAMPLE_INTENT_FIXTURES`).

### `packages/planning/src/pre-handoff-verification-admission.test.ts`
- Line 147: `"../../../examples/planning-results/bad-missing-pr-write-verification.json"` → `"../../../examples/planning-results/bad/missing-pr-write-verification.json"` (in `missingPrWriteVerificationFixtureUrl`).

### `apps/factory-cli/src/main.test.ts`
- Lines 33–37: three path constants updated:
  - `missingAcceptanceCoveragePlanningFixtureRelativePath` → `examples/planning-results/bad/missing-acceptance-coverage.json`
  - `cyclicPlanningFixtureRelativePath` → `examples/planning-results/bad/cyclic-plan-graph.json`
  - `authorityExpansionPlanningFixtureRelativePath` → `examples/planning-results/bad/capability-envelope-expansion.json`

## Verification

- `ls examples/intents/bad-*.json` → no matches (0).
- `ls examples/planning-results/bad-*.json` → no matches (0).
- Repo-wide grep for `bad-missing|bad-cyclic|bad-capability|bad-unknown|examples/(planning-results|intents)/bad-` under `packages/`, `apps/`, excluding `dist`/`node_modules` → 0 hits.
- `pnpm --filter @protostar/policy test` → **57/57 pass**.
- `pnpm --filter @protostar/factory-cli test` → **25/25 pass**.
- `pnpm --filter @protostar/planning test` → **116/121 pass**; the 5 failures are the pre-existing `persistAdmissionArtifact` / `assertAdmittedPlanFromPlanningPileResult` export bugs flagged in the spawn note as downstream concerns. The relocated test (`PlanGraph pre-handoff verification admission boundary`) passes.

## Commits

| Commit | Subject |
|--------|---------|
| `5b329a2` | `chore(01-03): relocate bad fixtures into bad/ subdirs` |
| `309afa0` | `test(01-03): update fixture path references to bad/ subdirs` |

## Deviations from Plan

None. Plan executed exactly as written.

One process note: the first attempt at the Task 1 commit only staged the new paths (the path-spec list passed to `git commit` did not match the deletion side of the renames). I amended the same commit with `git add -u` so the commit shows up as 8 renames in history (verified via `git show --stat`). No semantic deviation — same single commit, same content.

## Self-Check: PASSED

- FOUND: examples/intents/bad/missing-capability.json
- FOUND: examples/intents/bad/missing-capability.ambiguity.brownfield.json
- FOUND: examples/planning-results/bad/capability-envelope-expansion.json
- FOUND: examples/planning-results/bad/cyclic-plan-graph.json
- FOUND: examples/planning-results/bad/missing-acceptance-coverage.json
- FOUND: examples/planning-results/bad/missing-dependency.json
- FOUND: examples/planning-results/bad/missing-pr-write-verification.json
- FOUND: examples/planning-results/bad/unknown-acceptance-criterion.json
- FOUND: 5b329a2
- FOUND: 309afa0
