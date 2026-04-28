---
phase: 06-live-dogpile-piles
verified: 2026-04-28T00:00:00Z
status: gaps_found
score: 4/6 must-haves verified
overrides_applied: 0
gaps:
  - truth: "PILE-03: executionCoordinationPilePreset is invoked when execution proposes work-slicing or repair-plan generation"
    status: failed
    reason: "The admission seams (admitWorkSlicing, admitRepairPlanProposal, parseExecutionCoordinationPileResult, buildExecutionCoordinationMission) exist as exported, unit-tested functions, but apps/factory-cli/src/main.ts never invokes them. A runtime grep against main.ts returns zero hits for any of these symbols and zero hits for executionCoordinationPilePreset. Plan 06-07 documented this as a deliberate deferral, and Plan 06-08 pinned the deferral as a negative-grep contract test in pile-integration-smoke.contract.test.ts (work-slicing-trigger and repair-plan-trigger blocks both ASSERT the seams are NOT in main.ts). PILE-03 in REQUIREMENTS.md is worded 'is invoked' (runtime), not 'is admittable as a unit', so the requirement is not yet met."
    artifacts:
      - path: "apps/factory-cli/src/main.ts"
        issue: "No imports or calls to admitWorkSlicing, admitRepairPlanProposal, parseExecutionCoordinationPileResult, buildExecutionCoordinationMission, or executionCoordinationPilePreset. The work-slicing trigger after admission and the repair-plan-refinement trigger inside runReviewRepairLoop are both absent."
      - path: "packages/review/src/run-review-repair-loop.ts"
        issue: "No repairPlanRefiner hook exists; the repair path runs synthesizeRepairPlan deterministically with no seam for an exec-coord pile to refine the result."
    missing:
      - "Add an optional repairPlanRefiner?: (RepairPlan, ctx) => Promise<RepairPlan> parameter to runReviewRepairLoop and thread it from factory-cli to invoke the exec-coord pile + admit via admitRepairPlanProposal."
      - "Wire a work-slicing trigger after planning admission in apps/factory-cli/src/main.ts that gates on a heuristic (e.g. targetFiles>3) and routes pile output through admitWorkSlicing."
      - "Add a fixture and integration test that exercises both triggers end-to-end, then flip the negative-grep deferral pins in pile-integration-smoke.contract.test.ts to positive wiring assertions."
  - truth: "Phase 1 PLAN-A-03 invariant: pnpm run verify is green at root (admission contracts cannot regress silently)"
    status: failed
    reason: "Two consecutive `pnpm run verify` invocations from the working tree both fail at apps/factory-cli with 8 cancelled subtests in apps/factory-cli/src/run-real-execution.test.ts (parent suite name 'runRealExecution', not ok 19). Failures are 'Promise resolution is still pending but the event loop has already resolved' / failureType=cancelledByParent on subtests 4-11. CRITICAL: subtest 9 ('reruns repair subgraph tasks with repair context and repair attempt evidence', line 240) is the LOOP-04 closure test that Phase 5 verification (05-VERIFICATION.md) flagged as FAILED — Phase 5's fix commit `262d216 fix(05): harden review repair loop blockers` was meant to close exactly this gap. The flake means LOOP-04's repair-context-and-repair-attempt-evidence behavior is not deterministically observable at the verify gate. The same factory-cli test target passes 146/146 when run directly via `pnpm --filter @protostar/factory-cli test`. PLAN-A-03 (Phase 1 invariant carried forward into Phase 6) is breached: the gate is not green. Re-running 05-VERIFICATION against the current tree may also be warranted."
    artifacts:
      - path: "apps/factory-cli/src/run-real-execution.test.ts"
        issue: "Tests at lines 109, 132, 151, 186, 200, 270, 285 fail intermittently when run via `pnpm run verify` with 'Promise resolution is still pending but the event loop has already resolved'."
      - path: "package.json"
        issue: "verify script chains `pnpm --filter @protostar/repair test && pnpm --filter @protostar/intent test && pnpm --filter @protostar/factory-cli test`; the factory-cli step fails."
    missing:
      - "Diagnose the root cause of run-real-execution.test.ts flakiness when chained after repair/intent test runs (likely an open AbortController, unawaited stream consumer, or parent-test timeout interaction in the new pile wiring or test harness)."
      - "Make `pnpm run verify` deterministically green; this gate is the Phase 1 invariant the entire program rests on."
      - "Re-verify Phase 5 LOOP-04: the flaking subtest 'reruns repair subgraph tasks with repair context and repair attempt evidence' is the LOOP-04 closure test; if it's not deterministic on the verify path, Phase 5's gap-closure may need to be re-opened."
