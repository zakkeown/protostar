---
phase: 08-evaluation-evolution
plan: 05
type: execute
wave: 3
depends_on: ["08-02", "08-03"]
files_modified:
  - packages/dogpile-adapter/src/index.ts
  - packages/dogpile-adapter/src/evaluation-mission.ts
  - packages/dogpile-adapter/src/evaluation-mission.test.ts
  - packages/evaluation/src/evaluation-pile-result.ts
  - packages/evaluation/src/evaluation-pile-result.test.ts
  - packages/evaluation/src/index.ts
autonomous: true
requirements: [EVAL-02, EVAL-03]
must_haves:
  truths:
    - "evaluationPilePreset is a 4th FactoryPilePreset with kind='evaluation' and the SDK-shaped agents/protocol/budget fields mirroring reviewPilePreset"
    - "Default baseline agent has model='Qwen3-Next-80B-A3B-MLX-4bit' and role='semantic-judge' (Q-07 default)"
    - "Default consensus agent (model='DeepSeek-Coder-V2-Lite-Instruct') is built but ONLY included in the agents array when factory-cli passes shouldRunConsensus=true (Q-08)"
    - "buildEvaluationMission(intent, plan, diffNameOnly, executionEvidence) produces a FactoryPileMission whose mission text instructs the model to return rubric keyed exactly by EVALUATION_RUBRIC_DIMENSIONS (Q-04, Q-06)"
    - "EvaluationPileBody mirrors ReviewPileBody.judgeCritiques shape but with rubric: Record<EvaluationRubricDimension, number>"
    - "parseEvaluationPileResult(json: string) returns { ok: true; body: EvaluationPileBody } | { ok: false; errors: string[] }; rejects unknown keys + missing keys (T-08-05-01 single-ingress shape gate)"
    - "@protostar/evaluation remains pure (parser lives there; pile invocation lives in dogpile-adapter)"
  artifacts:
    - path: packages/dogpile-adapter/src/index.ts
      provides: "evaluationPilePreset (4th preset)"
      exports: ["evaluationPilePreset"]
    - path: packages/dogpile-adapter/src/evaluation-mission.ts
      provides: "buildEvaluationMission"
      exports: ["buildEvaluationMission", "EvaluationMissionInput"]
    - path: packages/evaluation/src/evaluation-pile-result.ts
      provides: "EvaluationPileBody type + parseEvaluationPileResult parser"
      exports: ["EvaluationPileBody", "EvaluationPileResult", "parseEvaluationPileResult"]
  key_links:
    - from: packages/dogpile-adapter/src/index.ts
      to: packages/evaluation/src/evaluation-pile-result.ts
      via: "Mission output schema is parsed by @protostar/evaluation"
      pattern: "parseEvaluationPileResult"
    - from: packages/dogpile-adapter/src/index.ts
      to: packages/dogpile-adapter/src/pile-failure-types.ts
      via: "kind: 'evaluation' PileKind extension from Plan 08-02"
      pattern: '"evaluation"'
---

<objective>
Land the evaluation pile preset, mission builder, and output parser. The evaluation pile is the **fourth** `FactoryPilePreset` (alongside planning / review / execution-coordination from Phases 1–6). Mission asks the panel to score the completed run against the 5-dimension rubric (Q-06). Parser is single-ingress + strict-shape (rejects unknown rubric keys, missing keys, malformed scores).

Per Q-08, the consensus agent slot is **conditionally** populated by factory-cli at invocation time — this plan's preset declares the baseline-only agents array; Plan 08-06's runner extends it when `shouldRunConsensus(semantic) === true`.

Per Q-20, parser lives in `@protostar/evaluation` (pure) — `dogpile-adapter` only owns the preset + mission builder (network-only authority).

Purpose: Plan 08-06's `runEvaluationStages` builds a `PileRunContext` and calls `runFactoryPile(buildEvaluationMission(...), ctx)` for the semantic stage. Output is parsed via `parseEvaluationPileResult`; if parse fails, the runner emits a `pile-schema-parse` failure with `sourceOfTruth: 'EvaluationResult'` (Q-10).
Output: 4th preset registered, mission builder + parser tested, no fs imports in adapter.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/08-evaluation-evolution/08-CONTEXT.md
@packages/dogpile-adapter/src/index.ts
@packages/dogpile-adapter/src/execution-coordination-mission.ts
@packages/dogpile-adapter/src/run-factory-pile.ts
@packages/review/src/review-pile-result.ts
@packages/review/src/judge-types.ts
@packages/evaluation/src/index.ts
@packages/intent/src

