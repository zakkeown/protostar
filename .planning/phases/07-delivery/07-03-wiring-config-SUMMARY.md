---
phase: 07-delivery
plan: 03
subsystem: delivery wiring
tags: [github, factory-config, intent, authority, tdd]

requires:
  - phase: 06-live-dogpile-piles
    provides: dogpile-adapter network-only authority pattern and factory-config piles shape
provides:
  - AGENTS.md authority-tier text covering @protostar/delivery-runtime
  - PROTOSTAR_GITHUB_TOKEN documentation in .env.example
  - factory-config delivery.requiredChecks schema and resolver support
  - computeDeliveryAllowedHosts helper exported from @protostar/intent
affects: [delivery-runtime, factory-cli, intent, lmstudio-adapter]

tech-stack:
  added: []
  patterns:
    - TDD red/green commits for config parsing and pure intent helper
    - Frozen pure host-list computation

key-files:
  created:
    - packages/intent/src/compute-delivery-allowed-hosts.ts
    - packages/intent/src/compute-delivery-allowed-hosts.test.ts
  modified:
    - AGENTS.md
    - .env.example
    - packages/lmstudio-adapter/src/factory-config.schema.json
    - packages/lmstudio-adapter/src/factory-config.ts
    - packages/lmstudio-adapter/src/factory-config.test.ts
    - packages/intent/src/index.ts

key-decisions:
  - "computeDeliveryAllowedHosts includes github.com by default because isomorphic-git push uses https://github.com/{owner}/{repo}.git, not api.github.com."
  - "delivery.requiredChecks remains optional; absent delivery stays undefined, while present delivery without requiredChecks resolves to an empty array."
  - "AGENTS.md Task 1 content was satisfied by a parallel 07-02 commit, so 07-03 records an empty audit commit rather than altering 07-02-owned files."

patterns-established:
  - "Network-permitted packages must ship no-fs contract tests; delivery-runtime also carries the no-merge invariant."
  - "Factory config extension preserves additionalProperties: false and validates nested arrays manually in the resolver."

requirements-completed: [DELIVER-01, DELIVER-04]

duration: 10min
completed: 2026-04-28
---

# Phase 7 Plan 03: Wiring Config Summary

**Delivery wiring now has token docs, required-check config parsing, and a frozen GitHub host allowlist helper for downstream delivery plans.**

## Performance

- **Duration:** 10 min
- **Started:** 2026-04-28T13:28:22Z
- **Completed:** 2026-04-28T13:37:58Z
- **Tasks:** 4
- **Files modified:** 7

## Accomplishments

- Added the Phase 7 authority-tier language to AGENTS.md, including `@protostar/delivery-runtime`, no-fs contract expectations, and the no-merge contract invariant.
- Replaced legacy `.env.example` `GITHUB_PAT=` guidance with `PROTOSTAR_GITHUB_TOKEN=` and documented classic/fine-grained PAT scopes plus forbidden admin scopes.
- Extended factory config with `delivery.requiredChecks` and four TDD test cases covering accept, empty-string reject, omitted delivery, and unknown-key reject.
- Added `computeDeliveryAllowedHosts` in `@protostar/intent`, returning frozen GitHub host lists with optional uploads support.

## Task Commits

1. **Task 1: Update AGENTS.md authority tiers** - `05216fa` (docs, empty audit commit; content landed by parallel `23d12c0`)
2. **Task 2: Document PROTOSTAR_GITHUB_TOKEN** - `bb2640f` (docs)
3. **Task 3 RED: factory delivery config tests** - `5ae3d6c` (test)
4. **Task 3 GREEN: delivery.requiredChecks schema/parser** - `5e5ccaa` (feat)
5. **Task 4 RED: delivery allowed hosts tests** - `069c50a` (test)
6. **Task 4 GREEN: computeDeliveryAllowedHosts helper** - `c31f1d7` (feat)

## Files Created/Modified

- `AGENTS.md` - Authority tiers include network-permitted/fs-forbidden delivery-runtime and no-merge contract language.
- `.env.example` - Namespaced GitHub PAT documentation with scope and format guidance.
- `packages/lmstudio-adapter/src/factory-config.schema.json` - Adds optional `delivery.requiredChecks` object with closed nested keys.
- `packages/lmstudio-adapter/src/factory-config.ts` - Adds `DeliveryConfig`, parser merge, and validation for non-empty required check names.
- `packages/lmstudio-adapter/src/factory-config.test.ts` - Adds four behavior tests for delivery config.
- `packages/intent/src/compute-delivery-allowed-hosts.ts` - Pure frozen host-list helper.
- `packages/intent/src/compute-delivery-allowed-hosts.test.ts` - Four behavior tests for absent delivery, default hosts, uploads, and frozen output.
- `packages/intent/src/index.ts` - Barrel re-export for the helper and `DeliveryEnvelope`.

