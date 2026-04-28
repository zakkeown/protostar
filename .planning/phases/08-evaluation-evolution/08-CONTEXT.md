# Phase 8: Evaluation + Evolution — Context

**Gathered:** 2026-04-28
**Source:** `08-QUESTIONS.json` (20/20 answered, --power mode)
**Status:** Ready for research + planning

<domain>
## Phase Boundary

Replace stubbed evaluation with real three-stage scoring (mechanical → semantic → consensus) and stand up cross-run ontology evolution. Mechanical stage produces deterministic numeric sub-scores. Semantic stage runs a dedicated `evaluationPilePreset` (separate from review pile) against diff + AC. Consensus stage runs a second judge from a different model family when semantic confidence is low and applies a doubly-harsh pass rule (no weak judge AND no weak dimension). Evolution persists per-run **spec** snapshots into a per-run + jsonl-indexed chain, advances generation across runs, and feeds prior-generation summary into the next run's planning mission. Spec/plan refinement runs by default; code evolution requires explicit operator opt-in.

**Blast radius:** First real model variability in the evaluation/scoring path (semantic + consensus). Misconfigured rubric or harsh-rule math produces silent under-blocks (false positives shipped) or runaway repair loops (false negatives). Evolution introduces persistent cross-run state — a buggy lineage write can corrupt future runs. Stub removal is a public-surface schema change to `evaluation-report.json`.

**Requirements:** EVAL-01, EVAL-02, EVAL-03, EVAL-04, EVOL-01, EVOL-02, EVOL-03.

</domain>

<carried_forward>
## Locked from Prior Phases / Constraints

- **Phase 6 Q-14 (review-pile is ModelReviewer):** Phase 8 swaps model families and adds consensus math without changing the loop seam. Review pile keeps its loop role; the evaluation stage is *separate*.
- **Phase 6 Q-03 (per-AgentSpec provider override):** Heterogeneous-local panel is implemented by setting `provider`/`model` on individual `AgentSpec` entries. No new SDK plumbing required.
- **Phase 6 Q-12/Q-13 (refusal pipe + 6-variant `PileFailure`):** Eval failures slot into the existing pipe via a new `sourceOfTruth = 'EvaluationResult'` discriminator.
- **Phase 6 Q-08 (always persist trace.json):** Evaluation pile invocations follow the same always-on trace policy.
- **Phase 6 Q-07 (run layout):** `runs/{id}/piles/{kind}/iter-{N}/{result.json,trace.json,refusal.json}`. Evaluation pile gets `kind = "evaluation"`.
- **Authority:** Only `apps/factory-cli` and `packages/repo` touch the filesystem. `dogpile-adapter` is network-only (Phase 6 Q-09 contract test must extend to cover the new evaluation-pile path).
- **Heterogeneous-local only:** No cloud judges. All judge calls go through LM Studio via the OpenAI-compatible provider.
- **Archetype scope:** Only `cosmetic-tweak` is wired for v0.1.
</carried_forward>

<decisions>

## 1. Mechanical Eval — Numeric Scores (EVAL-01)

### Q-01 — Mechanical score source
**Decision:** Hybrid. Extend Phase 5 `ReviewGate` with a `mechanicalScores: { build, lint, diffSize, acCoverage }` field; `@protostar/mechanical-checks` becomes the producer; `@protostar/evaluation` only relabels them as an `EvaluationStageResult`.
**Rationale:** Score producer is colocated with finding producer — single source of truth, no parsing duplication, no fs touch in `evaluation`. Costs a small Phase 5 type extension; unblocks Phase 8 cleanly.
**Note for planner:** Add `mechanicalScores` to `ReviewGate` in `packages/review/src/index.ts`. Producer is `packages/mechanical-checks/src/findings.ts` (or a sibling module) — extend to emit numeric sub-scores alongside `ReviewFinding[]`. Phase 5 schema bump on `review-gate.json`. `@protostar/evaluation` imports `ReviewGate` and threads scores into `EvaluationStageResult`.
**Status:** Decided.

