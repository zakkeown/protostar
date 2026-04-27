---
phase: 02-authority-governance-kernel
plan: 06a
subsystem: governance
tags: [authority, admission-decision, signed-decision, canonical-json, node-test, typescript]

requires:
  - phase: 02-authority-governance-kernel
    provides: Authority package skeleton, AuthorizedOp brands, precedence kernel, and canonical JSON signature helpers
provides:
  - AdmissionDecisionBase shared header type with five GateName literals
  - Authority re-export of the intent-owned admission outcome literal
  - SignedAdmissionDecision brand with sign and verify helpers
  - Tests for base/outcome contracts and signed-decision tamper detection
affects: [phase-2-authority, factory-cli-gate-writer, stage-reader, admission-e2e-contracts]

tech-stack:
  added: []
  patterns:
    - Authority-side shared base types with per-gate evidence extension hooks
    - Module-private brand mint with public producer/verifier
    - Canonical JSON SHA-256 signatures over stage payload bodies

key-files:
  created:
    - packages/authority/src/admission-decision/base.ts
    - packages/authority/src/admission-decision/outcome.ts
    - packages/authority/src/admission-decision/signed-admission-decision.ts
    - packages/authority/src/admission-decision/admission-decision.test.ts
    - packages/authority/src/admission-decision/signed-admission-decision.test.ts
  modified:
    - packages/authority/src/admission-decision/index.ts
    - packages/authority/src/index.ts

key-decisions:
  - "AdmissionDecisionOutcome remains intent-owned; authority only re-exports the literal and type."
  - "SignedAdmissionDecision uses the landed json-c14n@1.0 canonicalizer and SHA-256 hash helpers from the signature package."
  - "The shared SignatureEnvelope sub-hash fields are populated deterministically with the decision-body hash for this single-body signature wrapper."

patterns-established:
  - "Per-gate decisions extend AdmissionDecisionBase<E> rather than centralizing evidence in authority."
  - "Signed wrappers verify by stripping signature, re-canonicalizing the body, and comparing the recorded digest."

requirements-completed: [GOV-03, GOV-05]

duration: 34min
completed: 2026-04-27
---

# Phase 2 Plan 06a: Admission Decision Base Summary

**Authority-owned admission-decision base contracts plus a tamper-evident SignedAdmissionDecision brand using the intent-owned outcome literal.**

## Performance

- **Duration:** 34 min
- **Started:** 2026-04-27T15:24:00Z
- **Completed:** 2026-04-27T15:58:24Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- Added `AdmissionDecisionBase<E>`, `GateName`, `GATE_NAMES`, and `PrecedenceResolutionSummary` in `@protostar/authority`.
- Re-exported `ADMISSION_DECISION_OUTCOMES` and `AdmissionDecisionOutcome` from `@protostar/intent` without redefining the literal.
- Added `SignedAdmissionDecision`, `SignedAdmissionDecisionData`, `signAdmissionDecision`, and `verifySignedAdmissionDecision`.
- Covered the base/outcome contract and all seven signed-decision cases from the plan.
- Preserved the authority boundary: no filesystem imports were added in admission-decision code.

## Task Commits

Each task was committed atomically:

1. **Task 1 RED: Add admission decision base contract tests** - `02c1929` (test)
2. **Task 2 RED: Add signed admission decision contract tests** - `b306e59` (test)
3. **Task 1/2 GREEN: Implement base contracts and signed decisions** - `be96ec9` (feat)

_Note: Wave 2 ran concurrently. A parallel cleanup commit removed mistakenly staged admission files from another plan, so the final GREEN commit re-added the base/outcome files together with the signed-decision implementation._

## Files Created/Modified

- `packages/authority/src/admission-decision/base.ts` - Shared admission-decision header, five gate names, and precedence summary.
- `packages/authority/src/admission-decision/outcome.ts` - Re-export-only authority surface for intent-owned outcomes.
- `packages/authority/src/admission-decision/index.ts` - Public admission-decision subdir barrel.
- `packages/authority/src/admission-decision/signed-admission-decision.ts` - Signed-decision brand, private mint, public producer, and verifier.
- `packages/authority/src/admission-decision/admission-decision.test.ts` - Base type, gate list, and outcome single-source tests.
- `packages/authority/src/admission-decision/signed-admission-decision.test.ts` - Round-trip, mutation, canonical-form, algorithm, determinism, freeze, and public-surface tests.
- `packages/authority/src/index.ts` - Root barrel now exports the admission-decision public surface.

