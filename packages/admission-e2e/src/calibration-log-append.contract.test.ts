/**
 * Phase 8 Plan 08-08 Task 5 — calibration log append contract (Q-18).
 *
 * Pins the append-only JSONL shape Phase 10 will consume without touching the
 * real workspace `.protostar` directory.
 */

import { strict as assert } from "node:assert";
import { appendFile, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { describe, it } from "node:test";

import { runEvaluationStages } from "@protostar/evaluation-runner";
import type { OntologySnapshot } from "@protostar/evaluation";
import type { PileRunOutcome } from "@protostar/dogpile-adapter";
import type { ConfiguredModelProvider } from "@protostar/dogpile-types";
import type { ConfirmedIntent } from "@protostar/intent";
import type { AdmittedPlan } from "@protostar/planning";
import type { ReviewGate } from "@protostar/review";

const CALIBRATION_LOG_PATH = ".protostar/calibration/ontology-similarity.jsonl";

interface CalibrationEntry {
  readonly runId: string;
  readonly lineageId: string;
  readonly generation: number;
  readonly similarity?: number;
  readonly threshold: number;
  readonly evolutionAction: "continue" | "converged" | "exhausted";
  readonly timestamp: string;
}

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "protostar-calibration-contract-"));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function appendCalibrationEntry(filePath: string, entry: CalibrationEntry): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await appendFile(filePath, `${JSON.stringify(entry)}\n`, "utf8");
}

async function lineCount(path: string): Promise<number> {
  try {
    const body = await readFile(path, "utf8");
    return body.length === 0 ? 0 : body.trimEnd().split("\n").length;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return 0;
    throw error;
  }
}

async function lastLine(path: string): Promise<Record<string, unknown>> {
  const lines = (await readFile(path, "utf8")).trimEnd().split("\n");
  const last = lines.at(-1);
  assert.equal(typeof last, "string");
  return JSON.parse(last as string) as Record<string, unknown>;
}

async function runAndAppend(input: {
  readonly tempDir: string;
  readonly runId: string;
  readonly lineageId: string;
  readonly generation: number;
  readonly previous?: OntologySnapshot;
}): Promise<Record<string, unknown>> {
  const logPath = resolve(input.tempDir, CALIBRATION_LOG_PATH);
  const before = await lineCount(logPath);
  const result = await runEvaluationStages(
    {
      runId: input.runId,
      intent: intentFixture,
      plan: planFixture,
      reviewGate: reviewGateFixture,
      diffNameOnly: [],
      executionEvidence: { buildExitCode: 0, lintExitCode: 0 },
      archetype: "cosmetic-tweak",
      providers: { semantic: providerFixture, consensus: providerFixture },
      signal: new AbortController().signal,
      budget: { maxTokens: 12000, timeoutMs: 60000 },
      snapshotReader: async () => input.previous,
      lineageId: input.lineageId,
      generation: input.generation,
      convergenceThreshold: 0.95
    },
    { runFactoryPile: async () => evaluationOutcome() }
  );

  await appendCalibrationEntry(logPath, {
    runId: input.runId,
    lineageId: input.lineageId,
    generation: input.generation,
    ...(result.evolutionDecision.similarity !== undefined
      ? { similarity: result.evolutionDecision.similarity.score }
      : {}),
    threshold: 0.95,
    evolutionAction: result.evolutionDecision.action,
    timestamp: "2026-04-28T00:00:00.000Z"
  });
  const after = await lineCount(logPath);
  assert.equal(after, before + 1);
  return await lastLine(logPath);
}

function evaluationOutcome(): PileRunOutcome {
  return {
    ok: true,
    result: {
      output: JSON.stringify({
        judgeCritiques: [
          {
            judgeId: "eval-a",
            model: "fixture-a",
            verdict: "pass",
            rationale: "calibration contract fixture",
            rubric: {
              acMet: 1,
              codeQuality: 1,
              security: 1,
              regressionRisk: 1,
              releaseReadiness: 1
            }
          },
          {
            judgeId: "eval-b",
            model: "fixture-b",
            verdict: "pass",
            rationale: "calibration contract fixture",
            rubric: {
              acMet: 1,
              codeQuality: 1,
              security: 1,
              regressionRisk: 1,
              releaseReadiness: 1
            }
          }
        ]
      })
    } as never,
    trace: { events: [] } as never,
    accounting: { totalTokens: 0, totalUsd: 0, byProvider: {} } as never,
    stopReason: null
  };
}

describe("calibration-log-append (Q-18)", () => {
  it("first run appends exactly one line with no similarity and evolutionAction continue", async () => {
    await withTempDir(async (tempDir) => {
      const line = await runAndAppend({
        tempDir,
        runId: "run_calibration_first",
        lineageId: "lineage_calibration",
        generation: 0
      });

      assert.equal(line["runId"], "run_calibration_first");
      assert.equal(line["lineageId"], "lineage_calibration");
      assert.equal(line["generation"], 0);
      assert.equal(line["similarity"], undefined);
      assert.equal(line["threshold"], 0.95);
      assert.equal(line["evolutionAction"], "continue");
      assert.equal(line["timestamp"], "2026-04-28T00:00:00.000Z");
    });
  });

  it("second run appends exactly one line with numeric similarity and continue-or-converged action", async () => {
    await withTempDir(async (tempDir) => {
      const line = await runAndAppend({
        tempDir,
        runId: "run_calibration_second",
        lineageId: "lineage_calibration",
        generation: 1,
        previous: {
          generation: 0,
          fields: [{ name: "AC-1", type: "contract", description: "previous" }]
        }
      });

      assert.equal(typeof line["similarity"], "number");
      assert.ok(line["evolutionAction"] === "continue" || line["evolutionAction"] === "converged");
    });
  });
});

const providerFixture = {} as unknown as ConfiguredModelProvider;

const intentFixture = {
  id: "intent_calibration_contract",
  title: "Calibration contract",
  problem: "Calibration entries should be append-only and parseable.",
  requester: "admission-e2e",
  confirmedAt: "2026-04-28T00:00:00.000Z",
  acceptanceCriteria: [
    { id: "AC-1", statement: "Calibration log entries are emitted.", verification: "contract" }
  ],
  capabilityEnvelope: { repoScopes: [], toolPermissions: [], budget: {} },
  constraints: [],
  stopConditions: [],
  schemaVersion: "1.5.0",
  signature: null
} as unknown as ConfirmedIntent;

const planFixture = {
  planId: "plan_calibration_contract",
  intentId: "intent_calibration_contract",
  tasks: [],
  dependencies: [],
  __protostarPlanAdmissionState: "admitted-plan",
  capabilityEnvelope: { allowedCapabilities: [] }
} as unknown as AdmittedPlan;

const reviewGateFixture: ReviewGate = {
  runId: "run_calibration_contract",
  planId: "plan_calibration_contract",
  verdict: "pass",
  findings: [],
  mechanicalScores: { build: 1, lint: 1, diffSize: 1, acCoverage: 1 }
};
