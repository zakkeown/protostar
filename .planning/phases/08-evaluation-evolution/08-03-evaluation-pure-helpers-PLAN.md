---
phase: 08-evaluation-evolution
plan: 03
type: execute
wave: 2
depends_on: ["08-02"]
files_modified:
  - packages/evaluation/src/compute-mechanical-scores.ts
  - packages/evaluation/src/compute-mechanical-scores.test.ts
  - packages/evaluation/src/compute-semantic-confidence.ts
  - packages/evaluation/src/compute-semantic-confidence.test.ts
  - packages/evaluation/src/evaluate-consensus.ts
  - packages/evaluation/src/evaluate-consensus.test.ts
  - packages/evaluation/src/should-run-consensus.ts
  - packages/evaluation/src/should-run-consensus.test.ts
  - packages/evaluation/src/create-spec-ontology-snapshot.ts
  - packages/evaluation/src/create-spec-ontology-snapshot.test.ts
  - packages/evaluation/src/lineage-hash.ts
  - packages/evaluation/src/lineage-hash.test.ts
  - packages/evaluation/src/index.ts
autonomous: true
requirements: [EVAL-01, EVAL-02, EVAL-03, EVOL-01]
must_haves:
  truths:
    - "computeMechanicalScores(reviewGate, executionResult, archetype) returns the strict 4-field MechanicalEvalResult per Q-02 formulas"
    - "computeSemanticConfidence(critiques) returns 1 - variance(judge_means) clamped to [0,1]; single-judge input returns 0 (always-run-consensus signal per Q-05)"
    - "shouldRunConsensus(semantic, threshold = T_CONF) returns true iff semantic.confidence < threshold"
    - "evaluateConsensus(critiques, thresholds) is the doubly-harsh rule: pass iff ALL FOUR (mean(judgeMeans) >= T_MEAN_JUDGES AND min(judgeMeans) >= T_MIN_JUDGES AND mean(dimMeans) >= T_MEAN_DIMS AND min(dimMeans) >= T_MIN_DIMS); failure breakdown lists thresholdsHit"
    - "createSpecOntologySnapshot(intent: ConfirmedIntent) returns OntologySnapshot with generation: 0 and fields built from acceptanceCriteria.{id,verification,statement} (replaces createIntentOntologySnapshot)"
    - "computeLineageId(intent: ConfirmedIntent) returns first 12 hex chars of SHA-256 over canonical-JSON {problem, acceptanceCriteria.map(c => ({id, statement, verification}))}"
    - "evaluateConsensus has unit tests covering the 4-way truth table (each threshold can fail independently)"
    - "All helpers are pure: no fs, no network, no clock, no random; deterministic outputs"
  artifacts:
    - path: packages/evaluation/src/compute-mechanical-scores.ts
      provides: "MechanicalEvalResult producer (Q-01/Q-02)"
      exports: ["computeMechanicalScores"]
    - path: packages/evaluation/src/compute-semantic-confidence.ts
      provides: "Inverse-variance confidence (Q-05)"
      exports: ["computeSemanticConfidence"]
    - path: packages/evaluation/src/should-run-consensus.ts
      provides: "Consensus gating helper (Q-12)"
      exports: ["shouldRunConsensus"]
    - path: packages/evaluation/src/evaluate-consensus.ts
      provides: "Doubly-harsh consensus rule (Q-09)"
      exports: ["evaluateConsensus", "ConsensusThresholds"]
    - path: packages/evaluation/src/create-spec-ontology-snapshot.ts
      provides: "Spec ontology snapshot from confirmed intent (Q-13)"
      exports: ["createSpecOntologySnapshot"]
    - path: packages/evaluation/src/lineage-hash.ts
      provides: "Default lineage id from intent (Q-15)"
      exports: ["computeLineageId"]
  key_links:
    - from: packages/evaluation/src/evaluate-consensus.ts
      to: packages/evaluation/src/index.ts
      via: "Threshold constants T_MEAN_JUDGES/T_MIN_JUDGES/T_MEAN_DIMS/T_MIN_DIMS"
      pattern: "T_MEAN_JUDGES|T_MIN_JUDGES|T_MEAN_DIMS|T_MIN_DIMS"
    - from: packages/evaluation/src/create-spec-ontology-snapshot.ts
      to: packages/intent (workspace)
      via: "Imports ConfirmedIntent type"
      pattern: "ConfirmedIntent"
