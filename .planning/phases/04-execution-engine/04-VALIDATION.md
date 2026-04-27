---
phase: 4
slug: execution-engine
status: draft
nyquist_compliant: false
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
| **Full suite command** | `pnpm run verify:full` (recursive across all 9+ packages) |
| **Estimated runtime** | quick ~5–15s; full ~60–120s (per current Phase 1 baseline of 293/293) |

---

## Sampling Rate

- **After every task commit:** `pnpm --filter @protostar/<pkg> test` for the touched package
- **After every plan wave:** `pnpm run verify:full`
- **Before `/gsd-verify-work`:** `pnpm run verify:full` must be green
- **Max feedback latency:** 15 seconds (quick), 120 seconds (full)

---

## Per-Task Verification Map

> Filled by planner during step 8 — each plan task gets a row. Anchor IDs match `04-RESEARCH.md` § Validation Architecture (V-01 … V-21).

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| _planner-fills_ | _planner-fills_ | _planner-fills_ | EXEC-01..08 | _planner-fills_ | _planner-fills_ | unit / contract | `pnpm --filter <pkg> test` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/execution/src/lifecycle.test.ts` — state-machine vocab pin (EXEC-01, Q-01/Q-04)
- [ ] `packages/execution/src/adapter-contract.test.ts` — `ExecutionAdapter` AsyncIterable shape pin (EXEC-02)
- [ ] `packages/lmstudio-adapter/test/stub-server.ts` — fixture LM Studio HTTP server (canned SSE + `/v1/models` + injectable failure modes) — **load-bearing test asset, every adapter test depends on it**
- [ ] `packages/lmstudio-adapter/test/fixtures/cosmetic-tweak/*` — single canonical cosmetic-tweak fixture (intent → plan → expected diff)
- [ ] `packages/execution/src/journal-types.test.ts` — `TaskJournalEvent` discriminated-union exhaustiveness pin (EXEC-08)

*Wave 0 must complete before Wave 1 work begins — these are the contract pins downstream waves consume.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real LM Studio end-to-end against Qwen3-Coder-Next on the developer's machine | EXEC-03 | Requires local LM Studio + 30 GB model download; CI cannot host | After all automated tests pass, run `pnpm --filter @protostar/lmstudio-adapter exec node ./dist/scripts/smoke.js` (planner adds) against a running LM Studio with `qwen3-coder-next-mlx-4bit` loaded. Assert: non-empty diff returned for cosmetic-tweak fixture. |
| Double-Ctrl-C → SIGKILL → resume orphan path | EXEC-07, Q-03 | SIGKILL cannot be sent reliably from `node:test` runners on all platforms | Operator runs `pnpm dev:run-cosmetic-fixture &; sleep 3; kill -9 $!; pnpm dev:resume-last`. Assert: snapshot shows orphaned task replayed and run reaches terminal state. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags (no `--watch`, no `vitest dev`)
- [ ] Feedback latency < 15s quick / 120s full
- [ ] `nyquist_compliant: true` set in frontmatter once planner has filled the verification map

**Approval:** pending
