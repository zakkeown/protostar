/// <reference types="node" />

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type {
  AdmittedPlanRecord,
  PlanTask,
  PlanTaskRequiredCapabilities
} from "@protostar/planning";

import { admitRepairPlanProposal } from "./admit-repair-plan-proposal.js";
import type { RepairPlanProposal } from "./execution-coordination-pile-result.js";

const baseCaps: PlanTaskRequiredCapabilities = {
  repoScopes: [{ workspace: "primary", path: "src/", access: "write" }],
  toolPermissions: [
    { tool: "node:test", permissionLevel: "execute", reason: "run tests", risk: "low" }
  ],
  budget: {}
};

function makeTask(id: PlanTask["id"], caps: PlanTaskRequiredCapabilities = baseCaps): PlanTask {
  return {
    id,
    title: `task ${id}`,
    kind: "implementation",
    dependsOn: [],
    covers: [],
    targetFiles: ["src/a.ts"],
    requiredCapabilities: caps,
    risk: "low"
  };
}

function makeAdmittedPlan(taskIds: readonly PlanTask["id"][]): Pick<AdmittedPlanRecord, "tasks"> {
  return { tasks: taskIds.map((id) => makeTask(id)) };
}

describe("admit-repair-plan", () => {
  it("admit-repair-plan happy path admits a well-scoped proposal", () => {
    const proposal: RepairPlanProposal = {
      failingTaskIds: ["task-a"],
      corrections: [{ targetTaskId: "task-a", summary: "Fix the assertion." }]
    };
    const result = admitRepairPlanProposal(proposal, {
      admittedPlan: makeAdmittedPlan(["task-a", "task-b"]),
      failingTaskIds: ["task-a"]
    });
    if (!result.ok) {
      assert.fail(`expected ok, got: ${JSON.stringify(result.errors)}`);
    }
    assert.equal(result.repairPlan.corrections.length, 1);
  });

  it("admit-repair-plan rejects unknown failing task", () => {
    const proposal: RepairPlanProposal = {
      failingTaskIds: ["task-z"],
      corrections: []
    };
    const result = admitRepairPlanProposal(proposal, {
      admittedPlan: makeAdmittedPlan(["task-a"]),
      failingTaskIds: ["task-a"]
    });
    assert.equal(result.ok, false);
    if (result.ok) assert.fail("expected rejection");
    assert.equal(
      result.errors.some((e) => e.includes("unknown failing task")),
      true
    );
  });

  it("admit-repair-plan rejects correction targeting non-existent task", () => {
    const proposal: RepairPlanProposal = {
      failingTaskIds: ["task-a"],
      corrections: [{ targetTaskId: "task-fictional", summary: "Fix nothing." }]
    };
    const result = admitRepairPlanProposal(proposal, {
      admittedPlan: makeAdmittedPlan(["task-a"]),
      failingTaskIds: ["task-a"]
    });
    assert.equal(result.ok, false);
    if (result.ok) assert.fail("expected rejection");
    assert.equal(
      result.errors.some((e) => e.includes("unknown target task")),
      true
    );
  });

  it("admit-repair-plan rejects capability envelope expansion", () => {
    const proposal: RepairPlanProposal = {
      failingTaskIds: ["task-a"],
      corrections: [
        {
          targetTaskId: "task-a",
          summary: "Needs network now.",
          requiredCapabilities: {
            toolPermissions: [{ tool: "@octokit/rest" }]
          }
        }
      ]
    };
    const result = admitRepairPlanProposal(proposal, {
      admittedPlan: makeAdmittedPlan(["task-a"]),
      failingTaskIds: ["task-a"]
    });
    assert.equal(result.ok, false);
    if (result.ok) assert.fail("expected rejection");
    assert.equal(
      result.errors.some((e) => e.includes("capability expansion")),
      true
    );
  });
});
