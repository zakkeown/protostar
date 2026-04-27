# Phase 6: Live Dogpile Piles — Context

**Gathered:** 2026-04-27
**Source:** `06-QUESTIONS.json` (18/18 answered, --power mode)
**Status:** Ready for research + planning

<domain>
## Phase Boundary

Wire the three Dogpile presets — `planningPilePreset`, `reviewPilePreset`, `executionCoordinationPilePreset` — behind real `@dogpile/sdk` invocations. Protostar remains the authority kernel; piles are bounded coordination cells producing typed evidence that flows through the existing admission paths. Pile output never bypasses Phase 1 admission, Phase 5 review, or Phase 2 capability envelope. Failure modes (timeout, schema parse, all-rejected, transport, cancel) emit the same no-admission artifact shape as fixture parse failures. `dogpile-adapter` retains zero filesystem authority — it owns network-only SDK invocation; `apps/factory-cli` owns persistence.

**Blast radius:** First real model variability in planning/review/coordination paths. A wrong invocation seam means runaway model spend, undetected SDK errors corrupting admission, or piles silently bypassing the capability envelope.

**Requirements:** PILE-01, PILE-02, PILE-03, PILE-04, PILE-05, PILE-06.

</domain>

<decisions>

## Invocation Surface (PILE-01, PILE-06)

### Q-01 — SDK invocation owner
**Decision:** `dogpile-adapter` exposes `runFactoryPile(mission, ctx)`. Adapter owns the `@dogpile/sdk` call surface (network only, zero fs). `factory-cli` passes provider, AbortSignal, and resolved budget; receives `{ result, trace, accounting, stopReason }`.
**Rationale:** Symmetric with Phase 4's `createLmstudioCoderAdapter` pattern. Network is allowed inside the adapter (PILE-06 forbids fs, not network); centralizing SDK shape behind a Protostar-owned function insulates callers from SDK churn. `factory-cli` stays the only fs writer.
**Note for planner:** New export from `@protostar/dogpile-adapter`: `runFactoryPile(mission: FactoryPileMission, ctx: PileRunContext): Promise<PileRunOutcome>`. `PileRunContext` shape: `{ provider, signal: AbortSignal, budget: ResolvedPileBudget, now?, onEvent?: (e: RunEvent) => void }`. Body uses `stream()` per Q-02 internally; surfaces a structured outcome union per Q-13. The function MUST NOT import `node:fs`/`node:path` (Q-09 contract test enforces this).
**Status:** Decided.

### Q-02 — SDK entrypoint shape
**Decision:** Use `stream()` and consume `RunEvent` events; `runFactoryPile` accumulates and returns the same `RunResult`-shaped outcome as `run()` would. Optional `ctx.onEvent` callback forwards events to factory-cli for `ReviewLifecycleEvent` emission and Phase 9 inspect surface.
**Rationale:** Pays the plumbing cost once; unlocks per-turn / per-judge lifecycle events for Phase 5 (review pile lifecycle), Phase 8 (per-turn evaluation signals), and Phase 9 (inspect / live status). Cancellation via AbortSignal still works. SDK churn risk is the same as `run()` because `stream()` consumes the same event union.
**Note for planner:** Internally `for await (const ev of stream(opts))` with a switch over `RunEvent` kinds; mirror `RunResult` accumulation via SDK's exported helpers if available, otherwise fold deterministically inside the adapter. Phase 5 lifecycle bridge: factory-cli's `onEvent` translates SDK events into `ReviewLifecycleEvent` (Phase 5 Q-18) for review-pile invocations. Test: stub provider yields N model events; `runFactoryPile` returns RunResult and forwarded `onEvent` count equals N.
**Status:** Decided.

