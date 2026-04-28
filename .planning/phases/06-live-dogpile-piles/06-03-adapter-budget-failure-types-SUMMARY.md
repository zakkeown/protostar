---
phase: 06-live-dogpile-piles
plan: 03
subsystem: dogpile-adapter
tags: [dogpile, budget, failure-taxonomy, q-10, q-13, pile-04, pile-05]
requires:
  - "@protostar/dogpile-types NormalizedStopReason re-export (Plan 06-01)"
provides:
  - "PileFailure six-variant discriminated union (Q-13)"
  - "ResolvedPileBudget + resolvePileBudget envelope-clamps-preset helper (Q-10)"
  - "mapSdkStopToPileFailure SDK→Protostar translator with assertNever exhaustiveness"
affects:
  - "Plan 06-04 runFactoryPile (consumes PileFailure, ResolvedPileBudget, resolvePileBudget, mapSdkStopToPileFailure)"
  - "Plan 06-07 factory-cli pile wiring (consumes PileFailure for refusal artifacts)"
tech-stack:
  added: []
  patterns:
    - "Exhaustive switch + assertNever default (compile-time fail-closed on SDK enum churn)"
    - "Per-field min budget intersection (mirrors Phase 2 intersectEnvelopes)"
key-files:
  created:
    - packages/dogpile-adapter/src/pile-failure-types.ts
    - packages/dogpile-adapter/src/resolve-pile-budget.ts
    - packages/dogpile-adapter/src/resolve-pile-budget.test.ts
    - packages/dogpile-adapter/src/map-sdk-stop-to-pile-failure.ts
    - packages/dogpile-adapter/src/map-sdk-stop-to-pile-failure.test.ts
  modified:
    - packages/dogpile-adapter/src/index.ts
decisions:
  - "Barrel re-exports landed in this plan (not deferred to Plan 06-04 as the plan body suggested) — the plan's own Task 3 acceptance gate (`node -e require(...)`) and the user-supplied success criteria both required barrel availability now."
metrics:
  duration: ~25min
  completed: 2026-04-28
---

# Phase 6 Plan 03: Adapter Budget + Failure Types Summary

PileFailure six-variant discriminated union and the two pure helpers (`resolvePileBudget`, `mapSdkStopToPileFailure`) that Plan 06-04 `runFactoryPile` will compose against; barrel-exported for downstream consumers.

## What Shipped

**PileFailure union** (`pile-failure-types.ts`) — six variants discriminated by `class`:
- `pile-timeout` — `{ elapsedMs, configuredTimeoutMs }`
- `pile-budget-exhausted` — `{ dimension: 'tokens'|'calls', consumed, cap }`
- `pile-schema-parse` — `{ sourceOfTruth, parseErrors[] }`
- `pile-all-rejected` — `{ candidatesEvaluated, judgeDecisions[] }`
- `pile-network` — `{ attempt, lastError: { code, message } }`
- `pile-cancelled` — `{ reason: 'sigint'|'parent-abort'|'sentinel' }`

Plus supporting types: `PileKind`, `PileSourceOfTruth`, `JudgeDecisionRef`, `PresetBudget`, `EnvelopeBudget`, `ResolvedPileBudget`. All readonly.

**resolvePileBudget(preset, envelope)** — per-field min where both defined; envelope-omitted fields fall through to preset (envelope is a CAP, not a FLOOR). Both omit → `Number.MAX_SAFE_INTEGER`. `maxCalls` included iff at least one input defines it. Pure: no I/O, no clock reads.

**mapSdkStopToPileFailure(stop, ctx)** — translates each `NormalizedStopReason` deterministically:

| SDK stop | Result |
|---|---|
| `budget:timeout` | `pile-timeout` (elapsedMs, configuredTimeoutMs) |
| `budget:tokens` | `pile-budget-exhausted` dimension=tokens |
| `budget:iterations` | `pile-budget-exhausted` dimension=calls (cap defaults to MAX_SAFE_INTEGER if maxCalls absent) |
| `judge:rejected` | `pile-all-rejected` (caller fills candidatesEvaluated/judgeDecisions from event log) |
| `budget:cost` / `convergence` / `judge:accepted` / `judge:score-threshold` | `null` (not failures) |

Exhaustive `switch` with `assertNever` default — new SDK enum values become TS compile errors, not silent fallthroughs (mitigates threat T-6-13).

`pile-network` and `pile-cancelled` are NOT produced by this helper; they arise in Plan 06-04 from caught exceptions.

## Test Counts

