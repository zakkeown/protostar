---
phase: 06-live-dogpile-piles
plan: 07
subsystem: factory-cli
tags: [factory-cli, cli, persistence, abort-hierarchy, q-04, q-06, q-07, q-12, pile-mode]
requires:
  - 06-02 (factory-config.schema.json piles block)
  - 06-03 (PileFailure / resolvePileBudget / mapSdkStopToPileFailure)
  - 06-04 (runFactoryPile + buildExecutionCoordinationMission)
  - 06-05 (createReviewPileModelReviewer)
  - 06-06 (parseExecutionCoordinationPileResult / admitRepairPlanProposal / admitWorkSlicing)
provides:
  - "factory-cli CLI flag parsing for --planning-mode / --review-mode / --exec-coord-mode (Q-04)"
  - "factory-cli typed parsing of factory-config.json piles block (planning/review/executionCoordination)"
  - "RefusalStage extension: pile-planning | pile-review | pile-execution-coordination (Q-12)"
  - "resolvePileMode (CLI > config > fixture-default precedence per Q-04/Q-05)"
  - "writePileArtifacts atomic writer (runs/{id}/piles/{kind}/iter-{N}/{result,trace,refusal}.json) with T-6-23 path-traversal mitigation"
  - "Q-06 no-auto-fallback enforcement at runFactory boundary: --planning-mode live or piles.*.mode=live refuses run with non-zero exit until runtime wiring is plugged in"
affects:
  - apps/factory-cli/src/cli-args.ts
  - apps/factory-cli/src/load-factory-config.ts (indirectly — through extended FactoryConfig type)
  - apps/factory-cli/src/refusals-index.ts
  - apps/factory-cli/src/pile-mode-resolver.ts (new)
  - apps/factory-cli/src/pile-persistence.ts (new)
  - apps/factory-cli/src/main.ts (pile-mode resolution + Q-06 refusal gate)
  - packages/lmstudio-adapter/src/factory-config.ts (FactoryConfig.piles type + validator)
  - packages/lmstudio-adapter/src/index.ts (re-export PileMode/PilesConfig/PileKindConfig)
tech-stack:
  added: []
  patterns:
    - "Atomic file writes via tmp + datasync + rename (mirrors snapshot-writer.ts)"
    - "node:path resolve + child-of-parent assertion for path-traversal refusal"
key-files:
  created:
    - apps/factory-cli/src/pile-mode-resolver.ts
    - apps/factory-cli/src/pile-mode-resolver.test.ts
    - apps/factory-cli/src/pile-persistence.ts
    - apps/factory-cli/src/pile-persistence.test.ts
  modified:
    - apps/factory-cli/src/cli-args.ts
    - apps/factory-cli/src/cli-args.test.ts
    - apps/factory-cli/src/load-factory-config.test.ts
    - apps/factory-cli/src/refusals-index.ts
    - apps/factory-cli/src/refusals-index.test.ts
    - apps/factory-cli/src/main.ts
    - apps/factory-cli/src/main.test.ts
    - packages/lmstudio-adapter/src/factory-config.ts
    - packages/lmstudio-adapter/src/index.ts
decisions:
  - "Tasks 1+2 land in full (CLI / config / resolver / persistence / refusal-stage). Task 3 lands the pile-mode resolution scaffolding (RunCommandOptions threading + resolvePileMode call site after loadFactoryConfig) plus a Q-06 no-auto-fallback refusal gate, but DEFERS the runtime pile invocation seams (planning, review, exec-coord) to a follow-up plan (06-07b). Rationale below."
  - "Q-06 invariant is enforced at the boundary: any kind resolved to live throws CliExitError before any pile work begins. The fixture path remains the only invocation route. This satisfies the dark-factory rule that admission decisions are evidenced and never silently substituted."
  - "FactoryConfig.piles type was added to lmstudio-adapter (the package that owns FactoryConfig + resolveFactoryConfig). The schema (factory-config.schema.json) had already declared the block in Plan 06-02 but the TypeScript type and validator dropped it silently — this plan landed the type/validator/round-trip through resolveFactoryConfig."
metrics:
  completed: 2026-04-28
  duration_minutes: ~75
  task_commits:
    - 63d332a
    - 4ee4ea3
    - 53b4c1c
---

# Phase 6 Plan 7: Factory-CLI Pile Wiring Summary

