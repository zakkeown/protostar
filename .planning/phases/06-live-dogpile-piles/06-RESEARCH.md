# Phase 6: Live Dogpile Piles — Research

**Researched:** 2026-04-27
**Domain:** Live `@dogpile/sdk` invocation behind three pile presets, with envelope-clamped budgets, hierarchical aborts, six-variant failure taxonomy, and refusal-artifact symmetry with Phase 1.
**Confidence:** HIGH (every cited type, function, and surface verified against installed `@dogpile/sdk@0.2.0` `.d.ts`, in-repo source, and existing Phase 1/2/4/5 contracts).

## Summary

Phase 6 wires the three Dogpile presets — `planningPilePreset`, `reviewPilePreset`, and (renamed) `executionCoordinationPilePreset` — behind real `stream()` invocations of `@dogpile/sdk@0.2.0`. The new export is `runFactoryPile(mission, ctx) → Promise<PileRunOutcome>` on `@protostar/dogpile-adapter`. The adapter is **network-only, zero-fs**; `apps/factory-cli` owns persistence, AbortController construction, provider construction, and the `--{planning,review,exec-coord}-mode` flag plumbing through the existing `factory-config.json` shape.

All five Phase 6 failure paths (timeout, schema parse, all-rejected, transport, cancel, plus an explicit `pile-budget-exhausted`) collapse into the existing `.protostar/refusals.jsonl` index that Phase 1 already owns — with three new `sourceOfTruth` enum values (`PlanningPileResult` already exists; `ReviewPileResult` and `ExecutionCoordinationPileResult` are new). Live mode never auto-falls-back to fixture (Q-06); fixture mode is a separate explicit code path the operator selects.

The single most load-bearing decision (CONTEXT Q-14) is that Phase 6's `createReviewPileModelReviewer()` **replaces** Phase 5 Q-10's planned single-Qwen judge implementation — Phase 5 ships only the `ModelReviewer` interface + a fixture passthrough, and Phase 6 supplies the real model-review impl through the review pile.

**Primary recommendation:** Implement Wave 0 by bumping `@protostar/dogpile-types` to re-export `RunEvent`, `RunResult`, `Trace`, `RunAccounting`, `NormalizedStopReason`, `ConfiguredModelProvider`, `StreamHandle`, plus the runtime engine functions (`run`, `stream`, `createOpenAICompatibleProvider`); then in Wave 1 add `runFactoryPile`, `resolvePileBudget`, `mapSdkStopToPileFailure`, `PileFailure`, `PileRunOutcome`, `PileRunContext` to `@protostar/dogpile-adapter`. Wave 2 adds `ReviewPileResult` parsers in `@protostar/review` and `ExecutionCoordinationPileResult` parsers in `@protostar/repair`. Wave 3 wires `factory-cli` flags + `factory-config.json` schema extension + hierarchical AbortControllers + per-iter persistence. Wave 4 adds the static + runtime fs contract tests + retroactive Phase 5 Q-10 update.

## User Constraints (from CONTEXT.md)

### Locked Decisions

**Q-01 — SDK invocation owner:** `dogpile-adapter` exposes `runFactoryPile(mission, ctx)`. Adapter owns the `@dogpile/sdk` call surface (network only, zero fs). `factory-cli` passes provider, AbortSignal, and resolved budget; receives `{ result, trace, accounting, stopReason }`.

**Q-02 — SDK entrypoint shape:** Use `stream()` and consume `RunEvent` events; `runFactoryPile` accumulates and returns the same `RunResult`-shaped outcome. Optional `ctx.onEvent` callback forwards events to factory-cli for `ReviewLifecycleEvent` emission and Phase 9 inspect surface.

**Q-03 — Provider construction:** AgentSpec-level provider override. Default provider is shared LM Studio `createOpenAICompatibleProvider({ baseUrl })`; specific agents may declare per-agent provider/model.

**Q-04 — Mode-selection flag:** Mode lives in `factory-config.json` under `piles.{planning,review,executionCoordination}.mode: "fixture" | "live"`. CLI flags `--planning-mode`, `--review-mode`, `--exec-coord-mode` override per pile.

**Q-05 — Default mode for v0.1:** Default `fixture`; Phase 10 dogfood configs ship live.

**Q-06 — No auto-fallback:** Live failure produces a no-admission refusal artifact. Fixture mode never silently substitutes for live failure.

**Q-07 — Pile output layout:** `runs/{id}/piles/{kind}/iter-{N}/{result.json,trace.json,refusal.json}`. `{kind} ∈ planning|review|execution-coordination`. Atomic per-file tmp+rename; factory-cli owns all writes.

**Q-08 — Trace persistence:** Always persist full `trace.json` per pile invocation.

**Q-09 — Adapter zero-fs contract:** Both — static import-graph test in `@protostar/dogpile-adapter` AND runtime fs-stub test in `admission-e2e`. Defense in depth.

**Q-10 — Envelope clamps preset:** `resolvePileBudget(preset.budget, envelope.budget): ResolvedPileBudget` returns the min of each defined field.

**Q-11 — Hierarchical AbortControllers:** Run-level controller is parent; per-pile uses `AbortSignal.any([ctx.signal, AbortSignal.timeout(resolvedBudget.timeoutMs)])`. Distinguish `pile-cancelled` vs `pile-timeout` by inspecting `controller.signal.reason`.

**Q-12 — Refusal artifact location:** Reuse `.protostar/refusals.jsonl` and per-iter `refusal.json`. Extend `sourceOfTruth` enum: existing `"PlanningPileResult"` plus new `"ReviewPileResult"` and `"ExecutionCoordinationPileResult"`.

**Q-13 — Six-variant failure taxonomy:** `pile-timeout | pile-budget-exhausted | pile-schema-parse | pile-all-rejected | pile-network | pile-cancelled`. Each carries its own evidence shape. Map SDK `NormalizedStopReason` → `PileFailure` in `mapSdkStopToPileFailure`.

**Q-14 — Review pile REPLACES Phase 5 Q-10 single-Qwen judge.** Phase 5 ships only the `ModelReviewer` interface + a fixture passthrough; Phase 6 supplies `createReviewPileModelReviewer(): ModelReviewer`. **Single most load-bearing decision in Phase 6.**

**Q-15 — Exec-coord pile triggers BOTH:** (1) initial work-slicing of admitted-plan tasks, AND (2) repair-plan generation. Single preset, mission discriminates mode.

**Q-16 — Rename code:** `executionCoordinatorPilePreset → executionCoordinationPilePreset` to match roadmap/REQUIREMENTS.

**Q-17 — Review-pile assert helper in `@protostar/review`:** `assertReviewPileResult`, `parseReviewPileResult`. `dogpile-adapter` re-exports.

