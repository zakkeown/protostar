---
phase: 01-intent-planning-admission
plan: 02
subsystem: dogpile-adapter
tags: [dogpile, shim, ci-unblock, authority-boundary]
requires: []
provides:
  - "@protostar/dogpile-types workspace package"
  - "In-tree replacement for @dogpile/sdk surface used by Phase 1"
affects:
  - packages/dogpile-adapter
  - tsconfig.json
  - tsconfig.base.json
  - pnpm-lock.yaml
tech_stack_added: []
patterns_used:
  - "frozen JSON-serializable runtime helpers"
  - "ESM workspace package with composite tsconfig"
key_files_created:
  - packages/dogpile-types/package.json
  - packages/dogpile-types/tsconfig.json
  - packages/dogpile-types/src/index.ts
  - packages/dogpile-types/src/index.test.ts
key_files_modified:
  - packages/dogpile-adapter/package.json
  - packages/dogpile-adapter/src/index.ts
  - packages/dogpile-adapter/tsconfig.json
  - tsconfig.json
  - tsconfig.base.json
  - pnpm-lock.yaml
decisions:
  - "Vendored 5 symbols (2 types, 3 helpers) — well under the 10-symbol scope gate, all type-only or trivially-stubbable"
  - "DogpileOptions slimmed to the indexed-access fields adapter actually reads (protocol/tier/budget/terminate/agents); other SDK fields omitted by design — Phase 6 owns full integration"
  - "Runtime helpers return Object.freeze'd objects to enforce immutability + JSON-serializability"
metrics:
  duration: 12 minutes
  completed: 2026-04-26
  tasks: 2
  commits: 2
---

# Phase 01 Plan 02: Dogpile Types Shim Summary

In-tree vendored shim package `@protostar/dogpile-types` replaces the
sibling-repo `@dogpile/sdk` link, unblocking `pnpm install --frozen-lockfile`
on fresh-clone CI machines while preserving `dogpile-adapter`'s zero-I/O
Authority boundary.

## Pre-execution Surface Audit

Run on `packages/dogpile-adapter/src/index.ts` before vendoring:

```
import { budget, convergence, firstOf } from "@dogpile/sdk";
import type { AgentSpec, DogpileOptions } from "@dogpile/sdk";
```

**5 symbols total** — within the 10-symbol scope gate. Audit confirmed all
symbols are type-only or trivially-stubbable. No plan split required.

## Vendored Symbols (canonical inventory for Phase 6)

Phase 6 will replace this shim with a real `@dogpile/sdk` integration.
The exact surface owned in-tree today:

### Types

| Symbol | Source SDK reference | Notes |
|--------|----------------------|-------|
| `AgentSpec` | `@dogpile/sdk` 0.2.0 `dist/types.d.ts:479` | Mirrors id/role/instructions exactly |
| `DogpileOptions` | `@dogpile/sdk` 0.2.0 `dist/types.d.ts:2266` | **Slimmed** — only protocol/tier/budget/agents/terminate/metadata |
| `BudgetTier` | `"fast" \| "balanced" \| "quality"` | Named tier literal union |
| `BudgetCaps` | SDK `BudgetCaps` | maxTokens / maxCostUsd / maxIterations / timeoutMs |
| `ProtocolSelection` | SDK `ProtocolSelection` | Named protocol or discriminated config |
| `ProtocolName` | `"broadcast" \| "coordinator" \| "sequential" \| "shared"` | |
| `BroadcastProtocolConfig` | SDK | `kind: "broadcast"` |
| `CoordinatorProtocolConfig` | SDK | `kind: "coordinator"` |
| `SequentialProtocolConfig` | SDK | `kind: "sequential"` |
| `SharedProtocolConfig` | SDK | `kind: "shared"` |
| `BudgetTerminationCondition` | SDK | `kind: "budget"`, opaque shape |
| `ConvergenceTerminationCondition` | SDK | `kind: "convergence"` |
| `FirstOfTerminationCondition` | SDK | `kind: "firstOf"` |
| `FirstOfTerminationConditions` | SDK | non-empty tuple |
| `TerminationCondition` | SDK | union of the three above |

