import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildConfirmedIntentForTest } from "@protostar/intent/internal/test-builders";
import type { AcceptanceCriterionId, ConfirmedIntent, IntentId } from "@protostar/intent";

import {
  admitCandidatePlan,
  createPlanningAdmissionArtifact,
  defineCandidatePlan,
  type CandidatePlan,
  type PlanAcceptanceCriterion,
  type PlanTask,
  type PlanTaskRequiredCapabilities
} from "./index.js";

const noRequiredCapabilities = {
  repoScopes: [],
  toolPermissions: [],
  budget: {}
} as const satisfies PlanTaskRequiredCapabilities;

describe("planning admission acceptanceTestRefs AC coverage", () => {
  it("admits a plan whose task acceptanceTestRefs cover every intent AC", () => {
    const intent = confirmedIntent(["ac_admission_ref_alpha", "ac_admission_ref_beta"]);
    const admission = admitCandidatePlan({
      graph: candidatePlan({
        planId: "plan_acceptance_test_refs_full_coverage",
        intentId: intent.id,
        acceptanceCriteria: planCriteria(intent),
        tasks: [
          task({
            id: "task-cover-alpha-and-beta",
            covers: ["ac_admission_ref_alpha", "ac_admission_ref_beta"],
            acceptanceTestRefs: [
              acceptanceTestRef("ac_admission_ref_alpha"),
              acceptanceTestRef("ac_admission_ref_beta")
            ]
          })
        ]
      }),
      intent
    });

    assert.equal(admission.ok, true);
  });

  it("rejects a plan whose acceptanceTestRefs miss one intent AC", () => {
    const intent = confirmedIntent(["ac_admission_ref_alpha", "ac_admission_ref_beta"]);
    const admission = admitCandidatePlan({
      graph: candidatePlan({
        planId: "plan_acceptance_test_refs_missing_one",
        intentId: intent.id,
        acceptanceCriteria: planCriteria(intent),
        tasks: [
          task({
            id: "task-cover-alpha-and-beta",
            covers: ["ac_admission_ref_alpha", "ac_admission_ref_beta"],
            acceptanceTestRefs: [acceptanceTestRef("ac_admission_ref_alpha")]
          })
        ]
      }),
      intent
    });

    assert.equal(admission.ok, false);
    if (!admission.ok) {
      assert.equal(admission.planningAdmission.details.failure.reason, "ac-coverage-incomplete");
      assert.deepEqual(admission.planningAdmission.details.failure.missingAcIds, [
        "ac_admission_ref_beta"
      ]);
      assert.deepEqual(
        admission.rejectionReasons
          .filter((reason) => reason.code === "ac-coverage-incomplete")
          .map((reason) => reason.acceptanceCriterionId),
        ["ac_admission_ref_beta"]
      );
    }
  });

  it("rejects a plan with no acceptanceTestRefs when intent has an AC", () => {
    const intent = confirmedIntent(["ac_admission_ref_alpha"]);
    const admission = admitCandidatePlan({
      graph: candidatePlan({
        planId: "plan_acceptance_test_refs_absent",
        intentId: intent.id,
        acceptanceCriteria: planCriteria(intent),
        tasks: [
          task({
            id: "task-covers-alpha-without-test-ref",
            covers: ["ac_admission_ref_alpha"]
          })
        ]
      }),
      intent
    });

    assert.equal(admission.ok, false);
    if (!admission.ok) {
      assert.equal(admission.planningAdmission.details.failure.reason, "ac-coverage-incomplete");
      assert.deepEqual(admission.planningAdmission.details.failure.missingAcIds, [
        "ac_admission_ref_alpha"
      ]);
    }
  });

  it("admits redundant acceptanceTestRefs for the same AC", () => {
    const intent = confirmedIntent(["ac_admission_ref_alpha"]);
    const admission = admitCandidatePlan({
      graph: candidatePlan({
        planId: "plan_acceptance_test_refs_redundant",
        intentId: intent.id,
        acceptanceCriteria: planCriteria(intent),
        tasks: [
          task({
            id: "task-cover-alpha-first",
            covers: ["ac_admission_ref_alpha"],
            acceptanceTestRefs: [acceptanceTestRef("ac_admission_ref_alpha")]
          }),
          task({
            id: "task-cover-alpha-second",
            covers: ["ac_admission_ref_alpha"],
            acceptanceTestRefs: [acceptanceTestRef("ac_admission_ref_alpha")]
          })
        ]
      }),
      intent
    });

    assert.equal(admission.ok, true);
  });

  it("admits an empty-AC intent vacuously", () => {
    const intent = {
      ...confirmedIntent(["ac_admission_ref_placeholder"]),
      acceptanceCriteria: []
    } as unknown as ConfirmedIntent;
    const admission = admitCandidatePlan({
      graph: candidatePlan({
        planId: "plan_acceptance_test_refs_no_declared_acs",
        intentId: intent.id,
        acceptanceCriteria: [],
        tasks: []
      }),
      intent
    });

    assert.equal(admission.ok, true);
  });

  it("serializes ac-coverage-incomplete reason and missingAcIds into the no-plan-admitted artifact", () => {
    const intent = confirmedIntent(["ac_admission_ref_alpha"]);
    const artifact = createPlanningAdmissionArtifact({
      graph: candidatePlan({
        planId: "plan_acceptance_test_refs_artifact",
        intentId: intent.id,
        acceptanceCriteria: planCriteria(intent),
        tasks: [
          task({
            id: "task-covers-alpha-without-test-ref",
            covers: ["ac_admission_ref_alpha"]
          })
        ]
      }),
      intent
    });

    assert.equal(artifact.admissionStatus, "no-plan-admitted");
    assert.equal(artifact.admitted, false);
    if (!artifact.admitted) {
      assert.equal(artifact.details.failure.reason, "ac-coverage-incomplete");
      assert.deepEqual(artifact.details.failure.missingAcIds, ["ac_admission_ref_alpha"]);
    }
    assert.match(JSON.stringify(artifact), /"reason":"ac-coverage-incomplete"/);
    assert.match(JSON.stringify(artifact), /"missingAcIds":\["ac_admission_ref_alpha"\]/);
  });
});

