---
phase: 08-evaluation-evolution
reviewed: 2026-04-28T17:30:28Z
depth: standard
files_reviewed: 71
files_reviewed_list:
  - .gitignore
  - apps/factory-cli/package.json
  - apps/factory-cli/src/calibration-log.test.ts
  - apps/factory-cli/src/calibration-log.ts
  - apps/factory-cli/src/cli-args.ts
  - apps/factory-cli/src/evolution-chain-index.test.ts
  - apps/factory-cli/src/evolution-chain-index.ts
  - apps/factory-cli/src/evolution-snapshot-writer.test.ts
  - apps/factory-cli/src/evolution-snapshot-writer.ts
  - apps/factory-cli/src/exec-coord-trigger.ts
  - apps/factory-cli/src/load-factory-config.test.ts
  - apps/factory-cli/src/load-factory-config.ts
  - apps/factory-cli/src/main.ts
  - apps/factory-cli/src/refusals-index.test.ts
  - apps/factory-cli/src/refusals-index.ts
  - apps/factory-cli/tsconfig.json
  - package.json
  - packages/admission-e2e/package.json
  - packages/admission-e2e/src/calibration-log-append.contract.test.ts
  - packages/admission-e2e/src/eval-refusal-byte-equality.contract.test.ts
  - packages/admission-e2e/src/evaluation-runner-no-fs.contract.test.ts
  - packages/admission-e2e/src/no-skipped-evaluation.contract.test.ts
  - packages/admission-e2e/src/planning-mission-prior-summary.contract.test.ts
  - packages/admission-e2e/tsconfig.json
  - packages/dogpile-adapter/src/evaluation-mission.test.ts
  - packages/dogpile-adapter/src/evaluation-mission.ts
  - packages/dogpile-adapter/src/index.ts
  - packages/dogpile-adapter/src/pile-failure-types.test.ts
  - packages/dogpile-adapter/src/pile-failure-types.ts
  - packages/dogpile-adapter/src/public-candidate-plan.contract.test.ts
  - packages/evaluation-runner/package.json
  - packages/evaluation-runner/src/index.test.ts
  - packages/evaluation-runner/src/index.ts
  - packages/evaluation-runner/src/no-fs.contract.test.ts
  - packages/evaluation-runner/src/run-evaluation-stages.test.ts
  - packages/evaluation-runner/src/run-evaluation-stages.ts
  - packages/evaluation-runner/tsconfig.build.json
  - packages/evaluation-runner/tsconfig.json
  - packages/evaluation/package.json
  - packages/evaluation/src/compute-mechanical-scores.test.ts
  - packages/evaluation/src/compute-mechanical-scores.ts
  - packages/evaluation/src/compute-semantic-confidence.test.ts
  - packages/evaluation/src/compute-semantic-confidence.ts
  - packages/evaluation/src/create-evaluation-report.test.ts
  - packages/evaluation/src/create-evaluation-report.ts
  - packages/evaluation/src/create-spec-ontology-snapshot.test.ts
  - packages/evaluation/src/create-spec-ontology-snapshot.ts
  - packages/evaluation/src/evaluate-consensus.test.ts
  - packages/evaluation/src/evaluate-consensus.ts
  - packages/evaluation/src/evaluation-pile-result.test.ts
  - packages/evaluation/src/evaluation-pile-result.ts
  - packages/evaluation/src/index.ts
  - packages/evaluation/src/lineage-hash.test.ts
  - packages/evaluation/src/lineage-hash.ts
  - packages/evaluation/src/should-run-consensus.test.ts
  - packages/evaluation/src/should-run-consensus.ts
  - packages/evaluation/src/types.test.ts
  - packages/evaluation/tsconfig.json
  - packages/lmstudio-adapter/src/factory-config.schema.json
  - packages/lmstudio-adapter/src/factory-config.test.ts
  - packages/lmstudio-adapter/src/factory-config.ts
  - packages/mechanical-checks/src/create-mechanical-checks-adapter.test.ts
  - packages/mechanical-checks/src/create-mechanical-checks-adapter.ts
  - packages/mechanical-checks/src/findings.test.ts
  - packages/mechanical-checks/src/findings.ts
  - packages/mechanical-checks/src/index.ts
  - packages/review/src/index.ts
  - packages/review/src/mechanical-scores.test.ts
  - pnpm-lock.yaml
  - pnpm-workspace.yaml
  - tsconfig.json
