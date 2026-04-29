---
phase: 11-headless-mode-e2e-stress
plan: 13
subsystem: admission-e2e
tags: [ci, headless, security, no-prompts, secret-redaction]

requires:
  - phase: 11-headless-mode-e2e-stress
    provides: "Wave 5 stress drivers and mock backend smokes"
provides:
  - "PR fast mock-backed headless stress smokes"
  - "Manual/scheduled headless stress workflow"
  - "No-interactive-prompt, hosted-secret-redaction, no-dashboard, and no-merge gates"
  - "Per-mode github-hosted, self-hosted-runner, and local-daemon setup contracts"
affects: [11-14, ci, admission-e2e, security]

tech-stack:
  added: []
  patterns:
    - "PR CI keeps stress work to fast mock smokes; full-cap evidence belongs to manual/scheduled phase gates."
    - "Admission-e2e owns static headless/security contracts across workflows, docs, and production source."
    - "Hosted credentials stay env-only and are asserted against adapter events plus formatted stress artifacts."

key-files:
  created:
    - .github/workflows/headless-stress.yml
    - packages/admission-e2e/src/no-interactive-prompts.contract.test.ts
    - packages/admission-e2e/src/headless-github-hosted.contract.test.ts
    - packages/admission-e2e/src/headless-self-hosted-runner.contract.test.ts
    - packages/admission-e2e/src/headless-local-daemon.contract.test.ts
    - packages/admission-e2e/src/hosted-secret-redaction.contract.test.ts
  modified:
    - .github/workflows/verify.yml
    - packages/admission-e2e/src/delivery-no-merge-repo-wide.contract.test.ts
    - packages/admission-e2e/package.json
    - packages/admission-e2e/tsconfig.json
    - SECURITY.md
    - .planning/SECURITY-REVIEW.md
    - .env.example
    - scripts/stress.sh

key-decisions:
  - "Kept the existing `pnpm run verify` workflow command because this repo does not define `verify:full`."
  - "Used `headless-stress.yml` for scheduled/manual stress and left PR CI on one-run mock smokes."
  - "Allowed the documented `pnpm stress:sustained -- --runs ...` form by making the bash parser ignore a standalone `--`."

patterns-established:
  - "Prompt exceptions require a top-of-file `no-prompt-exception` comment plus a security-review ledger row."
  - "No merge/update-branch authority remains a repo-wide production-source scan."

requirements-completed: [STRESS-05, STRESS-06, STRESS-08, STRESS-09, STRESS-10, STRESS-12, STRESS-13, STRESS-14]

duration: 55min
completed: 2026-04-29
---

# Phase 11 Plan 13: CI Headless Security Gates Summary

**Headless CI/security gates are in place, with PR smokes bounded to mock runs and full stress left to manual/scheduled evidence**

## Accomplishments

- Added `.github/workflows/headless-stress.yml` with `workflow_dispatch`, weekly schedule, Node 22, pnpm 10.33.0, frozen install, build, mock scheduled smokes, manual shape inputs, and env-only hosted secret wiring.
- Extended `.github/workflows/verify.yml` with fast PR mock smokes for sustained-load, concurrency, and `llm-timeout` fault-injection.
- Added admission-e2e contracts for no interactive prompt APIs in production source, all three headless setup modes, hosted secret redaction, and explicit Phase 11 no-merge/update-branch sentinel coverage.
- Wired `@protostar/hosted-llm-adapter` into admission-e2e package dependencies/references so the redaction contract imports the real adapter.
- Updated `SECURITY.md`, `.planning/SECURITY-REVIEW.md`, `.env.example`, and the local-daemon plist sample note for hosted keys, runner residue, event-tail observability, no prompts, no dashboard/server, and no merge/update-branch authority.

## Task Commits

1. **Headless/security gates, workflows, and docs** - `126c338`

## Deviations from Plan

- The plan text referenced `pnpm run verify:full`, but the repo only defines `pnpm run verify`. The existing verify command was preserved and the fast stress smokes were added after it.

## Issues Encountered

- `pnpm install --lockfile-only` updated the lockfile but did not refresh the local admission-e2e symlink for the new hosted adapter dependency; a regular `pnpm install` refreshed workspace links.
- The documented `pnpm stress:sustained -- --runs ...` form passed a literal `--` through to `scripts/stress.sh`. The parser now ignores standalone `--`, matching the README/example/workflow command shape.

## Verification

- `pnpm install --lockfile-only` passed.
- `pnpm --filter @protostar/admission-e2e typecheck` passed.
- `pnpm --filter @protostar/admission-e2e test` passed: 179 tests.
- `pnpm --filter @protostar/factory-cli build` passed.
- Acceptance greps for prompt, headless-mode, hosted adapter wiring, workflow, security-review, and setup-doc strings passed.
- Local workflow smokes passed:
  - `pnpm stress:sustained -- --runs 1 --llm-backend mock --headless-mode github-hosted`
  - `node apps/factory-cli/dist/scripts/stress.js --shape concurrency --sessions 1 --concurrency 1 --runs 1 --llm-backend mock --headless-mode github-hosted`
  - `node apps/factory-cli/dist/scripts/stress.js --shape fault-injection --scenario llm-timeout --runs 1 --llm-backend mock --headless-mode github-hosted`
- `git diff --check` passed.
- `pnpm run verify` passed after approved loopback escalation for local test servers.

## Next Phase Readiness

Plan 11-14 is the only remaining Phase 11 plan. It must record real TTT delivery evidence plus sustained-load, concurrency, and all four observed fault-injection reports before Phase 11 can complete.

## Self-Check: PASSED
