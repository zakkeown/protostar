---
phase: 01-intent-planning-admission
plan: 05
subsystem: admission-e2e
tags: [scaffold, workspace, test-only, cross-package-contracts]
requires: []
provides:
  - "@protostar/admission-e2e workspace package (test-only home for cross-package contracts)"
  - "Smoke test pattern proving the runner works via pnpm run build && node --test dist/*.test.js"
affects:
  - tsconfig.base.json (paths)
  - tsconfig.json (project references)
  - pnpm-lock.yaml (workspace registration)
tech-stack:
  added: []
  patterns:
    - "Test-only workspace package with workspace:* deps on intent/policy/planning/execution"
    - "Authority-boundary grep gate (no node:fs / node:child_process imports in src/)"
key-files:
  created:
    - packages/admission-e2e/package.json
    - packages/admission-e2e/tsconfig.json
    - packages/admission-e2e/src/index.ts
    - packages/admission-e2e/src/scaffold.test.ts
  modified:
    - tsconfig.base.json
    - tsconfig.json
    - pnpm-lock.yaml
decisions:
  - "Smoke test only — real cross-package contracts arrive in Plans 06 (public-split-exports for ConfirmedIntent), 07 (AdmittedPlan brand contracts), 09 (AC normalization deep-equal)"
  - "Test-only package: zero runtime authority. No node:fs / node:child_process in src/. Plan 09 will introduce node:fs only inside its own test files for fixture path discovery"
  - "TDD gates: RED commit (0fad796) wrote scaffold.test.ts importing missing index.js; GREEN commit (1953a90) added the barrel export + tsconfig wiring"
metrics:
  duration_minutes: ~5
  completed_date: 2026-04-26
  tasks: 1
  files_created: 4
  files_modified: 3
requirements:
  - INTENT-03
---

# Phase 1 Plan 05: admission-e2e Scaffold Summary

Stand up `packages/admission-e2e/` — the new test-only workspace package that will host cross-cutting admission contracts beginning in Wave 2/3 (Plans 06/07/09). One-liner: empty cross-package contract home, builds + tests green, registered in root tsconfig and paths.

## What Was Built

- **`packages/admission-e2e/package.json`** — `@protostar/admission-e2e@0.0.0`, private, ESM. Scripts use the canonical `pnpm run build && node --test dist/*.test.js` pattern. `workspace:*` deps on `@protostar/intent`, `@protostar/policy`, `@protostar/planning`, `@protostar/execution`.
- **`packages/admission-e2e/tsconfig.json`** — extends `tsconfig.base.json`, composite, `rootDir: src`, `outDir: dist`, project references to the four declared workspace deps.
- **`packages/admission-e2e/src/index.ts`** — minimal barrel: `export const ADMISSION_E2E_PACKAGE_NAME = "@protostar/admission-e2e" as const`.
- **`packages/admission-e2e/src/scaffold.test.ts`** — single `node:test` describe/it asserting the constant equals its literal. Proves the build-then-run flow works.
- **`tsconfig.base.json`** — added `"@protostar/admission-e2e": ["packages/admission-e2e/src/index.ts"]` to paths.
- **`tsconfig.json`** — added `{ "path": "packages/admission-e2e" }` to the references array.

## Empty-Contract-Test List (Future Work)

The package is intentionally empty beyond the smoke test. Subsequent Wave 2/3 plans will populate it:

| Future Plan | Contract Test                                                                                              |
| ----------- | ---------------------------------------------------------------------------------------------------------- |
| Plan 06     | Extend `public-split-exports.contract.test.ts`-style assertions across packages — only `promoteIntentDraft` mints `ConfirmedIntent` |
| Plan 07     | `AdmittedPlan` brand cross-package contract — execution accepts only the brand, not raw `CandidatePlan`     |
| Plan 09     | Acceptance-criteria-normalization deep-equal sweep across `examples/intents/**` and `examples/planning-results/**` |
| Phase 2+    | Capability handoff contracts (Phase 2), repo-scope handoff (Phase 3), review handoff (Phase 5)              |

## Verification

- `pnpm install` registered the workspace in lockfile.
- `pnpm --filter @protostar/admission-e2e build` exits 0.
- `pnpm --filter @protostar/admission-e2e test` exits 0 (1 test, 1 suite, 1 pass).
- `pnpm --filter @protostar/admission-e2e -r test` exits 0 — confirms `pnpm -r test` recursion picks up the new package automatically (Plan 01's `verify:full` will too).
- Authority boundary grep: `grep -rE "node:fs|node:child_process" packages/admission-e2e/src` returns 0 matches.

## Acceptance Criteria

| Criterion                                                                       | Result |
| ------------------------------------------------------------------------------- | ------ |
| 4 files exist (`package.json`, `tsconfig.json`, `src/index.ts`, `src/scaffold.test.ts`) | PASS  |
| `package.json.name == "@protostar/admission-e2e"`                                | PASS  |
| All four `workspace:*` deps wired                                                | PASS  |
| `tsconfig.base.json` paths entry added                                            | PASS  |
| `tsconfig.json` references entry added                                            | PASS  |
| Build + test exit 0                                                               | PASS  |
| No `node:fs` / `node:child_process` imports in `src/`                             | PASS  |

## Threat Model Outcomes

- **T-01-05-01 (EoP, authority creep):** Mitigated. Grep gate confirmed zero filesystem/child_process imports in `packages/admission-e2e/src/`.
- **T-01-05-02 (Spoofing, silent skip):** Mitigated. `pnpm --filter @protostar/admission-e2e -r test` ran and reported the smoke test executed; `test` script is present and follows the canonical pattern that `pnpm -r test` recursion exercises.

## TDD Gate Compliance

- **RED:** `0fad796` — `test(01-05): add failing scaffold smoke test for admission-e2e`. Build failed with `TS2307: Cannot find module './index.js'` as expected before `index.ts` existed.
- **GREEN:** `1953a90` — `feat(01-05): wire @protostar/admission-e2e into root tsconfig + paths`. Build and test pass after `index.ts` was added and tsconfig wired.
- **REFACTOR:** None needed — minimal scaffold has no cleanup surface.

## Deviations from Plan

None — plan executed exactly as written. The plan instructed `references` in the per-package tsconfig; I included it. The plan did not specify a `tsBuildInfoFile`; I copied the canonical value from `packages/intent/tsconfig.json` for consistency (matches "mirroring packages/intent/tsconfig.json" in the action spec).

## Commits

| Phase  | Hash      | Message                                                            |
| ------ | --------- | ------------------------------------------------------------------ |
| RED    | `0fad796` | test(01-05): add failing scaffold smoke test for admission-e2e     |
| GREEN  | `1953a90` | feat(01-05): wire @protostar/admission-e2e into root tsconfig + paths |

## Self-Check: PASSED

- `packages/admission-e2e/package.json` — FOUND
- `packages/admission-e2e/tsconfig.json` — FOUND
- `packages/admission-e2e/src/index.ts` — FOUND
- `packages/admission-e2e/src/scaffold.test.ts` — FOUND
- Commit `0fad796` — FOUND in git log
- Commit `1953a90` — FOUND in git log
