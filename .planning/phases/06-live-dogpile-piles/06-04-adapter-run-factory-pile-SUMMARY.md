---
phase: 06
plan: 04
subsystem: dogpile-adapter
tags: [dogpile, sdk, abort-hierarchy, stream, q-01, q-02, q-11, q-15, q-16]
requires:
  - "@protostar/dogpile-types stream + StreamHandle + RunResult re-exports"
  - packages/dogpile-adapter/src/pile-failure-types.ts (Plan 06-03)
  - packages/dogpile-adapter/src/map-sdk-stop-to-pile-failure.ts (Plan 06-03)
provides:
  - "runFactoryPile(mission, ctx) network seam (Q-01, Q-02, Q-11)"
  - "buildExecutionCoordinationMission(intent, mode, input) two-trigger Q-15 builder"
  - "PileRunContext / PileRunOutcome / RunFactoryPileDeps wire types"
affects:
  - downstream plan 06-05 (createReviewPileModelReviewer consumes runFactoryPile)
  - downstream plan 06-06 (work-slicing + repair-plan triggers consume mission builder)
  - downstream plan 06-07 (factory-cli wiring consumes both)
tech-stack:
  added: []
  patterns:
    - "AbortSignal.any([parent, AbortSignal.timeout(N)]) hierarchical abort"
    - "Discriminated-union outcome + injected SDK seam for testability"
key-files:
  created:
    - packages/dogpile-adapter/src/run-factory-pile.ts
    - packages/dogpile-adapter/src/run-factory-pile.test.ts
    - packages/dogpile-adapter/src/execution-coordination-mission.ts
    - packages/dogpile-adapter/src/execution-coordination-mission.test.ts
  modified:
    - packages/dogpile-adapter/src/index.ts (barrel re-exports)
    - packages/dogpile-types/src/index.ts (added StreamEvent re-export)
decisions:
  - "Used injection seam (deps.stream) rather than module-level mocking — cleaner, plan-recommended"
  - "for-await loop skips StreamErrorEvent (type==='error'); error is redundant with handle.result rejection"
  - "extractStopReason walks RunResult.eventLog from end; FinalEvent.termination.normalizedReason wins; BudgetStopEvent.reason gets 'budget:' prefix lift"
  - "Test fake stream uses a ref'd setInterval(50ms) to keep loop alive while AbortSignal.timeout fires (production SDK keeps loop alive via real network IO, so runFactoryPile itself needs no timer)"
metrics:
  duration_minutes: ~25
  tasks_completed: 2
  tests_added: 12
  tests_total_after: 32
  completed_date: 2026-04-28
---

# Phase 6 Plan 04: Adapter runFactoryPile Summary

One-liner: Wire the network-only `runFactoryPile` seam (`stream()`-based, hierarchical-abort, six-variant-failure outcome) plus the two-trigger Q-15 mission builder, behind injected SDK deps so unit tests fully control the StreamHandle.

## Implementation

### Task 1 — `runFactoryPile`

Signature lock: `runFactoryPile(mission, ctx, deps?) → Promise<PileRunOutcome>`.

- Builds `childSignal = AbortSignal.any([ctx.signal, AbortSignal.timeout(ctx.budget.timeoutMs)])` (Q-11) and passes only the child to `stream()`.
- Calls `stream({ intent, model: ctx.provider, protocol, tier, agents, budget: { maxTokens, timeoutMs }, terminate, signal: childSignal })` (Q-02) — never `run()`.
- `for await` over the StreamHandle. Each non-error `RunEvent` is forwarded via `ctx.onEvent?.(ev)`; `StreamErrorEvent` is skipped (redundant with `handle.result` rejection).
- Awaits `handle.result`, runs `extractStopReason` (walks `eventLog.events` from end for `FinalEvent.termination?.normalizedReason` or `BudgetStopEvent.reason` → prefixed `budget:*`), and lifts SDK stop into `PileFailure` via `mapSdkStopToPileFailure` (Plan 06-03).
- Catch path:
  - If `childSignal.aborted` and `signal.reason instanceof DOMException && reason.name === 'TimeoutError'` → `pile-timeout` (with `elapsedMs` and `configuredTimeoutMs`).
  - Else if `childSignal.aborted` → `pile-cancelled` (`reason: ctx.signal.aborted ? 'parent-abort' : 'sigint'`).
  - Else → `pile-network` (`attempt: 1`, `lastError: { code, message }`); `extractErrorCode` recognizes `Error.code` first, else parses `\bE[A-Z0-9_]{3,}\b` from the message.
