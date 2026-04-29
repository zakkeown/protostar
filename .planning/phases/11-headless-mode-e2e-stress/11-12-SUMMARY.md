---
phase: 11-headless-mode-e2e-stress
plan: 12
subsystem: repo
tags: [pnpm, subprocess, allowlist, feature-add, admission, security]

requires:
  - phase: 11-headless-mode-e2e-stress
    provides: 11-02 feature-add admission lift and 11-04 immutable toy verification refusal
provides:
  - Exact repo-owned pnpm add allowlist for curated TTT feature dependencies
  - Feature-add-scoped pnpm.allowedAdds intent admission
  - Pre-spawn pnpm add argv validation and refusal evidence
  - Phase 11 security review entry for package-manager install authority
affects: [phase-11, repo-subprocess, intent-admission, admission-e2e, security-review]

tech-stack:
  added: []
  patterns:
    - Repo-owned subprocess allowlist metadata with schema-level argv validation
    - Intent-side capability envelope admission remains pure and does not import fs-tier repo code

key-files:
  created:
    - packages/admission-e2e/src/feature-add-pnpm-admission.contract.test.ts
    - packages/repo/src/pnpm-add-allowlist.ts
  modified:
    - .planning/SECURITY-REVIEW.md
    - packages/intent/schema/confirmed-intent.schema.json
    - packages/intent/src/capability-admission.ts
    - packages/intent/src/capability-admission.test.ts
    - packages/intent/src/capability-envelope.ts
    - packages/intent/src/capability-normalization.ts
    - packages/intent/src/confirmed-intent.ts
    - packages/intent/src/draft-validation.ts
    - packages/intent/src/index.ts
    - packages/intent/src/models.ts
    - packages/intent/src/promotion-contracts.ts
    - packages/repo/src/index.ts
    - packages/repo/src/subprocess-runner.ts
    - packages/repo/src/subprocess-runner.test.ts
    - packages/repo/src/subprocess-schemas/git.ts
    - packages/repo/src/subprocess-schemas/pnpm.ts
    - packages/repo/src/subprocess-schemas/schemas.test.ts

key-decisions:
  - "Keep the canonical exported allowlist in @protostar/repo and duplicate exact admission strings in @protostar/intent to preserve pure -> fs tier direction."
  - "Expose PNPM_ADD_ALLOWLIST from @protostar/repo for downstream schema/security consumers, while keeping install authority enforced by the repo subprocess runner."

patterns-established:
  - "CommandSchema.validateArgv lets a command schema add command-specific validation after the shared argv guard."
  - "Feature-add dependency authority is represented in the intent envelope as exact pnpm.allowedAdds strings, then rechecked at the repo subprocess boundary."

requirements-completed: [STRESS-09, STRESS-02]

duration: 15m 27s
completed: 2026-04-29
---

# Phase 11 Plan 12: pnpm Add Allowlist Summary

**Exact `pnpm add` authority for curated TTT dependencies, admitted through feature-add intent and enforced before repo subprocess spawn**

## Performance

- **Duration:** 15m 27s
- **Started:** 2026-04-29T18:06:21Z
- **Completed:** 2026-04-29T18:21:48Z
- **Tasks:** 3
- **Files modified:** 19

## Accomplishments

- Added RED coverage for feature-add `pnpm.allowedAdds`, immutable toy verification refusals, and exact `pnpm add` subprocess argv cases.
- Added `PNPM_ADD_ALLOWLIST` for `@playwright/test`, `fast-check`, `clsx`, `zustand`, and `react-aria-components` with exact specs and dev/runtime intent.
- Extended the intent capability envelope and admission path so feature-add can request only exact curated dependency adds.
- Extended the repo subprocess schema so `pnpm add` is accepted only for exact allowlisted argv shapes and refused before spawn otherwise.
- Recorded the Phase 11 package-manager authority surface in `.planning/SECURITY-REVIEW.md`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Pin feature-add envelope and admission behavior** - `62579c5` (test)
2. **Task 2: Pin accepted and rejected `pnpm add` argv cases** - `c4b9846` (test)
3. **Task 3: Implement feature-add pnpm envelope and repo-owned exact dependency allowlist** - `c90d647` (feat)

## Files Created/Modified

