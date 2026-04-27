---
phase: 4
slug: execution-engine
status: planned
nyquist_compliant: true
wave_0_complete: false
created: 2026-04-27
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Concrete test mapping lives in `04-RESEARCH.md` § Validation Architecture; this file is the gating contract.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node 22 `node:test` against compiled `dist/*.test.js` (existing project posture) |
| **Config file** | per-package `tsconfig.json` (no separate test config) |
| **Quick run command** | `pnpm --filter @protostar/<pkg> test` (single touched package) |
| **Full suite command** | `pnpm run verify:full` (recursive across all 10+ packages) |
| **Estimated runtime** | quick ~5–15s; full ~60–120s |

---

## Sampling Rate

- **After every task commit:** `pnpm --filter @protostar/<pkg> test` for the touched package
- **After every plan wave:** `pnpm run verify:full`
- **Before `/gsd-verify-work`:** `pnpm run verify:full` must be green
- **Max feedback latency:** 15 seconds (quick), 120 seconds (full)

---

## Per-Task Verification Map

> One row per task across all 10 plans. Anchor IDs (V-01..V-21) match `04-RESEARCH.md` § Validation Architecture.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 04-01-T1 | 04-01 | 0 | EXEC-01 (V-01) | T-04-01 | Vocab pin tests reject `passed`/`blocked` literals | unit (TDD-RED) | `pnpm --filter @protostar/execution test` | ❌ W0 | ⬜ pending |
| 04-01-T2 | 04-01 | 0 | EXEC-01 (V-02) | T-04-02 | Dry-run executor emits new event names; no compat shim | unit (TDD-GREEN) | `pnpm --filter @protostar/execution test` | ❌ W0 | ⬜ pending |
| 04-02-T1 | 04-02 | 1 | EXEC-02, EXEC-04 (V-03) | T-04-03 | AdapterEvent / Result / FailureReason exhaustiveness pinned | unit (TDD) | `pnpm --filter @protostar/execution test` | ❌ W0 | ⬜ pending |
| 04-02-T2 | 04-02 | 1 | EXEC-08 (V-04) | T-04-04 | TaskJournalEvent + ExecutionSnapshot discriminated-union exhaustiveness | unit (TDD) | `pnpm --filter @protostar/execution test` | ❌ W0 | ⬜ pending |
| 04-03-T1 | 04-03 | 0 | EXEC-03, EXEC-04 (V-05) | T-04-08 | New `@protostar/lmstudio-adapter` workspace builds + links | build/integration | `pnpm --filter @protostar/lmstudio-adapter build` | ❌ W0 | ⬜ pending |
| 04-03-T2 | 04-03 | 0 | EXEC-03 (V-06) | T-04-06, T-04-07 | Stub LM Studio HTTP server with 7 failure modes | integration (fixture) | `pnpm --filter @protostar/lmstudio-adapter test` | ❌ W0 | ⬜ pending |
| 04-03-T3 | 04-03 | 0 | EXEC-03 (V-07) | — | Cosmetic-tweak fixture (intent + plan + expected diff + prose-drift) | unit (fixture) | `pnpm --filter @protostar/lmstudio-adapter test` | ❌ W0 | ⬜ pending |
| 04-04-T1 | 04-04 | 1 | EXEC-03 (V-08) | T-04-09 | factory-config pure resolver: defaults / file / env precedence + configHash | unit (TDD) | `pnpm --filter @protostar/lmstudio-adapter test` | ❌ W0 | ⬜ pending |
| 04-04-T2 | 04-04 | 1 | EXEC-03 (V-09) | T-04-10, T-04-11 | preflightLmstudio classifies into ok / unreachable / model-not-loaded / empty-models / http-error | integration (TDD, stub) | `pnpm --filter @protostar/lmstudio-adapter test` | ❌ W0 | ⬜ pending |
| 04-05-T1 | 04-05 | 2 | EXEC-03 (V-10) | — | SSE parser: drains buffer; never drops final pre-DONE chunk (Pitfall 1); releaseLock on early break | unit (TDD) | `pnpm --filter @protostar/lmstudio-adapter test` | ❌ W0 | ⬜ pending |
| 04-05-T2 | 04-05 | 2 | EXEC-03 (V-11) | T-04-14 | Diff parser strict (no-block / multiple-blocks / ok); prompt builder includes targetFiles + AC | unit (TDD) | `pnpm --filter @protostar/lmstudio-adapter test` | ❌ W0 | ⬜ pending |
| 04-05-T3 | 04-05 | 2 | EXEC-06 (V-12) | T-04-12, T-04-13 | Retry classifier (transient HTTP/network; AbortError NOT transient) + deterministic backoff | unit (TDD) | `pnpm --filter @protostar/execution test` | ❌ W0 | ⬜ pending |
| 04-06-T1 | 04-06 | 3 | EXEC-02, EXEC-03, EXEC-05 (V-13) | T-04-15, T-04-18 | Coder adapter happy path + parse-reformat retry; Hash 1 of 2 comment present | integration (TDD, stub) | `pnpm --filter @protostar/lmstudio-adapter test` | ❌ W0 | ⬜ pending |
| 04-06-T2 | 04-06 | 3 | EXEC-06 (V-14) | T-04-12 | Retry on 5xx/network; retries-exhausted; envelope cap respected; deterministic backoff | integration (TDD, stub) | `pnpm --filter @protostar/lmstudio-adapter test` | ❌ W0 | ⬜ pending |
| 04-06-T3 | 04-06 | 3 | EXEC-07 (V-15) | T-04-16 | Per-task timeout abort (signal.reason='timeout'); cancellation distinguished; no listener leak (Pitfall 2) | integration (TDD, stub) | `pnpm --filter @protostar/lmstudio-adapter test` | ❌ W0 | ⬜ pending |
| 04-07-T1 | 04-07 | 2 | EXEC-06, EXEC-07 (V-16) | T-04-19, T-04-21 | Schema bumped 1.2.0 → 1.3.0 with `network.allow` enum + budget fields + if/then allowlist | unit (TDD) | `pnpm --filter @protostar/intent test` | ❌ W0 | ⬜ pending |
| 04-07-T2 | 04-07 | 2 | EXEC-06, EXEC-07 (V-16b) | T-04-20 | All signed-intent fixtures regenerated; full repo verify green (Pitfall 7) | integration | `pnpm run verify` | ❌ W0 | ⬜ pending |
| 04-08-T1 | 04-08 | 3 | EXEC-04 (V-17) | T-04-23 | authorizeNetworkOp enforces network.allow enum (none / loopback / allowlist + allowedHosts) | unit (TDD) | `pnpm --filter @protostar/authority test` | ❌ W0 | ⬜ pending |
| 04-08-T2 | 04-08 | 3 | EXEC-04 (V-18) | T-04-22, T-04-24 | task.targetFiles required; task.adapterRef admitted against allowedAdapters | unit + e2e (TDD) | `pnpm --filter @protostar/planning test && pnpm --filter @protostar/admission-e2e test` | ❌ W0 | ⬜ pending |
| 04-09-T1 | 04-09 | 3 | EXEC-01, EXEC-08 (V-19) | T-04-27, T-04-28 | Pure journal/snapshot/orphan-replay; truncation tolerance (last partial dropped, mid corruption throws) | unit (TDD) | `pnpm --filter @protostar/execution test` | ❌ W0 | ⬜ pending |
| 04-09-T2 | 04-09 | 3 | EXEC-08 (V-19b) | T-04-25, T-04-26 | fs writers: append+fsync (journal); tmp+rename (snapshot); concurrent-write atomicity | unit + integration | `pnpm --filter @protostar/factory-cli test` | ❌ W0 | ⬜ pending |
| 04-10-T1 | 04-10 | 4 | EXEC-03 (V-20a) | T-04-29 | factory-config loader (ENOENT default); fs RepoReader (path-traversal refusal); cancel wiring (SIGINT + sentinel + unlinkOnResume; Pitfall 5) | unit (TDD) | `pnpm --filter @protostar/factory-cli test` | ❌ W0 | ⬜ pending |
| 04-10-T2 | 04-10 | 4 | EXEC-03 (V-20b) | T-04-29, T-04-34 | coderAdapterReadyAdmission gate: 5 preflight outcomes + envelope-mint failure short-circuit | integration (TDD, stub) | `pnpm --filter @protostar/factory-cli test` | ❌ W0 | ⬜ pending |
| 04-10-T3 | 04-10 | 4 | EXEC-01, EXEC-05, EXEC-06, EXEC-07, EXEC-08 (V-21a) | T-04-31, T-04-32, T-04-33, T-04-35 | runRealExecution: happy / apply-failure block (Q-19) / timeout / sentinel-cancel / orphan-replay / snapshot interval / dry-run lifecycle parity / two-hash dance defense | integration (TDD, stub + mock fs) | `pnpm --filter @protostar/factory-cli test` | ❌ W0 | ⬜ pending |
| 04-10-T4 | 04-10 | 4 | EXEC-01, EXEC-03, EXEC-04, EXEC-05, EXEC-06, EXEC-07, EXEC-08 (V-21b) | T-04-29, T-04-30, T-04-31, T-04-32, T-04-33, T-04-34, T-04-35 | main.ts integration: --executor real branch + admission gate + cancel wiring + journal/snapshot writers + configHash in policy snapshot; full repo verify | integration + e2e | `pnpm run verify` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/execution/src/lifecycle.test.ts` — state-machine vocab pin (EXEC-01, Q-01/Q-04) — **Plan 04-01**
- [ ] `packages/execution/src/adapter-contract.test.ts` — `ExecutionAdapter` AsyncIterable shape pin (EXEC-02) — **Plan 04-02**
- [ ] `packages/execution/src/journal-types.test.ts` — `TaskJournalEvent` discriminated-union exhaustiveness pin (EXEC-08) — **Plan 04-02**
- [ ] `packages/lmstudio-adapter/internal/test-fixtures/stub-lmstudio-server.ts` — fixture LM Studio HTTP server (canned SSE + `/v1/models` + injectable failure modes) — **Plan 04-03** — load-bearing test asset, every adapter test depends on it
- [ ] `packages/lmstudio-adapter/internal/test-fixtures/cosmetic-tweak-fixture.ts` — single canonical cosmetic-tweak fixture (intent → plan → expected diff + prose-drift sample) — **Plan 04-03**

*Wave 0 must complete before Wave 1 work begins — these are the contract pins downstream waves consume.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real LM Studio end-to-end against Qwen3-Coder-Next on the developer's machine | EXEC-03 | Requires local LM Studio + 30 GB model download; CI cannot host | After all automated tests pass, run `pnpm --filter @protostar/factory-cli exec node ./dist/scripts/smoke.js --executor real --confirmed-intent <signed-fixture>` against a running LM Studio with `qwen3-coder-next-mlx-4bit` loaded. Assert: non-empty diff returned and applied to the cosmetic-tweak fixture workspace. |
| Double-Ctrl-C → SIGKILL → resume orphan path | EXEC-08, Q-03 | SIGKILL cannot be sent reliably from `node:test` runners on all platforms | Operator runs `pnpm dev:run-cosmetic-fixture &; sleep 3; kill -9 $!; pnpm dev:resume-last`. Assert: snapshot shows orphaned task replayed via `replayOrphanedTasks` and run reaches terminal state. |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (5 items above; created in plans 04-01 / 04-02 / 04-03)
- [x] No watch-mode flags (no `--watch`, no `vitest dev`)
- [x] Feedback latency < 15s quick / 120s full
- [x] `nyquist_compliant: true` set in frontmatter once planner has filled the verification map

**Approval:** planned (rows populated; tests not yet executed)
