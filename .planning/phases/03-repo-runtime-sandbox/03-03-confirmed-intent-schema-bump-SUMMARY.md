---
phase: 03-repo-runtime-sandbox
plan: 03
subsystem: intent-schema
tags: [confirmed-intent, capability-envelope, allowDirty, schema-version, authority, planning]

requires:
  - phase: 02-authority-governance-kernel
    provides: [signed confirmed-intent envelope, authority stage reader, precedence envelope flow]
  - phase: 03-repo-runtime-sandbox
    provides: [03-01 dependencies/env posture, 03-02 paths carve-out]
provides:
  - confirmed-intent schemaVersion 1.2.0
  - capabilityEnvelope.workspace.allowDirty defaulting contract
  - downstream authority/admission/planning fixture cascade for schema 1.2.0
affects: [phase-03, phase-04, dirty-worktree-policy, signed-intent-verification]

tech-stack:
  added: []
  patterns: [hard schema-version bump, parser default-fill with closed sub-object keys, signed-intent canonical body preservation]

key-files:
  created:
    - .planning/phases/03-repo-runtime-sandbox/03-03-confirmed-intent-schema-bump-SUMMARY.md
  modified:
    - packages/intent/schema/confirmed-intent.schema.json
    - packages/intent/src/capability-envelope.ts
    - packages/intent/src/confirmed-intent.ts
    - packages/intent/src/capability-normalization.ts
    - packages/authority/src/precedence/intersect.ts
    - packages/authority/src/stage-reader/factory.ts
    - packages/planning/src/index.ts
    - examples/intents/scaffold.json
    - examples/intents/bad/missing-capability.json

key-decisions:
  - "ConfirmedIntent is hard-bumped to 1.2.0; parser rejects 1.1.0 rather than silently upconverting."
  - "Mint/sign paths emit workspace.allowDirty=false explicitly so signed canonical intent bodies remain stable after parse."
  - "Planning task required-capabilities preserve workspace only when present instead of adding the confirmed-intent default to every task envelope."

patterns-established:
  - "Capability envelope additions must cascade through mint, parse, signing, precedence, fixtures, and planning-admission copies."
  - "Defaulted fields that participate in signature verification should be materialized before signing."

requirements-completed: [REPO-06]

duration: 12m
completed: 2026-04-27
---

# Phase 03 Plan 03: Confirmed Intent Schema Bump Summary

**ConfirmedIntent 1.2.0 with workspace.allowDirty defaulting, hard legacy rejection, and downstream signed-envelope parity**

## Performance

- **Duration:** 12m
- **Started:** 2026-04-27T20:11:02Z
- **Completed:** 2026-04-27T20:23:13Z
- **Tasks:** 3
- **Files modified:** 26

## Accomplishments

- Bumped confirmed-intent schema, TS literal types, parser, mint helper, promotion, and test builders from `1.1.0` to `1.2.0`.
- Added `CapabilityEnvelopeWorkspace.allowDirty` with parser default-fill to `{ allowDirty: false }`, boolean validation, and unknown-key rejection.
- Added allowDirty parser tests for true round-trip, absent default, non-boolean rejection, and closed-key rejection.
- Cascaded the new default through authority precedence, stage-reader fixtures, admission-e2e signed fixtures, planning exact-envelope preservation, and examples.
- Final source audit found no live `"1.1.0"` literals outside ignored generated/planning areas.

## Task Commits

1. **Task 1: Bump JSON schema, TS types, parser, mint helper to 1.2.0 + add allowDirty** - `4642f60` (feat)
2. **Task 2: Update intent test fixtures + add allowDirty test cases** - `a275a01` (test)
3. **Task 3: Audit + update factory-cli and admission-e2e and example fixtures** - `64d4dec` (fix)

## Files Created/Modified

- `packages/intent/schema/confirmed-intent.schema.json` - Pins `schemaVersion` to `1.2.0`.
- `packages/intent/src/capability-envelope.ts` - Adds `CapabilityEnvelopeWorkspace` and parses/defaults `workspace.allowDirty`.
- `packages/intent/src/confirmed-intent.ts` - Hard-rejects non-1.2.0 confirmed intents and materializes workspace default during mint/copy.
- `packages/intent/src/capability-normalization.ts` - Emits default workspace false for admitted draft capability envelopes.
- `packages/intent/src/confirmed-intent.test.ts` - Adds allowDirty true/default/rejection coverage.
- `packages/authority/src/precedence/*` - Preserves/intersects workspace dirty permission through resolved envelopes.
- `packages/authority/src/stage-reader/factory.ts` - Updates legacy stage-reader upconversion output to 1.2.0.
- `packages/admission-e2e/src/*.test.ts` - Updates signed fixtures and governance kernel expectations to 1.2.0/default workspace.
- `packages/planning/src/index.ts` - Allows planning task required-capabilities to preserve workspace when present.
- `examples/intents/scaffold.json` and `examples/intents/bad/missing-capability.json` - Add explicit `schemaVersion: "1.2.0"` and `workspace.allowDirty=false`.

