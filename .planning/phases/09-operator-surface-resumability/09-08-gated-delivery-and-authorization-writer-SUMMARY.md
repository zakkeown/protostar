---
phase: 09-operator-surface-resumability
plan: 08
subsystem: operator-surface
tags: [factory-cli, gated-delivery, authorization-payload, review-gate, resumability]

requires:
  - phase: 07-delivery-runtime
    provides: [delivery runtime, branch naming, delivery body assembly]
  - phase: 09-operator-surface-resumability
    provides: [CLI primitives, widened FactoryRunStatus, status and cancel surfaces]
provides:
  - AuthorizationPayload schema persisted as validator input, not authorization brand
  - reAuthorizeFromPayload validator path for future deliver command resume
  - delivery.mode config and --delivery-mode CLI override
  - ready-to-release authorization.json write site for auto and gated delivery modes
affects: [factory-cli, delivery, review, lmstudio-adapter, phase-09-plan-09]

tech-stack:
  added: []
  patterns: [canonical sorted JSON payloads, injected review-decision reader, atomic tmp-rename delivery artifact writes]

key-files:
  created:
    - packages/delivery/src/authorization-payload.ts
    - packages/delivery/src/authorization-payload.test.ts
  modified:
    - apps/factory-cli/src/main.ts
    - apps/factory-cli/src/commands/run.ts
    - apps/factory-cli/src/load-factory-config.ts
    - apps/factory-cli/src/main.real-execution.test.ts
    - apps/factory-cli/src/load-factory-config.test.ts
    - packages/delivery/package.json
    - packages/delivery/src/index.ts
    - packages/delivery/src/delivery-contract.ts
    - packages/delivery/src/delivery-contract.test.ts
    - packages/delivery/src/pr-body/compose-judge-panel.ts
    - packages/delivery/src/pr-body/compose-judge-panel.test.ts
    - packages/delivery/src/pr-body/compose-mechanical-summary.ts
    - packages/delivery/src/pr-body/compose-mechanical-summary.test.ts
    - packages/delivery/src/pr-body/compose-score-sheet.ts
    - packages/delivery/src/pr-body/compose-score-sheet.test.ts
    - packages/delivery/tsconfig.json
    - packages/review/package.json
    - packages/review/src/delivery-authorization.ts
    - packages/review/src/delivery-authorization.test.ts
    - packages/review/src/index.ts
    - packages/lmstudio-adapter/src/factory-config.ts
    - packages/lmstudio-adapter/src/factory-config.schema.json
    - packages/lmstudio-adapter/src/factory-config.test.ts
    - pnpm-lock.yaml

key-decisions:
  - "Persist only AuthorizationPayload validator inputs; DeliveryAuthorization remains a runtime brand minted by review validation."
  - "Gated mode writes authorization.json and pauses before delivery-runtime; auto mode writes the same artifact before existing delivery."
  - "Review now depends on delivery's pure payload type; delivery no longer imports review types to preserve package boundaries."

patterns-established:
  - "Resume artifacts are canonical JSON inputs that can be revalidated rather than trusted as authority."
  - "CLI delivery mode precedence is CLI override, then factory-config.json, then default auto."

requirements-completed: [OP-06, OP-07]

duration: 15min
completed: 2026-04-28T19:21:07Z
---

# Phase 09 Plan 08: Gated Delivery and Authorization Writer Summary

**Gated delivery now writes a canonical authorization payload at ready-to-release, while reauthorization always re-runs the review validator before minting the DeliveryAuthorization brand**

## Performance

- **Duration:** 15 min
- **Started:** 2026-04-28T19:06:33Z
- **Completed:** 2026-04-28T19:21:07Z
- **Tasks:** 2
- **Files modified:** 25

## Accomplishments

- Added `AuthorizationPayload` and `isAuthorizationPayload` in delivery, exported through the delivery package and subpath.
- Added `reAuthorizeFromPayload` in review so Plan 09-09 can re-mint authorization by reading and validating the persisted review decision.
- Added `delivery.mode` support in factory config plus `--delivery-mode <auto|gated>` on the run command with CLI-over-config precedence.
- Wired factory-cli to atomically write `runs/<id>/delivery/authorization.json` before auto delivery and to pause with the required stderr hint in gated mode.

## Task Commits

1. **Task 1 RED: Authorization payload tests** - `f53f594` (test)
2. **Task 1 GREEN: Authorization payload validator** - `d2db8d1` (feat)
3. **Task 2 RED: Gated delivery tests** - `045b189` (test)
4. **Task 2 GREEN: Gated delivery writer** - `84c116b` (feat)

**Plan metadata:** committed separately after this summary was written.

## Files Created/Modified

- `packages/delivery/src/authorization-payload.ts` - Pure persisted payload schema and type guard.
- `packages/delivery/src/authorization-payload.test.ts` - Payload accept/reject coverage for required fields and branch format.
- `packages/review/src/delivery-authorization.ts` - Documented legitimate callers and added the reauthorization validator entrypoint.
- `packages/review/src/delivery-authorization.test.ts` - Reauthorization happy path and reject path coverage.
- `packages/lmstudio-adapter/src/factory-config.ts` - Runtime config parsing for `delivery.mode`.
- `packages/lmstudio-adapter/src/factory-config.schema.json` - JSON schema enum for `delivery.mode`.
- `apps/factory-cli/src/load-factory-config.ts` - Delivery mode resolver with CLI > config > default precedence.
- `apps/factory-cli/src/commands/run.ts` - `--delivery-mode` option and parser.
- `apps/factory-cli/src/main.ts` - Authorization payload construction, atomic write, gated pause, and auto-mode pre-delivery write.
- `packages/delivery/src/pr-body/*` and `packages/delivery/src/delivery-contract*` - Local structural delivery types after breaking delivery's review dependency.
- `pnpm-lock.yaml` - Workspace dependency graph updates after moving the pure payload type into delivery.

