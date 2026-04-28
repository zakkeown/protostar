---
phase: 08-evaluation-evolution
plan: 02
type: execute
wave: 1
depends_on: ["08-01"]
files_modified:
  - packages/evaluation/src/index.ts
  - packages/evaluation/src/types.test.ts
  - packages/review/src/index.ts
  - packages/review/src/mechanical-scores.test.ts
  - packages/dogpile-adapter/src/pile-failure-types.ts
  - packages/dogpile-adapter/src/pile-failure-types.test.ts
  - apps/factory-cli/src/refusals-index.ts
  - apps/factory-cli/src/refusals-index.test.ts
  - packages/lmstudio-adapter/src/factory-config.schema.json
  - packages/lmstudio-adapter/src/factory-config.test.ts
autonomous: true
requirements: [EVAL-01, EVAL-02, EVAL-03, EVAL-04, EVOL-01, EVOL-02, EVOL-03]
must_haves:
  truths:
    - "EvaluationStageStatus is the literal union 'pass' | 'fail' (Q-11 — 'skipped' removed)"
    - "EvaluationStageResult shape is { stage, verdict, score, scores?, summary } (Q-03 BREAKING)"
    - "EVALUATION_RUBRIC_DIMENSIONS is exported as ['acMet','codeQuality','security','regressionRisk','releaseReadiness'] as const (Q-06)"
    - "Threshold constants T_MECH=0.95, T_CONF=0.85, T_MEAN_JUDGES=0.85, T_MIN_JUDGES=0.85, T_MEAN_DIMS=0.85, T_MIN_DIMS=0.85 are exported as named constants from @protostar/evaluation"
    - "MechanicalEvalResult, SemanticEvalResult, ConsensusEvalResult interfaces are exported from @protostar/evaluation (Q-12)"
    - "ReviewGate gains optional readonly mechanicalScores: { build: number; lint: number; diffSize: number; acCoverage: number } (Q-01) — backward compatible (optional)"
    - "PileFailure discriminated union gains a 7th variant: { kind: 'evaluation'; class: 'eval-consensus-block'; breakdown: ConsensusBreakdown; thresholdsHit: readonly string[] } (Q-10)"
    - "PileKind union gains 'evaluation' literal"
    - "PileSourceOfTruth union gains 'EvaluationResult' literal"
    - "RefusalStage in apps/factory-cli/src/refusals-index.ts gains 'pile-evaluation' literal"
    - "factory-config.schema.json gains evaluation.semanticJudge.{model,baseUrl}, evaluation.consensusJudge.{model,baseUrl}, evolution.{lineage?,codeEvolution,convergenceThreshold?} fields with additionalProperties: false everywhere"
    - "evolution.codeEvolution enum is ['opt-in','disabled'] with default 'disabled' (Q-17)"
  artifacts:
    - path: packages/evaluation/src/index.ts
      provides: "EvaluationStageResult new shape, EvaluationStageStatus union, threshold constants, dimensions const, eval-result types"
      exports: ["EvaluationStageStatus", "EvaluationStageResult", "MechanicalEvalResult", "SemanticEvalResult", "ConsensusEvalResult", "EVALUATION_RUBRIC_DIMENSIONS", "T_MECH", "T_CONF", "T_MEAN_JUDGES", "T_MIN_JUDGES", "T_MEAN_DIMS", "T_MIN_DIMS"]
    - path: packages/review/src/index.ts
      provides: "ReviewGate.mechanicalScores extension"
      contains: "mechanicalScores"
    - path: packages/dogpile-adapter/src/pile-failure-types.ts
      provides: "PileFailure 7th variant + EvaluationResult sourceOfTruth + 'evaluation' PileKind"
      contains: "eval-consensus-block"
    - path: apps/factory-cli/src/refusals-index.ts
      provides: "RefusalStage 'pile-evaluation' literal"
      contains: "pile-evaluation"
    - path: packages/lmstudio-adapter/src/factory-config.schema.json
      provides: "evaluation + evolution config blocks"
      contains: "semanticJudge"
  key_links:
    - from: packages/evaluation/src/index.ts
      to: packages/review/src/index.ts
      via: "MechanicalEvalResult ingests ReviewGate.mechanicalScores"
      pattern: "mechanicalScores"
    - from: packages/dogpile-adapter/src/pile-failure-types.ts
      to: apps/factory-cli/src/refusals-index.ts
      via: "Eval-consensus-block surfaces as RefusalStage 'pile-evaluation'"
      pattern: "pile-evaluation"
---

<objective>
Land all pure-type and schema extensions in one wave: every type/const/schema field that downstream Wave 2-5 plans depend on. This is heavy but pure — no runtime logic, no fs, no network.

Covers Q-01 (ReviewGate extension), Q-03 (EvaluationStageResult breaking shape), Q-06 (rubric dims const), Q-09 (4 threshold constants), Q-10 (PileFailure variant + sourceOfTruth + RefusalStage), Q-11 (drop 'skipped'), Q-12 (MechanicalEvalResult/SemanticEvalResult/ConsensusEvalResult types), Q-07/Q-08/Q-15/Q-17/Q-18 (factory-config schema fields).

