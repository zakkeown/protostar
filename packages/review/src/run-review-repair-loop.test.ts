/// <reference types="node" />

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { StageArtifactRef } from "@protostar/artifacts";
import type { ConfirmedIntent } from "@protostar/intent";
import type { AdmittedPlanExecutionArtifact, ExecutionRunResult } from "@protostar/planning";

import {
  runMechanicalReviewExecutionLoop,
  runReviewRepairLoop,
  type MechanicalChecker,
  type ModelReviewer,
  type RepairPlan,
  type ReviewFinding,
  type ReviewGate,
  type ReviewLifecycleEvent,
  type ReviewPersistence
} from "./index.js";

describe("runReviewRepairLoop", () => {
  it("blocks immediately on a mechanical block and never calls the model reviewer", async () => {
    const persistence = recordingPersistence();
    let modelCalls = 0;

    const result = await runReviewRepairLoop({
      runId: "run-1",
      confirmedIntent: confirmedIntent(2),
      admittedPlan: admittedPlan(["task-a"]),
      initialExecution: executionResult(0),
      executor: executorStub(),
      mechanicalChecker: checkerSequence([mechanical("block", 0, [])]),
      modelReviewer: async () => {
        modelCalls += 1;
        return model("pass");
      },
      persistence,
      now: fixedClock()
    });

    assert.equal(result.status, "blocked");
    assert.equal(result.reason, "mechanical-block");
    assert.equal(result.finalAttempt, 0);
    assert.equal(modelCalls, 0);
    assert.equal(persistence.blocks.length, 1);
  });

  it("approves on mechanical pass plus model pass and mints after writing the decision", async () => {
    const persistence = recordingPersistence();

    const result = await runReviewRepairLoop({
      runId: "run-1",
      confirmedIntent: confirmedIntent(2),
      admittedPlan: admittedPlan(["task-a"]),
      initialExecution: executionResult(0),
      executor: executorStub(),
      mechanicalChecker: checkerSequence([mechanical("pass", 0, [])]),
      modelReviewer: async () => model("pass"),
      persistence,
      now: fixedClock()
    });

    assert.equal(result.status, "approved");
    assert.equal(result.finalAttempt, 0);
    assert.equal(result.authorization.runId, "run-1");
    assert.equal(result.authorization.decisionPath, "/runs/run-1/review/review-decision.json");
    assert.equal(Object.getOwnPropertySymbols(result.authorization).length, 1);
    assert.deepEqual(persistence.callOrder.slice(-2), ["writeReviewDecision", "append:loop-approved"]);
  });

  it("repairs a mechanical finding, re-executes once, then approves on attempt 1", async () => {
    const persistence = recordingPersistence();
    const executorCalls: RepairPlan[] = [];

    const result = await runReviewRepairLoop({
      runId: "run-1",
      confirmedIntent: confirmedIntent(2),
      admittedPlan: admittedPlan(["task-a"]),
      initialExecution: executionResult(0),
      executor: {
        async executeRepairTasks(input) {
          executorCalls.push(input.repairPlan);
          assert.equal(input.attempt, 1);
          return executionResult(1);
        }
      },
      mechanicalChecker: checkerSequence([
        mechanical("repair", 0, [finding("task-a", "repair task A")]),
        mechanical("pass", 1, [])
      ]),
      modelReviewer: async () => model("pass"),
      persistence,
      now: fixedClock()
    });

    assert.equal(result.status, "approved");
    assert.equal(result.finalAttempt, 1);
    assert.equal(executorCalls.length, 1);
    assert.deepEqual(executorCalls[0]?.dependentTaskIds, ["task-a"]);
  });

  it("blocks with budget-exhausted after maxRepairLoops plus the initial attempt", async () => {
    const persistence = recordingPersistence();

    const result = await runReviewRepairLoop({
      runId: "run-1",
      confirmedIntent: confirmedIntent(2),
      admittedPlan: admittedPlan(["task-a"]),
      initialExecution: executionResult(0),
      executor: executorStub(),
      mechanicalChecker: async ({ attempt }) => mechanical("repair", attempt, [finding("task-a", "still broken")]),
      modelReviewer: async () => model("pass"),
      persistence,
      now: fixedClock()
    });

    assert.equal(result.status, "blocked");
    assert.equal(result.reason, "budget-exhausted");
    assert.equal(result.finalAttempt, 2);
    assert.equal(persistence.iterations.length, 3);
    assert.equal((persistence.blocks[0]?.artifact as any).iterations.length, 3);
  });

  it("blocks durably when a repair verdict has no attributed repair task", async () => {
    const persistence = recordingPersistence();

    const result = await runReviewRepairLoop({
      runId: "run-1",
      confirmedIntent: confirmedIntent(1),
      admittedPlan: admittedPlan(["task-a"]),
      initialExecution: executionResult(0),
      executor: executorStub(),
      mechanicalChecker: checkerSequence([mechanical("repair", 0, [unattributedFinding("lint failed")])]),
      modelReviewer: async () => model("pass"),
      persistence,
      now: fixedClock()
    });

    assert.equal(result.status, "blocked");
    assert.equal(result.reason, "mechanical-block");
    assert.equal(result.finalAttempt, 0);
    assert.equal(persistence.iterations.length, 1);
    assert.equal(persistence.blocks.length, 1);
    assert.equal(persistence.events.at(-1)?.kind, "loop-blocked");
  });

  it("turns model reviewer failures into durable model-block artifacts", async () => {
    const persistence = recordingPersistence();

    const result = await runReviewRepairLoop({
      runId: "run-1",
      confirmedIntent: confirmedIntent(1),
      admittedPlan: admittedPlan(["task-a"]),
      initialExecution: executionResult(0),
      executor: executorStub(),
      mechanicalChecker: checkerSequence([mechanical("pass", 0, [])]),
      modelReviewer: async () => {
        throw new Error("judge returned malformed JSON");
      },
      persistence,
      now: fixedClock()
    });

    assert.equal(result.status, "blocked");
    assert.equal(result.reason, "model-block");
    assert.equal(result.finalAttempt, 0);
    assert.equal(persistence.iterations.length, 1);
    assert.equal(persistence.blocks.length, 1);
    assert.equal((persistence.iterations[0] as any).model.critiques[0].rationale, "judge returned malformed JSON");
    assert.deepEqual(
      persistence.callOrder.slice(-3),
      ["writeIterationDir", "writeReviewBlock", "append:loop-blocked"]
    );
  });

  it("keeps model review strictly serial after mechanical pass", async () => {
    let modelCalls = 0;

    const result = await runReviewRepairLoop({
      runId: "run-1",
      confirmedIntent: confirmedIntent(0),
      admittedPlan: admittedPlan(["task-a"]),
      initialExecution: executionResult(0),
      executor: executorStub(),
      mechanicalChecker: checkerSequence([mechanical("repair", 0, [finding("task-a", "repair")])]),
      modelReviewer: async () => {
        modelCalls += 1;
        return model("pass");
      },
      persistence: recordingPersistence(),
      now: fixedClock()
    });

    assert.equal(result.status, "blocked");
    assert.equal(result.reason, "budget-exhausted");
    assert.equal(modelCalls, 0);
  });

  it("computes the Q-03 repair subgraph for A to B to C", async () => {
    let repairPlan: RepairPlan | undefined;

    await runReviewRepairLoop({
      runId: "run-1",
      confirmedIntent: confirmedIntent(1),
      admittedPlan: admittedPlan([
        ["task-a", []],
        ["task-b", ["task-a"]],
        ["task-c", ["task-b"]]
      ]),
      initialExecution: executionResult(0),
      executor: {
        async executeRepairTasks(input) {
          repairPlan = input.repairPlan;
          return executionResult(1);
        }
      },
      mechanicalChecker: checkerSequence([
        mechanical("repair", 0, [finding("task-a", "A failed")]),
        mechanical("pass", 1, [])
      ]),
      modelReviewer: async () => model("pass"),
      persistence: recordingPersistence(),
      now: fixedClock()
    });

    assert.deepEqual(repairPlan?.dependentTaskIds, ["task-a", "task-b", "task-c"]);
  });

  it("propagates iteration critiques through the repair plan", async () => {
    const critique = finding("task-a", "A needs the previous critique");
    let repairPlan: RepairPlan | undefined;

    await runReviewRepairLoop({
      runId: "run-1",
      confirmedIntent: confirmedIntent(1),
      admittedPlan: admittedPlan(["task-a"]),
      initialExecution: executionResult(0),
      executor: {
        async executeRepairTasks(input) {
          repairPlan = input.repairPlan;
          return executionResult(1);
        }
      },
      mechanicalChecker: checkerSequence([
        mechanical("repair", 0, [critique]),
        mechanical("pass", 1, [])
      ]),
      modelReviewer: async () => model("pass"),
      persistence: recordingPersistence(),
      now: fixedClock()
    });

    assert.deepEqual(repairPlan?.repairs[0]?.mechanicalCritiques, [critique]);
  });

  it("uses maxRepairLoops from the confirmed intent capability envelope", async () => {
    for (const maxRepairLoops of [1, 2, 3]) {
      const persistence = recordingPersistence();

      const result = await runReviewRepairLoop({
        runId: `run-${maxRepairLoops}`,
        confirmedIntent: confirmedIntent(maxRepairLoops),
        admittedPlan: admittedPlan(["task-a"]),
        initialExecution: executionResult(0),
        executor: executorStub(),
        mechanicalChecker: async ({ attempt, runId }) =>
          mechanical("repair", attempt, [finding("task-a", `${runId} repair`)]),
        modelReviewer: async () => model("pass"),
        persistence,
        now: fixedClock()
      });

      assert.equal(result.status, "blocked");
      assert.equal(result.finalAttempt, maxRepairLoops);
      assert.equal(persistence.iterations.length, maxRepairLoops + 1);
    }
  });

  it("keeps the deprecated mechanical loop export callable", () => {
    assert.equal(typeof runMechanicalReviewExecutionLoop, "function");
  });

  // Phase 6 Plan 06-10 Task 1 — repairPlanRefiner hook (Q-15).

  it("repairPlanRefiner absent: omits repair-plan-refined lifecycle event", async () => {
    const persistence = recordingPersistence();

    await runReviewRepairLoop({
      runId: "run-1",
      confirmedIntent: confirmedIntent(1),
      admittedPlan: admittedPlan(["task-a"]),
      initialExecution: executionResult(0),
      executor: {
        async executeRepairTasks() {
          return executionResult(1);
        }
      },
      mechanicalChecker: checkerSequence([
        mechanical("repair", 0, [finding("task-a", "repair")]),
        mechanical("pass", 1, [])
      ]),
      modelReviewer: async () => model("pass"),
      persistence,
      now: fixedClock()
    });

    const refinedEvents = persistence.events.filter((e) => e.kind === "repair-plan-refined");
    assert.equal(refinedEvents.length, 0);
  });

  it("repairPlanRefiner returns deterministic plan unchanged: no repair-plan-refined event", async () => {
    const persistence = recordingPersistence();
    let executorRepairPlan: RepairPlan | undefined;

    await runReviewRepairLoop({
      runId: "run-1",
      confirmedIntent: confirmedIntent(1),
      admittedPlan: admittedPlan(["task-a"]),
      initialExecution: executionResult(0),
      executor: {
        async executeRepairTasks(input) {
          executorRepairPlan = input.repairPlan;
          return executionResult(1);
        }
      },
      mechanicalChecker: checkerSequence([
        mechanical("repair", 0, [finding("task-a", "repair")]),
        mechanical("pass", 1, [])
      ]),
      modelReviewer: async () => model("pass"),
      persistence,
      repairPlanRefiner: async (repairPlan) => repairPlan,
      now: fixedClock()
    });

    const refinedEvents = persistence.events.filter((e) => e.kind === "repair-plan-refined");
    assert.equal(refinedEvents.length, 0);
    assert.ok(executorRepairPlan);
  });

  it("repairPlanRefiner returns a different plan: emits repair-plan-refined event and executor receives refined plan", async () => {
    const persistence = recordingPersistence();
    let executorRepairPlan: RepairPlan | undefined;
    const refinedRepairPlan: RepairPlan = {
      runId: "run-1",
      attempt: 99,
      repairs: [
        {
          planTaskId: "task-a",
          mechanicalCritiques: [],
          modelCritiques: []
        }
      ],
      dependentTaskIds: ["task-a"]
    };

    await runReviewRepairLoop({
      runId: "run-1",
      confirmedIntent: confirmedIntent(1),
      admittedPlan: admittedPlan(["task-a"]),
      initialExecution: executionResult(0),
      executor: {
        async executeRepairTasks(input) {
          executorRepairPlan = input.repairPlan;
          return executionResult(1);
        }
      },
      mechanicalChecker: checkerSequence([
        mechanical("repair", 0, [finding("task-a", "repair")]),
        mechanical("pass", 1, [])
      ]),
      modelReviewer: async () => model("pass"),
      persistence,
      repairPlanRefiner: async () => refinedRepairPlan,
      now: fixedClock()
    });

    const refinedEvents = persistence.events.filter((e) => e.kind === "repair-plan-refined");
    assert.equal(refinedEvents.length, 1);
    assert.equal(refinedEvents[0]?.kind, "repair-plan-refined");
    assert.equal(executorRepairPlan, refinedRepairPlan);
  });

  it("repairPlanRefiner throws: error propagates from runReviewRepairLoop", async () => {
    const persistence = recordingPersistence();

    await assert.rejects(
      () =>
        runReviewRepairLoop({
          runId: "run-1",
          confirmedIntent: confirmedIntent(1),
          admittedPlan: admittedPlan(["task-a"]),
          initialExecution: executionResult(0),
          executor: executorStub(),
          mechanicalChecker: checkerSequence([
            mechanical("repair", 0, [finding("task-a", "repair")])
          ]),
          modelReviewer: async () => model("pass"),
          persistence,
          repairPlanRefiner: async () => {
            throw new Error("refiner contract breached");
          },
          now: fixedClock()
        }),
      /refiner contract breached/
    );
  });
});

