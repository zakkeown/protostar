---
phase: 06-live-dogpile-piles
plan: 07
subsystem: factory-cli
tags: [factory-cli, cli, persistence, abort-hierarchy, q-04, q-06, q-07, q-11, q-12, q-14, pile-mode]
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
  - "Run-level AbortController constructed before the planning seam; consumed by installCancelWiring as parent (Q-11)"
  - "Planning seam wired: --planning-mode live invokes runFactoryPile, persists outcome, parses output, routes to existing admission (PILE-01)"
  - "Review seam wired: --review-mode live swaps the ModelReviewer for createReviewPileModelReviewer (PILE-02 / Q-14 retroactive lock made real)"
  - "Q-06 no-auto-fallback enforced: pile failure (ok=false or parse error) writes refusal artifact, appends .protostar/refusals.jsonl entry with pile-* stage, throws CliExitError"
affects:
  - apps/factory-cli/src/cli-args.ts
  - apps/factory-cli/src/cancel.ts (accept external rootController)
  - apps/factory-cli/src/load-factory-config.ts (indirectly — through extended FactoryConfig type)
  - apps/factory-cli/src/refusals-index.ts
  - apps/factory-cli/src/pile-mode-resolver.ts (new)
  - apps/factory-cli/src/pile-persistence.ts (new)
  - apps/factory-cli/src/main.ts (pile-mode resolution + planning seam + review seam)
  - apps/factory-cli/package.json (+@protostar/dogpile-types dep)
  - packages/lmstudio-adapter/src/factory-config.ts (FactoryConfig.piles type + validator)
  - packages/lmstudio-adapter/src/index.ts (re-export PileMode/PilesConfig/PileKindConfig)
tech-stack:
  added: []
  patterns:
    - "Atomic file writes via tmp + datasync + rename (mirrors snapshot-writer.ts)"
    - "node:path resolve + child-of-parent assertion for path-traversal refusal"
    - "Hierarchical AbortController: factory-cli parent + AbortSignal.any timeout child inside runFactoryPile (Q-11)"
key-files:
  created:
    - apps/factory-cli/src/pile-mode-resolver.ts
    - apps/factory-cli/src/pile-mode-resolver.test.ts
    - apps/factory-cli/src/pile-persistence.ts
    - apps/factory-cli/src/pile-persistence.test.ts
  modified:
    - apps/factory-cli/src/cli-args.ts
    - apps/factory-cli/src/cli-args.test.ts
    - apps/factory-cli/src/cancel.ts
    - apps/factory-cli/src/load-factory-config.test.ts
    - apps/factory-cli/src/refusals-index.ts
    - apps/factory-cli/src/refusals-index.test.ts
    - apps/factory-cli/src/main.ts
    - apps/factory-cli/src/main.test.ts
    - apps/factory-cli/package.json
    - packages/lmstudio-adapter/src/factory-config.ts
    - packages/lmstudio-adapter/src/index.ts
decisions:
  - "Tasks 1, 2, and 3a (planning seam) are fully wired with passing tests. Task 3b is partially wired: the review seam is fully wired (createReviewPileModelReviewer swap), but the exec-coord seams (Q-15 work-slicing + repair-plan triggers) are documented as deferred — see Deviations below."
  - "Q-06 invariant is honored at the pile boundary: live-pile failures throw CliExitError with stage-specific refusal artifacts. There is no silent fixture substitution."
  - "writePileArtifacts gained a runDir form alongside runRoot — runDir is the natural form for factory-cli where the per-run directory is already known (runDir = resolve(outDir, runId)); the runRoot form remains for callers that want the abstract `runs/{id}` layout under a workspace root."
  - "FactoryConfig.piles type was added to lmstudio-adapter (the package that owns FactoryConfig + resolveFactoryConfig). The schema (factory-config.schema.json) had already declared the block in Plan 06-02 but the TypeScript type and validator dropped it silently — this plan landed the type/validator/round-trip through resolveFactoryConfig."
  - "installCancelWiring now accepts an optional external AbortController so the run-level parent can be created BEFORE the planning seam (which runs before the original cancel-wiring location). This is the Q-11 hierarchy: factory-cli builds the parent, runFactoryPile owns the per-pile AbortSignal.timeout child."
metrics:
  completed: 2026-04-28
  duration_minutes: ~135
  task_commits:
    - "63d332a — Task 1 (CLI flags, config, RefusalStage)"
    - "4ee4ea3 — Task 2 (resolver + persistence)"
    - "e66a3ac — Task 3a (planning seam wired)"
    - "42be696 — Task 3b (review seam wired)"