## Decisions Made

- Authorization persistence is intentionally an input-only artifact. The `DeliveryAuthorization` brand is never serialized and is always minted through review validation.
- Gated mode avoids delivery-runtime preflight and external delivery side effects, writes the payload from the admitted repo runtime state, emits the exact operator hint, and exits successfully.
- Auto mode preserves Phase 7 behavior while writing the same payload before invoking delivery-runtime.
- The package dependency direction is `review -> delivery` for the pure payload type. Delivery uses local structural types where it previously imported review types, avoiding a package cycle.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Removed delivery-to-review package cycle**
- **Found during:** Task 1 (AuthorizationPayload type + reAuthorizeFromPayload validator entrypoint)
- **Issue:** Adding `@protostar/delivery` to `@protostar/review` exposed an existing reverse dependency from delivery source/tests to review types, creating a workspace cycle.
- **Fix:** Kept `AuthorizationPayload` in delivery, moved delivery's review-shaped imports to local structural types, removed delivery's review package dependency and tsconfig reference.
- **Files modified:** `packages/delivery/package.json`, `packages/delivery/tsconfig.json`, `packages/delivery/src/index.ts`, `packages/delivery/src/delivery-contract.ts`, `packages/delivery/src/delivery-contract.test.ts`, `packages/delivery/src/pr-body/*`
- **Verification:** `pnpm install`, delivery build/test, review build/test all passed.
- **Committed in:** `d2db8d1`

**2. [Rule 3 - Blocking] Reran lmstudio-adapter tests outside sandbox loopback restriction**
- **Found during:** Task 2 (factory-config.json delivery.mode + --delivery-mode CLI override + ready-to-release write site + gated pause)
- **Issue:** The lmstudio-adapter test suite opens a loopback listener and failed in the sandbox with `listen EPERM`.
- **Fix:** Reran the same test command with approved escalation so the suite could bind loopback.
- **Files modified:** None.
- **Verification:** `pnpm --filter @protostar/lmstudio-adapter test` passed.
- **Committed in:** No code commit; verification-only deviation.

---

**Total deviations:** 2 auto-fixed (2 Rule 3)
**Impact on plan:** Both were required to complete the planned validator and config work without weakening the delivery/review authority boundary.

## TDD Gate Compliance

- Task 1 RED commit present before GREEN: `f53f594` -> `d2db8d1`.
- Task 2 RED commit present before GREEN: `045b189` -> `84c116b`.

## Verification

- `pnpm install` - passed.
- `pnpm --filter @protostar/delivery build` - passed.
- `pnpm --filter @protostar/delivery test` - passed.
- `pnpm --filter @protostar/review build` - passed.
- `pnpm --filter @protostar/review test` - passed.
- `pnpm --filter @protostar/lmstudio-adapter test` - passed after loopback escalation.
- `pnpm --filter @protostar/factory-cli build` - passed.
- `pnpm --filter @protostar/factory-cli test` - passed.
- `pnpm --filter @protostar/delivery test && pnpm --filter @protostar/review test && pnpm --filter @protostar/factory-cli test` - passed.
- `pnpm run verify` - passed.

## Acceptance Criteria

- `export interface AuthorizationPayload` appears once in `packages/delivery/src/authorization-payload.ts`.
- `isAuthorizationPayload` is exported and exercised by delivery tests.
- `"./authorization-payload"` appears once in `packages/delivery/package.json`.
- `reAuthorizeFromPayload` is implemented in review and exported from the review barrel.
- The delivery authorization comment contains `Legitimate callers: runReviewRepairLoop`.
- `gate-not-pass`, `runId-mismatch`, and `decision-missing` reject paths are covered.
- `delivery.mode` accepts `auto` and `gated`, rejects invalid values, and defaults to `auto`.
- `--delivery-mode` overrides config, rejects invalid values, and is wired into the run command.
- Gated delivery writes `delivery/authorization.json`, emits the required hint, exits 0, and avoids delivery-runtime.
- Auto delivery writes `delivery/authorization.json` before continuing through the existing delivery path.

## Known Stubs

None.

## Threat Flags

None. The new filesystem write and review reauthorization surface are the planned Q-20/Q-21 delivery-resume artifacts; no new network endpoint, auth path, or merge authority was introduced.

## Issues Encountered

- `.planning/ROADMAP.md` and `.planning/STATE.md` had pre-existing unrelated edits, so they were preserved and left out of the plan commits.
- Unrelated untracked Phase 10.1 and Phase 11 planning directories were also preserved.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Plan 09-09 can build `protostar-factory deliver` on top of `authorization.json` and `reAuthorizeFromPayload`, re-minting the brand from validator inputs instead of trusting persisted authority.

## Self-Check: PASSED

- Summary file exists at `.planning/phases/09-operator-surface-resumability/09-08-gated-delivery-and-authorization-writer-SUMMARY.md`.
- Key created source file exists at `packages/delivery/src/authorization-payload.ts`.
- Task commits found: `f53f594`, `d2db8d1`, `045b189`, `84c116b`.

---
*Phase: 09-operator-surface-resumability*
*Completed: 2026-04-28*
