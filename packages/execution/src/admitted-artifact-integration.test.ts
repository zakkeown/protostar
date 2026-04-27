import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  assertAdmittedPlanHandoff,
  createPlanGraph,
  createPlanningAdmissionArtifact,
  defineCandidatePlan,
  PLANNING_ADMISSION_ARTIFACT_NAME,
  type AdmittedPlanExecutionArtifact,
  type PlanTaskRequiredCapabilities,
  type PlanningAdmissionArtifactPayload
} from "@protostar/planning";
import { defineWorkspace } from "@protostar/repo";
import { buildConfirmedIntentForTest } from "@protostar/intent/internal/test-builders";

import {
  prepareExecutionRun,
  runExecutionDryRun,
  validateAdmittedPlanExecutionArtifact
} from "./index.js";

const noRequiredCapabilities = {
  repoScopes: [],
  toolPermissions: [],
  budget: {}
} as const satisfies PlanTaskRequiredCapabilities;

const planId = "plan_execution_loaded_planning_admission";
const intentId = "intent_execution_loaded_planning_admission";
const planGraphUri = "plan.json";

type PlanningIntent = Parameters<typeof createPlanGraph>[0]["intent"];

const admittedIntent: PlanningIntent = buildConfirmedIntentForTest({
  id: intentId,
  title: "Load planning admission before execution",
  problem: "Execution must consume only an admitted artifact derived from persisted planning-admission.json.",
  requester: "ouroboros-ac-160303",
  confirmedAt: "2026-04-26T00:00:00.000Z",
  acceptanceCriteria: [
    {
      id: "ac_loaded_planning_admission_execution",
      statement: "A valid persisted planning-admission.json can be loaded and passed into execution.",
      verification: "test"
    }
  ],
  capabilityEnvelope: {
    repoScopes: [],
    toolPermissions: [
      {
        tool: "node:test",
        permissionLevel: "execute",
        reason: "Run execution admitted-artifact integration tests.",
        risk: "low"
      }
    ],
    budget: {
      timeoutMs: 30_000,
      maxRepairLoops: 0
    }
  },
  constraints: ["Execution entrypoints must not receive raw PlanGraph proof evidence."],
  stopConditions: []
});

describe("execution admitted artifact integration", () => {
  it("loads persisted planning-admission.json and prepares execution from the admitted artifact", async () => {
    await withTempDir(async (runDir) => {
      const graph = createExecutionAdmissionGraph(planId);
      const loadedAdmission = await persistAndLoadPlanningAdmission(runDir, graph);

      assert.equal(loadedAdmission.artifact, PLANNING_ADMISSION_ARTIFACT_NAME);
      assert.equal(loadedAdmission.admitted, true);

      const handoff = assertAdmittedPlanHandoff({
        plan: graph,
        planningAdmission: loadedAdmission,
        planningAdmissionArtifact: {
          artifact: PLANNING_ADMISSION_ARTIFACT_NAME,
          uri: PLANNING_ADMISSION_ARTIFACT_NAME,
          persisted: true
        },
        planGraphUri
      });
      const admissionValidation = validateAdmittedPlanExecutionArtifact(handoff.executionArtifact);

      assert.equal(admissionValidation.ok, true);

      const execution = prepareExecutionRun({
        runId: "run_execution_loaded_planning_admission",
        admittedPlan: handoff.executionArtifact,
        workspace: defineWorkspace({
          root: runDir,
          trust: "trusted",
          defaultBranch: "main"
        })
      });

      assert.equal(execution.planId, planId);
      assert.deepEqual(execution.admittedPlan, handoff.executionArtifact.evidence);
      assert.deepEqual(
        execution.tasks.map((task) => task.planTaskId),
        ["task-execution-load-admission", "task-execution-prepare-from-admission"]
      );

      const executionResult = runExecutionDryRun({
        execution,
        now: () => "2026-04-26T00:00:00.000Z"
      });

      assert.equal(executionResult.status, "succeeded");
    });
  });

  it("rejects malformed persisted planning-admission.json before an execution run is created", async () => {
    await withTempDir(async (runDir) => {
      const artifactPath = join(runDir, PLANNING_ADMISSION_ARTIFACT_NAME);
      let execution: ReturnType<typeof prepareExecutionRun> | undefined;

      await writeFile(artifactPath, "{ malformed planning admission", "utf8");

      await assert.rejects(
        async () => {
          const loadedAdmission = await loadPlanningAdmission(runDir);
          execution = prepareExecutionRun({
            runId: "run_execution_malformed_planning_admission",
            admittedPlan: loadedAdmission as unknown as AdmittedPlanExecutionArtifact,
            workspace: defineWorkspace({
              root: runDir,
              trust: "trusted",
              defaultBranch: "main"
            })
          });
        },
        /Malformed planning-admission\.json/
      );

      const boundaryValidation = validateAdmittedPlanExecutionArtifact(
        "{ malformed planning admission"
      );

      assert.equal(execution, undefined);
      assert.equal(boundaryValidation.ok, false);
      if (!boundaryValidation.ok) {
        assert.deepEqual(boundaryValidation.violations.map((violation) => violation.code), [
          "admitted-plan-artifact-not-object"
        ]);
      }
    });
  });

  it("rejects missing planning-admission.json evidence before an execution run is created", async () => {
    await withTempDir(async (runDir) => {
      let execution: ReturnType<typeof prepareExecutionRun> | undefined;

      await assert.rejects(
        async () => {
          const loadedAdmission = await loadPlanningAdmission(runDir);
          execution = prepareExecutionRun({
            runId: "run_execution_missing_planning_admission",
            admittedPlan: loadedAdmission as unknown as AdmittedPlanExecutionArtifact,
            workspace: defineWorkspace({
              root: runDir,
              trust: "trusted",
              defaultBranch: "main"
            })
          });
        },
        /Missing planning-admission\.json/
      );

      const boundaryValidation = validateAdmittedPlanExecutionArtifact(undefined);

      assert.equal(execution, undefined);
      assert.equal(boundaryValidation.ok, false);
      if (!boundaryValidation.ok) {
        assert.deepEqual(boundaryValidation.violations.map((violation) => violation.code), [
          "admitted-plan-artifact-not-object"
        ]);
      }
    });
  });

  it("rejects non-admitted persisted planning-admission.json at the execution boundary", async () => {
    await withTempDir(async (runDir) => {
      const graph = createExecutionAdmissionGraph(
        "plan_execution_loaded_rejected_planning_admission"
      );
      const rejectedGraph = defineCandidatePlan({
        ...graph,
        tasks: graph.tasks.map((task) => ({
          ...task,
          covers: []
        }))
      });
      const rejectedAdmission = createPlanningAdmissionArtifact({
        graph: rejectedGraph,
        intent: admittedIntent,
        planGraphUri,
        planningAdmissionUri: PLANNING_ADMISSION_ARTIFACT_NAME
      });
      const artifactPath = join(runDir, PLANNING_ADMISSION_ARTIFACT_NAME);
      let execution: ReturnType<typeof prepareExecutionRun> | undefined;

      assert.equal(rejectedAdmission.admitted, false);
      await writeFile(artifactPath, `${JSON.stringify(rejectedAdmission, null, 2)}\n`, "utf8");

      const loadedAdmission = await loadPlanningAdmission(runDir);
      const boundaryValidation = validateAdmittedPlanExecutionArtifact(loadedAdmission);

      assert.equal(loadedAdmission.admitted, false);
      assert.equal(boundaryValidation.ok, false);
      if (!boundaryValidation.ok) {
        assert.ok(
          boundaryValidation.violations.some(
            (violation) =>
              violation.code === "admitted-plan-artifact-blocked-planning-admission" &&
              violation.path === "admittedPlan"
          )
        );
        assert.ok(
          boundaryValidation.violations.some(
            (violation) =>
              violation.code === "admitted-plan-artifact-missing-field" &&
              violation.path === "admittedPlan.tasks"
          )
        );
      }

      assert.throws(
        () => {
          execution = prepareExecutionRun({
            runId: "run_execution_rejected_planning_admission",
            admittedPlan: loadedAdmission as unknown as AdmittedPlanExecutionArtifact,
            workspace: defineWorkspace({
              root: runDir,
              trust: "trusted",
              defaultBranch: "main"
            })
          });
        },
        /Invalid admitted plan execution artifact: .*blocked planning-admission\.json evidence/
      );
      assert.equal(execution, undefined);
    });
  });
});

