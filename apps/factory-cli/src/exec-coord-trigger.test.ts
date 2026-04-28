/// <reference types="node" />

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildConfirmedIntentForTest } from "@protostar/intent/internal/test-builders";
import {
  admitCandidatePlan,
  defineCandidatePlan,
  type AdmittedPlanExecutionArtifact,
  type AdmittedPlanRecord,
  type PlanGraph,
  type PlanningAdmissionAcceptedArtifactPayload,
  type PlanTaskRequiredCapabilities
} from "@protostar/planning";
import type { PileRunContext, PileRunOutcome } from "@protostar/dogpile-adapter";
import type { RepairPlan } from "@protostar/review";

import {
  DEFAULT_WORK_SLICING_HEURISTIC,
  invokeRepairPlanRefinementPile,
  invokeWorkSlicingPile,
  RefiningRefusedAuthorityExpansion,
  shouldInvokeWorkSlicing,
  type InvokeExecCoordPileDeps,
  type InvokeExecCoordPersistInput
} from "./exec-coord-trigger.js";

const intent = buildConfirmedIntentForTest({
  id: "intent_exec_coord_trigger",
  title: "Phase 6 Plan 06-10 exec-coord trigger module",
  problem: "Exercise PILE-03 runtime invocation paths via DI-stubbed runFactoryPile.",
  requester: "ouroboros-ac-061000",
  confirmedAt: "2026-04-28T00:00:00.000Z",
  acceptanceCriteria: [
    {
      id: "ac_exec_coord_trigger",
      statement: "Both exec-coord trigger seams admit pile output through their domain admission helpers.",
      verification: "test"
    }
  ],
  capabilityEnvelope: {
    repoScopes: [],
    toolPermissions: [
      {
        tool: "node:test",
        permissionLevel: "execute",
        reason: "Run the exec-coord trigger module tests.",
        risk: "low"
      }
    ],
    budget: { timeoutMs: 30_000, maxRepairLoops: 1 }
  },
  constraints: ["Exec-coord pile output must flow through admit*."]
});

const noRequiredCapabilities = {
  repoScopes: [],
  toolPermissions: [],
  budget: {}
} as const satisfies PlanTaskRequiredCapabilities;

function buildAdmittedPlanWithTaskTargetFiles(targetFileCount: number): AdmittedPlanRecord {
  const targetFiles = Array.from({ length: targetFileCount }, (_, i) => `src/file-${i + 1}.ts`);
  const graph = defineCandidatePlan({
    planId: "plan_exec_coord_trigger",
    intentId: intent.id,
    createdAt: "2026-04-28T00:00:00.000Z",
    strategy: "Single task whose targetFiles count drives the heuristic.",
    acceptanceCriteria: intent.acceptanceCriteria.map(({ id, statement, verification }) => ({
      id,
      statement,
      verification
    })),
    tasks: [
      {
        id: "task-parent",
        title: "Parent task with N target files",
        kind: "implementation",
        dependsOn: [],
        covers: ["ac_exec_coord_trigger"],
        targetFiles,
        acceptanceTestRefs: [
          {
            acId: "ac_exec_coord_trigger",
            testFile: "src/feature.test.ts",
            testName: "task-parent covers ac_exec_coord_trigger"
          }
        ],
        requiredCapabilities: noRequiredCapabilities,
        risk: "low"
      }
    ]
  } as const satisfies PlanGraph);
  const admission = admitCandidatePlan({ graph, intent });
  if (!admission.ok) {
    throw new Error(`fixture admission failed: ${JSON.stringify(admission.rejectionReasons)}`);
  }
  return admission.admittedPlan;
}

// Minimal AdmittedPlanExecutionArtifact synthesizer for tests. We only need
// `tasks[]` for computeRepairSubgraph; the handoff branding is bypassed via
// `as unknown as` since these tests exercise pure trigger logic, not handoff
// validation.
function buildSyntheticArtifact(
  admittedPlan: AdmittedPlanRecord
): AdmittedPlanExecutionArtifact {
  return {
    planId: admittedPlan.planId,
    intentId: admittedPlan.intentId,
    tasks: admittedPlan.tasks.map((t) => ({
      planTaskId: t.id,
      title: t.title,
      dependsOn: t.dependsOn,
      ...(t.targetFiles !== undefined ? { targetFiles: t.targetFiles } : {})
    }))
  } as unknown as AdmittedPlanExecutionArtifact;
}

// ---------- shouldInvokeWorkSlicing ----------

