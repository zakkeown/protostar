---
phase: 02-authority-governance-kernel
plan: 03
subsystem: governance
tags: [intent, signature-envelope, json-schema, schema-version, node-test]

requires:
  - phase: 01-intent-planning-admission
    provides: ConfirmedIntent brand, schemaVersion infrastructure, and public mint-surface contract tests
provides:
  - ConfirmedIntent schemaVersion hard-bumped to single const 1.1.0
  - SignatureEnvelope canonicalForm discriminator and SHA-256 sub-hash slots
  - Parser and schema regressions for signed/unsigned 1.1.0 artifacts
affects: [phase-2-authority, signed-intent, canonicalization, admission-e2e, stage-reader-legacy-fallback]

tech-stack:
  added: []
  patterns:
    - "Hard schema-version bump: parsers and producers accept only the new literal while legacy disk fallback is deferred to the reader layer."
    - "Signature envelopes carry a canonical form tag and sibling sub-hashes for deterministic mismatch narrowing."

key-files:
  created:
    - packages/intent/src/confirmed-intent.test.ts
  modified:
    - packages/intent/src/confirmed-intent.ts
    - packages/intent/src/promote-intent-draft.ts
    - packages/intent/schema/confirmed-intent.schema.json
    - packages/intent/src/public-split-exports.contract.test.ts
    - packages/intent/src/confirmed-intent-immutability.test.ts
    - packages/intent/src/acceptance-criteria-normalization.test.ts
    - packages/intent/src/internal/test-builders.ts
    - packages/intent/src/confirmed-intent/index.ts

key-decisions:
  - "ConfirmedIntent schemaVersion is a hard single-literal 1.1.0 bump, not a widened enum."
  - "SignatureEnvelope includes canonicalForm plus intentHash, envelopeHash, and policySnapshotHash per Phase 2 Correction 3."
  - "The public mint surface remains pinned to promoteIntentDraft; mintConfirmedIntent is still not re-exported."

patterns-established:
  - "Confirmed-intent parser fail-closes on unknown canonicalForm tags and malformed lowercase SHA-256 hex digests."
  - "Legacy 1.0.0 confirmed-intent artifacts are rejected by parseConfirmedIntent and must be handled by Plan 09 reader fallback."

requirements-completed: [GOV-06]

duration: 1h 10m
completed: 2026-04-27
---

# Phase 2 Plan 03: Signature Envelope Extension Summary

**ConfirmedIntent 1.1.0 hard bump with canonical signature-envelope metadata for Phase 2 signing.**

## Performance

- **Duration:** 1h 10m
- **Started:** 2026-04-27T14:37:00Z
- **Completed:** 2026-04-27T15:47:16Z
- **Tasks:** 1
- **Files modified:** 9

## Accomplishments

- Extended `SignatureEnvelope` with `canonicalForm: "json-c14n@1.0"` and the three deterministic sub-hash fields required by Phase 2 Correction 3.
- Hard-bumped confirmed-intent TypeScript and JSON Schema contracts to `schemaVersion: "1.1.0"` as a single allowed value.
- Updated both mint paths so newly promoted and test-built confirmed intents emit `1.1.0`.
- Added parser/schema regressions for signed and unsigned 1.1.0 artifacts, legacy 1.0.0 rejection, unknown canonical tags, and malformed SHA-256 digests.
- Migrated confirmed-intent Phase 1 test literals from `1.0.0` to `1.1.0` while leaving clarification-report artifacts untouched.

## Task Commits

1. **Task 1 RED: Add signature envelope hard-bump regressions** - `101a803` (test)
2. **Task 1 GREEN: Hard-bump confirmed intent signatures to 1.1.0** - `03ed5c2` (feat)

_Note: Task 1 was TDD, so it produced RED and GREEN commits._

## Files Created/Modified

