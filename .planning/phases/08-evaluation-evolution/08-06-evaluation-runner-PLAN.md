---
phase: 08-evaluation-evolution
plan: 06
type: execute
wave: 4
depends_on: ["08-01", "08-02", "08-03", "08-04", "08-05"]
files_modified:
  - packages/evaluation-runner/src/run-evaluation-stages.ts
  - packages/evaluation-runner/src/run-evaluation-stages.test.ts
  - packages/evaluation-runner/src/index.ts
  - packages/evaluation-runner/src/no-fs.contract.test.ts
  - packages/evaluation/src/create-evaluation-report.ts
  - packages/evaluation/src/create-evaluation-report.test.ts
  - packages/evaluation/src/index.ts
  - packages/evaluation-runner/package.json
  - packages/evaluation-runner/tsconfig.json
autonomous: true
requirements: [EVAL-01, EVAL-02, EVAL-03, EVAL-04, EVOL-01]
must_haves:
  truths:
    - "runEvaluationStages orchestrates: compute mechanical -> invoke evaluation pile (semantic stage) -> if shouldRunConsensus then invoke evaluation pile again with the consensus agent appended -> assemble EvaluationReport via createEvaluationReport -> read prior snapshot via injected snapshotReader -> decide evolution"
    - "snapshotReader is INJECTED (lineageId) => Promise<OntologySnapshot | undefined> — runner does NOT touch fs (Q-20 authority boundary)"
    - "On any pile failure or parse failure, runner returns { refusal: PileFailure } with kind='evaluation' (and class='eval-consensus-block' specifically when the doubly-harsh rule blocks)"
    - "EvaluationStageResult never has verdict='skipped' — when consensus is not required, semantic stage emits verdict='pass' with summary referencing T_CONF (Q-11)"
    - "createEvaluationReport({ runId, mechanical, semantic, consensus? }) is the new pure assembler in @protostar/evaluation (replaces the degraded legacy stub left in place by Plan 08-02)"
    - "@protostar/evaluation-runner static no-fs contract test passes (mirror packages/dogpile-adapter/src/no-fs.contract.test.ts)"
  artifacts:
    - path: packages/evaluation-runner/src/run-evaluation-stages.ts
      provides: "runEvaluationStages orchestrator"
      exports: ["runEvaluationStages", "RunEvaluationStagesInput", "RunEvaluationStagesResult", "SnapshotReader"]
    - path: packages/evaluation/src/create-evaluation-report.ts
      provides: "Pure assembler from per-stage results to EvaluationReport (Q-12)"
      exports: ["createEvaluationReport"]
    - path: packages/evaluation-runner/src/no-fs.contract.test.ts
      provides: "Static walker — bans node:fs / node:path imports in src/ (Q-20)"
  key_links:
    - from: packages/evaluation-runner/src/run-evaluation-stages.ts
      to: packages/dogpile-adapter
      via: "Imports runFactoryPile + buildEvaluationMission + evaluationPilePreset + EVAL_CONSENSUS_AGENT_DEFAULT + ResolvedPileBudget"
      pattern: "runFactoryPile|buildEvaluationMission"
    - from: packages/evaluation-runner/src/run-evaluation-stages.ts
      to: packages/evaluation
      via: "Imports computeMechanicalScores + computeSemanticConfidence + shouldRunConsensus + evaluateConsensus + createEvaluationReport + decideEvolution + createSpecOntologySnapshot"
      pattern: "computeMechanicalScores|evaluateConsensus|decideEvolution"
---

<objective>
Implement the real `runEvaluationStages` orchestrator in `@protostar/evaluation-runner` (Q-20). The runner is the single composition point for the three-stage evaluation: it imports pure helpers from `@protostar/evaluation`, the pile invocation from `@protostar/dogpile-adapter`, and an injected `snapshotReader` for prior-generation lookup.

