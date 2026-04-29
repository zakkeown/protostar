---
phase: 11-headless-mode-e2e-stress
plan: 11
subsystem: factory-cli
tags: [stress, concurrency, fault-injection, mock, headless]

requires:
  - phase: 11-headless-mode-e2e-stress
    provides: "Plan 11-09 stress session/input helpers and Plan 11-15 mock fault modes"
provides:
  - "Pure @protostar/stress-harness package"
  - "TypeScript stress runner for concurrency and fault-injection"
  - "Observed mechanism coverage for network-drop, llm-timeout, disk-full, and abort-signal"
  - "Mock concurrency and llm-timeout smoke reports under .protostar/stress/<sessionId>/"
affects: [11-13, 11-14, factory-cli, stress]

tech-stack:
  added:
    - "@protostar/stress-harness"
  patterns:
    - "Pure packages define scenario contracts; factory-cli owns process, fs, and fault hook authority."
    - "Fault completion evidence is the observed mechanism in events.jsonl, not the scenario label."
    - "Concurrent workers share stress evidence through the Plan 11-09 session helpers with serialized cursor row updates."

key-files:
  created:
    - packages/stress-harness/package.json
    - packages/stress-harness/src/fault-scenarios.ts
    - packages/stress-harness/src/fault-application.ts
    - apps/factory-cli/src/scripts/stress.ts
    - apps/factory-cli/src/scripts/stress.test.ts
  modified:
    - apps/factory-cli/src/stress/seed-materialization.ts
    - apps/factory-cli/package.json
    - apps/factory-cli/tsconfig.json
    - AGENTS.md
    - tsconfig.json
    - tsconfig.base.json
    - pnpm-lock.yaml
    - .gitignore

key-decisions:
  - "Kept sustained-load in bash and refused it from the TypeScript runner with the required message."
  - "Ran disk-full as a session-scoped ENOSPC write-boundary injection instead of corrupting real stress artifacts."
  - "Ignored generated .protostar/stress/ output because CLI smoke evidence is local runtime output like dogfood and run bundles."

patterns-established:
  - "apps/factory-cli/src/scripts/stress.ts is the owner for worker pools, branch naming, abort controllers, and fault hook execution."
  - "stress-clean is emitted only after all four locked fault mechanisms are observed."

requirements-completed: [STRESS-13]

duration: 90min
completed: 2026-04-29
---

# Phase 11 Plan 11: Concurrency + Fault TS Driver Summary

**Concurrency and fault-injection now run through a typed factory-cli driver with pure scenario contracts and observed mechanism evidence**

## Accomplishments

- Added `@protostar/stress-harness` as a pure-tier workspace with deterministic fault descriptors, scenario-to-hook dispatch, mechanism validation, no-net contract coverage, and README/tier conformance.
- Implemented `apps/factory-cli/src/scripts/stress.ts` with `--shape concurrency|fault-injection`, worker-pool concurrency, branch names `protostar/${sessionId}/${workerIndex}-${runIndex}`, signed input preparation before every run, and the exact trusted factory run flag set.
- Routed fault-injection through `applyFaultInjection`, recording `fault-applied` before the hook and `fault-observed` only after observing the intended mechanism.
- Covered `network-drop`, `llm-timeout`, `disk-full`, and `abort-signal` with real runner tests; `stress-clean` is withheld unless all four observed mechanisms are present.
- Fixed a cursor lost-update race found by the new concurrency test by serializing only `recordStressRun` writes while keeping workers concurrent.
- Tightened cosmetic stress draft success evidence so the real mock smoke passes the ambiguity gate.

## Task Commits

1. **Implementation, package wiring, tests, and smoke fixes** - `11e144c`

## Deviations from Plan

- Added `.protostar/stress/` to `.gitignore` after the actual CLI smokes produced session output. This mirrors existing `.protostar/dogfood/` and `.protostar/runs/` treatment and prevents local smoke evidence from becoming untracked source changes.

## Issues Encountered

- `pnpm install --lockfile-only` updated `pnpm-lock.yaml` but did not refresh the local `apps/factory-cli/node_modules/@protostar/stress-harness` symlink; `pnpm install` was required locally after adding the workspace dependency.
- The first mock concurrency smoke exposed ambiguity score `0.21 > 0.20` for generated cosmetic stress drafts. The generated draft now includes explicit verification evidence that the cosmetic change landed and non-cosmetic behavior stayed unchanged.
- The first concurrency test found cursor row loss under parallel `recordStressRun` calls; the runner now serializes cursor run-row writes.
- The initial sandboxed `pnpm run verify` failed on loopback `listen EPERM` in `@protostar/lmstudio-adapter`; rerunning the same gate with approved loopback escalation passed.

## Verification

- `pnpm install --lockfile-only` passed; `pnpm install` refreshed workspace links.
- `pnpm --filter @protostar/stress-harness test` passed: 10 tests.
- `pnpm --filter @protostar/factory-cli typecheck` passed.
- `pnpm --filter @protostar/factory-cli test -- --test-name-pattern "stress"` passed; due package forwarding, this ran the full factory-cli suite: 404 tests.
- `pnpm --filter @protostar/admission-e2e test` passed: 172 tests.
- Acceptance greps for stress-harness wiring, runner strings, signed-input flags, wedge evidence, and all four scenarios passed.
- `node apps/factory-cli/dist/scripts/stress.js --shape concurrency --sessions 2 --concurrency 2 --llm-backend mock --headless-mode local-daemon` exited 0 and wrote a 2-run stress report.
- `node apps/factory-cli/dist/scripts/stress.js --shape fault-injection --scenario llm-timeout --runs 1 --llm-backend mock --headless-mode local-daemon` exited 0 and recorded `fault-observed` with `mechanism: "llm-abort-timeout"` and `code: "llm-abort-timeout"`.
- `git diff --check` passed.
- `pnpm run verify` passed after approved loopback escalation for local test servers.

## Next Phase Readiness

Plan 11-13 can consume the mock runner for CI/headless/security smokes. Plan 11-14 still owns the final non-autonomous `(ttt-delivered AND stress-clean)` gate and full all-four fault evidence.

## Self-Check: PASSED
