---
phase: 01-intent-planning-admission
plan: 01
subsystem: build/verify
tags: [verify, scripts, ci, package.json]
requires: []
provides:
  - "Tiered verify scripts: `pnpm run verify` (fast) and `pnpm run verify:full` (recursive all-packages)"
affects:
  - "Enables PLAN-A-03 (every package's tests covered)"
  - "Prerequisite for Plan 01-10 (.github/workflows/verify.yml)"
tech-stack:
  added: []
  patterns:
    - "`pnpm -r test` for recursive workspace test execution"
key-files:
  created: []
  modified:
    - path: package.json
      change: "Added `verify:full` script alongside existing fast `verify`"
decisions:
  - "Kept existing fast `verify` (typecheck + intent + factory-cli) verbatim per Q-01 — local iteration stays sub-30s"
  - "Did NOT modify any production or test code in Task 2 — per plan, smoke run is purely diagnostic"
metrics:
  duration_minutes: 3
  tasks_completed: 2
  files_modified: 1
  completed_date: 2026-04-27
---

# Phase 01 Plan 01: Tiered Verify Scripts Summary

**One-liner:** Added `pnpm run verify:full` (typecheck + `pnpm -r test`) alongside the existing fast `verify`, closing the silent-coverage gap flagged in CONCERNS.md and unblocking Phase 1 CI (Plan 01-10).

## What Changed

Root `package.json` now has two verify lanes:

- `verify` (fast, unchanged): `pnpm run typecheck && pnpm --filter @protostar/intent test && pnpm --filter @protostar/factory-cli test` — local iteration loop.
- `verify:full` (new, CI/pre-merge): `pnpm run typecheck && pnpm -r test` — recurses into every workspace member with a `test` script. Adding a new package auto-joins this gate.

No new dependencies, no test framework change. Each package keeps the existing `pnpm run build && node --test dist/*.test.js` runner pattern.

## Tasks Completed

| # | Name                                                    | Commit  |
| - | ------------------------------------------------------- | ------- |
| 1 | Replace `verify` with tiered scripts in root package.json | 97b7cea |
| 2 | Smoke-run `verify:full` against current tree (diagnostic; no code changes) | (no commit — by design) |

## Verify:full Smoke-Run Outcome (Task 2)

- **Exit code:** `1`
- **Status:** RED — pre-existing contract regressions in `@protostar/planning` (NOT a `@dogpile/sdk` link issue).
- **Scope reached:** `pnpm -r test` ran across 11 of 12 workspace projects but halted on first failure. Tests executed for `@protostar/intent` (passed), `@protostar/policy` (passed), `@protostar/planning` (FAILED). Other packages (factory-cli, dogpile-adapter, etc.) were not reached due to fail-fast.

### Failing Tests in `@protostar/planning`

1. **`dist/admission-persistence.test.js`** (not ok 2)
   - Error: `SyntaxError: The requested module '@protostar/planning/artifacts' does not provide an export named 'persistAdmissionArtifact'`
   - The test imports `persistAdmissionArtifact` from the package's `artifacts` subpath export, but that symbol is not exported from the public split.

2. **`dist/dogpile-admitted-plan-entry-point.test.js`** (not ok 11)
   - Error: `SyntaxError: The requested module '@protostar/planning/schema' does not provide an export named 'assertAdmittedPlanFromPlanningPileResult'`
   - Same shape: a contract test imports a symbol the public split does not expose.

Both failures are exactly the kind of regression the new gate is meant to surface — they are silently uncovered by the current filtered `verify`.

### `@dogpile/sdk` Link Status

The smoke run did not surface the `@dogpile/sdk` link risk flagged in CONCERNS.md and CONTEXT.md, because `pnpm -r test` halted at `packages/planning` before reaching `packages/dogpile-adapter`. The link risk remains real for CI (Plan 01-10) — the sibling repo at `../../../dogpile` must be present for `pnpm install --frozen-lockfile` to succeed. **Plan 01-02 (dogpile-types shim) is still required and must land before Plan 01-10's GH Actions workflow can be green.**

## Downstream Plan Implications

- **Plan 01-02 (`@dogpile/sdk` link):** Still mandatory before Plan 01-10. This smoke run did not exonerate the link risk; it only deferred discovery.
- **Plan 01-06 / 01-07 (branded ConfirmedIntent / AdmittedPlan):** The two failing planning tests touch `assertAdmittedPlanFromPlanningPileResult` and `persistAdmissionArtifact` — both adjacent to the admission-handoff surface these plans will brand. The fix MAY land naturally as part of Plan 01-07's public-surface work, OR may need a small dedicated fix beforehand. Recommend Plan 01-07's planner verify whether re-exporting these symbols from the appropriate split entry points resolves the failures, and if not, add a dedicated fix task.
- **Plan 01-10 (CI workflow):** Cannot be green until BOTH (a) the `@dogpile/sdk` link is resolved (Plan 01-02) AND (b) the two `@protostar/planning` test failures are resolved (likely via Plan 01-07).

## Deviations from Plan

None. Plan executed exactly as written. Task 2 explicitly anticipated outcome #3 (actual contract regression) and instructed "do NOT modify any test or production code" — which was honored. The failures are documented here for downstream consumption as the plan directed.

## Self-Check: PASSED

- `package.json` modified: FOUND (`scripts.verify:full` present, contains `pnpm -r test`)
- Commit `97b7cea` exists: FOUND on `main`
- SUMMARY.md created: FOUND at this path
- No unexpected file deletions in the commit
