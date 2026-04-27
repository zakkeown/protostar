import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildConfirmedIntentForTest } from "@protostar/intent/internal/test-builders";
import {
  PLAN_GRAPH_ADMISSION_VALIDATOR_VERSIONS,
  PLAN_GRAPH_ADMISSION_VALIDATORS,
  PLANNING_ADMISSION_ARTIFACT_NAME,
  PLANNING_ADMISSION_SCHEMA_VERSION,
  type AdmittedPlanExecutionArtifact,
  type AdmittedPlanHandoff,
  type PlanningAdmissionAcceptedArtifactPayload
} from "@protostar/planning";

import {
  assertCandidatePlanFromPlanningPileResult,
  buildPlanningMission,
  buildReviewMission,
  parsePlanningPileResult,
  type CandidatePlanGraph,
  type PlanningPileParseResult,
  type PlanningPileResult
} from "./index.js";

type Assert<Condition extends true> = Condition;

type PlanningPileParseSuccess = Extract<PlanningPileParseResult, { readonly ok: true }>;

type _PlanningPileParseResultReturnsCandidatePlan = Assert<
  PlanningPileParseSuccess extends { readonly candidatePlan: CandidatePlanGraph } ? true : false
>;
type _PlanningPileParseResultDoesNotExposeGenericPlanSlot = Assert<
  "plan" extends keyof PlanningPileParseSuccess ? false : true
>;
type _CandidatePlanGraphIsNotAdmittedPlanHandoff = Assert<
  CandidatePlanGraph extends AdmittedPlanHandoff ? false : true
>;
type _CandidatePlanAssertorReturnsCandidatePlan = Assert<
  ReturnType<typeof assertCandidatePlanFromPlanningPileResult> extends CandidatePlanGraph ? true : false
>;
type _ReviewMissionRequiresAcceptedPlanningAdmissionPayload = Assert<
  Parameters<typeof buildReviewMission>[1] extends PlanningAdmissionAcceptedArtifactPayload ? true : false
>;
type _FullPlanningHandoffCannotBuildReviewMission = Assert<
  AdmittedPlanHandoff extends Parameters<typeof buildReviewMission>[1] ? false : true
>;
type _AdmittedPlanExecutionArtifactCannotBuildReviewMission = Assert<
  AdmittedPlanExecutionArtifact extends Parameters<typeof buildReviewMission>[1] ? false : true
>;
type _CandidatePlanGraphCannotBuildReviewMission = Assert<
  CandidatePlanGraph extends Parameters<typeof buildReviewMission>[1] ? false : true
>;

