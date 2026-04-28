---
phase: 09-operator-surface-resumability
verified: 2026-04-28T20:20:55Z
status: gaps_found
score: 7/8 must-haves verified
overrides_applied: 0
gaps:
  - truth: "OP-03: protostar-factory resume <runId> picks up from the last persisted task journal entry"
    status: partial
    reason: "The command parses the journal, computes orphaned tasks, clears transient CANCEL sentinels, and dispatches by stage, but the default production dependencies for real mid-execution and mid-review resume return ExitCode.NotResumable instead of continuing work. This is fail-closed, not end-to-end resumability."
    artifacts:
      - path: "apps/factory-cli/src/commands/resume.ts"
        issue: "defaultDependencies.resumeRealExecution and resumeReviewLoop emit 'not wired' messages and return ExitCode.NotResumable."
      - path: "packages/admission-e2e/src/resume-stage-dispatch.contract.test.ts"
        issue: "Contract test pins the fail-closed behavior for transient mid-execution resume rather than proving continuation."
    missing:
      - "Wire production resumeRealExecution to continue the Phase 4 real execution runner from the reconstructed orphan set."
      - "Wire production resumeReviewLoop to continue the review/repair loop from durable iteration state, or explicitly override OP-03 scope as fail-closed only."
---

# Phase 9: Operator Surface + Resumability Verification Report

**Phase Goal:** `run` / `status` / `resume` / `cancel` / `inspect` / `deliver` operator surface with resumability.
**Verified:** 2026-04-28T20:20:55Z
**Status:** gaps_found
**Re-verification:** No - initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | OP-01: `protostar-factory run` starts a new run from draft/confirmed intent | VERIFIED | `apps/factory-cli/src/main.ts` registers `buildRunCommand()` and preserves default `--...` argv normalization to `run`; `apps/factory-cli/src/commands/run.ts` validates draft/out inputs, two-key launch, then calls `runFactory(...)`. `pnpm --filter @protostar/factory-cli test` passed. |
| 2 | OP-02: `status [--run <runId>]` reports current state for one run or recent runs | VERIFIED | `apps/factory-cli/src/commands/status.ts` supports `--run`, `--limit`, `--all`, `--since`, `--json`, `--full`; uses `listRuns()` and `computeRunLiveness()`. Unit tests cover tables, JSON rows, missing run exit 3, stale orphan derivation. |
| 3 | OP-03: `resume <runId>` picks up from the last persisted task journal entry | FAILED | `resume.ts` reads `execution/journal.jsonl`, reduces snapshot, calls `replayOrphanedTasks`, and dispatches running/orphaned/repairing states, but the default production dependencies return `ExitCode.NotResumable` with "real mid-execution resume is not wired" / "real mid-review resume is not wired". |
| 4 | OP-04: `cancel <runId>` cooperatively cancels with cleanup | VERIFIED | `commands/cancel.ts` atomically marks `manifest.status='cancelling'`, writes `CANCEL`, refuses terminal and `ready-to-release` states, and `writeCancelledManifestForSentinelAbort` transitions sentinel aborts to `cancelled`. Tests cover sentinel and manifest behavior. |
| 5 | OP-05: `inspect <runId>` pretty-prints the run bundle | VERIFIED | `commands/inspect.ts` emits canonical `{ manifest, artifacts, summary }`, indexes manifest/plan/execution/review/evaluation/evolution/ci/pile/delivery artifacts with `sha256` and `bytes`, supports `--stage`, and never inlines trace contents. |
| 6 | OP-06: `deliver <runId>` is an explicit gated delivery trigger | VERIFIED | `commands/deliver.ts` accepts `ready-to-release` and retryable `completed` runs, re-reads `delivery/authorization.json`, confines `decisionPath`, re-mints through `reAuthorizeFromPayload`, invokes delivery runtime, persists result/CI JSONL, and transitions gated runs to `completed`. |
| 7 | OP-07: status/inspect output is JSON-stable and pipeable | VERIFIED | `writeStdoutJson()` canonicalizes through `@protostar/artifacts/canonical-json`; status/inspect schema contracts and help/stdout admission-e2e tests pass. Help output is routed to stderr. |
| 8 | OP-08: prune command or documented recipe exists for `.protostar/runs/` | VERIFIED | `commands/prune.ts` implements `prune --older-than <duration>` with dry-run default, `--confirm` deletion, archetype filtering, active-status protection, and no workspace-level JSONL deletion. Tests prove `.protostar/refusals.jsonl` and `.protostar/evolution/*.jsonl` remain byte-identical. |

