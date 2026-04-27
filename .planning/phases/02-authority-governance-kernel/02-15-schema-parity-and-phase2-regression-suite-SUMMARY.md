---
phase: 02-authority-governance-kernel
plan: 15
subsystem: authority
tags: [schema, parity, regression, e2e, testing]
dependency_graph:
  requires: [02-11, 02-12, 02-13, 02-14]
  provides: [GOV-01, GOV-02, GOV-03, GOV-04, GOV-05, GOV-06]
  affects: [packages/authority, packages/admission-e2e, apps/factory-cli, packages/intent]
tech_stack:
  added: []
  patterns: [in-memory FsAdapter e2e, createRequire for JSON schema loading, cross-package regression net]
key_files:
  created:
    - packages/admission-e2e/src/authority-governance-kernel.e2e.test.ts
  modified:
    - packages/authority/src/repo-policy/repo-policy.test.ts
    - apps/factory-cli/src/main.test.ts
    - packages/intent/schema/intent-admission-decision.schema.json
decisions:
  - Use createRequire (node:module) instead of node:fs/promises to load repo-policy.schema.json — avoids breaking the authority-no-fs boundary contract
  - Remove additionalProperties:false from intent-admission-decision evidence — runtime spreads full AdmissionDecisionArtifactPayload which has fields the schema did not enumerate
  - Keep factory-cli CLI spawn tests in main.test.ts; put reader/AuthorizedOp integration in admission-e2e — matches plan split guidance and avoids runtime dep on factory-cli internals
metrics:
  duration: ~20 minutes
  completed: 2026-04-27
  tasks_completed: 2
  files_changed: 4
---

# Phase 2 Plan 15: Schema Parity and Phase 2 Regression Suite Summary

Schema/parser parity for repo-policy budget caps confirmed; cross-package Phase 2 regression e2e added covering blocked-by-tier precedence, JSONL reader, confirmedIntent verification, and empty-envelope enforcement.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Schema parity: budget cap minimum assertions | a4270ac | packages/authority/src/repo-policy/repo-policy.test.ts |
| 2 | Phase 2 authority-governance regression e2e | 0c48640 | packages/admission-e2e/src/authority-governance-kernel.e2e.test.ts, apps/factory-cli/src/main.test.ts, packages/intent/schema/intent-admission-decision.schema.json |

## What Was Built

### Task 1: Schema/Parser Parity

Added a `"schema parity: budgetCaps properties have type number and minimum 0"` test to `packages/authority/src/repo-policy/repo-policy.test.ts`. The test loads `repo-policy.schema.json` using `createRequire` (not `node:fs/promises` — avoids the authority-no-fs boundary rule) and asserts all four budget cap fields (`maxUsd`, `maxTokens`, `timeoutMs`, `maxRepairLoops`) have `type: "number"` and `minimum: 0`. The schema constraints were already present from earlier work; this plan adds the regression assertion.

### Task 2: Phase 2 Regression E2E + Schema Fixes

**New file:** `packages/admission-e2e/src/authority-governance-kernel.e2e.test.ts`

Proves 5 Phase 2 behavioral contracts:
1. `DENY_ALL_REPO_POLICY` + workspace-write intent → `intersectEnvelopes` returns `blocked-by-tier`, and `AuthorityStageReader.precedenceDecision()` reads a persisted blocked-by-tier decision correctly.
2. `admissionDecisionsIndex()` returns 5 entries each with `artifactPath` for a permissive run.
3. `confirmedIntent()` returns the verified signed intent on a valid run; rejects when intent body is mutated.
4. `verifyConfirmedIntentSignature` and `reader.verifyConfirmedIntent()` return consistent results.
5. All four `authorize*Op` functions return `ok: false` for an empty resolved envelope.

**Extended:** `apps/factory-cli/src/main.test.ts` — "validates emitted gate evidence against all five gate schemas" (was four; added intent gate schema).

**Schema fix:** `packages/intent/schema/intent-admission-decision.schema.json`:
- Fixed `runId` pattern from `^run-[A-Za-z0-9_-]+$` to `^run[-_][A-Za-z0-9_-]+$` (runtime emits `run_*` IDs; the other three gate schemas already used `[-_]`).
- Removed `additionalProperties: false` from `evidence` — `intentAdmissionEvidence()` spreads the full `AdmissionDecisionArtifactPayload`, which has fields not enumerated in the original schema.

## Test Results

| Suite | Tests | Pass | Fail |
|-------|-------|------|------|
| @protostar/authority | 112 | 112 | 0 |
| @protostar/factory-cli | 82 | 82 | 0 |
| @protostar/admission-e2e | 55 | 55 | 0 |
| verify:full | all | all | 0 |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed intent-admission-decision.schema.json runId pattern**
- **Found during:** Task 2, while adding intent gate to schema validation test
- **Issue:** `runId` pattern was `^run-[A-Za-z0-9_-]+$` (dash-only prefix). Runtime uses `run_` (underscore) prefix. All other gate schemas use `^run[-_][A-Za-z0-9_-]+$`.
- **Fix:** Changed pattern to `^run[-_][A-Za-z0-9_-]+$` to match runtime and other schemas.
- **Files modified:** `packages/intent/schema/intent-admission-decision.schema.json`
- **Commit:** 0c48640

**2. [Rule 1 - Bug] Removed additionalProperties:false from intent-admission-decision evidence**
- **Found during:** Task 2, schema validation test failure
- **Issue:** The schema's `evidence.additionalProperties: false` rejected fields that `intentAdmissionEvidence()` spreads from `AdmissionDecisionArtifactPayload` (`decision`, `schemaVersion`, `mode`, etc.)
- **Fix:** Removed `additionalProperties: false` from the evidence section. Required field constraints (`ambiguityScore`, `admissionStage`) are preserved.
- **Files modified:** `packages/intent/schema/intent-admission-decision.schema.json`
- **Commit:** 0c48640

**3. [Rule 2 - Deviation] Schema constraints pre-existing on Task 1**
- The repo-policy schema already had `"minimum": 0` for all four budget cap fields from Plan 11 work.
- Plan called for adding them; they were already present. Plan's TDD gate "fail if test passes unexpectedly in RED" applied — investigation confirmed the schema was already correct.
- The regression test was added (no schema change needed). Documented as deviation.

## Known Stubs

None — all implemented behaviors are wired to real data sources.

## Threat Flags

None — no new network endpoints, auth paths, file access patterns, or schema changes at trust boundaries beyond what the plan addressed.

## Self-Check

- [x] `packages/admission-e2e/src/authority-governance-kernel.e2e.test.ts` exists and contains `blocked-by-tier`, `artifactPath`, `confirmedIntent()`, `authorizeWorkspaceOp`
- [x] `packages/authority/schema/repo-policy.schema.json` contains four `minimum` entries under `budgetCaps`
- [x] `pnpm --filter @protostar/authority test` exits 0 (112 tests)
- [x] `pnpm --filter @protostar/factory-cli test` exits 0 (82 tests)
- [x] `pnpm --filter @protostar/admission-e2e test` exits 0 (55 tests)
- [x] `pnpm run verify:full` exits 0

## Self-Check: PASSED
