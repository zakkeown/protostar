---
phase: 04-execution-engine
verified: 2026-04-28T00:04:33Z
status: human_needed
score: 12/12 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 11/12
  gaps_closed:
    - "EXEC-05 evidence capture now writes task stdout.log, stderr.log, evidence.json, and references stdout/stderr/transcript artifacts from evidence.json."
    - "Authority admission-decision gate-name contract now asserts seven gates including coder-adapter-ready."
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Live LM Studio real-executor operator smoke"
    expected: "With qwen3-coder-next-mlx-4bit loaded and a trusted workspace, the real executor passes coder-adapter-ready preflight, writes journal/snapshot/evidence/stdout/stderr artifacts, applies a non-empty diff, and exits at the expected downstream gate."
    why_human: "The live model and trusted-workspace run depend on the operator's local LM Studio process and environment; automated verification used deterministic stub/preflight coverage."
---

# Phase 4: Execution Engine Verification Report

**Phase Goal:** Replace the dry-run executor with a boring, deterministic, resumable task runner. The first real `ExecutionAdapter` is the LM Studio coder (Qwen3-Coder-Next-MLX-4bit) producing real diffs.
**Verified:** 2026-04-28T00:04:33Z
**Status:** human_needed
**Re-verification:** Yes - after gap closure for EXEC-05 evidence streams and the authority gate-name test

## Goal Achievement

The two previous automated gaps are closed in live code. `runRealExecution` now creates per-task `stdout.log` and `stderr.log`, routes adapter token output into `stdout.log`, appends adapter failure reasons to `stderr.log`, and references stdout/stderr/transcript artifacts from `evidence.json`. The authority admission-decision contract now pins the seven-gate list including `coder-adapter-ready`.

Automated must-haves are verified. Final status remains `human_needed` because the phase includes a live external LM Studio integration path that requires an operator-local smoke check.

### Observable Truths

| # | Truth | Status | Evidence |
|---|---|---|---|
| 1 | ROADMAP: Task state transitions are persisted; killed/resumed runs reach terminal state | VERIFIED | `runRealExecution` appends JSONL journal events, snapshots terminal transitions, parses existing journals, and replays orphaned running tasks. `@protostar/execution` and `run-real-execution.test.js` pass. |
| 2 | ROADMAP: LM Studio coder adapter produces a non-empty diff for cosmetic-tweak fixture | VERIFIED | `createLmstudioCoderAdapter` tests return `change-set` for the cosmetic fixture and assert target pre-image hashes; `@protostar/lmstudio-adapter` passed with loopback stub permission. |
| 3 | ROADMAP: Adding a second adapter requires zero `packages/execution` contract change | VERIFIED | `ExecutionAdapter` remains provider-neutral; `adapterRef` and `allowedAdapters` are outside the execution contract. |
| 4 | ROADMAP: Lifecycle events are identical between dry-run and real-execution paths | VERIFIED | `run-real-execution.test.ts` asserts real event types are contained in dry-run event vocabulary. |
| 5 | EXEC-01: Task state machine and persisted transitions | VERIFIED | `ExecutionTaskStatus` and `ExecutionLifecycleEventType` use the six EXEC-01 literals; journal/snapshot tests pass. |
| 6 | EXEC-02: Typed `ExecutionAdapter` interface; LM Studio coder first adapter | VERIFIED | `packages/execution/src/adapter-contract.ts` defines the typed async adapter contract; LM Studio exports `createLmstudioCoderAdapter`. |
| 7 | EXEC-03: LM Studio coder adapter produces real diffs against workspace | VERIFIED | Adapter reads target files through `ctx.repoReader`, streams SSE, parses strict diff fences, returns a change set, and factory CLI applies it through `applyChangeSet`. |
| 8 | EXEC-04: Provider-abstracted execution | VERIFIED | `adapterRef`, `allowedAdapters`, and network authority are wired without LM-Studio-specific execution contracts. |
| 9 | EXEC-05: Per-task evidence writes stdout, stderr, evidence.json | VERIFIED | `run-real-execution.ts` initializes `stdout.log`/`stderr.log` at lines 367-371, writes tokens to stdout at lines 251-254, writes failure reason to stderr at lines 331-334, and records artifact refs in `evidence.json` at lines 336-349. |
| 10 | EXEC-06: Retries with exponential backoff capped by envelope | VERIFIED | Retry classifier/backoff and LM Studio retry tests cover transient HTTP/network failures, cap exhaustion, and deterministic jitter. |
| 11 | EXEC-07: Timeout handling typed and logged | VERIFIED | Per-task `AbortController` uses `taskWallClockMs`; timeout maps to `task-timeout`; execution and adapter timeout tests pass. |
| 12 | EXEC-08: Resumable task journal | VERIFIED | `parseJournalLines`, `reduceJournalToSnapshot`, `replayOrphanedTasks`, and factory-cli startup replay are covered by tests. |

