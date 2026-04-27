# Phase 6 Discussion Log

**Mode:** `--power` (offline async answering)
**Source:** `06-QUESTIONS.json` (18/18 answered)
**Date:** 2026-04-27

Human-reference audit log of the discussion. Downstream agents (research, planner, executor) consume `06-CONTEXT.md`, not this file.

## A. Invocation surface

### Q-01 — Who calls `@dogpile/sdk` `run()`?
- **Selected:** `a` — dogpile-adapter exposes `runFactoryPile(mission, ctx)`
- Considered: factory-cli direct import; new `@protostar/pile-runtime` package

### Q-02 — SDK entrypoint shape
- **Selected:** `b` — `stream()` consuming `RunEvent`
- Considered: `run()` Promise; `Dogpile.pile()` builder

### Q-03 — Provider construction & sharing
- **Selected:** `c` — `AgentSpec.provider` override
- Considered: single shared provider; per-pile-kind provider

## B. Fixture vs live mode

### Q-04 — Mode-selection flag granularity
- **Selected:** `c` — `factory-config.json piles.{kind}.mode` with CLI override
- Considered: single `--piles-mode` global flag; per-pile CLI flags only

### Q-05 — Default mode for v0.1
- **Selected:** `a` — Default fixture; `--live` opts in
- Considered: default live; default per-archetype

### Q-06 — Fixture-mode fallback when live fails
- **Selected:** `a` — No auto-fallback; live failure = no-admission artifact
- Considered: auto-fallback to fixture; operator opt-in fallback flag

## C. Persistence & fs ownership

### Q-07 — Pile output directory layout
- **Selected:** `a` — `runs/{id}/piles/{kind}/iter-{N}/{result,trace,refusal}.json`
- Considered: co-locate under stage dir; flat `piles.jsonl`

### Q-08 — Trace persistence policy
- **Selected:** `a` — Always persist full `trace.json`
- Considered: persist only on failure; configurable per-mode

### Q-09 — Adapter zero-fs contract test
- **Selected:** `c` — Both static (in-package) + runtime (admission-e2e)
- Considered: static only; runtime only

## D. Budget enforcement & cancellation

### Q-10 — Capability envelope vs preset budget reconciliation
- **Selected:** `a` — Envelope clamps preset (intersect: min of each)
- Considered: envelope replaces preset; new per-pile-kind envelope schema field

### Q-11 — Cancellation / AbortSignal threading
- **Selected:** `b` — Hierarchical AbortControllers (per-pile parented to run-level)
- Considered: single run-level controller

## E. Failure → no-admission artifact mapping

### Q-12 — Pile failure refusal artifact location & shape
- **Selected:** `a` — Reuse existing planning/review refusal-artifact format
- Considered: piles-specific refusal layout

### Q-13 — Pile failure taxonomy
- **Selected:** `a` — Six-variant union (timeout/budget/parse/rejected/network/cancelled)
- Considered: three-bucket coarse taxonomy; mirror SDK `NormalizedStopReason`

## F. Composition with Phase 5

### Q-14 — Review pile vs Phase 5 Q-10 single-Qwen judge
- **Selected:** `a` — Phase 6 review pile REPLACES Phase 5 Q-10 single-Qwen judge
- Considered: coexist (Qwen as one of three pile agents); Phase 5 stays gate, pile produces advisory critiques
- **Cross-phase impact:** Phase 5 Q-10 retroactively narrowed to interface + fixture passthrough only

### Q-15 — Execution-coordination pile trigger point
- **Selected:** `c` — Both work-slicing AND repair-plan generation
- Considered: repair-plan critique only; repair-plan replacement only; v0.1 stub no-op

### Q-16 — Preset name discrepancy
- **Selected:** `a` — Rename code → `executionCoordinationPilePreset` (match roadmap)
- Considered: rename docs to match code; keep both (alias)

## G. Pile-output schemas & admission helpers

### Q-17 — Review-pile output assert helper
- **Selected:** `a` — Mirror in `@protostar/review`: `assertReviewPileResult` + `parseReviewPileResult`
- Considered: generic `assertPileResult<T>` in dogpile-adapter

### Q-18 — `ExecutionCoordinationPileResult` shape
- **Selected:** `a` — Same `{ output, source }` envelope as `PlanningPileResult`
- Considered: typed envelope `{ repairPlan, source }`

## Deferred Ideas

(None surfaced during this discussion — all answers stayed within Phase 6 scope.)

## Claude's Discretion (delegated to planner)

- Heuristic thresholds for `shouldInvokeWorkSlicing(admittedPlan)` (Q-15)
- Owning package for `ExecutionCoordinationPileResult` types — `@protostar/repair` vs new `@protostar/execution-coordination` (Q-18)
- Exact `PileSource` discriminator value space (Q-12 / planning parity)
- `runFactoryPile` argument shape — single mission vs `(preset, missionInput)` tuple (Q-01)
- Exact `factory-config.json` envelope path for `piles` block (Q-04 — verified against Phase 4 Q-09 schema)

## Cross-Phase Notes for Planner

- **Phase 5 Q-10 is RE-LOCKED by Phase 6 Q-14.** Update `.planning/phases/05-review-repair-loop/05-CONTEXT.md` with a "Re-locked in Phase 6 Q-14" annotation. If any in-flight Phase 5 plans reference a "single-Qwen lmstudio-judge adapter" implementation, re-scope to "ModelReviewer interface + fixture passthrough" only.
- The hierarchical AbortController pattern (Q-11) is novel to Phase 6 — document in `.planning/codebase/` as a reusable pattern for Phase 8 panel and Phase 9 resume.
- `executionCoordinatorPilePreset` rename (Q-16) is breaking but currently has no callers; land in the same plan as CLI flag wiring.