- Zero `node:fs`/`node:path` imports — static no-fs contract still passes (verified by `no-fs.contract.test.ts`).

### Task 2 — `buildExecutionCoordinationMission`

Signature lock: `(intent, mode: 'work-slicing' | 'repair-plan-generation', input: ExecutionCoordinationMissionInput) → FactoryPileMission`.

- Stamps a deterministic `MODE: <discriminator>` token in the intent text (Q-15) so downstream parsing in Plan 06-06 can branch reliably.
- `ExecutionCoordinationMissionInput` is a discriminated union: `{ kind: 'work-slicing', admittedPlan }` or `{ kind: 'repair-plan-generation', failingTaskIds, mechanicalCritique? }`.
- Throws on `mode !== input.kind` (T-6-16 mitigation — single source of mission text fails closed if upstream is inconsistent).
- Always emits the trailing `Return JSON only matching ExecutionCoordinationProposal; do not include explanatory prose.` instruction.
- Pure: no I/O, no clock reads.
- `mission.preset === executionCoordinationPilePreset` (referential equality — Q-16).

## Test Coverage

`packages/dogpile-adapter/src/run-factory-pile.test.ts` — 8 cases:

1. happy path (events forwarded, `stopReason === 'convergence'`)
2. happy-path duplicate (label test for `--grep run-factory-pile`)
3. on-event-forwarding count == events count
4. pile-timeout (`configuredTimeoutMs` preserved; parent **not** aborted)
5. abort-hierarchy parent abort → `pile-cancelled` reason `parent-abort`
6. abort-hierarchy: pile timeout does NOT abort parent (T-6-02 invariant)
7. pile-network (sync throw `ECONNREFUSED` → `class === 'pile-network'`, message preserved)
8. parsing deferred (Q-12) — invalid JSON output still `ok === true`

`packages/dogpile-adapter/src/execution-coordination-mission.test.ts` — 4 cases:

1. work-slicing → intent text contains `MODE: work-slicing` and confirmed-intent title
2. repair-plan-generation → each `failingTaskId` appears in intent text
3. mode/input.kind mismatch throws with explicit message
4. preset reference equality with `executionCoordinationPilePreset`

`pnpm --filter @protostar/dogpile-adapter test` → 32/32 pass (8 + 8 from Plan 06-03 + 12 new + 4 contract/no-fs).

## Test Fake Note

The fake stream in `run-factory-pile.test.ts` uses a ref'd `setInterval(_, 50)` while waiting on `AbortSignal.any` — `AbortSignal.timeout` schedules **unref'd** timers, so unit tests with no other IO would let the loop exit before the timeout fires. In production, the real SDK's network IO keeps the loop alive. This is purely a test concern; `runFactoryPile` itself needs no timer.

## Deviations from Plan

None — both tasks landed as specified. The plan's `<action>` recommended the injection seam approach (`RunFactoryPileDeps`) and that is what was used. `ctx.now` is honoured; per advisor reconciliation no separate `deps.now` was added (plan never required one explicitly).

The `PileRunContext.onEvent` is typed `(e: RunEvent) => void` per plan lock, but `StreamHandle` yields `StreamEvent = RunEvent | StreamErrorEvent`. Resolution: the for-await loop skips `event.type === 'error'` (StreamErrorEvent is stream-only and redundant with `handle.result` rejection — documented inline).

## Self-Check: PASSED

- packages/dogpile-adapter/src/run-factory-pile.ts: FOUND
- packages/dogpile-adapter/src/run-factory-pile.test.ts: FOUND
- packages/dogpile-adapter/src/execution-coordination-mission.ts: FOUND
- packages/dogpile-adapter/src/execution-coordination-mission.test.ts: FOUND
- Commit `6c28365`: FOUND (Task 1 — runFactoryPile)
- Commit `1a7df89`: FOUND (Task 2 — buildExecutionCoordinationMission)
- `pnpm --filter @protostar/dogpile-adapter test`: 32/32 pass
- Static no-fs contract: still passes (zero `node:fs`/`node:path` imports added)