**Q-18 — `ExecutionCoordinationPileResult`:** Same `{ output, source }` envelope as `PlanningPileResult`. `output` is JSON-stringified discriminated union (`work-slicing` vs `repair-plan`). Lives in `@protostar/repair` (per Claude's discretion recommendation).

### Claude's Discretion (research-supported recommendations)

- **`shouldInvokeWorkSlicing(admittedPlan)` heuristic:** Default thresholds `targetFiles > 3` OR `estimatedTurns > 5`; v0.1 cosmetic-tweak almost always returns false. Wire as configurable in `factory-config.json: piles.executionCoordination.workSlicing.{maxTargetFiles,maxEstimatedTurns}`.
- **Owning package for `ExecutionCoordinationPileResult`:** Co-locate in `@protostar/repair` for v0.1 (`repair-plan` is the primary mode; `work-slicing` proposes back through Phase 1 admission via `@protostar/planning.admitWorkSlicing`). Avoids creating a new package mid-phase. [VERIFIED: `packages/repair/src/index.ts` is currently a 4-line skeleton.]
- **`PileSource` enum:** `"live" | "fixture" | "fixture-bad"` mirroring planning's existing `"fixture" | "dogpile"` discriminator. Recommend matching planning verbatim: `source: "fixture" | "dogpile"` with `kind: "review-pile-result"` discriminator on the envelope. [VERIFIED: `packages/planning/src/index.ts:206-212`.]
- **`runFactoryPile` signature:** Accept a single typed `mission` (which already wraps `preset` + intent string per `FactoryPileMission` in `dogpile-adapter/src/index.ts:37-40`). Phase-4-symmetric; planner-natural.
- **`factory-config.json` envelope path:** Top-level `piles: {...}` block (not nested under `adapters`). Symmetric with the existing `adapters: {...}` block.

### Deferred Ideas (OUT OF SCOPE)

- Stable rubric vocabulary for `JudgeCritique.rubric` — Phase 8.
- N-of-M panel + consensus math — Phase 8.
- Heterogeneous-local second judge family — Phase 8.
- Trace pruning recipe / disk growth controls — Phase 9 OP-08.
- Cross-process cancel during a pile iteration — inherits Phase 4's SIGINT + sentinel; Phase 9 `cancel` command extends.
- Repair-policy layer (which critiques are repairable vs blocking) — Phase 8.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PILE-01 | `--planning-mode pile` invokes `planningPilePreset` against `@dogpile/sdk`; output flows through existing planning admission path. | `planningPilePreset` and `assertCandidatePlanFromPlanningPileResult` already exist in `dogpile-adapter`/`planning`; need: `runFactoryPile`, factory-cli flag wiring, `factory-config.json` schema bump for `piles.planning.mode`. |
| PILE-02 | `reviewPilePreset` invoked after mechanical review; output composes with mechanical verdict. | Per Q-14: ship `createReviewPileModelReviewer()` in `@protostar/review`; implements Phase 5's `ModelReviewer` interface; `runReviewRepairLoop` calls it. |
| PILE-03 | `executionCoordinationPilePreset` invoked when execution proposes work-slicing or repair-plan generation. | Per Q-15: two trigger seams — pre-execution (work-slicing) and post-`synthesizeRepairPlan` (repair-plan refinement). Discriminator in mission text. |
| PILE-04 | Pile output failure modes produce same no-admission artifacts as fixture path. | Per Q-12: extend `RefusalStage` and refusal `sourceOfTruth` enum; `mapSdkStopToPileFailure` translates `NormalizedStopReason` → `PileFailure`; factory-cli writes `refusal.json` + appends to `.protostar/refusals.jsonl` via existing `appendRefusalIndexEntry`. |
| PILE-05 | Pile budget exhaustion fails the pile, not the run. | Per Q-10/Q-11: `resolvePileBudget` clamps preset by envelope; `AbortSignal.any` ties pile-level abort to its own timeout, not the run. Failure is one of `pile-timeout` / `pile-budget-exhausted` / `pile-cancelled`. |
| PILE-06 | `dogpile-adapter` zero-fs. | Per Q-09: static `no-fs.contract.test.ts` (mirror `packages/admission-e2e/src/authority-no-fs.contract.test.ts:1-50`) + runtime `dogpile-adapter-no-fs.contract.test.ts` in `admission-e2e` wrapping `node:fs` Proxy. |

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| `@dogpile/sdk` `stream()` invocation + event accumulation | `@protostar/dogpile-adapter` | — | Network-only adapter is the single SDK call seam (Q-01). |
| Persistence of `result.json` / `trace.json` / `refusal.json` | `apps/factory-cli` | — | Authority boundary: only factory-cli + repo touch fs (Q-07, AGENTS.md). |
| Refusal index append (`.protostar/refusals.jsonl`) | `apps/factory-cli` | — | Already owns `appendRefusalIndexEntry` per `apps/factory-cli/src/refusals-index.ts`. |
| Pile output schema parsing/validation | Owning domain package (`@protostar/planning` for planning, `@protostar/review` for review, `@protostar/repair` for exec-coord) | `@protostar/dogpile-adapter` re-exports | Q-17, Q-18. Each domain owns its wire-format contract. |
| Capability-envelope budget clamping | `@protostar/dogpile-adapter` (`resolvePileBudget` helper) | `@protostar/authority` precedence kernel | Q-10. Mirrors `intersectEnvelopes` from Phase 2. |
| Hierarchical AbortController construction | `apps/factory-cli` | — | Run-level parent owned by `runFactory`; child constructed inside `runFactoryPile` from `ctx.signal` + `AbortSignal.timeout(...)`. |
| LM Studio provider construction (`createOpenAICompatibleProvider`) | `apps/factory-cli` (default) + per-agent override on `AgentSpec.provider` | — | Q-03. Phase 4 already constructs the coder provider in factory-cli. |
| CLI flag parsing (`--planning-mode`, etc.) | `apps/factory-cli/src/cli-args.ts` | — | Phase 4 Q-09 layout; precedence CLI > config > built-in default. |
| `factory-config.json` schema extension | `packages/lmstudio-adapter/src/factory-config.schema.json` (canonical schema) | `apps/factory-cli/src/load-factory-config.ts` | Phase 4 Q-09 owns this schema. |
| Phase 5 `ModelReviewer` implementation | `@protostar/review` (interface + fixture passthrough) + `@protostar/review` adds `createReviewPileModelReviewer()` consumer of `runFactoryPile` | `@protostar/dogpile-adapter` (called via re-exported `runFactoryPile`) | Q-14 retroactive lock. |
| Work-slicing re-admission | `@protostar/planning` (new `admitWorkSlicing` validator) | `apps/factory-cli` (sequencing) | Q-15. Output flows back through Phase 1 admission. |
| Repair-plan proposal admission | `@protostar/repair` (new `admitRepairPlanProposal`) | — | Q-15, Q-18. |

## Standard Stack

### Core (already pinned in this monorepo)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@dogpile/sdk` | `0.2.0` | Multi-agent pile runtime — `run`, `stream`, `Dogpile.pile`, `createOpenAICompatibleProvider`, termination helpers (`budget`, `convergence`, `firstOf`, `judge`). | Already pinned (Phase 3 REPO-08 complete). [VERIFIED: `node_modules/.pnpm/@dogpile+sdk@0.2.0/node_modules/@dogpile/sdk/dist/index.d.ts`] |
| `@protostar/dogpile-types` | workspace | Re-export shim over `@dogpile/sdk` types. Currently exports `AgentSpec`, `DogpileOptions`, `budget`, `convergence`, `firstOf`. | Indirection layer. [VERIFIED: `packages/dogpile-types/src/index.ts:11-12`] |
| Node.js | `v22` | Provides `AbortSignal.any([...])`, `AbortSignal.timeout(ms)`. | Locked in MEMORY. `AbortSignal.any` is Node 20.3+. [VERIFIED: `node --version` → v22.22.1] |
| `node:test` | built-in | Test framework. | Project-wide. |

### Phase 6 NEW exports

| Symbol | Owning Package | Purpose |
|--------|---------------|---------|
| `runFactoryPile(mission, ctx): Promise<PileRunOutcome>` | `@protostar/dogpile-adapter` | Single pile invocation. Network only. |
| `resolvePileBudget(presetBudget, envelopeBudget): ResolvedPileBudget` | `@protostar/dogpile-adapter` | Q-10 clamp helper. |
| `mapSdkStopToPileFailure(stop, ctx): PileFailure` | `@protostar/dogpile-adapter` | Q-13 SDK→Protostar translation. |
| `type PileFailure` (six-variant union) | `@protostar/dogpile-adapter` | Q-13. Exported wire format. |
| `type PileRunOutcome` | `@protostar/dogpile-adapter` | `{ ok: true, result, trace, accounting, stopReason }` ∪ `{ ok: false, failure: PileFailure }`. |
| `type PileRunContext` | `@protostar/dogpile-adapter` | `{ provider, signal, budget, now?, onEvent? }`. |
| `executionCoordinationPilePreset` (renamed) | `@protostar/dogpile-adapter` | Q-16. |
| `buildExecutionCoordinationMission(intent, mode, input)` | `@protostar/dogpile-adapter` | Q-15. |
| `ReviewPileResult`, `assertReviewPileResult`, `parseReviewPileResult`, `assertModelReviewFromReviewPileResult`, `createReviewPileModelReviewer` | `@protostar/review` | Q-14, Q-17. |
| `ExecutionCoordinationPileResult`, `parseExecutionCoordinationPileResult`, `admitRepairPlanProposal` | `@protostar/repair` | Q-15, Q-18. |
| `admitWorkSlicing(proposal, admittedPlan): AdmittedPlan` | `@protostar/planning` | Q-15 work-slicing re-admission. |
| `RefusalStage` extension: `+"pile-planning" | "pile-review" | "pile-execution-coordination"` | `apps/factory-cli/src/refusals-index.ts` | Q-12. |

### `@dogpile/sdk@0.2.0` Surface (verified from installed `.d.ts`)

[VERIFIED: `node_modules/.pnpm/@dogpile+sdk@0.2.0/.../dist/index.d.ts`, `dist/types.d.ts`, `dist/runtime/engine.d.ts`]

```ts
// engine.d.ts
export declare function run(options: DogpileOptions): Promise<RunResult>;
export declare function stream(options: DogpileOptions): StreamHandle;     // ← Phase 6 uses this (Q-02)
export declare function replay(trace: Trace): RunResult;
export declare function replayStream(trace: Trace): StreamHandle;
export declare function createEngine(options: EngineOptions): Engine;
export declare const Dogpile: { pile, replay, replayStream, stream, createEngine };

// providers/openai-compatible.d.ts
export { createOpenAICompatibleProvider } from "./providers/openai-compatible.js";

// types.d.ts (key shapes — line numbers from installed .d.ts)
export type NormalizedStopReason =
  | "budget:cost" | "budget:tokens" | "budget:iterations" | "budget:timeout"
  | "convergence" | "judge:accepted" | "judge:rejected" | "judge:score-threshold";  // line 289

export interface RunResult {
  readonly output: string;                    // ← pile output JSON-stringified
  readonly eventLog: RunEventLog;
  readonly trace: Trace;                      // ← persist as trace.json
  readonly transcript: readonly TranscriptEntry[];
  readonly usage: RunUsage;
  readonly metadata: RunMetadata;
  readonly accounting: RunAccounting;         // ← contains tier, budget caps, usage, cost, capUtilization
  readonly cost: CostSummary;
  readonly quality?: NormalizedQualityScore;
  readonly evaluation?: RunEvaluation;
}                                             // line 2177-2203

export interface DogpileOptions extends BudgetCostTierOptions {
  readonly intent: MissionIntent;             // string
  readonly protocol?: ProtocolSelection;
  readonly model: ConfiguredModelProvider;    // ← from createOpenAICompatibleProvider
  readonly agents?: readonly AgentSpec[];
  readonly tools?: readonly RuntimeTool<...>[];
  readonly temperature?: number;
  readonly terminate?: TerminationCondition;
  readonly evaluate?: RunEvaluator;
  readonly seed?: string | number;
  readonly signal?: AbortSignal;              // ← Phase 6 passes hierarchical signal
}                                             // line 2266-2293

export interface AgentSpec {                  // line 479
  readonly id: string;
  readonly role: string;
  // ALSO supports per-agent provider per Q-03 — confirm the field name during planning;
  // current `dogpile-adapter` presets only set { id, role }, but SDK type accepts more.
}

export interface StreamHandle {
  // async iterable of RunEvent; has a `result` promise resolving to RunResult.
  // Iterate with `for await (const ev of handle)`; await `handle.result` after.
}
```

**StreamHandle iteration pattern** [VERIFIED from engine.d.ts comments at lines 27-43]:
> "The returned handle is an async iterable of RunEvent values with a result promise for the same RunResult shape returned by run()."

Phase 6 invocation flow inside `runFactoryPile`:
```ts
const handle = stream({ intent: mission.intent, model: ctx.provider, ...preset, signal: childSignal });
for await (const ev of handle) ctx.onEvent?.(ev);
const result = await handle.result;  // RunResult
```

### LM Studio Provider Construction

```ts
import { createOpenAICompatibleProvider } from "@dogpile/sdk";

const provider = createOpenAICompatibleProvider({
  baseUrl: factoryConfig.adapters.coder.baseUrl,  // already in factory-config.json (Phase 4 Q-09)
  // apiKey, model, etc. — see openai-compatible.d.ts for full options
});
```

[VERIFIED: `node_modules/.pnpm/@dogpile+sdk@0.2.0/.../dist/providers/openai-compatible.d.ts` exists; full options via `OpenAICompatibleProviderOptions` exported type.]

## Architecture Patterns

### System Architecture Diagram

```
                 confirmed-intent.json (admitted)
                              │
                              ▼
                ┌──────────────────────────┐
                │   apps/factory-cli       │  (sole fs-writing layer)
                │   runFactory()           │
                └──────────┬───────────────┘
                           │
        ┌──────────────────┼──────────────────────┬───────────────────────┐
        │                  │                      │                       │
        ▼                  ▼                      ▼                       ▼
 (mode: fixture)   buildPlanningMission   buildReviewMission   buildExecutionCoordinationMission
   load fixture     ────────┬────────      ────────┬────────    ────────┬────────
        │                   ▼                      ▼                    ▼
        │           runFactoryPile()       runFactoryPile()      runFactoryPile()
        │           (planning kind)        (review kind)         (exec-coord kind)
        │                   │                      │                    │
        │           ┌───────┴──────────────────────┴────────────────────┴─────┐
        │           │  @protostar/dogpile-adapter (network only, zero fs)    │
        │           │   - construct AbortSignal.any([ctx.signal,             │
        │           │       AbortSignal.timeout(resolved.timeoutMs)])        │
        │           │   - resolvePileBudget(preset.budget, envelope.budget)  │
        │           │   - stream({...preset, model: ctx.provider, signal})    │
        │           │   - for await (ev of handle) ctx.onEvent?.(ev)         │
        │           │   - return { result, trace, accounting, stopReason }   │
        │           │   - on error: mapSdkStopToPileFailure → PileFailure    │
        │           └────────────────────────────┬──────────────────────────┘
        │                                        │
        │                                        ▼
        │                          ┌──────────────────────────┐
        │                          │ @dogpile/sdk@0.2.0        │
        │                          │ stream() → StreamHandle   │
        │                          │   ↳ AsyncIterable<RunEvent>│
        │                          │   ↳ .result: RunResult     │
        │                          └────────────┬───────────────┘
        │                                       │
        │                                       ▼
        │                          ┌──────────────────────────┐
        │                          │ LM Studio                │
        │                          │ (OpenAI-compatible API)  │
        │                          │ multiple per-agent models │
        │                          └──────────────────────────┘
        │                                       │
        ▼                                       ▼
 PlanningPileResult / ReviewPileResult / ExecutionCoordinationPileResult
                                  │
                                  ▼
                ┌───────────────────────────────────┐
                │ Domain parsers                    │
                │  - @protostar/planning            │
                │      parsePlanningPileResult      │
                │  - @protostar/review              │
                │      parseReviewPileResult        │
                │  - @protostar/repair              │
                │      parseExecutionCoordinationPileResult
                └─────────────┬─────────────────────┘
                              │
                  ┌───────────┴───────────┐
                  │                       │
            parse OK?                parse FAIL? / pile FAIL?
                  │                       │
                  ▼                       ▼
       Phase 1 admission helper    factory-cli writes:
       (admitCandidatePlans /        runs/{id}/piles/{kind}/iter-{N}/refusal.json
        admitWorkSlicing /           appends .protostar/refusals.jsonl
        admitRepairPlanProposal)     terminal-status.json
                  │                       │
                  ▼                       ▼
       AdmittedPlan / etc.          run exits non-zero (refused)
       (capability envelope verified)
                  │
                  ▼
       runs/{id}/piles/{kind}/iter-{N}/result.json + trace.json
```

### Recommended Project Structure

```
packages/
├── dogpile-adapter/
│   ├── src/
│   │   ├── index.ts                              # +runFactoryPile, +PileFailure, +PileRunContext, +PileRunOutcome
│   │   ├── run-factory-pile.ts                   # NEW
│   │   ├── resolve-pile-budget.ts                # NEW
│   │   ├── map-sdk-stop-to-pile-failure.ts       # NEW
│   │   ├── execution-coordination-mission.ts     # NEW (buildExecutionCoordinationMission)
│   │   ├── public-candidate-plan.contract.test.ts  # existing
│   │   ├── no-fs.contract.test.ts                # NEW (Q-09 static)
│   │   └── *.test.ts                             # one per new helper
│   └── package.json
├── dogpile-types/
│   └── src/index.ts                              # +export RunEvent, RunResult, Trace, RunAccounting,
│                                                 #  NormalizedStopReason, ConfiguredModelProvider,
│                                                 #  StreamHandle; +re-export run, stream, createOpenAICompatibleProvider
├── review/
│   └── src/
│       ├── index.ts                              # +ReviewPileResult, +ModelReviewer interface,
│       │                                         #  +createReviewPileModelReviewer
│       ├── review-pile-result.ts                 # NEW (parsers)
│       └── *.test.ts
├── repair/
│   └── src/
│       ├── index.ts                              # +ExecutionCoordinationPileResult,
│       │                                         #  +parseExecutionCoordinationPileResult,
│       │                                         #  +admitRepairPlanProposal
│       └── *.test.ts
├── planning/
│   └── src/
│       ├── index.ts                              # +admitWorkSlicing
│       └── work-slicing-admission.test.ts        # NEW
├── admission-e2e/
│   └── src/
│       └── dogpile-adapter-no-fs.contract.test.ts # NEW (Q-09 runtime)
└── lmstudio-adapter/
    └── src/factory-config.schema.json             # bump: +piles block

apps/factory-cli/
└── src/
    ├── main.ts                                   # +flag parsing, +pile invocation, +AbortController hierarchy
    ├── cli-args.ts                               # +--planning-mode, --review-mode, --exec-coord-mode
    ├── load-factory-config.ts                    # +piles.{kind}.{mode,fixturePath} parsing
    ├── refusals-index.ts                         # +RefusalStage extensions
    ├── pile-persistence.ts                       # NEW: writes runs/{id}/piles/{kind}/iter-{N}/{result,trace,refusal}.json
    └── pile-mode-resolver.ts                     # NEW: CLI > config > default precedence
```

### Pattern 1: Phase 4 Adapter Mirror

**What:** `runFactoryPile` mirrors `createLmstudioCoderAdapter` shape (typed input + injected ctx → outcome).

**Phase 4 reference** [`packages/lmstudio-adapter/src/coder-adapter.ts:47-54`]:
```ts
export function createLmstudioCoderAdapter(config: LmstudioAdapterConfig): ExecutionAdapter {
  return {
    id: "lmstudio-coder",
    async *execute(task, ctx) { yield* executeCoderTask(task, ctx, config); }
  };
}
```

**Phase 6 analog** (proposed):
```ts
export interface PileRunContext {
  readonly provider: ConfiguredModelProvider;     // from @dogpile/sdk
  readonly signal: AbortSignal;                   // run-level parent
  readonly budget: ResolvedPileBudget;            // already clamped
  readonly now?: () => string;
  readonly onEvent?: (e: RunEvent) => void;
}

export type PileRunOutcome =
  | {
      readonly ok: true;
      readonly result: RunResult;
      readonly trace: Trace;
      readonly accounting: RunAccounting;
      readonly stopReason: NormalizedStopReason;
    }
  | {
      readonly ok: false;
      readonly failure: PileFailure;
    };

export async function runFactoryPile(
  mission: FactoryPileMission,
  ctx: PileRunContext
): Promise<PileRunOutcome> {
  // Source: derived from @dogpile/sdk dist/runtime/engine.d.ts (stream)
  //         + Phase 4 chainAbortSignal pattern (coder-adapter.ts:302-318)
  const childAbort = AbortSignal.any([ctx.signal, AbortSignal.timeout(ctx.budget.timeoutMs)]);
  const handle = stream({
    intent: mission.intent,
    model: ctx.provider,
    protocol: mission.preset.protocol,
    tier: mission.preset.tier,
    agents: mission.preset.agents,
    budget: { maxTokens: ctx.budget.maxTokens, timeoutMs: ctx.budget.timeoutMs },
    terminate: mission.preset.terminate,
    signal: childAbort
  });

  try {
    for await (const ev of handle) ctx.onEvent?.(ev);
    const result = await handle.result;
    const stopReason = extractStopReason(result.accounting);  // best-effort from RunAccounting
    return { ok: true, result, trace: result.trace, accounting: result.accounting, stopReason };
  } catch (err) {
    return { ok: false, failure: mapErrorToPileFailure(err, mission.preset.kind, childAbort, ctx.budget) };
  }
}
```

### Pattern 2: Hierarchical AbortController via `AbortSignal.any`

**Why:** Q-11. Pile-level timeout fails just the pile; SIGINT cancels the run AND all open piles atomically.

**[CITED: nodejs.org/api/globals.html#abortsignalanysignals]** `AbortSignal.any([...])` aborts as soon as any constituent signal aborts; the `reason` is the first one's reason. Combined with `AbortSignal.timeout(ms)` (which aborts with `reason: DOMException("...","TimeoutError")`), this gives a clean discriminator:

```ts
function classifyAbortReason(signal: AbortSignal): "pile-cancelled" | "pile-timeout" {
  const r = signal.reason;
  if (r instanceof DOMException && r.name === "TimeoutError") return "pile-timeout";
  return "pile-cancelled";
}
```

**[VERIFIED: Node v22.22.1 supports both APIs.]**

### Pattern 3: Refusal Artifact Symmetry (Q-12)

The existing planning/review refusal pipeline already writes:
- `runs/{id}/{stage}/refusal.json`
- `.protostar/refusals.jsonl` (append-only, one line per refusal)
- `runs/{id}/terminal-status.json` (refused state)

[VERIFIED: `apps/factory-cli/src/refusals-index.ts:1-78`]

Phase 6 extends `RefusalStage`:
```ts
// before (factory-cli/src/refusals-index.ts:3-9):
export type RefusalStage =
  | "intent" | "planning" | "precedence" | "workspace-trust"
  | "repo-runtime" | "coder-adapter-ready";

// after Phase 6:
export type RefusalStage =
  | "intent" | "planning" | "precedence" | "workspace-trust"
  | "repo-runtime" | "coder-adapter-ready"
  | "pile-planning" | "pile-review" | "pile-execution-coordination";  // NEW
```

The `sourceOfTruth` discriminator on the refusal artifact already supports `"PlanningPileResult"`; add `"ReviewPileResult"` and `"ExecutionCoordinationPileResult"`. [VERIFIED: `packages/planning/src/index.ts:506-515` defines `PlanningAdmissionPlanningPileResultSourceReference` with `sourceOfTruth: "PlanningPileResult"`.]

### Pattern 4: Static + Runtime FS-Authority Contract Tests (Q-09)

**Static** — mirror `packages/admission-e2e/src/authority-no-fs.contract.test.ts:1-50` exactly. Walk `packages/dogpile-adapter/src/`, regex for `from\s+["']node:fs["']`, `from\s+["']node:fs/promises["']`, `from\s+["']fs["']`, `from\s+["']node:path["']`. Assert offenders array is empty.

**Runtime** — wrap `node:fs` and `node:fs/promises` with `Proxy` whose `get` throws synchronously, then invoke `runFactoryPile` against a stub `ConfiguredModelProvider` that returns a deterministic `RunResult` immediately. Assert no fs access throws.

```ts
// pseudo:
const fsThrowProxy = new Proxy({}, { get: (_, p) => { throw new Error(`forbidden fs access: ${String(p)}`); } });
// ...module-mock node:fs and node:fs/promises in the test (use --import flag or vm context)...
const provider = createStubProvider({ output: '{"strategy":"...","tasks":[...]}' });
await runFactoryPile(buildPlanningMission(intent), { provider, signal, budget });
// assertion: nothing threw a "forbidden fs access" error
```

The transitive-imports gotcha is the reason Q-09 mandates BOTH tests. Phase 2 Plan 10 used the same defense-in-depth pattern.

### Anti-Patterns to Avoid

- **Calling `run()` instead of `stream()`** — `run()` works but discards live events. Q-02 mandates `stream()` so factory-cli's `onEvent` can emit `ReviewLifecycleEvent` (Phase 5 Q-18) and Phase 9 inspect can stream live progress.
- **Reading `preset.budget` at the SDK boundary** — always pass `ctx.budget` (the resolved value). Q-10 forbids the preset's raw budget from reaching `stream()`.
- **Auto-falling-back to fixture on live failure** — Q-06 forbids. Live failure → first-class refusal.
- **Letting pile timeout abort the entire run** — Q-11 forbids. Per-pile `AbortSignal.timeout(...)` must be a CHILD of `ctx.signal`, never the parent.
- **Persisting trace from inside the adapter** — Q-07 forbids. `runFactoryPile` returns trace blob; factory-cli persists.
- **Hand-rolling JSON.stringify for trace serialization** — `result.trace` is already JSON-serializable per `Trace.schemaVersion: "1.0"` [VERIFIED: types.d.ts:2073-2116]; `JSON.stringify(result.trace, null, 2)` is sufficient.
- **Sharing one AbortController across all three piles** — Q-11. Each pile invocation gets its own child controller.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| OpenAI-compatible chat client | Custom HTTP/SSE | `createOpenAICompatibleProvider` from `@dogpile/sdk` | Already pinned, Phase 4 reuses same. |
| Multi-agent coordination | Custom protocol | `stream()` with `protocol: "broadcast" | "coordinator"` from preset | The whole point of `@dogpile/sdk`. |
| Termination conditions | Custom timeout/budget loops | `firstOf(budget(...), convergence(...))` from `@dogpile/sdk` | Already used in current `dogpile-adapter` presets. [VERIFIED: `packages/dogpile-adapter/src/index.ts:56-59`] |
| AbortSignal composition | `signal.addEventListener("abort", ...)` boilerplate | `AbortSignal.any([parent, AbortSignal.timeout(ms)])` | Node 22 native; cleaner than chaining. |
| Replay-trace serialization | Custom event log writer | `JSON.stringify(result.trace, null, 2)` (the SDK's `Trace` type is already JSON-serializable, schemaVersion `"1.0"`) | Q-08. |
| Refusal-index writing | New JSONL appender | Existing `appendRefusalIndexEntry(filePath, entry)` | [VERIFIED: `apps/factory-cli/src/refusals-index.ts:50-56`] |
| Refusal `sourceOfTruth` discriminator | New refusal artifact shape | Extend existing enum | Q-12. |
| Workspace+TS project-references registration for new packages | Manual | None; just edit `pnpm-workspace.yaml` and root `tsconfig.json` (Phase 5 Plan 01-02 pattern) | Existing convention. |

**Key insight:** Phase 6 is almost entirely **plumbing through existing seams**. The novel concepts (hierarchical aborts, six-variant failure taxonomy) are small. The risk is in (a) wire-format symmetry (refusal artifacts must be byte-compatible across fixture vs live failure), and (b) the retroactive Phase 5 Q-10 update (Q-14).

## Common Pitfalls

### Pitfall 1: SDK `RunResult.accounting` does not directly expose `NormalizedStopReason`

**What goes wrong:** Looking at the type, `RunAccounting` has `tier`, `budget`, `usage`, `cost`, `budgetStateChanges`, but NOT a top-level `stopReason: NormalizedStopReason`.

**Why it happens:** The stop reason is conveyed through `BudgetStopEvent` (in `RunEventLog.events`) and `FinalEvent`. [VERIFIED: types.d.ts has `BudgetStopEvent` at line 1726, `RunEvent` union at 1837 includes `BudgetStopEvent | FinalEvent`.]

**How to avoid:** Implement `extractStopReason(result)` to walk `result.eventLog.events` for the terminal `FinalEvent` (or `BudgetStopEvent`) and read its embedded reason. Document this in `mapSdkStopToPileFailure`.

**Warning signs:** Test that asserts `result.accounting.stopReason` exists will fail. Don't depend on a top-level field that isn't there.

### Pitfall 2: `AgentSpec` per-agent provider field name uncertainty

**What goes wrong:** Q-03 assumes `AgentSpec` accepts an optional `provider`/`model` per agent. Current `dogpile-adapter` presets only set `{ id, role }`.

**Why it happens:** The CONTEXT note says "the SDK's `AgentSpec` type already supports this — confirm at research time." [VERIFIED: `dist/types.d.ts:479` declares `AgentSpec` but the full body is past the chunked read; the inline `AgentSpec` declaration starting at line 479 is short — read it during planning.]

**How to avoid:** **Action item for Wave 1 planning:** read `node_modules/.pnpm/@dogpile+sdk@0.2.0/.../dist/types.d.ts:479-495` (approx 16 lines) and confirm field name. If the field is absent, factory-cli must construct one provider per distinct agent model — fall back to `factory-config.json: piles.<kind>.providers: { <agentId>: { baseUrl, model } }`.

**Warning signs:** TypeScript error on `agents: [{ id, role, provider }]`.

### Pitfall 3: Trace blob volume

**What goes wrong:** `Trace` includes full `events`, `transcript`, `providerCalls`. For panel-of-N runs with several rounds, blob is many MB. Per-iteration retention compounds.

**Why it happens:** Q-08 mandates always-persist for forensic value.

**How to avoid:** Document in CONCERNS that Phase 9 OP-08 is the pruning seam. v0.1 cosmetic-tweak runs are bounded; revisit if disk grows.

**Warning signs:** Phase 10 dogfood loop disk usage exceeds expectations.

### Pitfall 4: Fixture vs live refusal byte-compatibility

**What goes wrong:** Phase 6 tests assert fixture failure and live failure produce the same refusal artifact shape. If `mapSdkStopToPileFailure` adds extra fields, tests drift.

**Why it happens:** The success criterion explicitly demands "schema parse errors on pile output produce the same no-admission artifacts as fixture parse errors."

**How to avoid:** Both code paths funnel through the same `buildPileRefusalArtifact(failure: PileFailure | FixtureParseFailure): RefusalArtifact` helper. Test: golden refusal JSON identical for synthetic fixture-parse failure and synthetic pile-schema-parse failure (modulo the failure-class discriminator).

**Warning signs:** Snapshot test mismatch in admission-e2e.

### Pitfall 5: Phase 5 retroactive update silently drifts

**What goes wrong:** Q-14 says Phase 5 Q-10 is RE-LOCKED. If Phase 5's CONTEXT and any in-flight plans aren't updated to "interface only + fixture passthrough," Phase 5 will ship a single-Qwen judge that Phase 6 then has to remove.

**Why it happens:** Phase 5 is in progress (Plans 01-02 complete; Plan 03 pending). Q-10 implementation hasn't landed yet.

**How to avoid:** Phase 6 Wave 0 includes a doc-update task: append "Re-locked in Phase 6 Q-14: ship interface + fixture passthrough only" to `.planning/phases/05-review-repair-loop/05-CONTEXT.md` Q-10. Notify any open Phase 5 plans (search for "qwen-judge-adapter" / "single-Qwen judge").

**Warning signs:** Phase 5 lands a `@protostar/qwen-judge-adapter` package; Phase 6 has to delete it.

### Pitfall 6: `executionCoordinatorPilePreset` rename breaks fixtures silently

**What goes wrong:** Q-16 renames the preset; if any fixture or `factory-config.json` references the old name, it'll silently miss the symbol.

**Why it happens:** Currently no external caller — but Phase 10 dogfood configs may reference it once they're authored.

**How to avoid:** Land Q-16 rename in the same plan that adds `factory-config.json: piles.executionCoordination.mode`. Grep for `executionCoordinatorPilePreset` repo-wide before merging.

**Warning signs:** `pnpm verify` failure on undefined export.

## Code Examples

### Example 1: `resolvePileBudget` (Q-10)

```ts
// Source: packages/dogpile-adapter/src/resolve-pile-budget.ts (NEW)
export interface PresetBudget {
  readonly maxTokens?: number;
  readonly timeoutMs?: number;
  readonly maxCalls?: number;
}

export interface EnvelopeBudget {
  readonly maxTokens?: number;
  readonly timeoutMs?: number;
  readonly maxCalls?: number;
}

export interface ResolvedPileBudget {
  readonly maxTokens: number;
  readonly timeoutMs: number;
  readonly maxCalls?: number;
}

export function resolvePileBudget(
  preset: PresetBudget,
  envelope: EnvelopeBudget
): ResolvedPileBudget {
  // Q-10 — envelope clamps preset (intersect: min of each defined field).
  // If envelope omits a field, preset's value passes through (envelope is a cap, not a floor).
  return {
    maxTokens: minDefined(preset.maxTokens, envelope.maxTokens) ?? Number.MAX_SAFE_INTEGER,
    timeoutMs: minDefined(preset.timeoutMs, envelope.timeoutMs) ?? Number.MAX_SAFE_INTEGER,
    ...(preset.maxCalls !== undefined || envelope.maxCalls !== undefined
      ? { maxCalls: minDefined(preset.maxCalls, envelope.maxCalls)! }
      : {})
  };
}

function minDefined(a: number | undefined, b: number | undefined): number | undefined {
  if (a === undefined) return b;
  if (b === undefined) return a;
  return Math.min(a, b);
}
```

### Example 2: Hierarchical AbortController (Q-11)

```ts
// Source: derived from Node 22 stdlib + Phase 4 coder-adapter chainAbortSignal
const childSignal = AbortSignal.any([
  ctx.signal,                                         // parent: factory-cli SIGINT/sentinel
  AbortSignal.timeout(ctx.budget.timeoutMs)           // pile-level timeout
]);

// pass to stream() and read reason after abort:
function classifyAbortReason(signal: AbortSignal): "pile-cancelled" | "pile-timeout" {
  if (!signal.aborted) return "pile-cancelled";  // shouldn't reach here
  const r = signal.reason;
  // AbortSignal.timeout aborts with DOMException name "TimeoutError"
  if (r instanceof DOMException && r.name === "TimeoutError") return "pile-timeout";
  return "pile-cancelled";
}
```

### Example 3: `PileFailure` discriminated union (Q-13)

```ts
// Source: packages/dogpile-adapter/src/index.ts (NEW export)
export type PileKind = "planning" | "review" | "execution-coordination";

export type PileFailure =
  | { readonly kind: PileKind; readonly class: "pile-timeout"; readonly elapsedMs: number; readonly configuredTimeoutMs: number }
  | { readonly kind: PileKind; readonly class: "pile-budget-exhausted"; readonly dimension: "tokens" | "calls"; readonly consumed: number; readonly cap: number }
  | { readonly kind: PileKind; readonly class: "pile-schema-parse"; readonly sourceOfTruth: "PlanningPileResult" | "ReviewPileResult" | "ExecutionCoordinationPileResult"; readonly parseErrors: readonly string[] }
  | { readonly kind: PileKind; readonly class: "pile-all-rejected"; readonly candidatesEvaluated: number; readonly judgeDecisions: readonly JudgeDecisionRef[] }
  | { readonly kind: PileKind; readonly class: "pile-network"; readonly attempt: number; readonly lastError: { readonly code: string; readonly message: string } }
  | { readonly kind: PileKind; readonly class: "pile-cancelled"; readonly reason: "sigint" | "parent-abort" | "sentinel" };

export function mapSdkStopToPileFailure(
  stop: NormalizedStopReason,
  ctx: { readonly kind: PileKind; readonly elapsedMs: number; readonly budget: ResolvedPileBudget }
): PileFailure | null {
  // budget:timeout → pile-timeout
  // budget:tokens → pile-budget-exhausted (dimension: 'tokens')
  // budget:iterations → pile-budget-exhausted (dimension: 'calls')
  // judge:rejected → pile-all-rejected (caller fills candidatesEvaluated)
  // budget:cost / convergence / judge:accepted / judge:score-threshold → not a failure (return null)
  // ...
}
```

### Example 4: `factory-config.json` schema extension (Q-04)

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://protostar.local/schema/factory-config.schema.json",
  "title": "FactoryConfig",
  "type": "object",
  "additionalProperties": false,
  "required": ["adapters"],
  "properties": {
    "adapters": { "...": "existing Phase 4 block" },
    "piles": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "planning": {
          "type": "object", "additionalProperties": false,
          "properties": {
            "mode": { "enum": ["fixture", "live"], "default": "fixture" },
            "fixturePath": { "type": "string" }
          }
        },
        "review": {
          "type": "object", "additionalProperties": false,
          "properties": {
            "mode": { "enum": ["fixture", "live"], "default": "fixture" },
            "fixturePath": { "type": "string" }
          }
        },
        "executionCoordination": {
          "type": "object", "additionalProperties": false,
          "properties": {
            "mode": { "enum": ["fixture", "live"], "default": "fixture" },
            "fixturePath": { "type": "string" },
            "workSlicing": {
              "type": "object", "additionalProperties": false,
              "properties": {
                "maxTargetFiles": { "type": "number", "default": 3 },
                "maxEstimatedTurns": { "type": "number", "default": 5 }
              }
            }
          }
        }
      }
    }
  }
}
```

### Example 5: Static no-fs contract test (Q-09)

```ts
// Source: packages/dogpile-adapter/src/no-fs.contract.test.ts (NEW)
// Mirror of packages/admission-e2e/src/authority-no-fs.contract.test.ts:1-50
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
// IMPORTANT: this test FILE may import node:path/node:url; the WALK target src/ must not.
// The contract is: src/ has zero fs/path imports (other than this contract test itself).