Purpose: Wave 2 helpers (08-03), Wave 3 adapter (08-05), Wave 4 runner (08-06), and Wave 5 factory-cli wiring (08-07) all type-depend on these. Landing them together prevents "edit packages/evaluation/src/index.ts twice" file collisions across waves.
Output: All types compile; existing consumers updated for the BREAKING `EvaluationStageResult` shape change; existing tests pass; `pnpm run verify` exits 0 (no runtime regression from the degraded `createEvaluationReport` stub).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/phases/08-evaluation-evolution/08-CONTEXT.md
@packages/evaluation/src/index.ts
@packages/review/src/index.ts
@packages/dogpile-adapter/src/pile-failure-types.ts
@apps/factory-cli/src/refusals-index.ts
@packages/lmstudio-adapter/src/factory-config.schema.json
@apps/factory-cli/src/main.ts

<interfaces>
<!-- Verbatim shapes Wave 2+ depend on. -->

```typescript
// packages/evaluation/src/index.ts (additions/replacements)

export type EvaluationStageKind = "mechanical" | "semantic" | "consensus";
// Q-11: 'skipped' removed.
export type EvaluationStageStatus = "pass" | "fail";

// Q-03 BREAKING: replaces { stage, status, summary }.
export interface EvaluationStageResult {
  readonly stage: EvaluationStageKind;
  readonly verdict: EvaluationStageStatus;
  readonly score: number;
  readonly scores?: Readonly<Record<string, number>>;
  readonly summary: string;
}

// Q-06: fixed rubric dimensions.
export const EVALUATION_RUBRIC_DIMENSIONS = [
  "acMet",
  "codeQuality",
  "security",
  "regressionRisk",
  "releaseReadiness"
] as const;
export type EvaluationRubricDimension = typeof EVALUATION_RUBRIC_DIMENSIONS[number];

// Q-02 + Q-05 + Q-09 thresholds (placeholders — calibrated in Phase 10).
export const T_MECH = 0.95 as const;
export const T_CONF = 0.85 as const;
export const T_MEAN_JUDGES = 0.85 as const;
export const T_MIN_JUDGES = 0.85 as const;
export const T_MEAN_DIMS = 0.85 as const;
export const T_MIN_DIMS = 0.85 as const;

// Q-12 result types (helpers in Plan 08-03 produce these).
export interface MechanicalEvalResult {
  readonly verdict: EvaluationStageStatus;
  readonly score: number;
  readonly scores: { readonly build: number; readonly lint: number; readonly diffSize: number; readonly acCoverage: number };
}

export interface JudgePerDimensionScores {
  readonly judgeId: string;
  readonly model: string;
  readonly rubric: Readonly<Record<EvaluationRubricDimension, number>>;
}

export interface SemanticEvalResult {
  readonly verdict: EvaluationStageStatus;
  readonly score: number;          // mean across judges' rubric means
  readonly confidence: number;     // 1 - variance(judge_means), clamped [0,1]
  readonly judges: readonly JudgePerDimensionScores[];
}

export interface ConsensusBreakdown {
  readonly judgeMeans: readonly number[];
  readonly dimMeans: Readonly<Record<EvaluationRubricDimension, number>>;
  readonly meanOfJudgeMeans: number;
  readonly minOfJudgeMeans: number;
  readonly meanOfDimMeans: number;
  readonly minOfDimMeans: number;
  readonly thresholds: { readonly tMeanJudges: number; readonly tMinJudges: number; readonly tMeanDims: number; readonly tMinDims: number };
  readonly thresholdsHit: readonly string[];   // names of any failed threshold
}

export interface ConsensusEvalResult {
  readonly verdict: EvaluationStageStatus;
  readonly score: number;          // meanOfJudgeMeans (chosen as headline)
  readonly breakdown: ConsensusBreakdown;
  readonly judges: readonly JudgePerDimensionScores[];
}
```

```typescript
// packages/review/src/index.ts — ReviewGate extension (Q-01)

export interface MechanicalScores {
  readonly build: number;
  readonly lint: number;
  readonly diffSize: number;
  readonly acCoverage: number;
}

export interface ReviewGate {
  readonly planId: string;
  readonly runId: string;
  readonly verdict: ReviewVerdict;
  readonly findings: readonly ReviewFinding[];
  readonly mechanicalScores?: MechanicalScores;   // optional — backward compatible
}
```

```typescript
// packages/dogpile-adapter/src/pile-failure-types.ts — additions (Q-10)

export type PileKind = "planning" | "review" | "execution-coordination" | "evaluation";

export type PileSourceOfTruth =
  | "PlanningPileResult"
  | "ReviewPileResult"
  | "ExecutionCoordinationPileResult"
  | "EvaluationResult";

// Existing PileFailure union gains a 7th variant — keep all 6 prior variants verbatim.
// Add (after the 'pile-cancelled' variant):
//   | { readonly kind: "evaluation"; readonly class: "eval-consensus-block";
//       readonly breakdown: ConsensusBreakdown; readonly thresholdsHit: readonly string[] }
// `ConsensusBreakdown` import from @protostar/evaluation. (Adapter's pile-failure-types.ts may import a TYPE from evaluation; if a circular project-reference appears, redeclare the structural shape locally and add a TS satisfies test pinning the two are assignable.)
```

