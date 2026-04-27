---
phase: 02-authority-governance-kernel
plan: 14
subsystem: authority
tags: [stage-reader, signature-verification, admission-decisions-index, branded-types, fail-closed]
dependency_graph:
  requires: [02-05, 02-07, 02-09, 02-13]
  provides: [verified-stage-reader-reads, artifactPath-index-compatibility]
  affects: [packages/authority, packages/admission-e2e]
tech_stack:
  added: []
  patterns: [branded-read-split, legacy-fallback-upconversion, fail-closed-verification-gate]
key_files:
  created: []
  modified:
    - packages/authority/src/stage-reader/factory.ts
    - packages/authority/src/stage-reader/factory.test.ts
    - packages/admission-e2e/src/signed-confirmed-intent.e2e.test.ts
decisions:
  - "ParsedConfirmedIntent is a type alias for ConfirmedIntent — same shape but named to signal unverified state; avoids phantom-type complexity while making intent explicit in the API"
  - "readParsedConfirmedIntent returns ParsedConfirmedIntent alias not unknown — keeps downstream TypeScript ergonomics while documenting it is not authority"
  - "Legacy path fallback in validateAdmissionDecisionIndexEntry upcoverts to artifactPath immediately — caller always gets canonical field name regardless of fixture age"
  - "confirmedIntent() calls verifyConfirmedIntent() internally — no separate code path; single source of truth for the verification pipeline"
metrics:
  duration: ~12 minutes
  completed: 2026-04-27
  tasks_completed: 2
  files_modified: 3
---

# Phase 2 Plan 14: Stage Reader Branded Verification and Index Summary

## One-liner

Stage reader now gatekeeps `confirmedIntent()` behind signature verification; `admissionDecisionsIndex` standardized on `artifactPath` with legacy `path` fallback.

## What Was Built

### Task 1: Standardize admission-decisions index on artifactPath with legacy path fallback

- Changed `AdmissionDecisionIndexEntry.path` to `AdmissionDecisionIndexEntry.artifactPath` (canonical field) in `packages/authority/src/stage-reader/factory.ts`
- `validateAdmissionDecisionIndexEntry` now:
  1. Accepts canonical `artifactPath` (factory-cli writer format)
  2. Falls back to legacy `path` field and upconverts to `artifactPath`
  3. Throws with `"artifactPath must be a string"` when neither field is present
- Tests added: canonical reader fixture, legacy fallback fixture, rejection for neither field

### Task 2: Split parsed/unverified intent reads from verified/branded reads

- Added `ParsedConfirmedIntent` type alias (named to signal unverified, diagnostic use)
- Added `readParsedConfirmedIntent()` to `AuthorityStageReader` interface and implementation — reads and parses `intent.json` with legacy `1.0.0` upconversion but NO signature verification
- Changed `confirmedIntent()` to call `verifyConfirmedIntent()` and throw `StageReaderError` with `"confirmed intent signature verification failed"` on any failure; returns `result.verified.intent` on success
- Changed `verifyConfirmedIntent()` to call `readParsedConfirmedIntent()` (not `confirmedIntent()`) — breaking the previous circular dependency and the pre-verification branded return path
- Renamed private `validateConfirmedIntent` to `parsedConfirmedIntent` to signal it is not authority
- Added two e2e compatibility tests in `admission-e2e` for `admissionDecisionsIndex` writer/reader field compatibility (T-2-6 coverage)

## Test Results

| Suite | Tests | Pass | Fail |
|-------|-------|------|------|
| @protostar/authority | 111 | 111 | 0 |
| @protostar/factory-cli | 82 | 82 | 0 |
| @protostar/admission-e2e | 44 | 44 | 0 |

## Commits

| Hash | Type | Description |
|------|------|-------------|
| 3da490e | test | Failing tests for artifactPath canonical field in admission-decisions index (RED) |
| ef5bdad | feat | Standardize admission-decisions index on artifactPath with legacy path fallback (GREEN) |
| 164cad2 | test | Failing tests for split parsed vs verified confirmed intent reads (RED) |
| c286cd8 | feat | Split parsed/unverified reads from verified/branded confirmed intent (GREEN) |

## TDD Gate Compliance

- Task 1: RED `test(02-14)` commit 3da490e → GREEN `feat(02-14)` commit ef5bdad
- Task 2: RED `test(02-14)` commit 164cad2 → GREEN `feat(02-14)` commit c286cd8

Both TDD gates satisfied.

## Deviations from Plan

### Auto-additions

**1. [Rule 2 - Missing] E2E admissionDecisionsIndex writer/reader compatibility tests**
- **Found during:** Task 2
- **Issue:** Plan `must_haves.artifacts` required `signed-confirmed-intent.e2e.test.ts` to contain `admissionDecisionsIndex`; tests were missing
- **Fix:** Added two e2e tests: canonical `artifactPath` round-trip and rejection test for invalid entries
- **Files modified:** `packages/admission-e2e/src/signed-confirmed-intent.e2e.test.ts`
- **Commit:** c286cd8

**2. [Rule 1 - Bug] Updated existing happy-path test fixture**
- **Found during:** Task 1
- **Issue:** Existing test at line 44 used legacy `path` fixture and `assert.deepEqual` — would have silently tested the wrong field name after implementation
- **Fix:** Updated fixture to use canonical `artifactPath`, updated assertion to check `index[0]?.artifactPath` individually
- **Commit:** 3da490e

## Threats Addressed

| Threat | Resolution |
|--------|-----------|
| T-2-1 unverified branded read | `confirmedIntent()` now requires `ok: true` from verifier; throws on failure |
| T-2-6 durable artifact incompatibility | `artifactPath` canonical field matches factory-cli writer; legacy `path` upconverted transparently |

## Known Stubs

None — all methods fully wired.

## Self-Check: PASSED

- `packages/authority/src/stage-reader/factory.ts` contains `readParsedConfirmedIntent` ✓
- `packages/authority/src/stage-reader/factory.ts` contains `confirmed intent signature verification failed` ✓
- `packages/authority/src/stage-reader/factory.ts` contains `artifactPath` ✓
- Commits 3da490e, ef5bdad, 164cad2, c286cd8 all present in git log ✓
- All 237 tests pass across three packages ✓
