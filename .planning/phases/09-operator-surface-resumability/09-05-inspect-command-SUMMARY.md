---
phase: 09-operator-surface-resumability
plan: 05
subsystem: cli
tags: [inspect-command, run-bundle, canonical-json, trace-no-inline, sha256, node-test]

requires:
  - phase: 09-operator-surface-resumability
    provides: Commander CLI primitives, canonical JSON stdout, branded runId parsing, and shared artifact canonicalization
provides:
  - protostar-factory inspect command emitting canonical {manifest, artifacts, summary} JSON
  - Fixed allowlist artifact index with sha256 and bytes for every found artifact
  - Trace-no-inline invariant for pile trace.json files
affects: [operator-surface, phase-10-dogfood, admission-e2e-cli-contracts]

tech-stack:
  added: []
  patterns: [allowlisted run-bundle inspection, path-indexed trace references, command-module tests]

key-files:
  created:
    - apps/factory-cli/src/commands/inspect.ts
    - apps/factory-cli/src/commands/inspect.test.ts
  modified:
    - apps/factory-cli/src/main.ts

key-decisions:
  - "Inspect uses a fixed artifact allowlist instead of recursive arbitrary bundle traversal."
  - "Trace files are read only as bytes for sha256/size; stdout carries path, sha256, and bytes, never trace payloads."
  - "--json is accepted as a no-op because inspect's only output mode is canonical JSON."

patterns-established:
  - "Run-bundle commands validate runId via parseRunId plus assertRunIdConfined before filesystem reads."
  - "Artifact rows are run-relative paths so operators can pipe through jq and read files directly."

requirements-completed: [OP-05, OP-07]

duration: 6min
completed: 2026-04-28
---

# Phase 9 Plan 05: Inspect Command Summary

**`protostar-factory inspect <runId>` now emits a bounded canonical JSON index of run artifacts with sha256 hashes while keeping trace contents out of stdout.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-04-28T18:44:24Z
- **Completed:** 2026-04-28T18:50:49Z
- **Tasks:** 1 TDD task
- **Files modified:** 3

## Accomplishments

- Added `buildInspectCommand()` with runId validation, path confinement, missing-run exit code 3, and canonical `writeStdoutJson()` output.
- Implemented the fixed artifact allowlist for manifest, plan, execution, review, evaluation, evolution, CI, pile iteration, and delivery artifacts.
- Added sha256 and byte counts for every artifact row, including `trace.json`.
- Added `--stage <name>` filtering that narrows only `artifacts[]`; `manifest` remains present.
- Added node:test coverage proving trace sentinel text exists on disk but never appears in inspect stdout.

## TDD Gate Compliance

- **RED:** `1c03e3f` added failing inspect command tests. Focused verification failed because `apps/factory-cli/src/commands/inspect.ts` did not exist.
- **GREEN:** `07ee317` added the inspect command and dispatcher wiring. Factory-cli tests and repo verification passed.

## Task Commits

1. **Task 1 RED: inspect command tests** - `1c03e3f` (test)
2. **Task 1 GREEN: inspect command implementation** - `07ee317` (feat)

## Files Created/Modified

- `apps/factory-cli/src/commands/inspect.ts` - Commander inspect command, allowlisted artifact walker, sha256/bytes indexing, stage filter, summary builder.
- `apps/factory-cli/src/commands/inspect.test.ts` - Fixture-backed inspect tests for schema, stage filtering, missing/invalid IDs, empty piles, and trace-no-inline behavior.
- `apps/factory-cli/src/main.ts` - Registers `buildInspectCommand()` on the root dispatcher.

## Verification

- `pnpm --filter @protostar/factory-cli test -- --test-name-pattern '^inspect'` - PASS; package script ran the factory-cli test suite, including 6 inspect tests.
- `pnpm --filter @protostar/factory-cli test` - PASS, 267 tests.
- `pnpm run verify` - PASS.

## Acceptance Criteria

- `grep -c 'export function buildInspectCommand' apps/factory-cli/src/commands/inspect.ts` - PASS, `1`.
- `grep -c 'addCommand(buildInspectCommand' apps/factory-cli/src/main.ts` - PASS, `1`.
- `grep -cE "createHash\\('sha256'\\)" apps/factory-cli/src/commands/inspect.ts` - PASS, `1`.
- `grep -cE 'include-traces' apps/factory-cli/src/commands/inspect.ts` - PASS, `0`.
- `grep -c 'writeStdoutJson' apps/factory-cli/src/commands/inspect.ts` - PASS, `2`.
- `pnpm --filter @protostar/factory-cli test` - PASS.

## Decisions Made

- Kept `review-decision.json` out of the emitted kind set because the locked Plan 09-05 must-haves define `review-gate.json` as the review artifact kind and do not include a `review-decision` kind in the interface.
- Used run-relative POSIX-style paths in artifact rows to match the run bundle layout and keep output portable for `jq` pipelines.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- `@commander-js/extra-typings` narrows the returned command type when a positional argument is declared. The builder returns the narrowed command as the public `Command` type, matching the existing command-module surface.
- The package test script passes the name-pattern argument after compiled test files, so the requested focused command still executed the full factory-cli suite. The inspect tests were included and passed.

## Known Stubs

None.

## Threat Flags

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Cancel, delivery, and prune command plans can now assume the root dispatcher has a third public subcommand and that inspect provides a bounded run-bundle index for Phase 10 dogfood debugging.

## Self-Check: PASSED

- Summary file exists at `.planning/phases/09-operator-surface-resumability/09-05-inspect-command-SUMMARY.md`.
- Created files exist: `apps/factory-cli/src/commands/inspect.ts` and `apps/factory-cli/src/commands/inspect.test.ts`.
- Task commits found in git history: `1c03e3f`, `07ee317`.

---
*Phase: 09-operator-surface-resumability*
*Completed: 2026-04-28*