### Q-03 — Provider construction & sharing
**Decision:** AgentSpec-level provider override. Each `AgentSpec` may carry its own provider/model. Default provider is the shared LM Studio `createOpenAICompatibleProvider({ baseUrl })` from Phase 4; specific agents (e.g., the Qwen3-80B judge in review pile, or a future second-family judge in Phase 8) declare their own provider/model on the spec.
**Rationale:** Maximum flexibility for the Phase 8 heterogeneous-local panel without reshaping Phase 6 plumbing. Per-agent override keeps the FactoryPilePreset declarative — Phase 8 swaps in new `AgentSpec.provider` entries without touching invocation code. v0.1 cosmetic-tweak runs typically share one provider; the override is rarely populated but always available.
**Note for planner:** Extend the existing `AgentSpec` consumer surface in `dogpile-adapter` to carry an optional `provider` field per agent (the SDK's `AgentSpec` type already supports this — confirm at research time). `factory-cli` resolves agent providers in two passes: (1) pile-level default from `factory-config.json` (`adapters.pileProvider` or reuse Phase 4's coder/judge baseUrl), (2) per-agent override from preset. Preflight (Phase 4 Q-13) extends to verify every distinct model id across all participating agents is loaded in LM Studio before invocation.
**Status:** Decided.

## Mode Selection (PILE-01, PILE-04)

### Q-04 — Mode-selection flag granularity
**Decision:** Mode lives in `factory-config.json` under `piles.{planning,review,executionCoordination}.mode: "fixture" | "live"`. CLI flag overrides per pile (`--planning-mode`, `--review-mode`, `--exec-coord-mode`) when explicitly provided. Roadmap's `--planning-mode` is the canonical first flag; review/exec-coord flags are additions.
**Rationale:** Per-pile-kind in config is symmetric with Phase 4 Q-09's `factory-config.json` layout. Lets dogfood configs pin live mode persistently while CI configs pin fixture without touching CLI invocations. CLI override is the operator escape hatch. Avoids an inflexible global switch (option a) and an undocumented config surface (option b).
**Note for planner:** Schema additions in `factory-config.schema.json`: `piles: { planning: { mode: 'fixture'|'live', fixturePath?: string }, review: { mode, fixturePath? }, executionCoordination: { mode, fixturePath? } }`. CLI parser in `apps/factory-cli/src/main.ts` adds three optional flags; precedence is CLI > config > built-in default. Built-in default is "fixture" per Q-05.
**Status:** Decided.

### Q-05 — Default mode for v0.1
**Decision:** Default `fixture`; `--live` (or `mode: "live"` in config) opts in. Phase 10 dogfood configs ship with live enabled.
**Rationale:** Keeps `pnpm verify` and CI deterministic by default — no LM Studio dependency for unit/contract tests. Live mode is an explicit operator decision, matching the dark-factory posture that risk-bearing flips are config, not implicit.
**Note for planner:** All test fixtures and `examples/` runs default to fixture. Phase 10 DOG-04 (cosmetic-tweak dogfood loop) writes a `factory-config.json` with `piles.*.mode: "live"`. Document the precedence order in `.env.example` and `factory-config.schema.json` description fields.
**Status:** Decided.

### Q-06 — Fixture-mode fallback semantics
**Decision:** No auto-fallback. Live failure produces a no-admission refusal artifact (Q-12). Fixture mode is a separate code path the operator selects explicitly; live mode never silently substitutes a fixture.
**Rationale:** Admission discipline. Auto-fallback would hide live failures behind stale fixture data and break the dark-factory contract that admission decisions are evidenced. Roadmap line "fixture-mode fallback still works" reads as "fixture mode continues to function in parallel," not "live falls back to fixture."
**Note for planner:** Document explicitly in `factory-config.schema.json` description and CONCERNS that live failures are first-class refusals, never substituted. Test: configure live, force pile timeout, assert run produces `pile-refusal.json` and exits non-zero — does NOT continue with fixture.
**Status:** Decided.

## Persistence & FS Authority (PILE-06)