---

# Phase 6 Plan 7: Factory-CLI Pile Wiring Summary

CLI flag parsing, factory-config piles-block parsing, pile-mode precedence resolver, atomic per-pile artifact writer, RefusalStage extension, run-level AbortController, planning seam, and review seam are all wired. Exec-coord seams are documented as deferred (rationale below).

## What Landed

**Task 1 — CLI flags + config + RefusalStage (commit `63d332a`)**
- `cli-args.ts`: `--planning-mode <fixture|live>`, `--review-mode <fixture|live>`, `--exec-coord-mode <fixture|live>`. Invalid values throw `ArgvError`. Inline `--flag=value` form supported.
- `lmstudio-adapter/src/factory-config.ts`: `FactoryConfig.piles?: PilesConfig` with `planning`, `review`, `executionCoordination` sub-keys. Validator rejects unknown keys at every level (`additionalProperties: false` parity with schema), invalid mode values, non-string `fixturePath`. Block round-trips through `resolveFactoryConfig` into `ResolvedFactoryConfig.config.piles`.
- `refusals-index.ts`: `RefusalStage` extended with `pile-planning | pile-review | pile-execution-coordination` (Q-12 — additive enum, no parallel pipeline).

**Task 2 — Resolver + persistence (commit `4ee4ea3`)**
- `pile-mode-resolver.ts`: `resolvePileMode(kind, cli, config) -> PileMode`. Precedence is exactly Q-04: CLI flag > `config[kind].mode` > `"fixture"` default. Pure.
- `pile-persistence.ts`: `writePileArtifacts({ runDir | runRoot, runId, kind, iteration, outcome, refusal? })` — sole filesystem ingress for pile artifacts. Layout `{runDir}/piles/{kind}/iter-{N}/` (or `{runRoot}/runs/{runId}/piles/...` for the abstract form). Atomic via tmp + datasync + rename. On `outcome.ok=true`: persists `result.json` AND `trace.json` (Q-08 always-persist trace). On `outcome.ok=false`: persists `refusal.json` only. T-6-23 path-traversal mitigation refuses targets that escape the parent.

**Task 3a — Planning seam (commit `e66a3ac`, PILE-01)**
- `runFactoryPile` injected into `FactoryCompositionDependencies`; default = real adapter, tests override.
- `--planning-mode/--review-mode/--exec-coord-mode` plumbed through `RunCommandOptions`.
- Run-level `AbortController` constructed AFTER `loadFactoryConfig` and BEFORE the planning seam. `installCancelWiring` was updated to accept an external `rootController` so it consumes the same parent.
- Planning seam: when `pileModes.planning === "live"`, builds `PileRunContext` (provider via `createOpenAICompatibleProvider({ baseURL: factoryConfig.config.adapters.coder.baseUrl, apiKey, model })`, signal=`runAbortController.signal`, budget=`resolvePileBudget(planningPilePreset.budget, intent.capabilityEnvelope.budget)`), invokes `dependencies.runFactoryPile(planningMission, ctx)`, persists via `writePileArtifacts({ runDir, kind: "planning", iteration: 0 })`. On success, `JSON.parse(outcome.result.output)` produces the planning-pile result body and routes through the existing `parsePlanningPileResultInputs → admitCandidatePlans` path. On any failure (`ok=false` or `JSON.parse` error), writes refusal under the pile iter dir AND appends `.protostar/refusals.jsonl` with `stage="pile-planning"` + `sourceOfTruth="PlanningPileResult"`, throws `CliExitError(reason, 1)`. No auto-fallback.
- Three integration tests: live happy path (pile invoked exactly once for planning, artifacts persisted), live failure (refusal artifact + refusals.jsonl entry with stage=pile-planning), abort cascade (ctx.signal supplied is a real AbortSignal).

**Task 3b — Review seam (commit `42be696`, PILE-02 / Q-14)**
- When `pileModes.review === "live"`, the ModelReviewer is constructed via `createReviewPileModelReviewer({ runPile: dependencies.runFactoryPile, buildMission: () => buildReviewMission(intent, planningAdmission), buildContext: () => ({ provider, signal: runAbortController.signal, budget: resolvePileBudget(...), now }) })`. Falls through to the Phase 5 dry stub or `reviewServices.modelReviewer` when review mode is fixture.
- Pile failures are already handled by `createReviewPileModelReviewer` (returns a blocking `ModelReviewResult` with `PileFailure` embedded as a JudgeCritique rationale per Q-12).
- One integration test: `--review-mode live` with a stubbed `runFactoryPile` that returns a valid `ReviewPileBody` is invoked at least once with `preset.kind === "review"`.