function confirmedIntent(acIds: readonly AcceptanceCriterionId[]) {
  return buildConfirmedIntentForTest({
    id: "intent_acceptance_test_ref_admission",
    title: "Pair acceptance criteria with tests",
    problem: "Admission must reject plans that do not pair every AC with a test reference.",
    requester: "phase-05-plan-11",
    confirmedAt: "2026-04-28T00:00:00.000Z",
    acceptanceCriteria: acIds.map((id) => ({
      id,
      statement: `Criterion ${id} has a test reference.`,
      verification: "test"
    })),
    capabilityEnvelope: {
      repoScopes: [],
      toolPermissions: [
        {
          tool: "node:test",
          permissionLevel: "execute",
          reason: "Run planning admission tests.",
          risk: "low"
        }
      ],
      budget: {
        timeoutMs: 30_000,
        maxRepairLoops: 3
      }
    }
  });
}

function planCriteria(intent: ReturnType<typeof confirmedIntent>): readonly PlanAcceptanceCriterion[] {
  return intent.acceptanceCriteria.map(({ id, statement, verification }) => ({
    id,
    statement,
    verification
  }));
}

function candidatePlan(input: {
  readonly planId: string;
  readonly intentId: IntentId;
  readonly acceptanceCriteria: readonly PlanAcceptanceCriterion[];
  readonly tasks: readonly PlanTask[];
}): CandidatePlan {
  return defineCandidatePlan({
    planId: input.planId,
    intentId: input.intentId,
    createdAt: "2026-04-28T00:00:00.000Z",
    strategy: "Verify acceptanceTestRefs coverage at admission.",
    acceptanceCriteria: input.acceptanceCriteria,
    tasks: input.tasks
  });
}

function task(input: {
  readonly id: PlanTask["id"];
  readonly covers: readonly PlanTask["covers"][number][];
  readonly acceptanceTestRefs?: PlanTask["acceptanceTestRefs"];
}): PlanTask {
  return {
    id: input.id,
    title: `Verify ${input.id}`,
    kind: "verification",
    dependsOn: [],
    covers: input.covers,
    targetFiles: ["packages/planning/src/admission-acceptance-test-refs-coverage.test.ts"],
    ...(input.acceptanceTestRefs !== undefined ? { acceptanceTestRefs: input.acceptanceTestRefs } : {}),
    requiredCapabilities: noRequiredCapabilities,
    risk: "low"
  };
}

function acceptanceTestRef(acId: string): NonNullable<PlanTask["acceptanceTestRefs"]>[number] {
  return {
    acId,
    testFile: "packages/planning/src/admission-acceptance-test-refs-coverage.test.ts",
    testName: `Criterion ${acId} has a test reference`
  };
}