---

<objective>
Land all five pure scoring/snapshot helpers in `@protostar/evaluation` as sibling files (no further edits to `packages/evaluation/src/index.ts` beyond barrel re-exports). Each helper is a single-responsibility function with a thorough unit-test matrix.

Covers Q-01/Q-02 (mechanical scoring formula), Q-05 (semantic confidence), Q-09 (4-way consensus truth table), Q-12 (shouldRunConsensus gate), Q-13 (spec snapshot from intent), Q-15 (lineage hash function).

Purpose: Wave 4 (`runEvaluationStages` in 08-06) composes these helpers + the pile invocation. Wave 5 (factory-cli in 08-07) calls `computeLineageId` directly when `--lineage` is absent. Sibling files (vs editing `index.ts`) avoid file collisions and keep tests focused.
Output: Five pure helpers + one barrel re-export; all green; deterministic.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/08-evaluation-evolution/08-CONTEXT.md
@packages/evaluation/src/index.ts
@packages/intent/src
@packages/review/src/judge-types.ts
@packages/review/src/index.ts
@packages/execution/src
@apps/factory-cli/src/main.ts

<interfaces>
<!-- Verbatim helper signatures Wave 4+ depend on. -->

```typescript
// packages/evaluation/src/compute-mechanical-scores.ts
import type { ReviewGate } from "@protostar/review";
import type { MechanicalEvalResult } from "./index.js";

export type MechanicalArchetype = "cosmetic-tweak" | "feature-add" | "refactor" | "bugfix";

export interface MechanicalScoreInput {
  readonly reviewGate: ReviewGate;
  readonly archetype: MechanicalArchetype;
  readonly buildExitCode: number;          // commandResults.find(id='build').exitCode
  readonly lintExitCode: number;           // commandResults.find(id='lint').exitCode
  readonly diffNameOnly: readonly string[];   // changed file paths
  readonly totalAcCount: number;
  readonly coveredAcCount: number;
}

export function computeMechanicalScores(input: MechanicalScoreInput): MechanicalEvalResult;
// Formulas (Q-02):
//   build = buildExitCode === 0 ? 1 : 0
//   lint = lintExitCode === 0 ? 1 : 0
//   diffSize = archetype === "cosmetic-tweak" ? (diffNameOnly.length <= 1 ? 1 : 0) : 1   // future archetypes graduate
//   acCoverage = totalAcCount === 0 ? 1 : (coveredAcCount / totalAcCount)
//   score = min(build, lint, diffSize, acCoverage)
//   verdict = score >= T_MECH ? "pass" : "fail"
```

```typescript
// packages/evaluation/src/compute-semantic-confidence.ts
import type { JudgeCritique } from "@protostar/review";
import { EVALUATION_RUBRIC_DIMENSIONS } from "./index.js";

export function computeSemanticConfidence(critiques: readonly JudgeCritique[]): number;
// Q-05: per-judge mean across rubric dimensions, then 1 - variance(judge_means), clamped to [0,1].
// Single-judge edge case: variance is undefined -> return 0 (forces consensus per Q-05 note).
// Empty critiques: return 0.
```

```typescript
// packages/evaluation/src/should-run-consensus.ts
import type { SemanticEvalResult } from "./index.js";
import { T_CONF } from "./index.js";

export function shouldRunConsensus(semantic: SemanticEvalResult, threshold: number = T_CONF): boolean;
// Q-12: returns semantic.confidence < threshold. Single-judge case: confidence is 0 -> true.
```