## Deviations From Plan

**Exec-coord seams deferred (`Q-15` work-slicing + repair-plan triggers)**

The plan's Task 3b also calls for two exec-coord pile invocations: a work-slicing trigger after admission (heuristic: `targetFiles > 3 || estimatedTurns > 5`) and a repair-plan-generation trigger inside the review-repair loop. Neither was wired in this plan because:

1. **Work-slicing heuristic does not trip on v0.1 cosmetic-tweak archetypes.** All v0.1 fixtures and the cosmetic-tweak dogfood loop have small plans (single task, single file). The heuristic was deliberately tuned for Phase 8 + Phase 10 dogfood archetypes that exercise larger plans. Wiring the seam without a fixture that exercises it would be untested code in the live path.
2. **The repair-plan-generation trigger requires a new hook in `runReviewRepairLoop`.** Currently the loop's repair path runs `synthesizeRepairPlan` deterministically; piles can refine that into a `RepairPlanProposal` admitted via `admitRepairPlanProposal`, but `runReviewRepairLoop` does not expose a `synthesizeRepairPlanRefiner` callback. Adding that is its own architectural change and is properly scoped as a separate plan rather than bolted onto the factory-cli wiring plan.

**Recommended follow-up:** A small plan (call it 06-07b) that (a) adds an optional `repairPlanRefiner?: (RepairPlan, ctx) => Promise<RepairPlan>` parameter to `runReviewRepairLoop`, (b) wires it from factory-cli to invoke the exec-coord pile + admit the refined plan via `admitRepairPlanProposal`, and (c) wires the work-slicing trigger after admission with a fixture that exercises the heuristic. That plan can land before Wave 4's e2e contract suite (06-08).

The dark-factory contract is preserved today: pile failures at the planning and review seams are evidence-bearing and never silently substituted; the exec-coord seams are simply not invoked yet in v0.1, which is the same posture as fixture mode.

## Threat Mitigation Status

| Threat ID | Status | Evidence |
|-----------|--------|----------|
| T-6-06 (live failure silently substitutes fixture, Q-06 violation) | mitigated | Planning seam: any pile failure throws CliExitError with stage-specific refusal artifact. Review seam: pile failures surface as blocking ModelReviewResult via createReviewPileModelReviewer; loop terminates with status=blocked. |
| T-6-23 (pile output written outside the run dir / path traversal) | mitigated | `writePileArtifacts` resolves target under `runDir` (or `runRoot/runs/`) and refuses targets that escape; unit test rejects `runId="../escape"`. |
| T-6-24 (trace.json carries secrets) | accepted | LM Studio is local; documented in CONCERNS for Phase 7+. |
| T-6-25 (trace blob volume DoS) | accepted | Q-08 mandates always-persist; pruning recipe deferred to Phase 9 OP-08. |
| T-6-26 (per-agent provider override redirect) | not applicable | v0.1 cosmetic-tweak uses single-provider path; per-agent override map is documented but not exercised in this plan. Phase 8 will add the heterogeneous-local panel and the network.allowedHosts capability check. |

## Verification

```bash
pnpm --filter @protostar/factory-cli build         # ok
pnpm --filter @protostar/factory-cli test          # 146/146 pass
pnpm --filter @protostar/lmstudio-adapter build    # ok
pnpm run verify                                    # ok (full suite, 0 failures)
```

Test counts by file:
- `cli-args.test.ts` — added 3 cases (live, all-three-flags, invalid-rejection)
- `load-factory-config.test.ts` — added 3 cases (valid piles block, invalid mode rejection, undefined-when-absent)
- `refusals-index.test.ts` — added 2 cases (pile-planning line + RefusalStage extension)
- `pile-mode-resolver.test.ts` — 5 cases (CLI wins, config wins, default, partial config, undefined-CLI)
- `pile-persistence.test.ts` — 5 cases (ok writes result+trace, fail writes refusal-only, trace round-trip, exec-coord layout, path-traversal refusal)
- `main.test.ts` — added 4 integration cases (planning seam happy / planning seam refusal / abort cascade / review seam swap)

Stability: three sequential `pnpm --filter @protostar/factory-cli test` runs after Task 3a were 145/145 each; after Task 3b the suite stayed at 146/146 across all runs observed.

## Self-Check: PASSED

All four task commits exist in `git log`. All new files exist on disk. Q-06 invariant verified by integration tests. T-6-23 path-traversal verified by unit test. Review seam verified by stub-based integration test.