## Decisions Made

- Reused `@protostar/intent` as the single source for `ADMISSION_DECISION_OUTCOMES`; no new outcome array exists in authority.
- Used the Plan 05 canonicalizer/registry that landed during the shared Wave 2 run instead of introducing new hashing logic in 06a.
- Filled the required `SignatureEnvelope` sub-hash fields with the same decision-body digest, because `SignedAdmissionDecision` signs one canonical body rather than the confirmed-intent three-component payload.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added root authority barrel export**
- **Found during:** Task 2
- **Issue:** Plan 01 was expected to pre-populate `packages/authority/src/index.ts` with the admission-decision subdir export, but the checkout did not contain that line.
- **Fix:** Added `export * from "./admission-decision/index.js";` so `@protostar/authority` exposes `signAdmissionDecision` while the mint remains hidden.
- **Files modified:** `packages/authority/src/index.ts`
- **Verification:** `pnpm --filter @protostar/authority test` passed; public-surface test confirms `mintSignedAdmissionDecision` is absent.
- **Committed in:** `be96ec9`

**2. [Rule 3 - Blocking] Restored workspace package links**
- **Found during:** Overall verification
- **Issue:** `pnpm --filter @protostar/authority test` built successfully but Node could not resolve workspace package `@protostar/intent` at runtime because `node_modules` links were absent.
- **Fix:** Ran `pnpm install`; the lockfile was already current and no package files changed.
- **Files modified:** None
- **Verification:** Authority tests passed after install.
- **Committed in:** Not applicable; no file changes.

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Both were required to verify the intended public surface. No authority/file-system boundary expansion.

## Issues Encountered

- Wave 2 concurrency caused another plan to temporarily stage, commit, and then remove some admission-decision files. I did not rewrite shared history or revert other agents' work; final 06a commits leave the intended files present and tests passing.
- Plan 05 signature helpers landed while 06a was running. `signAdmissionDecision` uses those helpers rather than creating a separate canonicalization implementation.

## Authentication Gates

None.

## Known Stubs

None.

## Threat Flags

None. This plan adds pure authority contracts and hashing helpers only; it introduces no network endpoints, filesystem reads/writes, auth paths, or schema trust-boundary changes beyond the planned signed-decision surface.

## Verification

- `pnpm --filter @protostar/authority test` - passed; 59 tests, 7 suites, 0 failures.
- `pnpm run verify` - passed.
- `pnpm run factory` - passed; emitted a schemaVersion `1.1.0` confirmed intent payload.
- `grep -c 'GateName' packages/authority/src/admission-decision/base.ts` - `3`.
- `grep -c 'GATE_NAMES' packages/authority/src/admission-decision/base.ts` - `1`.
- `grep -E '\["allow",\s*"block",\s*"escalate"\]' packages/authority/src/admission-decision/outcome.ts | wc -l` - `0`.
- `grep -v '^#' packages/authority/src/admission-decision/index.ts | grep -c 'mintSignedAdmissionDecision'` - `0`.
- `grep -c 'unique symbol' packages/authority/src/admission-decision/signed-admission-decision.ts` - `1`.
- `grep -c 'signAdmissionDecision' packages/authority/src/admission-decision/signed-admission-decision.ts` - `1`.
- `grep -c 'verifySignedAdmissionDecision' packages/authority/src/admission-decision/signed-admission-decision.ts` - `1`.
- `grep -RIn "from ['\"]node:fs['\"]\|from ['\"]fs['\"]" packages/authority/src/admission-decision packages/authority/src/index.ts | wc -l` - `0`.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Plan 06b can add per-gate evidence schemas around `AdmissionDecisionBase<E>`. Plan 07 can write per-gate decisions and use `signAdmissionDecision` where a tamper-evident decision wrapper is required.

## Self-Check: PASSED

- Summary file exists.
- Key created files exist.
- Task commits exist: `02c1929`, `b306e59`, `be96ec9`.
- Stub scan found no unresolved placeholders in 06a-created files.

---
*Phase: 02-authority-governance-kernel*
*Completed: 2026-04-27*
