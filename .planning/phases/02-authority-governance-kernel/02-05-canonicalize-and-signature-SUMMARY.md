---
phase: 02-authority-governance-kernel
plan: 05
subsystem: governance
tags: [authority, signature, canonicalization, sha256, node-test]

requires:
  - phase: 02-authority-governance-kernel
    provides: SignatureEnvelope canonicalForm and deterministic sub-hash fields from Plan 03
provides:
  - json-c14n@1.0 canonicalizer with fail-closed anomaly validation
  - canonical form registry for signature dispatch
  - SHA-256 signature envelope builders with component sub-hashes
  - central verifyConfirmedIntentSignature helper with deterministic mismatch fields
  - policy snapshot builder and canonical hash helper
affects: [phase-2-authority, factory-cli-signing, stage-reader-verification, signed-intent]

tech-stack:
  added: []
  patterns:
    - "Validate canonical input before serialization; reject values JSON.stringify would coerce or omit."
    - "Signature verification narrows mismatches via recorded component hashes in SignatureEnvelope."

key-files:
  created:
    - packages/authority/src/signature/canonicalize.ts
    - packages/authority/src/signature/canonical-form-registry.ts
    - packages/authority/src/signature/canonicalize.test.ts
    - packages/authority/src/signature/sign.ts
    - packages/authority/src/signature/verify.ts
    - packages/authority/src/signature/policy-snapshot.ts
    - packages/authority/src/signature/sign-verify.test.ts
    - packages/authority/src/signature/index.ts
  modified:
    - packages/authority/src/index.ts

key-decisions:
  - "Applied Phase 2 Correction 3: SignatureEnvelope sub-hashes are authoritative for deterministic mismatch narrowing."
  - "Kept authority signature helpers pure: node:crypto is used for hashing; no filesystem imports exist under signature code."

patterns-established:
  - "canonicalForm dispatch goes through resolveCanonicalizer and unknown tags fail closed."
  - "ConfirmedIntent verification strips the signature field before recomputing the signed intent-body hash."

requirements-completed: [GOV-06]

duration: 1h 20m
completed: 2026-04-27
---

# Phase 2 Plan 05: Canonicalize and Signature Summary

**Fail-closed canonical JSON plus SHA-256 signed-intent verification with deterministic mismatch evidence.**

## Performance

- **Duration:** 1h 20m
- **Started:** 2026-04-27T14:39:00Z
- **Completed:** 2026-04-27T15:59:04Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments

- Added `json-c14n@1.0` canonicalization with pre-serialization validation for NaN, Infinity, -0, undefined, BigInt, Symbol keys, and non-plain objects.
- Added a canonical form registry so verifiers fail closed on unknown tags instead of falling back silently.
- Implemented signature value/envelope builders over `{ intent, resolvedEnvelope, policySnapshotHash }`, including deterministic component hashes.
- Implemented `verifyConfirmedIntentSignature` as the single central helper with structured mismatches for `intentBody`, `resolvedEnvelope`, `policySnapshotHash`, `canonicalForm`, and `algorithm`.
- Added `buildPolicySnapshot` and `hashPolicySnapshot` pure helpers for Plan 07 artifact writing.

## Task Commits

1. **Task 1 RED: Add canonicalization contract tests** - `f32d7f8` (test)
2. **Task 1 GREEN: Implement canonicalization registry** - `01ebd05` (feat)
3. **Task 2 RED: Add signature verifier tests** - `c7ea657` (test)
4. **Task 2 GREEN: Implement signature verification spine** - `a530cb7` (feat)

_Note: both tasks used TDD RED/GREEN commits._

## Files Created/Modified

- `packages/authority/src/signature/canonicalize.ts` - Validates and serializes the `json-c14n@1.0` canonical JSON subset.
- `packages/authority/src/signature/canonical-form-registry.ts` - Maps canonical form tags to canonicalizers and returns `null` for unknown tags.
- `packages/authority/src/signature/canonicalize.test.ts` - Covers stable ordering plus all 16 planned registry/anomaly cases.
- `packages/authority/src/signature/sign.ts` - Builds deterministic SHA-256 signature values and envelopes with component sub-hashes.
- `packages/authority/src/signature/verify.ts` - Central confirmed-intent verifier with fail-closed tag dispatch and structured mismatch evidence.
- `packages/authority/src/signature/policy-snapshot.ts` - Builds policy snapshots and canonical SHA-256 hashes.
- `packages/authority/src/signature/sign-verify.test.ts` - Covers round-trip verification, mismatch fields, wrong algorithm/tag, determinism, and policy snapshot hashing.
- `packages/authority/src/signature/index.ts` - Signature subdir barrel.
- `packages/authority/src/index.ts` - Re-exports the signature subdir barrel.