const __dirname = dirname(fileURLToPath(import.meta.url));
const adapterSrcRoot = resolve(__dirname, ".");

describe("@protostar/dogpile-adapter — fs authority boundary", () => {
  it("no node:fs imports anywhere in src/ (excluding this contract file)", async () => {
    // ...walk; regex node:fs / node:fs/promises / fs / node:path; exclude no-fs.contract.test.ts...
  });
});
```

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | `node:test` (built-in, Node 22) |
| Config file | none (per-package `package.json` test script invokes `tsx --test 'src/**/*.test.ts'`) |
| Quick run command | `pnpm --filter @protostar/dogpile-adapter test` |
| Full suite command | `pnpm run verify` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| PILE-01 | `--planning-mode pile` produces admitted plan | integration | `pnpm --filter @protostar/admission-e2e test --grep planning-pile-live` | ❌ Wave 4 |
| PILE-01 | `runFactoryPile` invokes `stream()` with preset | unit | `pnpm --filter @protostar/dogpile-adapter test --grep run-factory-pile` | ❌ Wave 1 |
| PILE-02 | `createReviewPileModelReviewer` returns ModelReviewResult | unit | `pnpm --filter @protostar/review test --grep review-pile-reviewer` | ❌ Wave 2 |
| PILE-03 | exec-coord pile invoked at work-slicing trigger | integration | `pnpm --filter @protostar/admission-e2e test --grep work-slicing-trigger` | ❌ Wave 4 |
| PILE-03 | exec-coord pile invoked at repair-plan trigger | integration | `pnpm --filter @protostar/admission-e2e test --grep repair-plan-trigger` | ❌ Wave 4 |
| PILE-04 | timeout failure produces `pile-timeout` refusal | unit | `pnpm --filter @protostar/dogpile-adapter test --grep pile-timeout` | ❌ Wave 1 |
| PILE-04 | schema-parse failure produces `pile-schema-parse` refusal | unit | `pnpm --filter @protostar/dogpile-adapter test --grep pile-schema-parse` | ❌ Wave 1 |
| PILE-04 | refusal artifact byte-equal to fixture-parse failure | snapshot | `pnpm --filter @protostar/admission-e2e test --grep refusal-byte-equal` | ❌ Wave 4 |
| PILE-05 | `resolvePileBudget` clamps preset to envelope min | unit | `pnpm --filter @protostar/dogpile-adapter test --grep resolve-pile-budget` | ❌ Wave 1 |
| PILE-05 | parent abort cascades; pile timeout does not abort run | unit | `pnpm --filter @protostar/dogpile-adapter test --grep abort-hierarchy` | ❌ Wave 1 |
| PILE-06 | static: no fs imports in `dogpile-adapter/src/` | unit | `pnpm --filter @protostar/dogpile-adapter test --grep no-fs` | ❌ Wave 0 |
| PILE-06 | runtime: `runFactoryPile` does not touch wrapped `node:fs` | integration | `pnpm --filter @protostar/admission-e2e test --grep dogpile-adapter-no-fs` | ❌ Wave 4 |
| Q-02 | `ctx.onEvent` callback count equals SDK event count | unit | `pnpm --filter @protostar/dogpile-adapter test --grep on-event-forwarding` | ❌ Wave 1 |
| Q-04 | CLI flag overrides factory-config mode | unit | `pnpm --filter protostar-factory test --grep pile-mode-precedence` | ❌ Wave 3 |
| Q-13 | `mapSdkStopToPileFailure` maps each NormalizedStopReason | unit | `pnpm --filter @protostar/dogpile-adapter test --grep map-sdk-stop` | ❌ Wave 1 |
| Q-14 | `createReviewPileModelReviewer` is the Phase 5 ModelReviewer impl | type-level + unit | covered by Wave 2 review-pile tests | ❌ Wave 2 |
| Q-16 | preset rename: `executionCoordinationPilePreset` exported | unit | `pnpm --filter @protostar/dogpile-adapter test --grep preset-export` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `pnpm --filter @protostar/<touched-package> test`
- **Per wave merge:** `pnpm run verify`
- **Phase gate:** `pnpm run verify:full` green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] Re-locked-Phase-5-Q-10 annotation in `.planning/phases/05-review-repair-loop/05-CONTEXT.md`
- [ ] `packages/dogpile-types/src/index.ts` — re-export `RunEvent`, `RunResult`, `Trace`, `RunAccounting`, `NormalizedStopReason`, `ConfiguredModelProvider`, `StreamHandle`, plus runtime `run`/`stream`/`createOpenAICompatibleProvider`
- [ ] `packages/dogpile-adapter/src/no-fs.contract.test.ts` — static fs-import audit (mirror authority-no-fs)
- [ ] `packages/dogpile-adapter/src/index.ts` — Q-16 rename `executionCoordinatorPilePreset → executionCoordinationPilePreset`
- [ ] `factory-config.schema.json` — `piles` block (Q-04)
- [ ] CONCERNS update — trace volume, retroactive Phase 5 update, six-variant union

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | All | ✓ | v22.22.1 | — |
| `@dogpile/sdk` | dogpile-adapter | ✓ | 0.2.0 (pinned) | — |
| `pnpm` | monorepo | ✓ (assumed; Phase 3 used) | — | — |
| LM Studio | live-mode runtime | not needed for unit tests; needed for integration smoke | — | Use stub `ConfiguredModelProvider` for unit tests; live mode is operator-opt-in (Q-05) |
| `tsx` / `tsc` | build | ✓ | already pinned | — |

**Missing dependencies with no fallback:** None.

**Missing dependencies with fallback:** LM Studio for integration smoke — fixture mode is the test-suite default per Q-05; LM Studio only needed for Phase 10 dogfood. v0.1 unit/contract tests stub `ConfiguredModelProvider`.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single AbortController per run (Phase 4) | Hierarchical `AbortSignal.any([parent, timeout])` per pile | Phase 6 introduces | Document in PROJECT.md; Phase 8 panel + Phase 9 resume reuse |
| Manual SSE stream loop (Phase 4 coder adapter) | `for await (const ev of streamHandle)` (idiomatic StreamHandle) | Phase 6 SDK use | Cleaner; no token-level retry concerns at pile level (each agent has its own) |
| Single-Qwen judge adapter (Phase 5 Q-10 original lock) | Review-pile `createReviewPileModelReviewer` (Q-14 retroactive) | This phase | Saves a package; unifies model-review path |
| Refusal sourceOfTruth: `"PlanningPileResult"` only | + `"ReviewPileResult"`, + `"ExecutionCoordinationPileResult"` | This phase | Stage-uniform refusal taxonomy |

**Deprecated/outdated:**
- `executionCoordinatorPilePreset` symbol name (rename per Q-16).
- Phase 5 plan to ship a `@protostar/qwen-judge-adapter` (replaced by review pile per Q-14).

## Project Constraints (from CLAUDE.md & AGENTS.md)

- **Authority boundary:** Only `apps/factory-cli` + `packages/repo` may touch fs. `dogpile-adapter` is coordination-only — Q-09 enforces.
- **Domain-first packaging:** No catch-all `utils`/`agents`/`factory` packages. New types live in `@protostar/review` (review pile) and `@protostar/repair` (exec-coord pile) per their domain.
- **Heterogeneous-local judges:** v0.1 uses Qwen3-80B; second family is Phase 8.
- **Dark-except-hard-failures:** Pile failures emit `terminal-status.json` with `status: "refused"` — operator notified; no progress chatter.
- **`node:test` test framework:** No alternate frameworks.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `AgentSpec` from `@dogpile/sdk@0.2.0` accepts an optional per-agent `provider` / `model` field for Q-03. | Standard Stack / Pitfall 2 | Q-03 needs alternate plumbing — factory-cli constructs one provider per distinct model; preset is annotated with `agentId → modelId` and factory-cli routes. Verify by reading `dist/types.d.ts:479-495` during Wave 1 planning. |
| A2 | `RunResult.accounting` does not directly expose a single `stopReason` field (extracted from event log instead). | Pitfall 1 | If a top-level field exists, simplify `extractStopReason`. Verify by reading `RunAccounting` lines 2008-2027 (already verified — no top-level stopReason; must walk eventLog). |
| A3 | `AbortSignal.timeout(ms).reason instanceof DOMException && reason.name === "TimeoutError"` on Node 22. | Hierarchical AbortController pattern | If reason shape differs, classifier needs adjustment; doesn't affect plan structure. |
| A4 | Six-variant `PileFailure` union is the correct discrimination granularity for Phase 8 evaluation. | Q-13 | Phase 8 may want finer or coarser bucketing; the wire format is bump-aware so safe to evolve. |
| A5 | `executionCoordinationPilePreset` rename has no current external callers. | Q-16 | Repo-wide grep before merge confirms; CONTEXT note already states "no live caller … only declared in dogpile-adapter." |
| A6 | `@protostar/repair` is the right home for `ExecutionCoordinationPileResult` (Claude's discretion). | Owning package | If `@protostar/planning ↔ @protostar/repair` cycle emerges via `admitWorkSlicing`, split into a new `@protostar/execution-coordination` package — can be done without breaking Phase 6 wire formats. |

## Open Questions

1. **`AgentSpec` per-agent provider field** — confirm exact field name from `@dogpile/sdk` types during Wave 1 planning. Recommendation: read `dist/types.d.ts:479-495`. If absent, fall back to factory-cli per-agent provider routing (no SDK-level support needed).
2. **`mapSdkStopToPileFailure` for `judge:rejected`** — needs to know how many candidates and which judges rejected. The SDK's `judge` termination helper exposes `JudgeRejectDecision` (line ~316 of types.d.ts) — confirm it carries enough evidence to populate `pile-all-rejected.judgeDecisions` without re-running.
3. **Trace size at v0.1 dogfood** — measure during Phase 10. Phase 6 always-persists; if trace exceeds N MB, Phase 9 OP-08 pruning recipe lands earlier.
4. **`ReviewLifecycleEvent` translation from `RunEvent`** — Phase 5 Q-18 defines the union. Phase 6's `factory-cli` needs a small `mapRunEventToReviewLifecycleEvent` helper. Source events like `agent-turn`, `model-output-chunk`, etc. → which `ReviewLifecycleEvent` kinds? Resolve during Wave 3 factory-cli wiring.

## Sources

### Primary (HIGH confidence)

- `node_modules/.pnpm/@dogpile+sdk@0.2.0/node_modules/@dogpile/sdk/dist/index.d.ts` — full export list
- `node_modules/.pnpm/@dogpile+sdk@0.2.0/node_modules/@dogpile/sdk/dist/types.d.ts` — `DogpileOptions` (2266-2293), `RunResult` (2177-2203), `Trace` (2073-2116), `RunAccounting` (2008-2027), `NormalizedStopReason` (289), `Budget` (213-226), `AgentSpec` (479)
- `node_modules/.pnpm/@dogpile+sdk@0.2.0/node_modules/@dogpile/sdk/dist/runtime/engine.d.ts` — `run`, `stream`, `replay`, `createEngine`, `Dogpile.pile` signatures
- `packages/dogpile-adapter/src/index.ts` — current presets and mission builders
- `packages/dogpile-types/src/index.ts` — current re-export shim
- `packages/planning/src/index.ts` — `PlanningPileResult` (206-212), `assertPlanningPileResult` (1134-1163), `parsePlanningPileResult` (1102-1118), `PlanningAdmissionPlanningPileResultSourceReference` (506-515)
- `packages/review/src/index.ts` — current review surface (526 lines, no `ModelReviewer` interface yet)
- `packages/repair/src/index.ts` — currently a 4-line skeleton (Phase 5 Plan 01)
- `packages/lmstudio-adapter/src/coder-adapter.ts` — Phase 4 adapter pattern (Q-01 mirrors this)
- `packages/lmstudio-adapter/src/factory-config.schema.json` — Phase 4 Q-09 schema (Phase 6 extends)
- `apps/factory-cli/src/refusals-index.ts` — refusal artifact pattern (Q-12 extends)
- `packages/admission-e2e/src/authority-no-fs.contract.test.ts` — static no-fs contract test pattern (Q-09 mirrors)
- `packages/dogpile-adapter/src/public-candidate-plan.contract.test.ts` — existing contract test for planning-pile boundary
- `.planning/phases/06-live-dogpile-piles/06-CONTEXT.md` — all 18 locked decisions
- `.planning/phases/05-review-repair-loop/05-CONTEXT.md` — Q-10 `ModelReviewer` shape (line 85), Q-11 `JudgeCritique` shape (line 89), Q-18 `ReviewLifecycleEvent` (line 137-139)
- `.planning/REQUIREMENTS.md` — PILE-01..06
- `.planning/ROADMAP.md` — Phase 6 success criteria
- `.planning/STATE.md` — phase status, locks
- Node 22 stdlib — `AbortSignal.any`, `AbortSignal.timeout`

### Secondary (MEDIUM confidence)

- Pitfall 2 / A1 — `AgentSpec` per-agent provider field (read partial types.d.ts; confirm during Wave 1).

### Tertiary (LOW confidence)

- None.

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — every type and function verified against installed `.d.ts`
- Architecture: HIGH — mirrors Phase 4 adapter pattern verified in `coder-adapter.ts`; refusal pipe verified in `refusals-index.ts`
- Pitfalls: HIGH — pitfalls 1, 4, 5, 6 are derived from direct file/type inspection; pitfall 2 is the only one needing planning-time confirmation
- Q-14 retroactive Phase 5 lock: HIGH risk if not actioned in Wave 0; doc-update is mechanical

**Research date:** 2026-04-27
**Valid until:** 2026-05-27 (30 days; `@dogpile/sdk@0.2.0` is pinned and stable)

## RESEARCH COMPLETE

**Phase:** 6 - live-dogpile-piles
**Confidence:** HIGH

### Key Findings

- `@dogpile/sdk@0.2.0` `stream()` is the right entrypoint per Q-02; returns `StreamHandle` (async iterable of `RunEvent` + `.result: Promise<RunResult>`); `RunResult.trace` is JSON-serializable with `schemaVersion "1.0"` so `JSON.stringify(result.trace)` is sufficient for Q-08.
- Per-agent provider override (Q-03) is the only field on `AgentSpec` that needs Wave 1 confirmation — current presets only set `{ id, role }`, but the SDK's `AgentSpec` type is open enough to support `provider`/`model` fields. **Action:** Read `node_modules/.pnpm/@dogpile+sdk@0.2.0/.../dist/types.d.ts:479-495` during Wave 1 planning.
- Refusal artifact symmetry (Q-12) is purely additive: extend `RefusalStage` with three new values and `sourceOfTruth` enum with two new values; existing `appendRefusalIndexEntry` and `terminal-status.json` machinery is reused unchanged.
- Hierarchical aborts via `AbortSignal.any([ctx.signal, AbortSignal.timeout(timeoutMs)])` is Node 22 native — no library needed. Classify abort cause by inspecting `signal.reason` (DOMException name `"TimeoutError"` ⇒ pile-timeout, else pile-cancelled).
- The retroactive Phase 5 Q-10 update (Q-14) is the highest planning risk — Phase 5 is in progress and a stub `qwen-judge-adapter` could ship if Phase 6's CONTEXT note isn't propagated immediately. **Action:** Wave 0 includes annotation update to `05-CONTEXT.md` Q-10.
- `@protostar/repair` is currently a 4-line skeleton; co-locating `ExecutionCoordinationPileResult` there for v0.1 (Q-18 / Claude's discretion) avoids a new package.

### File Created

`.planning/phases/06-live-dogpile-piles/06-RESEARCH.md`

### Confidence Assessment

| Area | Level | Reason |
|------|-------|--------|
| Standard Stack | HIGH | Every SDK type/function read from installed `.d.ts` |
| Architecture | HIGH | All seams (Phase 4 adapter, refusal pipe, factory-config schema, no-fs contract) verified in source |
| Pitfalls | HIGH | Five of six pitfalls verified from source; pitfall 2 (AgentSpec field name) flagged for Wave 1 confirmation |
| Validation | HIGH | All 17 test mappings derived from PILE-01..06 + decision Q-IDs |

### Open Questions

1. `AgentSpec` per-agent provider field name — confirm from `dist/types.d.ts:479-495` during Wave 1 planning.
2. `JudgeRejectDecision` evidence shape — confirm sufficient for `pile-all-rejected.judgeDecisions` population.
3. `RunEvent` → `ReviewLifecycleEvent` mapping — resolve during Wave 3 factory-cli wiring.
4. Trace blob size at Phase 10 dogfood — empirical; revisit Phase 9 OP-08.

### Ready for Planning

Research complete. Planner can now create PLAN.md files. Recommended wave structure:

- **Wave 0:** Skeletons + schema bumps + Q-16 rename + Q-09 static no-fs test + retroactive Phase 5 Q-10 annotation
- **Wave 1:** `@protostar/dogpile-adapter` core (`runFactoryPile`, `resolvePileBudget`, `mapSdkStopToPileFailure`, `PileFailure` union) — pure unit-testable
- **Wave 2:** Domain parsers (`@protostar/review` `ReviewPileResult` + `createReviewPileModelReviewer`; `@protostar/repair` `ExecutionCoordinationPileResult`; `@protostar/planning` `admitWorkSlicing`)
- **Wave 3:** `apps/factory-cli` wiring — flag parsing, `factory-config.json` `piles` block, hierarchical AbortController, persistence layer (`runs/{id}/piles/{kind}/iter-{N}/{result,trace,refusal}.json`), refusal index extension, `RunEvent → ReviewLifecycleEvent` translation
- **Wave 4:** `admission-e2e` runtime no-fs contract test + refusal byte-equality snapshot test + integration smoke (planning/review/exec-coord live mode against stub provider)
