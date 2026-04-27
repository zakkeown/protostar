# Phase 5: Review → Repair → Review Loop — Context

**Gathered:** 2026-04-27
**Source:** `05-QUESTIONS.json` (18/18 answered, --power mode)
**Status:** Ready for research + planning

<domain>
## Phase Boundary

Lock the central control loop. Mechanical review runs first against execution evidence; model review (Phase 8 panel) runs second when mechanical passes. Failed verdicts produce a typed `RepairPlan` consumed by execution; re-execution emits the same lifecycle events. Pass/pass from both reviewers is the only path to delivery — anything else is refused at the contract layer. Phase 8 plugs the real heterogeneous-local panel into the model-reviewer seam locked here without reopening the loop shape.

**Blast radius:** This phase is the gating control plane between mutation (Phase 4) and delivery (Phase 7). A wrong loop shape means either runaway model spend, undetected mechanical failures shipping to PRs, or repair plans that diverge from execution semantics.

**Requirements:** LOOP-01, LOOP-02, LOOP-03, LOOP-04, LOOP-05, LOOP-06.

</domain>

<decisions>

## Loop Shape & Orchestration (LOOP-01, LOOP-02, LOOP-04)

### Q-01 — Loop ownership
**Decision:** Keep the loop inside `@protostar/review`. Extend the existing `runMechanicalReviewExecutionLoop` into a `runReviewRepairLoop` that takes injected `executor: TaskExecutor`, `mechanicalChecker: MechanicalChecker`, and `modelReviewer: ModelReviewer` services.
**Rationale:** Minimal package churn; `runMechanicalReviewExecutionLoop` already exists and ships the iteration accumulator. Phase 1's branded artifacts and Phase 4's lifecycle exports are already imported here. Yes, review now imports execution-runtime concerns (signal + journal-writer types) — accept the smell because Phase 4 already exports the contract surfaces cleanly and a new orchestrator package would duplicate them.
**Note for planner:** Promote `runMechanicalReviewExecutionLoop` → `runReviewRepairLoop` (rename, keep a deprecated re-export pointing to the new function for Phase 4 tests until they update). Inputs: `{ admittedPlan, execution, executor, mechanicalChecker, modelReviewer, budget, now? }`. Inline `runExecutionDryRun` callsite is replaced with the injected `executor.executeRepairTasks(...)` (Q-03 scope). Add a `factory-cli` wiring layer that constructs the real services and calls the loop — `runFactory` does not own iteration semantics.
**Status:** Decided.

