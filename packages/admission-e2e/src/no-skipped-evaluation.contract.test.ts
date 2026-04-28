/**
 * Phase 8 Plan 08-08 Task 1 — no skipped evaluation verdicts (EVAL-04 / Q-11).
 *
 * Two-layer contract:
 * 1. Static: `packages/evaluation/src` must not reintroduce the `"skipped"`
 *    verdict literal.
 * 2. Runtime: evaluation reports produced by the real runner contain only
 *    pass/fail stage verdicts, including the high-confidence semantic path
 *    where consensus is not required.
 */

import { strict as assert } from "node:assert";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { runEvaluationStages } from "@protostar/evaluation-runner";
import type { PileRunOutcome } from "@protostar/dogpile-adapter";
import type { ConfiguredModelProvider } from "@protostar/dogpile-types";
import type { ConfirmedIntent } from "@protostar/intent";
import type { AdmittedPlan } from "@protostar/planning";
import type { ReviewGate } from "@protostar/review";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../../..");
const evaluationSrcRoot = resolve(repoRoot, "packages/evaluation/src");

async function* walkTypeScriptFiles(dir: string): AsyncGenerator<string> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkTypeScriptFiles(full);
    } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")) {
      yield full;
    }
  }
}

function validEvaluationOutput(rubricScore = 1): string {
  return JSON.stringify({
    judgeCritiques: [
      {
        judgeId: "eval-a",
        model: "fixture-a",
        verdict: rubricScore >= 0.5 ? "pass" : "fail",
        rationale: "contract fixture",
        rubric: rubric(rubricScore)
      },
      {
        judgeId: "eval-b",
        model: "fixture-b",
        verdict: rubricScore >= 0.5 ? "pass" : "fail",
        rationale: "contract fixture",
        rubric: rubric(rubricScore)
      }
    ]
  });
}

function lowConfidencePassingEvaluationOutput(): string {
  return JSON.stringify({
    judgeCritiques: [
      {
        judgeId: "eval-a",
        model: "fixture-a",
        verdict: "pass",
        rationale: "contract fixture",
        rubric: rubric(1)
      },
      {
        judgeId: "eval-b",
        model: "fixture-b",
        verdict: "pass",
        rationale: "contract fixture",
        rubric: rubric(0)
      }
    ]
  });
}

function rubric(value: number): Record<string, number> {
  return {
    acMet: value,
    codeQuality: value,
    security: value,
    regressionRisk: value,
    releaseReadiness: value
  };
}

