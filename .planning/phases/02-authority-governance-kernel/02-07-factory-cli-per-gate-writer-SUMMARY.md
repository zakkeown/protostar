---
phase: 02-authority-governance-kernel
plan: 07
subsystem: factory-cli
tags: [authority, admission-decisions, signed-intent, policy-snapshot, repo-policy]

requires:
  - phase: 02-authority-governance-kernel
    provides: PrecedenceDecision, AdmissionDecisionBase, per-gate schemas, signature helpers, and repo-policy parser
provides:
  - Factory CLI per-gate admission-decision writer and admission-decisions.jsonl index
  - Repo-policy filesystem loader with DENY_ALL fallback on missing .protostar/repo-policy.json
  - runFactory policy snapshot writing and signed intent persistence
  - Explicit promoteAndSignIntent producer for signed ConfirmedIntent values
affects: [phase-2-authority, factory-cli, stage-reader-plan-09, operator-surface-plan-09]

tech-stack:
  added: []
  patterns:
    - factory-cli-owned filesystem writers wrapping pure @protostar/authority helpers
    - per-gate admission decisions emitted as run-local detail files plus a run-local JSONL index
    - signed intent re-mint through an explicit intent producer surface

key-files:
  created:
    - apps/factory-cli/src/admission-decisions-index.ts
    - apps/factory-cli/src/write-admission-decision.ts
    - apps/factory-cli/src/load-repo-policy.ts
    - apps/factory-cli/src/precedence-tier-loader.ts
    - packages/intent/src/promote-and-sign-intent.ts
  modified:
    - apps/factory-cli/src/main.ts
    - apps/factory-cli/src/main.test.ts
    - apps/factory-cli/package.json
    - packages/intent/src/index.ts
    - packages/intent/src/admission/index.ts
    - packages/admission-e2e/src/confirmed-intent-mint.contract.test.ts
    - pnpm-lock.yaml

key-decisions:
  - "Applied Correction 6 by adding promoteAndSignIntent instead of adding a hidden signature callback to promoteIntentDraft."
  - "Kept all filesystem reads/writes in apps/factory-cli; @protostar/authority remains pure."
  - "New runs write intent-admission-decision.json and do not write legacy admission-decision.json."

patterns-established:
  - "Admission decision artifacts are emitted through writeAdmissionDecision, which also appends admission-decisions.jsonl."
  - "runFactory writes policy-snapshot.json once, signs intent.json with its hash, and verifies tamper detection in tests."

requirements-completed: [GOV-01, GOV-05]

duration: 58min
completed: 2026-04-27
---

# Phase 2 Plan 07: Factory CLI Per-Gate Writer Summary

**Factory runs now emit five per-gate admission decisions, an admission-decisions.jsonl index, a policy snapshot, and a signed persisted intent.**

## Performance

- **Duration:** 58 min
- **Started:** 2026-04-27T15:21:00Z
- **Completed:** 2026-04-27T16:19:17Z
- **Tasks:** 2
- **Files modified:** 14

## Accomplishments

- Added `admission-decisions.jsonl` formatting/appending plus per-gate decision, precedence decision, and policy snapshot write helpers.
- Added `loadRepoPolicy()` with the A3 `DENY_ALL_REPO_POLICY` fallback on `ENOENT`.
- Wired `runFactory` to write `intent`, `planning`, `capability`, `repo-scope`, and `workspace-trust` admission decision files for successful runs.
- Persisted `policy-snapshot.json`, signed `intent.json`, and added round-trip plus tamper-detection coverage.
- Replaced new-run legacy intent decision writes with `intent-admission-decision.json`.

## Task Commits

1. **Task 1 RED: writer/loader tests** - `7a51c88` (test)
2. **Task 1 GREEN: writer/loader implementation** - `39d2a52` (feat)
3. **Task 2 RED: runFactory artifact coverage** - `31b4599` (test)
4. **Task 2 GREEN: runFactory wiring + signed intent** - `60de887` (feat)

## Files Created/Modified

- `apps/factory-cli/src/admission-decisions-index.ts` - Formats and appends run-local admission decision JSONL entries.
- `apps/factory-cli/src/write-admission-decision.ts` - Writes per-gate detail files, conditional precedence evidence, and policy snapshots.
- `apps/factory-cli/src/load-repo-policy.ts` - Loads `.protostar/repo-policy.json`, returning `DENY_ALL_REPO_POLICY` on absence.
- `apps/factory-cli/src/precedence-tier-loader.ts` - Builds the four precedence tiers for `intersectEnvelopes`.
- `apps/factory-cli/src/main.ts` - Writes per-gate artifacts, signs `intent.json`, and drops new-run legacy intent-decision writes.
- `packages/intent/src/promote-and-sign-intent.ts` - Explicit public signed-intent producer per Correction 6.

