import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { ConfiguredModelProvider, RunResult } from "@protostar/dogpile-types";
import type { ConfirmedIntent } from "@protostar/intent";
import type { AdmittedPlan } from "@protostar/planning";
import type { ReviewGate } from "@protostar/review";
import type { PileRunContext, PileRunOutcome, ResolvedPileBudget } from "@protostar/dogpile-adapter";
import type { EvaluationRubricDimension, OntologySnapshot } from "@protostar/evaluation";

import { runEvaluationStages, type RunEvaluationStagesInput } from "./run-evaluation-stages.js";

const provider = {} as ConfiguredModelProvider;
const signal = new AbortController().signal;
const budget: ResolvedPileBudget = { maxTokens: 1000, timeoutMs: 1000 };

function rubric(score: number): Readonly<Record<EvaluationRubricDimension, number>> {
  return {
    acMet: score,
    codeQuality: score,
    security: score,
    regressionRisk: score,
    releaseReadiness: score
  };
}

function pileJson(scores: readonly number[], verdict: "pass" | "fail" = "pass"): string {
  return JSON.stringify({
    judgeCritiques: scores.map((score, index) => ({
      judgeId: `judge-${index + 1}`,
      model: `model-${index + 1}`,
      rubric: rubric(score),
      verdict,
      rationale: "ok"
    }))
  });
}

function runResult(output: string): RunResult {
  return { output } as unknown as RunResult;
}

function okOutcome(output: string): PileRunOutcome {
  return {
    ok: true,
    result: runResult(output),
    trace: {} as never,
    accounting: {} as never,
    stopReason: null
  };
}

function baseInput(overrides: Partial<RunEvaluationStagesInput> = {}): RunEvaluationStagesInput {
  return {
    runId: "run-eval",
    intent: {
      title: "Evaluate the run",
      problem: "Need a reliable evaluation",
      acceptanceCriteria: [
        { id: "AC-1", statement: "Evaluation exists", verification: { type: "manual", command: "inspect" } }
      ]
    } as unknown as ConfirmedIntent,
    plan: {
      planId: "plan-eval",
      strategy: "test",
      tasks: [{ id: "task-1", title: "Build evaluator" }]
    } as unknown as AdmittedPlan,
    reviewGate: {
      runId: "run-eval",
      planId: "plan-eval",
      verdict: "pass",
      findings: [],
      mechanicalScores: { build: 1, lint: 1, diffSize: 1, acCoverage: 1 }
    } as ReviewGate,
    diffNameOnly: ["packages/evaluation-runner/src/run-evaluation-stages.ts"],
    executionEvidence: { buildExitCode: 0, lintExitCode: 0, stdoutTail: "green" },
    archetype: "feature-add",
    providers: { semantic: provider, consensus: provider },
    signal,
    budget,
    snapshotReader: async () => undefined,
    lineageId: "lineage-a",
    generation: 1,
    ...overrides
  };
}

function fakeRunner(outcomes: readonly PileRunOutcome[]) {
  const calls: Array<{ agentCount: number; provider: ConfiguredModelProvider }> = [];
  const runFactoryPile = async (
    mission: { preset: { agents: readonly unknown[] } },
    ctx: PileRunContext
  ): Promise<PileRunOutcome> => {
    calls.push({ agentCount: mission.preset.agents.length, provider: ctx.provider });
    const outcome = outcomes[calls.length - 1];
    if (outcome === undefined) {
      throw new Error(`unexpected pile call ${calls.length}`);
    }
    return outcome;
  };
  return { runFactoryPile, calls };
}

