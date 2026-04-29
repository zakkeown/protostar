import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { ExecutionAdapter } from "@protostar/execution";
import type { AdmittedPlanExecutionArtifact, ExecutionRunResult } from "@protostar/planning";
import type { FsAdapter } from "@protostar/repo";
import type { MechanicalCheckResult, ModelReviewer, ReviewFinding } from "@protostar/review";

import {
  buildReviewRepairServices,
  defaultMechanicalCommandsForArchetype,
  runReviewRepairLoopWithDurablePersistence
} from "./review-loop.js";

describe("buildReviewRepairServices", () => {
  it("returns callable mechanical, model, and persistence services", async () => {
    const fs = memoryFs();
    const services = buildReviewRepairServices({
      fs,
      gitFs: {} as never,
      runsRoot: "/runs",
      workspaceRoot: "/workspace",
      factoryConfig: factoryConfig(),
      archetype: "cosmetic-tweak",
      admittedPlan: admittedPlan(),
      runId: "run_1",
      baseRef: "main",
      executor: executor(),
      subprocess: subprocess(),
      mechanicalChecksFactory: finalMechanicalAdapter({ findings: [] }),
      judgeFactory: () => async () => ({ verdict: "pass", critiques: [] })
    });

    assert.equal(typeof services.mechanicalChecker, "function");
    assert.equal(typeof services.modelReviewer, "function");
    assert.equal(typeof services.persistence.writeReviewDecision, "function");
    assert.equal((await services.modelReviewer(modelReviewInput())).verdict, "pass");
  });

  it("drives the mechanical-checks adapter and extracts final evidence into a review gate", async () => {
    const finding = findingForTask("task-1");
    const services = buildReviewRepairServices({
      fs: memoryFs(),
      gitFs: {} as never,
      runsRoot: "/runs",
      workspaceRoot: "/workspace",
      factoryConfig: factoryConfig(),
      archetype: "cosmetic-tweak",
      admittedPlan: admittedPlan(),
      runId: "run_1",
      baseRef: "main",
      executor: executor(),
      subprocess: subprocess(),
      mechanicalChecksFactory: finalMechanicalAdapter({ findings: [finding] }),
      computeDiffNameOnly: async () => [],
      judgeFactory: () => async () => ({ verdict: "pass", critiques: [] })
    });

    const result = await services.mechanicalChecker({
      admittedPlan: admittedPlan(),
      executionResult,
      attempt: 2,
      runId: "run_1"
    });

    assert.equal(result.result.attempt, 2);
    assert.equal(result.gate.verdict, "repair");
    assert.deepEqual(result.gate.findings, [finding]);
  });

  it("passes injected readFile and subprocess capabilities to mechanical-checks", async () => {
    const fs = memoryFs();
    const runner = subprocess();
    let received: Record<string, unknown> | undefined;
    buildReviewRepairServices({
      fs,
      gitFs: {} as never,
      runsRoot: "/runs",
      workspaceRoot: "/workspace",
      factoryConfig: factoryConfig(),
      archetype: "cosmetic-tweak",
      admittedPlan: admittedPlan(),
      runId: "run_1",
      baseRef: "main",
      executor: executor(),
      subprocess: runner,
      mechanicalChecksFactory: (config: { readonly runId: string; readonly attempt: number }) => {
        received = config as unknown as Record<string, unknown>;
        return finalMechanicalAdapter({ findings: [] })(config);
      },
      judgeFactory: () => async () => ({ verdict: "pass", critiques: [] })
    });

    assert.equal(received?.["readFile"], fs.readFile);
    assert.equal(received?.["subprocess"], runner);
  });

  it("wraps the LM Studio judge factory as a ModelReviewer", async () => {
    const reviewer: ModelReviewer = async () => ({ verdict: "pass", critiques: [] });
    const services = buildReviewRepairServices({
      fs: memoryFs(),
      gitFs: {} as never,
      runsRoot: "/runs",
      workspaceRoot: "/workspace",
      factoryConfig: factoryConfig(),
      archetype: "cosmetic-tweak",
      admittedPlan: admittedPlan(),
      runId: "run_1",
      baseRef: "main",
      executor: executor(),
      subprocess: subprocess(),
      mechanicalChecksFactory: finalMechanicalAdapter({ findings: [] }),
      judgeFactory: () => reviewer
    });

    assert.equal(services.modelReviewer, reviewer);
  });

  it("defaults cosmetic-tweak mechanical commands when config omits commands", () => {
    assert.deepEqual(defaultMechanicalCommandsForArchetype("cosmetic-tweak"), [
      { id: "verify", argv: ["pnpm", "verify"] },
      { id: "lint", argv: ["pnpm", "lint"] }
    ]);
  });

  it("persists review artifacts under runsRoot/runId/review", async () => {
    const fs = memoryFs();
    const services = buildReviewRepairServices({
      fs,
      gitFs: {} as never,
      runsRoot: "/runs",
      workspaceRoot: "/workspace",
      factoryConfig: factoryConfig(),
      archetype: "cosmetic-tweak",
      admittedPlan: admittedPlan(),
      runId: "run_1",
      baseRef: "main",
      executor: executor(),
      subprocess: subprocess(),
      mechanicalChecksFactory: finalMechanicalAdapter({ findings: [] }),
      computeDiffNameOnly: async () => [],
      judgeFactory: () => async () => ({ verdict: "pass", critiques: [] })
    });

    const decision = await services.persistence.writeReviewDecision({
      runId: "run_1",
      artifact: { ok: true }
    });

    assert.equal(decision.decisionPath, "/runs/run_1/review/review-decision.json");
    assert.equal(fs.writes.has("/runs/run_1/review/review-decision.json"), true);
  });
});