deferred:
  - truth: "Live LM Studio planning-pile smoke against real qwen3-coder model"
    addressed_in: "Phase 10 (V1 Hardening + Dogfood) and 06-VALIDATION.md"
    evidence: "Plan 06-08 SUMMARY explicitly documents 'Live LM Studio planning-pile smoke (PILE-01 against real LM Studio with qwen3-coder-next-mlx-4bit) remains a manual step per .planning/phases/06-live-dogpile-piles/06-VALIDATION.md.' Phase 10 success criteria require ≥10 dogfood runs against the toy repo, which is the natural home for the live model smoke."
human_verification:
  - test: "Live LM Studio planning-pile smoke"
    expected: "Run factory-cli with --planning-mode live against a running LM Studio instance hosting qwen3-coder-next-mlx-4bit; observe a real Dogpile session producing a CandidatePlan that passes admission and lands runs/{id}/admitted-plan.json."
    why_human: "Requires live LM Studio runtime, real model weights, and operator-graded plan-quality judgment. The DI-stub coverage in main.test.ts:505 verifies the WIRING; only a human can verify the LIVE path produces useful output."
---

# Phase 6: Live Dogpile Piles Verification Report

**Phase Goal:** Bounded model coordination behind strict schemas. Live planning, review, and execution-coordination piles behind strict schemas. Protostar remains authority; Dogpile supplies bounded opinions.
**Verified:** 2026-04-28
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (from PLAN must_haves + ROADMAP success criteria + REQUIREMENTS PILE-01..PILE-06)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | PILE-01: `--planning-mode pile` (a.k.a. `--planning-mode live`) invokes `planningPilePreset` against `@dogpile/sdk` and produces an admitted plan via the unchanged admission path | VERIFIED | `apps/factory-cli/src/main.ts:486` calls `dependencies.runFactoryPile(planningMission, ...)`; outcome is parsed via `parsePlanningPileResultInputs` and routed through existing `admitCandidatePlans`. End-to-end stub test at `apps/factory-cli/src/main.test.ts:505` ("invokes runFactoryPile in --planning-mode live and admits the parsed pile output"). Persistence to `runs/{id}/piles/planning/iter-0/{result.json,trace.json}` confirmed at `main.ts:496` via `writePileArtifacts`. |
| 2 | PILE-02: `reviewPilePreset` is invoked after mechanical review; output flows through review admission and composes with mechanical verdict | VERIFIED | `apps/factory-cli/src/main.ts:823` instantiates `createReviewPileModelReviewer({ runPile, buildMission, buildContext })` only when `pileModes.review === "live"`. Wrapper at `main.ts:824-845` calls `dependencies.runFactoryPile(mission, ctx)` and persists each iteration via `writePileArtifacts({ kind: "review", iteration })`. The reviewer is passed to `runReviewRepairLoop` at `main.ts:875` only after mechanical pass (Phase 5 LOOP-01 ordering preserved). Pile failures map to `verdict: "block"` with `PileFailure` embedded as JudgeCritique. |
| 3 | PILE-03: `executionCoordinationPilePreset` is invoked when execution proposes work-slicing or repair-plan generation | FAILED | The admission units exist (`admitWorkSlicing` exported from `@protostar/planning`, `admitRepairPlanProposal` + `parseExecutionCoordinationPileResult` exported from `@protostar/repair`, `buildExecutionCoordinationMission` from `@protostar/dogpile-adapter`) and each has package-level unit tests. But `apps/factory-cli/src/main.ts` contains zero references to any of these symbols — runtime invocation is not wired. Plan 06-07 SUMMARY explicitly defers this; Plan 06-08 pins the deferral via negative-grep contract tests in `pile-integration-smoke.contract.test.ts:99-129` ("work-slicing-trigger" and "repair-plan-trigger" blocks ASSERT the seams are NOT in main.ts). PILE-03 wording in REQUIREMENTS.md is "is invoked" (runtime), not "is admittable as a unit." |
| 4 | PILE-04: Pile output failure modes (timeout, schema parse, all candidates rejected) produce the same no-admission artifacts as the fixture path (refusal byte-equality / fixture-vs-live symmetry) | VERIFIED | `packages/admission-e2e/src/pile-refusal-byte-equality.contract.test.ts` builds two refusal artifacts (fixture-parse and pile-schema-parse) via `writePileArtifacts` and asserts byte-equality modulo `failure.parseErrors`. Plan 06-08 reinterpreted the "discriminator" from `failure.class` to `failure.parseErrors` because both paths share the same `pile-schema-parse` class — what legitimately differs is the parse-error payload (one origin is fixture file content, the other is live pile output). This is a stronger, more useful reading of Q-12 than the literal plan text and matches the spirit of refusal symmetry. |
| 5 | PILE-05: Pile invocations carry the capability envelope budget (max calls, max wall-clock); exhaustion fails the pile, not the run | VERIFIED | `packages/dogpile-adapter/src/pile-failure-types.ts:28` defines a six-variant `PileFailure` union (pile-timeout, pile-budget-exhausted, pile-schema-parse, pile-all-rejected, pile-network, pile-cancelled). `resolvePileBudget` at `packages/dogpile-adapter/src/resolve-pile-budget.ts` per-field-min-intersects preset budget against the envelope budget (envelope is a CAP, not a FLOOR). `runFactoryPile` at `run-factory-pile.ts:137` constructs `AbortSignal.any([ctx.signal, AbortSignal.timeout(budget.timeoutMs)])` so pile timeout aborts the pile only, while parent SIGINT cascades. `mapSdkStopToPileFailure` translates SDK NormalizedStopReason into the union; `extractStopReason` at `:106` walks RunResult.eventLog for FinalEvent.termination + BudgetStopEvent. |
| 6 | PILE-06: `dogpile-adapter` has zero filesystem authority — invocations are owned by `apps/factory-cli` (no fs) | VERIFIED | Static contract test at `packages/dogpile-adapter/src/no-fs.contract.test.ts` walks `packages/dogpile-adapter/src/` and rejects any `node:fs`, `node:fs/promises`, `fs`, or `node:path` import (excluding the test file itself). Runtime defense-in-depth at `packages/admission-e2e/src/dogpile-adapter-no-fs.contract.test.ts` walks both `dogpile-adapter/src` and `dogpile-types/src` and additionally invokes `runFactoryPile` end-to-end with a deps-injected fake stream, asserting `ok=true` without any fs touch. Both layers green. |