Also lands the pure `createEvaluationReport` assembler in `@protostar/evaluation` (Q-12 signature) — Plan 08-02 left a **degraded non-throwing stub** at the legacy call site to keep `pnpm run verify` green across Waves 1–4; this plan replaces the stub with the real Q-12 implementation. Plan 08-07 then replaces the factory-cli call site (currently around `apps/factory-cli/src/main.ts:978` — locate via `grep -n 'createEvaluationReport(' apps/factory-cli/src/main.ts` rather than hard-coding the line number).

Per Q-20 + Phase 6 Q-09: runner has ZERO `node:fs` / `node:path` imports. Static contract test added (mirror of `packages/dogpile-adapter/src/no-fs.contract.test.ts`).

Purpose: Plan 08-07's factory-cli wiring shrinks from a multi-step inline orchestration into a single `runEvaluationStages(input)` call. Runtime no-fs contract test in admission-e2e (Plan 08-08) provides defense in depth.
Output: Real orchestrator + report assembler + static no-fs contract; full coverage of mechanical/semantic/consensus paths via fakes.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/08-evaluation-evolution/08-CONTEXT.md
@packages/evaluation/src/index.ts
@packages/evaluation/src/compute-mechanical-scores.ts
@packages/evaluation/src/compute-semantic-confidence.ts
@packages/evaluation/src/should-run-consensus.ts
@packages/evaluation/src/evaluate-consensus.ts
@packages/evaluation/src/create-spec-ontology-snapshot.ts
@packages/evaluation/src/lineage-hash.ts
@packages/evaluation/src/evaluation-pile-result.ts
@packages/dogpile-adapter/src/index.ts
@packages/dogpile-adapter/src/run-factory-pile.ts
@packages/dogpile-adapter/src/evaluation-mission.ts
@packages/dogpile-adapter/src/pile-failure-types.ts
@packages/dogpile-adapter/src/no-fs.contract.test.ts

<interfaces>
<!-- Runner public surface (Q-20). -->

```typescript
// packages/evaluation-runner/src/run-evaluation-stages.ts

import type { ConfirmedIntent } from "@protostar/intent";
import type { AdmittedPlan } from "@protostar/planning";
import type { ReviewGate } from "@protostar/review";
import type {
  ConfiguredModelProvider,
  PileFailure
} from "@protostar/dogpile-types";
// NOTE: ResolvedPileBudget is exported from @protostar/dogpile-adapter (NOT dogpile-types).
// `@protostar/dogpile-adapter` is already a workspace dep per Plan 08-01.
import type { ResolvedPileBudget } from "@protostar/dogpile-adapter";
import type {
  EvaluationReport,
  EvolutionDecision,
  OntologySnapshot,
  MechanicalEvalResult,
  SemanticEvalResult,
  ConsensusEvalResult
} from "@protostar/evaluation";

export type SnapshotReader = (lineageId: string) => Promise<OntologySnapshot | undefined>;

export interface RunEvaluationStagesInput {
  readonly runId: string;
  readonly intent: ConfirmedIntent;
  readonly plan: AdmittedPlan;
  readonly reviewGate: ReviewGate;                    // mechanicalScores threaded by Plan 08-04
  readonly diffNameOnly: readonly string[];
  readonly executionEvidence: {
    readonly buildExitCode?: number;
    readonly lintExitCode?: number;
    readonly stdoutTail?: string;
  };
  readonly archetype: "cosmetic-tweak" | "feature-add" | "refactor" | "bugfix";
  readonly providers: {
    readonly semantic: ConfiguredModelProvider;
    readonly consensus: ConfiguredModelProvider;
  };
  readonly signal: AbortSignal;
  readonly budget: ResolvedPileBudget;
  readonly snapshotReader: SnapshotReader;
  readonly lineageId: string;
  readonly generation: number;
}

export interface RunEvaluationStagesResult {
  readonly report: EvaluationReport;
  readonly evolutionDecision: EvolutionDecision;
  readonly snapshot: OntologySnapshot;
  readonly mechanical: MechanicalEvalResult;
  readonly semantic?: SemanticEvalResult;
  readonly consensus?: ConsensusEvalResult;
  readonly refusal?: PileFailure;          // present iff a stage failed; report.verdict will be 'fail'
}

export async function runEvaluationStages(
  input: RunEvaluationStagesInput
): Promise<RunEvaluationStagesResult>;
```