async function writeReportBody(report: unknown, name: string): Promise<string> {
  const outDir = resolve(repoRoot, "packages/admission-e2e/dist/contract-output");
  await mkdir(outDir, { recursive: true });
  const path = resolve(outDir, `${name}-evaluation-report.json`);
  await writeFile(path, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return await readFile(path, "utf8");
}

async function runReport(input: {
  readonly name: string;
  readonly mechanicalScores: ReviewGate["mechanicalScores"];
  readonly semanticOutput: string;
  readonly consensusOutput?: string;
}): Promise<{ readonly stages: readonly Record<string, unknown>[]; readonly raw: string }> {
  let callCount = 0;
  const outcome = async (): Promise<PileRunOutcome> => {
    callCount += 1;
    return {
      ok: true,
      result: { output: callCount === 1 ? input.semanticOutput : input.consensusOutput ?? input.semanticOutput } as never,
      trace: { events: [] } as never,
      accounting: { totalTokens: 0, totalUsd: 0, byProvider: {} } as never,
      stopReason: null
    };
  };
  const result = await runEvaluationStages(
    {
      runId: `run_${input.name}`,
      intent: intentFixture,
      plan: planFixture,
      reviewGate: {
        runId: `run_${input.name}`,
        planId: "plan_contract",
        verdict: input.mechanicalScores?.build === 0 ? "block" : "pass",
        findings: [],
        ...(input.mechanicalScores !== undefined ? { mechanicalScores: input.mechanicalScores } : {})
      },
      diffNameOnly: [],
      executionEvidence: { buildExitCode: 0, lintExitCode: 0 },
      archetype: "cosmetic-tweak",
      providers: { semantic: providerFixture, consensus: providerFixture },
      signal: new AbortController().signal,
      budget: { maxTokens: 12000, timeoutMs: 60000 },
      snapshotReader: async () => undefined,
      lineageId: `lineage_${input.name}`,
      generation: 0
    },
    { runFactoryPile: outcome }
  );
  const raw = await writeReportBody(result.report, input.name);
  return { stages: result.report.stages as unknown as readonly Record<string, unknown>[], raw };
}

function assertOnlyPassFail(stages: readonly Record<string, unknown>[], raw: string): void {
  assert.ok(stages.length > 0);
  for (const stage of stages) {
    assert.ok(
      stage["verdict"] === "pass" || stage["verdict"] === "fail",
      `stage verdict must be pass|fail, got ${String(stage["verdict"])}`
    );
  }
  assert.equal(raw.includes('"skipped"'), false, "evaluation-report.json must not contain the banned literal");
}

describe("no-skipped-evaluation (EVAL-04 / Q-11)", () => {
  it("static: packages/evaluation/src contains zero banned \"skipped\" verdict literals", async () => {
    const offenders: string[] = [];
    for await (const file of walkTypeScriptFiles(evaluationSrcRoot)) {
      const source = await readFile(file, "utf8");
      if (source.includes('"skipped"')) {
        offenders.push(file);
      }
    }
    assert.deepEqual(offenders, [], `evaluation source must not contain "skipped":\n${offenders.join("\n")}`);
  });

  it("runtime: all-stages-pass report emits three pass/fail stage verdicts", async () => {
    const report = await runReport({
      name: "all_pass",
      mechanicalScores: { build: 1, lint: 1, diffSize: 1, acCoverage: 1 },
      semanticOutput: lowConfidencePassingEvaluationOutput(),
      consensusOutput: validEvaluationOutput(1)
    });
    assert.equal(report.stages.length, 3);
    assertOnlyPassFail(report.stages, report.raw);
  });

  it("runtime: mechanical-fail report still emits semantic and consensus verdicts", async () => {
    const report = await runReport({
      name: "mechanical_fail",
      mechanicalScores: { build: 0, lint: 1, diffSize: 1, acCoverage: 1 },
      semanticOutput: lowConfidencePassingEvaluationOutput(),
      consensusOutput: validEvaluationOutput(1)
    });
    assert.equal(report.stages.length, 3);
    assert.equal(report.stages[0]?.["verdict"], "fail");
    assertOnlyPassFail(report.stages, report.raw);
  });

  it("runtime: consensus-not-required report emits two verdict stages and never \"skipped\"", async () => {
    const report = await runReport({
      name: "consensus_not_required",
      mechanicalScores: { build: 1, lint: 1, diffSize: 1, acCoverage: 1 },
      semanticOutput: validEvaluationOutput(1)
    });
    assert.equal(report.stages.length, 2);
    assertOnlyPassFail(report.stages, report.raw);
  });
});

const providerFixture = {} as unknown as ConfiguredModelProvider;

const intentFixture = {
  id: "intent_eval_contract",
  title: "Contract evaluation",
  problem: "Pin evaluation contract behavior.",
  requester: "admission-e2e",
  confirmedAt: "2026-04-28T00:00:00.000Z",
  acceptanceCriteria: [
    { id: "AC-1", statement: "Evaluation report verdicts are concrete.", verification: "contract" }
  ],
  capabilityEnvelope: { repoScopes: [], toolPermissions: [], budget: {} },
  constraints: [],
  stopConditions: [],
  schemaVersion: "1.5.0",
  signature: null
} as unknown as ConfirmedIntent;

const planFixture = {
  planId: "plan_contract",
  intentId: "intent_eval_contract",
  tasks: [],
  dependencies: [],
  __protostarPlanAdmissionState: "admitted-plan",
  capabilityEnvelope: { allowedCapabilities: [] }
} as unknown as AdmittedPlan;
