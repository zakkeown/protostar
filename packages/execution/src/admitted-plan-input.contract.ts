import type {
  AdmitCandidatePlanAcceptedResult,
  AdmitCandidatePlanResult,
  AdmitCandidatePlansResult,
  AdmittedPlan,
  AdmittedPlanExecutionArtifact,
  AdmittedPlanHandoff,
  AdmittedPlanRecord,
  CandidatePlan,
  PlanGraph,
  PlanningAdmissionArtifactPayload,
  PlanningPileParseResult,
  PlanningPileResult
} from "@protostar/planning";

import type { PrepareExecutionRunInput, prepareExecutionRun } from "./index.js";

type AssertFalse<T extends false> = T;
type AssertTrue<T extends true> = T;
type IsAssignable<From, To> = [From] extends [To] ? true : false;
type ExecutionEntrypointInput = Parameters<typeof prepareExecutionRun>[0];
type ExecutionAdmittedPlanInput = PrepareExecutionRunInput["admittedPlan"];

type _ExecutionEntrypointUsesNamedInputContract = AssertTrue<
  IsAssignable<ExecutionEntrypointInput, PrepareExecutionRunInput>
>;
type _AdmittedPlanArtifactCanReachExecution = AssertTrue<
  IsAssignable<AdmittedPlanExecutionArtifact, ExecutionAdmittedPlanInput>
>;
type _AdmittedPlanHandoffArtifactCanReachExecution = AssertTrue<
  IsAssignable<AdmittedPlanHandoff["executionArtifact"], ExecutionAdmittedPlanInput>
>;
type _FullAdmittedPlanCannotReachExecution = AssertFalse<
  IsAssignable<AdmittedPlan, ExecutionAdmittedPlanInput>
>;
type _RawPlanGraphCannotReachExecution = AssertFalse<IsAssignable<PlanGraph, ExecutionAdmittedPlanInput>>;
type _CandidatePlanCannotReachExecution = AssertFalse<IsAssignable<CandidatePlan, ExecutionAdmittedPlanInput>>;
type _PlanningHandoffCannotReachExecution = AssertFalse<
  IsAssignable<AdmittedPlanHandoff, ExecutionAdmittedPlanInput>
>;
type _PlanningAdmissionArtifactCannotReachExecution = AssertFalse<
  IsAssignable<PlanningAdmissionArtifactPayload, ExecutionAdmittedPlanInput>
>;
type _PlanningPileResultCannotReachExecution = AssertFalse<
  IsAssignable<PlanningPileResult, ExecutionAdmittedPlanInput>
>;
type _PlanningPileParseResultCannotReachExecution = AssertFalse<
  IsAssignable<PlanningPileParseResult, ExecutionAdmittedPlanInput>
>;
type _CandidateAdmissionResultCannotReachExecution = AssertFalse<
  IsAssignable<AdmitCandidatePlanResult, ExecutionAdmittedPlanInput>
>;
type _AcceptedCandidateAdmissionResultCannotReachExecution = AssertFalse<
  IsAssignable<AdmitCandidatePlanAcceptedResult, ExecutionAdmittedPlanInput>
>;
type _BatchCandidateAdmissionResultCannotReachExecution = AssertFalse<
  IsAssignable<AdmitCandidatePlansResult, ExecutionAdmittedPlanInput>
>;
// AdmittedPlanRecord (the unbranded shape produced by admitCandidatePlan)
// must NOT satisfy the branded AdmittedPlan — only assertAdmittedPlanHandoff
// mints the brand (PLAN-A-01).
type _AdmittedPlanRecordIsNotAdmittedPlan = AssertFalse<IsAssignable<AdmittedPlanRecord, AdmittedPlan>>;
// Negative pin: a hand-rolled artifact-shaped object literal cannot reach
// execution because the brand symbol on AdmittedPlanExecutionArtifact is
// module-private to @protostar/planning.
// @ts-expect-error AdmittedPlanExecutionArtifact carries a private brand symbol.
const _forgedExecutionArtifact: AdmittedPlanExecutionArtifact = {
  planId: "plan_forged",
  intentId: "intent_forged",
  admittedPlan: {
    planId: "plan_forged",
    uri: "plan.json",
    pointer: "#",
    sourceOfTruth: "PlanGraph"
  },
  evidence: {} as never,
  tasks: []
};