```typescript
// packages/evaluation/src/create-evaluation-report.ts (Q-12 — real impl)

import type {
  EvaluationReport,
  EvaluationStageResult,
  MechanicalEvalResult,
  SemanticEvalResult,
  ConsensusEvalResult,
  EvaluationVerdict
} from "./index.js";
import { T_CONF } from "./index.js";

export interface CreateEvaluationReportInput {
  readonly runId: string;
  readonly mechanical: MechanicalEvalResult;
  readonly semantic: SemanticEvalResult;
  readonly consensus?: ConsensusEvalResult;
}

export function createEvaluationReport(input: CreateEvaluationReportInput): EvaluationReport;
// Verdict: "pass" iff mechanical.verdict==="pass" AND semantic.verdict==="pass" AND
//   (consensus === undefined OR consensus.verdict === "pass"). Else "fail".
// Each stage emits an EvaluationStageResult with:
//   mechanical: { stage, verdict, score, scores: <4 fields>, summary: "Mechanical (build/lint/diffSize/acCoverage) min=<score>" }
//   semantic: { stage, verdict, score, scores?: per-dim means, summary: "Semantic confidence=<conf>; T_CONF=<T_CONF>" }
//   consensus: only included when input.consensus !== undefined; { stage, verdict, score, scores: dimMeans, summary: "Consensus thresholdsHit: <list>" }
// When consensus is undefined, the stages array has 2 entries (mechanical + semantic). NEVER emits 'skipped' (Q-11).
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: createEvaluationReport real implementation in @protostar/evaluation (Q-12)</name>
  <read_first>
    - packages/evaluation/src/index.ts (after Plan 08-02 — `EvaluationReport`, `EvaluationStageResult`, `MechanicalEvalResult`, `SemanticEvalResult`, `ConsensusEvalResult`, `EvaluationVerdict`, `T_CONF`; the degraded non-throwing legacy stub at the bottom that Plan 08-02 left in place)
    - .planning/phases/08-evaluation-evolution/08-CONTEXT.md Q-11 (no 'skipped') + Q-12 (signature)
    - apps/factory-cli/src/main.ts — locate the legacy `createEvaluationReport({ runId, reviewGate })` call site by `grep -n 'createEvaluationReport(' apps/factory-cli/src/main.ts` (currently around line 978; do not hard-code the line number)
  </read_first>
  <behavior>
    - Real implementation per `<interfaces>` block.
    - Tests (8 cases):
      - All-pass case (mechanical pass + semantic pass + consensus pass) → report.verdict "pass", 3 stages.
      - Mechanical fail → report.verdict "fail", semantic + consensus stages still emitted (we still ran them).
      - Semantic fail → report.verdict "fail".
      - Consensus fail → report.verdict "fail".
      - No consensus (omitted) → 2 stages, report.verdict reflects mechanical + semantic.
      - Mechanical pass + semantic pass + no consensus → "pass".
      - Stage summaries contain the score values (grep-friendly).
      - Report `runId` round-trips from input.
      - **NO** stage in any case has `verdict === "skipped"`: assert via `report.stages.every(s => s.verdict === "pass" || s.verdict === "fail")`.
  </behavior>
  <files>packages/evaluation/src/create-evaluation-report.ts, packages/evaluation/src/create-evaluation-report.test.ts, packages/evaluation/src/index.ts</files>
  <action>
    1. **RED:** Create `packages/evaluation/src/create-evaluation-report.test.ts` with 8 cases. Run; tests fail.
    2. **GREEN:** Create `packages/evaluation/src/create-evaluation-report.ts` per `<interfaces>` shape. Implement the verdict logic and stage assembly:
       ```typescript
       export function createEvaluationReport(input: CreateEvaluationReportInput): EvaluationReport {
         const stages: EvaluationStageResult[] = [
           {
             stage: "mechanical",
             verdict: input.mechanical.verdict,
             score: input.mechanical.score,
             scores: input.mechanical.scores,
             summary: `Mechanical scores: build=${input.mechanical.scores.build}, lint=${input.mechanical.scores.lint}, diffSize=${input.mechanical.scores.diffSize}, acCoverage=${input.mechanical.scores.acCoverage}; min=${input.mechanical.score}`
           },
           {
             stage: "semantic",
             verdict: input.semantic.verdict,
             score: input.semantic.score,
             summary: `Semantic confidence=${input.semantic.confidence.toFixed(3)}; T_CONF=${T_CONF}`
           }
         ];
         if (input.consensus !== undefined) {
           stages.push({
             stage: "consensus",
             verdict: input.consensus.verdict,
             score: input.consensus.score,
             scores: input.consensus.breakdown.dimMeans,
             summary: input.consensus.breakdown.thresholdsHit.length === 0
               ? "Consensus passed all four harsh thresholds"
               : `Consensus thresholdsHit: ${input.consensus.breakdown.thresholdsHit.join(", ")}`
           });
         }
         const verdict: EvaluationVerdict =
           stages.every((s) => s.verdict === "pass") ? "pass" : "fail";
         return { runId: input.runId, verdict, stages };
       }
       ```
    3. Replace the **degraded legacy stub** in `packages/evaluation/src/index.ts` (left over from Plan 08-02 — the non-throwing `createEvaluationReport({ runId, reviewGate })` overload that returns `verdict='fail'` on every stage). Remove the legacy overload entirely; export the real `createEvaluationReport` from `./create-evaluation-report.js` via barrel. The `@deprecated` JSDoc that pointed to Plan 08-07 also goes away.
    4. The legacy call site in `apps/factory-cli/src/main.ts` (currently around `:978`, locate via `grep -n 'createEvaluationReport(' apps/factory-cli/src/main.ts`) calls `createEvaluationReport({ runId, reviewGate: review })`. Removing the legacy overload will BREAK this compilation. Plan 08-07 is the wiring plan that replaces this call site with a `runEvaluationStages` invocation. To keep the repo verify-green during the Wave 4 → Wave 5 transition, this plan MUST update the call site here to satisfy the new Q-12 signature using the inputs already in scope at that point in `main.ts`. **Decision:** at the call site, construct a minimal-but-honest `MechanicalEvalResult` from the existing `reviewGate.mechanicalScores` (added by Plan 08-04) and a placeholder `SemanticEvalResult` whose `verdict='fail'`, `score=0`, `confidence=0`, `judges=[]`, with no `consensus`. Then call `createEvaluationReport({ runId, mechanical, semantic })`. This produces a pessimistic-but-typed report (verdict='fail') consistent with Plan 08-02's degraded-stub semantics and keeps `pnpm run verify` green until Plan 08-07 replaces the whole block with `runEvaluationStages`. Mark the inline construction with a `// TODO(08-07): replace with runEvaluationStages` comment.
    5. Run `pnpm --filter @protostar/evaluation test` and `pnpm run verify`. 8 + existing all green; verify exits 0.
  </action>
  <verify>
    <automated>pnpm --filter @protostar/evaluation test --run create-evaluation-report && pnpm run verify</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c 'export function createEvaluationReport' packages/evaluation/src/create-evaluation-report.ts` is 1
    - 8 test cases green
    - `grep -c '"skipped"' packages/evaluation/src/create-evaluation-report.ts` returns 0
    - Test asserts `report.stages.every(s => s.verdict === 'pass' || s.verdict === 'fail')` for every case
    - Legacy `createEvaluationReport({ runId, reviewGate })` overload from Plan 08-02 is REMOVED: `grep -c 'reviewGate: ReviewGate' packages/evaluation/src/index.ts` returns 0 (no remaining reviewGate-shaped overload)
    - `pnpm --filter @protostar/evaluation build` green
    - `pnpm run verify` green (call site at apps/factory-cli/src/main.ts updated to the new Q-12 signature with degraded-but-typed inputs as a Wave 4 placeholder)
  </acceptance_criteria>
  <done>Real createEvaluationReport pure assembler landed; legacy degraded stub removed; 'skipped' literal absent; call site updated to satisfy the new signature pending Plan 08-07's full wiring.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: runEvaluationStages orchestrator + injected snapshotReader</name>
  <read_first>
    - packages/evaluation-runner/src/index.ts (Plan 08-01 placeholder — to be replaced)
    - packages/dogpile-adapter/src/run-factory-pile.ts (`runFactoryPile`, `PileRunContext`, `PileRunOutcome` — confirm signatures)
    - packages/dogpile-adapter/src/index.ts (`evaluationPilePreset`, `EVAL_CONSENSUS_AGENT_DEFAULT`, `buildEvaluationMission` from Plan 08-05; ALSO confirm `ResolvedPileBudget` is exported here, NOT from `@protostar/dogpile-types`)
    - packages/dogpile-adapter/src/no-fs.contract.test.ts (template for the no-fs contract)
    - packages/admission-e2e/src/dogpile-adapter-no-fs.contract.test.ts (Plan 08-08 will mirror this; just confirm path)
    - packages/evaluation/src/* (all helpers from Plan 08-03 + the new createEvaluationReport from Task 1)
    - .planning/phases/08-evaluation-evolution/08-CONTEXT.md Q-20 (orchestration steps)
  </read_first>
  <behavior>
    - Algorithm:
      1. Compute mechanical: prefer `input.reviewGate.mechanicalScores` (Plan 08-04 producer). If absent (legacy), call `computeMechanicalScores({ ... })` from `@protostar/evaluation`. Build `MechanicalEvalResult`.
      2. Build semantic mission via `buildEvaluationMission(input)` and a `PileRunContext { provider: input.providers.semantic, signal: input.signal, budget: input.budget, onEvent: noop }`.
      3. Call `runFactoryPile(missionForSemantic, ctxForSemantic)`. If outcome is failure → return `{ refusal: outcome.failure, ... }` with a synthetic `EvaluationReport` whose semantic stage verdict is fail and a placeholder consensus omitted.
      4. Parse outcome.output via `parseEvaluationPileResult`. If `ok: false` → return `{ refusal: { kind: "evaluation", class: "pile-schema-parse", sourceOfTruth: "EvaluationResult", parseErrors } }` with synthetic report.
      5. Build `SemanticEvalResult` from parsed `judgeCritiques`: judges = parsed list; score = mean(judge_means); confidence = `computeSemanticConfidence(critiques)`; verdict: pass iff every critique.verdict === "pass" AND mean(judge_means) >= T_CONF (or relax to mean >= 0.5 — confirm in CONTEXT; else use a documented placeholder; the doubly-harsh consensus rule is in Q-09, semantic verdict is the panel's own report).
         - **Decision** (use Claude's discretion since CONTEXT doesn't pin the semantic verdict rule explicitly): semantic.verdict = "pass" iff every critique reports verdict==="pass" AND no critique mean is below T_CONF. Document inline.
      6. If `shouldRunConsensus(semantic)` is FALSE → assemble report via `createEvaluationReport({ runId, mechanical, semantic })` (no consensus). The semantic stage emits verdict "pass" with summary noting confidence ≥ T_CONF.
      7. If TRUE → build a second mission via `buildEvaluationMission` BUT with the consensus AgentSpec appended. (Build a second `evaluationPilePreset`-shaped value where `agents = [...evaluationPilePreset.agents, EVAL_CONSENSUS_AGENT_DEFAULT]`.) Call `runFactoryPile`. Parse. Construct `ConsensusEvalResult` via `evaluateConsensus(consensusCritiques)`. If consensus.verdict === "fail", set `refusal = { kind: "evaluation", class: "eval-consensus-block", breakdown: consensus.breakdown, thresholdsHit: consensus.breakdown.thresholdsHit }`.
      8. Build `report = createEvaluationReport({ runId, mechanical, semantic, consensus })`.
      9. Build `snapshot = createSpecOntologySnapshot(intent)` then overwrite `snapshot.generation` with `input.generation`.
      10. Read `prior = await snapshotReader(lineageId)`. Build `decision = decideEvolution({ current: snapshot, ...(prior !== undefined ? { previous: prior } : {}) })`.
      11. Return `{ report, evolutionDecision: decision, snapshot, mechanical, semantic, consensus, ...(refusal !== undefined ? { refusal } : {}) }`.
    - Tests (10 cases) using a fake `runFactoryPile` (injected via deps, mirroring `RunFactoryPileDeps` precedent in `packages/dogpile-adapter/src/run-factory-pile.ts`):
      - Mechanical pass + semantic high-confidence pass (no consensus) → report.verdict "pass", 2 stages, no refusal.
      - Mechanical pass + semantic LOW confidence pass → consensus invoked; consensus pass → report.verdict "pass", 3 stages.
      - Mechanical fail → report.verdict "fail" but semantic+consensus still attempted (or short-circuit — **decision: still attempt** semantic so the artifact is informative; consensus only when shouldRunConsensus says so).
      - Semantic pile timeout → refusal with class "pile-timeout", kind "evaluation".
      - Semantic JSON.parse failure → refusal with class "pile-schema-parse", sourceOfTruth "EvaluationResult".
      - Semantic returns rubric with unknown key → refusal with pile-schema-parse (parser pushed error).
      - Consensus invoked + thresholdsHit ["meanJudges"] → refusal with class "eval-consensus-block", thresholdsHit listed.
      - snapshotReader returns undefined (no prior) → decideEvolution emits "continue" with reason "No previous ontology snapshot exists yet."
      - snapshotReader returns prior with similar fields → decideEvolution emits "converged" when similarity ≥ threshold.
      - Generation 30 (cap) → decideEvolution emits "exhausted".
    - DI: To make `runFactoryPile` mockable, the runner should accept an optional `deps?: { runFactoryPile: typeof runFactoryPile }`. Default is the imported function. Tests inject a fake.
  </behavior>
  <files>packages/evaluation-runner/src/run-evaluation-stages.ts, packages/evaluation-runner/src/run-evaluation-stages.test.ts, packages/evaluation-runner/src/index.ts</files>
  <action>
    1. **RED:** Create `packages/evaluation-runner/src/run-evaluation-stages.test.ts` with the 10 test cases and a `makeFakeRunFactoryPile(...)` helper. Run; tests fail.
    2. **GREEN:** Create `packages/evaluation-runner/src/run-evaluation-stages.ts` per `<interfaces>` block. Implement steps 1-11. Use `try/catch` around each pile call to map exceptions to `pile-network` failures (defense in depth). The runner is async.
       - **Import note:** `ResolvedPileBudget` is imported from `@protostar/dogpile-adapter`, NOT `@protostar/dogpile-types`. Verify with `grep -n 'export.*ResolvedPileBudget' packages/dogpile-adapter/src/*.ts` before writing the import. The `@protostar/dogpile-adapter` workspace dep is already declared by Plan 08-01.
    3. Replace `packages/evaluation-runner/src/index.ts` placeholder with a real barrel that exports `runEvaluationStages` + the input/output types + `SnapshotReader`.
    4. Update `packages/evaluation-runner/package.json` `dependencies` if Plan 08-01 missed any: must include `@protostar/evaluation`, `@protostar/dogpile-adapter`, `@protostar/dogpile-types`, `@protostar/intent`, `@protostar/planning`, `@protostar/review`. Update `tsconfig.json` references to match.
    5. Run `pnpm --filter @protostar/evaluation-runner build && pnpm --filter @protostar/evaluation-runner test`. 10 + existing all green.
    6. **REFACTOR:** Verify `grep -E 'from ["\x27](node:fs|node:path|fs|path)' packages/evaluation-runner/src/run-evaluation-stages.ts` → zero matches. Same for the entire `src/` tree.
  </action>
  <verify>
    <automated>pnpm --filter @protostar/evaluation-runner build && pnpm --filter @protostar/evaluation-runner test --run run-evaluation-stages</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c 'export async function runEvaluationStages' packages/evaluation-runner/src/run-evaluation-stages.ts` is 1
    - `grep -c 'shouldRunConsensus' packages/evaluation-runner/src/run-evaluation-stages.ts` is at least 1
    - `grep -c 'evaluateConsensus' packages/evaluation-runner/src/run-evaluation-stages.ts` is at least 1
    - `grep -c 'parseEvaluationPileResult' packages/evaluation-runner/src/run-evaluation-stages.ts` is at least 1
    - `grep -c 'createSpecOntologySnapshot' packages/evaluation-runner/src/run-evaluation-stages.ts` is at least 1
    - `grep -c 'decideEvolution' packages/evaluation-runner/src/run-evaluation-stages.ts` is at least 1
    - `grep -c 'snapshotReader' packages/evaluation-runner/src/run-evaluation-stages.ts` is at least 2 (param + invocation)
    - `grep -c 'eval-consensus-block' packages/evaluation-runner/src/run-evaluation-stages.ts` is at least 1
    - `grep -c 'from "@protostar/dogpile-adapter"' packages/evaluation-runner/src/run-evaluation-stages.ts` is at least 1 (ResolvedPileBudget pulled from adapter, not dogpile-types)
    - `grep -c 'ResolvedPileBudget.*from "@protostar/dogpile-types"' packages/evaluation-runner/src/run-evaluation-stages.ts` is 0 (negative — must NOT import from dogpile-types)
    - 10 test cases green
    - `grep -rE 'from ["\x27](node:fs|node:path|fs|path)' packages/evaluation-runner/src/ | grep -v '^#'` returns zero matches
  </acceptance_criteria>
  <done>runEvaluationStages orchestrator wired with injected snapshotReader + fake-pile DI; full mechanical/semantic/consensus/evolution coverage; ResolvedPileBudget imported from the correct package.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Static no-fs contract test for @protostar/evaluation-runner</name>
  <read_first>
    - packages/dogpile-adapter/src/no-fs.contract.test.ts (full file — verbatim template; static walker on src/, bans node:fs, fs, node:path, path; excludes itself by basename)
    - .planning/phases/08-evaluation-evolution/08-CONTEXT.md Q-20 (no-fs invariant + Phase 6 Q-09 contract pattern reference)
  </read_first>
  <behavior>
    - Walks `packages/evaluation-runner/src/` synchronously (no fs imports in test? Yes — node:test imports use the test runtime; the contract test itself is allowed to use node:fs because it's the WALKER, not the package surface — confirm dogpile-adapter precedent).
    - For each `.ts` file in src/ (recursive), reads the source and asserts `from "node:fs"`, `from "node:fs/promises"`, `from "fs"`, `from "node:path"`, `from "path"` patterns are absent.
    - Excludes itself by basename so the walker can use `node:fs` to walk.
    - Test fails the entire suite if any forbidden import is found.
  </behavior>
  <files>packages/evaluation-runner/src/no-fs.contract.test.ts</files>
  <action>
    1. Read `packages/dogpile-adapter/src/no-fs.contract.test.ts` verbatim. Copy its structure into `packages/evaluation-runner/src/no-fs.contract.test.ts`. Update the package name in any docstring/comment from "dogpile-adapter" to "evaluation-runner".
    2. Update the walker root to `packages/evaluation-runner/src/` (relative resolution typically uses `__dirname` or `import.meta.url` — match the source template's idiom).
    3. Confirm exclude-by-basename uses `"no-fs.contract.test.ts"` — same as template.
    4. Run `pnpm --filter @protostar/evaluation-runner test --run no-fs`. Green.
    5. Smoke-test the test BY temporarily inserting an `import { readFile } from "node:fs/promises";` at the top of `run-evaluation-stages.ts`, running the test, confirming it FAILS, then reverting the smoke. Document this verification in the SUMMARY.
  </action>
  <verify>
    <automated>pnpm --filter @protostar/evaluation-runner test --run no-fs</automated>
  </verify>
  <acceptance_criteria>
    - `test -f packages/evaluation-runner/src/no-fs.contract.test.ts` returns 0
    - `grep -c 'node:fs' packages/evaluation-runner/src/no-fs.contract.test.ts` is at least 1 (the banned-pattern list)
    - Test passes against current src/
    - Smoke test (temporarily add an `import { readFile } from "node:fs/promises";` to `run-evaluation-stages.ts` → test fails) is recorded in SUMMARY (revert before commit)
  </acceptance_criteria>
  <done>Static no-fs contract green; smoke-tested.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| factory-cli → runEvaluationStages | Authority boundary (Q-20): runner has no fs; factory-cli does the writes |
| pile output → runner parser | Single-ingress (parseEvaluationPileResult); failures become refusals, never throw |
| snapshotReader (injected) → runner | Reader signature is async + returns undefined for missing chain |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-08-06-01 | Elevation of Privilege | run-evaluation-stages.ts | mitigate | Static no-fs walker + injected snapshotReader. Plan 08-08 adds runtime fs-Proxy contract test. |
| T-08-06-02 | Tampering | createEvaluationReport | mitigate | Pure function; verdict logic unit-tested with truth-table-style cases. |
| T-08-06-03 | Repudiation | runEvaluationStages refusal path | mitigate | Every failure pathway emits a `PileFailure` with full evidence (parseErrors, breakdown, thresholdsHit). |
| T-08-06-04 | Tampering | semantic verdict rule | accept | Documented inline (every critique pass AND mean ≥ T_CONF). Phase 10 calibration may revise. |
</threat_model>

<verification>
- `pnpm --filter @protostar/evaluation test` green
- `pnpm --filter @protostar/evaluation-runner build` green
- `pnpm --filter @protostar/evaluation-runner test` green (run-evaluation-stages + no-fs)
- `pnpm -r build` green
- `pnpm run verify` green
- `grep -rE 'from ["\x27](node:fs|node:path)' packages/evaluation-runner/src/ | grep -v 'no-fs.contract.test.ts'` returns zero matches
</verification>

<success_criteria>
- runEvaluationStages orchestrates all three stages + evolution
- createEvaluationReport real implementation lands (replaces the degraded stub left by Plan 08-02)
- Static no-fs contract test passes
- 10 orchestrator test cases cover every refusal pathway + happy paths + evolution outcomes
- ResolvedPileBudget imported from `@protostar/dogpile-adapter` (NOT `@protostar/dogpile-types`)
</success_criteria>

<output>
Create `.planning/phases/08-evaluation-evolution/08-06-SUMMARY.md` describing the runner algorithm, the DI pattern for `runFactoryPile` + `snapshotReader`, the smoke-tested no-fs contract, AND the resolution of the `ResolvedPileBudget` import path (sourced from `@protostar/dogpile-adapter`).
</output>
