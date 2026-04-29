---
phase: 11
slug: headless-mode-e2e-stress
status: planned
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-29
---

# Phase 11 - Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node built-in `node:test` against compiled TypeScript |
| **Config file** | Package `tsconfig.json` references plus package `package.json` test scripts |
| **Quick run command** | `pnpm --filter <package> test` |
| **Full suite command** | `pnpm run verify` and `pnpm run verify:full` |
| **Estimated runtime** | ~2-8 minutes for repo validation; full live stress is manual/scheduled |

---

## Sampling Rate

- **After every task commit:** Run the focused package test named in the task.
- **After every plan wave:** Run `pnpm run verify`.
- **Before `$gsd-verify-work`:** Run `pnpm run verify` and `pnpm run verify:full`.
- **Live stress gate:** Run small mock-backed smokes in local/CI validation; full stress caps are phase-gate evidence, not per-task feedback.
- **Max feedback latency:** 10 minutes for automated checks; live TTT delivery and full stress sessions are manual-only evidence gates.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 11-01-01 | 11-01-requirements-traceability-PLAN.md | 0 | STRESS-01 | - | Requirements traceability is explicit before code tasks | doc/contract | `grep -q "STRESS-14" .planning/REQUIREMENTS.md` | Present | green |
| 11-02-01 | 11-02-archetype-admission-lift-PLAN.md | 1 | STRESS-02 | T-11-01 | Unsupported archetype blockers are removed only for wired archetypes | unit/e2e | `pnpm --filter @protostar/intent test && pnpm --filter @protostar/admission-e2e test` | Pending | pending |
| 11-03-01 | 11-03-seed-library-ttt-PLAN.md | 2 | STRESS-03 | - | TTT feature seed is immutable fixture data, package-wired into admission-e2e, and accepted by the existing ambiguity/admission path at <=0.2 | unit/contract | `pnpm install --lockfile-only && pnpm --filter @protostar/fixtures test && pnpm --filter @protostar/admission-e2e test -- --test-name-pattern "TTT seed ambiguity"` | Pending | pending |
| 11-04-01 | 11-04-immutable-toy-verification-PLAN.md | 1 | STRESS-04 | T-11-02 | Factory refuses edits to toy verification files, preflights their presence, and records operator-authored setup evidence | unit/e2e/manual gate | `pnpm --filter @protostar/planning test && pnpm --filter @protostar/factory-cli test -- --test-name-pattern "toy verification|immutable" && pnpm --filter @protostar/admission-e2e test` | Pending | pending |
| 11-05-01 | 11-05-headless-mode-config-cli-PLAN.md | 1 | STRESS-05 | T-11-03 | Headless mode rejects interactive prompt paths, exposes all-three setup paths, and validates Q-03 `factory.stress.caps` defaults including TTT 50 attempts / 14 days | unit/contract | `pnpm --filter @protostar/lmstudio-adapter test && pnpm --filter @protostar/factory-cli test -- --test-name-pattern "headless|stress caps" && rg -n "github-hosted|self-hosted-runner|local-daemon|factory\\.stress\\.caps" docs/headless packages/lmstudio-adapter/src apps/factory-cli/src` | Pending | pending |
| 11-06-01 | 11-06-llm-backend-selection-PLAN.md | 2 | STRESS-06 | T-11-04 | LM Studio remains default while backend selection is explicit | unit | `pnpm --filter @protostar/factory-cli test && pnpm --filter @protostar/lmstudio-adapter test` | Pending | pending |
| 11-07-01 | 11-07-hosted-and-mock-adapters-PLAN.md | 3 | STRESS-08 | T-11-04 | Hosted secrets are env-referenced and package wiring is tier-conformant | unit/contract | `pnpm --filter @protostar/hosted-llm-adapter test && pnpm --filter @protostar/admission-e2e test && pnpm --filter @protostar/factory-cli run typecheck` | Pending | pending |
| 11-15-01 | 11-15-mock-adapter-selector-wiring-PLAN.md | 4 | STRESS-07, STRESS-06 | T-11-04 | Mock backend is deterministic and factory-cli selector wiring imports hosted/mock packages through complete manifest refs | unit/contract | `pnpm --filter @protostar/mock-llm-adapter test && pnpm --filter @protostar/hosted-llm-adapter test && pnpm --filter @protostar/factory-cli test -- --test-name-pattern "backend|execution adapter"` | Pending | pending |
| 11-08-01 | 11-08-stress-artifact-schema-and-events-PLAN.md | 1 | STRESS-10 | T-11-05 | Stress reports are canonical and malformed reports reject | unit/contract | `pnpm --filter @protostar/artifacts test && pnpm --filter @protostar/admission-e2e test` | Pending | pending |
| 11-09-01 | 11-09-stress-session-core-PLAN.md | 3 | STRESS-11 | T-11-05 | Stress events append without truncating, reports write atomically, seed/draft/sign helpers prepare executable factory inputs, and CLI > config > default caps write `phase-11-cap-breach.json` on breach | unit | `pnpm --filter @protostar/factory-cli test -- --test-name-pattern "stress|seed materialization|cap breach"` | Pending | pending |
| 11-10-01 | 11-10-sustained-load-bash-driver-PLAN.md | 5 | STRESS-12 | T-11-06 | Bash driver delegates business logic to factory-cli and invokes factory run with materialized draft plus signed confirmed intent | smoke | `bash -n scripts/stress.sh && pnpm --filter @protostar/factory-cli run build && bash scripts/stress.sh --shape sustained-load --runs 1 --llm-backend mock --headless-mode local-daemon --seed-archetypes cosmetic-tweak,feature-add` | Pending | pending |
| 11-11-01 | 11-11-concurrency-fault-ts-driver-PLAN.md | 5 | STRESS-13 | T-11-06 | Concurrency/fault runner writes session-scoped evidence, consumes signed inputs, stops on wedge, and covers all locked fault scenarios with observed mechanisms | unit/smoke | `pnpm install --lockfile-only && pnpm --filter @protostar/stress-harness test && pnpm --filter @protostar/factory-cli test -- --test-name-pattern stress && node apps/factory-cli/dist/scripts/stress.js --shape concurrency --sessions 2 --concurrency 2 --llm-backend mock && node apps/factory-cli/dist/scripts/stress.js --shape fault-injection --scenario llm-timeout --runs 1 --llm-backend mock` | Pending | pending |
| 11-12-01 | 11-12-pnpm-add-allowlist-PLAN.md | 2 | STRESS-09, STRESS-02 | T-11-07 | Feature-add admission permits bounded multi-file writes plus exact `pnpm.allowedAdds`, rejects unallowlisted `pnpm add`, and still refuses immutable toy verification files | unit/contract | `pnpm --filter @protostar/intent test -- --test-name-pattern "feature-add|pnpm.allowedAdds|immutable" && pnpm --filter @protostar/admission-e2e test -- --test-name-pattern "feature-add pnpm" && pnpm --filter @protostar/repo test` | Pending | pending |
| 11-13-01 | 11-13-ci-headless-security-gates-PLAN.md | 6 | STRESS-14 | T-11-01, T-11-04, T-11-07 | PR CI has mock smokes; github-hosted, self-hosted-runner, and local-daemon setup contracts; no prompts, no dashboard server, no secret leakage, no merge authority, and hosted adapter imports are package-wired | contract | `pnpm install --lockfile-only && pnpm --filter @protostar/admission-e2e test -- --test-name-pattern "headless-(github-hosted|self-hosted-runner|local-daemon)" && pnpm run verify` | Pending | pending |
| 11-14-01 | 11-14-ttt-delivery-and-stress-gate-PLAN.md | 7 | STRESS-04, STRESS-10, STRESS-12, STRESS-13, STRESS-14 | T-11-06 | Final non-autonomous gate records TTT delivery under 50-attempt/14-day caps and all stress shapes clean, including all four locked fault scenarios with observed mechanisms, before STATE/ROADMAP completion | manual + live smoke | `pnpm run verify && pnpm run verify:full && rg -n "\\[x\\] TTT delivered|ttt-delivery.*cap|phase-11-cap-breach\\.json|\\[x\\] Sustained-load stress clean|\\[x\\] Concurrency stress clean|\\[x\\] Fault-injection stress clean|network-drop.*adapter-network-refusal|llm-timeout.*llm-abort-timeout|disk-full.*disk-write-enospc|abort-signal.*external-abort-signal|confirmed-intent path" .planning/phases/11-headless-mode-e2e-stress/11-VERIFICATION.md` | Pending | pending |