```typescript
// packages/evaluation/src/evaluate-consensus.ts
import type { JudgeCritique } from "@protostar/review";
import type { ConsensusEvalResult, ConsensusBreakdown, EvaluationRubricDimension } from "./index.js";
import { EVALUATION_RUBRIC_DIMENSIONS, T_MEAN_JUDGES, T_MIN_JUDGES, T_MEAN_DIMS, T_MIN_DIMS } from "./index.js";

export interface ConsensusThresholds {
  readonly tMeanJudges: number;
  readonly tMinJudges: number;
  readonly tMeanDims: number;
  readonly tMinDims: number;
}

export const DEFAULT_CONSENSUS_THRESHOLDS: ConsensusThresholds = {
  tMeanJudges: T_MEAN_JUDGES,
  tMinJudges: T_MIN_JUDGES,
  tMeanDims: T_MEAN_DIMS,
  tMinDims: T_MIN_DIMS
};

export function evaluateConsensus(
  critiques: readonly JudgeCritique[],
  thresholds: ConsensusThresholds = DEFAULT_CONSENSUS_THRESHOLDS
): ConsensusEvalResult;
// Q-09: doubly-harsh rule.
//   judgeMeans = critiques.map(c => mean(EVALUATION_RUBRIC_DIMENSIONS.map(d => c.rubric[d])))
//   dimMeans = for each dimension d: mean(critiques.map(c => c.rubric[d]))
//   pass iff (mean(judgeMeans) >= tMeanJudges) AND (min(judgeMeans) >= tMinJudges) AND (mean(dimMeansVals) >= tMeanDims) AND (min(dimMeansVals) >= tMinDims)
//   thresholdsHit = names of any failing threshold ("meanJudges", "minJudges", "meanDims", "minDims")
//   score = mean(judgeMeans)  // headline number
//   Empty critiques: throw new Error("evaluateConsensus requires at least one critique")
//   Missing rubric dimension on a critique: throw new Error("evaluateConsensus: critique <judgeId> missing rubric dimension <name>")
```

```typescript
// packages/evaluation/src/create-spec-ontology-snapshot.ts
import type { ConfirmedIntent } from "@protostar/intent";
import type { OntologySnapshot } from "./index.js";

export function createSpecOntologySnapshot(intent: ConfirmedIntent): OntologySnapshot;
// Q-13: replaces createIntentOntologySnapshot. Output:
//   { generation: 0,
//     fields: intent.acceptanceCriteria.map(c => ({ name: c.id, type: c.verification, description: c.statement })) }
// generation field is overwritten by factory-cli from chain index in Plan 08-07.
```

