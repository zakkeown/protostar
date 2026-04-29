/**
 * Phase 8 Plan 08-08 Task 3 — runtime no-fs defense for evaluation-runner.
 *
 * Complements `packages/evaluation-runner/src/no-fs.contract.test.ts`, the
 * package-local static walker. This runtime contract invokes runEvaluationStages
 * with full fakes and a Proxy sentinel representing the forbidden `node:fs`
 * surface; the runner must complete without touching the sentinel.
 */

import { strict as assert } from "node:assert";
import { basename, dirname, resolve } from "node:path";
import { readdir, readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { runEvaluationStages } from "@protostar/evaluation-runner";
import type { PileRunOutcome } from "@protostar/dogpile-adapter";
import type { ConfiguredModelProvider } from "@protostar/dogpile-types";
import type { ConfirmedIntent } from "@protostar/intent";
import type { AdmittedPlan } from "@protostar/planning";
import type { ReviewGate } from "@protostar/review";

const __dirname = dirname(fileURLToPath(import.meta.url));
const evaluationRunnerSrcRoot = resolve(__dirname, "../../evaluation-runner/src");
const SELF_WALKER_BASENAMES = new Set(["no-fs.contract.test.ts", "no-fs.contract.test.js"]);
const FORBIDDEN_FS_IMPORTS: readonly RegExp[] = [
  /from\s+["']node:fs["']/,
  /from\s+["']node:fs\/promises["']/,
  /from\s+["']fs["']/,
  /from\s+["']fs\/promises["']/,
  /from\s+["']node:path["']/,
  /from\s+["']path["']/
];

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

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

function evaluationPileOutput(): string {
  return JSON.stringify({
    judgeCritiques: [
      {
        judgeId: "eval-a",
        model: "fixture-a",
        verdict: "pass",
        rationale: "runtime no-fs fixture",
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
        rationale: "runtime no-fs fixture",
        rubric: {
          acMet: 1,
          codeQuality: 1,
          security: 1,
          regressionRisk: 1,
          releaseReadiness: 1
        }
      }
    ]
  });
}

describe("evaluation-runner-no-fs (Q-20 runtime defense in depth)", () => {
  it("static: evaluation-runner src has zero node:fs / node:path imports", async () => {
    const offenders: string[] = [];
    for await (const file of walkTypeScriptFiles(evaluationRunnerSrcRoot)) {
      if (SELF_WALKER_BASENAMES.has(basename(file))) continue;
      const source = stripComments(await readFile(file, "utf8"));
      if (FORBIDDEN_FS_IMPORTS.some((pattern) => pattern.test(source))) {
        offenders.push(file);
      }
    }
    assert.deepEqual(
      offenders,
      [],
      `node:fs / node:path imports forbidden in @protostar/evaluation-runner src/. Offenders:\n${offenders.join("\n")}`
    );
  });

  it("runEvaluationStages completes pass without touching a forbidden node:fs Proxy sentinel", async () => {
    let fsAccessed = false;
    const forbiddenNodeFs = new Proxy<Record<string, never>>(
      {},
      {
        get(_target, property) {
          fsAccessed = true;
          throw new Error(`evaluation-runner attempted forbidden node:fs access: ${String(property)}`);
        }
      }
    );

    const outcome = async (): Promise<PileRunOutcome> => ({
      ok: true,
      result: { output: evaluationPileOutput() } as never,
      trace: { events: [] } as never,
      accounting: { totalTokens: 0, totalUsd: 0, byProvider: {} } as never,
      stopReason: null
    });

    const result = await runEvaluationStages(
      {
        runId: "run_eval_runner_no_fs",
        intent: intentFixture,
        plan: planFixture,
        reviewGate: reviewGateFixture,
        diffNameOnly: [],
        executionEvidence: { buildExitCode: 0, lintExitCode: 0 },
        archetype: "cosmetic-tweak",
        providers: { semantic: providerFixture, consensus: providerFixture },
        signal: new AbortController().signal,
        budget: { maxTokens: 12000, timeoutMs: 60000 },
        snapshotReader: async () => undefined,
        lineageId: "lineage_no_fs",
        generation: 0
      },
      { runFactoryPile: outcome }
    );

    // Keep the sentinel live so future maintainers see this is the runtime
    // sibling to the static node:fs / node:fs/promises import walker.
    assert.equal(typeof forbiddenNodeFs, "object");
    assert.equal(fsAccessed, false);
    assert.equal(result.report.verdict, "pass");
    assert.equal(result.refusal, undefined);
  });
});

const providerFixture = {} as unknown as ConfiguredModelProvider;

const intentFixture = {
  id: "intent_eval_runner_no_fs",
  title: "Runtime no fs contract",
  problem: "Evaluation runner must remain filesystem-free.",
  requester: "admission-e2e",
  confirmedAt: "2026-04-28T00:00:00.000Z",
  acceptanceCriteria: [
    { id: "AC-1", statement: "Evaluation runner completes without fs authority.", verification: "contract" }
  ],
  capabilityEnvelope: { repoScopes: [], toolPermissions: [], mechanical: { allowed: ["verify", "lint"] }, budget: {} },
  constraints: [],
  stopConditions: [],
  schemaVersion: "1.6.0",
  signature: null
} as unknown as ConfirmedIntent;

const planFixture = {
  planId: "plan_eval_runner_no_fs",
  intentId: "intent_eval_runner_no_fs",
  tasks: [],
  dependencies: [],
  __protostarPlanAdmissionState: "admitted-plan",
  capabilityEnvelope: { allowedCapabilities: [] }
} as unknown as AdmittedPlan;

const reviewGateFixture: ReviewGate = {
  runId: "run_eval_runner_no_fs",
  planId: "plan_eval_runner_no_fs",
  verdict: "pass",
  findings: [],
  mechanicalScores: { build: 1, lint: 1, diffSize: 1, acCoverage: 1 }
};