interface RecordingPersistence extends ReviewPersistence {
  readonly iterations: unknown[];
  readonly decisions: unknown[];
  readonly blocks: { readonly artifact: unknown }[];
  readonly events: ReviewLifecycleEvent[];
  readonly callOrder: string[];
}

function recordingPersistence(): RecordingPersistence {
  const iterations: unknown[] = [];
  const decisions: unknown[] = [];
  const blocks: { readonly artifact: unknown }[] = [];
  const events: ReviewLifecycleEvent[] = [];
  const callOrder: string[] = [];

  return {
    iterations,
    decisions,
    blocks,
    events,
    callOrder,
    async writeIterationDir(input) {
      callOrder.push("writeIterationDir");
      iterations.push(input);
    },
    async writeReviewDecision(input) {
      callOrder.push("writeReviewDecision");
      decisions.push(input.artifact);
      return { decisionPath: `/runs/${input.runId}/review/review-decision.json` };
    },
    async writeReviewBlock(input) {
      callOrder.push("writeReviewBlock");
      blocks.push({ artifact: input.artifact });
      return { blockPath: `/runs/${input.runId}/review/review-block.json` };
    },
    async appendLifecycleEvent(input) {
      callOrder.push(`append:${input.event.kind}`);
      events.push(input.event);
    }
  };
}

