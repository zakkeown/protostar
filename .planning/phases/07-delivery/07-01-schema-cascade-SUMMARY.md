---
phase: 07-delivery
plan: 01
subsystem: intent
tags: [confirmed-intent, schema, signature, delivery, admission]

requires:
  - phase: 02-authority-governance-kernel
    provides: json-c14n signature helpers and verified stage reader
  - phase: 05-review-repair-loop
    provides: delivery authorization and repair-loop budget envelope fields
provides:
  - ConfirmedIntent schemaVersion 1.5.0 with signed delivery target fields
  - deliveryWallClockMs budget support with 600000 ms default
  - Re-signed confirmed-intent example fixtures for schema 1.5.0
affects: [07-delivery, factory-cli, admission-e2e, authority, intent]

tech-stack:
  added: []
  patterns:
    - Signed fixture regeneration via Phase 2 json-c14n helpers
    - Parser defaults must be included in signed test fixtures before verification

key-files:
  created:
    - packages/admission-e2e/src/signed-intent-1-5-0.test.ts
  modified:
    - packages/intent/schema/confirmed-intent.schema.json
    - packages/intent/src/capability-envelope.ts
    - packages/intent/src/capability-normalization.ts
    - packages/intent/src/confirmed-intent.ts
    - examples/intents/scaffold.json
    - examples/intents/bad/missing-capability.json

key-decisions:
  - "delivery.target remains optional at capabilityEnvelope level; target fields are required only when delivery is present."
  - "deliveryWallClockMs defaults to 600000 during parse/normalization so signed post-parse fixtures verify consistently."

patterns-established:
  - "ConfirmedIntent schema bumps must cascade through parser defaults, signature fixtures, and stage-reader tests in one pass."

requirements-completed: [DELIVER-01, DELIVER-02]

duration: 12min
completed: 2026-04-28
---

# Phase 7 Plan 01: Schema Cascade Summary

**ConfirmedIntent 1.5.0 schema cascade with signed delivery target and delivery wall-clock budget support**

## Performance

- **Duration:** 12 min
- **Started:** 2026-04-28T13:27:45Z
- **Completed:** 2026-04-28T13:39:50Z
- **Tasks:** 3
- **Files modified:** 24

## Accomplishments

- Bumped ConfirmedIntent source/test contract to `schemaVersion: "1.5.0"`.
- Added parser/type/normalization support for `capabilityEnvelope.delivery.target` and `budget.deliveryWallClockMs`.
- Re-signed both confirmed example fixtures through the json-c14n signature helpers.

## Task Commits

1. **Task 1: Bump schema constant + add delivery fields** - `23d12c0` (concurrent 07-02 commit included the schema file)
2. **Task 2: Cascade 1.4.0 source/test literals** - `014e0c5` (feat)
3. **Task 3: Re-sign confirmed intent fixtures** - `926252c` (fix)
4. **Verification fix:** `94c53a7` (fix)

## Files Created/Modified

- `packages/intent/schema/confirmed-intent.schema.json` - Schema const at 1.5.0; adds delivery target and delivery wall-clock budget.
- `packages/intent/src/capability-envelope.ts` - Parses/copies delivery target and delivery wall-clock budget.
- `packages/intent/src/capability-normalization.ts` - Normalizes deliveryWallClockMs default.
- `packages/intent/src/confirmed-intent.ts` - Mints/parses 1.5.0 ConfirmedIntent values.
- `packages/admission-e2e/src/signed-intent-1-5-0.test.ts` - Renamed signed-intent contract test.
- `examples/intents/scaffold.json` - Re-signed fixture; signature value `86af56d0aab00c516b17294c0815b0fc9605864fec38c45be37b020f34929844`.
- `examples/intents/bad/missing-capability.json` - Re-signed negative fixture; signature value `82f77f8f749d48f022fc575c3386cb81e8afb6878a5e7f2f75109850b226dee0`.

## Decisions Made

Followed plan-specified optional delivery envelope shape. Added adjacent parser/type support because schema-only delivery fields would otherwise be rejected as unknown keys.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added parser/type support for new schema fields**
- **Found during:** Task 2
- **Issue:** The plan listed the JSON schema but not the parser/type files that reject unknown delivery and budget keys.
- **Fix:** Added `delivery.target` and `deliveryWallClockMs` support to capability envelope types, parser, copy, and normalization.
- **Files modified:** `packages/intent/src/models.ts`, `packages/intent/src/capability-envelope.ts`, `packages/intent/src/capability-normalization.ts`, `packages/intent/src/confirmed-intent.ts`
- **Verification:** `pnpm --filter @protostar/intent test`
- **Committed in:** `014e0c5`

**2. [Rule 1 - Bug] Updated signed test fixtures to include post-parse default budget field**
- **Found during:** Task 3 verification
- **Issue:** Stage-reader and two-key launch signature tests signed the pre-1.5.0 shape, then parsed into a shape with default `deliveryWallClockMs`, causing signature mismatches.
- **Fix:** Added `deliveryWallClockMs: 600000` to signed test envelopes.
- **Files modified:** `packages/authority/src/stage-reader/factory.test.ts`, `packages/admission-e2e/src/authority-governance-kernel.e2e.test.ts`, `packages/admission-e2e/src/signed-confirmed-intent.e2e.test.ts`, `apps/factory-cli/src/two-key-launch.test.ts`
- **Verification:** `pnpm --filter @protostar/authority test`, `pnpm --filter @protostar/admission-e2e test`, `pnpm --filter @protostar/factory-cli test`
- **Committed in:** `014e0c5`, `94c53a7`

**Total deviations:** 2 auto-fixed. **Impact on plan:** Both fixes were required for the schema bump to be operational and signature-verifiable.

## Issues Encountered

- Parallel Phase 7 agents committed schema/config work while this plan ran. The Task 1 schema file is present and verified, but the actual schema commit is `23d12c0` from a concurrent 07-02 commit rather than a dedicated 07-01 commit.
- A stale compiled `dist/signed-intent-1-4-0.test.js` artifact made admission-e2e run the removed test name once. Removing the generated stale dist file resolved it; no source deletion beyond the planned rename was needed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Downstream Phase 7 delivery work can rely on signed `capabilityEnvelope.delivery.target` and `budget.deliveryWallClockMs`. Delivery preflight plans should read `delivery.target` from the confirmed envelope and treat missing delivery as "not delivery-authorized yet," not as a schema failure.

## Known Stubs

None.

## Verification

- `node -e` schema shape check: passed.
- `pnpm --filter @protostar/intent build`: passed.
- `pnpm --filter @protostar/intent test`: passed.
- `pnpm --filter @protostar/authority test`: passed.
- `pnpm --filter @protostar/admission-e2e test`: passed.
- `pnpm --filter @protostar/factory-cli test`: passed.
- `pnpm run verify`: passed.
- Source/test grep for `"1.4.0"` under `packages/` and `apps/`: zero matches.
- Direct fixture verification with `verifyConfirmedIntentSignature`: passed for both signed JSON fixtures.

## Self-Check: PASSED

- Summary file exists.
- Required fixture files exist and contain `schemaVersion: "1.5.0"`.
- Commits `014e0c5`, `926252c`, and `94c53a7` exist in current history.
- Schema field additions are present in `packages/intent/schema/confirmed-intent.schema.json`.

---
*Phase: 07-delivery*
*Completed: 2026-04-28*