- `resolvePileBudget` — 8 cases (envelope clamps, envelope omits, preset omits, both omit, timeoutMs clamp, maxCalls passthrough, maxCalls absent, maxCalls clamp)
- `mapSdkStopToPileFailure` — 8 cases (one per Q-13 mapping branch + one combined null-stop assertion for `judge:accepted` + `judge:score-threshold`)
- Adapter test suite total after this plan: **20/20 pass** (4 prior + 16 new)
- Repo `pnpm run verify`: **124/124 pass** post-merge

## Barrel Exports (`packages/dogpile-adapter/src/index.ts`)

```ts
export type { EnvelopeBudget, JudgeDecisionRef, PileFailure, PileKind, PileSourceOfTruth, PresetBudget, ResolvedPileBudget } from "./pile-failure-types.js";
export { resolvePileBudget } from "./resolve-pile-budget.js";
export { mapSdkStopToPileFailure, type MapSdkStopContext } from "./map-sdk-stop-to-pile-failure.js";
```

## Deviations from Plan

**1. [Rule 3 — Blocking] Landed barrel re-exports in this plan (Task 3) instead of deferring to Plan 06-04**

- **Found during:** Task 3 acceptance gate authoring
- **Issue:** The plan body (Task 3 action note, lines 250–254) explicitly says "Do NOT edit `packages/dogpile-adapter/src/index.ts` in this plan — Plan 04 owns the consolidated barrel re-export edit." However the same task's `acceptance_criteria` (line 262) runs `node -e "const m=require('@protostar/dogpile-adapter'); if (typeof m.resolvePileBudget !== 'function') ..."` — a gate that cannot pass without the barrel update. The user-supplied success criteria also explicitly required: "`packages/dogpile-adapter/src/index.ts` re-exports `PileFailure`, `PileKind`, `ResolvedPileBudget`, `resolvePileBudget`, `mapSdkStopToPileFailure`."
- **Fix:** Added the full set of re-exports listed in the plan's deferred-update note (lines 251–253) — types `PileKind`, `PileFailure`, `JudgeDecisionRef`, `PresetBudget`, `EnvelopeBudget`, `ResolvedPileBudget`, `PileSourceOfTruth` plus runtime `resolvePileBudget`, `mapSdkStopToPileFailure`, plus a small extra (`MapSdkStopContext`) so callers can type their context object explicitly.
- **Rationale:** Resolved internal plan inconsistency in favor of the executable acceptance gate + user prompt. Plan 06-04's "barrel update" task becomes a no-op (or a passive verification), which is strictly better than landing a partial barrel now and a second edit later.
- **Files modified:** `packages/dogpile-adapter/src/index.ts`
- **Commit:** `f129fa4`

## Verification

- `pnpm --filter @protostar/dogpile-adapter build` — green
- `pnpm --filter @protostar/dogpile-adapter test` — 20/20 pass
- `node -e "import('@protostar/dogpile-adapter').then(m => …)"` (run from inside the package) — barrel exports resolvable
- Static `no-fs.contract.test.ts` (Plan 06-01) still passes — none of the new files import `node:fs`/`fs`/`node:path`/`path`
- Repo-wide `pnpm run verify` — 124/124 pass

## Threat Coverage

- **T-6-04** (preset exceeds envelope cap) — mitigated; `resolvePileBudget` enforces per-field min; tests 1, 5, 8 prove envelope clamps preset.
- **T-6-13** (new SDK enum value falls through silently) — mitigated; `assertNever` default branch turns missing cases into TS compile errors.
- **T-6-14** (PileFailure evidence leaks secrets) — accepted; all evidence fields are typed numerics or short codes/strings; no message bodies leak from this layer.

## Self-Check: PASSED

Created files (all present):
- `packages/dogpile-adapter/src/pile-failure-types.ts` — FOUND
- `packages/dogpile-adapter/src/resolve-pile-budget.ts` — FOUND
- `packages/dogpile-adapter/src/resolve-pile-budget.test.ts` — FOUND
- `packages/dogpile-adapter/src/map-sdk-stop-to-pile-failure.ts` — FOUND
- `packages/dogpile-adapter/src/map-sdk-stop-to-pile-failure.test.ts` — FOUND

Commits:
- `d4289bb` — feat(06-03): add PileFailure union and ResolvedPileBudget types
- `f87e853` — feat(06-03): add resolvePileBudget envelope-clamps-preset helper
- `f129fa4` — feat(06-03): add mapSdkStopToPileFailure and barrel exports
