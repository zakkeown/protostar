---
phase: 02-authority-governance-kernel
plan: 04
subsystem: governance
tags: [authority, precedence, repo-policy, tdd, typescript]

requires:
  - phase: 02-authority-governance-kernel
    provides: Authorized operation brand patterns and authority package skeleton
provides:
  - Strict precedence intersection kernel across confirmed intent, policy, repo-policy, and operator-settings tiers
  - Branded PrecedenceDecision values with private mint and full blockedBy evidence
  - Pure repo-policy parser plus DENY_ALL_REPO_POLICY fallback for absent repo-policy files
affects: [phase-2-authority, phase-3-repo-runtime, factory-cli-plan-07, admission-e2e-contracts]

tech-stack:
  added: []
  patterns:
    - Pure authority parsers that accept unknown input and perform no filesystem reads
    - Strictest-wins tier intersection with non-unique denial evidence
    - Module-private brand mints hidden from public barrels

key-files:
  created:
    - packages/authority/src/precedence/index.ts
    - packages/authority/src/precedence/tiers.ts
    - packages/authority/src/precedence/precedence-decision.ts
    - packages/authority/src/precedence/intersect.ts
    - packages/authority/src/precedence/precedence.test.ts
    - packages/authority/src/repo-policy/index.ts
    - packages/authority/src/repo-policy/parse.ts
    - packages/authority/src/repo-policy/repo-policy.test.ts
  modified:
    - packages/authority/src/index.ts
    - packages/authority/src/internal/brand-witness.ts
    - packages/authority/src/internal/test-builders.ts

key-decisions:
  - "TierEnvelope accepts repo-policy-shaped contributions directly so DENY_ALL_REPO_POLICY can be supplied as the repo-policy tier without filesystem coupling."
  - "Absent repo-policy defaults to DENY_ALL via allowedScopes: [] plus trustOverride: untrusted, matching the A3 lock over the research default-permissive assumption."
  - "blockedBy records every tier that contributes a denial, preserving Q-02's non-unique evidence requirement."

patterns-established:
  - "Intersection code normalizes tier contributions to the current CapabilityEnvelope axes: repoScopes, toolPermissions, executeGrants, and budget."
  - "Repo policy validation is hand-rolled, schema-version pinned, additionalProperties=false, and dependency-free."

requirements-completed: [GOV-01]

duration: 32min
completed: 2026-04-27
---

# Phase 2 Plan 04: Precedence Kernel Summary

**Strict governance precedence now intersects all authority tiers, preserves full denial evidence, and fail-closes missing repo policy through DENY_ALL_REPO_POLICY.**

## Performance

- **Duration:** 32 min
- **Started:** 2026-04-27T15:27:00Z
- **Completed:** 2026-04-27T15:58:56Z
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments

- Added `intersectEnvelopes` with GOV-01 tier ordering and strict intersection for repo scopes, tool permissions, execute grants, and budget caps.
- Added branded `PrecedenceDecision` output with frozen runtime data, internal witness/test builder support, and no public mint export.
- Added pure `parseRepoPolicy(unknown)` and `DENY_ALL_REPO_POLICY`, with A3 source comments and tests proving absent repo policy blocks under intersection.
- Added Q-02 coverage proving two different tiers denying the same axis both appear in `blockedBy`.

## Task Commits

Each task was committed atomically, with TDD RED/GREEN commits:

1. **Task 1 RED: Precedence kernel tests** - `44e5c1b` (test)
2. **Task 1 GREEN: Precedence kernel implementation** - `6c424ff` (feat)
3. **Task 2 RED: Repo policy parser tests** - `9f3d361` (test)
4. **Correction: Untrack unrelated admission-decision files** - `e510236` (chore)
5. **Task 2 GREEN: Repo policy parser implementation** - `a49ae22` (feat)

## Files Created/Modified

- `packages/authority/src/precedence/tiers.ts` - Tier names, GOV-01 order, and tier contribution shape.
- `packages/authority/src/precedence/precedence-decision.ts` - Branded `PrecedenceDecision` data and private mint.
- `packages/authority/src/precedence/intersect.ts` - Strict intersection algorithm with full denial evidence.
- `packages/authority/src/precedence/index.ts` - Public precedence barrel without mint export.
- `packages/authority/src/precedence/precedence.test.ts` - Q-02, brand, freeze, and strict-intersection coverage.
- `packages/authority/src/repo-policy/parse.ts` - Pure parser, schema validation, and `DENY_ALL_REPO_POLICY`.
- `packages/authority/src/repo-policy/index.ts` - Public repo-policy barrel.
- `packages/authority/src/repo-policy/repo-policy.test.ts` - Parser and A3 fallback coverage.
- `packages/authority/src/internal/brand-witness.ts` - Internal precedence brand witness.
- `packages/authority/src/internal/test-builders.ts` - Internal test builder for `PrecedenceDecision`.
- `packages/authority/src/index.ts` - Public re-export for precedence and repo-policy surfaces.