function checkerSequence(results: readonly ReturnType<typeof mechanical>[]): MechanicalChecker {
  return async ({ attempt }) => {
    const result = results[attempt];
    assert.ok(result, `missing mechanical result for attempt ${attempt}`);
    return result;
  };
}

function executorStub() {
  return {
    async executeRepairTasks(input: { readonly attempt: number }) {
      return executionResult(input.attempt);
    }
  };
}

function mechanical(
  verdict: ReviewGate["verdict"],
  attempt: number,
  findings: readonly ReviewFinding[]
) {
  return {
    gate: {
      planId: "plan-1",
      runId: "run-1",
      verdict,
      findings
    },
    result: {
      schemaVersion: "1.0.0" as const,
      runId: "run-1",
      attempt,
      commands: [],
      diffNameOnly: ["src/file.ts"],
      findings
    }
  };
}

function model(verdict: "pass" | "repair" | "block"): Awaited<ReturnType<ModelReviewer>> {
  return {
    verdict,
    critiques: verdict === "repair"
      ? [
          {
            judgeId: "judge-1",
            model: "qwen3-80b",
            rubric: { correctness: 0.5 },
            verdict: "repair",
            rationale: "Needs a model-backed repair.",
            taskRefs: ["task-a"]
          }
        ]
      : []
  };
}