### Runtime helpers

| Symbol | Behavior |
|--------|----------|
| `budget(opts)` | Returns `Object.freeze({ kind: "budget", ...opts })` |
| `convergence(opts)` | Returns `Object.freeze({ kind: "convergence", ...opts })` |
| `firstOf(...conds)` | Returns frozen `{ kind: "firstOf", conditions: frozen tuple }` |

All three are pure functions. No I/O. JSON-serializable. Phase 6 will
replace with the SDK's real evaluators.

## Authority Boundary Verification

```
$ grep -E "process\.|fs\.|child_process|require\(['\"](fs|path|child_process)" \
    packages/dogpile-types/src/*.ts | grep -v '^#' | wc -l
0
```

Zero I/O imports in the shim — the adapter cannot inherit filesystem,
child-process, or environment access through this dependency.

## Lockfile Verification

```
$ grep -c '\.\./\.\./\.\./dogpile' pnpm-lock.yaml
0
```

The sibling-repo path resolution is fully gone. CI can clone this repo
in isolation and run `pnpm install --frozen-lockfile` deterministically.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Create `packages/dogpile-types` workspace with minimal vendored surface (TDD) | `e704e7b` | packages/dogpile-types/{package.json,tsconfig.json,src/index.ts,src/index.test.ts}, tsconfig.json, tsconfig.base.json, pnpm-lock.yaml |
| 2 | Rewire `dogpile-adapter` to consume `@protostar/dogpile-types`; remove sibling link | `828e402` | packages/dogpile-adapter/{package.json,src/index.ts,tsconfig.json}, pnpm-lock.yaml |

## Verification Results

- `pnpm --filter @protostar/dogpile-types build` — exit 0
- `pnpm --filter @protostar/dogpile-types test` — 4/4 tests pass
- `pnpm --filter @protostar/dogpile-adapter build` — exit 0
- `pnpm --filter @protostar/dogpile-adapter test` — 3/3 tests pass (existing
  `public-candidate-plan.contract.test.ts` still green after import swap)
- `grep -rn "@dogpile/sdk" packages/dogpile-adapter --include='*.ts' --include='*.json'` — 0 results
- `grep -c "link:" packages/dogpile-adapter/package.json` — 0
- `grep -c '\.\./\.\./\.\./dogpile' pnpm-lock.yaml` — 0
- Authority boundary grep — 0 I/O imports in `packages/dogpile-types/src/`

## Deviations from Plan

None — plan executed exactly as written. The single-line edit to the
file's banner comment (replaced `process.*` literal with "environment
access") was a self-imposed touch to satisfy the plan's own grep gate
in T1's acceptance criteria; it did not alter behavior.

## Threat Flags

None. The shim adds no new trust boundary; the original
`dogpile-adapter ↔ @dogpile/sdk` boundary is now
`dogpile-adapter ↔ @protostar/dogpile-types` with strictly less surface
and provably no I/O capability.

## Out of Scope (Noted, Not Fixed)

- Pre-existing `verify:full` failures in `@protostar/planning`
  (`persistAdmissionArtifact`, `assertAdmittedPlanFromPlanningPileResult`
  exports) — flagged as downstream-plan concerns by the orchestrator
  prompt. Untouched here.

## Self-Check: PASSED

All claimed files exist:

- `packages/dogpile-types/package.json` — FOUND
- `packages/dogpile-types/tsconfig.json` — FOUND
- `packages/dogpile-types/src/index.ts` — FOUND
- `packages/dogpile-types/src/index.test.ts` — FOUND

All claimed commits exist:

- `e704e7b` — FOUND (Task 1)
- `828e402` — FOUND (Task 2)