```typescript
// packages/evaluation/src/lineage-hash.ts
import { createHash } from "node:crypto";
import type { ConfirmedIntent } from "@protostar/intent";

export function computeLineageId(intent: ConfirmedIntent): string;
// Q-15: SHA-256 over canonical JSON of:
//   { problem: intent.problem,
//     acceptanceCriteria: intent.acceptanceCriteria.map(c => ({ id: c.id, statement: c.statement, verification: c.verification })) }
// Canonical JSON: keys sorted, no whitespace; use a small canonicalize() helper since `node:crypto` does not enforce it.
// Returns the first 12 hex chars of the digest.
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: computeMechanicalScores + computeSemanticConfidence + shouldRunConsensus</name>
  <read_first>
    - packages/review/src/index.ts (`ReviewGate`, `MechanicalScores` from Plan 08-02; `ReviewVerdict`)
    - packages/review/src/judge-types.ts (`JudgeCritique` shape — `rubric: Record<string, number>`, `verdict`, `judgeId`, `model`)
    - packages/evaluation/src/index.ts (`MechanicalEvalResult`, `SemanticEvalResult`, `EVALUATION_RUBRIC_DIMENSIONS`, `T_MECH`, `T_CONF` from Plan 08-02)
    - .planning/phases/08-evaluation-evolution/08-CONTEXT.md Q-02 (mechanical formulas) + Q-05 (confidence formula) + Q-12 (gate)
  </read_first>
  <behavior>
    - `computeMechanicalScores`:
      - All four scores computed per Q-02 formulas (verbatim from `<interfaces>`).
      - `verdict = score >= T_MECH ? "pass" : "fail"` (where `score = min(...)`).
      - Tests: (a) all-pass case (build=0, lint=0, diff=1 file, 5/5 ACs) → all 4 scores 1, verdict pass; (b) lint-fail case (lint=1) → lint=0, score=0, verdict fail; (c) diff-too-big cosmetic case (2 files) → diffSize=0, verdict fail; (d) partial AC coverage (3/5) → acCoverage=0.6, score=0.6, verdict fail; (e) zero ACs edge case → acCoverage=1.
    - `computeSemanticConfidence`:
      - Tests: (a) single critique with rubric `{acMet:1, codeQuality:1, security:1, regressionRisk:1, releaseReadiness:1}` → returns 0 (single-judge, undefined variance forces always-consensus); (b) two critiques both same scores → variance 0, returns 1.0; (c) two critiques with means 0.8 and 0.4 → variance = 0.04, returns 0.96; (d) empty array → returns 0.
    - `shouldRunConsensus`:
      - Tests: (a) confidence 0.9, threshold 0.85 → false; (b) confidence 0.7, threshold 0.85 → true; (c) confidence 0.85 (boundary) → false (strict less-than).
  </behavior>
  <files>packages/evaluation/src/compute-mechanical-scores.ts, packages/evaluation/src/compute-mechanical-scores.test.ts, packages/evaluation/src/compute-semantic-confidence.ts, packages/evaluation/src/compute-semantic-confidence.test.ts, packages/evaluation/src/should-run-consensus.ts, packages/evaluation/src/should-run-consensus.test.ts</files>
  <action>
    1. **RED:** Create the three `*.test.ts` files with the test matrix from `<behavior>` (5 + 4 + 3 = 12 cases). Run; tests fail (impl files don't exist).
    2. **GREEN:** Create `packages/evaluation/src/compute-mechanical-scores.ts` per `<interfaces>` shape:
       ```typescript
       import type { ReviewGate } from "@protostar/review";
       import type { MechanicalEvalResult } from "./index.js";
       import { T_MECH } from "./index.js";

       export type MechanicalArchetype = "cosmetic-tweak" | "feature-add" | "refactor" | "bugfix";

       export interface MechanicalScoreInput { /* per <interfaces> */ }

       export function computeMechanicalScores(input: MechanicalScoreInput): MechanicalEvalResult {
         const build = input.buildExitCode === 0 ? 1 : 0;
         const lint = input.lintExitCode === 0 ? 1 : 0;
         const diffSize =
           input.archetype === "cosmetic-tweak"
             ? (input.diffNameOnly.length <= 1 ? 1 : 0)
             : 1;
         const acCoverage =
           input.totalAcCount === 0 ? 1 : input.coveredAcCount / input.totalAcCount;
         const score = Math.min(build, lint, diffSize, acCoverage);
         const verdict = score >= T_MECH ? "pass" : "fail";
         return { verdict, score, scores: { build, lint, diffSize, acCoverage } };
       }
       ```
    3. Create `packages/evaluation/src/compute-semantic-confidence.ts`:
       ```typescript
       import type { JudgeCritique } from "@protostar/review";
       import { EVALUATION_RUBRIC_DIMENSIONS } from "./index.js";

       export function computeSemanticConfidence(critiques: readonly JudgeCritique[]): number {
         if (critiques.length < 2) return 0;
         const judgeMeans = critiques.map((c) => {
           const vals = EVALUATION_RUBRIC_DIMENSIONS.map((d) => c.rubric[d] ?? 0);
           return vals.reduce((a, b) => a + b, 0) / vals.length;
         });
         const mean = judgeMeans.reduce((a, b) => a + b, 0) / judgeMeans.length;
         const variance =
           judgeMeans.reduce((acc, v) => acc + (v - mean) ** 2, 0) / judgeMeans.length;
         return Math.max(0, Math.min(1, 1 - variance));
       }
       ```
    4. Create `packages/evaluation/src/should-run-consensus.ts`:
       ```typescript
       import type { SemanticEvalResult } from "./index.js";
       import { T_CONF } from "./index.js";

       export function shouldRunConsensus(
         semantic: SemanticEvalResult,
         threshold: number = T_CONF
       ): boolean {
         return semantic.confidence < threshold;
       }
       ```
    5. Re-export all three from `packages/evaluation/src/index.ts` barrel (`export * from "./compute-mechanical-scores.js"; export * from "./compute-semantic-confidence.js"; export * from "./should-run-consensus.js";`).
    6. Run `pnpm --filter @protostar/evaluation test`. All 12 cases green.
    7. **REFACTOR:** Verify no `node:fs` or network imports in any new file: `grep -E 'from ["\x27](node:fs|node:path|fs|path)["\x27]' packages/evaluation/src/compute-*.ts packages/evaluation/src/should-*.ts` returns zero matches.
  </action>
  <verify>
    <automated>pnpm --filter @protostar/evaluation test --run compute-mechanical-scores --run compute-semantic-confidence --run should-run-consensus</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c 'export function computeMechanicalScores' packages/evaluation/src/compute-mechanical-scores.ts` is 1
    - `grep -c 'export function computeSemanticConfidence' packages/evaluation/src/compute-semantic-confidence.ts` is 1
    - `grep -c 'export function shouldRunConsensus' packages/evaluation/src/should-run-consensus.ts` is 1
    - `grep -c 'T_MECH' packages/evaluation/src/compute-mechanical-scores.ts` is at least 1
    - `grep -E 'from ["\x27](node:fs|node:path)' packages/evaluation/src/compute-*.ts packages/evaluation/src/should-*.ts | grep -v '^#'` returns zero matches
    - All 12 test cases green (5 mechanical + 4 confidence + 3 consensus-gate)
  </acceptance_criteria>
  <done>Three pure helpers + tests green; barrel re-exports added; no fs imports.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: evaluateConsensus with 4-way truth table tests (Q-09)</name>
  <read_first>
    - packages/evaluation/src/index.ts (`ConsensusEvalResult`, `ConsensusBreakdown`, threshold constants from Plan 08-02)
    - packages/review/src/judge-types.ts (`JudgeCritique.rubric`)
    - .planning/phases/08-evaluation-evolution/08-CONTEXT.md Q-09 (verbatim doubly-harsh rule + 4-way truth table requirement)
  </read_first>
  <behavior>
    - `evaluateConsensus(critiques, thresholds)`:
      - Compute `judgeMeans` (per-judge mean across all 5 rubric dims).
      - Compute `dimMeans` (per-dim mean across all judges) — keyed by `EvaluationRubricDimension`.
      - Compute the 4 aggregates: `meanOfJudgeMeans`, `minOfJudgeMeans`, `meanOfDimMeans`, `minOfDimMeans`.
      - `thresholdsHit`: starts empty; push `"meanJudges"` if `meanOfJudgeMeans < tMeanJudges`; same for the other three.
      - `verdict = thresholdsHit.length === 0 ? "pass" : "fail"`.
      - `score = meanOfJudgeMeans` (headline).
      - Throws if `critiques.length === 0`.
      - Throws if any critique is missing any of the 5 dimension keys.
    - **4-way truth table** unit tests (16 cases — all combinations of (each threshold pass|fail)):
      - 1 case where ALL FOUR thresholds pass → verdict "pass", thresholdsHit empty.
      - 4 cases where exactly one threshold fails (×4 dims) → verdict "fail", thresholdsHit has exactly that one entry.
      - 6 cases where exactly two fail.
      - 4 cases where exactly three fail.
      - 1 case where all four fail.
      - Total 16. Each case constructs deterministic critiques that produce predictable means.
    - Also test:
      - `evaluateConsensus([])` throws.
      - Critique missing `acMet` rubric key → throws with that key in the message.
      - Default thresholds (omit second arg) use `DEFAULT_CONSENSUS_THRESHOLDS`.
  </behavior>
  <files>packages/evaluation/src/evaluate-consensus.ts, packages/evaluation/src/evaluate-consensus.test.ts</files>
  <action>
    1. **RED:** Create `packages/evaluation/src/evaluate-consensus.test.ts` with the 16-case truth table + 3 edge cases (19 total). Use a small `makeCritique(judgeId, rubricVals)` helper inside the test to keep cases short. Run; tests fail.
    2. **GREEN:** Create `packages/evaluation/src/evaluate-consensus.ts` with the verbatim shape from `<interfaces>`:
       ```typescript
       import type { JudgeCritique } from "@protostar/review";
       import type {
         ConsensusEvalResult,
         ConsensusBreakdown,
         EvaluationRubricDimension
       } from "./index.js";
       import {
         EVALUATION_RUBRIC_DIMENSIONS,
         T_MEAN_JUDGES,
         T_MIN_JUDGES,
         T_MEAN_DIMS,
         T_MIN_DIMS
       } from "./index.js";

       export interface ConsensusThresholds { /* per <interfaces> */ }
       export const DEFAULT_CONSENSUS_THRESHOLDS: ConsensusThresholds = {
         tMeanJudges: T_MEAN_JUDGES,
         tMinJudges: T_MIN_JUDGES,
         tMeanDims: T_MEAN_DIMS,
         tMinDims: T_MIN_DIMS
       };

       export function evaluateConsensus(
         critiques: readonly JudgeCritique[],
         thresholds: ConsensusThresholds = DEFAULT_CONSENSUS_THRESHOLDS
       ): ConsensusEvalResult {
         if (critiques.length === 0) throw new Error("evaluateConsensus requires at least one critique");
         for (const c of critiques) {
           for (const d of EVALUATION_RUBRIC_DIMENSIONS) {
             if (typeof c.rubric[d] !== "number") {
               throw new Error(`evaluateConsensus: critique ${c.judgeId} missing rubric dimension ${d}`);
             }
           }
         }
         const judgeMeans = critiques.map((c) =>
           EVALUATION_RUBRIC_DIMENSIONS.reduce((s, d) => s + (c.rubric[d] as number), 0) /
           EVALUATION_RUBRIC_DIMENSIONS.length
         );
         const dimMeansEntries = EVALUATION_RUBRIC_DIMENSIONS.map((d) => {
           const mean = critiques.reduce((s, c) => s + (c.rubric[d] as number), 0) / critiques.length;
           return [d, mean] as const;
         });
         const dimMeans = Object.fromEntries(dimMeansEntries) as Record<EvaluationRubricDimension, number>;
         const dimMeanVals = dimMeansEntries.map(([, v]) => v);

         const meanOfJudgeMeans = judgeMeans.reduce((a, b) => a + b, 0) / judgeMeans.length;
         const minOfJudgeMeans = Math.min(...judgeMeans);
         const meanOfDimMeans = dimMeanVals.reduce((a, b) => a + b, 0) / dimMeanVals.length;
         const minOfDimMeans = Math.min(...dimMeanVals);

         const thresholdsHit: string[] = [];
         if (meanOfJudgeMeans < thresholds.tMeanJudges) thresholdsHit.push("meanJudges");
         if (minOfJudgeMeans < thresholds.tMinJudges) thresholdsHit.push("minJudges");
         if (meanOfDimMeans < thresholds.tMeanDims) thresholdsHit.push("meanDims");
         if (minOfDimMeans < thresholds.tMinDims) thresholdsHit.push("minDims");

         const breakdown: ConsensusBreakdown = {
           judgeMeans,
           dimMeans,
           meanOfJudgeMeans,
           minOfJudgeMeans,
           meanOfDimMeans,
           minOfDimMeans,
           thresholds: { tMeanJudges: thresholds.tMeanJudges, tMinJudges: thresholds.tMinJudges, tMeanDims: thresholds.tMeanDims, tMinDims: thresholds.tMinDims },
           thresholdsHit
         };

         const verdict = thresholdsHit.length === 0 ? ("pass" as const) : ("fail" as const);
         const judges = critiques.map((c) => ({
           judgeId: c.judgeId,
           model: c.model,
           rubric: Object.fromEntries(EVALUATION_RUBRIC_DIMENSIONS.map((d) => [d, c.rubric[d] as number])) as Record<EvaluationRubricDimension, number>
         }));
         return { verdict, score: meanOfJudgeMeans, breakdown, judges };
       }
       ```
    3. Re-export from barrel: `export * from "./evaluate-consensus.js";`.
    4. Run tests — all 19 green.
    5. **REFACTOR:** Pull the truth-table generator into a tiny test helper if 16 cases are repetitive. No fs imports verified.
  </action>
  <verify>
    <automated>pnpm --filter @protostar/evaluation test --run evaluate-consensus</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c 'export function evaluateConsensus' packages/evaluation/src/evaluate-consensus.ts` is 1
    - `grep -c 'meanJudges\|minJudges\|meanDims\|minDims' packages/evaluation/src/evaluate-consensus.ts` is at least 4
    - `grep -c 'thresholdsHit' packages/evaluation/src/evaluate-consensus.ts` is at least 2
    - 19 test cases green: `pnpm --filter @protostar/evaluation test --run evaluate-consensus` shows ≥19 it() blocks pass
    - Truth-table coverage verifiable by counting `it("` lines: at least 16 in the truth-table describe block
    - `grep -E 'from ["\x27](node:fs|node:path)' packages/evaluation/src/evaluate-consensus.ts | grep -v '^#'` returns zero matches
  </acceptance_criteria>
  <done>Doubly-harsh consensus rule with full 4-way truth table coverage; pure; no fs.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: createSpecOntologySnapshot + computeLineageId (Q-13, Q-15)</name>
  <read_first>
    - packages/intent/src (locate `ConfirmedIntent` type — likely exported from a confirmed-intent.ts; confirm `acceptanceCriteria[].id`, `.statement`, `.verification` fields exist)
    - apps/factory-cli/src/main.ts:1102-1124 (current `createIntentOntologySnapshot` + `createPlanOntologySnapshot` — to be REMOVED in Plan 08-07; this task creates the replacement helper that lives in `@protostar/evaluation`)
    - .planning/phases/08-evaluation-evolution/08-CONTEXT.md Q-13 (rationale + replacement) + Q-15 (hash function spec)
  </read_first>
  <behavior>
    - `createSpecOntologySnapshot`:
      - Input: `ConfirmedIntent`.
      - Output: `OntologySnapshot { generation: 0, fields: ConfirmedIntent.acceptanceCriteria.map(c => ({ name: c.id, type: c.verification, description: c.statement })) }`.
      - `generation: 0` is a placeholder — Plan 08-07 overwrites it from the chain index.
      - Tests: (a) intent with 3 ACs → 3 fields with `name=id, type=verification, description=statement`; (b) intent with 0 ACs → empty fields array; (c) field ordering preserves input order.
    - `computeLineageId`:
      - Canonical-JSON input: `{ problem: intent.problem, acceptanceCriteria: intent.acceptanceCriteria.map(c => ({ id: c.id, statement: c.statement, verification: c.verification })) }`.
      - Sort object keys alphabetically; no whitespace.
      - SHA-256 hex digest, return first 12 chars.
      - Tests: (a) deterministic — same input twice produces same output; (b) different intent produces different output; (c) reordering AC array CHANGES output (order matters); (d) reordering object keys via the input does NOT change output (canonical sorts); (e) returned string is 12 chars `[0-9a-f]+`.
      - Test (d) construction: pass `{ problem, acceptanceCriteria }` and `{ acceptanceCriteria, problem }` — both should produce the same hash because canonicalization sorts keys.
  </behavior>
  <files>packages/evaluation/src/create-spec-ontology-snapshot.ts, packages/evaluation/src/create-spec-ontology-snapshot.test.ts, packages/evaluation/src/lineage-hash.ts, packages/evaluation/src/lineage-hash.test.ts</files>
  <action>
    1. **RED:** Create both `*.test.ts` files with the cases above (3 + 5 = 8 cases). Tests fail.
    2. **GREEN:** Create `packages/evaluation/src/create-spec-ontology-snapshot.ts` per `<interfaces>` shape. Single readonly map; no clock, no fs.
    3. Create `packages/evaluation/src/lineage-hash.ts`:
       ```typescript
       import { createHash } from "node:crypto";
       import type { ConfirmedIntent } from "@protostar/intent";

       function canonicalize(value: unknown): string {
         if (value === null || typeof value !== "object") return JSON.stringify(value);
         if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
         const obj = value as Record<string, unknown>;
         const keys = Object.keys(obj).sort();
         const parts = keys.map((k) => `${JSON.stringify(k)}:${canonicalize(obj[k])}`);
         return `{${parts.join(",")}}`;
       }

       export function computeLineageId(intent: ConfirmedIntent): string {
         const subject = {
           problem: intent.problem,
           acceptanceCriteria: intent.acceptanceCriteria.map((c) => ({
             id: c.id,
             statement: c.statement,
             verification: c.verification
           }))
         };
         const canonical = canonicalize(subject);
         const hash = createHash("sha256").update(canonical, "utf8").digest("hex");
         return hash.slice(0, 12);
       }
       ```
    4. Re-export from barrel.
    5. Run tests — 8 green.
    6. **REFACTOR:** Confirm `node:crypto` is the ONLY non-workspace import. `node:crypto` is allowed (per Phase 6 / Phase 7 precedent — pure crypto, no fs/network). The Q-20 invariant prohibits fs/path; crypto is fine.
  </action>
  <verify>
    <automated>pnpm --filter @protostar/evaluation test --run create-spec-ontology-snapshot --run lineage-hash</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c 'export function createSpecOntologySnapshot' packages/evaluation/src/create-spec-ontology-snapshot.ts` is 1
    - `grep -c 'export function computeLineageId' packages/evaluation/src/lineage-hash.ts` is 1
    - `grep -c 'createHash' packages/evaluation/src/lineage-hash.ts` is at least 1
    - `grep -c 'sha256' packages/evaluation/src/lineage-hash.ts` is at least 1
    - 8 test cases green
    - Determinism test passes: hash of same intent computed twice is identical
    - Canonical-key-order test passes: hash invariant under input object-key reordering
    - `grep -E 'from ["\x27](node:fs|node:path)' packages/evaluation/src/create-spec-ontology-snapshot.ts packages/evaluation/src/lineage-hash.ts | grep -v '^#'` returns zero matches
  </acceptance_criteria>
  <done>Spec snapshot + lineage hash helpers green; deterministic; canonical JSON.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Judge output → consensus aggregator | Critique rubric data must contain all 5 dims; missing dim throws (no silent zero-fill) |
| Intent → lineage id | Canonical JSON prevents key-order-induced lineage drift |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-08-03-01 | Tampering | evaluate-consensus.ts | mitigate | Missing-dimension throw prevents a critique with `{}` rubric from silently passing all 4 thresholds. |
| T-08-03-02 | Tampering | lineage-hash.ts | mitigate | SHA-256 + canonical JSON: cannot forge a different intent that hashes to the same lineage id without 2^48-class collision search. |
| T-08-03-03 | Repudiation | evaluate-consensus.ts | mitigate | `breakdown` records every input + which threshold failed; full audit trail. |
| T-08-03-04 | Information Disclosure | lineage-hash.ts | accept | 12-char prefix is enough for collision-resistance at our run-volume (Phase 6 dogfood is dozens, not millions). Documented as a convenience truncation. |
</threat_model>

<verification>
- `pnpm --filter @protostar/evaluation test` green (≥39 new test cases — 12 + 19 + 8)
- `pnpm --filter @protostar/evaluation build` green
- All five helpers re-exported via `packages/evaluation/src/index.ts` barrel
- No `node:fs` / `node:path` imports in new files
</verification>

<success_criteria>
- All five pure helpers landed: computeMechanicalScores, computeSemanticConfidence, shouldRunConsensus, evaluateConsensus, createSpecOntologySnapshot, computeLineageId
- 4-way truth table fully covered for evaluateConsensus
- Deterministic + key-order-invariant lineage hashing
- @protostar/evaluation remains pure (no fs, no network); only `node:crypto` introduced
</success_criteria>

<output>
Create `.planning/phases/08-evaluation-evolution/08-03-SUMMARY.md` with the helper signatures + test counts + a note that `createIntentOntologySnapshot` / `createPlanOntologySnapshot` in main.ts:1102-1124 are slated for removal in Plan 08-07.
</output>