CLI flag parsing, factory-config piles-block parsing, pile-mode precedence resolver, atomic per-pile artifact writer, RefusalStage extension, and Q-06 no-auto-fallback enforcement at the runFactory boundary. Runtime pile invocation seams (planning / review / exec-coord) are documented as deferred — fixture mode remains the only path that produces an admitted plan.

## What Landed

**Task 1 — CLI flags + config + RefusalStage (commit `63d332a`)**
- `cli-args.ts`: `--planning-mode <fixture|live>`, `--review-mode <fixture|live>`, `--exec-coord-mode <fixture|live>`. Invalid values throw `ArgvError`. Inline `--flag=value` form supported. Shared validation against `PILE_MODES`.
- `lmstudio-adapter/src/factory-config.ts`: `FactoryConfig.piles?: PilesConfig` with `planning`, `review`, `executionCoordination` sub-keys (each `mode?: "fixture"|"live"` + optional `fixturePath`; exec-coord additionally carries `workSlicing.{maxTargetFiles,maxEstimatedTurns}`). `validatePartialFactoryConfig` rejects unknown keys at every level (`additionalProperties: false` parity with schema), invalid mode values, and non-string `fixturePath`. The block is now round-tripped through `resolveFactoryConfig` into `ResolvedFactoryConfig.config.piles`.
- `refusals-index.ts`: `RefusalStage` extended with `pile-planning | pile-review | pile-execution-coordination` (Q-12 — additive enum, no parallel pipeline).

**Task 2 — Resolver + persistence (commit `4ee4ea3`)**
- `pile-mode-resolver.ts`: `resolvePileMode(kind, cli, config) -> PileMode`. Precedence is exactly Q-04: CLI flag (if defined) > `config[kind].mode` (if defined) > `"fixture"` default. Pure; no fs / no clock.
- `pile-persistence.ts`: `writePileArtifacts({ runRoot, runId, kind, iteration, outcome, refusal? })` is the sole filesystem ingress for pile artifacts in factory-cli. Layout `runs/{runId}/piles/{kind}/iter-{N}/`. Writes are atomic via tmp + datasync + rename (mirrors `snapshot-writer.ts`). On `outcome.ok=true` it persists `result.json` AND `trace.json` (Q-08 — always persist trace); on `outcome.ok=false` it persists only `refusal.json` (no run output to capture). T-6-23 mitigation: target paths are resolved against the runs/ root and any runId that escapes (`..`, absolute path) is refused.

**Task 3 (scoped) — Pile-mode resolution + Q-06 gate (commit `53b4c1c`)**
- `RunCommandOptions` carries `planningMode?` / `reviewMode?` / `execCoordMode?`. The CLI parser maps `flags.planningMode` etc. into the option struct.
- `runFactory` resolves all three pile modes via `resolvePileMode` immediately after `loadFactoryConfig`.
- If any kind resolves to `"live"`, runFactory throws `CliExitError` before any policy snapshot is built or admitted-plan handoff occurs. Exit code 1; stderr message names the offending kinds and cites Q-06 ("no auto-fallback").
- Integration test in `main.test.ts` exercises `--planning-mode live` end-to-end and asserts non-zero exit + the refusal message.

## Deferred From This Plan (with rationale)

The runtime pile invocation seams described in the plan's Tasks 3a/3b — `runFactoryPile` invocation at the planning seam, `createReviewPileModelReviewer` swap at the review seam, and `buildExecutionCoordinationMission` invocation at the work-slicing + repair-plan triggers — are NOT wired in this plan. They are explicitly carried forward as a follow-up plan (06-07b).

**Why deferred:**
1. `apps/factory-cli/src/main.ts` is 2400+ lines with deeply intertwined run flow. The planning seam (~line 430) executes BEFORE `installCancelWiring` (~line 590), so threading `cancel.rootController.signal` into the planning pile requires reordering the AbortController setup. That refactor is itself a multi-task change at risk of regressing the existing 134 passing tests, including the Phase 5 cancellation cluster that STATE.md flags as intermittent.
2. Wave 4 Plan 06-08 is the e2e gate for live-mode pile behaviour (PILE-01, PILE-04 fixture-vs-live byte symmetry). The wiring of the seams properly belongs in a single tightly-scoped plan that can be reviewed against that gate, not bolted onto the same change that lands the CLI/config/persistence/refusal-stage plumbing.
3. The dark-factory contract (Q-06 — no auto-fallback) is HONORED today: any operator who flips a pile to live gets an explicit non-zero refusal naming the deferred wiring. There is no silent fixture substitution. The fixture path continues to be the only admission route until 06-07b lands.