## Decisions Made

- Hard cut retained: `1.1.0` confirmed intents are now invalid at the parser boundary.
- The JSON schema remains minimally structural for `capabilityEnvelope`; TypeScript parser validation owns the closed `workspace` object.
- Examples that are confirmed-intent shaped now include the new field explicitly; draft fixtures remain draft-shaped and intentionally do not gain confirmed-intent `schemaVersion`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Signed intent canonical body mismatch after default-fill**
- **Found during:** Task 3 verification
- **Issue:** `pnpm run verify:full` exposed factory trusted-launch failures because parsing default-filled `workspace.allowDirty=false` after signing, changing the canonical intent body.
- **Fix:** Materialized the default workspace object during `mintConfirmedIntent`, normalized cosmetic admission grants with workspace false, and preserved workspace through authority precedence copies.
- **Files modified:** `packages/intent/src/confirmed-intent.ts`, `packages/intent/src/capability-normalization.ts`, `packages/authority/src/precedence/*`
- **Verification:** `pnpm --filter @protostar/factory-cli test`, `pnpm run verify:full`
- **Committed in:** `64d4dec`

**2. [Rule 3 - Blocking] Downstream authority/admission/planning fixtures still used legacy schema shape**
- **Found during:** Task 2/3 verification
- **Issue:** Authority, admission-e2e, and planning contract tests pinned pre-1.2.0 fixture bodies or dropped the new workspace field when comparing exact envelopes.
- **Fix:** Updated fixtures and expectations; planning preserves workspace only when the task requirement carries it.
- **Files modified:** `packages/authority/src/stage-reader/factory.test.ts`, `packages/authority/src/signature/sign-verify.test.ts`, `packages/admission-e2e/src/*.test.ts`, `packages/planning/src/index.ts`, `packages/planning/src/task-required-capabilities-admission.test.ts`
- **Verification:** `pnpm --filter @protostar/authority test`, `pnpm --filter @protostar/admission-e2e test`, `pnpm --filter @protostar/planning test`, `pnpm run verify:full`
- **Committed in:** `64d4dec`

---

**Total deviations:** 2 auto-fixed (Rule 3)
**Impact on plan:** Both fixes were required to preserve signed-intent correctness and downstream contract parity; no architectural change.

## Verification

- `pnpm --filter @protostar/intent test` - passed
- `pnpm --filter @protostar/authority test` - passed
- `pnpm --filter @protostar/admission-e2e test` - passed
- `pnpm --filter @protostar/planning test` - passed
- `pnpm --filter @protostar/factory-cli test` - passed
- `pnpm run verify:full` - passed
- `pnpm run verify` - passed
- `grep -c '"1.2.0"' packages/intent/schema/confirmed-intent.schema.json` - `1`
- `grep -c "allowDirty" packages/intent/src/capability-envelope.ts` - `9`
- `rg -n '"1\.1\.0"' apps packages examples --glob '!**/dist/**' --glob '!**/node_modules/**' --glob '!**/.planning/**'` - no matches
- `pnpm run factory` - expected exit 2 at workspace-trust gate after build: `workspace-trust gate blocked: workspace is not trusted; escalation required before factory can proceed`

## Known Stubs

None found in files created or modified by this plan.

## Threat Flags

None. This plan changes an existing confirmed-intent trust boundary and does not add a new network, filesystem, auth, or schema boundary beyond the planned `workspace.allowDirty` field.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Wave 1 dirty-worktree work can now consume `intent.capabilityEnvelope.workspace.allowDirty` with a default-deny posture. Downstream signed-intent verification remains stable because defaulted workspace state is present before canonical signing.

## Self-Check: PASSED

- Summary file exists at `.planning/phases/03-repo-runtime-sandbox/03-03-confirmed-intent-schema-bump-SUMMARY.md`.
- Task commits found: `4642f60`, `a275a01`, `64d4dec`.
- No tracked deletions were introduced by the final task commit.

---
*Phase: 03-repo-runtime-sandbox*
*Completed: 2026-04-27*