describe("shouldInvokeWorkSlicing", () => {
  it("returns false for a plan with one task and one target file (default config)", () => {
    const plan = buildAdmittedPlanWithTaskTargetFiles(1);
    assert.equal(shouldInvokeWorkSlicing(plan, DEFAULT_WORK_SLICING_HEURISTIC), false);
  });

  it("returns true when a task exceeds default maxTargetFiles=3", () => {
    const plan = buildAdmittedPlanWithTaskTargetFiles(4);
    assert.equal(shouldInvokeWorkSlicing(plan, DEFAULT_WORK_SLICING_HEURISTIC), true);
  });

  it("returns false at the boundary (targetFiles.length == maxTargetFiles)", () => {
    const plan = buildAdmittedPlanWithTaskTargetFiles(3);
    assert.equal(shouldInvokeWorkSlicing(plan, DEFAULT_WORK_SLICING_HEURISTIC), false);
  });

  it("respects custom maxTargetFiles raising the threshold", () => {
    const plan = buildAdmittedPlanWithTaskTargetFiles(4);
    assert.equal(
      shouldInvokeWorkSlicing(plan, { maxTargetFiles: 10, maxEstimatedTurns: 5 }),
      false
    );
  });

  it("returns false on an empty task list", () => {
    assert.equal(
      shouldInvokeWorkSlicing({ tasks: [] }, DEFAULT_WORK_SLICING_HEURISTIC),
      false
    );
  });
});

// ---------- helpers for invocation tests ----------

function makeRecordingDeps(opts: {
  readonly outcome: PileRunOutcome;
}): {
  deps: InvokeExecCoordPileDeps;
  callsToRunPile: number;
  persistedRecords: InvokeExecCoordPersistInput[];
} {
  let callsToRunPile = 0;
  const persistedRecords: InvokeExecCoordPersistInput[] = [];
  const ctx: PileRunContext = {
    provider: { id: "stub", model: "stub" } as unknown as PileRunContext["provider"],
    signal: new AbortController().signal,
    budget: { timeoutMs: 1000 } as unknown as PileRunContext["budget"]
  };
  const deps: InvokeExecCoordPileDeps = {
    runFactoryPile: (async () => {
      callsToRunPile += 1;
      return opts.outcome;
    }) as unknown as InvokeExecCoordPileDeps["runFactoryPile"],
    buildContext: () => ctx,
    persist: async (input) => {
      persistedRecords.push(input);
    }
  };
  return {
    deps,
    get callsToRunPile() { return callsToRunPile; },
    persistedRecords
  };
}

function okOutcome(output: string): PileRunOutcome {
  return {
    ok: true,
    result: { output, eventLog: { events: [] } } as never,
    trace: { events: [] } as never,
    accounting: { totalTokens: 0 } as never,
    stopReason: null
  };
}

function failOutcome(): PileRunOutcome {
  return {
    ok: false,
    failure: {
      kind: "execution-coordination",
      class: "pile-timeout",
      elapsedMs: 1000,
      configuredTimeoutMs: 1000
    } as never
  };
}

function stubPlanningAdmissionPayload(plan: AdmittedPlanRecord): PlanningAdmissionAcceptedArtifactPayload {
  return {
    schemaVersion: "1.0.0",
    artifact: "planning-admission.json",
    runId: "run-trigger",
    planId: plan.planId,
    intentId: plan.intentId,
    decision: "admit",
    admissionStatus: "accepted",
    candidatePlanGraphUri: "plan.json",
    admittedPlanGraph: plan,
    rejectionReasons: [],
    evidence: {
      validators: [],
      proofs: []
    }
  } as unknown as PlanningAdmissionAcceptedArtifactPayload;
}

// ---------- invokeWorkSlicingPile ----------

describe("invokeWorkSlicingPile", () => {
  it("happy path: pile ok + valid proposal → admitWorkSlicing accepts → result.ok=true with sliced plan", async () => {
    const plan = buildAdmittedPlanWithTaskTargetFiles(4);
    const planningAdmission = stubPlanningAdmissionPayload(plan);
    const proposalOutput = JSON.stringify({
      kind: "work-slicing",
      slices: [
        {
          taskId: "task-parent-slice-1",
          parentTaskId: "task-parent",
          targetFiles: ["src/file-1.ts", "src/file-2.ts"]
        },
        {
          taskId: "task-parent-slice-2",
          parentTaskId: "task-parent",
          targetFiles: ["src/file-3.ts", "src/file-4.ts"]
        }
      ]
    });
    const recorder = makeRecordingDeps({ outcome: okOutcome(proposalOutput) });

    const result = await invokeWorkSlicingPile(intent, plan, planningAdmission, 0, recorder.deps);

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.admittedPlan.planId, "plan_exec_coord_trigger-sliced");
    assert.equal(recorder.persistedRecords.length, 1);
    assert.equal(recorder.persistedRecords[0]?.refusal, undefined);
  });

  it("pile failure (ok=false) → result.ok=false reason=pile-timeout, refusal persisted", async () => {
    const plan = buildAdmittedPlanWithTaskTargetFiles(4);
    const planningAdmission = stubPlanningAdmissionPayload(plan);
    const recorder = makeRecordingDeps({ outcome: failOutcome() });

    const result = await invokeWorkSlicingPile(intent, plan, planningAdmission, 0, recorder.deps);

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.reason, "pile-timeout");
    assert.equal(recorder.persistedRecords.length, 1);
    assert.ok(recorder.persistedRecords[0]?.refusal);
  });

  it("pile ok but parse fails → result.ok=false reason=parse-error, refusal persisted", async () => {
    const plan = buildAdmittedPlanWithTaskTargetFiles(4);
    const planningAdmission = stubPlanningAdmissionPayload(plan);
    const recorder = makeRecordingDeps({ outcome: okOutcome("not json") });

    const result = await invokeWorkSlicingPile(intent, plan, planningAdmission, 0, recorder.deps);

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.reason, "parse-error");
    assert.ok(recorder.persistedRecords[0]?.refusal);
  });
});