function createExecutionAdmissionGraph(graphPlanId: string) {
  return createPlanGraph({
    planId: graphPlanId,
    intent: admittedIntent,
    strategy: "Persist planning admission, reload it, and hand execution a thin admitted artifact.",
    tasks: [
      {
        id: "task-execution-load-admission",
        title: "Load admitted planning evidence",
        kind: "verification",
        dependsOn: [],
        covers: ["ac_loaded_planning_admission_execution"],
        requiredCapabilities: noRequiredCapabilities,
        risk: "low"
      },
      {
        id: "task-execution-prepare-from-admission",
        title: "Prepare execution from admitted evidence",
        kind: "implementation",
        dependsOn: ["task-execution-load-admission"],
        covers: ["ac_loaded_planning_admission_execution"],
        requiredCapabilities: noRequiredCapabilities,
        risk: "low"
      }
    ],
    createdAt: "2026-04-26T00:00:00.000Z"
  });
}

async function persistAndLoadPlanningAdmission(
  runDir: string,
  graph: Parameters<typeof createPlanningAdmissionArtifact>[0]["graph"]
): Promise<PlanningAdmissionArtifactPayload> {
  const artifact = createPlanningAdmissionArtifact({
    graph,
    intent: admittedIntent,
    planGraphUri,
    planningAdmissionUri: PLANNING_ADMISSION_ARTIFACT_NAME,
    admittedAt: "2026-04-26T00:00:00.000Z"
  });
  const artifactPath = join(runDir, PLANNING_ADMISSION_ARTIFACT_NAME);

  assert.equal(artifact.admitted, true);

  await writeFile(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");

  return loadPlanningAdmission(runDir);
}

async function loadPlanningAdmission(runDir: string): Promise<PlanningAdmissionArtifactPayload> {
  const artifactPath = join(runDir, PLANNING_ADMISSION_ARTIFACT_NAME);
  let contents: string;

  try {
    contents = await readFile(artifactPath, "utf8");
  } catch (error) {
    throw new Error(`Missing ${PLANNING_ADMISSION_ARTIFACT_NAME}: ${String(error)}`);
  }

  try {
    return JSON.parse(contents) as PlanningAdmissionArtifactPayload;
  } catch (error) {
    throw new Error(`Malformed ${PLANNING_ADMISSION_ARTIFACT_NAME}: ${String(error)}`);
  }
}

async function withTempDir<T>(callback: (runDir: string) => Promise<T>): Promise<T> {
  const runDir = await mkdtemp(join(tmpdir(), "protostar-execution-admission-"));
  try {
    return await callback(runDir);
  } finally {
    await rm(runDir, { recursive: true, force: true });
  }
}