function finding(repairTaskId: string, summary: string): ReviewFinding {
  return {
    ruleId: "execution-completed",
    severity: "major",
    summary,
    evidence: [artifact("review", "finding", `runs/run-1/review/${repairTaskId}.json`)],
    repairTaskId
  };
}

function unattributedFinding(summary: string): ReviewFinding {
  return {
    ruleId: "execution-completed",
    severity: "major",
    summary,
    evidence: [artifact("review", "finding", "runs/run-1/review/lint.json")]
  };
}

function confirmedIntent(maxRepairLoops: number): ConfirmedIntent {
  return {
    capabilityEnvelope: {
      budget: {
        maxRepairLoops
      }
    }
  } as unknown as ConfirmedIntent;
}

function admittedPlan(
  tasks: readonly string[] | readonly (readonly [string, readonly string[]])[]
): AdmittedPlanExecutionArtifact {
  return {
    planId: "plan-1",
    intentId: "intent-1",
    tasks: tasks.map((entry) => {
      const [planTaskId, dependsOn] = Array.isArray(entry) ? entry : [entry, []];
      return {
        planTaskId,
        title: planTaskId,
        dependsOn
      };
    }),
    evidence: artifact("planning", "admitted-plan", "runs/run-1/planning/planning-admission.json")
  } as unknown as AdmittedPlanExecutionArtifact;
}

function executionResult(attempt: number): ExecutionRunResult {
  return {
    schemaVersion: "1.0.0",
    runId: "run-1",
    attempt,
    status: "completed",
    journalArtifact: artifact("execution", "journal", `runs/run-1/execution/attempt-${attempt}.jsonl`),
    diffArtifact: artifact("execution", "diff", `runs/run-1/execution/attempt-${attempt}.diff`),
    perTask: [
      {
        planTaskId: "task-a",
        status: "ok",
        evidenceArtifact: artifact("execution", "task", `runs/run-1/execution/task-a-${attempt}.json`)
      }
    ]
  };
}

function artifact(stage: StageArtifactRef["stage"], kind: string, uri: string): StageArtifactRef {
  return {
    stage,
    kind,
    uri
  };
}

function fixedClock(): () => Date {
  return () => new Date("2026-04-28T01:00:00.000Z");
}