## Decisions Made

- Used the repo's current `CapabilityEnvelope` axes rather than the plan's older `executionScope` / `allowedTools` wording.
- Allowed repo-policy tier envelopes to carry `allowedScopes`, `deniedTools`, `budgetCaps`, and `trustOverride` so Plan 07 can pass parsed repo policy into the same intersection kernel.
- Kept parser validation hand-rolled and pure; no `ajv`, no filesystem reads, and no dependency additions.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Reconciled plan axis names with current CapabilityEnvelope**
- **Found during:** Task 1 (PrecedenceDecision brand + intersectEnvelopes algorithm)
- **Issue:** The plan referenced `executionScope` and `allowedTools`, but the current intent package exposes `repoScopes`, `toolPermissions`, `executeGrants`, and `budget`.
- **Fix:** Implemented strictest-wins intersection over the actual envelope axes and carried repo-policy-only fields as tier contributions.
- **Files modified:** `packages/authority/src/precedence/tiers.ts`, `packages/authority/src/precedence/intersect.ts`, `packages/authority/src/precedence/precedence-decision.ts`
- **Verification:** `pnpm --filter @protostar/authority test` passed; Q-02 and A3 tests passed.
- **Committed in:** `6c424ff`, `a49ae22`

**2. [Rule 3 - Blocking] Removed unrelated same-wave files from Plan 04 history**
- **Found during:** Task 2 RED commit
- **Issue:** Three untracked admission-decision files from the parallel Plan 06a lane were accidentally included in the first Task 2 RED commit.
- **Fix:** Added a corrective `git rm --cached` commit to remove those files from Plan 04 history while leaving them present on disk for the owning lane.
- **Files modified:** Git index only for `packages/authority/src/admission-decision/base.ts`, `index.ts`, and `outcome.ts`
- **Verification:** Later `git status --short` was clean after the owning wave completed; final Plan 04 commits do not leave unrelated working tree changes.
- **Committed in:** `e510236`

---

**Total deviations:** 2 auto-fixed (Rule 2, Rule 3)
**Impact on plan:** The shipped behavior matches the plan locks. The corrective commit is history noise from parallel execution, not a runtime change.

## Issues Encountered

- Package-level verification was briefly blocked by concurrent Wave 2 files from Plans 05 and 06a. After those lanes landed, `pnpm --filter @protostar/authority test`, `pnpm run verify`, and `pnpm run factory` all passed.

## Authentication Gates

None.

## Known Stubs

None. Stub scan only found normal empty local accumulators, test defaults, and frozen empty arrays used as data values.

## Verification

- `pnpm --filter @protostar/authority test` - passed; 59 tests, 7 suites, 0 failures.
- `pnpm run verify` - passed; intent and factory-cli suites passed.
- `pnpm run factory` - passed; emitted a schemaVersion `1.1.0` confirmed intent payload.
- `grep -c 'export.*intersectEnvelopes' packages/authority/src/precedence/index.ts` - `1`.
- `grep -v '^#' packages/authority/src/index.ts | grep -c 'mintPrecedenceDecision'` - `0`.
- `grep -c 'TIER_PRECEDENCE_ORDER' packages/authority/src/precedence/tiers.ts` - `1`.
- `grep -l 'blockedBy.length === 2\|blockedBy.length, 2' packages/authority/src/precedence/precedence.test.ts | wc -l` - `1`.
- `grep -c 'DENY_ALL_REPO_POLICY' packages/authority/src/repo-policy/parse.ts` - `1`.
- `grep -c 'A3 lock' packages/authority/src/repo-policy/parse.ts` - `1`.
- `grep -RIn "from ['\"]node:fs['\"]\|from ['\"]fs['\"]" packages/authority/src/precedence/ packages/authority/src/repo-policy/ | grep -v '^#' | wc -l` - `0`.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Plan 07 can now load `.protostar/repo-policy.json` in factory-cli, pass parsed repo policy or `DENY_ALL_REPO_POLICY` as the repo-policy tier, and persist nested precedence summaries without giving `@protostar/authority` filesystem authority.

## Self-Check: PASSED

- Summary file exists.
- Key created files exist.
- Task commits exist: `44e5c1b`, `6c424ff`, `9f3d361`, `e510236`, `a49ae22`.
- Authority boundary scan found zero `node:fs` or bare `fs` imports in precedence and repo-policy sources.
- Stub scan found no placeholders or unresolved TODO/FIXME markers in Plan 04 sources.

---
*Phase: 02-authority-governance-kernel*
*Completed: 2026-04-27*