### Q-02 — Mechanical → model serialization
**Decision:** Strict serial. Model review only runs on iterations where mechanical returned `pass`. A mechanical fail goes straight to repair-plan synthesis without touching the model panel.
**Rationale:** Matches LOOP-01/LOOP-02 literal reading. Saves Phase 8 panel cost on broken builds (judges have nothing useful to say about code that doesn't compile). Single-state mechanical (`pass | repair | block`) is enough — no `warn` tier needed.
**Note for planner:** Loop pseudocode per iteration: `mech = await mechanicalChecker(input); if (mech.verdict === 'block') break-block; if (mech.verdict === 'repair') { synthesizeRepair(mech); continue; } model = await modelReviewer(input); if (model.verdict !== 'pass') { synthesizeRepair(mech, model); continue; } return approved;`. Iteration record always includes `mechanical: ReviewVerdict` and `model: ReviewVerdict | 'skipped'`.
**Status:** Decided.

### Q-03 — Re-execution scope on repair
**Decision:** Re-run the failed/repair tasks **plus their dependents** in the same workspace. Upstream successful tasks are preserved; the dependent-subgraph re-executes top-down.
**Rationale:** Cheaper than fresh-clone-per-iteration and tighter than failed-only — a fix to Task N might invalidate Task N+1's output. Phase 3 fresh-clone-per-run still applies at the run boundary; iteration boundary is intentionally cheaper. Phase 4 Q-19's per-task apply model already supports this — apply rolls forward, dependents see the updated workspace.
**Note for planner:** Add `computeRepairSubgraph(plan, repairTaskIds): readonly string[]` returning the topo-ordered set of `repairTaskIds ∪ allDescendantsOf(repairTaskIds)`. Executor receives the subgraph and re-executes those tasks in the live workspace. Document: if a dependent task previously succeeded but now fails (because its upstream changed), the repair surfaces it as a new finding — that's expected, not a regression. Test: A→B→C plan, C fails, repair re-runs C only (no dependents of C); A→B→C plan, A fails, repair re-runs A,B,C in order.
**Status:** Decided.

## RepairPlan Type & Authorship (LOOP-03)

### Q-04 — RepairPlan shape
**Decision:** RepairPlan is a list of `RepairTask` references with critiques attached: `{ runId, attempt, repairs: Array<{ planTaskId, mechanicalCritiques: ReviewFinding[], modelCritiques?: JudgeCritique[] }>, dependentTaskIds: readonly string[] }`. Plan graph stays unchanged; we patch the *task input*, not the plan structure.
**Rationale:** Matches Q-03 (dependents come along for the ride but aren't repair-targets — they re-run as workspace state changes). Keeps Phase 1's `AdmittedPlanExecutionArtifact` immutable across iterations — admission boundary is crossed once, not every iteration. Avoids re-validation cost of option (b).
**Note for planner:** `RepairPlan` interface lives in a new package (Q-05). Executor consumes it via a new `executeRepairTasks(repairPlan, ctx): Promise<ExecutionRunResult>` entry point on the executor service. `dependentTaskIds` is computed by the loop (using Q-03's `computeRepairSubgraph`) and passed to the executor so the executor doesn't need plan-graph awareness. RepairPlan is persisted as `runs/{id}/review/iter-{N}/repair-plan.json` (Q-17).
**Status:** Decided.

### Q-05 — RepairPlan authorship
**Decision:** New `@protostar/repair` package. Pure transform: takes `{ mechanical: ReviewGate, model?: ModelReviewResult, plan: AdmittedPlanExecutionArtifact, attempt }` and returns `RepairPlan`. v0.1 implementation is a straightforward fan-in (collect findings + critiques, group by `planTaskId`, attach). Phase 8/later layers policy on top (which critiques are repairable vs blocking, deduplication across judges).
**Rationale:** Single point of authorship that's *not* the review package — review remains a verdict-emitter, not a plan-author. Pure-transform package is testable in isolation (no executor, no LM Studio). Sets up the seam for Phase 8 to evolve repair *policy* without touching review or execution.
**Note for planner:** New workspace `packages/repair/`. Exports `synthesizeRepairPlan(input): RepairPlan` and the `RepairPlan` / `RepairTaskInput` types. Depends on `@protostar/review` (for `ReviewGate`/`ReviewFinding`/`JudgeCritique` types), `@protostar/planning` (for `AdmittedPlanExecutionArtifact`). No fs imports. Add to `pnpm-workspace.yaml`, root `tsconfig.json` references, and `verify` script.
**Status:** Decided.

### Q-06 — Critique propagation into adapter retry
**Decision:** Append critiques to the adapter prompt via a structured `repairContext` field on the task input passed to `adapter.execute`. Field shape: `repairContext?: { previousAttempt: AdapterAttemptRef, mechanicalCritiques: ReviewFinding[], modelCritiques?: JudgeCritique[] }`.
**Rationale:** Typed, testable, and evidenced — the adapter sees the critiques as data, not as opaque prompt text. Pairs with Phase 4 Q-12's parse-reformat retry without conflict (different `retryReason` taxonomy: `'transient' | 'parse-reformat' | 'repair'`). Plan/task definitions stay immutable across iterations; the `repairContext` is per-call, attached at executor → adapter dispatch time.
**Note for planner:** Phase 4's `AdapterContext` (`ctx`) gains `repairContext?: RepairContext`. Adapter prompt template adds a "Previous attempt failed:" section when present. Journal entry on a repair attempt includes `retryReason: 'repair'` and an `evidenceArtifact` pointing at the matching `repair-plan.json`. Test: stub adapter that records `ctx.repairContext` on each call; assert iteration 2 receives the iteration-1 critiques.
**Status:** Decided.

## Mechanical Review Surface (LOOP-01)

### Q-07 — Build + lint check execution
**Decision:** Hybrid — a new `@protostar/mechanical-checks` adapter (sibling to `@protostar/lmstudio-adapter`) is invoked by the loop *between* execution-and-review. The mechanical-checks adapter runs configured commands (`pnpm verify`, `pnpm lint`) inside the workspace via Phase 3's `repoSubprocessRunner` and emits structured `MechanicalCheckResult` evidence. The review package consumes that evidence — review stays a pure inspector.
**Rationale:** Clean separation of concerns. Review keeps zero subprocess dependency; the adapter pattern is reusable for non-cosmetic archetypes (later phases). Keeps the loop linear: `executor → mechanical-checks adapter → review (mechanical) → model reviewer → repair`. Phase 4's adapter contract already supports this (streaming, evidence capture, retry semantics) — no new contract shape needed.
**Note for planner:** New workspace `packages/mechanical-checks/`. Exports `createMechanicalChecksAdapter(config): ExecutionAdapter` whose `execute(task, ctx)` runs the configured commands (build, lint, optionally typecheck) sequentially and yields `token` events for stdout/stderr plus a `final` event with structured exit-code-per-command. Adapter consumes Phase 3's `AuthorizedSubprocessOp`. Configuration source: `factory-config.json` (`mechanicalChecks: { commands: Array<{ id, argv, cwd? }> }`); defaults derived from archetype (cosmetic-tweak ⇒ `pnpm verify` + `pnpm lint`). Review consumes `MechanicalCheckResult` plus the existing per-task `evidence.json` to produce findings (build-failure, lint-failure, ac-uncovered, etc.).
**Status:** Decided.

### Q-08 — `diff-touches-≤1-file` cosmetic enforcement
**Decision:** Both — execution-time per-task check (cap each task's `RepoChangeSet` at 1 file when archetype is `cosmetic-tweak`) **and** review-time run-level check (assert run-level diff total ≤1 file). Two layers of defense.
**Rationale:** Smallest blast radius for the per-task check (catches an offending diff before it lands in the workspace, saves wasted execution); review-time check is the canonical authority that survives any executor-side bypass. Phase 4 Q-19's run-bail-on-apply-failure dovetails — a per-task violation surfaces as adapter-failed, no apply happens. Admission-only (option c) is insufficient as noted; adapter output can violate even when plan is conformant.
**Note for planner:** Per-task check lives in `@protostar/repo` (or as an adapter post-processor) — `applyChangeSet` rejects with a typed reason `'cosmetic-archetype-multifile'` when the change set touches >1 distinct path under `archetype === 'cosmetic-tweak'`. Run-level check lives in `@protostar/mechanical-checks`: compute `git diff --name-only base..head` (via `isomorphic-git` from Phase 3), assert count ≤1, emit `MechanicalCheckResult` finding with `kind: 'cosmetic-archetype-violation'` listing all touched files. Both checks key off `archetype` from the confirmed intent.
**Status:** Decided.

### Q-09 — AC-presence definition
**Decision:** Each AC must have a matching test ref recorded in the run evidence. Plan tasks declare `acceptanceTestRefs: Array<{ acId, testFile, testName }>`; mechanical review verifies the test file exists in the run's diff and the test name is present in the build/test output.
**Rationale:** Tightest contract — forces planner to pair ACs with tests at admission. Avoids the regex-mention loophole of option (b) and the indirection of option (c). Aligns with Phase 4 Q-09 (AC presence in plan) and the dark-factory rule that policy is structural, not heuristic.
**Note for planner:** Plan-schema addition (Phase 5 owns the bump): `task.acceptanceTestRefs?: Array<{ acId: string, testFile: string, testName: string }>` (optional on individual tasks; required at plan level — every AC declared on confirmed intent must be covered by ≥1 task's `acceptanceTestRefs`). Admission rule (Phase 1 update): reject plans whose union of `acceptanceTestRefs` doesn't cover every `intent.acceptanceCriteria[i].id`. Mechanical review check: for each `acceptanceTestRef`, assert (a) `testFile` appears in the run's diff name list, (b) `testName` appears in build/test stdout (via mechanical-checks adapter parsing). Findings: `ac-uncovered` (severity major, repairable) per missing AC.
**Status:** Decided.

## Model Review Seam (LOOP-02, prep for Phase 8)

### Q-10 — Model-review interface in v0.1
**Decision:** Minimal panel-of-one stub: a single local LM Studio judge (Qwen3-80B per dark-factory lock) wired now via a new `@protostar/qwen-judge-adapter` (or extension to `@protostar/lmstudio-adapter` — planner picks). Phase 5 ships a real one-judge implementation; Phase 8 expands to N=2 panel + consensus math without changing the loop seam.
**Rationale:** End-to-end real model signal in v0.1, validating the seam against a real adapter rather than a passthrough. Cosmetic-tweak runs benefit from one judge's input. Yes, slight scope expansion vs strict interface-only — but the alternative (option a) means v0.1 ships without ever exercising the model-review path, hiding integration bugs until Phase 8.
**Note for planner:** `ModelReviewer` interface: `(input: ModelReviewInput) => Promise<ModelReviewResult>` where `ModelReviewInput = { admittedPlan, executionResult, mechanicalGate, diff, repairContext? }` and `ModelReviewResult = { verdict: ReviewVerdict, critiques: readonly JudgeCritique[] }`. v0.1 impl: single Qwen3-80B call via LM Studio. Adapter shares HTTP/SSE/preflight machinery with the coder adapter (Phase 4 Q-09 to Q-13). New `factory-config.json` field: `adapters.judge: { provider: 'lmstudio', baseUrl, model, apiKeyEnv }` with separate model id (Qwen3-80B). Preflight (Q-13) extends to verify both coder and judge models loaded. Seam: Phase 8 swaps the single-judge implementation for `N`-of-`M` panel without touching the loop.
**Status:** Decided.

### Q-11 — Critique capture format
**Decision:** Structured `JudgeCritique` with rubric scores + free-text rationale: `{ judgeId: string, model: string, rubric: Record<string, number>, verdict: 'pass'|'repair'|'block', rationale: string, taskRefs: readonly string[] }`. Rubric keys are open-ended for v0.1; a stable rubric vocabulary lands in Phase 8.
**Rationale:** Strongest extensibility for Phase 8's consensus math (rubric scores → numeric aggregation). Free-text rationale gives operators auditable "why" without forcing a closed taxonomy yet. Discriminated union (option c) is over-strict for a seam that Phase 8 will reshape.
**Note for planner:** Type lives in `@protostar/review` (or a new `@protostar/judge-types` if cycles arise — planner picks). `JudgeCritique` is a stable wire-format type — bump-aware. Add to `runs/{id}/review/iter-{N}/model-result.json` schema. Test: panel-of-one returns one `JudgeCritique`; panel of N returns N (Phase 8 forward-compat).
**Status:** Decided.

## Budget & Exhaustion (LOOP-04, LOOP-06)

### Q-12 — `maxRepairLoops` source-of-truth
**Decision:** Capability envelope. New field `budget.maxRepairLoops: number` (default 3, max enforced at admission), signed in ConfirmedIntent. Mirrors Phase 4 Q-14/Q-15/Q-18.
**Rationale:** Tamper-evident. Operator can override per-intent. Single source of truth for budget knobs (already clustered in `budget` namespace). No file/envelope conflict.
**Note for planner:** Capability-envelope schema bump (1.3.0 → 1.4.0): add `budget.maxRepairLoops: number` (default 3). Re-sign tests touched. Loop reads from `confirmedIntent.capabilityEnvelope.budget.maxRepairLoops`. Hardcoded review-package default (`maxRepairLoops?: number` arg today) is removed — envelope is the only source.
**Status:** Decided.

### Q-13 — Budget sharing semantics
**Decision:** Single loop counter, but adapter retries (Phase 4 Q-14's `adapterRetriesPerTask`) nest under it. Worst-case model-call count = `maxRepairLoops × tasksInRepairSubgraph × adapterRetriesPerTask`. Predictable upper bound on cost.
**Rationale:** Hierarchical envelope: outer loop counts repair iterations; inner adapter counts transient/parse-reformat retries within a single attempt. Operator tuning surface stays small (two knobs, both already in envelope). Cleaner than two independent loop counters.
**Note for planner:** Document the cost-bound formula in CONCERNS / planner notes. Loop iteration N+1 only fires when iteration N's mechanical *or* model returned non-pass *and* `attempts < maxRepairLoops`. Adapter-side retries do not consume the loop budget; loop-side retries do not consume the adapter budget. Test: configure `maxRepairLoops=2, adapterRetriesPerTask=4`; assert ≤2 repair iterations and ≤4 adapter calls per task per iteration.
**Status:** Decided.

### Q-14 — Block-verdict evidence shape
**Decision:** Single `runs/{id}/review/review-block.json` with full iteration history, all critiques (mechanical + model), final diff URI, exhaustion reason. Schema: `{ runId, planId, status: 'block', reason: 'budget-exhausted' | 'critical-finding' | 'mechanical-block' | 'model-block', iterations: ReviewIteration[], finalDiffArtifact: StageArtifactRef, exhaustedBudget: { maxRepairLoops, attempted } }`.
**Rationale:** One artifact, easy to ship in Phase 7 PR body if a block escalates to operator review. Captures LOOP-06's "all judge critiques captured" requirement explicitly. Iteration JSONL (option b) is also kept (Q-17), but the block summary is the primary fast-path artifact.
**Note for planner:** Written by the loop on terminal block. Co-exists with per-iteration files (Q-17) — block file is a roll-up summary, not the source of truth. `reason` discriminator: `'budget-exhausted'` (loop hit `maxRepairLoops`), `'critical-finding'` (any iteration's mechanical produced `critical` severity), `'mechanical-block'` / `'model-block'` (verdict explicitly `block`). Test: budget exhaustion → block with `reason: 'budget-exhausted'` and `iterations.length === maxRepairLoops + 1`.
**Status:** Decided.

## Final Gate & Delivery Contract (LOOP-05)

### Q-15 — ReviewDecision artifact shape
**Decision:** Both — JSON artifact `runs/{id}/review/review-decision.json` *and* a branded `DeliveryAuthorization` returned by the loop on success. Belt + suspenders, mirroring Phase 1's `ConfirmedIntent` (file + brand) pattern.
**Rationale:** File is the durable evidence the operator inspects post-hoc; brand is the type-level enforcement that prevents code paths from skipping the gate. Phase 7 reads the file *and* requires the brand at the boundary. Operator can re-validate the file independently to mint a fresh `DeliveryAuthorization` (e.g., on resume from snapshot).
**Note for planner:** Artifact schema: `{ runId, planId, mechanical: 'pass', model: 'pass' | 'skipped', authorizedAt: string, finalIteration: number, finalDiffArtifact: StageArtifactRef, signature?: string }`. Branded type: `type DeliveryAuthorization = { __brand: 'DeliveryAuthorization', runId: string, decisionPath: string }`. Minted by `runReviewRepairLoop` on `approved`; re-minted by `loadDeliveryAuthorization(decisionPath): DeliveryAuthorization | null` (validates file then brands). Note: `model: 'skipped'` is allowed when the model-reviewer interface is the explicit passthrough mode (not v0.1 default per Q-10, but supported for testing) — Phase 7 must not block on `'skipped'`. Actually, re-reading LOOP-05 ("only pass from both"): require `model: 'pass'` strictly; `'skipped'` is rejected at the brand-mint boundary. Lock this strictness.
**Status:** Decided.

### Q-16 — Delivery refusal layer
**Decision:** Type-level — Phase 7's delivery functions only accept `DeliveryAuthorization` (the brand from Q-15). Compile-time enforcement; no runtime check needed beyond brand minting.
**Rationale:** Strongest static guarantee, symmetric with Phase 1's `ConfirmedIntent` and Phase 2's `Authorized*Op` brands. Phase 7's `createGitHubPrDeliveryPlan(authorization: DeliveryAuthorization, ...)` cannot be called without a passing loop result. No bypass possible — even a misconfigured caller fails to compile.
**Note for planner:** Phase 7 plan must reflect this — `createGitHubPrDeliveryPlan` and any future `executeDelivery` accept `DeliveryAuthorization` as a required first argument. Test: type-level negative — calling `createGitHubPrDeliveryPlan` without the brand is a `@ts-expect-error` line in `delivery.contract.ts`.
**Status:** Decided.

## Persistence & Lifecycle (LOOP-06, prep for Phase 9)

### Q-17 — Review iteration storage layout
**Decision:** Per-iteration directory: `runs/{id}/review/iter-{N}/` containing `mechanical-result.json`, `model-result.json` (when present), `repair-plan.json` (when generated). Plus `runs/{id}/review/review.jsonl` (lifecycle events, Q-18) and the terminal artifacts `review-block.json` (on block) or `review-decision.json` (on approve).
**Rationale:** Easy to grep, easy to display in Phase 9 `inspect`. Directory bloat is bounded (`maxRepairLoops + 1` directories max). Per-iteration files are diff-friendly and atomic-write-safe (tmp+rename per file). The flat alternative spreads iteration boundaries across filenames; the per-dir layout makes "what happened in iteration 2?" a one-`ls`.
**Note for planner:** Loop writes per-iteration files at iteration end (after mechanical + model + repair-plan synthesis or terminal verdict). Tmp+rename per file. Phase 9 `inspect` reads `review.jsonl` for chronology, drills into `iter-{N}/` for detail. Test: golden-fixture loop run → assert directory structure matches expected layout per attempt count.
**Status:** Decided.

### Q-18 — Review lifecycle events
**Decision:** Yes — separate `ReviewLifecycleEvent` union, written to `runs/{id}/review/review.jsonl` (append-only JSONL, mirrors Phase 4 execution journal).
**Rationale:** Symmetric with Phase 4 execution. Phase 9 `inspect` and Phase 8 panel debugging benefit. Coupling to execution's event union (option b) would force every review change to touch execution exports — wrong direction.
**Note for planner:** Event union: `{ kind: 'review-iteration-started', runId, attempt, at } | { kind: 'mechanical-verdict', runId, attempt, verdict, findingsCount, at } | { kind: 'model-verdict', runId, attempt, verdict, judgeIds, at } | { kind: 'repair-plan-emitted', runId, attempt, repairTaskIds, at } | { kind: 'loop-approved', runId, finalAttempt, decisionUri, at } | { kind: 'loop-blocked', runId, reason, finalAttempt, blockUri, at } | { kind: 'loop-budget-exhausted', runId, attempted, blockUri, at }`. Append-and-fsync each event before durable artifact writes (mirror Phase 4 Q-02 ordering). Type exported cleanly so Phase 9 can `switch` exhaustively.
**Status:** Decided.

### Claude's Discretion
- Exact rubric vocabulary for `JudgeCritique.rubric` (Q-11) — open keys for v0.1; Phase 8 will lock a stable schema once consensus math is wired.
- Whether the Qwen3-80B judge adapter (Q-10) is its own package or extends `@protostar/lmstudio-adapter` — planner picks based on shared-HTTP-client cost vs package-boundary clarity.
- Exact subprocess command list for the mechanical-checks adapter (Q-07) — defaults proposed (`pnpm verify` + `pnpm lint`); `factory-config.json` overridable.
- AC-test parsing strategy for `testName` presence (Q-09) — likely `node:test` reporter output regex; planner verifies fixture coverage.
- Tmp+rename atomicity guarantees on JSON files inside `iter-{N}/` (Q-17) — same pattern as Phase 4's snapshot.

</decisions>

<specifics>
## Specific Ideas

- **Brand-mint asymmetry with Phase 1/2:** `DeliveryAuthorization` is minted *only* on the loop-approved path; there is no "raw" or "candidate" form. Mirror Phase 1's `ConfirmedIntent` precedent — minting is an authority event, not a constructor.
- **Three-package shape for Phase 5:** `@protostar/review` (loop owner + mechanical findings logic), `@protostar/repair` (pure transform → RepairPlan), `@protostar/mechanical-checks` (subprocess-driven adapter). Plus optionally `@protostar/qwen-judge-adapter` if planner extracts from `lmstudio-adapter`. Each is single-purpose per AGENTS.md.
- **Capability-envelope bump cluster:** Q-12 (`budget.maxRepairLoops`) + Q-09 plan-schema addition (`task.acceptanceTestRefs`) + Phase 1 admission rule for AC coverage. One coordinated bump (1.3.0 → 1.4.0).
- **Critique propagation discipline (Q-06):** structured field on `ctx`, not raw prompt mutation by adapter. Symmetric with Phase 4's "adapter is a single source of truth for what bytes the model saw" posture (Phase 4 Q-06's two-hash dance).
- **Loop counter cost-bound (Q-13):** worst case `maxRepairLoops × |repairSubgraph| × adapterRetriesPerTask` model calls per run. Document this in CONCERNS so operators can reason about a stuck-loop blow-up budget.
- **Strict pass/pass at brand-mint (Q-15):** even when the model-reviewer is the passthrough stub, brand minting requires explicit `model: 'pass'`. The passthrough returns `verdict: 'pass'` deterministically — `'skipped'` is reserved for an explicit "model review unavailable" path that we do not enable in v0.1.

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Roadmap & requirements
- `.planning/ROADMAP.md` §"Phase 5 — Review → Repair → Review Loop" — goal, requirements, success criteria
- `.planning/REQUIREMENTS.md` §"Phase 5" — LOOP-01 through LOOP-06 verbatim text

### Prior-phase locks (must not break)
- `.planning/phases/01-intent-planning-admission/01-CONTEXT.md` — branded `ConfirmedIntent`, `AdmittedPlan`, intent acceptance criteria carriage
- `.planning/phases/02-authority-governance-kernel/02-CONTEXT.md` — capability envelope shape, signed-intent semantics, `Authorized*Op` brand pattern (template for `DeliveryAuthorization`)
- `.planning/phases/03-repo-runtime-sandbox/03-CONTEXT.md` — fresh-clone-per-run (Q-03 carries iteration boundary), `repoSubprocessRunner` (mechanical-checks consumer), `applyChangeSet` (per-task ≤1-file enforcement seam)
- `.planning/phases/04-execution-engine/04-CONTEXT.md` — Q-01/Q-04 lifecycle event union (Phase 5 emits a parallel one), Q-05 streaming adapter contract (mechanical-checks + judge adapters consume it), Q-09 factory-config.json (Phase 5 extends `mechanicalChecks` + `adapters.judge`), Q-12 parse-reformat retry (independent of repair retry), Q-14 `adapterRetriesPerTask` (nests under Phase 5's `maxRepairLoops`), Q-15 `taskWallClockMs` (per-attempt timeout still applies in repair iterations), Q-19 per-task apply + run-bail-on-apply-failure (mechanical Q-08 per-task ≤1-file gate)

### Project posture
- `.planning/PROJECT.md` — authority boundary (only `apps/factory-cli` + `packages/repo` touch fs; mechanical-checks adapter consumes via Phase 3's authorized subprocess), heterogeneous-local judges (Qwen3-80B for v0.1), domain-first packaging
- `.planning/codebase/CONCERNS.md` §"Stubbed evaluation pipeline" — Phase 5 + Phase 8 collectively retire this stub
- `.planning/codebase/CONCERNS.md` §"Review pile is also un-invoked" — Phase 5 wires the model-review path through the new `@protostar/review` loop (panel orchestration is Phase 8)
- `AGENTS.md` — domain-first packaging (no catch-all); each new Phase 5 package is single-purpose

### Authority + contract surfaces touched
- `packages/review/src/index.ts` — current `runMechanicalReviewExecutionLoop`, `ReviewVerdict`, `ReviewFinding`, `ReviewExecutionLoop*` types (rewriting target)
- `packages/review/src/admitted-plan-input.contract.ts` — type-level pins; Phase 5 keeps the negative pins, adds new positive pin for `DeliveryAuthorization` minting
- `packages/execution/src/index.ts` — `ExecutionLifecycleEvent*` (Phase 5 mirrors with its own union), executor service contract
- `packages/planning/src/index.ts` — `AdmittedPlanExecutionArtifact`, plan-schema (Phase 5 adds `task.acceptanceTestRefs`)
- `packages/policy/src/admission-paths.ts` — admission gates (Phase 5 adds AC-coverage rule)
- `packages/policy/src/archetypes.ts` — `cosmetic-tweak` archetype (Q-08 enforcement keys off this)
- `packages/intent/schema/capability-admission-decision.schema.json` — capability-envelope (Q-12 `maxRepairLoops` bump)
- `packages/repo/src/index.ts` — `applyChangeSet` (Q-08 per-task enforcement seam), `defineWorkspace` trust label
- `packages/delivery/src/index.ts` — Phase 7 contract receives `DeliveryAuthorization` (Q-15/Q-16); Phase 5 declares but Phase 7 implements
- `apps/factory-cli/src/main.ts` — `runFactory` orchestration: replace `runMechanicalReviewExecutionLoop` callsite with `runReviewRepairLoop` + service construction

### External libraries
- LM Studio OpenAI-compatible API (Phase 4 Q-09/Q-13) — judge adapter reuses; verify Qwen3-80B model id presence at preflight

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/review/src/index.ts:149` — `runMechanicalReviewExecutionLoop` shape, iteration accumulator, `repairTaskId` plumbing on findings. Phase 5 extends this into `runReviewRepairLoop`; most internal helpers (verdict derivation, finding factories, artifact refs) survive.
- `packages/review/src/index.ts:128-147` — `createReviewGate` severity→verdict mapping (`critical → block`, any → repair, none → pass). Phase 5 keeps the rule; mechanical-checks findings flow through here.
- Phase 4 streaming adapter contract — both `@protostar/mechanical-checks` and (extracted or extended) judge adapter consume the same `ExecutionAdapter` shape, evidence schema, retry classifier. Zero new contract design needed for those adapters.
- Phase 3 `repoSubprocessRunner` — mechanical-checks adapter's only fs/exec dependency.
- `packages/dogpile-adapter` — structural template for `@protostar/repair` (pure-transform package, no fs). Same shape, different domain.

### Established Patterns
- **Append-only JSONL + per-iteration directory** — Phase 4 journal+snapshot established the JSONL pattern; Phase 5 review.jsonl mirrors. Per-iteration directory is new but symmetric with `runs/{id}/execution/task-{id}/`.
- **Capability-envelope schema bump cluster** — Phase 4 bumped 1.2 → 1.3 with three additions; Phase 5 bumps 1.3 → 1.4 with `maxRepairLoops` + (Phase 1 admission rule update for ACs).
- **Brand minting at the authority kernel boundary** — Phase 1 `ConfirmedIntent`, Phase 2 `Authorized*Op`, Phase 5 `DeliveryAuthorization`. Same posture: branded type only constructible on the authority-approved path; consumed at the I/O package (Phase 7 delivery).
- **Streaming adapter + structured evidence pair** — Phase 4 Q-05/Q-17 evidence.json + transcript.json pattern repeats for both mechanical-checks (`mechanical-result.json` + per-command stdout/stderr files) and judge (`model-result.json` + judge transcript files).
- **TDD via `node:test` against compiled `dist/*.test.js`** — Phase 5 packages follow the same pattern.

### Integration Points
- Plan schema (`packages/planning`) gains `task.acceptanceTestRefs?` (Q-09) and an admission rule for AC coverage at plan level. Phase 1 admission test surface touched.
- Capability-envelope schema (`@protostar/intent`) gains `budget.maxRepairLoops` (Q-12). Schema bump 1.3 → 1.4.
- Adapter `ctx` (`@protostar/execution`) gains `repairContext?: RepairContext` (Q-06). Phase 4 adapter contract extension.
- `apps/factory-cli/src/main.ts` — wires the new services: mechanical-checks adapter, judge adapter, `runReviewRepairLoop` invocation, `DeliveryAuthorization` mint, persisted to `runs/{id}/review/`. Replaces the current `runMechanicalReviewExecutionLoop` call.
- New packages added to `pnpm-workspace.yaml`, `tsconfig.json` references, root `verify` script: `packages/repair/`, `packages/mechanical-checks/`, optionally `packages/qwen-judge-adapter/`.
- Phase 7 (Delivery) is the next downstream consumer — it requires `DeliveryAuthorization` at the type level; `createGitHubPrDeliveryPlan` signature changes in Phase 7 to accept the brand. Phase 5 must export the brand type cleanly.
- Phase 8 (Evaluation) plugs into the model-reviewer seam: replace single Qwen3-80B with N-of-M panel + consensus math without touching `runReviewRepairLoop` shape.
- Phase 9 (Operator surface) consumes `review.jsonl` + `iter-{N}/` artifacts for `inspect`/`status`.

</code_context>

<deferred>
## Deferred Ideas

- **Stable rubric vocabulary for `JudgeCritique.rubric`** — open keys in v0.1; Phase 8 closes the schema with consensus math.
- **N-of-M judge panel + consensus** — Phase 8 work. Phase 5 ships single-judge through the same seam.
- **Repair-policy layer** (which critiques are repairable vs auto-block, deduplication across judges) — `@protostar/repair` ships pure fan-in for v0.1; policy lands in Phase 8 once panel scoring is wired.
- **Per-task `taskWallClockMs` override** (Phase 4 deferred) — repair iterations also use the run-level value; revisit when adapter families with different timing land.
- **Cross-process cancel during a repair iteration** — Phase 9 `protostar-factory cancel`; Phase 5 inherits Phase 4's SIGINT + sentinel-file infra unchanged.
- **`'skipped'` model verdict path** — reserved type-level but not enabled in v0.1 (strict pass/pass at brand-mint per Q-15). Re-enable when an explicit "model review unavailable" mode is needed.
- **Reformat-retry vs repair-retry distinction in journal** — covered by `retryReason` taxonomy expansion (`'transient' | 'parse-reformat' | 'repair'`); ensure analytics in Phase 9 differentiates.
- **AC-test parser per archetype** — v0.1 assumes `node:test` output regex; future archetypes (Phase 6+) may need pluggable parsers.
- **Cost dashboard for the worst-case `maxRepairLoops × subgraph × adapterRetriesPerTask` blow-up** — Phase 9 `status` will display; out of scope here.

</deferred>

---

*Phase: 05-review-repair-loop*
*Context gathered: 2026-04-27*