findings:
  critical: 3
  warning: 1
  info: 0
  total: 4
status: issues_found
---

# Phase 08: Code Review Report

**Reviewed:** 2026-04-28T17:30:28Z
**Depth:** standard
**Files Reviewed:** 71
**Status:** issues_found

## Summary

Reviewed the Phase 8 evaluation/evolution implementation with emphasis on release gating, evaluation refusals, authority boundaries, and mechanical-score propagation. The main risks are gate-level: failed evaluation reports can still continue toward release, and mechanical scores produced by the review loop are discarded before evaluation.

## Critical Issues

### CR-01: BLOCKER - Failed evaluation reports do not block release

**File:** `apps/factory-cli/src/main.ts:1068`
**Issue:** The CLI only halts when `evaluationResult.refusal` is present. A valid evaluation report with `verdict: "fail"` but no pile refusal continues through snapshot/chain writes, optional delivery execution, and final status calculation. The final factory status is then derived from `review.verdict` at line 1295, not `evaluationReport.verdict`, so a semantic evaluation failure can still produce `ready-to-release`.
**Fix:**
```ts
const evaluationReport = evaluationResult.report;
if (evaluationReport.verdict !== "pass") {
  await writeJson(resolve(runDir, "evaluation-report.json"), evaluationReport);
  throw new CliExitError("Evaluation failed; release is blocked.", 1);
}
```
Also add a factory-cli test where semantic judges return a high-confidence failing verdict and assert no delivery is attempted and the run is blocked.

### CR-02: BLOCKER - Mechanical scores are dropped before evaluation

**File:** `apps/factory-cli/src/main.ts:1010`
**Issue:** `reviewGateFromLoopResult` rebuilds a fresh `ReviewGate` from only `runId`, `planId`, and loop status, with `findings: []` and no `mechanicalScores` (`apps/factory-cli/src/main.ts:1639`). `runEvaluationStages` only consumes the Phase 8 mechanical score source when `reviewGate.mechanicalScores` exists (`packages/evaluation-runner/src/run-evaluation-stages.ts:171`); otherwise it fabricates scores from coarse execution status and assumes full AC coverage. This hides real lint, diff-size, and AC-coverage failures from the evaluation report.
**Fix:**
```ts
function reviewGateFromLoopResult(loop: ReviewRepairLoopResult): ReviewGate {
  const last = loop.iterations.at(-1);
  if (last === undefined) throw new Error("review loop produced no iterations");
  return last.mechanicalGate;
}
```
If model verdict must be reflected too, preserve `mechanicalScores` and findings while merging the model result explicitly.

### CR-03: BLOCKER - Empty consensus output crashes instead of producing a pile-evaluation refusal

**File:** `packages/evaluation-runner/src/run-evaluation-stages.ts:149`
**Issue:** `parseEvaluationPileResult` accepts `{ "judgeCritiques": [] }` as valid. If consensus is required and the consensus pile returns that shape, `evaluateConsensus([])` throws. The throw is not caught, so the runner does not return a structured `pile-evaluation` refusal and the CLI cannot write the required refusal artifact.
**Fix:**
```ts
if (consensusParsed.body.judgeCritiques.length === 0) {
  return {
    report: createEvaluationReport({ runId: input.runId, mechanical, semantic }),
    evolutionDecision,
    snapshot,
    mechanical,
    semantic,
    refusal: schemaParseFailure(["judgeCritiques must contain at least one critique"])
  };
}
```
Add the same non-empty validation for semantic output, or enforce it directly in `parseEvaluationPileResult`.

## Warnings

### WR-01: WARNING - stdoutTail truncation keeps the oldest output instead of the tail

**File:** `packages/dogpile-adapter/src/evaluation-mission.ts:40`
**Issue:** `truncateStdoutTail` uses `stdoutTail.slice(0, STDOUT_TAIL_LIMIT)`. If callers pass full command output, the evaluation mission keeps the beginning and drops the most recent failure context, despite the field being named `stdoutTail`.
**Fix:** Use `stdoutTail.slice(-STDOUT_TAIL_LIMIT)` and add a test with a long string whose important failure text appears at the end.

---

_Reviewed: 2026-04-28T17:30:28Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