## Decisions Made

- Used `resolveCanonicalizer("json-c14n@1.0")` as the signature canonicalization dispatch path, even for signing, so signing and verification share the same registry-backed path.
- Returned deterministic mismatch fields by comparing current component hashes to the sub-hashes embedded by `buildSignatureEnvelope`.
- Reverted the lockfile drift caused by `pnpm install`; Plan 05 did not need dependency changes.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Applied deterministic sub-hash mismatch narrowing**
- **Found during:** Task 2
- **Issue:** The original plan text still contained heuristic mismatch wording, but `02-CORRECTIONS.md` made sub-hashes definitive.
- **Fix:** `buildSignatureEnvelope` records `intentHash`, `envelopeHash`, and `policySnapshotHash`; `verifyConfirmedIntentSignature` compares those first.
- **Files modified:** `packages/authority/src/signature/sign.ts`, `packages/authority/src/signature/verify.ts`, `packages/authority/src/signature/sign-verify.test.ts`
- **Verification:** `pnpm --filter @protostar/authority test` passed; sign-verify suite has 9 passing cases.
- **Committed in:** `a530cb7`

**2. [Rule 3 - Blocking] Restored workspace package links before runtime tests**
- **Found during:** Verification
- **Issue:** `node --test` could not resolve `@protostar/intent` until workspace links were refreshed.
- **Fix:** Ran `pnpm install`, then reverted unrelated `pnpm-lock.yaml` drift before committing Plan 05 work.
- **Files modified:** None retained.
- **Verification:** `pnpm --filter @protostar/authority test` passed after link refresh.
- **Committed in:** N/A

---

**Total deviations:** 2 auto-fixed (1 missing critical, 1 blocking)
**Impact on plan:** Both preserved the corrected Plan 05 contract and did not add new runtime dependencies or filesystem authority.

## Issues Encountered

- Wave 2 ran concurrently with Plans 04 and 06a. During Task 1 commit handling, a parallel admission-decision test was briefly swept into the Plan 05 GREEN commit history before later wave commits restored ownership. The final worktree is clean and final file ownership is correct, but the raw history shows interleaved same-branch commits from multiple executors.
- Early authority test runs were blocked by parallel-wave missing modules. Once those landed and workspace links were refreshed, all authority, full workspace, and factory smoke gates passed.

## Authentication Gates

None.

## Known Stubs

None.

## Threat Flags

None. Plan 05 intentionally introduced signature verification surface covered by the plan threat model; no filesystem or new network surface was added.

## Verification

- `pnpm --filter @protostar/authority test` - passed; 59 tests, 7 suites, 0 failures.
- `pnpm run verify` - passed; root typecheck, intent tests, and factory-cli tests green.
- `pnpm run verify:full` - passed; recursive workspace tests green.
- `pnpm run factory` - passed; sample factory command emitted a confirmed intent with `schemaVersion: "1.1.0"`.
- `grep -c 'CanonicalizationError' packages/authority/src/signature/canonicalize.ts` - `10`.
- `grep -c 'json-c14n@1.0' packages/authority/src/signature/canonical-form-registry.ts` - `1`.
- `grep -RIn "from ['\"]node:fs['\"]\\|from ['\"]fs['\"]" packages/authority/src/signature/ | grep -v '^#' | wc -l` - `0`.
- `grep -c 'verifyConfirmedIntentSignature' packages/authority/src/signature/verify.ts` - `1`.
- `grep -c 'buildPolicySnapshot' packages/authority/src/signature/policy-snapshot.ts` - `1`.
- `grep -c '"sha256"' packages/authority/src/signature/sign.ts` - `1`.
- `grep -c 'createHash' packages/authority/src/signature/sign.ts packages/authority/src/signature/policy-snapshot.ts | grep -v ':0'` - both files report `2`.

## Self-Check: PASSED

- Summary exists at `.planning/phases/02-authority-governance-kernel/02-05-canonicalize-and-signature-SUMMARY.md`.
- Created signature files exist under `packages/authority/src/signature/`.
- Task commits exist: `f32d7f8`, `01ebd05`, `c7ea657`, `a530cb7`.
- No tracked file deletions were introduced by Plan 05 final commits.
- Worktree was clean before planning metadata edits.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Plan 07 can mint signed confirmed intents using `buildSignatureEnvelope`, write policy snapshots using `buildPolicySnapshot`, and hand downstream readers a single verifier entrypoint via `verifyConfirmedIntentSignature`. Plan 09 can use the same helper for verify-on-read without adding a second canonicalization path.

---
*Phase: 02-authority-governance-kernel*
*Completed: 2026-04-27*