### Q-02 — Score dimensions and aggregation
**Decision:** Four sub-scores in `[0,1]` with **min-rule pass**: every dimension must independently meet threshold `T_mech`. Pass iff `min({build, lint, diffSize, acCoverage}) ≥ T_mech`.
**Rationale:** Mirrors the harsher-than-baseline 'high min' aesthetic from EVAL-03, keeping mechanical and consensus stages stylistically aligned. Pessimistic-by-design; matches dark-factory bias toward false-negatives over false-positives.
**Note for planner:** Define `T_mech` as a named constant in `@protostar/evaluation` (proposed: `0.95` to match `ONTOLOGY_CONVERGENCE_THRESHOLD`'s precedent for "strict" defaults). Score formulas:
- `build`: `commandResults.find(id='build').exitCode === 0 ? 1 : 0`
- `lint`: `commandResults.find(id='lint').exitCode === 0 ? 1 : 0`
- `diffSize`: cosmetic-tweak archetype: `diffNameOnly.length <= 1 ? 1 : 0` (binary; matches existing cosmetic-archetype-violation rule). Future archetypes graduate to a graded score.
- `acCoverage`: `(coveredAcCount / totalAcCount)` derived from existing AC-uncovered findings.

Document calibration of `T_mech` as a Phase 10 follow-up.
**Status:** Decided.

### Q-03 — Mechanical stage status mapping
**Decision:** **Breaking change.** Replace `EvaluationStageResult.status` with `verdict + score`. New shape: `{ stage, verdict: 'pass'|'fail'|'skipped', score: number, scores?: Record<string, number>, summary }`.
**Rationale:** Cleanest forward shape; numeric scoring is now first-class. The schema bump is an acceptable cost — `evaluation-report.json` consumers are limited (factory-cli manifest emitter, future Phase 9 inspect).
**Note for planner:** Schema bump on `evaluation-report.json` (current schema lives where Phase 5/6 placed it; planner to confirm). Audit consumers: `apps/factory-cli/src/main.ts` (manifest writer), any Phase 7 delivery references, Phase 9 `inspect` (not yet built — no consumer to update). Add a parameterized contract test in `packages/admission-e2e` to lock the new shape.
**Status:** Decided.

## 2. Semantic Judge (EVAL-02)

### Q-04 — Stage reuses review-pile or new pile?
**Decision:** **New `evaluationPilePreset`.** Add a fourth preset to `dogpile-adapter` (planning / review / execution-coordination / **evaluation**). Mission is distinct: "score this completed run on rubric X across diff + AC" — not a verdict for the loop.
**Rationale:** Review pile's rubric is tuned for block/repair/pass loop verdicts; retrospective scoring needs a different mission and rubric shape. Cleanly separated piles let the review pile stay loop-focused while evaluation pile evolves toward archival/calibration use.
**Note for planner:** Add `evaluationPilePreset` to `packages/dogpile-adapter/src/index.ts` (kind: `"evaluation"`). Two agents: (1) baseline semantic judge (default model from Q-07), (2) consensus judge slot — populated only when consensus is triggered (Q-05/Q-09); for the default path the second `AgentSpec` is conditionally included by factory-cli at invocation time. Mission builder `buildEvaluationMission(intent, plan, diffNameOnly, executionEvidence)` — produces a prompt that asks for numeric `rubric` per dimension on the schema below (Q-06). Output schema: extend `@protostar/evaluation` with `EvaluationPileBody` mirroring `ReviewPileBody.judgeCritiques` but with the fixed 5-dimension rubric. Add `parseEvaluationPileResult` (mirrors `parseReviewPileResult`).
**Status:** Decided.

### Q-05 — Semantic confidence signal
**Decision:** **Confidence = inverse variance across judge mean rubric scores.** Compute each judge's mean across rubric dimensions, then take `1 - variance(judge_means)` (clamped to `[0, 1]`). Below threshold `T_conf` → run consensus.
**Rationale:** Implementable directly from existing JudgeCritique data; aligns with adversarial-multi-model intuition that disagreement (high variance) signals uncertainty. Numeric (vs verdict-unanimity) so it composes with downstream calibration.
**Note for planner:** Pure helper `computeSemanticConfidence(critiques: readonly JudgeCritique[]): number` in `@protostar/evaluation`. Default `T_conf = 0.85` (placeholder — calibration in Phase 10 per Q-18). When semantic stage has only one judge, confidence is undefined → always run consensus. Export `shouldRunConsensus(semantic): boolean` (Q-12 helper).
**Status:** Decided.

### Q-06 — Rubric dimensions
**Decision:** **Five dimensions:** `acMet`, `codeQuality`, `security`, `regressionRisk`, `releaseReadiness`. Each scored `0..1`.
**Rationale:** Mirrors `reviewPilePreset`'s 3-agent split (correctness/security/release-gate) plus quality and regression — gives the evaluation pile a richer signal than the review pile's verdict-rubric while keeping the dimension list fixed across runs (required for cross-run convergence and calibration).
**Note for planner:** Define `EVALUATION_RUBRIC_DIMENSIONS = ['acMet', 'codeQuality', 'security', 'regressionRisk', 'releaseReadiness'] as const` in `@protostar/evaluation`. Mission prompt instructs the model to emit a `rubric` object keyed exactly by these names; parser rejects unknown keys + missing keys. Document v1.0 expansion path (e.g., `performance`, `ergonomics`) as a CONCERNS note.
**Status:** Decided.

### Q-07 — Default semantic judge model
**Decision:** **`Qwen3-Next-80B-A3B-MLX-4bit`** as the baked default for the baseline semantic judge.
**Rationale:** Matches the REQUIREMENTS.md EVAL-02 example. Phase 6 Q-03 still allows operator override per `AgentSpec` via factory-config.json.
**Note for planner:** Default lives in `evaluationPilePreset`'s baseline `AgentSpec` (`{ id: 'eval-baseline', role: 'semantic-judge', model: 'Qwen3-Next-80B-A3B-MLX-4bit', provider: <default lmstudio provider> }`). factory-config.json `evaluation.semanticJudge.{model,baseUrl}` overrides; `--semantic-judge-model` CLI flag is the per-invocation override (Phase 6 mode-resolution pattern).
**Status:** Decided.

## 3. Consensus + Harsh Rule (EVAL-03)

### Q-08 — Second judge model family
**Decision:** **`DeepSeek-Coder-V2-Lite`** (16B-class, code-trained) as the baked default for the consensus judge.
**Rationale:** Different family from Qwen, code-specialized (better signal for diff judging than generalist), modest VRAM. Operator override available via Phase 6 Q-03 mechanism.
**Note for planner:** Consensus `AgentSpec` (`{ id: 'eval-consensus', role: 'consensus-judge', model: 'DeepSeek-Coder-V2-Lite-Instruct-...', provider: <lmstudio> }`). Conditionally included in `evaluationPilePreset.agents` at invocation time only when `shouldRunConsensus(semantic)` is true (avoids loading both models when not needed). factory-config.json `evaluation.consensusJudge.{model,baseUrl}` overrides; `--consensus-judge-model` CLI flag for per-invocation.
**Status:** Decided.

### Q-09 — Harsher-than-baseline rule
**Decision:** **Both — strictest possible.** Consensus passes iff (per-judge harsh AND per-dimension harsh): `mean(judge_means) ≥ T_mean_judges AND min(judge_means) ≥ T_min_judges AND mean(dim_means) ≥ T_mean_dims AND min(dim_means) ≥ T_min_dims`.
**Rationale:** No weak judge AND no weak dimension. Maximum harshness; aligns with dark-factory bias toward false-negatives over false-positives. Four thresholds is overhead but each has a clear meaning.
**Note for planner:** Define four named constants in `@protostar/evaluation`: `T_MEAN_JUDGES`, `T_MIN_JUDGES`, `T_MEAN_DIMS`, `T_MIN_DIMS`. Initial values: all `0.85` (placeholders — calibrated in Phase 10 per Q-18, configurable per Q-18 decision). Pure helper `evaluateConsensus(critiques, thresholds): { verdict, breakdown: { judgeMeans, dimMeans, ... } }` — verdict is `pass` only when all four checks pass, else `fail`. Unit tests cover the 4-way truth table.
**Status:** Decided.

### Q-10 — Consensus failure surface
**Decision:** **Reuse Phase 6 PileFailure taxonomy** via new `sourceOfTruth: 'EvaluationResult'`. Failure variants reuse `pile-timeout | pile-budget-exhausted | pile-schema-parse | pile-network | pile-cancelled` and add **one new variant `eval-consensus-block`** for the harsh-rule blocking case.
**Rationale:** Symmetric with all other refusal evidence; one operator mental model. The harsh-rule block is a real, evidence-bearing failure — adding it to the union keeps semantics clean.
**Note for planner:** Extend `PileFailure` discriminated union in `@protostar/dogpile-adapter` with `eval-consensus-block` variant: `{ class: 'eval-consensus-block', kind: 'evaluation', breakdown: ConsensusBreakdown, thresholdsHit: string[] }`. Extend `sourceOfTruth` enum on the per-stage refusal artifact schema with `EvaluationResult`. `.protostar/refusals.jsonl` index gains evaluation entries — reader stays unchanged. Contract test in `packages/admission-e2e/src/eval-refusal-byte-equality.contract.test.ts` (mirror existing pile-refusal-byte-equality test).
**Status:** Decided.

## 4. Stub Removal (EVAL-04)

### Q-11 — Status `'skipped'`
**Decision:** **Remove `'skipped'` entirely.** `EvaluationStageStatus` becomes `'pass' | 'fail'`. Consensus-not-required emits `verdict: 'pass'` with `summary: "consensus not required (semantic confidence ≥ T_conf)"`.
**Rationale:** Strict EVAL-04 reading; closes the risk-register concern about stubbed evaluation lying in artifacts. Every stage must declare a real verdict. The "didn't run because not needed" case is a legitimate pass.
**Note for planner:** Update the type union in `packages/evaluation/src/index.ts`. Add a contract test in `admission-e2e` asserting that no evaluation-report.json emits `'skipped'`. Combined with Q-03, the new `EvaluationStageResult` shape is `{ stage, verdict: 'pass'|'fail', score: number, scores?: Record<string, number>, summary: string }`.
**Status:** Decided.

### Q-12 — `createEvaluationReport` signature
**Decision:** **Pre-computed + helper.** factory-cli pre-computes per-stage results; `@protostar/evaluation` exports a pure `shouldRunConsensus(semantic): boolean` so factory-cli decides whether to invoke consensus, then assembles the report.
**Rationale:** Best of both — gating logic stays pure and unit-testable in isolation; the package keeps its no-fs / no-I/O posture; factory-cli owns orchestration. Matches existing `evaluation` package authority story.
**Note for planner:** New signature: `createEvaluationReport({ runId, mechanical: MechanicalEvalResult, semantic: SemanticEvalResult, consensus?: ConsensusEvalResult }): EvaluationReport`. New types in `@protostar/evaluation`: `MechanicalEvalResult`, `SemanticEvalResult`, `ConsensusEvalResult` (each `{ verdict, score, scores, breakdown? }`). Export `shouldRunConsensus(semantic: SemanticEvalResult, threshold?: number): boolean` and `evaluateConsensus(critiques, thresholds): ConsensusEvalResult`. factory-cli call site at `apps/factory-cli/src/main.ts:889` becomes a multi-step orchestration: compute mechanical → invoke semantic pile → if `shouldRunConsensus` invoke consensus pile → assemble report.
**Status:** Decided.

## 5. Evolution Snapshots (EVOL-01)

### Q-13 — Snapshot subject
**Decision:** **Spec ontology** (intent + AC, post-clarification, post-admission). Snapshot captures the structure of the *spec* — the artifact that should converge first per Ouroboros framing.
**Rationale:** Closer to PROJECT.md's "Specs and plans evolve before code" framing. Plans naturally vary across runs even with the same spec; spec convergence is the meaningful signal. Plan-vs-plan can be added in v1.0 if needed.
**Note for planner:** Replace the current `createIntentOntologySnapshot(intent)` / `createPlanOntologySnapshot(plan)` pair (apps/factory-cli/src/main.ts:1102–1124) with a single `createSpecOntologySnapshot(intent: ConfirmedIntent): OntologySnapshot` that lifts post-admission AC fields. Snapshot schema is the existing `OntologySnapshot { generation, fields: OntologyField[] }`. The current intra-run intent→plan comparison is replaced with cross-run spec→spec comparison.
**Status:** Decided.

### Q-14 — Snapshot persistence path
**Decision:** **Per-run + chain index.** Snapshot lives at `runs/{id}/evolution/snapshot.json`; a top-level `.protostar/evolution/{lineageId}.jsonl` indexes the chain (append-only, one line per generation: `{ generation, runId, snapshotPath, timestamp }`).
**Rationale:** Symmetric with the existing `.protostar/refusals.jsonl` pattern. Pruning a run still leaves chain history because the index is append-only. Phase 9 OP-08 pruning recipe acts on `runs/{id}/` without orphaning the lineage.
**Note for planner:** Writer lives in `apps/factory-cli` (Q-20: factory-cli does fs). Atomic write of `runs/{id}/evolution/snapshot.json` (tmp+rename). Append a JSONL line to `.protostar/evolution/{lineageId}.jsonl` after snapshot write. Reader walks the JSONL backwards from the latest line to find the previous snapshot's path. Phase 9 inspect surface gets a "lineage" view.
**Status:** Decided.

### Q-15 — Lineage identity
**Decision:** **Operator-supplied `--lineage <id>` flag, defaulting to a hash of the normalized confirmed intent (problem + AC structure).**
**Rationale:** Most ergonomic; default hash gives hands-off lineage continuity for unchanged intents; explicit flag lets operators tie evolved intents into one chain ("--lineage cosmetic-tweak-button-color"). Matches dark-factory autonomy posture.
**Note for planner:** Hash function: stable canonical-JSON of `{ problem, acceptanceCriteria.map(c => ({ id: c.id, statement: c.statement, verification: c.verification })) }` → SHA-256 hex (truncated to 12 chars for readability). Hash function lives in `@protostar/evaluation` (pure). CLI flag `--lineage <id>` in `apps/factory-cli/src/main.ts`. Resolved lineage id is written into the snapshot artifact and the JSONL line. factory-config.json `evolution.lineage` field can also set a default.
**Status:** Decided.

## 6. Evolution → Next Run + Threshold (EVOL-02, EVOL-03)

### Q-16 — What does `continue` produce as input to next run?
**Decision:** **Prior snapshot + decision-summary fed into planning pile mission as context.** Next run's `buildPlanningMission` includes a "previous-generation summary" block: prior snapshot's AC fields + prior `EvolutionDecision.reason` + prior verdict.
**Rationale:** Minimal scope; matches "cosmetic-tweak only" v0.1 reality. Spec/plan refinement happens implicitly via the model seeing prior context — no human-in-the-loop step, no manual delta confirmation. Stays aligned with dark-factory autonomy.
**Note for planner:** Extend `buildPlanningMission(intent: ConfirmedIntent, prior?: PriorGenerationSummary)` in `@protostar/dogpile-adapter`. `PriorGenerationSummary` shape: `{ generation, snapshotFields: OntologyField[], evolutionReason: string, priorVerdict: ReviewVerdict, priorEvaluationVerdict: 'pass'|'fail' }`. factory-cli reads the previous snapshot via the chain index (Q-14) at run start, builds the summary, threads it into the planning mission. Test: identical intent + non-empty prior summary → planning mission text includes the summary block.
**Status:** Decided.

### Q-17 — Operator opt-in for code evolution
**Decision:** **Both — config default + CLI override.** factory-config.json `evolution.codeEvolution: 'opt-in' | 'disabled'` (default `disabled`); CLI flag `--evolve-code` overrides per-invocation.
**Rationale:** Most ergonomic; matches Phase 6 Q-04 mode-resolution pattern (CLI > config > built-in default).
**Note for planner:** Schema additions in `factory-config.schema.json`: `evolution: { codeEvolution: 'opt-in'|'disabled', lineage?: string, convergenceThreshold?: number }`. CLI parser in `apps/factory-cli/src/main.ts` adds `--evolve-code` boolean flag. When code-evolution is disabled, the planning mission's prior-generation summary block (Q-16) is allowed to reference prior AC and prior verdict but explicitly excludes prior code-state hints; when opt-in, factory-cli additionally threads prior-run diff summary into the mission. Document precedence in factory-config.schema.json description fields.
**Status:** Decided.

### Q-18 — Convergence threshold calibration plan
**Decision:** **Make threshold a config field; ship 0.95 default + Phase 10 calibration script.** factory-config.json `evolution.convergenceThreshold` overrides the constant; Phase 10 dogfood produces a calibration script (`pnpm calibrate:convergence`) that recommends a value from observed similarity scores.
**Rationale:** Operator-tunable from day one; calibration is empirical (per PROJECT.md Out of Scope) but the wiring is in place. EVOL-03 closes "the threshold is configurable + calibration plan documented" in Phase 8; the *empirically calibrated number* lands in Phase 10.
**Note for planner:** `ONTOLOGY_CONVERGENCE_THRESHOLD = 0.95` stays as the default constant. `decideEvolution` already accepts `threshold` as input — extend factory-cli to read from `factory-config.json evolution.convergenceThreshold` and thread it in. Add a CONCERNS note in `.planning/codebase/CONCERNS.md` pointing to Phase 10 DOG-04 as the calibration trigger. Calibration script is **out of scope for Phase 8** — only stub the file location: `.protostar/calibration/ontology-similarity.jsonl` (append-only log of `{ runId, lineageId, generation, similarity }` per run with similarity data). Phase 10 ships the script that consumes the log.
**Status:** Decided.

### Q-19 — Generation counter source
**Decision:** **Auto-detect from disk by default; `--generation N` CLI override** for replay/test scenarios.
**Rationale:** Default behavior (auto from chain index — Q-14 JSONL) keeps the dark-factory autonomy posture; the override is the operator escape hatch for replay, testing, and debugging Phase 9 inspect/resume scenarios.
**Note for planner:** factory-cli at run start: read `.protostar/evolution/{lineageId}.jsonl`; if missing → generation 0; else → last line's `generation + 1`. CLI flag `--generation N` overrides. Validation: `--generation` must be `>= 0` and `<= MAX_EVOLUTION_GENERATIONS`. Store the resolved generation on the snapshot artifact and the JSONL line.
**Status:** Decided.

## 7. Authority Boundary + Package Shape

### Q-20 — Where does evaluation read disk?
**Decision:** **New `@protostar/evaluation-runner` adapter package.** Mirror the `dogpile-adapter` split: `@protostar/evaluation` stays pure (types + scoring + threshold helpers); `@protostar/evaluation-runner` orchestrates judge calls (via `dogpile-adapter`) + previous-snapshot reads (via injected reader). factory-cli wires the runner into the loop.
**Rationale:** Highest ceremony but cleanest if Phase 9 needs evaluation-runner reusable from `inspect`/`resume`. Matches the dogpile-adapter / factory-cli authority split that the codebase already uses. Keeps `evaluation` package zero-fs (contract-tested).
**Note for planner:** New workspace `packages/evaluation-runner/`. Surface:
- `runEvaluationStages(input: { runId, intent, plan, reviewGate, mechanicalScores, providers, signal, budget, snapshotReader, lineageId, generation }): Promise<{ report: EvaluationReport, evolutionDecision: EvolutionDecision, snapshot: OntologySnapshot, refusal?: PileFailure }>`
- Internally: invoke evaluation pile (semantic judges + optional consensus judge via `runFactoryPile`), compute scores via `@protostar/evaluation`, read previous snapshot via injected `snapshotReader: (lineageId) => Promise<OntologySnapshot | undefined>`, decide evolution.
- factory-cli at `main.ts:889` shrinks to: build inputs, call `runEvaluationStages`, persist outputs (snapshot, report, evolution-decision, refusal-if-any), append JSONL chain line.
- Adapter MUST NOT import `node:fs`/`node:path` (network + injected-reader only — Phase 6 Q-09 contract test extended to cover this package).
- Contract test: `packages/admission-e2e/src/evaluation-runner-no-fs.contract.test.ts` (mirror dogpile-adapter pattern).
**Status:** Decided.

</decisions>

<canonical_refs>

## Canonical References

Downstream agents (researcher, planner) MUST read these before producing artifacts.

### Roadmap & Requirements (project-level)
- `.planning/ROADMAP.md` — Phase 8 entry (lines 258–270); cross-phase constraints (lines 300–308); risk register row for EVAL-04 (line 314).
- `.planning/REQUIREMENTS.md` — EVAL-01 through EVAL-04 + EVOL-01 through EVOL-03 (lines 99–105); coverage matrix (lines 224–230).
- `.planning/PROJECT.md` — Out-of-Scope items (heterogeneous-local only; no cloud judges; calibration empirical post-0.1; cosmetic-tweak only); core value; authority boundary.

### Phase 8 Code Landmarks
- `packages/evaluation/src/index.ts` — current stubbed `createEvaluationReport`; `measureOntologySimilarity`; `decideEvolution`; `ONTOLOGY_CONVERGENCE_THRESHOLD = 0.95`; `MAX_EVOLUTION_GENERATIONS = 30`. **The file Phase 8 mostly rewrites.**
- `apps/factory-cli/src/main.ts:889–896` — current `createEvaluationReport` + `decideEvolution` call sites.
- `apps/factory-cli/src/main.ts:1102–1124` — current `createIntentOntologySnapshot` / `createPlanOntologySnapshot` (replaced by Q-13's `createSpecOntologySnapshot`).
- `apps/factory-cli/src/main.ts:993–997` — manifest entries for `evaluation-report.json` + `evolution-decision.json` (currently described as "stub").

### Phase 5 / 6 Inputs the Evaluation Stages Consume
- `packages/review/src/index.ts` — `ReviewGate` (extend with `mechanicalScores` per Q-01).
- `packages/review/src/judge-types.ts` — `JudgeCritique { judgeId, model, rubric: Record<string, number>, verdict, rationale, taskRefs }`.
- `packages/review/src/review-pile-result.ts` — `ReviewPileBody` shape (template for `EvaluationPileBody` parser).
- `packages/review/src/review-pile-reviewer.ts` — review-pile-as-ModelReviewer (Phase 6 Q-14 lock); evaluation pile is a *separate* pile, not a replacement.
- `packages/mechanical-checks/src/findings.ts` — `buildFindings`, `MechanicalChecksArchetype`, AC-coverage rule. Producer for Q-01 numeric scores.
- `packages/dogpile-adapter/src/index.ts:94–112` — `reviewPilePreset` (template for `evaluationPilePreset`).
- `packages/dogpile-adapter/src/run-factory-pile.ts` — `runFactoryPile` invocation seam.
- `packages/dogpile-adapter/src/pile-failure-types.ts` — `PileFailure` discriminated union (extend with `eval-consensus-block` per Q-10).
- `packages/dogpile-adapter/src/no-fs.contract.test.ts` — pattern to copy for evaluation-runner no-fs contract test.

### Phase 6 CONTEXT (locked invariants)
- `.planning/phases/06-live-dogpile-piles/06-CONTEXT.md` — Q-03 (per-AgentSpec provider override), Q-07 (run layout), Q-08 (always-on trace), Q-09 (no-fs contract), Q-12/Q-13 (refusal taxonomy + 6-variant `PileFailure`), Q-14 (review-pile is ModelReviewer).

### Refusal Pipe (extension target for Q-10)
- `.protostar/refusals.jsonl` — append-only refusal index (existing pattern; gain `EvaluationResult` entries).
- Per-stage refusal artifact schema (location: planner to confirm; Phase 6 Q-12 extended `sourceOfTruth` enum).

### Constraints (Phase 8 must respect)
- `AGENTS.md` — domain-first packaging (no catch-all packages); evaluation-runner adheres.
- `apps/factory-cli/src/main.ts` — only fs writer; new evaluation-runner injects a reader.
- `packages/dogpile-adapter/` — network-only authority; evaluation pile invocation goes through here.

</canonical_refs>

<code_context>

## Reusable Assets / Patterns

- **Pile preset shape** — `reviewPilePreset` (3 agents, broadcast protocol, budget + termination) is the template; `evaluationPilePreset` follows the same shape with `kind: "evaluation"` and a different mission/rubric.
- **Adapter no-fs contract** — `packages/dogpile-adapter/src/no-fs.contract.test.ts` (static import-graph greps) + `packages/admission-e2e/src/dogpile-adapter-no-fs.contract.test.ts` (runtime fs-Proxy stub). Mirror both for `@protostar/evaluation-runner`.
- **Mode resolution** — Phase 6 Q-04 pattern (CLI > factory-config.json > built-in default) reused for `--lineage`, `--evolve-code`, `--semantic-judge-model`, `--consensus-judge-model`, `--generation`, `evolution.convergenceThreshold`.
- **Refusal artifact pattern** — Phase 6 Q-12 extended `sourceOfTruth` enum + 6-variant `PileFailure` union; Phase 8 adds `EvaluationResult` discriminator + `eval-consensus-block` variant.
- **Atomic writes** — tmp+rename pattern from Phase 6 Q-07; reused for `runs/{id}/evolution/snapshot.json` writes and JSONL chain appends.
- **Provider override** — `AgentSpec.provider` per-agent (Phase 6 Q-03) is the heterogeneous-local mechanism; consumed by `evaluationPilePreset.agents[1]` for the consensus judge.
- **Pure-package authority** — `@protostar/evaluation` keeps zero fs (existing posture, Q-20 reinforces); Phase 2 `createAuthorityStageReader` injectable-reader pattern reused if Q-20's evaluation-runner needs more than a closure.
- **Mission builder** — `buildPlanningMission`, `buildReviewMission` in `packages/dogpile-adapter/src/index.ts` are the templates for `buildEvaluationMission(intent, plan, diffNameOnly, executionEvidence, prior?)`.

## New Surfaces Phase 8 Introduces

- `packages/evaluation-runner/` — new workspace (Q-20).
- `evaluationPilePreset` + `buildEvaluationMission` + `EvaluationPileBody` + `parseEvaluationPileResult` (Q-04, Q-06).
- `EVALUATION_RUBRIC_DIMENSIONS` const (Q-06).
- `MechanicalEvalResult`, `SemanticEvalResult`, `ConsensusEvalResult` types (Q-12).
- `T_MECH`, `T_CONF`, `T_MEAN_JUDGES`, `T_MIN_JUDGES`, `T_MEAN_DIMS`, `T_MIN_DIMS` threshold constants (Q-02, Q-05, Q-09).
- `computeMechanicalScores`, `computeSemanticConfidence`, `shouldRunConsensus`, `evaluateConsensus`, `createSpecOntologySnapshot` pure helpers (Q-01, Q-05, Q-09, Q-12, Q-13).
- `eval-consensus-block` `PileFailure` variant + `EvaluationResult` `sourceOfTruth` discriminator (Q-10).
- `mechanicalScores` field on `ReviewGate` + Phase 5 schema bump (Q-01).
- `evaluation-report.json` schema bump for `verdict + score` shape (Q-03 — breaking).
- `runs/{id}/evolution/snapshot.json` + `.protostar/evolution/{lineageId}.jsonl` artifacts (Q-14).
- `.protostar/calibration/ontology-similarity.jsonl` append-only calibration log (Q-18; consumer script lives in Phase 10).
- CLI flags: `--lineage`, `--evolve-code`, `--generation`, `--semantic-judge-model`, `--consensus-judge-model` (Q-15, Q-17, Q-19, Q-07, Q-08).
- factory-config.json `evolution.{lineage, codeEvolution, convergenceThreshold}` + `evaluation.{semanticJudge, consensusJudge}` fields (Q-15, Q-17, Q-18, Q-07, Q-08).

</code_context>

<deferred_ideas>

## Noted for Later

- **Plan-vs-plan ontology comparison** (alternative to Q-13's spec-only snapshot) — possible v1.0 extension if spec convergence proves insufficient signal.
- **Combined spec + plan composite similarity** (Q-13 option c) — same v1.0 timing.
- **Adaptive judge-panel sizing by blast radius** — already deferred to v1.0 in PROJECT.md Out of Scope; explicitly out of Phase 8.
- **Empirical numeric calibration of all thresholds** (`T_mech`, `T_conf`, `T_MEAN_JUDGES`, `T_MIN_JUDGES`, `T_MEAN_DIMS`, `T_MIN_DIMS`, convergence threshold) — Phase 10 DOG-04 dogfood + `pnpm calibrate:convergence` script.
- **Calibration script implementation** (`pnpm calibrate:convergence`) — Phase 10 deliverable; Phase 8 only stubs the data file location (`.protostar/calibration/ontology-similarity.jsonl`).
- **Additional rubric dimensions** (e.g., `performance`, `ergonomics`) — v1.0 expansion path; document in CONCERNS.
- **Phase 9 `inspect` lineage view** — consumes the Q-14 chain index; designed in Phase 9, not Phase 8.

</deferred_ideas>

<open_questions>
None at this time. All 20 power-mode questions answered; planner has the locks needed to proceed.
</open_questions>