*Status: pending - green - red - flaky*

---

## Wave 0 Requirements

- [x] `.planning/REQUIREMENTS.md` includes `STRESS-01` through `STRESS-14`.
- [x] `.planning/ROADMAP.md` Phase 11 plan list references all generated `11-*-PLAN.md` files.
- [x] `.planning/phases/11-headless-mode-e2e-stress/11-RESEARCH.md` exists and includes `## Validation Architecture`.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Toy repo immutable verification files exist on `main` | STRESS-04 | The files live in `../protostar-toy-ttt`, outside this repo's package tests | In toy repo, verify `e2e/ttt.spec.ts` and `tests/ttt-state.property.test.ts` exist and pass in CI before final factory delivery. |
| Full sustained-load cap | STRESS-12 | Full 500-run or 7-day stress is too slow for per-task feedback | Run the sustained-load driver with resolved CLI > config > default caps and archive `.protostar/stress/<sessionId>/stress-report.json`; if a cap fires, archive `phase-11-cap-breach.json` and keep the phase blocked. |
| Full concurrency cap | STRESS-13 | Multi-session stress can consume real GitHub/LLM capacity | Run the TS stress runner with the chosen K=2..4 ramp and resolved CLI > config > default caps; archive the stress report or blocking `phase-11-cap-breach.json`. |
| Full fault-injection cap | STRESS-13 | Fault injection intentionally interrupts dependencies and may require operator-controlled environment | Run `network-drop`, `llm-timeout`, `disk-full`, and `abort-signal` with resolved CLI > config > default caps as four reports or one report whose `fault-observed` evidence covers all four mechanisms: `adapter-network-refusal`, `llm-abort-timeout`, `disk-write-enospc`, and `external-abort-signal`; verify structured refusal, stop-the-world evidence, or blocking `phase-11-cap-breach.json`. |
| Final TTT delivery | STRESS-14 | Requires real PR + external GitHub CI in the sibling toy repo | Confirm resolved TTT caps default to 50 attempts / 14 days, then confirm PR URL, green CI, Playwright E2E, property test, and Tauri debug build evidence; if the TTT cap fires, archive `phase-11-cap-breach.json` and keep the final gate incomplete. |

---

## Validation Sign-Off

- [x] All planned tasks have an automated verify command or an explicit manual-only gate.
- [x] Sampling continuity: no 3 consecutive tasks lack automated verification.
- [x] Wave 0 covers requirement-traceability references.
- [x] No watch-mode flags in automated validation commands.
- [x] Feedback latency target documented.
- [x] `nyquist_compliant: true` set in frontmatter.

**Approval:** pending