**Score:** 12/12 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `packages/execution/src/index.ts` | EXEC-01 lifecycle vocabulary + dry-run executor | VERIFIED | Exports six task statuses/events and execution support modules. |
| `packages/execution/src/adapter-contract.ts` | Provider-neutral adapter contract | VERIFIED | Includes typed adapter events/results/context, repo reader, journal token hook, budgets, and network view. |
| `packages/execution/src/journal.ts`, `snapshot.ts`, `orphan-replay.ts` | Pure journal parsing/reduction/resume helpers | VERIFIED | Package tests pass, including journal parser, snapshot reducer, and orphan replay. |
| `apps/factory-cli/src/journal-writer.ts`, `snapshot-writer.ts` | Durable append/fsync and tmp+rename writers | VERIFIED | Factory CLI tests pass under `pnpm run verify`. |
| `packages/lmstudio-adapter/src/coder-adapter.ts` | LM Studio coder adapter | VERIFIED | Streams tokens, retries, parses diffs, respects timeout/cancel, computes pre-image hashes. |
| `apps/factory-cli/src/run-real-execution.ts` | Real executor loop and per-task evidence | VERIFIED | Evidence stream gap closed; stdout/stderr/evidence/transcript are created and referenced. |
| `apps/factory-cli/src/coder-adapter-admission.ts` | LM Studio preflight gate | VERIFIED | Mints network op before preflight and writes admission/refusal artifacts. |
| `packages/authority/src/admission-decision/base.ts` | Seven-gate authority contract | VERIFIED | `GATE_NAMES` includes `coder-adapter-ready`; test asserts length 7 and exact order. |
| `packages/planning/schema/admitted-plan.schema.json` and planning contracts | `targetFiles`/`adapterRef` schema/admission | VERIFIED | Adapter-aware admission rejects disallowed adapter refs. |
| `packages/intent/schema/confirmed-intent.schema.json` | 1.3.0 budget/network schema | VERIFIED | Intent tests cover network and retry/timeout budget schema fields. |

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `apps/factory-cli/src/main.ts` | `createLmstudioCoderAdapter` | real executor branch | WIRED | CLI real branch constructs the LM Studio adapter after admission. |
| `apps/factory-cli/src/main.ts` | `runRealExecution` | real executor branch | WIRED | Main passes run plan, repo reader, envelope, intent, journal writer, apply boundary, and abort signal. |
| `run-real-execution.ts` | `@protostar/repo applyChangeSet` | per-task apply boundary | WIRED | Change-set entries are authorized before patch application. |
| `run-real-execution.ts` | `replayOrphanedTasks` | startup resume bootstrap | WIRED | Existing journal is parsed, orphan events appended, and remaining tasks derived from snapshot. |
| `coder-adapter.ts` | `ctx.repoReader.readFile` | pre-image hashing | WIRED | Target files are read through the repo reader and hashes are pinned in tests. |
| `coder-adapter.ts` | `ctx.journal.appendToken` | token persistence hook | WIRED | Adapter emits token deltas; factory CLI hook now appends them to per-task `stdout.log`. |
| `run-real-execution.ts` | `evidence.json` | stdout/stderr artifact refs | WIRED | `evidence.json` includes `stdoutArtifact`, `stderrArtifact`, and `transcriptArtifact`; tests assert all three. |
| `coder-adapter-admission.ts` | `authorizeNetworkOp` + `preflightLmstudio` | preflight admission | WIRED | Network op is minted before loopback preflight; failure paths write refusal artifacts. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|---|---|---|---|---|
| `coder-adapter.ts` | `assistantContent` / `changeSet` | SSE `/chat/completions` chunks | Yes | FLOWING |
| `coder-adapter.ts` | pre-image hashes | `ctx.repoReader.readFile(targetFile)` | Yes | FLOWING |
| `run-real-execution.ts` | journal events | `emit()` to `journalWriter.appendEvent` | Yes | FLOWING |
| `run-real-execution.ts` | snapshot | `reduceJournalToSnapshot(allJournalEvents)` | Yes | FLOWING |
| `run-real-execution.ts` | stdout stream | `AdapterContext.journal.appendToken` | Yes | FLOWING to `task-<id>/stdout.log` |
| `run-real-execution.ts` | stderr failure detail | adapter failure reason | Yes | FLOWING to `task-<id>/stderr.log` |
| `run-real-execution.ts` | evidence artifact refs | `writeEvidenceFiles` | Yes | FLOWING to `evidence.json` |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| Factory CLI verification path | `pnpm run verify` | typecheck, intent tests, and factory-cli tests passed | PASS |
| Factory CLI real executor isolated file | `node --test apps/factory-cli/dist/run-real-execution.test.js` | 10 passed | PASS |
| Factory CLI serial compiled tests | `node --test --test-concurrency=1 dist/*.test.js` from `apps/factory-cli` | 122 passed | PASS |
| Authority package tests | `pnpm --filter @protostar/authority test` | 122 passed | PASS |
| Admission e2e tests | `pnpm --filter @protostar/admission-e2e test` | 62 passed | PASS |
| Execution package tests | `pnpm --filter @protostar/execution test` | 51 passed | PASS |
| LM Studio adapter tests | `pnpm --filter @protostar/lmstudio-adapter test` with loopback permission | 53 passed | PASS |

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|---|---|---|---|---|
| EXEC-01 | 04-01, 04-09, 04-10 | State machine with persisted transitions | SATISFIED | Types, dry-run vocab, journal writer, snapshot writer, orphan replay, and real executor all use six-state vocabulary. |
| EXEC-02 | 04-02, 04-06 | Typed adapter interface | SATISFIED | `ExecutionAdapter` and LM Studio adapter implementation are wired and tested. |
| EXEC-03 | 04-03, 04-04, 04-05, 04-06, 04-10 | LM Studio coder produces real diff | SATISFIED | Stub server, preflight, SSE parser, diff parser, prompt builder, adapter, and real executor apply path exist. |
| EXEC-04 | 04-02, 04-03, 04-08, 04-10 | Provider abstraction | SATISFIED | Provider-neutral adapter contract, `adapterRef`, `allowedAdapters`, network authority, and real branch are wired. |
| EXEC-05 | 04-06, 04-10 | Evidence capture per task | SATISFIED | `stdout.log`, `stderr.log`, `evidence.json`, and `transcript.json` are created; evidence JSON references stdout/stderr/transcript artifacts; tests assert success and failure stream paths. |
| EXEC-06 | 04-05, 04-06, 04-07, 04-10 | Retry/backoff capped by envelope | SATISFIED | Retry classifier/backoff and adapter loop honor `adapterRetriesPerTask`; tests pass. |
| EXEC-07 | 04-06, 04-07, 04-10 | Timeout typed failure | SATISFIED | `taskWallClockMs`, AbortController, adapter timeout reason, and `task-timeout` journal event are covered. |
| EXEC-08 | 04-02, 04-09, 04-10 | Resumable journal | SATISFIED | JSONL parser, snapshot reducer, orphan replay, startup resume are wired and tested. |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|---|---:|---|---|---|
| `apps/factory-cli/src/run-real-execution.ts` | 314, 388 | `return []` | INFO | Defensive empty-array paths for malformed change sets and absent journal file; not user-visible stubs. |
| `apps/factory-cli/src/run-real-execution.test.ts` | 369 | `return []` | INFO | Test helper for repo glob; not production behavior. |
| `pnpm --filter @protostar/factory-cli test` | n/a | transient Node test cancellation observed before green `pnpm run verify` | INFO | Two standalone runs cancelled later `runRealExecution` subtests, but isolated file, serial compiled tests, and `pnpm run verify` all passed. No blocker retained. |

### Human Verification Required

### 1. Live LM Studio Real-Executor Operator Smoke

**Test:** Start LM Studio with `qwen3-coder-next-mlx-4bit` loaded, run the factory CLI real executor against the cosmetic-tweak fixture in a trusted workspace, and inspect the run bundle.
**Expected:** The run passes `coder-adapter-ready`, writes journal/snapshot/evidence/stdout/stderr artifacts, applies a non-empty diff, and stops at the expected downstream gate.
**Why human:** Requires the operator's local LM Studio process/model and a trusted workspace; automated tests use deterministic stub servers and injectable fetches.

### Gaps Summary

No automated gaps remain. The previous EXEC-05 evidence-stream blocker and stale six-gate authority test are fixed. The only remaining verification need is the live external LM Studio operator smoke check.

---

_Verified: 2026-04-28T00:04:33Z_
_Verifier: the agent (gsd-verifier)_
