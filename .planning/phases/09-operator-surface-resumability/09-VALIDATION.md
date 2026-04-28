---
phase: 9
slug: operator-surface-resumability
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-04-28
---

# Phase 9 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `node:test` (Node built-in; already used across the monorepo) |
| **Config file** | none — Wave 0 reuses existing per-package `tsconfig.json` + per-package `pnpm test` scripts |
| **Quick run command** | `pnpm --filter @protostar/factory-cli run test` |
| **Full suite command** | `pnpm run verify` |
| **Estimated runtime** | ~60s (quick); 5–10 min (full) |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @protostar/factory-cli run test` (quick)
- **After every plan wave:** Run `pnpm run verify` (full)
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~60s for quick; full suite reserved for wave boundaries

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 9-01-01 | 01 | 2 | OP-01, OP-07 | T-09-01-01..04 | RUN_ID_REGEX rejects path-traversal; stdout JSON discipline; `--help` to stderr | unit | `pnpm --filter @protostar/factory-cli build && pnpm --filter @protostar/factory-cli test -- --test-name-pattern '^(exit-codes\|io\|run-id\|duration)'` | ❌ W0 | ⬜ pending |
| 9-01-02 | 01 | 2 | OP-01, OP-07 | T-09-01-01..04 | commander.exitOverride maps errors to ExitCode taxonomy | integration | `pnpm install && pnpm --filter @protostar/factory-cli build && pnpm --filter @protostar/factory-cli test` | ❌ W0 | ⬜ pending |
| 9-02-01 | 02 | 1 | OP-07 | T-09-02-01,02 | Single canonical-JSON helper; byte-stable across packages | unit | `pnpm install && pnpm --filter @protostar/artifacts build && pnpm --filter @protostar/artifacts test && pnpm --filter @protostar/execution build && pnpm --filter @protostar/execution test` | ❌ W0 | ⬜ pending |
| 9-03-01 | 03 | 1 | OP-02, OP-04 | T-09-03-01 | FactoryRunStatus enum + transition guard | unit | `pnpm --filter @protostar/artifacts test` | ❌ W0 | ⬜ pending |
| 9-04-01 | 04 | 3 | OP-02 | T-09-04-01 | listRuns + computeRunLiveness with stale PID detection | unit | `pnpm --filter @protostar/factory-cli test -- --test-name-pattern '^(run-discovery\|run-liveness)'` | ❌ W0 | ⬜ pending |
| 9-04-02 | 04 | 3 | OP-02 | T-09-04-01 | status command emits status-row schema (JSON) | integration | `pnpm --filter @protostar/factory-cli test` | ❌ W0 | ⬜ pending |
| 9-05-01 | 05 | 3 | OP-03 | T-09-05-01 | inspect emits path-indexed artifacts; no trace inlining | integration | `pnpm --filter @protostar/factory-cli test` | ❌ W0 | ⬜ pending |
| 9-06-01 | 06 | 3 | OP-04 | T-09-06-01,02 | cancel writes sentinel + flips manifest to `cancelling` atomically | unit | `pnpm --filter @protostar/factory-cli test -- --test-name-pattern '^cancel'` | ❌ W0 | ⬜ pending |
| 9-06-02 | 06 | 3 | OP-04 | T-09-06-01,02 | run loop honors sentinel and writes `cancelled` terminal | integration | `pnpm --filter @protostar/factory-cli test` | ❌ W0 | ⬜ pending |
| 9-07-01 | 07 | 4 | OP-05 | T-09-07-01 | resume dispatches by stage; replayOrphanedTasks idempotent | integration | `pnpm --filter @protostar/factory-cli test` | ❌ W0 | ⬜ pending |
| 9-08-01 | 08 | 3 | OP-06, OP-07 | T-09-08-01,02,03 | reAuthorizeFromPayload re-checks gate state; brand never trusted from disk | unit | `pnpm install && pnpm --filter @protostar/delivery test && pnpm --filter @protostar/review test` | ❌ W0 | ⬜ pending |
| 9-08-02 | 08 | 3 | OP-06, OP-07 | T-09-08-01,02,03 | gated mode pauses; auto mode preserves Phase 7 behavior | integration | `pnpm --filter @protostar/lmstudio-adapter test && pnpm --filter @protostar/factory-cli test` | ❌ W0 | ⬜ pending |
| 9-09-01 | 09 | 4 | OP-06, OP-07 | T-09-09-01 | deliver re-authorizes from payload + idempotent retry | integration | `pnpm --filter @protostar/factory-cli test` | ❌ W0 | ⬜ pending |
| 9-10-01 | 10 | 4 | OP-08 | T-09-10-01 | prune respects active-guard + preserves JSONL | unit | `pnpm --filter @protostar/factory-cli test -- --test-name-pattern '^prune'` | ❌ W0 | ⬜ pending |
| 9-10-02 | 10 | 4 | OP-08 | T-09-10-01 | prune --older-than parses Ns/Nm/Nh/Nd/Nw | integration | `pnpm --filter @protostar/factory-cli test` | ❌ W0 | ⬜ pending |
| 9-11-01 | 11 | 5 | OP-01..08 | T-09-11-01 | 8 admission-e2e contract tests lock the public CLI surface | contract | `pnpm --filter @protostar/admission-e2e test` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Fourteen concrete test files must exist before any task can claim a non-pending status (per 09-RESEARCH.md Validation Architecture):

**admission-e2e contract tests (8 files):**

- [ ] `packages/admission-e2e/src/exit-codes.contract.test.ts` — verifies ExitCode taxonomy across the public CLI
- [ ] `packages/admission-e2e/src/manifest-status-enum.contract.test.ts` — locks FactoryRunStatus values + transitions
- [ ] `packages/admission-e2e/src/factory-cli-stdout-canonical.contract.test.ts` — round-trips stdout JSON through sortJsonValue idempotency
- [ ] `packages/admission-e2e/src/factory-cli-help.contract.test.ts` — pinned `--help` snapshots (root + each subcommand)
- [ ] `packages/admission-e2e/src/status-row-schema.contract.test.ts` — locks status row JSON schema
- [ ] `packages/admission-e2e/src/inspect-schema.contract.test.ts` — locks inspect output JSON schema (path-indexed; no trace inlining)
- [ ] `packages/admission-e2e/src/resume-stage-dispatch.contract.test.ts` — verifies resume stage routing
- [ ] `packages/admission-e2e/src/delivery-reauthorize.contract.test.ts` — verifies reAuthorizeFromPayload reject paths

**factory-cli unit tests (6 files):**

- [ ] `apps/factory-cli/src/cancel.test.ts` — cancel command unit
- [ ] `apps/factory-cli/src/prune.test.ts` — prune command unit
- [ ] `apps/factory-cli/src/run-id.test.ts` — RUN_ID_REGEX + assertRunIdConfined
- [ ] `apps/factory-cli/src/run-discovery.test.ts` — listRuns helper
- [ ] `apps/factory-cli/src/run-liveness.test.ts` — computeRunLiveness with stale PID
- [ ] `apps/factory-cli/src/duration.test.ts` — parseDuration helper

*Wave 0 must create all 14 files (as scaffolds, even if empty placeholders) before execute-phase begins so MISSING references in `<verify>` blocks resolve.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| (none) | — | All phase behaviors have automated verification. | — |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s for quick run
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