**Score:** 4/6 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/dogpile-types/src/index.ts` | Re-exports run/stream/createOpenAICompatibleProvider runtime + RunEvent/RunResult/Trace/RunAccounting/NormalizedStopReason/ConfiguredModelProvider/StreamHandle types | VERIFIED | Lines 17-29; runtime + type re-exports both present. |
| `packages/dogpile-adapter/src/index.ts` | `executionCoordinationPilePreset` (renamed from executionCoordinatorPilePreset per Q-16); barrel re-exports | VERIFIED | Line 114 exports the renamed preset; barrel re-exports `runFactoryPile`, `resolvePileBudget`, `mapSdkStopToPileFailure`, `buildExecutionCoordinationMission`, plus failure-type aliases. |
| `packages/dogpile-adapter/src/run-factory-pile.ts` | Network-only SDK invocation seam via stream() + AbortSignal.any | VERIFIED | 224 lines; uses `stream()` not `run()`, hierarchical abort, classifies error/timeout/cancel into PileFailure variants. |
| `packages/dogpile-adapter/src/pile-failure-types.ts` | 6-variant PileFailure union + ResolvedPileBudget | VERIFIED | Lines 28-64 define all 6 variants with distinct evidence shapes. |
| `packages/dogpile-adapter/src/resolve-pile-budget.ts` | Per-field-min envelope-clamps-preset reconciliation | VERIFIED | Pure transform; tests cover the cap semantics. |
| `packages/dogpile-adapter/src/map-sdk-stop-to-pile-failure.ts` | NormalizedStopReason → PileFailure mapping | VERIFIED | Tested at `map-sdk-stop-to-pile-failure.test.ts`. |
| `packages/review/src/review-pile-reviewer.ts` createReviewPileModelReviewer | ModelReviewer impl that calls runFactoryPile | VERIFIED | Returns a Phase 5 ModelReviewer function (not an object); aligns with existing ReviewVerdict union ("pass"|"repair"|"block") — abstain dropped to match Phase 5. |
| `packages/repair/src/admit-repair-plan-proposal.ts` admitRepairPlanProposal | Repair-plan re-admission seam (Q-15) | EXISTS BUT UNINVOKED | Function exists, exported, unit-tested. Not invoked from factory-cli. (Counts toward PILE-03 gap.) |
| `packages/repair/src/execution-coordination-pile-result.ts` parseExecutionCoordinationPileResult | Wire-format parser | EXISTS BUT UNINVOKED | Function exists, exported, unit-tested. Not invoked from factory-cli. |
| `packages/planning/src/admit-work-slicing.ts` admitWorkSlicing | Work-slicing re-admission via Phase 1 admitCandidatePlan | EXISTS BUT UNINVOKED | Function exists, exported, unit-tested. Not invoked from factory-cli. |
| `apps/factory-cli/src/cli-args.ts` | --planning-mode / --review-mode / --exec-coord-mode flags | VERIFIED | Three flags parsed; invalid values throw ArgvError. |
| `apps/factory-cli/src/load-factory-config.ts` (via lmstudio-adapter/factory-config.ts) | piles.{planning,review,executionCoordination}.mode block | VERIFIED | Schema + TypeScript validator + round-trip through resolveFactoryConfig. |
| `apps/factory-cli/src/refusals-index.ts` | RefusalStage extension: pile-planning / pile-review / pile-execution-coordination | VERIFIED | All three additions present; `formatRefusalIndexLine` and `appendRefusalIndexEntry` shapes unchanged. |
| `apps/factory-cli/src/pile-mode-resolver.ts` | CLI > config > "fixture" precedence (Q-04) | VERIFIED | Pure function; 5 unit tests cover precedence cases. |
| `apps/factory-cli/src/pile-persistence.ts` | Atomic per-pile artifact writer (tmp+fdatasync+rename); always-persist trace (Q-08); path-traversal mitigation (T-6-23) | VERIFIED | Layout `runs/{id}/piles/{kind}/iter-{N}/{result.json,trace.json,refusal.json?}`; ok-path persists result+trace, fail-path persists refusal only. |
| `apps/factory-cli/src/main.ts` planning seam | runFactoryPile invocation + persistence + admission routing | VERIFIED | Wired at lines 486-510; refusal on failure with stage="pile-planning". No auto-fallback (Q-06). |
| `apps/factory-cli/src/main.ts` review seam | createReviewPileModelReviewer swap | VERIFIED | Lines 821-861; review pile artifacts persisted per iteration. |
| `apps/factory-cli/src/main.ts` exec-coord seams | Work-slicing trigger + repair-plan-refinement trigger | MISSING | Neither trigger is wired; see Truth 3. |
| `packages/admission-e2e/src/dogpile-adapter-no-fs.contract.test.ts` | Runtime no-fs defense in depth | VERIFIED | 197 lines; static walker + runtime exercise via fake stream. |
| `packages/admission-e2e/src/pile-refusal-byte-equality.contract.test.ts` | Fixture-vs-live refusal byte equality | VERIFIED | 185 lines; byte-equality modulo `failure.parseErrors`. |
| `packages/admission-e2e/src/pile-integration-smoke.contract.test.ts` | PILE-01 wiring + PILE-03 deferral pin | VERIFIED (with caveat) | 147 lines; planning-pile-live block asserts positive wiring; work-slicing-trigger and repair-plan-trigger blocks are NEGATIVE-GREP DEFERRAL PINS that assert the seams are NOT in main.ts. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `apps/factory-cli/src/main.ts` | `@protostar/dogpile-adapter runFactoryPile` | import | WIRED | Line 15: `runFactoryPile as defaultRunFactoryPile`; injected into FactoryCompositionDependencies. |
| `apps/factory-cli/src/main.ts` | `apps/factory-cli/src/pile-persistence.writePileArtifacts` | import | WIRED | Line 89; called at lines 496 (planning) and 828 (review). |
| `apps/factory-cli/src/main.ts` | `@protostar/review createReviewPileModelReviewer` | import + invocation | WIRED | Line 83 import; line 823 call. |
| `apps/factory-cli/src/main.ts` | `@protostar/planning admitWorkSlicing` | import | NOT_WIRED | Function exists in package; main.ts has zero references. |
| `apps/factory-cli/src/main.ts` | `@protostar/repair admitRepairPlanProposal` | import | NOT_WIRED | Function exists in package; main.ts has zero references. |
| `apps/factory-cli/src/main.ts` | `@protostar/dogpile-adapter buildExecutionCoordinationMission` | import | NOT_WIRED | Function exists in package; main.ts has zero references. |
| `runFactoryPile` | `@protostar/dogpile-types stream` | re-export call | WIRED | Default `stream` from `@protostar/dogpile-types` injected; testable via `RunFactoryPileDeps.stream`. |
| `runFactoryPile` | `AbortSignal.any` hierarchical abort | direct API | WIRED | Line 137: `AbortSignal.any([ctx.signal, AbortSignal.timeout(budget.timeoutMs)])`. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|--------------------|--------|
| factory-cli planning seam | `livePlanningOutcome` | `dependencies.runFactoryPile(planningMission, ctx)` → `@dogpile/sdk stream()` | Yes (live mode) / fake JSON output (DI-stub mode in tests) | FLOWING |
| factory-cli review seam | per-iteration `outcome` | wrapper around `dependencies.runFactoryPile(mission, ctx)` | Yes | FLOWING |
| `pile-persistence.writePileArtifacts` | `result.json` / `trace.json` | `outcome.result.output` / `outcome.trace` | Yes (real RunResult or fake equivalent in tests) | FLOWING |
| `runReviewRepairLoop` repair branch | `repairPlan` | `synthesizeRepairPlan(...)` (deterministic) | Yes (deterministic only — no exec-coord pile refinement) | STATIC (by design until PILE-03 trigger 2 lands) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| factory-cli unit + integration tests pass in isolation | `pnpm --filter @protostar/factory-cli test` | 146/146 pass, 28s | PASS |
| dogpile-adapter exports runFactoryPile + new types | `grep "export {.*runFactoryPile\|resolvePileBudget\|mapSdkStopToPileFailure\|buildExecutionCoordinationMission" packages/dogpile-adapter/src/index.ts \| wc -l` | 4 export blocks | PASS |
| executionCoordinationPilePreset rename complete | `! grep -rn "executionCoordinatorPilePreset" packages/ apps/` | exit 0 | PASS |
| `pnpm run verify` (Phase 1 PLAN-A-03 invariant) | `pnpm run verify` | FAIL (factory-cli flake — see gap 2) | FAIL |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|------------|-------------|-------------|--------|----------|
| PILE-01 | 06-04, 06-07, 06-08 | `--planning-mode pile` invokes planningPilePreset against @dogpile/sdk; output flows through existing planning admission | SATISFIED | Wired in main.ts:486, e2e at main.test.ts:505, refusal symmetry test in admission-e2e. |
| PILE-02 | 06-05, 06-07 | reviewPilePreset invoked after mechanical review; composes with mechanical verdict | SATISFIED | createReviewPileModelReviewer wired in main.ts:823; mechanical-first ordering preserved at run-review-repair-loop.ts:106. |
| PILE-03 | 06-06, 06-07 | executionCoordinationPilePreset invoked when execution proposes work-slicing or repair-plan generation | BLOCKED | Admission seams (admitWorkSlicing, admitRepairPlanProposal) exist as units; runtime invocation from factory-cli not wired. Plan 06-07 explicitly defers; Plan 06-08 pins deferral. |
| PILE-04 | 06-08 | Pile output failure modes produce same no-admission artifacts as fixture path | SATISFIED | pile-refusal-byte-equality.contract.test.ts pins byte-equality modulo `failure.parseErrors`. Reinterpretation of "discriminator field" is justified and matches Q-12 spirit. |
| PILE-05 | 06-03, 06-04, 06-07 | Pile budget enforced; exhaustion fails the pile, not the run | SATISFIED | 6-variant PileFailure union; AbortSignal.any hierarchy; resolvePileBudget envelope-cap semantics; mapSdkStopToPileFailure translates SDK stops. |
| PILE-06 | 06-01, 06-08 | dogpile-adapter has zero fs authority | SATISFIED | Static contract test in dogpile-adapter + runtime test in admission-e2e (defense in depth). |

Plan-frontmatter requirements ID coverage:
- 06-01 declares [PILE-06] — covered.
- 06-02 declares [] (config schema only) — n/a.
- 06-03 declares [PILE-04, PILE-05] — covered.
- 06-04 declares [PILE-01] — covered (planning seam, partial for exec-coord-mission builder).
- 06-05 declares [PILE-02] — covered.
- 06-06 declares [PILE-03] — units exist; runtime invocation BLOCKED (see gap).
- 06-07 declares [PILE-01, PILE-04, PILE-05] — covered.
- 06-08 declares [PILE-03, PILE-04, PILE-06] — PILE-04/06 covered; PILE-03 contract is a deferral pin, not a positive wiring assertion.

No orphaned requirement IDs detected — every PILE-* requirement was claimed by at least one plan.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `packages/admission-e2e/src/pile-integration-smoke.contract.test.ts` | 99-113 | Negative-grep deferral pin (asserts a seam is NOT wired) | Warning | Pinning a deferral as a contract test is a sound defensive pattern (it forces explicit removal when wiring lands), but it codifies that PILE-03 is intentionally not yet runtime-met. |
| `apps/factory-cli/src/main.ts` | (absence) | No exec-coord pile invocation paths | Blocker | This is the PILE-03 gap surfaced above. |
| `apps/factory-cli/src/run-real-execution.test.ts` | 109-285 | Tests fail with "Promise resolution is still pending but the event loop has already resolved" when chained via `pnpm run verify`, pass when run in isolation | Blocker | PLAN-A-03 root verify gate not deterministically green. |

### Human Verification Required

1. **Live LM Studio planning-pile smoke**
   - **Test:** Run factory-cli with `--planning-mode live` against a running LM Studio instance hosting `qwen3-coder-next-mlx-4bit` and confirm a real Dogpile session produces a CandidatePlan that passes admission and lands `runs/{id}/admitted-plan.json`.
   - **Expected:** Real model output, not fixture; `terminal-status.json.status === "admitted"`; `runs/{id}/piles/planning/iter-0/result.json` and `trace.json` contain non-trivial Dogpile RunResult content.
   - **Why human:** Requires live LM Studio runtime, real model weights, and operator-graded plan-quality judgment. The DI-stub coverage in `apps/factory-cli/src/main.test.ts:505` verifies the WIRING; only a human can verify the LIVE path produces useful output. Documented in `06-VALIDATION.md` and Plan 06-08 SUMMARY.

### Gaps Summary

Phase 6 delivered the planning and review pile seams end-to-end (live → admission → persistence → refusal symmetry → static + runtime no-fs locks). PILE-01, PILE-02, PILE-04, PILE-05, PILE-06 are all backed by either positive integration tests or contract tests.

Two gaps prevent a clean pass:

1. **PILE-03 runtime is deferred.** The exec-coord pile's two trigger seams (work-slicing after admission, repair-plan refinement inside the review-repair loop) exist as exported, unit-tested admission helpers but factory-cli does not yet invoke them. Plan 06-07 documented this deliberately, and Plan 06-08 pinned the deferral via negative-grep contract tests. PILE-03's REQUIREMENTS.md wording is "is invoked when execution proposes work-slicing or repair-plan generation" — that is runtime invocation language, not unit-existence language. The recommended follow-up plan (Plan 06-07b per Plan 06-07's deviation note) needs to ship before Phase 7 delivery starts referencing the live exec-coord output.

2. **`pnpm run verify` is flaky.** The root verify script chains `repair → intent → factory-cli` test runs and the factory-cli leg fails intermittently with "Promise resolution is still pending but the event loop has already resolved" in `run-real-execution.test.ts`. The same target passes 146/146 deterministically when run in isolation. This breaches the Phase 1 PLAN-A-03 invariant ("admission contracts cannot regress silently"); whether the flake was introduced by Phase 6 timing changes or is a pre-existing Phase 4 issue surfaced by Phase 6's new test load is unclear from the surface, but the gate is the gate.

Both gaps have closure suggestions in the YAML frontmatter `missing` arrays.

**Roadmap SC#3 wording note (informational):** ROADMAP.md Phase 6 SC#3 reads "Pile timeout / budget exhaustion fails the pile (not the run); fixture-mode fallback still works." The "fixture-mode fallback still works" phrasing predates the Q-06 no-auto-fallback lock recorded in 06-CONTEXT.md and the 06-07 SUMMARY. The implementation correctly follows Q-06: live-pile failures throw `CliExitError` with stage-specific refusal artifacts and there is no silent fixture substitution. Operators can still choose `--planning-mode fixture` (and similar) explicitly; what doesn't happen is automatic fallback after a live failure. The roadmap text should be updated when this phase is marked complete to read "...fixture-mode is selectable per-pile via flag/config and is the default" or similar — this is a documentation cleanup, not a code gap.

---

_Verified: 2026-04-28_
_Verifier: Claude (gsd-verifier)_