describe("runReviewRepairLoopWithDurablePersistence", () => {
  it("delegates to runReviewRepairLoop with built durable services", async () => {
    const result = await runReviewRepairLoopWithDurablePersistence({
      fs: memoryFs(),
      gitFs: {} as never,
      runsRoot: "/runs",
      workspaceRoot: "/workspace",
      factoryConfig: factoryConfig(),
      archetype: "cosmetic-tweak",
      admittedPlan: admittedPlan(),
      runId: "run_1",
      baseRef: "main",
      executor: executor(),
      initialExecution: executionResult,
      confirmedIntent: {
        capabilityEnvelope: { budget: { maxRepairLoops: 0 } }
      } as never,
      subprocess: subprocess(),
      mechanicalChecksFactory: finalMechanicalAdapter({ findings: [] }),
      computeDiffNameOnly: async () => [],
      judgeFactory: () => async () => ({ verdict: "pass", critiques: [] })
    });

    assert.equal(result.status, "approved");
  });
});

function finalMechanicalAdapter(input: {
  readonly findings: readonly ReviewFinding[];
}) {
  return (config: { readonly runId: string; readonly attempt: number }): ExecutionAdapter => ({
    id: "mechanical-checks",
    async *execute() {
      const evidence: MechanicalCheckResult = {
        schemaVersion: "1.0.0",
        runId: config.runId,
        attempt: config.attempt,
        commands: [],
        diffNameOnly: ["README.md"],
        findings: input.findings
      };
      yield {
        kind: "final",
        result: {
          outcome: "change-set",
          changeSet: { workspace: { root: "/workspace", trust: "trusted" }, branch: "HEAD", patches: [] },
          evidence: evidence as never
        }
      };
    }
  });
}

function memoryFs(): FsAdapter & {
  readonly writes: Map<string, string>;
  readonly readFile: (path: string) => Promise<string>;
} {
  const writes = new Map<string, string>();
  return {
    writes,
    async mkdir() {},
    async writeFile(path, content) {
      writes.set(path, String(content));
    },
    async appendFile(path, content) {
      writes.set(path, `${writes.get(path) ?? ""}${String(content)}`);
    },
    async rename(from, to) {
      writes.set(to, writes.get(from) ?? "");
      writes.delete(from);
    },
    async fsync() {},
    async readFile(path) {
      return writes.get(path) ?? "";
    }
  };
}

function factoryConfig() {
  return {
    config: {
      adapters: {
        coder: {
          provider: "lmstudio",
          baseUrl: "http://localhost:1234/v1",
          model: "coder",
          apiKeyEnv: "LMSTUDIO_API_KEY"
        },
        judge: {
          provider: "lmstudio",
          baseUrl: "http://localhost:1234/v1",
          model: "judge",
          apiKeyEnv: "LMSTUDIO_API_KEY"
        }
      },
      factory: {
        headlessMode: "local-daemon",
        llmBackend: "lmstudio",
        nonInteractive: false,
        stress: {
          caps: {
            tttDelivery: { maxAttempts: 50, maxWallClockDays: 14 },
            sustainedLoad: { maxRuns: 500, maxWallClockDays: 7 },
            concurrency: { maxSessions: 20, maxWallClockDays: 3 },
            faultInjection: { maxFaults: 100, maxWallClockDays: 3 }
          }
        }
      }
    },
    configHash: "hash",
    resolvedFromFile: false,
    envOverridesApplied: []
  } as const;
}

function admittedPlan(): AdmittedPlanExecutionArtifact {
  return {
    planId: "plan_1",
    intentId: "intent_1",
    admittedPlan: {
      planId: "plan_1",
      uri: "plan.json",
      pointer: "#",
      sourceOfTruth: "PlanGraph"
    },
    evidence: {
      planId: "plan_1",
      intentId: "intent_1",
      planGraphUri: "plan.json",
      planningAdmissionArtifact: "planning-admission.json",
      planningAdmissionUri: "planning-admission.json",
      validationSource: "planning-admission.json",
      proofSource: "PlanGraph"
    },
    tasks: [
      {
        planTaskId: "task-1",
        title: "Task 1",
        dependsOn: [],
        targetFiles: ["README.md"]
      }
    ]
  } as unknown as AdmittedPlanExecutionArtifact;
}

const executionResult: ExecutionRunResult = {
  schemaVersion: "1.0.0",
  runId: "run_1",
  attempt: 0,
  status: "completed",
  journalArtifact: { stage: "execution", kind: "journal", uri: "journal.jsonl", description: "journal" },
  perTask: []
};

function modelReviewInput() {
  return {
    admittedPlan: admittedPlan(),
    executionResult,
    mechanicalGate: {
      planId: "plan_1",
      runId: "run_1",
      verdict: "pass",
      findings: []
    },
    diff: { nameOnly: [], unifiedDiff: "" }
  } as const;
}

function executor() {
  return {
    async executeRepairTasks() {
      return executionResult;
    }
  };
}

function subprocess() {
  return {
    async runCommand() {
      return {
        exitCode: 0,
        stdoutPath: "/tmp/stdout",
        stderrPath: "/tmp/stderr"
      };
    }
  };
}

function findingForTask(planTaskId: string): ReviewFinding {
  return {
    ruleId: "execution-completed",
    severity: "major",
    summary: "needs repair",
    evidence: [],
    repairTaskId: planTaskId
  };
}