<interfaces>
<!-- 4th preset (mirrors reviewPilePreset shape — copy values then update). -->

```typescript
// packages/dogpile-adapter/src/index.ts (additions)

export const evaluationPilePreset: FactoryPilePreset = {
  kind: "evaluation",
  // Baseline-only agents array. factory-cli (via evaluation-runner Plan 08-06) appends the
  // consensus AgentSpec at invocation time when shouldRunConsensus(semantic) === true.
  agents: [
    {
      id: "eval-baseline",
      role: "semantic-judge",
      model: "Qwen3-Next-80B-A3B-MLX-4bit",
      // provider override: factory-cli supplies via PileRunContext.provider per Phase 6 Q-03.
    }
  ],
  protocol: { /* same shape as reviewPilePreset.protocol — broadcast */ },
  budget: { /* same defaults shape as reviewPilePreset.budget; numbers per RESEARCH/Q-07 */ },
  termination: { /* same shape as reviewPilePreset.termination */ }
};

// Helper exposed for Plan 08-06 to extend the agents array when consensus runs.
export const EVAL_CONSENSUS_AGENT_DEFAULT = {
  id: "eval-consensus",
  role: "consensus-judge",
  model: "DeepSeek-Coder-V2-Lite-Instruct"
} as const;
```

```typescript
// packages/dogpile-adapter/src/evaluation-mission.ts

import type { ConfirmedIntent } from "@protostar/intent";
import type { AdmittedPlan } from "@protostar/planning"; // or whatever the admitted-plan record type is — confirm during read
import { evaluationPilePreset, type FactoryPileMission } from "./index.js";

export interface EvaluationMissionInput {
  readonly intent: ConfirmedIntent;
  readonly plan: AdmittedPlan;                  // admitted plan record
  readonly diffNameOnly: readonly string[];
  readonly executionEvidence: {
    readonly buildExitCode?: number;
    readonly lintExitCode?: number;
    readonly stdoutTail?: string;               // truncated sample
  };
}

export function buildEvaluationMission(input: EvaluationMissionInput): FactoryPileMission;
// Mission text instructs:
//   "You are an evaluation judge. Score the run against this rubric:
//    acMet, codeQuality, security, regressionRisk, releaseReadiness — each in [0,1].
//    Return JSON { rubric: { acMet, codeQuality, security, regressionRisk, releaseReadiness }, verdict: 'pass'|'fail', rationale }.
//    Inputs: intent.problem, AC list, diffNameOnly, build/lint exit codes, stdoutTail."
// Mission text MUST list the 5 rubric dim names verbatim.
```