// ---------- invokeRepairPlanRefinementPile ----------

function deterministicRepairPlan(): RepairPlan {
  return {
    runId: "run-trigger",
    attempt: 1,
    repairs: [
      {
        planTaskId: "task-parent",
        mechanicalCritiques: [],
        modelCritiques: []
      }
    ],
    dependentTaskIds: ["task-parent"]
  };
}

describe("invokeRepairPlanRefinementPile", () => {
  it("pile ok + admission accepts → returns refined plan derived from admittedFailingTaskIds", async () => {
    const plan = buildAdmittedPlanWithTaskTargetFiles(2);
    const planningAdmission = stubPlanningAdmissionPayload(plan);
    const artifact = buildSyntheticArtifact(plan);
    const det = deterministicRepairPlan();
    const proposalOutput = JSON.stringify({
      kind: "repair-plan",
      repairPlan: {
        failingTaskIds: ["task-parent"],
        corrections: [
          {
            targetTaskId: "task-parent",
            summary: "Refine the parent task repair."
          }
        ]
      }
    });
    const recorder = makeRecordingDeps({ outcome: okOutcome(proposalOutput) });

    const refined = await invokeRepairPlanRefinementPile(
      intent, artifact, plan, det, /* attempt */ 1, recorder.deps
    );

    // Plan was returned (admission accepted). Should not be the deterministic
    // reference — the lift recomputes dependentTaskIds.
    assert.notEqual(refined, det);
    assert.deepEqual(refined.repairs.map((r) => r.planTaskId), ["task-parent"]);
    assert.equal(recorder.persistedRecords.length, 1);
    assert.equal(recorder.persistedRecords[0]?.refusal, undefined);
  });

  it("pile failure (ok=false) → returns deterministic plan; refusal persisted (Q-15 soft fallback)", async () => {
    const plan = buildAdmittedPlanWithTaskTargetFiles(2);
    const planningAdmission = stubPlanningAdmissionPayload(plan);
    const artifact = buildSyntheticArtifact(plan);
    const det = deterministicRepairPlan();
    const recorder = makeRecordingDeps({ outcome: failOutcome() });

    const refined = await invokeRepairPlanRefinementPile(
      intent, artifact, plan, det, 1, recorder.deps
    );

    assert.equal(refined, det);
    assert.equal(recorder.persistedRecords.length, 1);
    assert.ok(recorder.persistedRecords[0]?.refusal);
  });

  it("pile ok + admission rejects (no-op) → returns deterministic plan; NO refusal persisted", async () => {
    const plan = buildAdmittedPlanWithTaskTargetFiles(2);
    const planningAdmission = stubPlanningAdmissionPayload(plan);
    const artifact = buildSyntheticArtifact(plan);
    const det = deterministicRepairPlan();
    // Proposal references a failingTaskId NOT in det.repairs → admission rejects
    // with "unknown failing task" (NOT capability expansion).
    const proposalOutput = JSON.stringify({
      kind: "repair-plan",
      repairPlan: {
        failingTaskIds: ["task-not-in-deterministic"],
        corrections: []
      }
    });
    const recorder = makeRecordingDeps({ outcome: okOutcome(proposalOutput) });

    const refined = await invokeRepairPlanRefinementPile(
      intent, artifact, plan, det, 1, recorder.deps
    );

    assert.equal(refined, det);
    // Persisted, but NO refusal — admission rejection is not a pile failure.
    assert.equal(recorder.persistedRecords.length, 1);
    assert.equal(recorder.persistedRecords[0]?.refusal, undefined);
  });

  it("pile ok + admission rejects with authority expansion → throws RefiningRefusedAuthorityExpansion + refusal persisted", async () => {
    const plan = buildAdmittedPlanWithTaskTargetFiles(2);
    const planningAdmission = stubPlanningAdmissionPayload(plan);
    const artifact = buildSyntheticArtifact(plan);
    const det = deterministicRepairPlan();
    // Proposal expands repoScopes beyond the parent task — admit-repair-plan
    // rejects with "capability expansion" substring.
    const proposalOutput = JSON.stringify({
      kind: "repair-plan",
      repairPlan: {
        failingTaskIds: ["task-parent"],
        corrections: [
          {
            targetTaskId: "task-parent",
            summary: "Smuggled scope expansion.",
            requiredCapabilities: {
              repoScopes: ["scope/not/on/parent"]
            }
          }
        ]
      }
    });
    const recorder = makeRecordingDeps({ outcome: okOutcome(proposalOutput) });

    await assert.rejects(
      () => invokeRepairPlanRefinementPile(intent, artifact, plan, det, 1, recorder.deps),
      RefiningRefusedAuthorityExpansion
    );
    assert.equal(recorder.persistedRecords.length, 1);
    assert.ok(recorder.persistedRecords[0]?.refusal);
  });
});