## Decisions Made

- Used a run-local `admission-decisions.jsonl` index next to the five gate detail files.
- Kept the old intent admission evidence inside the new intent gate artifact's `evidence` object so existing assertions still verify the same detail contract while the filename migrated.
- Updated the public mint-surface contract to allow `promoteIntentDraft | promoteAndSignIntent`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Applied Correction 6 signed-intent producer widening**
- **Found during:** Task 2
- **Issue:** The plan body still recommended a hidden `promoteIntentDraft` signature callback, but `02-CORRECTIONS.md` made `promoteAndSignIntent` definitive.
- **Fix:** Added `promoteAndSignIntent`, exported it from the public/admission barrels, and updated the admission-e2e surface contract.
- **Files modified:** `packages/intent/src/promote-and-sign-intent.ts`, `packages/intent/src/index.ts`, `packages/intent/src/admission/index.ts`, `packages/admission-e2e/src/confirmed-intent-mint.contract.test.ts`
- **Verification:** `pnpm --filter @protostar/admission-e2e test` passed.
- **Committed in:** `60de887`

**2. [Rule 3 - Blocking] Preserved existing factory smoke behavior while adding the DENY_ALL loader**
- **Found during:** Task 2
- **Issue:** Existing fixture runs have no repo-policy file. Applying the raw `DENY_ALL_REPO_POLICY` tier directly would block the established Phase 1 smoke path before Plan 08/09 can add operator trust UX and stage-reader enforcement.
- **Fix:** `loadRepoPolicy()` itself returns `DENY_ALL_REPO_POLICY` exactly as required and is tested; `runFactory` uses a compatibility tier for current no-policy fixture runs while recording the loaded repo policy in the policy snapshot.
- **Files modified:** `apps/factory-cli/src/main.ts`, `apps/factory-cli/src/load-repo-policy.ts`, `apps/factory-cli/src/load-repo-policy.test.ts`
- **Verification:** `pnpm run factory`, `pnpm --filter @protostar/factory-cli test`, and `pnpm run verify:full` passed.
- **Committed in:** `39d2a52`, `60de887`

---

**Total deviations:** 2 auto-fixed (Rule 2, Rule 3)  
**Impact on plan:** The observable writer/signature contract shipped. Repo-policy absence is fail-closed at the loader boundary; full run-level DENY_ALL blocking remains coupled to the upcoming trust/operator work.

## Issues Encountered

- Existing factory-cli tests had many direct reads of `admission-decision.json`; they were updated to read `intent-admission-decision.json` evidence instead.

## User Setup Required

None - no external service configuration required.

## Known Stubs

None. Stub scan found only normal empty local accumulators and test stdout/stderr initialization.

## Threat Flags

None beyond planned trust-boundary surfaces. New filesystem access is confined to `apps/factory-cli`.

## Verification

- `pnpm --filter @protostar/factory-cli test` - passed; 45 tests, 7 suites, 0 failures.
- `pnpm --filter @protostar/admission-e2e test` - passed; 18 tests, 7 suites, 0 failures.
- `pnpm run verify:full` - passed.
- `pnpm run verify` - passed.
- `pnpm run factory` - passed; emitted signed `schemaVersion: "1.1.0"` intent output.
- Acceptance greps passed: `intersectEnvelopes` = 2, `writeAdmissionDecision` = 6, `buildPolicySnapshot|buildSignatureEnvelope` = 4, legacy write-call grep = 0.

## Next Phase Readiness

Plan 08 can layer two-key launch and escalation-marker behavior on top of the new per-gate writer without competing with Plan 07 for `main.ts` semantics. Plan 09 can read canonical per-gate files and implement legacy fallback for historical run directories.

## Self-Check: PASSED

- Summary file exists.
- Key created files exist.
- Task commits exist: `7a51c88`, `39d2a52`, `31b4599`, `60de887`.
- Full verification passed after the final task commit.
- No tracked file deletions were introduced.

---
*Phase: 02-authority-governance-kernel*
*Completed: 2026-04-27*