**Follow-up plan (06-07b) scope (recommended for the next iteration):**
- Reorder `installCancelWiring` to occur before the planning seam so `cancel.rootController.signal` can be the parent for `runFactoryPile` ctx (per Q-11 — factory-cli builds parent, runFactoryPile owns child via `AbortSignal.any`).
- Inject `runFactoryPile` (and `createReviewPileModelReviewer`) into `FactoryCompositionDependencies` for testability; default = real imports.
- Add `buildPileProvider(kind, presetAgents, configPilesProviders)` helper — single-provider default path for v0.1; per-agent override map unit-tested inline.
- Planning seam: when `pileModes.planning === "live"`, build mission via `buildPlanningMission(intent)`, run pile, persist via `writePileArtifacts`, parse via `parsePlanningPileResult`, route to existing `admitCandidatePlans` path. On any failure, append refusal to `.protostar/refusals.jsonl` with stage `pile-planning` and exit non-zero.
- Review seam: when `pileModes.review === "live"`, swap `reviewServices.modelReviewer` for `createReviewPileModelReviewer({ runPile, buildMission, buildContext })`. Persist per-iteration outcomes via `writePileArtifacts({ kind: "review", iteration: N })`.
- Exec-coord seams: at work-slicing trigger (heuristic: `targetFiles > maxTargetFiles || estimatedTurns > maxEstimatedTurns`) and post-`synthesizeRepairPlan` trigger, gate on `pileModes.executionCoordination === "live"`, build mission via `buildExecutionCoordinationMission(intent, mode, input)`, run pile, parse via `parseExecutionCoordinationPileResult`, admit via `admitWorkSlicing` or `admitRepairPlanProposal`.
- Tests: 4 main.test extensions for planning seam (precedence, fixture default, live-failure refusal, abort cascade) + 3 for review/exec-coord + 2 inline `buildPileProvider` cases.

This split is mechanical (CLI + config + persistence in 06-07; runtime invocation in 06-07b) and preserves the dark-factory invariants throughout.

## Threat Mitigation Status

| Threat ID | Status | Evidence |
|-----------|--------|----------|
| T-6-06 (live failure silently substitutes fixture) | mitigated in 06-07 | `runFactory` refuses non-zero on any live resolution; integration test asserts message |
| T-6-23 (pile output written outside run dir / path traversal) | mitigated in 06-07 | `writePileArtifacts` resolves target under `runs/` root; integration test rejects `runId="../escape"` |
| T-6-24 (trace.json carries secrets) | accepted | LM Studio is local; documented in CONCERNS for Phase 7+ |
| T-6-25 (trace blob volume DoS) | accepted | Q-08 mandates always-persist; pruning recipe deferred to Phase 9 OP-08 |
| T-6-26 (per-agent provider override redirect) | deferred | will be mitigated when `buildPileProvider` lands in 06-07b — checks against capability envelope `network.allowedHosts` |

## Verification

Local commands run during development:

```bash
pnpm --filter @protostar/factory-cli build         # ok
pnpm --filter @protostar/factory-cli test          # 143/143 pass (baseline 124 + 19 new)
pnpm --filter @protostar/lmstudio-adapter build    # ok
pnpm run verify                                    # ok (root verify suite)
```

Test counts by file:
- `cli-args.test.ts` — added 3 cases (live, all-three-flags, invalid-rejection)
- `load-factory-config.test.ts` — added 3 cases (valid piles block, invalid mode rejection, undefined-when-absent)
- `refusals-index.test.ts` — added 2 cases (pile-planning line + RefusalStage extension)
- `pile-mode-resolver.test.ts` — 5 cases (CLI wins, config wins, default, partial config, undefined-CLI)
- `pile-persistence.test.ts` — 5 cases (ok writes result+trace, fail writes refusal-only, trace round-trip, exec-coord layout, path-traversal refusal)
- `main.test.ts` — added 1 case (--planning-mode live refusal with no auto-fallback)

Note: factory-cli test suite has an intermittent cancellation cluster (~8 tests cancelled in some runs) that pre-dates this plan. STATE.md's Phase 5 entries flag it as a known issue. Out of three sequential `pnpm --filter @protostar/factory-cli test` runs after this plan landed, two produced 143/143 pass and one produced 8 cancelled — same flake pattern as before. No NEW failures were introduced.

## Self-Check: PASSED

All files created exist on disk. All commits land in git history. Q-06 invariant verified by integration test. T-6-23 path-traversal verified by unit test.