## Decisions Made

- Kept `delivery` undefined when omitted from factory config, while resolving `delivery: {}` to `requiredChecks: []`.
- Used JSON Schema `description` for the Phase 7 Q-15 comment because `factory-config.schema.json` cannot contain comments.
- Added an empty 07-03 audit commit for Task 1 because the actual AGENTS.md content landed in parallel 07-02 work before this plan finished.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Recovered from parallel staged/HEAD movement**
- **Found during:** Tasks 1-3
- **Issue:** Parallel Wave 0 work advanced HEAD and left unrelated files staged, which initially risked mixed commits.
- **Fix:** Cleared the index before every 07-03 commit and staged only owned files. Re-created the TDD RED/GREEN sequence from the current branch tip.
- **Files modified:** None beyond owned 07-03 files.
- **Verification:** `git show --name-only` confirmed each 07-03 commit contains only intended files.
- **Committed in:** `bb2640f`, `5ae3d6c`, `5e5ccaa`, `069c50a`, `c31f1d7`, `05216fa`

**2. [Rule 3 - Blocking] Used escalated loopback for lmstudio-adapter package tests**
- **Found during:** Task 3 verification
- **Issue:** Sandbox blocked package tests that bind `127.0.0.1` with `listen EPERM`.
- **Fix:** Ran the package test with approved escalation for local loopback server binding.
- **Files modified:** None.
- **Verification:** `pnpm --filter @protostar/lmstudio-adapter test` passed with 70/70 tests.
- **Committed in:** N/A

---

**Total deviations:** 2 auto-fixed (Rule 3).
**Impact on plan:** No scope expansion; all changes stayed within 07-03-owned files except AGENTS.md content that parallel 07-02 had already landed.

## Issues Encountered

- `pnpm run verify` failed in out-of-scope factory-cli two-key-launch tests after all 07-03-focused checks passed. Failing assertions expected `intent-body-mismatch` / success but received `signature-mismatch`; these are in files owned by concurrent Phase 7 work, not 07-03.

## Verification

- `grep` acceptance checks for AGENTS.md: passed (`@protostar/delivery-runtime`=2, `no-merge.contract.test.ts`=1, `network-permitted`=3, `@protostar/dogpile-adapter`=1).
- `.env.example` acceptance checks: passed (`PROTOSTAR_GITHUB_TOKEN`=1, `github_pat_`=1, `admin:org`=1, `^GITHUB_PAT=`=0, no real-looking token).
- Factory config acceptance checks: passed (`"requiredChecks"`=1, `"delivery"`=1, `delivery?:`=2).
- Intent helper acceptance checks: passed (file exists, exported function=1, `github.com` mentions=4, barrel export=1).
- `pnpm --filter @protostar/lmstudio-adapter build && node --test packages/lmstudio-adapter/dist/src/factory-config.test.js`: passed, 12/12.
- `pnpm --filter @protostar/lmstudio-adapter test`: passed, 70/70, with loopback escalation.
- `pnpm --filter @protostar/intent test`: passed, 141/141.
- `pnpm run verify`: failed out of scope in `apps/factory-cli/dist/two-key-launch.test.js` with 144/146 factory-cli tests passing.

## Known Stubs

None.

## Threat Flags

None.

## User Setup Required

None - no external service configuration required for these wiring artifacts.

## Next Phase Readiness

Wave 1 delivery-runtime and factory-cli delivery wiring can consume `delivery.requiredChecks`, `PROTOSTAR_GITHUB_TOKEN`, and `computeDeliveryAllowedHosts`. Root verify should be retried after the concurrent factory-cli two-key-launch changes settle.

## Self-Check: PASSED

- Summary file exists at `.planning/phases/07-delivery/07-03-wiring-config-SUMMARY.md`.
- Created files exist: `packages/intent/src/compute-delivery-allowed-hosts.ts`, `packages/intent/src/compute-delivery-allowed-hosts.test.ts`.
- 07-03 commits present: `05216fa`, `bb2640f`, `5ae3d6c`, `5e5ccaa`, `069c50a`, `c31f1d7`.
- Acceptance grep checks passed for AGENTS.md, `.env.example`, factory config, and intent helper.

---
*Phase: 07-delivery*
*Completed: 2026-04-28*