```typescript
// packages/evaluation/src/evaluation-pile-result.ts

import type { JudgeCritique } from "@protostar/review";
import type { EvaluationRubricDimension } from "./index.js";
import { EVALUATION_RUBRIC_DIMENSIONS } from "./index.js";

// Mirrors ReviewPileBody but with rubric typed to the 5-dim shape.
export interface EvaluationJudgeCritique {
  readonly judgeId: string;
  readonly model: string;
  readonly rubric: Readonly<Record<EvaluationRubricDimension, number>>;
  readonly verdict: "pass" | "fail";
  readonly rationale: string;
}

export interface EvaluationPileBody {
  readonly judgeCritiques: readonly EvaluationJudgeCritique[];
}

export type EvaluationPileResult =
  | { readonly ok: true; readonly body: EvaluationPileBody }
  | { readonly ok: false; readonly errors: readonly string[] };

export function parseEvaluationPileResult(jsonText: string): EvaluationPileResult;
// Returns ok:false (never throws) for: JSON.parse failure, non-object root,
// missing judgeCritiques array, any critique missing required field,
// rubric containing unknown key, rubric missing any of the 5 keys,
// any rubric value outside [0,1] or non-numeric.
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: parseEvaluationPileResult + EvaluationPileBody shape</name>
  <read_first>
    - packages/review/src/review-pile-result.ts (full file — `assertReviewPileResult`, `parseReviewPileResult`, `ReviewPileBody` shape; this is the verbatim template)
    - packages/evaluation/src/index.ts (after Plans 08-02/08-03 — `EVALUATION_RUBRIC_DIMENSIONS`, `EvaluationRubricDimension`)
    - packages/review/src/judge-types.ts (`JudgeCritique` shape)
    - .planning/phases/08-evaluation-evolution/08-CONTEXT.md Q-04 (parser ownership in @protostar/evaluation) + Q-06 (rubric strictness)
  </read_first>
  <behavior>
    - `parseEvaluationPileResult` NEVER throws — every failure is `{ ok: false, errors: string[] }`.
    - Validation order:
      1. `JSON.parse(jsonText)` failure → `{ ok: false, errors: ["JSON.parse: <message>"] }`.
      2. Root not an object → `["root must be object"]`.
      3. `judgeCritiques` missing or not array → error.
      4. For each critique: missing `judgeId` (string) → error; missing `model` (string) → error; missing `verdict` ("pass" | "fail") → error; missing `rationale` (string) → error; missing `rubric` (object) → error.
      5. Rubric must have EXACTLY the 5 keys in `EVALUATION_RUBRIC_DIMENSIONS`. Unknown keys → error listing the unknown keys; missing keys → error listing the missing keys.
      6. Each rubric value must be a number in `[0, 1]`.
    - All errors are accumulated (not first-fail-only) so the operator gets one round-trip diagnostic.
    - Tests (12 cases):
      - Valid 1-critique JSON → ok with `body.judgeCritiques.length === 1` and rubric strictly the 5 keys.
      - Valid 2-critique JSON → ok.
      - Malformed JSON (`"not json"`) → ok:false with parse error.
      - Root array `[]` → ok:false with "root must be object".
      - Missing judgeCritiques → ok:false.
      - Critique missing `judgeId` → ok:false.
      - Rubric with unknown key `acmet` (lowercase) → ok:false with "unknown rubric key: acmet".
      - Rubric missing `releaseReadiness` → ok:false with "missing rubric key: releaseReadiness".
      - Rubric value `1.5` → ok:false with "rubric value out of range".
      - Rubric value `"high"` → ok:false with "rubric value not numeric".
      - Verdict `"maybe"` → ok:false with "verdict must be pass|fail".
      - Empty `judgeCritiques: []` → ok:true with empty array (not an error — 0 judges is a degenerate but legal state; runner's responsibility to refuse empty).
  </behavior>
  <files>packages/evaluation/src/evaluation-pile-result.ts, packages/evaluation/src/evaluation-pile-result.test.ts, packages/evaluation/src/index.ts</files>
  <action>
    1. **RED:** Create `packages/evaluation/src/evaluation-pile-result.test.ts` with the 12 cases. Run; tests fail.
    2. **GREEN:** Create `packages/evaluation/src/evaluation-pile-result.ts` per `<interfaces>` shape. Implement the parser as a single function that pushes to an `errors: string[]` accumulator and returns `{ ok: errors.length === 0, ... }`.
       - Use `EVALUATION_RUBRIC_DIMENSIONS` to drive both the unknown-key check and the missing-key check.
       - All checks are exhaustive (push each error rather than early-return).
    3. Re-export from `packages/evaluation/src/index.ts` barrel.
    4. Run tests — 12 green.
    5. **REFACTOR:** Verify the parser has zero fs/network imports (it's pure data validation).
  </action>
  <verify>
    <automated>pnpm --filter @protostar/evaluation test --run evaluation-pile-result</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c 'export function parseEvaluationPileResult' packages/evaluation/src/evaluation-pile-result.ts` is 1
    - `grep -c 'EVALUATION_RUBRIC_DIMENSIONS' packages/evaluation/src/evaluation-pile-result.ts` is at least 1
    - `grep -c 'EvaluationPileBody' packages/evaluation/src/evaluation-pile-result.ts` is at least 1
    - 12 test cases green
    - `grep -E 'from ["\x27](node:fs|node:path)' packages/evaluation/src/evaluation-pile-result.ts | grep -v '^#'` returns zero matches
    - Parser never throws (verified by negative test cases all returning `{ ok: false }` rather than rejecting)
  </acceptance_criteria>
  <done>EvaluationPileBody parser landed, single-ingress, exhaustive error accumulation.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: evaluationPilePreset + buildEvaluationMission</name>
  <read_first>
    - packages/dogpile-adapter/src/index.ts (full file — `planningPilePreset` lines 74-92, `reviewPilePreset` lines 94-112, `executionCoordinationPilePreset` lines 114-132, `buildPlanningMission` line 134, `buildReviewMission` line 153 — copy the SHAPE, update kind/agents/mission)
    - packages/dogpile-adapter/src/execution-coordination-mission.ts (Phase 6 mission-builder template)
    - packages/dogpile-adapter/src/run-factory-pile.ts (consumer signature — confirm `FactoryPileMission` shape)
    - .planning/phases/08-evaluation-evolution/08-CONTEXT.md Q-04 (evaluationPilePreset shape) + Q-06 (rubric dimensions in mission text) + Q-07 (default model) + Q-08 (consensus default model — declared as constant for Plan 08-06 to use)
  </read_first>
  <behavior>
    - `evaluationPilePreset` shape EXACTLY mirrors `reviewPilePreset`:
      - Same `protocol`, `budget`, `termination` field shapes (copy values verbatim from reviewPilePreset, then adjust budget if Q-07 implies a higher token cap for 80B model — confirm in CONTEXT/RESEARCH; if no specific number is given, copy reviewPilePreset's budget and document as a Phase 10 calibration target).
      - `kind: "evaluation"` (the new PileKind literal from Plan 08-02).
      - `agents: [{ id: "eval-baseline", role: "semantic-judge", model: "Qwen3-Next-80B-A3B-MLX-4bit" }]` — single baseline agent. NO consensus agent in the preset itself; Plan 08-06 appends the consensus agent at invocation time.
    - `EVAL_CONSENSUS_AGENT_DEFAULT` exported as a `const` object with `id: "eval-consensus"`, `role: "consensus-judge"`, `model: "DeepSeek-Coder-V2-Lite-Instruct"` — Plan 08-06 imports this when `shouldRunConsensus === true`.
    - `buildEvaluationMission(input)` returns `{ preset: evaluationPilePreset, missionText: <string> }` (or whatever exact `FactoryPileMission` shape — confirm during read).
    - Mission text MUST contain the literal 5 rubric dim names (`acMet`, `codeQuality`, `security`, `regressionRisk`, `releaseReadiness`) and instruct the model to return JSON with the exact `judgeCritiques` schema.
    - Mission text includes:
      - The intent.problem statement.
      - The list of AC ids + statements.
      - The `diffNameOnly` file list.
      - Build/lint exit codes from `executionEvidence`.
      - Optional stdoutTail (truncated to e.g. 2000 chars).
    - Tests (5 cases for preset + 5 for mission):
      - `evaluationPilePreset.kind === "evaluation"`.
      - `evaluationPilePreset.agents.length === 1` (baseline only).
      - `evaluationPilePreset.agents[0].model === "Qwen3-Next-80B-A3B-MLX-4bit"`.
      - `EVAL_CONSENSUS_AGENT_DEFAULT.model === "DeepSeek-Coder-V2-Lite-Instruct"`.
      - Preset shape passes a structural compatibility check vs `reviewPilePreset` (same top-level keys).
      - `buildEvaluationMission(input)` returns a mission whose missionText contains all 5 rubric dimension names.
      - Mission text contains `intent.problem` substring.
      - Mission text contains every `acceptanceCriteria[].id`.
      - Mission text contains every entry in `diffNameOnly`.
      - Mission text contains the build/lint exit codes (or a marker like "build: 0").
  </behavior>
  <files>packages/dogpile-adapter/src/index.ts, packages/dogpile-adapter/src/evaluation-mission.ts, packages/dogpile-adapter/src/evaluation-mission.test.ts</files>
  <action>
    1. **RED:** Create `packages/dogpile-adapter/src/evaluation-mission.test.ts` with the 10 cases. Run; tests fail.
    2. **GREEN:** Edit `packages/dogpile-adapter/src/index.ts`:
       - Add `evaluationPilePreset` after `executionCoordinationPilePreset` (lines ~114-132). Copy the `protocol`, `budget`, `termination` shapes verbatim from `reviewPilePreset`. Set `kind: "evaluation"` and `agents` per `<interfaces>`.
       - Add `EVAL_CONSENSUS_AGENT_DEFAULT` const after the preset.
       - Re-export from the barrel (the file IS the barrel — confirm).
    3. Create `packages/dogpile-adapter/src/evaluation-mission.ts`:
       - Import types from `@protostar/intent` (`ConfirmedIntent`) and `@protostar/planning` (`AdmittedPlan` or admitted-plan record type — confirm exact name during read).
       - Import `evaluationPilePreset`, `FactoryPileMission` from `./index.js`.
       - Implement `buildEvaluationMission(input)` constructing a deterministic mission text. Use template literals; include all 5 rubric dim names. Truncate `stdoutTail` to 2000 chars if present.
    4. Run tests — 10 green.
    5. **REFACTOR:** Confirm no fs/network imports — run `grep -E 'from ["\x27](node:fs|node:path|fs|path)' packages/dogpile-adapter/src/evaluation-mission.ts` → zero matches. The static no-fs contract test (`packages/dogpile-adapter/src/no-fs.contract.test.ts`) should still pass for the whole package.
  </action>
  <verify>
    <automated>pnpm --filter @protostar/dogpile-adapter test --run evaluation-mission && pnpm --filter @protostar/dogpile-adapter test --run no-fs</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c 'evaluationPilePreset' packages/dogpile-adapter/src/index.ts` is at least 2 (declaration + barrel reference if any)
    - `grep -c '"Qwen3-Next-80B-A3B-MLX-4bit"' packages/dogpile-adapter/src/index.ts` is 1
    - `grep -c '"DeepSeek-Coder-V2-Lite-Instruct"' packages/dogpile-adapter/src/index.ts` is 1
    - `grep -c 'EVAL_CONSENSUS_AGENT_DEFAULT' packages/dogpile-adapter/src/index.ts` is at least 1
    - `grep -c 'export function buildEvaluationMission' packages/dogpile-adapter/src/evaluation-mission.ts` is 1
    - All 5 rubric dim names appear in evaluation-mission.ts: `grep -c 'acMet\|codeQuality\|security\|regressionRisk\|releaseReadiness' packages/dogpile-adapter/src/evaluation-mission.ts` is at least 5
    - 10 test cases green
    - Static no-fs contract test still passes for dogpile-adapter
  </acceptance_criteria>
  <done>4th pile preset + mission builder landed; no-fs contract intact.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Pile output (model-generated JSON) → parser | Single-ingress strict shape gate; never throws |
| Mission text → model | Mission contains intent + diff + evidence; deterministic so cross-run is reproducible |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-08-05-01 | Tampering | evaluation-pile-result.ts | mitigate | Parser rejects unknown rubric keys + missing keys + out-of-range values. Empty critique array is permitted (runner refuses upstream — explicit boundary). |
| T-08-05-02 | Information Disclosure | evaluation-mission.ts | mitigate | stdoutTail truncated to bounded chars (2000) — limits accidental secret bleed if a future archetype dumps env into stdout. Runner is responsible for redaction at the source if needed. |
| T-08-05-03 | Tampering | dogpile-adapter no-fs | mitigate | Static no-fs contract test still passes; new files audited. |
</threat_model>

<verification>
- `pnpm --filter @protostar/evaluation test` green
- `pnpm --filter @protostar/dogpile-adapter test` green (no-fs contract included)
- `pnpm --filter @protostar/dogpile-adapter build` green
</verification>

<success_criteria>
- evaluationPilePreset declared, shape mirrors reviewPilePreset, baseline agent only
- buildEvaluationMission emits text containing all 5 rubric dimensions + intent + diff + exit codes
- parseEvaluationPileResult is single-ingress, never throws, exhaustive errors
- Consensus agent default exported as a constant for Plan 08-06 to extend at invocation
</success_criteria>

<output>
Create `.planning/phases/08-evaluation-evolution/08-05-SUMMARY.md` enumerating the new preset + mission builder + parser surfaces and noting the consensus agent is appended by Plan 08-06's runner.
</output>
