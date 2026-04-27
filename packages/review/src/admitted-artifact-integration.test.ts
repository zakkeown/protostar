import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  prepareExecutionRun,
  runExecutionDryRun
} from "@protostar/execution";
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
import { buildConfirmedIntentForTest } from "@protostar/intent/internal/test-builders";

import {
  createMechanicalReviewGate,
  createReviewGate,
  runMechanicalReviewExecutionLoop,
  validateReviewAdmittedPlanArtifact
} from "./index.js";

const noRequiredCapabilities = {
  repoScopes: [],
  toolPermissions: [],
  budget: {}
} as const satisfies PlanTaskRequiredCapabilities;

const planId = "plan_review_loaded_planning_admission";
const intentId = "intent_review_loaded_planning_admission";
const planGraphUri = "plan.json";

type PlanningIntent = Parameters<typeof createPlanGraph>[0]["intent"];

const admittedIntent: PlanningIntent = buildConfirmedIntentForTest({
  id: intentId,
  title: "Load planning admission before review",
  problem: "Review must consume only an admitted artifact derived from persisted planning-admission.json.",
  requester: "ouroboros-ac-160303",
  confirmedAt: "2026-04-26T00:00:00.000Z",
  acceptanceCriteria: [
    {
      id: "ac_loaded_planning_admission_review",
      statement: "A valid persisted planning-admission.json can be loaded and passed into review.",
      verification: "test"
    }
  ],
  capabilityEnvelope: {
    repoScopes: [],
    toolPermissions: [
      {
        tool: "node:test",
        permissionLevel: "execute",
        reason: "Run review admitted-artifact integration tests.",
        risk: "low"
      }
    ],
    budget: {
      timeoutMs: 30_000,
      maxRepairLoops: 0
    }
  },
  constraints: ["Review entrypoints must not receive raw PlanGraph proof evidence."],
  stopConditions: []
});