### Q-07 — Pile output directory layout
**Decision:** `runs/{id}/piles/{kind}/iter-{N}/{result.json,trace.json,refusal.json}`. `{kind} ∈ planning|review|execution-coordination`; `iter-N` is the loop attempt index (planning has only `iter-0`; review iterates per Phase 5 Q-17; exec-coord matches its trigger iteration).
**Rationale:** Mirrors Phase 5 Q-17's per-iteration-directory pattern. Per-pile-kind subdir keeps grep simple ("what did the planning pile do?"). Atomic per-file tmp+rename. Bounded directory size (`maxRepairLoops + 1` per pile-kind max). Phase 9 `inspect` reads `.jsonl` (per Q-12 refusals) for chronology and drills into `iter-N/` for detail.
**Note for planner:** `factory-cli` owns all writes. Adapter returns blobs; CLI persists. Add to `runs/{id}/MANIFEST.md` (or equivalent run summary) a per-pile section listing iteration count and outcome. Test: golden fixture run produces expected directory structure for each pile kind.
**Status:** Decided.

### Q-08 — Trace persistence policy
**Decision:** Always persist full `trace.json` per pile invocation.
**Rationale:** Maximum forensic surface for early dogfooding. Phase 8 evaluation needs trace data to reason about per-judge behavior; Phase 9 inspect needs replay capability. Disk cost is a Phase 9 OP-08 pruning concern, not a Phase 6 design concern. v0.1 runs are bounded (cosmetic-tweak archetype, modest budgets) — trace blobs stay manageable.
**Note for planner:** `trace.json` written by factory-cli using `JSON.stringify(result.trace, null, 2)` (or SDK's `replay`-compatible serializer). Note in CONCERNS: revisit if disk growth becomes operational; pruning recipe lives in Phase 9.
**Status:** Decided.

### Q-09 — Adapter zero-fs contract test
**Decision:** Both — static import-graph test in `@protostar/dogpile-adapter` AND runtime fs-stub test in `admission-e2e`. Defense in depth.
**Rationale:** Static catches obvious imports cheaply during package build; runtime catches transitive fs use through any future dep. Symmetric with Phase 2 Plan 10 authority-no-fs regression.
**Note for planner:** Static test: `packages/dogpile-adapter/src/no-fs.contract.test.ts` greps src for `from "node:fs"`, `from "fs"`, `from "node:path"`, etc. (mirror Phase 2 pattern). Runtime test: `packages/admission-e2e/src/dogpile-adapter-no-fs.contract.test.ts` wraps `node:fs` with a Proxy that throws on any property access, invokes `runFactoryPile` with a stub provider that returns a deterministic RunResult, asserts no fs access. Both tests included in `pnpm verify`.
**Status:** Decided.

## Budget Enforcement & Cancellation (PILE-05)

### Q-10 — Capability envelope vs preset budget reconciliation
**Decision:** Envelope clamps preset (intersect: `min` of each field). Preset is the proposal; capability envelope is the cap. If preset says `maxTokens: 24000` but envelope says `12000`, pile runs with `12000`.
**Rationale:** Symmetric with Phase 2 precedence kernel (`intersectEnvelopes` → minimum of each capability). Preserves preset declarative role (a sensible default per pile kind) while ensuring envelope authority is fail-closed. Avoids a schema bump (option c) that would balloon ConfirmedIntent surface for Phase 6.
**Note for planner:** New helper in `dogpile-adapter`: `resolvePileBudget(preset.budget, envelope.budget): ResolvedPileBudget` returning `{ maxTokens, timeoutMs, maxCalls? }` taking the min of each defined field. `runFactoryPile` consumes only the resolved value; preset budget is never read at the SDK boundary. Test: preset `maxTokens=24000`, envelope `maxTokens=12000` → resolved `12000`. If envelope omits a field, preset's value passes through (envelope acts as a cap, not a floor). Document in CONCERNS that piles inherit Phase 5 Q-13's hierarchical budget posture (loop counter outer, adapter retries inner, pile budget per-invocation).
**Status:** Decided.

### Q-11 — Cancellation / AbortSignal threading
**Decision:** Hierarchical AbortControllers. Run-level controller (factory-cli SIGINT/sentinel from Phase 4 Q-16) is the parent; each pile invocation creates a child controller parented to it (and additionally tied to the pile's `timeoutMs`). SIGINT cascades to all children; per-pile timeout aborts only that pile.
**Rationale:** Lets a pile-level timeout fail just the pile (not the run, per PILE-05). SIGINT still cancels everything atomically. Maps cleanly to the per-pile-kind budget shape from Q-10. Modern Node has `AbortSignal.any([parent, timeout])` for this.
**Note for planner:** `runFactoryPile` constructs `AbortSignal.any([ctx.signal, AbortSignal.timeout(resolvedBudget.timeoutMs)])` and passes the resulting signal to SDK `stream()`. Distinguish abort reasons in the outcome: `pile-cancelled` (parent signal), `pile-timeout` (timeout signal), via `controller.signal.reason` inspection. Test: parent abort fires → child reason 'cancelled'; timeout fires before parent → child reason 'timeout'.
**Status:** Decided.

## Failure → No-Admission Mapping (PILE-04)

### Q-12 — Refusal artifact location & shape
**Decision:** Reuse the existing planning/review refusal-artifact format. Pile failures become entries in `.protostar/refusals.jsonl` and `runs/{id}/piles/{kind}/iter-{N}/refusal.json` using the existing `sourceOfTruth` discriminator: `"PlanningPileResult"` (already exists) plus new `"ReviewPileResult"` and `"ExecutionCoordinationPileResult"`.
**Rationale:** Stage-uniform refusal taxonomy. Phase 1 admission already understands `PlanningPileResult` source-of-truth refusals; Phase 6 extends the same refusal pipe rather than introducing a parallel one. Operators learn one refusal shape. Aligns with the dark-factory rule that refusals are evidence-uniform.
**Note for planner:** Schema parity: extend the per-stage refusal artifact schema's `sourceOfTruth` enum to include the two new pile-result variants. Refusal payload includes the `Q-13` failure-class discriminator + structured evidence (timeout duration, parse error path, rejected candidate count, etc.). `.protostar/refusals.jsonl` index gains pile entries; refusal-index reader stays unchanged.
**Status:** Decided.

### Q-13 — Pile failure taxonomy
**Decision:** Six-variant union: `pile-timeout | pile-budget-exhausted | pile-schema-parse | pile-all-rejected | pile-network | pile-cancelled`. Each variant carries its own evidence shape.
**Rationale:** Maximum discriminator surface for Phase 8 evaluation (cause-distribution analysis). Branches map cleanly to operator-actionable categories: timeout/budget → tune envelope, schema-parse → SDK or model output drift, all-rejected → judge calibration, network → infrastructure, cancelled → operator action. Coarser bucketing (option b) loses the actionable distinction. Mirroring SDK's `NormalizedStopReason` (option c) couples our refusal evidence to SDK churn.
**Note for planner:** Define `type PileFailure` discriminated union in `dogpile-adapter` with per-variant evidence:
- `pile-timeout`: `{ kind, elapsedMs, configuredTimeoutMs }`
- `pile-budget-exhausted`: `{ kind, dimension: 'tokens'|'calls', consumed, cap }`
- `pile-schema-parse`: `{ kind, sourceOfTruth, parseErrors: ParseError[] }`
- `pile-all-rejected`: `{ kind, candidatesEvaluated, judgeDecisions: JudgeDecision[] }`
- `pile-network`: `{ kind, attempt, lastError: { code, message } }`
- `pile-cancelled`: `{ kind, reason: 'sigint'|'parent-abort'|'sentinel' }`

Map SDK `NormalizedStopReason` → `PileFailure` in a single helper (`mapSdkStopToPileFailure`). Test per variant: synthetic SDK responses produce the correct discriminator.
**Status:** Decided.

## Composition with Phase 5

### Q-14 — Review pile vs Phase 5 Q-10 single-Qwen judge
**Decision:** Phase 6 review pile **REPLACES** the Phase 5 Q-10 single-Qwen judge as the `ModelReviewer` implementation. Phase 5 Q-10 is updated retroactively: Phase 5 ships an interface + a fixture passthrough; Phase 6 wires the real review pile (panel-of-N via `reviewPilePreset.agents`); Phase 8 swaps in heterogeneous-local panel + consensus math without changing the loop seam.
**Rationale:** Cleanest single review path. Avoids two parallel model-review code paths drifting (option b/c). Phase 8's harsher-than-baseline rule and consensus math layer naturally on top of a pile-based reviewer. `reviewPilePreset` already declares 3 agents (correctness/security/release-gate) — even at v0.1 that beats panel-of-one for free, with Phase 8 only swapping model families.
**Note for planner — RETROACTIVE PHASE 5 IMPACT:**
- Phase 5 Q-10 is RE-LOCKED: ship the `ModelReviewer` interface only + a fixture/passthrough implementation. Do NOT ship a single-Qwen lmstudio-judge adapter in Phase 5.
- Phase 6 supplies `createReviewPileModelReviewer(): ModelReviewer` — implements the Phase 5 interface by calling `runFactoryPile({ preset: reviewPilePreset, intent, ctx })` and translating `ReviewPileResult` → `ModelReviewResult`.
- The `JudgeCritique` shape from Phase 5 Q-11 stays; review pile populates `judgeId` per `AgentSpec.id`, `model` per resolved per-agent provider model id.
- Update `.planning/phases/05-review-repair-loop/05-CONTEXT.md` Q-10 with a "Re-locked in Phase 6 Q-14" annotation during Phase 6 planning.
- factory-config.json adds `piles.review.mode`; when `fixture`, the Phase 5 fixture passthrough runs; when `live`, the review pile runs.

This is the single most load-bearing decision in Phase 6. Flag in CONCERNS.
**Status:** Decided.

### Q-15 — Execution-coordination pile trigger point
**Decision:** Both — pile invoked for (1) initial work-slicing of admitted-plan tasks AND (2) repair-plan generation. Two trigger points within a single preset; mission text differentiates which mode the pile is operating in.
**Rationale:** Most literal reading of PILE-03 ("invoked when execution proposes work-slicing or repair-plan generation"). Wires both seams now so Phase 8 doesn't need to reopen the loop. v0.1 cosmetic-tweak archetype rarely triggers either (single task, single file), so live cost stays low; the seam is exercised by fixture tests.
**Note for planner:**
- **Work-slicing trigger:** before execution begins, factory-cli evaluates `shouldInvokeWorkSlicing(admittedPlan)` (heuristic: any task whose targetFiles count > N or estimatedTurns > M, configurable). If true, invoke `executionCoordinationPilePreset` with mission "propose finer task subdivision." Output is a `WorkSlicingProposal` re-admitted via Phase 1 (a sliced plan still passes admission). If admission rejects, execution proceeds with the original plan.
- **Repair-plan trigger:** after `@protostar/repair`'s deterministic `synthesizeRepairPlan`, exec-coord pile is optionally invoked to critique/refine. Output is a `RepairPlanProposal` admitted by `@protostar/repair`'s validator. If admission rejects, the deterministic RepairPlan stands. (This makes Q-15 option (a) a special case of (c) at the repair seam.)
- Both invocations gated by `factory-config.json: piles.executionCoordination.mode = "live"`. v0.1 cosmetic-tweak: defaults to fixture (Q-05); fixtures return `{ proposal: null }` (no-op), pile runs with empty effect.
- Single preset with mission discriminator: `buildExecutionCoordinationMission(intent, mode: 'work-slicing' | 'repair-plan-generation', input): FactoryPileMission`.

Document in CONCERNS that two trigger points share one preset and one budget; tune carefully when Phase 10 dogfood expands beyond cosmetic-tweak.
**Status:** Decided.

### Q-16 — Preset name discrepancy
**Decision:** Rename the code → `executionCoordinationPilePreset`. Match roadmap and REQUIREMENTS PILE-03 wording.
**Rationale:** Roadmap is the source of truth; no live caller of the existing name yet (only declared in `dogpile-adapter`); cheaper to rename code than docs across multiple `.planning/` files. Aligns with `FactoryPileKind` value `'execution-coordination'`.
**Note for planner:** Rename `executionCoordinatorPilePreset → executionCoordinationPilePreset` in `packages/dogpile-adapter/src/index.ts`, update all internal references (none exist outside the file today). Keep `FactoryPileKind = 'execution-coordination'` (already correct). No deprecated alias — rename is breaking but safe at this stage.
**Status:** Decided.

## Pile-Output Schemas & Admission Helpers

### Q-17 — Review-pile output assert helper
**Decision:** Mirror the planning-side pattern in `@protostar/review`. Add `assertReviewPileResult(value): ReviewPileResult` and `parseReviewPileResult(result, context): ReviewPileParseResult`. `dogpile-adapter` re-exports for ergonomic import (matching today's planning re-exports in `dogpile-adapter`).
**Rationale:** Each domain owns its pile-output contract. `@protostar/review` already owns review verdict shapes, findings, and JudgeCritique types — placing the assertion there keeps the type/parser/validator together. Generic helper (option b) couples adapter to every stage's domain types.
**Note for planner:** Define `ReviewPileResult` in `@protostar/review`: `{ output: string, source?: PileSource }` mirroring `PlanningPileResult`. `output` is JSON-stringified `{ judgeCritiques: JudgeCritique[], aggregateVerdict: ReviewVerdict }`. `parseReviewPileResult` validates structure and produces a `ModelReviewResult` (per Phase 5 Q-10 contract). `assertCandidatePlanFromPlanningPileResult` analog: `assertModelReviewFromReviewPileResult`. Re-export from `dogpile-adapter`.
**Status:** Decided.

### Q-18 — ExecutionCoordinationPileResult shape
**Decision:** Same `{ output, source }` envelope as `PlanningPileResult`. `output` is a JSON-stringified `ExecutionCoordinationProposal` (a discriminated union: `{ kind: 'work-slicing', slices: TaskSlice[] }` or `{ kind: 'repair-plan', repairPlan: RepairPlanProposal }`). Structural validation lives in `@protostar/repair` (for repair-plan variant) and `@protostar/planning` (for work-slicing variant).
**Rationale:** Wire-format symmetry with `PlanningPileResult` — same parsing test pattern, same refusal-artifact source-of-truth discriminator, same JSON-string indirection. Domain validators live in their owning packages.
**Note for planner:** Type `ExecutionCoordinationPileResult { output: string, source?: PileSource }` lives in… planner picks owning package. Candidates: (a) new `@protostar/execution-coordination` package, or (b) re-use `@protostar/repair` (since repair-plan is the primary mode). Recommend (b) for v0.1 to avoid another package; revisit if work-slicing scope grows. Discriminated union parser: `parseExecutionCoordinationPileResult(result, context): ExecutionCoordinationProposal | ParseError[]`. Re-export from `dogpile-adapter`. Each proposal variant gets its own admission validator (`admitWorkSlicing` in planning, `admitRepairPlanProposal` in repair).
**Status:** Decided.

### Claude's Discretion
- Exact heuristic for `shouldInvokeWorkSlicing(admittedPlan)` thresholds (Q-15) — defaults guessed (targetFiles > 3, estimatedTurns > 5); planner tunes from Phase 4 task fixture distribution.
- Whether to extract `ExecutionCoordinationPileResult` types into a new `@protostar/execution-coordination` package or co-locate in `@protostar/repair` (Q-18 owning-package question) — recommend repair for v0.1; planner decides based on cycle risk with `@protostar/planning` work-slicing validator.
- `PileSource` discriminator value space — likely `"live" | "fixture" | "fixture-bad"` mirroring planning; planner verifies against existing planning enum.
- Whether `runFactoryPile` accepts a single `mission` or `(preset, missionInput)` tuple — Phase 4-style adapter symmetry suggests a single typed mission; planner picks ergonomic shape.
- Exact `factory-config.json` envelope path for pile-mode config (Q-04) — recommend top-level `piles: {...}` key; planner verifies against Phase 4 Q-09 schema layout.

</decisions>

<specifics>
## Specific Ideas

- **Single-adapter network surface:** All three piles + the Phase 4 coder + the Phase 5 fixture passthrough route through `createOpenAICompatibleProvider({ baseUrl })` at one LM Studio endpoint. Per-agent model overrides (Q-03) are the only configuration knob beyond baseUrl/key — keeps preflight (Phase 4 Q-13) cheap.
- **Phase 5 Q-10 retroactive update:** Phase 5 ships only the `ModelReviewer` interface + fixture passthrough; the live single-Qwen lmstudio-judge implementation is dropped. The real model-review impl is `createReviewPileModelReviewer()` in Phase 6. Update Phase 5's CONTEXT.md, plans (if any reference a "single-Qwen judge adapter"), and any in-flight verification notes.
- **Hierarchical aborts via `AbortSignal.any`:** Phase 6 introduces the first hierarchical abort pattern in Protostar (Phase 4 used a single controller per run). Document the pattern in PROJECT.md or a dedicated `.planning/codebase/` note so Phase 8's panel + Phase 9's resume code reuse it.
- **Six-variant `PileFailure` union:** lift to an exported type from `@protostar/dogpile-adapter` so Phase 8 evaluation can `switch` exhaustively over failure causes. This is an evidence-bearing wire format — bump-aware.
- **Both-trigger exec-coord seam:** the work-slicing path requires a re-admission pass through Phase 1 admission. Document the loop: original admitted plan → exec-coord pile work-slicing proposal → re-admit → execute on the sliced plan. Make sure the re-admission preserves the admission signature chain.
- **Preset rename (Q-16):** non-breaking now (no external caller); becomes breaking the moment a `factory-config.json` references the name. Land the rename in the same plan that wires CLI flags (Q-04).
- **Trace-blob volume risk:** Q-08's "always persist trace.json" decision intersects with Phase 9 OP-08's "pruning recipe." Phase 9 must understand pile traces as a pruning target, not just run-level state.

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Roadmap & requirements
- `.planning/ROADMAP.md` §"Phase 6 — Live Dogpile Piles" — goal, requirements, success criteria
- `.planning/REQUIREMENTS.md` §"Phase 6" — PILE-01 through PILE-06 verbatim text

### Prior-phase locks (must not break)
- `.planning/phases/01-intent-planning-admission/01-CONTEXT.md` — branded `ConfirmedIntent`, `AdmittedPlan`, refusal artifact layout (`.protostar/refusals.jsonl` + per-run refusal JSON; Q-08 lock)
- `.planning/phases/02-authority-governance-kernel/02-CONTEXT.md` — capability envelope shape, `intersectEnvelopes` precedence (template for Q-10 budget clamping), `Authorized*Op` brand pattern, network capability + `allowedHosts`
- `.planning/phases/03-repo-runtime-sandbox/03-CONTEXT.md` — `repoSubprocessRunner` (not used by piles, but referenced by Phase 5 mechanical-checks adapter that piles compose with)
- `.planning/phases/04-execution-engine/04-CONTEXT.md` — Q-09 `factory-config.json` schema (Phase 6 extends with `piles.{kind}.mode`), Q-13 LM Studio preflight (Phase 6 extends to verify per-agent models), Q-14/Q-15 `adapterRetriesPerTask` / `taskWallClockMs` envelope budget pattern (Phase 6 mirrors with pile budget), Q-16 SIGINT/sentinel cancel (Phase 6 hierarchical aborts parent), Q-19 per-task evidence (pile evidence parallels)
- `.planning/phases/05-review-repair-loop/05-CONTEXT.md` — Q-02 strict serial mechanical→model, Q-04/Q-05 `RepairPlan` shape and `@protostar/repair` package (Phase 6 Q-15 hooks here), **Q-10 model-reviewer interface (REVISED in Phase 6 Q-14: ship interface + fixture only, not single-Qwen impl)**, Q-11 `JudgeCritique` shape (review pile populates), Q-12 `budget.maxRepairLoops` (envelope source for Phase 6 budget reconciliation), Q-15 `DeliveryAuthorization` brand mint, Q-17 `runs/{id}/review/iter-{N}/` layout (Phase 6 mirrors at `runs/{id}/piles/{kind}/iter-{N}/`), Q-18 `ReviewLifecycleEvent` (Phase 6 review pile emits these via `ctx.onEvent`)

### Project posture
- `.planning/PROJECT.md` — authority boundary (only `apps/factory-cli` + `packages/repo` touch fs; PILE-06 keeps `dogpile-adapter` zero-fs), heterogeneous-local judges (Qwen3-80B for v0.1, second family in Phase 8), domain-first packaging
- `.planning/codebase/CONCERNS.md` §"Real planning pile execution" — Phase 6 wires this
- `.planning/codebase/CONCERNS.md` §"Review pile is also un-invoked" — Phase 6 wires this (replaces Phase 5 Q-10 stub)
- `AGENTS.md` — domain-first packaging (no catch-all)

### Authority + contract surfaces touched
- `packages/dogpile-adapter/src/index.ts` — `planningPilePreset`, `reviewPilePreset`, `executionCoordinatorPilePreset` (RENAME → `executionCoordinationPilePreset`), `buildPlanningMission`, `buildReviewMission`. Phase 6 adds: `runFactoryPile`, `mapSdkStopToPileFailure`, `resolvePileBudget`, `PileFailure` union, `PileRunContext`, `PileRunOutcome`. Re-exports `ReviewPileResult` parsers (Q-17) and `ExecutionCoordinationPileResult` parsers (Q-18).
- `packages/dogpile-types/src/index.ts` — re-exports `@dogpile/sdk` types; Phase 6 may extend if SDK exports for `RunEvent`/`Trace`/`run`/`stream` need re-exposure.
- `packages/planning/src/index.ts` — `PlanningPileResult`, `assertPlanningPileResult`, `parsePlanningPileResult` (already exists). Phase 6 may add `admitWorkSlicing` for Q-15 work-slicing re-admission.
- `packages/review/src/index.ts` — Phase 6 ADDS `ReviewPileResult`, `assertReviewPileResult`, `parseReviewPileResult`, `assertModelReviewFromReviewPileResult`, `createReviewPileModelReviewer` (Phase 5 Q-10 implementation per Q-14 retroactive lock).
- `packages/repair/src/index.ts` (Phase 5 new package) — Phase 6 ADDS `ExecutionCoordinationPileResult`, `parseExecutionCoordinationPileResult`, `admitRepairPlanProposal`. (Or new `@protostar/execution-coordination` if planner picks separation.)
- `packages/intent/schema/confirmed-intent.schema.json` (or capability-admission-decision.schema.json) — Q-10 keeps existing fields; no Phase 6 schema bump required (envelope clamping uses existing budget fields).
- `apps/factory-cli/src/main.ts` — Phase 6 wires `--planning-mode`, `--review-mode`, `--exec-coord-mode` flags + `factory-config.json` `piles.*` block; constructs hierarchical AbortControllers; persists `runs/{id}/piles/{kind}/iter-{N}/{result,trace,refusal}.json`; routes review-pile invocation through Phase 5's `ModelReviewer` seam; routes exec-coord pile through `@protostar/repair`'s repair-plan seam and Phase 1's work-slicing re-admission.
- `apps/factory-cli/src/factory-config.schema.json` (Phase 4 Q-09) — Phase 6 extends with `piles: {...}` block.
- `packages/admission-e2e/src/` — Phase 6 ADDS `dogpile-adapter-no-fs.contract.test.ts` (runtime fs-stub regression).

### External libraries
- `@dogpile/sdk@0.2.0` — primary entrypoints `run`, `stream`, `Dogpile.pile`, plus `createOpenAICompatibleProvider`, `createEngine`, `replay`, termination helpers (`budget`, `convergence`, `firstOf`, `judge`). Phase 6 uses `stream()` (Q-02) and `createOpenAICompatibleProvider`. Types: `RunEvent`, `RunResult`, `Trace`, `NormalizedStopReason`, `AgentSpec`, `DogpileOptions`, `EngineOptions`, `BudgetCaps`. Verify against `node_modules/.pnpm/@dogpile+sdk@0.2.0/node_modules/@dogpile/sdk/dist/index.d.ts` at planning time.
- LM Studio OpenAI-compatible API — preflight verifies every distinct per-agent model id loaded (Phase 4 Q-13 extension per Q-03).

</canonical_refs>