- `packages/admission-e2e/src/feature-add-pnpm-admission.contract.test.ts` - Cross-package contract for feature-add multi-file admission plus immutable toy verification refusal.
- `packages/repo/src/pnpm-add-allowlist.ts` - Frozen exact pnpm dependency allowlist and formatting helper.
- `packages/repo/src/subprocess-schemas/pnpm.ts` - `pnpm add` schema branch with exact allowlist validation.
- `packages/repo/src/subprocess-runner.ts` - Calls command-specific schema validation before spawning.
- `packages/repo/src/subprocess-schemas/schemas.test.ts` and `packages/repo/src/subprocess-runner.test.ts` - Accepted and refused `pnpm add` argv coverage.
- `packages/intent/src/capability-*.ts`, `models.ts`, `confirmed-intent.ts`, `draft-validation.ts`, `promotion-contracts.ts`, and schema JSON - pnpm envelope parsing, normalization, copying, admission, and stable finding code.
- `.planning/SECURITY-REVIEW.md` - Phase 11 pnpm add allowlist security review entry.

## Decisions Made

- Kept `@protostar/intent` pure by not importing `@protostar/repo`; the intent admission exact strings mirror the repo allowlist values to preserve AGENTS.md tier direction.
- Exported repo allowlist metadata from `@protostar/repo` because the allowlist is now a public repo-runtime contract, while execution authority still remains inside the repo subprocess schema and runner.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Widened pnpm flag-map inference**
- **Found during:** Task 3 implementation verification
- **Issue:** TypeScript inferred empty frozen flag arrays as `never[]`, making `allowedFlags.includes(arg)` fail compilation.
- **Fix:** Typed the pnpm flag map as `CommandSchema["allowedFlags"]`.
- **Files modified:** `packages/repo/src/subprocess-schemas/pnpm.ts`
- **Verification:** `pnpm --filter @protostar/repo test` passed.
- **Committed in:** `c90d647`

**2. [Rule 1 - Bug] Removed unused exported schema helper**
- **Found during:** Task 3 overall verification
- **Issue:** `pnpm run verify` passed tests but failed Knip because `validatePnpmArgv` was exported unnecessarily.
- **Fix:** Made `validatePnpmArgv` module-local.
- **Files modified:** `packages/repo/src/subprocess-schemas/pnpm.ts`
- **Verification:** `pnpm run verify` passed.
- **Committed in:** `c90d647`

**3. [AGENTS.md boundary adjustment] Preserved pure intent tier**
- **Found during:** Task 3 implementation
- **Issue:** The plan linked intent admission to the repo allowlist, but importing repo metadata into `@protostar/intent` would violate the pure-to-fs authority boundary.
- **Fix:** Kept the exported canonical allowlist in `@protostar/repo` and mirrored exact admission strings in `@protostar/intent`.
- **Files modified:** `packages/intent/src/capability-admission.ts`, `packages/repo/src/pnpm-add-allowlist.ts`
- **Verification:** `pnpm run verify` tier-conformance and boundary contracts passed.
- **Committed in:** `c90d647`

---

**Total deviations:** 3 handled (1 blocking compile issue, 1 verification bug, 1 AGENTS.md boundary adjustment)
**Impact on plan:** All changes stayed within the requested authority surface and preserved package-tier constraints.

## Issues Encountered

- `pnpm run factory` built successfully and stopped at the expected workspace-trust gate with exit code 2. The generated refusal JSONL line was removed from `.protostar/refusals.jsonl` as runtime residue.

## Known Stubs

None introduced. Stub-pattern scan over created/modified files found no `TODO`, `FIXME`, placeholder, "coming soon", or UI-empty data stubs.

## Threat Flags

None. The new subprocess surface was explicitly covered by the plan threat model and recorded in `.planning/SECURITY-REVIEW.md`.

## Verification

- `pnpm --filter @protostar/intent test -- --test-name-pattern "feature-add.*pnpm|multi-file"` passed.
- `pnpm --filter @protostar/repo test` passed.
- `pnpm --filter @protostar/admission-e2e test -- --test-name-pattern "feature-add pnpm"` passed.
- `rg` acceptance probes for `allowedAdds`, `unallowlisted-pnpm-add`, exact dependency specs, and rejection flags passed.
- Security review exact-spec count check passed: each allowlisted dependency/spec appears exactly once.
- `pnpm run verify` passed.
- `pnpm run factory` built and reached the expected workspace-trust gate.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Wave 2 is now complete for the bounded `pnpm add` dependency surface. Wave 3 can proceed with hosted/mock adapter work and stress-session core plans while relying on repo-owned package-manager validation.

## Self-Check: PASSED

- Summary file exists at `.planning/phases/11-headless-mode-e2e-stress/11-12-SUMMARY.md`.
- Task commits are reachable: `62579c5`, `c4b9846`, `c90d647`.
- `STATE.md`, `ROADMAP.md`, and `REQUIREMENTS.md` contain the expected 11-12 / STRESS-09 updates.
- `git diff --check` passed.

---
*Phase: 11-headless-mode-e2e-stress*
*Completed: 2026-04-29*
