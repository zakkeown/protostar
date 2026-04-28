/// <reference types="node" />

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildConfirmedIntentForTest } from "@protostar/intent/internal/test-builders";

import { admitWorkSlicing, type WorkSlicingProposal } from "./admit-work-slicing.js";
import {
  admitCandidatePlan,
  defineCandidatePlan,
  type AdmittedPlanRecord,
  type PlanGraph,
  type PlanTaskRequiredCapabilities
} from "./index.js";

const intent = buildConfirmedIntentForTest({
  id: "intent_admit_work_slicing",
  title: "Admit work-slicing proposals through Phase 1 admission",
  problem:
    "PILE-03's work-slicing trigger must re-admit a sliced plan rather than executing pile output blindly.",
  requester: "ouroboros-ac-150003",
  confirmedAt: "2026-04-27T00:00:00.000Z",
  acceptanceCriteria: [
    {
      id: "ac_admit_work_slicing",
      statement: "A work-slicing proposal that preserves invariants becomes a re-admitted plan.",
      verification: "test"
    }
  ],
  capabilityEnvelope: {
    repoScopes: [],
    toolPermissions: [
      {
        tool: "node:test",
        permissionLevel: "execute",
        reason: "Run the work-slicing admission tests.",
        risk: "low"
      }
    ],
    budget: {
      timeoutMs: 30_000,
      maxRepairLoops: 0
    }
  },
  constraints: ["Sliced plans must not expand the parent task's capability envelope or targetFiles."]
});

const noRequiredCapabilities = {
  repoScopes: [],
  toolPermissions: [],
  budget: {}
} as const satisfies PlanTaskRequiredCapabilities;

function buildBasePlan(): AdmittedPlanRecord {
  const graph = defineCandidatePlan({
    planId: "plan_admit_work_slicing_base",
    intentId: intent.id,
    createdAt: "2026-04-27T00:00:00.000Z",
    strategy: "Initial single-task plan that the pile splits.",
    acceptanceCriteria: intent.acceptanceCriteria.map(({ id, statement, verification }) => ({
      id,
      statement,
      verification
    })),
    tasks: [
      {
        id: "task-parent",
        title: "Parent task to be sliced",
        kind: "implementation",
        dependsOn: [],
        covers: ["ac_admit_work_slicing"],
        targetFiles: ["src/feature.ts", "src/feature-helper.ts"],
        acceptanceTestRefs: [
          {
            acId: "ac_admit_work_slicing",
            testFile: "src/feature.test.ts",
            testName: "task-parent covers ac_admit_work_slicing"
          }
        ],
        requiredCapabilities: noRequiredCapabilities,
        risk: "low"
      }
    ]
  } as const satisfies PlanGraph);

  const admission = admitCandidatePlan({ graph, intent });
  if (!admission.ok) {
    throw new Error(`Test fixture admission unexpectedly failed: ${JSON.stringify(admission.rejectionReasons)}`);
  }
  return admission.admittedPlan;
}

describe("admit-work-slicing", () => {
  it("admit-work-slicing happy path admits a parent split into two slices", () => {
    const base = buildBasePlan();
    const proposal: WorkSlicingProposal = {
      slices: [
        {
          id: "task-parent-slice-1",
          parentTaskId: "task-parent",
          title: "Slice 1 — feature core",
          targetFiles: ["src/feature.ts"]
        },
        {
          id: "task-parent-slice-2",
          parentTaskId: "task-parent",
          title: "Slice 2 — helper",
          targetFiles: ["src/feature-helper.ts"]
        }
      ]
    };

    const result = admitWorkSlicing(proposal, {
      admittedPlan: base,
      confirmedIntent: intent
    });

    if (!result.ok) {
      assert.fail(`expected ok, got: ${JSON.stringify(result.errors)}`);
    }
    assert.equal(result.admittedPlan.tasks.length, base.tasks.length - 1 + 2);
    const ids = result.admittedPlan.tasks.map((t) => t.id);
    assert.deepEqual(ids, ["task-parent-slice-1", "task-parent-slice-2"]);
  });

  it("rejects slice with unknown parentTaskId", () => {
    const base = buildBasePlan();
    const proposal: WorkSlicingProposal = {
      slices: [
        {
          id: "task-orphan-slice",
          parentTaskId: "task-does-not-exist",
          title: "Orphan",
          targetFiles: ["src/feature.ts"]
        }
      ]
    };
    const result = admitWorkSlicing(proposal, { admittedPlan: base, confirmedIntent: intent });
    assert.equal(result.ok, false);
    if (result.ok) assert.fail("expected rejection");
    assert.equal(
      result.errors.some((e) => e.includes("unknown parentTaskId")),
      true
    );
  });

  it("rejects slice introducing a NEW targetFile (targetFiles expansion)", () => {
    const base = buildBasePlan();
    const proposal: WorkSlicingProposal = {
      slices: [
        {
          id: "task-expanding-slice",
          parentTaskId: "task-parent",
          title: "Expanding",
          targetFiles: ["src/feature.ts", "src/SOMETHING-NEW.ts"]
        }
      ]
    };
    const result = admitWorkSlicing(proposal, { admittedPlan: base, confirmedIntent: intent });
    assert.equal(result.ok, false);
    if (result.ok) assert.fail("expected rejection");
    assert.equal(
      result.errors.some((e) => e.includes("targetFiles expansion")),
      true
    );
  });

  it("rejects slice expanding required capabilities", () => {
    const base = buildBasePlan();
    const proposal: WorkSlicingProposal = {
      slices: [
        {
          id: "task-cap-expanding-slice",
          parentTaskId: "task-parent",
          title: "Capability expansion",
          targetFiles: ["src/feature.ts"],
          requiredCapabilities: {
            repoScopes: [],
            toolPermissions: [
              {
                tool: "@octokit/rest",
                permissionLevel: "execute",
                reason: "needs network",
                risk: "high"
              }
            ],
            budget: {}
          }
        }
      ]
    };
    const result = admitWorkSlicing(proposal, { admittedPlan: base, confirmedIntent: intent });
    assert.equal(result.ok, false);
    if (result.ok) assert.fail("expected rejection");
    assert.equal(
      result.errors.some((e) => e.includes("capability expansion")),
      true
    );
  });

  it("rejects sliced plan that would fail existing dependency-cycle admission", () => {
    const base = buildBasePlan();
    // Two slices that depend on each other → cycle once admitted.
    const proposal: WorkSlicingProposal = {
      slices: [
        {
          id: "task-cycle-slice-1",
          parentTaskId: "task-parent",
          title: "Slice 1",
          targetFiles: ["src/feature.ts"],
          extraDependsOn: ["task-cycle-slice-2"]
        },
        {
          id: "task-cycle-slice-2",
          parentTaskId: "task-parent",
          title: "Slice 2",
          targetFiles: ["src/feature-helper.ts"]
        }
      ]
    };
    const result = admitWorkSlicing(proposal, { admittedPlan: base, confirmedIntent: intent });
    assert.equal(result.ok, false);
    if (result.ok) assert.fail("expected rejection");
    // Re-uses Phase 1 admission cycle detection — error surface comes from
    // the underlying admitCandidatePlan rejection reasons.
    assert.equal(
      result.errors.some((e) => /cycle|dependency/i.test(e)),
      true,
      `expected cycle/dependency error, got: ${JSON.stringify(result.errors)}`
    );
  });
});
