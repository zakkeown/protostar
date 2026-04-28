import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildConfirmedIntentForTest } from "@protostar/intent/internal/test-builders";

import {
  parsePlanningPileResult,
  type PlanningPileResult,
  type PlanTask
} from "./index.js";

const intent = buildConfirmedIntentForTest({
  id: "intent_acceptance_test_refs",
  title: "Carry acceptance-test references through planning",
  problem: "Mechanical review needs typed test references for each acceptance criterion.",
  requester: "phase-05-plan-03",
  confirmedAt: "2026-04-28T00:00:00.000Z",
  acceptanceCriteria: [
    {
      id: "ac_acceptance_test_refs",
      statement: "Plan tasks can carry references to the tests that prove acceptance criteria.",
      verification: "test"
    }
  ],
  capabilityEnvelope: {
    repoScopes: [],
    toolPermissions: [
      {
        tool: "node:test",
        permissionLevel: "execute",
        reason: "Run planning acceptance-test reference tests.",
        risk: "low"
      }
    ],
    budget: {
      timeoutMs: 30_000,
      maxRepairLoops: 3
    }
  },
  constraints: ["Do not enforce plan-level AC coverage in this schema widening."]
});

describe("PlanTask acceptanceTestRefs", () => {
  it("keeps acceptanceTestRefs optional on individual tasks", () => {
    const parsed = parsePlanningPileResult(
      planningPileResult([
        {
          id: "task-without-acceptance-test-refs",
          title: "Parse a task without acceptance test references",
          kind: "verification",
          dependsOn: [],
          covers: ["ac_acceptance_test_refs"],
          requiredCapabilities: {
            repoScopes: [],
            toolPermissions: [],
            budget: {}
          },
          risk: "low"
        }
      ]),
      { intent, defaultPlanId: "plan_acceptance_test_refs_default" }
    );

    assert.equal(parsed.ok, true);
    if (parsed.ok) {
      assert.equal(parsed.candidatePlan.tasks[0]?.acceptanceTestRefs, undefined);
    }
  });

  it("parses complete acceptanceTestRefs on a task", () => {
    const parsed = parsePlanningPileResult(
      planningPileResult([
        {
          id: "task-with-acceptance-test-refs",
          title: "Parse a task with acceptance test references",
          kind: "verification",
          dependsOn: [],
          covers: ["ac_acceptance_test_refs"],
          targetFiles: ["packages/planning/src/acceptance-test-refs.test.ts"],
          acceptanceTestRefs: [
            {
              acId: "ac_acceptance_test_refs",
              testFile: "packages/planning/src/acceptance-test-refs.test.ts",
              testName: "parses complete acceptanceTestRefs on a task"
            }
          ],
          requiredCapabilities: {
            repoScopes: [],
            toolPermissions: [],
            budget: {}
          },
          risk: "low"
        }
      ]),
      { intent, defaultPlanId: "plan_acceptance_test_refs_default" }
    );

    assert.equal(parsed.ok, true);
    if (parsed.ok) {
      assert.deepEqual(parsed.candidatePlan.tasks[0]?.acceptanceTestRefs, [
        {
          acId: "ac_acceptance_test_refs",
          testFile: "packages/planning/src/acceptance-test-refs.test.ts",
          testName: "parses complete acceptanceTestRefs on a task"
        }
      ]);
    }
  });

  it("rejects incomplete acceptanceTestRefs at runtime", () => {
    const parsed = parsePlanningPileResult(
      planningPileResult([
        {
          id: "task-incomplete-acceptance-test-refs",
          title: "Reject an incomplete acceptance test reference",
          kind: "verification",
          dependsOn: [],
          covers: ["ac_acceptance_test_refs"],
          acceptanceTestRefs: [
            {
              acId: "ac_acceptance_test_refs"
            }
          ],
          requiredCapabilities: {
            repoScopes: [],
            toolPermissions: [],
            budget: {}
          },
          risk: "low"
        }
      ]),
      { intent, defaultPlanId: "plan_acceptance_test_refs_default" }
    );

    assert.equal(parsed.ok, false);
    if (!parsed.ok) {
      assert.equal(parsed.errors.includes("tasks[0].acceptanceTestRefs[0].testFile must be a non-empty string."), true);
      assert.equal(parsed.errors.includes("tasks[0].acceptanceTestRefs[0].testName must be a non-empty string."), true);
    }
  });

  it("requires complete acceptanceTestRefs at the TypeScript boundary", () => {
    const validTask = {
      id: "task-type-valid-acceptance-test-refs",
      title: "Compile a complete acceptance test reference",
      kind: "verification",
      dependsOn: [],
      covers: ["ac_acceptance_test_refs"],
      acceptanceTestRefs: [
        {
          acId: "ac_acceptance_test_refs",
          testFile: "packages/planning/src/acceptance-test-refs.test.ts",
          testName: "requires complete acceptanceTestRefs at the TypeScript boundary"
        }
      ],
      requiredCapabilities: {
        repoScopes: [],
        toolPermissions: [],
        budget: {}
      },
      risk: "low"
    } satisfies PlanTask;

    // @ts-expect-error acceptanceTestRefs entries must include testFile and testName.
    const invalidTask = {
      ...validTask,
      acceptanceTestRefs: [{ acId: "ac_acceptance_test_refs" }]
    } satisfies PlanTask;

    assert.equal(validTask.acceptanceTestRefs[0]?.acId, "ac_acceptance_test_refs");
    assert.equal(invalidTask.acceptanceTestRefs[0]?.acId, "ac_acceptance_test_refs");
  });
});

function planningPileResult(tasks: readonly Record<string, unknown>[]): PlanningPileResult {
  return {
    kind: "planning-pile-result",
    source: "dogpile",
    output: JSON.stringify({
      planId: "plan_acceptance_test_refs",
      strategy: "Parse acceptance test references on plan tasks.",
      createdAt: "2026-04-28T00:00:00.000Z",
      tasks
    })
  };
}
