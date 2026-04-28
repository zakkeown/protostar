---
phase: 6
slug: live-dogpile-piles
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-27
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `node:test` (built-in, Node 22) |
| **Config file** | none — per-package `package.json` test script invokes `tsx --test 'src/**/*.test.ts'` |
| **Quick run command** | `pnpm --filter @protostar/dogpile-adapter test` |
| **Full suite command** | `pnpm run verify` |
| **Estimated runtime** | ~30 seconds (full); ~3s (single package) |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @protostar/<touched-package> test`
- **After every plan wave:** Run `pnpm run verify`
- **Before `/gsd-verify-work`:** `pnpm run verify` must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 6-01-01 | 01 | 0 | PILE-06 | T-6-01 / no-fs | dogpile-adapter has zero fs imports | unit | `pnpm --filter @protostar/dogpile-adapter test --grep no-fs` | ❌ W0 | ⬜ pending |
| 6-01-02 | 01 | 0 | Q-16 | — | preset rename `executionCoordinationPilePreset` exported | unit | `pnpm --filter @protostar/dogpile-adapter test --grep preset-export` | ❌ W0 | ⬜ pending |
| 6-01-03 | 01 | 0 | Q-14 | — | Phase 5 Q-10 retroactively annotated to point at review pile | manual | grep annotation in `.planning/phases/05-review-repair-loop/05-CONTEXT.md` | ❌ W0 | ⬜ pending |
| 6-02-01 | 02 | 1 | PILE-01 | — | `runFactoryPile` invokes `stream()` with preset | unit | `pnpm --filter @protostar/dogpile-adapter test --grep run-factory-pile` | ❌ W1 | ⬜ pending |
| 6-02-02 | 02 | 1 | PILE-04 | T-6-02 / timeout-classifier | timeout failure produces `pile-timeout` refusal | unit | `pnpm --filter @protostar/dogpile-adapter test --grep pile-timeout` | ❌ W1 | ⬜ pending |
| 6-02-03 | 02 | 1 | PILE-04 | T-6-03 / schema-parse | schema-parse failure produces `pile-schema-parse` refusal | unit | `pnpm --filter @protostar/dogpile-adapter test --grep pile-schema-parse` | ❌ W1 | ⬜ pending |
| 6-02-04 | 02 | 1 | PILE-05 | T-6-04 / budget-clamp | `resolvePileBudget` clamps preset to envelope min | unit | `pnpm --filter @protostar/dogpile-adapter test --grep resolve-pile-budget` | ❌ W1 | ⬜ pending |
| 6-02-05 | 02 | 1 | PILE-05 | T-6-05 / abort-hierarchy | parent abort cascades; pile timeout does not abort run | unit | `pnpm --filter @protostar/dogpile-adapter test --grep abort-hierarchy` | ❌ W1 | ⬜ pending |
| 6-02-06 | 02 | 1 | Q-13 | — | `mapSdkStopToPileFailure` maps each NormalizedStopReason | unit | `pnpm --filter @protostar/dogpile-adapter test --grep map-sdk-stop` | ❌ W1 | ⬜ pending |
| 6-02-07 | 02 | 1 | Q-02 | — | `ctx.onEvent` callback count equals SDK event count | unit | `pnpm --filter @protostar/dogpile-adapter test --grep on-event-forwarding` | ❌ W1 | ⬜ pending |
| 6-03-01 | 03 | 2 | PILE-02 | — | `createReviewPileModelReviewer` returns `ModelReviewResult` | unit | `pnpm --filter @protostar/review test --grep review-pile-reviewer` | ❌ W2 | ⬜ pending |
| 6-03-02 | 03 | 2 | Q-14 | — | review-pile reviewer is the Phase 5 ModelReviewer impl | type-level + unit | `pnpm --filter @protostar/review test --grep model-reviewer-conformance` | ❌ W2 | ⬜ pending |
| 6-03-03 | 03 | 2 | PILE-03 | — | `ExecutionCoordinationPileResult` parser admits valid output | unit | `pnpm --filter @protostar/repair test --grep exec-coord-parser` | ❌ W2 | ⬜ pending |
| 6-03-04 | 03 | 2 | PILE-03 | — | `admitWorkSlicing` accepts pile-derived plan via existing admission path | unit | `pnpm --filter @protostar/planning test --grep admit-work-slicing` | ❌ W2 | ⬜ pending |
| 6-04-01 | 04 | 3 | PILE-01 | — | `--planning-mode pile` end-to-end produces admitted plan | integration | `pnpm --filter @protostar/admission-e2e test --grep planning-pile-live` | ❌ W3-W4 | ⬜ pending |
| 6-04-02 | 04 | 3 | Q-04 | — | CLI flag overrides factory-config mode | unit | `pnpm --filter protostar-factory test --grep pile-mode-precedence` | ❌ W3 | ⬜ pending |
| 6-04-03 | 04 | 3 | PILE-04 | T-6-06 / refusal-symmetry | refusal artifact byte-equal to fixture-parse failure | snapshot | `pnpm --filter @protostar/admission-e2e test --grep refusal-byte-equal` | ❌ W4 | ⬜ pending |
| 6-04-04 | 04 | 3 | PILE-03 | — | exec-coord pile invoked at work-slicing trigger | integration | `pnpm --filter @protostar/admission-e2e test --grep work-slicing-trigger` | ❌ W4 | ⬜ pending |
| 6-04-05 | 04 | 3 | PILE-03 | — | exec-coord pile invoked at repair-plan trigger | integration | `pnpm --filter @protostar/admission-e2e test --grep repair-plan-trigger` | ❌ W4 | ⬜ pending |
| 6-04-06 | 04 | 3 | PILE-06 | T-6-07 / runtime-no-fs | runtime: `runFactoryPile` does not touch wrapped `node:fs` | integration | `pnpm --filter @protostar/admission-e2e test --grep dogpile-adapter-no-fs` | ❌ W4 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/dogpile-types/src/index.ts` — re-export `RunEvent`, `RunResult`, `Trace`, `RunAccounting`, `NormalizedStopReason`, `ConfiguredModelProvider`, `StreamHandle`, plus runtime `run`/`stream`/`createOpenAICompatibleProvider`
- [ ] `packages/dogpile-adapter/src/no-fs.contract.test.ts` — static fs-import audit (mirror `authority-no-fs.contract.test.ts`)
- [ ] `packages/dogpile-adapter/src/index.ts` — Q-16 rename `executionCoordinatorPilePreset → executionCoordinationPilePreset`
- [ ] `packages/lmstudio-adapter/src/factory-config.schema.json` — `piles` block per Q-04
- [ ] `.planning/phases/05-review-repair-loop/05-CONTEXT.md` — annotate Q-10 retroactive update per Phase 6 Q-14

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| LM Studio live planning-pile smoke produces admitted plan | PILE-01 | Requires running LM Studio with Qwen3 models loaded; opt-in per Q-05 | Start LM Studio with Qwen3-Coder + Qwen3-80B; `pnpm --filter protostar-factory exec -- node ./dist/cli.js run --planning-mode pile <demo-mission>`; confirm `runs/<id>/admitted-plan.json` exists and `terminal-status.json.status === "admitted"` |
| Trace blob size at v0.1 dogfood within budget | Q-08 / Phase 9 OP-08 | Empirical measurement on real run | After live smoke run, `du -sh runs/<id>/piles/*/iter-*/trace.json`; flag if > 1 MB per pile |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