- `packages/intent/src/confirmed-intent.test.ts` - Parser and schema regression coverage for the 1.1.0 signature envelope.
- `packages/intent/src/confirmed-intent.ts` - Canonical signature envelope type, 1.1.0 mint/parse guards, and fail-closed signature validation.
- `packages/intent/src/promote-intent-draft.ts` - Production promotion path now mints confirmed intents as `1.1.0`.
- `packages/intent/schema/confirmed-intent.schema.json` - Hard-bumped schema with `$defs.SignatureEnvelope` requiring canonicalForm and sub-hashes.
- `packages/intent/src/public-split-exports.contract.test.ts` - Confirmed-intent fixture and assertion migrated to `1.1.0`; public mint surface remains unchanged.
- `packages/intent/src/confirmed-intent-immutability.test.ts` - Confirmed-intent immutability fixtures and assertions migrated to `1.1.0`.
- `packages/intent/src/acceptance-criteria-normalization.test.ts` - Confirmed-intent fixture migrated to `1.1.0`.
- `packages/intent/src/internal/test-builders.ts` - Test-builder documentation updated for the new default schema version.
- `packages/intent/src/confirmed-intent/index.ts` - Confirmed-intent subpath exports the canonical form tag type.

## Decisions Made

- Applied Phase 2 Correction 3 during Plan 03 execution: sub-hashes are part of the envelope now so Plan 05 can implement deterministic mismatch narrowing without changing the confirmed-intent schema again.
- Kept legacy `1.0.0` handling out of `parseConfirmedIntent`; Plan 09 owns legacy read fallback before parsing.
- Did not add `mintConfirmedIntent` to any public barrel. Admission-e2e still pins `promoteIntentDraft` as the sole public ConfirmedIntent mint.

## Deviations from Plan

None - plan executed according to the revised Plan 03 plus `02-CORRECTIONS.md`.

## Issues Encountered

- The plan referenced `packages/intent/src/confirmed-intent.test.ts`, which did not exist in this checkout, so the regression suite was created there.
- The local `gsd-sdk query ...` helper was unavailable per runtime context; planning-state updates were applied manually.
- `tsc` emitted untracked generated artifacts beside source during an early test run; those generated files were removed before committing, leaving the worktree clean.

## Authentication Gates

None.

## Known Stubs

None.

## Verification

- `pnpm --filter @protostar/intent test` - passed; 118 tests, 17 suites, 0 failures.
- `pnpm --filter @protostar/admission-e2e test` - passed; 18 tests, 7 suites, 0 failures.
- `pnpm run verify:full` - passed; root typecheck and recursive workspace tests green.
- `pnpm run verify` - passed; root typecheck, intent tests, and factory-cli tests green.
- `pnpm run factory` - passed; sample factory command emitted a confirmed intent with `schemaVersion: "1.1.0"` and `signature: null`.
- `grep -c 'canonicalForm' packages/intent/src/confirmed-intent.ts` - `6`.
- `grep -c 'json-c14n@1.0' packages/intent/src/confirmed-intent.ts` - `3`.
- `grep -c '"const": "1.1.0"' packages/intent/schema/confirmed-intent.schema.json` - `1`.
- `grep -c '"canonicalForm"' packages/intent/schema/confirmed-intent.schema.json` - `2`.
- `grep -v '^#' packages/intent/schema/confirmed-intent.schema.json | grep -c '"1.0.0"'` - `0`.
- `grep -rn "confirmed-intent.*schemaVersion.*1\\.0\\.0\\|schemaVersion.*1\\.0\\.0.*confirmed" packages/intent/ packages/admission-e2e/ --include="*.ts" | grep -v 'clarification' | wc -l` - `0`.
- `grep -rn 'schemaVersion[^"]*"1\\.0\\.0"' packages/intent/src/ | grep -v 'clarification-report' | wc -l` - `0`.

## Self-Check: PASSED

- Created summary exists at `.planning/phases/02-authority-governance-kernel/02-03-signature-envelope-extension-SUMMARY.md`.
- Created test file exists at `packages/intent/src/confirmed-intent.test.ts`.
- Task commits exist: `101a803`, `03ed5c2`.
- No tracked file deletions were introduced by the task commits.
- Worktree was clean before planning metadata edits.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Plan 05 can build `buildSignatureEnvelope` and `verifyConfirmedIntentSignature` against the final envelope shape without revisiting the confirmed-intent schema. Plan 09 must preserve the planned legacy read fallback for historical 1.0.0 artifacts.

---
*Phase: 02-authority-governance-kernel*
*Completed: 2026-04-27*