```typescript
// apps/factory-cli/src/refusals-index.ts — addition (Q-10)
export type RefusalStage =
  | "intent"
  | "planning"
  | "precedence"
  | "workspace-trust"
  | "repo-runtime"
  | "coder-adapter-ready"
  | "pile-planning"
  | "pile-review"
  | "pile-execution-coordination"
  | "pile-evaluation";   // NEW
```

```jsonc
// packages/lmstudio-adapter/src/factory-config.schema.json — top-level additions
// (merge into existing schema; NEVER drop existing keys).
{
  "properties": {
    // ... existing piles, adapters, etc. preserved verbatim ...
    "evaluation": {
      "type": "object",
      "additionalProperties": false,
      "description": "Phase 8 Q-07/Q-08: heterogeneous-local judge model overrides. CLI flags --semantic-judge-model / --consensus-judge-model take precedence; Phase 6 Q-04 mode-resolution pattern.",
      "properties": {
        "semanticJudge": {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "model": { "type": "string", "minLength": 1 },
            "baseUrl": { "type": "string", "format": "uri" }
          }
        },
        "consensusJudge": {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "model": { "type": "string", "minLength": 1 },
            "baseUrl": { "type": "string", "format": "uri" }
          }
        }
      }
    },
    "evolution": {
      "type": "object",
      "additionalProperties": false,
      "description": "Phase 8 Q-15/Q-17/Q-18: lineage default, code-evolution opt-in, convergence threshold override. CLI flags --lineage / --evolve-code take precedence.",
      "properties": {
        "lineage": { "type": "string", "minLength": 1 },
        "codeEvolution": { "type": "string", "enum": ["opt-in", "disabled"], "default": "disabled" },
        "convergenceThreshold": { "type": "number", "minimum": 0, "maximum": 1 }
      }
    }
  }
}
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Extend @protostar/evaluation types + constants (Q-03 BREAKING, Q-06, Q-09, Q-11, Q-12)</name>
  <read_first>
    - packages/evaluation/src/index.ts (current `EvaluationStageStatus`, `EvaluationStageResult`, `createEvaluationReport`, `decideEvolution`, threshold constants — full file)
    - .planning/phases/08-evaluation-evolution/08-CONTEXT.md (Q-03, Q-06, Q-09, Q-11, Q-12 rationale + values)
    - packages/review/src/index.ts (ReviewGate type — to confirm existing shape before extending)
    - apps/factory-cli/src/main.ts — locate the existing `createEvaluationReport` call site by symbol search (`grep -n 'createEvaluationReport(' apps/factory-cli/src/main.ts`); the legacy 1-arg call site is what Step 3's degraded stub keeps green until Plan 08-07 wires `runEvaluationStages`.
  </read_first>
  <behavior>
    - `EvaluationStageStatus` type-narrowed to `"pass" | "fail"` — referencing `"skipped"` anywhere fails compilation.
    - `EvaluationStageResult` REQUIRED fields: `stage`, `verdict`, `score`, `summary`. OPTIONAL: `scores`.
    - `EVALUATION_RUBRIC_DIMENSIONS` is `as const` — index access narrows to literal types.
    - All six threshold constants are `as const` numeric literals.
    - `MechanicalEvalResult.scores` is the strict 4-field shape `{ build, lint, diffSize, acCoverage }` — no extras.
    - `SemanticEvalResult.judges[].rubric` is keyed by exactly the 5 rubric dimensions (use `Record<EvaluationRubricDimension, number>`).
    - `ConsensusBreakdown.thresholdsHit` is `readonly string[]` (subset of `["meanJudges","minJudges","meanDims","minDims"]`).
    - `createEvaluationReport`: Plan 08-06 lands the new Q-12 signature `({ runId, mechanical, semantic, consensus? }) => EvaluationReport`. THIS plan MUST keep the repo verify-green during Waves 1–4. To do so, `createEvaluationReport` retains a legacy 1-arg overload `(input: { runId: string; reviewGate: ReviewGate }) => EvaluationReport` that returns a **degraded, non-throwing** report (see Step 3 below). The legacy overload is removed by Plan 08-06 Task 1 and the call site is replaced by Plan 08-07.
    - Existing `decideEvolution` + `measureOntologySimilarity` + `OntologySnapshot`/`OntologyField` types preserved verbatim.
    - Tests cover: (a) `EvaluationStageStatus` does NOT include `"skipped"` (type-level — `@ts-expect-error const x: EvaluationStageStatus = "skipped"`); (b) `EVALUATION_RUBRIC_DIMENSIONS.length === 5` and contents match the literal array; (c) all 6 threshold constants resolve to 0.95 / 0.85 values per Q-02 / Q-05 / Q-09; (d) `MechanicalEvalResult` shape compile-checks; (e) the legacy `createEvaluationReport({ runId, reviewGate })` overload returns a degraded `EvaluationReport` whose `verdict === 'fail'` and every `stages[i].verdict === 'fail'` and every `stages[i].score === 0` and every `stages[i].summary === 'Phase 8 Plan 08-07 replaces this call site.'`; the result MUST NOT throw and MUST NOT contain the literal `'skipped'` anywhere (Q-11 preserved).
  </behavior>
  <files>packages/evaluation/src/index.ts, packages/evaluation/src/types.test.ts</files>
  <action>
    1. **RED:** Create `packages/evaluation/src/types.test.ts` with the test cases from `<behavior>`, including the new degraded-stub assertion (e). Run; tests fail to compile against the current shape.
    2. **GREEN:** Modify `packages/evaluation/src/index.ts`:
       - Replace `export type EvaluationStageStatus = "passed" | "failed" | "skipped"` with `export type EvaluationStageStatus = "pass" | "fail"`.
       - Replace `EvaluationStageResult` interface with the verbatim shape from `<interfaces>` block.
       - Add `EVALUATION_RUBRIC_DIMENSIONS` const + `EvaluationRubricDimension` type after existing exports.
       - Add the 6 threshold constants `T_MECH`, `T_CONF`, `T_MEAN_JUDGES`, `T_MIN_JUDGES`, `T_MEAN_DIMS`, `T_MIN_DIMS` (`as const`).
       - Add `MechanicalEvalResult`, `JudgePerDimensionScores`, `SemanticEvalResult`, `ConsensusBreakdown`, `ConsensusEvalResult` interfaces.
       - Update the JSDoc on the file to cite Q-03/Q-06/Q-09/Q-11/Q-12.
    3. **Replace the existing `createEvaluationReport` body with a degraded, non-throwing stub** that preserves runtime verify-green for Waves 1–4. The legacy 1-arg signature `(input: { runId: string; reviewGate: ReviewGate }) => EvaluationReport` is retained verbatim AND a `@deprecated` JSDoc directs readers to Plan 08-07. The body returns a static degraded report whose every stage uses the new Q-03 shape (so the type contract is honored repo-wide):
       ```typescript
       /**
        * @deprecated Phase 8 Plan 08-07 replaces this call site with `runEvaluationStages` from
        * `@protostar/evaluation-runner`. This degraded stub exists ONLY to keep `pnpm run verify`
        * green across Waves 1–4 of Phase 8. It MUST NOT ship past Plan 08-07.
        *
        * Returns a non-throwing `EvaluationReport` with verdict `"fail"` on every stage and
        * `score: 0`. Never emits the literal `"skipped"` (Q-11 preserved).
        */
       export function createEvaluationReport(input: { runId: string; reviewGate: ReviewGate }): EvaluationReport {
         const summary = "Phase 8 Plan 08-07 replaces this call site." as const;
         const stages: readonly EvaluationStageResult[] = [
           { stage: "mechanical", verdict: "fail", score: 0, summary },
           { stage: "semantic",   verdict: "fail", score: 0, summary },
           { stage: "consensus",  verdict: "fail", score: 0, summary }
         ];
         return { runId: input.runId, verdict: "fail", stages };
       }
       ```
       - Do NOT throw. Do NOT use the literal `"skipped"` anywhere in the file.
       - Plan 08-06 Task 1 deletes this legacy stub when the new pure assembler `({ runId, mechanical, semantic, consensus? })` lands.
       - Plan 08-07 deletes the call site at `apps/factory-cli/src/main.ts` (currently around line 978 — locate via `grep -n 'createEvaluationReport(' apps/factory-cli/src/main.ts` rather than hard-coding the line number).
    4. Existing consumers of `EvaluationStageResult` / `EvaluationStageStatus` will fail to compile against the new shape. Locate them with `grep -rn 'EvaluationStageStatus\|EvaluationStageResult' apps/ packages/`. Update each test or fixture that constructs `EvaluationStageResult` literals to the new Q-03 shape (or delete fixtures that are slated for removal in later plans). The `apps/factory-cli/src/main.ts` `createEvaluationReport({ runId, reviewGate: review })` call site is left untouched — the degraded stub from Step 3 keeps it compiling AND running without throwing.
    5. Run `pnpm --filter @protostar/evaluation build` + `pnpm --filter @protostar/evaluation test`. Both green.
    6. Run `pnpm -r build` — all downstream consumers compile.
    7. Run `pnpm run verify` from repo root — must exit 0. Any pre-existing flaky cluster listed in STATE.md is acceptable; new failures introduced by the type change are NOT.
    8. **REFACTOR:** Verify no `"skipped"` literal remains anywhere in `packages/evaluation/src/`: `grep -rn '"skipped"' packages/evaluation/src/` → zero matches (filter out comment-only lines if any).
  </action>
  <verify>
    <automated>pnpm --filter @protostar/evaluation build && pnpm --filter @protostar/evaluation test && pnpm -r build && pnpm run verify && (grep -rn '"skipped"' packages/evaluation/src/ | grep -v '^\s*//' | grep -v '^\s*\*' | wc -l | awk '{ if ($1 != 0) { print "FAIL: skipped literal found"; exit 1 } else print "ok: no skipped" }')</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c 'EvaluationStageStatus = "pass" | "fail"' packages/evaluation/src/index.ts` is 1
    - `grep -rn '"skipped"' packages/evaluation/src/ | grep -v '^\s*//' | grep -v '^\s*\*'` returns zero non-comment matches
    - `grep -c 'EVALUATION_RUBRIC_DIMENSIONS' packages/evaluation/src/index.ts` is at least 1
    - `grep -c 'T_MECH\|T_CONF\|T_MEAN_JUDGES\|T_MIN_JUDGES\|T_MEAN_DIMS\|T_MIN_DIMS' packages/evaluation/src/index.ts` returns at least 6 (count grep matches across lines)
    - `grep -c 'MechanicalEvalResult\|SemanticEvalResult\|ConsensusEvalResult' packages/evaluation/src/index.ts` is at least 3
    - `grep -c 'Phase 8 Plan 08-07 replaces this call site' packages/evaluation/src/index.ts` is at least 1 (degraded stub summary literal present)
    - `grep -c '@deprecated' packages/evaluation/src/index.ts` is at least 1 (deprecation marker on legacy `createEvaluationReport`)
    - The degraded `createEvaluationReport` body does NOT contain `throw` (verify with `grep -nA2 'export function createEvaluationReport' packages/evaluation/src/index.ts | grep -c 'throw'` returns 0)
    - `pnpm --filter @protostar/evaluation test` exits 0 (≥5 new test cases pass — including the degraded-stub case)
    - `pnpm -r build` exits 0 (downstream consumers compile against new shape)
    - `pnpm run verify` exits 0 (no runtime regression — the legacy call site at `apps/factory-cli/src/main.ts` runs the degraded stub and returns rather than throwing)
  </acceptance_criteria>
  <done>@protostar/evaluation surface matches Q-03/Q-06/Q-09/Q-11/Q-12; no 'skipped' literal remains; degraded non-throwing stub keeps repo verify-green for Waves 1–4.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Extend ReviewGate with mechanicalScores (Q-01)</name>
  <read_first>
    - packages/review/src/index.ts (current `ReviewGate` interface, lines 41-46; `createReviewGate` function around line 138)
    - .planning/phases/08-evaluation-evolution/08-CONTEXT.md Q-01 (rationale: hybrid extension; producer in mechanical-checks comes in Plan 08-04)
    - packages/mechanical-checks/src/findings.ts (current finding producer — confirms where Plan 08-04 will hook in; this plan only adds the type)
  </read_first>
  <behavior>
    - `ReviewGate` gains `readonly mechanicalScores?: MechanicalScores` — OPTIONAL (preserves backward compatibility with all existing call sites that don't supply it).
    - `MechanicalScores` is `{ readonly build: number; readonly lint: number; readonly diffSize: number; readonly acCoverage: number }` — strict, all numeric, no extras.
    - `createReviewGate` (line 138) accepts a new optional `mechanicalScores` input and threads it onto the returned gate.
    - `runMechanicalReviewExecutionLoop` and `createMechanicalReviewGate` are NOT changed in this plan (Plan 08-04 adds the score producer that flows into them).
    - Test: a `ReviewGate` value WITHOUT `mechanicalScores` still compiles (backward compat); a value WITH `mechanicalScores: { build: 1, lint: 1, diffSize: 1, acCoverage: 0.8 }` validates as the strict `MechanicalScores` shape.
  </behavior>
  <files>packages/review/src/index.ts, packages/review/src/mechanical-scores.test.ts</files>
  <action>
    1. **RED:** Create `packages/review/src/mechanical-scores.test.ts` with two test cases:
       - Construct a ReviewGate object literal without `mechanicalScores` → compiles + valid (backward compat).
       - Construct a ReviewGate object literal with `mechanicalScores: { build: 1, lint: 1, diffSize: 1, acCoverage: 0.8 }` → compiles + the field is preserved.
       - `// @ts-expect-error` line passing `mechanicalScores: { build: 1 }` (missing fields) → TS rejects.
       - `// @ts-expect-error` line passing `mechanicalScores: { build: 1, lint: 1, diffSize: 1, acCoverage: 0.8, extra: 1 }` (extra field) → TS rejects (excess property check).
    2. **GREEN:** Edit `packages/review/src/index.ts`:
       - Insert `export interface MechanicalScores { readonly build: number; readonly lint: number; readonly diffSize: number; readonly acCoverage: number; }` ABOVE `ReviewGate` interface.
       - Add `readonly mechanicalScores?: MechanicalScores;` as the LAST field of `ReviewGate`.
       - Update `createReviewGate(input)` signature to accept optional `mechanicalScores` and thread `...(input.mechanicalScores !== undefined ? { mechanicalScores: input.mechanicalScores } : {})` onto the returned object (matches the codebase's `exactOptionalPropertyTypes` posture).
       - Add JSDoc citing Q-01.
    3. Run `pnpm --filter @protostar/review build && pnpm --filter @protostar/review test`. Green.
  </action>
  <verify>
    <automated>pnpm --filter @protostar/review build && pnpm --filter @protostar/review test --run mechanical-scores</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c 'mechanicalScores' packages/review/src/index.ts` is at least 2 (interface field + createReviewGate threading)
    - `grep -c 'export interface MechanicalScores' packages/review/src/index.ts` is 1
    - `grep -c '@ts-expect-error' packages/review/src/mechanical-scores.test.ts` is at least 2
    - `pnpm --filter @protostar/review test` exits 0
    - All other `@protostar/review` tests still green (no regression)
  </acceptance_criteria>
  <done>ReviewGate.mechanicalScores extension landed; backward-compat preserved; type-level negative tests pass.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Extend PileFailure + PileKind + PileSourceOfTruth + RefusalStage (Q-10)</name>
  <read_first>
    - packages/dogpile-adapter/src/pile-failure-types.ts (full file, lines 1-83 — current 6-variant union, PileKind, PileSourceOfTruth)
    - apps/factory-cli/src/refusals-index.ts (full file — current RefusalStage, formatRefusalIndexLine)
    - .planning/phases/08-evaluation-evolution/08-CONTEXT.md Q-10 (variant + sourceOfTruth + RefusalStage extension)
    - packages/evaluation/src/index.ts (after Task 1 — `ConsensusBreakdown` shape that the new variant references)
  </read_first>
  <behavior>
    - `PileKind` adds `"evaluation"` literal.
    - `PileSourceOfTruth` adds `"EvaluationResult"` literal.
    - `PileFailure` discriminated union gains a 7th variant: `{ kind: "evaluation"; class: "eval-consensus-block"; breakdown: ConsensusBreakdown; thresholdsHit: readonly string[] }`.
    - `ConsensusBreakdown` is imported from `@protostar/evaluation` (workspace dep — adapter already has dogpile-types but evaluation is a NEW dep here; add to package.json `dependencies` if not present). If a TS project-reference cycle appears (evaluation depends on review which depends on... etc.), redeclare ConsensusBreakdown structurally inline and add a `satisfies` test asserting assignability between `import type { ConsensusBreakdown } from '@protostar/evaluation'` and the local copy.
    - `RefusalStage` in `apps/factory-cli/src/refusals-index.ts` gains `"pile-evaluation"` literal.
    - Existing 6 PileFailure variants preserved BYTE-FOR-BYTE — no edits to their fields.
    - Tests cover: (a) constructing a 7th-variant `PileFailure` literal with all required fields compiles; (b) `kind: "evaluation"` narrows correctly; (c) RefusalStage `"pile-evaluation"` is assignable.
  </behavior>
  <files>packages/dogpile-adapter/src/pile-failure-types.ts, packages/dogpile-adapter/src/pile-failure-types.test.ts, apps/factory-cli/src/refusals-index.ts, apps/factory-cli/src/refusals-index.test.ts, packages/dogpile-adapter/package.json, packages/dogpile-adapter/tsconfig.json</files>
  <action>
    1. **RED:** Create `packages/dogpile-adapter/src/pile-failure-types.test.ts` with cases:
       - Constructs a `pile-timeout` failure (existing variant) → still compiles.
       - Constructs the new `eval-consensus-block` failure with `kind: "evaluation"`, `breakdown: <ConsensusBreakdown literal>`, `thresholdsHit: ["meanJudges"]` → compiles.
       - Switch on `failure.class` covering all 7 variants, with `assertNever` default → compiles (exhaustiveness check passes).
       - Constructs RefusalStage `"pile-evaluation"` (in refusals-index.test.ts) → compiles.
    2. **GREEN:** Edit `packages/dogpile-adapter/src/pile-failure-types.ts`:
       - `PileKind`: add `| "evaluation"`.
       - `PileSourceOfTruth`: add `| "EvaluationResult"`.
       - Add an `import type { ConsensusBreakdown } from "@protostar/evaluation";` at the top. If this introduces a project-reference cycle, fall back to a structural local copy:
         ```typescript
         interface ConsensusBreakdown {
           readonly judgeMeans: readonly number[];
           readonly dimMeans: Readonly<Record<string, number>>;
           readonly meanOfJudgeMeans: number;
           readonly minOfJudgeMeans: number;
           readonly meanOfDimMeans: number;
           readonly minOfDimMeans: number;
           readonly thresholds: { readonly tMeanJudges: number; readonly tMinJudges: number; readonly tMeanDims: number; readonly tMinDims: number };
           readonly thresholdsHit: readonly string[];
         }
         ```
         and add a satisfies assertion in the test file: `const _check: import("@protostar/evaluation").ConsensusBreakdown = {} as ConsensusBreakdown;` (this MAY require pulling evaluation as a devDep only).
       - Append the 7th variant to `PileFailure`:
         ```typescript
         | {
             readonly kind: "evaluation";
             readonly class: "eval-consensus-block";
             readonly breakdown: ConsensusBreakdown;
             readonly thresholdsHit: readonly string[];
           }
         ```
       - Update the file-level JSDoc to mention "Phase 8 Q-10 extends this union with the 7th variant `eval-consensus-block`."
    3. If adding `@protostar/evaluation` as a workspace dep, update `packages/dogpile-adapter/package.json` `dependencies` and `packages/dogpile-adapter/tsconfig.json` `references`. Verify `pnpm install` then `pnpm --filter @protostar/dogpile-adapter build`. If a project-reference cycle is detected (TS `error TS6202` or similar), revert to the structural-local copy approach.
    4. **GREEN (factory-cli):** Edit `apps/factory-cli/src/refusals-index.ts` — append `| "pile-evaluation"` to the `RefusalStage` union (alphabetical-ish position next to other `pile-*` literals). Edit/add `apps/factory-cli/src/refusals-index.test.ts` with a single test asserting `"pile-evaluation"` is assignable.
    5. Run `pnpm --filter @protostar/dogpile-adapter test` + `pnpm --filter @protostar/factory-cli test --run refusals-index`. Both green.
    6. **REFACTOR:** Confirm `mapSdkStopToPileFailure` still has exhaustive switch — adding an SDK→eval-consensus-block mapping is OUT OF SCOPE here (the new variant is produced by the consensus helper in Plan 08-03, not the SDK).
  </action>
  <verify>
    <automated>pnpm --filter @protostar/dogpile-adapter test && pnpm --filter @protostar/factory-cli test --run refusals-index</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c '"evaluation"' packages/dogpile-adapter/src/pile-failure-types.ts` is at least 2 (PileKind addition + variant kind)
    - `grep -c '"eval-consensus-block"' packages/dogpile-adapter/src/pile-failure-types.ts` is at least 1
    - `grep -c '"EvaluationResult"' packages/dogpile-adapter/src/pile-failure-types.ts` is at least 1
    - `grep -c '"pile-evaluation"' apps/factory-cli/src/refusals-index.ts` is at least 1
    - `pnpm --filter @protostar/dogpile-adapter build` exits 0
    - All existing 6 PileFailure variants unchanged: `grep -c 'pile-timeout\|pile-budget-exhausted\|pile-schema-parse\|pile-all-rejected\|pile-network\|pile-cancelled' packages/dogpile-adapter/src/pile-failure-types.ts` is at least 6
    - All adapter tests still green (no regression)
  </acceptance_criteria>
  <done>PileFailure 7-variant union + PileKind + PileSourceOfTruth + RefusalStage all extended; no existing behavior regresses.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 4: Extend factory-config.schema.json with evaluation + evolution blocks (Q-07, Q-08, Q-15, Q-17, Q-18)</name>
  <read_first>
    - packages/lmstudio-adapter/src/factory-config.schema.json (full file — current top-level `properties` keys, additionalProperties posture)
    - packages/lmstudio-adapter/src/factory-config.ts (TypeScript type that mirrors the schema — locate the `FactoryConfig` interface; this plan extends it)
    - packages/lmstudio-adapter/src/load-factory-config.test.ts (round-trip test pattern — confirm the validator that mirrors the schema)
    - .planning/phases/08-evaluation-evolution/08-CONTEXT.md Q-07/Q-08 (judge model + baseUrl) + Q-15 (lineage) + Q-17 (codeEvolution enum) + Q-18 (convergenceThreshold)
    - .planning/phases/06-live-dogpile-piles/06-02-wave0-config-schema-and-phase5-annotation-PLAN.md (precedent for adding top-level config blocks; copy the pattern verbatim)
  </read_first>
  <behavior>
    - Schema gains TWO new top-level optional objects: `evaluation` and `evolution`.
    - `evaluation.semanticJudge` and `evaluation.consensusJudge` each have OPTIONAL `model` (string, minLength 1) and OPTIONAL `baseUrl` (string, format uri).
    - `evolution.lineage` is OPTIONAL string (minLength 1) — defaults to `undefined` (factory-cli computes hash per Q-15 if absent).
    - `evolution.codeEvolution` is OPTIONAL enum `["opt-in", "disabled"]`, default `"disabled"` per Q-17.
    - `evolution.convergenceThreshold` is OPTIONAL number in [0, 1] — defaults to `ONTOLOGY_CONVERGENCE_THRESHOLD = 0.95` (factory-cli reads this in Plan 08-07).
    - `additionalProperties: false` everywhere (block + sub-blocks).
    - The TypeScript `FactoryConfig` interface in `factory-config.ts` mirrors the schema additions.
    - The validator/loader (`load-factory-config.ts` or equivalent) round-trips the new fields. Tests: (a) parse a config with all new fields → values preserved; (b) parse an empty config → all new fields are `undefined`; (c) parse a config with `evolution.codeEvolution: "invalid"` → schema rejection.
  </behavior>
  <files>packages/lmstudio-adapter/src/factory-config.schema.json, packages/lmstudio-adapter/src/factory-config.ts, packages/lmstudio-adapter/src/load-factory-config.test.ts</files>
  <action>
    1. **RED:** Add three test cases to `packages/lmstudio-adapter/src/load-factory-config.test.ts` (or a new sibling file `factory-config.test.ts` if conventions prefer):
       - Parse JSON with `evaluation: { semanticJudge: { model: "Qwen3-Next-80B-A3B-MLX-4bit", baseUrl: "http://localhost:1234/v1" }, consensusJudge: { model: "DeepSeek-Coder-V2-Lite-Instruct" } }, evolution: { lineage: "cosmetic-tweak-button-color", codeEvolution: "opt-in", convergenceThreshold: 0.9 }` → all fields preserved.
       - Parse JSON with `{}` (empty) → `evaluation` and `evolution` are both `undefined`.
       - Parse JSON with `evolution: { codeEvolution: "invalid" }` → schema validation REJECTS with a descriptive error mentioning `codeEvolution` enum.
    2. **GREEN:** Edit `packages/lmstudio-adapter/src/factory-config.schema.json`:
       - Add `evaluation` block under top-level `properties` per `<interfaces>` block.
       - Add `evolution` block under top-level `properties` per `<interfaces>` block.
       - Confirm top-level `additionalProperties` is still `false` (existing posture).
    3. Edit `packages/lmstudio-adapter/src/factory-config.ts` (TypeScript mirror):
       - Add interface `EvaluationConfig { readonly semanticJudge?: { readonly model?: string; readonly baseUrl?: string }; readonly consensusJudge?: { readonly model?: string; readonly baseUrl?: string } }`.
       - Add interface `EvolutionConfig { readonly lineage?: string; readonly codeEvolution?: "opt-in" | "disabled"; readonly convergenceThreshold?: number }`.
       - Add to `FactoryConfig`: `readonly evaluation?: EvaluationConfig; readonly evolution?: EvolutionConfig`.
       - Update the validator/loader to thread these fields verbatim (struct-to-struct copy with the same `...(value !== undefined ? { value } : {})` pattern used elsewhere in the file for `exactOptionalPropertyTypes` compliance).
    4. Run `pnpm --filter @protostar/lmstudio-adapter build && pnpm --filter @protostar/lmstudio-adapter test`. Confirm 3 new tests pass + zero regressions.
    5. **REFACTOR:** `grep -c "additionalProperties" packages/lmstudio-adapter/src/factory-config.schema.json` should INCREASE by at least 4 (one per new sub-object: evaluation, evaluation.semanticJudge, evaluation.consensusJudge, evolution).
  </action>
  <verify>
    <automated>pnpm --filter @protostar/lmstudio-adapter build && pnpm --filter @protostar/lmstudio-adapter test</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c '"semanticJudge"' packages/lmstudio-adapter/src/factory-config.schema.json` is at least 1
    - `grep -c '"consensusJudge"' packages/lmstudio-adapter/src/factory-config.schema.json` is at least 1
    - `grep -c '"codeEvolution"' packages/lmstudio-adapter/src/factory-config.schema.json` is at least 1
    - `grep -c '"convergenceThreshold"' packages/lmstudio-adapter/src/factory-config.schema.json` is at least 1
    - `grep -c '"lineage"' packages/lmstudio-adapter/src/factory-config.schema.json` is at least 1
    - `grep -c '"opt-in"\|"disabled"' packages/lmstudio-adapter/src/factory-config.schema.json` is at least 2
    - `grep -c 'EvaluationConfig\|EvolutionConfig' packages/lmstudio-adapter/src/factory-config.ts` is at least 2
    - `pnpm --filter @protostar/lmstudio-adapter test` exits 0 (3 new tests + zero regressions)
  </acceptance_criteria>
  <done>factory-config schema + TS mirror gain evaluation + evolution blocks; round-trip + reject-invalid tests green.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Operator config → factory-config validator | `additionalProperties: false` prevents typo'd fields from silently shipping |
| Pile failure → refusal artifact | new `eval-consensus-block` variant must thread through `RefusalStage = "pile-evaluation"` (Plan 08-07 wires) |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-08-02-01 | Tampering | factory-config.schema.json | mitigate | `additionalProperties: false` on every new sub-object — typos rejected at load. |
| T-08-02-02 | Information Disclosure | factory-config.schema.json `baseUrl` | accept | Operator-supplied LM Studio URL is not a secret; documented in heterogeneous-local lock. |
| T-08-02-03 | Tampering | EvaluationStageStatus union | mitigate | `'skipped'` literal removed; type-level test prevents reintroduction. Plan 08-08 contract test asserts no `'skipped'` in any persisted artifact. |
| T-08-02-04 | Repudiation | PileFailure 7-variant union | mitigate | `eval-consensus-block` carries `breakdown` evidence + `thresholdsHit` — full audit trail of which threshold the run failed. |
| T-08-02-05 | Tampering | createEvaluationReport degraded stub | mitigate | Stub returns verdict='fail' on every stage with audit-trail summary "Phase 8 Plan 08-07 replaces this call site." Cannot silently ship a false 'pass'. Plan 08-06 deletes the legacy overload entirely. |
</threat_model>

<verification>
- `pnpm --filter @protostar/evaluation test` green
- `pnpm --filter @protostar/review test` green
- `pnpm --filter @protostar/dogpile-adapter test` green
- `pnpm --filter @protostar/factory-cli test --run refusals-index` green
- `pnpm --filter @protostar/lmstudio-adapter test` green
- `pnpm -r build` green (downstream consumers compile)
- `pnpm run verify` green (degraded `createEvaluationReport` stub keeps the legacy call site at `apps/factory-cli/src/main.ts` non-throwing)
- `grep -rn '"skipped"' packages/evaluation/src/` returns zero non-comment matches
</verification>

<success_criteria>
- All Q-01/Q-03/Q-06/Q-09/Q-10/Q-11/Q-12/Q-07/Q-08/Q-15/Q-17/Q-18 type/schema additions land
- Existing tests + builds remain green
- 'skipped' literal eliminated from packages/evaluation/src/
- factory-config schema additions are `additionalProperties: false` everywhere
- `pnpm run verify` exits 0 — the degraded `createEvaluationReport` stub at the legacy call site does not throw
</success_criteria>

<output>
Create `.planning/phases/08-evaluation-evolution/08-02-SUMMARY.md` enumerating every type/const/schema field added and the BREAKING change to `EvaluationStageResult` shape. Document that the legacy `createEvaluationReport({ runId, reviewGate })` overload is retained as a non-throwing degraded stub (every stage `verdict='fail'`, `score=0`, `summary='Phase 8 Plan 08-07 replaces this call site.'`) so `pnpm run verify` stays green across Waves 1–4; Plan 08-06 deletes the stub when the new pure assembler lands; Plan 08-07 deletes the call site.
</output>