describe("Dogpile adapter planning result public boundary", () => {
  it("parses Dogpile planning output only as candidate-plan data", () => {
    const intent = buildConfirmedIntentForTest({
      id: "intent_dogpile_candidate_plan_boundary",
      title: "Keep Dogpile planning output candidate-only",
      problem: "Dogpile planners can propose work, but planning admission owns the admitted-plan boundary.",
      requester: "contract-test",
      confirmedAt: "2026-04-26T00:00:00.000Z",
      acceptanceCriteria: [
        {
          id: "ac_dogpile_candidate_only",
          statement: "Dogpile planning results are exposed as candidate plans before admission.",
          verification: "test"
        }
      ],
      capabilityEnvelope: {
        repoScopes: [],
        toolPermissions: [],
        budget: {
          timeoutMs: 30_000,
          maxRepairLoops: 0
        }
      },
      constraints: ["Planning admission must decide whether the candidate plan is admitted."]
    });
    const mission = buildPlanningMission(intent);
    assert.match(mission.intent, /Return candidate-plan JSON only/);
    assert.match(mission.intent, /not an admitted plan, execution-ready plan, or downstream handoff/);
    assert.match(mission.intent, /Do not include admittedPlan, handoff, executionPlan, readyForExecution/);

    const result = {
      kind: "planning-pile-result",
      source: "fixture",
      output: JSON.stringify({
        strategy: "Return one candidate verification task for the planning admission boundary.",
        tasks: [
          {
            id: "task-dogpile-candidate-only",
            title: "Prove Dogpile output remains candidate-only",
            kind: "verification",
            dependsOn: [],
            covers: ["ac_dogpile_candidate_only"],
            requiredCapabilities: {
              repoScopes: [],
              toolPermissions: [],
              budget: {}
            },
            risk: "low"
          }
        ]
      })
    } as const satisfies PlanningPileResult;

    const parsed = parsePlanningPileResult(result, {
      intent,
      defaultPlanId: "plan_dogpile_candidate_boundary"
    });

    if (!parsed.ok) {
      assert.fail(parsed.errors.join("; "));
    }
    assert.equal(parsed.ok, true);
    assert.equal(Object.hasOwn(parsed, "candidatePlan"), true);
    assert.equal(Object.hasOwn(parsed, "plan"), false);
    assert.equal(parsed.candidatePlan.planId, "plan_dogpile_candidate_boundary");
    assert.equal(parsed.candidatePlan.intentId, intent.id);
  });

  it("rejects planning output that attempts to expose admitted or execution-ready plan fields", () => {
    const intent = buildConfirmedIntentForTest({
      id: "intent_dogpile_reject_admitted_plan_shape",
      title: "Reject admitted plan shaped Dogpile output",
      problem: "Dogpile planning output must not smuggle admitted-plan or execution-ready fields past admission.",
      requester: "contract-test",
      confirmedAt: "2026-04-26T00:00:00.000Z",
      acceptanceCriteria: [
        {
          id: "ac_dogpile_candidate_only",
          statement: "Dogpile planning results remain candidate-plan data before planning admission.",
          verification: "test"
        }
      ],
      capabilityEnvelope: {
        repoScopes: [],
        toolPermissions: [],
        budget: {
          timeoutMs: 30_000,
          maxRepairLoops: 0
        }
      },
      constraints: ["Planning admission owns admitted-plan and execution-ready handoff creation."]
    });
    const result = {
      kind: "planning-pile-result",
      source: "fixture",
      output: JSON.stringify({
        strategy: "Attempt to bypass planning admission by returning admitted and execution-ready fields.",
        admittedPlan: {
          planId: "plan_illegal_admitted_output"
        },
        handoff: {
          readyFor: ["execution"]
        },
        executionPlan: {
          runId: "run_illegal"
        },
        tasks: [
          {
            id: "task-dogpile-candidate-only",
            title: "Try to smuggle execution readiness through planning output",
            kind: "verification",
            dependsOn: [],
            covers: ["ac_dogpile_candidate_only"],
            requiredCapabilities: {
              repoScopes: [],
              toolPermissions: [],
              admittedCapabilities: [],
              budget: {
                admitted: true
              }
            },
            risk: "low",
            readyForExecution: true,
            status: "ready"
          }
        ]
      })
    } as const satisfies PlanningPileResult;

    const parsed = parsePlanningPileResult(result, {
      intent,
      defaultPlanId: "plan_dogpile_candidate_boundary"
    });

    assert.equal(parsed.ok, false);
    if (parsed.ok) {
      assert.fail("Dogpile planning output with admitted-plan fields unexpectedly parsed.");
    }
    assert.deepEqual(parsed.errors, [
      "output.admittedPlan is not part of the candidate-plan planning pile contract.",
      "output.handoff is not part of the candidate-plan planning pile contract.",
      "output.executionPlan is not part of the candidate-plan planning pile contract.",
      "tasks[0].readyForExecution is not part of the candidate-plan planning pile contract.",
      "tasks[0].status is not part of the candidate-plan planning pile contract.",
      "tasks[0].requiredCapabilities.admittedCapabilities is not part of the candidate-plan planning pile contract.",
      "tasks[0].requiredCapabilities.budget.admitted is not part of the candidate-plan planning pile contract."
    ]);
  });

  it("builds review missions from planning-admission.json evidence, not candidate plans", () => {
    const intent = buildConfirmedIntentForTest({
      id: "intent_dogpile_review_uses_planning_admission",
      title: "Review uses planning admission",
      problem: "Review missions must consume the durable planning admission artifact.",
      requester: "contract-test",
      confirmedAt: "2026-04-26T00:00:00.000Z",
      acceptanceCriteria: [
        {
          id: "ac_review_planning_admission",
          statement: "Review mission input is planning-admission.json.",
          verification: "test"
        }
      ],
      capabilityEnvelope: {
        repoScopes: [],
        toolPermissions: [],
        budget: {
          timeoutMs: 30_000,
          maxRepairLoops: 0
        }
      },
      constraints: ["Review must not consume candidate plan objects."]
    });
    const planningAdmission = acceptedPlanningAdmissionFixture({
      planId: "plan_dogpile_review_uses_planning_admission",
      intentId: intent.id
    });

    const mission = buildReviewMission(intent, planningAdmission);

    assert.match(mission.intent, /Review input artifact: planning-admission\.json/);
    assert.match(mission.intent, /Planning admission decision: allow/);
    assert.match(mission.intent, /Plan proof source: PlanGraph at plan\.json/);
    assert.match(mission.intent, /Do not consume candidate-plan objects/);
  });
});

function acceptedPlanningAdmissionFixture(input: {
  readonly planId: string;
  readonly intentId: `intent_${string}`;
}): PlanningAdmissionAcceptedArtifactPayload {
  const createdAt = "2026-04-26T00:00:00.000Z";
  const candidateSource = {
    kind: "candidate-plan-graph",
    planId: input.planId,
    uri: "plan.json",
    pointer: "#",
    createdAt,
    sourceOfTruth: "PlanGraph"
  } as const;

  return {
    schemaVersion: PLANNING_ADMISSION_SCHEMA_VERSION,
    artifact: PLANNING_ADMISSION_ARTIFACT_NAME,
    decision: "allow",
    admissionStatus: "plan-admitted",
    admitted: true,
    admittedAt: createdAt,
    planningAttempt: {
      id: `planning-attempt:${input.planId}`,
      candidatePlanId: input.planId,
      intentId: input.intentId,
      candidatePlanCreatedAt: createdAt
    },
    candidateSource,
    candidatePlan: {
      planId: input.planId,
      intentId: input.intentId,
      createdAt,
      source: candidateSource
    },
    planId: input.planId,
    intentId: input.intentId,
    plan_hash: "sha256:dogpile-review-planning-admission",
    validators_passed: PLAN_GRAPH_ADMISSION_VALIDATORS,
    validator_versions: PLAN_GRAPH_ADMISSION_VALIDATOR_VERSIONS,
    errors: []
  };
}