describe("review admitted artifact integration", () => {
  it("loads persisted planning-admission.json and reviews execution derived from the admitted artifact", async () => {
    await withTempDir(async (runDir) => {
      const graph = createReviewAdmissionGraph(planId);
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
      const reviewAdmissionValidation = validateReviewAdmittedPlanArtifact(handoff.executionArtifact);

      assert.equal(reviewAdmissionValidation.ok, true);

      const execution = prepareExecutionRun({
        runId: "run_review_loaded_planning_admission",
        admittedPlan: handoff.executionArtifact,
        workspace: {
          root: runDir,
          trust: "trusted",
          defaultBranch: "main"
        }
      });
      const executionResult = runExecutionDryRun({
        execution,
        now: () => "2026-04-26T00:00:00.000Z"
      });
      const reviewGate = createMechanicalReviewGate({
        admittedPlan: handoff.executionArtifact,
        execution,
        executionResult
      });
      const loopResult = runMechanicalReviewExecutionLoop({
        admittedPlan: handoff.executionArtifact,
        execution,
        maxRepairLoops: 0,
        now: () => "2026-04-26T00:00:00.000Z"
      });

      assert.equal(executionResult.status, "passed");
      assert.equal(reviewGate.verdict, "pass");
      assert.equal(loopResult.status, "approved");
      assert.equal(loopResult.finalReviewGate.verdict, "pass");
    });
  });

  it("rejects malformed persisted planning-admission.json before a review gate is created", async () => {
    await withTempDir(async (runDir) => {
      const validArtifact = await createAdmittedPlanExecutionArtifactFixture(runDir);
      const execution = prepareExecutionRun({
        runId: "run_review_malformed_planning_admission",
        admittedPlan: validArtifact,
        workspace: {
          root: runDir,
          trust: "trusted",
          defaultBranch: "main"
        }
      });
      const artifactPath = join(runDir, PLANNING_ADMISSION_ARTIFACT_NAME);
      let reviewGate: ReturnType<typeof createReviewGate> | undefined;

      await writeFile(artifactPath, "{ malformed planning admission", "utf8");

      await assert.rejects(
        async () => {
          const loadedAdmission = await loadPlanningAdmission(runDir);
          reviewGate = createReviewGate({
            admittedPlan: loadedAdmission as unknown as AdmittedPlanExecutionArtifact,
            execution
          });
        },
        /Malformed planning-admission\.json/
      );

      const boundaryValidation = validateReviewAdmittedPlanArtifact(
        "{ malformed planning admission"
      );

      assert.equal(reviewGate, undefined);
      assert.equal(boundaryValidation.ok, false);
      if (!boundaryValidation.ok) {
        assert.deepEqual(boundaryValidation.violations.map((violation) => violation.code), [
          "review-admission-boundary-invalid-artifact"
        ]);
        assert.equal(
          boundaryValidation.violations[0]?.executionViolationCode,
          "admitted-plan-artifact-not-object"
        );
      }
    });
  });

  it("rejects missing planning-admission.json evidence before a review gate is created", async () => {
    await withTempDir(async (runDir) => {
      const validArtifact = await createAdmittedPlanExecutionArtifactFixture(runDir);
      const execution = prepareExecutionRun({
        runId: "run_review_missing_planning_admission",
        admittedPlan: validArtifact,
        workspace: {
          root: runDir,
          trust: "trusted",
          defaultBranch: "main"
        }
      });
      let reviewGate: ReturnType<typeof createReviewGate> | undefined;

      await rm(join(runDir, PLANNING_ADMISSION_ARTIFACT_NAME), { force: true });

      await assert.rejects(
        async () => {
          const loadedAdmission = await loadPlanningAdmission(runDir);
          reviewGate = createReviewGate({
            admittedPlan: loadedAdmission as unknown as AdmittedPlanExecutionArtifact,
            execution
          });
        },
        /Missing planning-admission\.json/
      );

      const boundaryValidation = validateReviewAdmittedPlanArtifact(undefined);

      assert.equal(reviewGate, undefined);
      assert.equal(boundaryValidation.ok, false);
      if (!boundaryValidation.ok) {
        assert.deepEqual(boundaryValidation.violations.map((violation) => violation.code), [
          "review-admission-boundary-invalid-artifact"
        ]);
        assert.equal(
          boundaryValidation.violations[0]?.executionViolationCode,
          "admitted-plan-artifact-not-object"
        );
      }
    });
  });

  it("rejects non-admitted persisted planning-admission.json at the review boundary", async () => {
    await withTempDir(async (runDir) => {
      const validArtifact = await createAdmittedPlanExecutionArtifactFixture(runDir);
      const execution = prepareExecutionRun({
        runId: "run_review_rejected_planning_admission",
        admittedPlan: validArtifact,
        workspace: {
          root: runDir,
          trust: "trusted",
          defaultBranch: "main"
        }
      });
      const executionResult = runExecutionDryRun({
        execution,
        now: () => "2026-04-26T00:00:00.000Z"
      });
      const graph = createReviewAdmissionGraph(
        "plan_review_loaded_rejected_planning_admission"
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
      let reviewGate: ReturnType<typeof createMechanicalReviewGate> | undefined;

      assert.equal(rejectedAdmission.admitted, false);
      await writeFile(artifactPath, `${JSON.stringify(rejectedAdmission, null, 2)}\n`, "utf8");

      const loadedAdmission = await loadPlanningAdmission(runDir);
      const boundaryValidation = validateReviewAdmittedPlanArtifact(loadedAdmission);

      assert.equal(loadedAdmission.admitted, false);
      assert.equal(boundaryValidation.ok, false);
      if (!boundaryValidation.ok) {
        assert.ok(
          boundaryValidation.violations.some(
            (violation) =>
              violation.code === "review-admission-boundary-invalid-artifact" &&
              violation.executionViolationCode ===
                "admitted-plan-artifact-blocked-planning-admission"
          )
        );
        assert.match(
          boundaryValidation.errors.join("\n"),
          /blocked planning-admission\.json evidence/
        );
      }

      assert.throws(
        () => {
          reviewGate = createMechanicalReviewGate({
            admittedPlan: loadedAdmission as unknown as AdmittedPlanExecutionArtifact,
            execution,
            executionResult
          });
        },
        /Invalid admitted plan review artifact: .*blocked planning-admission\.json evidence/
      );
      assert.equal(reviewGate, undefined);
    });
  });
});

function createReviewAdmissionGraph(graphPlanId: string) {
  return createPlanGraph({
    planId: graphPlanId,
    intent: admittedIntent,
    strategy: "Persist planning admission, reload it, and hand review a thin admitted artifact.",
    tasks: [
      {
        id: "task-review-load-admission",
        title: "Load admitted planning evidence",
        kind: "verification",
        dependsOn: [],
        covers: ["ac_loaded_planning_admission_review"],
        requiredCapabilities: noRequiredCapabilities,
        risk: "low"
      },
      {
        id: "task-review-execution-derived-from-admission",
        title: "Review execution derived from admitted evidence",
        kind: "verification",
        dependsOn: ["task-review-load-admission"],
        covers: ["ac_loaded_planning_admission_review"],
        requiredCapabilities: noRequiredCapabilities,
        risk: "low"
      }
    ],
    createdAt: "2026-04-26T00:00:00.000Z"
  });
}

async function createAdmittedPlanExecutionArtifactFixture(
  runDir: string
): Promise<AdmittedPlanExecutionArtifact> {
  const graph = createReviewAdmissionGraph(planId);
  const loadedAdmission = await persistAndLoadPlanningAdmission(runDir, graph);
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

  return handoff.executionArtifact;
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
  const runDir = await mkdtemp(join(tmpdir(), "protostar-review-admission-"));
  try {
    return await callback(runDir);
  } finally {
    await rm(runDir, { recursive: true, force: true });
  }
}