**Score:** 7/8 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/factory-cli/src/main.ts` | Thin commander dispatcher registering Phase 9 commands | VERIFIED | Registers run/status/inspect/cancel/resume/deliver/prune and has a single CLI `process.exit(code)` entrypoint. |
| `apps/factory-cli/src/commands/run.ts` | Run command extraction | VERIFIED | Behavior-preserving wrapper around `runFactory`; adds delivery mode and pile/evolution flags. |
| `apps/factory-cli/src/commands/status.ts` | Status command | VERIFIED | Recent and single-run modes, human and JSON output. |
| `apps/factory-cli/src/commands/inspect.ts` | Inspect command | VERIFIED | Path-indexed artifact inventory with hashes and no trace inlining. |
| `apps/factory-cli/src/commands/cancel.ts` | Out-of-process cancel command | VERIFIED | Atomic manifest write plus `CANCEL` sentinel. |
| `apps/factory-cli/src/commands/resume.ts` | Resume command | PARTIAL | Journal replay and dispatch exist; production continuation dependencies fail closed. |
| `apps/factory-cli/src/commands/deliver.ts` | Deliver command | VERIFIED | Reauthorization boundary and delivery retry/noop behavior exist. |
| `apps/factory-cli/src/commands/prune.ts` | Prune command | VERIFIED | Scoped run-dir pruning with active guard. |
| `packages/review/src/delivery-authorization.ts` | Delivery reauthorization validator | VERIFIED | Rejects invalid payloads, missing decisions, non-pass gates, forged minimal decisions, runId mismatch, and missing final diff evidence. |
| `packages/admission-e2e/src/*Phase 9 contract tests*` | Public CLI regression locks | VERIFIED | Help, stdout canonical JSON, status schema, inspect schema, resume dispatch, exit codes, delivery reauthorization all present and passing. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `main.ts` | command modules | `program.addCommand(build*Command())` | WIRED | All seven subcommands are registered. |
| `status.ts` | `.protostar/runs` | `listRuns`, manifest reads, liveness helper | WIRED | Handles missing roots and malformed run IDs. |
| `inspect.ts` | run bundle files | static specs + pile iteration scan | WIRED | Produces artifact refs, not inlined payloads. |
| `cancel.ts` | in-flight run loop | `CANCEL` sentinel + `writeCancelledManifestForSentinelAbort` | WIRED | Existing cancel wiring observes sentinel; teardown writer sets `cancelled`. |
| `resume.ts` | Phase 4 journal model | `parseJournalLines`, `reduceJournalToSnapshot`, `replayOrphanedTasks` | PARTIAL | Journal replay is real; default continuation is not wired. |
| `deliver.ts` | review authorization | `reAuthorizeFromPayload` with confined decision path | WIRED | Does not import/use `mintDeliveryAuthorization` directly. |
| `prune.ts` | run discovery | `listRuns` + `fs.rm(join(runsRoot, runId))` | WIRED | Deletes only `runs/<id>` candidates after active guard. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `commands/status.ts` | rows | Manifest, review/evaluation/delivery/evolution files plus liveness/journal mtime | Yes | FLOWING |
| `commands/inspect.ts` | artifacts | Files under run dir scanned and hashed | Yes | FLOWING |
| `commands/cancel.ts` | manifest/CANCEL | Existing manifest read, atomic rewrite, sentinel write | Yes | FLOWING |
| `commands/resume.ts` | orphanSet/startIter | Parsed Phase 4 journal and review pile iteration dirs | Partial | HOLLOW at production continuation: data is computed, then default handlers refuse. |
| `commands/deliver.ts` | authorization/delivery result | `delivery/authorization.json`, review decision, delivery runtime outcome | Yes | FLOWING |
| `commands/prune.ts` | candidates/protected/deleted | Run directory mtimes and manifests | Yes | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Review reauthorization suite | `pnpm --filter @protostar/review test` | 69 tests passed | PASS |
| Factory CLI operator commands | `pnpm --filter @protostar/factory-cli test` | 319 tests passed | PASS |
| Admission E2E public CLI contracts | `pnpm --filter @protostar/admission-e2e test` | 124 tests passed | PASS |
| Prior review-fix full verification | `pnpm run verify` | Reported in `09-REVIEW.md` as passed after review fixes; not re-run here to keep verification scoped | PASS (reported) |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| OP-01 | 09-01, 09-11 | `run` starts a new run from draft or confirmed intent | SATISFIED | Dispatcher + run command extraction; factory-cli tests passed. |
| OP-02 | 09-04, 09-11 | `status [--run]` reports run state | SATISFIED | `status.ts`, `run-discovery.ts`, `run-liveness.ts`, status command tests and schema contracts. |
| OP-03 | 09-07, 09-11 | `resume <runId>` picks up from journal | BLOCKED | Replay exists, but default production continuation returns NotResumable. |
| OP-04 | 09-06, 09-11 | `cancel <runId>` cooperative cancel | SATISFIED | Sentinel + atomic cancelling status + sentinel abort teardown. |
| OP-05 | 09-05, 09-11 | `inspect <runId>` pretty-prints bundle | SATISFIED | Canonical inspect output with path-indexed artifacts and no trace inline. |
| OP-06 | 09-08, 09-09, 09-11 | `deliver <runId>` explicit delivery trigger | SATISFIED | Gated authorization payload writer, deliver command, reauthorization validator. |
| OP-07 | 09-01, 09-02, 09-04, 09-05, 09-08, 09-09, 09-10, 09-11 | JSON-stable pipeable output | SATISFIED | Shared `sortJsonValue`, `writeStdoutJson`, schema/help/stdout contracts. |
| OP-08 | 09-10, 09-11 | Prune recipe/command | SATISFIED | Real prune command with dry-run default and JSONL preservation tests. |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `apps/factory-cli/src/commands/resume.ts` | 37-45 | Default resume handlers return NotResumable | BLOCKER | Prevents OP-03 from being true end-to-end in production CLI. |
| `apps/factory-cli/src/run-discovery.ts` | 29-31 | Best-effort empty array on `readdir` errors | INFO | Acceptable for status/prune resilience; could hide filesystem permission problems from operators. |
| `apps/factory-cli/src/commands/deliver.ts` | 33 | Typo in operator-facing reason: "was the run loop reach ready-to-release?" | INFO | Cosmetic clarity issue; does not affect goal achievement. |

### Human Verification Required

None. The remaining failure is observable in code and contracts: default resume continuation is fail-closed.

### Gaps Summary

Phase 9 substantially delivers the operator surface: command dispatch, status, inspect, cancel, deliver, prune, canonical stdout, stable schemas, and reauthorization are implemented and covered. The blocking gap is the "Resumability" half of the phase goal. `resume` is not a hollow stub: it validates run IDs, clears transient cancel sentinels, parses the Phase 4 journal, computes orphaned tasks, and dispatches by state. But in the actual production CLI, both continuation handlers intentionally refuse with `ExitCode.NotResumable`. That is safer than false success, but it does not satisfy the roadmap wording that `resume <id>` recovers a killed run from its task journal.

Residual risks:

- True mid-execution continuation is fail-closed, not implemented.
- True mid-review continuation is fail-closed, not implemented.
- `status` derives `orphaned` from timestamps without mutating the manifest; this is consistent with Phase 9 context but means recovery state is partly computed at read time.
- `prune` may leave append-only evolution JSONL entries pointing at deleted run snapshots; this is documented as an expected ENOENT-tolerant reader requirement.

---

_Verified: 2026-04-28T20:20:55Z_
_Verifier: the agent (gsd-verifier)_