describe("runEvaluationStages", () => {
  it("passes high-confidence semantic evaluation without consensus", async () => {
    const fake = fakeRunner([okOutcome(pileJson([0.95, 0.95]))]);

    const result = await runEvaluationStages(baseInput(), { runFactoryPile: fake.runFactoryPile });

    assert.equal(result.report.verdict, "pass");
    assert.equal(result.report.stages.length, 2);
    assert.equal(fake.calls.length, 1);
    assert.equal(result.refusal, undefined);
  });

  it("runs consensus for low confidence and passes when consensus passes", async () => {
    const fake = fakeRunner([okOutcome(pileJson([1, 0.2])), okOutcome(pileJson([0.95, 0.95]))]);

    const result = await runEvaluationStages(baseInput(), { runFactoryPile: fake.runFactoryPile });

    assert.equal(result.report.verdict, "pass");
    assert.equal(result.report.stages.length, 3);
    assert.equal(fake.calls.length, 2);
    assert.equal(fake.calls[1]?.agentCount, 2);
  });

  it("still attempts semantic evaluation when mechanical evaluation fails", async () => {
    const fake = fakeRunner([okOutcome(pileJson([0.95, 0.95]))]);

    const result = await runEvaluationStages(baseInput({
      reviewGate: {
        runId: "run-eval",
        planId: "plan-eval",
        verdict: "block",
        findings: [],
        mechanicalScores: { build: 0, lint: 1, diffSize: 1, acCoverage: 1 }
      }
    }), { runFactoryPile: fake.runFactoryPile });

    assert.equal(result.mechanical.verdict, "fail");
    assert.equal(result.report.verdict, "fail");
    assert.equal(fake.calls.length, 1);
  });

  it("returns semantic pile failures as evaluation refusals", async () => {
    const fake = fakeRunner([{ ok: false, failure: { kind: "evaluation", class: "pile-timeout", elapsedMs: 10, configuredTimeoutMs: 1000 } }]);

    const result = await runEvaluationStages(baseInput(), { runFactoryPile: fake.runFactoryPile });

    assert.equal(result.refusal?.class, "pile-timeout");
    assert.equal(result.refusal?.kind, "evaluation");
    assert.equal(result.report.verdict, "fail");
  });

  it("returns malformed semantic JSON as an EvaluationResult parse refusal", async () => {
    const fake = fakeRunner([okOutcome("not json")]);

    const result = await runEvaluationStages(baseInput(), { runFactoryPile: fake.runFactoryPile });

    assert.equal(result.refusal?.class, "pile-schema-parse");
    assert.equal(result.refusal?.kind, "evaluation");
    assert.deepEqual(result.refusal?.sourceOfTruth, "EvaluationResult");
  });

  it("returns semantic rubric shape errors as parse refusals", async () => {
    const fake = fakeRunner([okOutcome(JSON.stringify({ judgeCritiques: [{ judgeId: "bad", model: "bad", rubric: { unknown: 1 }, verdict: "pass", rationale: "bad" }] }))]);

    const result = await runEvaluationStages(baseInput(), { runFactoryPile: fake.runFactoryPile });

    assert.equal(result.refusal?.class, "pile-schema-parse");
    assert.equal(result.report.verdict, "fail");
  });

  it("returns eval-consensus-block when harsh consensus thresholds fail", async () => {
    const fake = fakeRunner([okOutcome(pileJson([1, 0.2])), okOutcome(pileJson([0.7, 0.7]))]);

    const result = await runEvaluationStages(baseInput(), { runFactoryPile: fake.runFactoryPile });

    assert.equal(result.refusal?.class, "eval-consensus-block");
    assert.deepEqual(result.refusal?.thresholdsHit, ["meanJudges", "minJudges", "meanDims", "minDims"]);
    assert.equal(result.report.verdict, "fail");
  });

  it("continues evolution when snapshotReader returns no previous snapshot", async () => {
    const fake = fakeRunner([okOutcome(pileJson([0.95, 0.95]))]);

    const result = await runEvaluationStages(baseInput(), { runFactoryPile: fake.runFactoryPile });

    assert.equal(result.evolutionDecision.action, "continue");
    assert.equal(result.evolutionDecision.reason, "No previous ontology snapshot exists yet.");
  });

  it("converges evolution when the previous snapshot is similar", async () => {
    const prior: OntologySnapshot = {
      generation: 0,
      fields: [{ name: "AC-1", type: "acceptance-criterion", description: "Evaluation exists" }]
    };
    const fake = fakeRunner([okOutcome(pileJson([0.95, 0.95]))]);

    const result = await runEvaluationStages(baseInput({ snapshotReader: async () => prior }), {
      runFactoryPile: fake.runFactoryPile
    });

    assert.equal(result.evolutionDecision.action, "converged");
  });

  it("exhausts evolution at generation 30", async () => {
    const fake = fakeRunner([okOutcome(pileJson([0.95, 0.95]))]);

    const result = await runEvaluationStages(baseInput({ generation: 30 }), { runFactoryPile: fake.runFactoryPile });

    assert.equal(result.evolutionDecision.action, "exhausted");
  });
});
