import { defineConfirmedIntent } from "@protostar/intent";

import {
  assertAdmittedPlanHandoff,
  createPlanningAdmissionArtifact,
  createPlanGraph,
  PLANNING_ADMISSION_ARTIFACT_NAME,
  type AdmittedPlan,
  type CandidatePlan,
  type PlanGraph,
  type PlanTaskRequiredCapabilities
} from "./index.js";

type Assert<Condition extends true> = Condition;

type _CandidatePlanIsNotAdmittedPlan = Assert<CandidatePlan extends AdmittedPlan ? false : true>;
type _AdmittedPlanIsNotCandidatePlan = Assert<AdmittedPlan extends CandidatePlan ? false : true>;

const intent = defineConfirmedIntent({
  id: "intent_candidate_admitted_plan_boundary",
  title: "Expose candidate and admitted plan contracts",
  problem: "Execution must only receive plans that have crossed the planning admission boundary.",
  requester: "ouroboros-ac-150001",
  confirmedAt: "2026-04-26T00:00:00.000Z",
  acceptanceCriteria: [
    {
      id: "ac_candidate_admitted_plan_boundary",
      statement: "Candidate plans are not executable until planning admission admits them.",
      verification: "test"
    }
  ],
  capabilityEnvelope: {
    repoScopes: [],
    toolPermissions: [
      {
        tool: "tsc",
        permissionLevel: "execute",
        reason: "Run type-level plan contract boundary checks.",
        risk: "low"
      }
    ],
    budget: {
      timeoutMs: 30_000,
      maxRepairLoops: 0
    }
  },
  constraints: ["CandidatePlan must not be assignable to AdmittedPlan."]
});

const noRequiredCapabilities = {
  repoScopes: [],
  toolPermissions: [],
  budget: {}
} as const satisfies PlanTaskRequiredCapabilities;

const candidatePlan = createPlanGraph({
  planId: "plan_candidate_admitted_plan_boundary",
  intent,
  strategy: "Create a candidate plan and admit it through planning-admission.json evidence.",
  tasks: [
    {
      id: "task-candidate-admitted-plan-boundary",
      title: "Prove candidate plans require admission",
      kind: "verification",
      dependsOn: [],
      covers: ["ac_candidate_admitted_plan_boundary"],
      requiredCapabilities: noRequiredCapabilities,
      risk: "low"
    }
  ],
  createdAt: "2026-04-26T00:00:00.000Z"
});

const candidatePlanContract: CandidatePlan = candidatePlan;
const unbrandedPlanGraph = {
  planId: candidatePlanContract.planId,
  intentId: candidatePlanContract.intentId,
  createdAt: candidatePlanContract.createdAt,
  strategy: candidatePlanContract.strategy,
  acceptanceCriteria: candidatePlanContract.acceptanceCriteria,
  tasks: candidatePlanContract.tasks
} satisfies PlanGraph;

// @ts-expect-error CandidatePlan cannot be treated as an executable AdmittedPlan.
const rejectedExecutablePlan: AdmittedPlan = candidatePlanContract;

createPlanningAdmissionArtifact({
  // @ts-expect-error Planning admission accepts a branded CandidatePlan, not a generic PlanGraph.
  graph: unbrandedPlanGraph,
  intent,
  planGraphUri: "plan.json"
});

// @ts-expect-error A raw PlanGraph still cannot cross the execution boundary as an AdmittedPlan.
const rejectedRawExecutablePlan: AdmittedPlan = unbrandedPlanGraph;

const planningAdmission = createPlanningAdmissionArtifact({
  graph: candidatePlanContract,
  intent,
  planGraphUri: "plan.json"
});

if (!planningAdmission.admitted) {
  throw new Error("Expected type-level candidate plan fixture to admit.");
}

const admittedPlanHandoff = assertAdmittedPlanHandoff({
  plan: candidatePlanContract,
  planningAdmission,
  planningAdmissionArtifact: {
    artifact: PLANNING_ADMISSION_ARTIFACT_NAME,
    uri: PLANNING_ADMISSION_ARTIFACT_NAME,
    persisted: true
  },
  planGraphUri: "plan.json"
});

const executablePlan: AdmittedPlan = admittedPlanHandoff.plan;
const proofGraph: PlanGraph = executablePlan;
