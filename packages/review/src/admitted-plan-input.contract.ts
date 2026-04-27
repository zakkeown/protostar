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

import type {
  createMechanicalReviewGate,
  createReviewGate,
  MechanicalReviewGateInput,
  ReviewExecutionLoopInput,
  runMechanicalReviewExecutionLoop
} from "./index.js";

type AssertFalse<T extends false> = T;
type AssertTrue<T extends true> = T;
type IsAssignable<From, To> = [From] extends [To] ? true : false;

type MechanicalReviewEntrypointInput = Parameters<typeof createMechanicalReviewGate>[0];
type ReviewLoopEntrypointInput = Parameters<typeof runMechanicalReviewExecutionLoop>[0];
type CreateReviewGateInput = Parameters<typeof createReviewGate>[0];
type ReviewAdmittedPlanInput = MechanicalReviewGateInput["admittedPlan"];

type _MechanicalReviewEntrypointUsesNamedInputContract = AssertTrue<
  IsAssignable<MechanicalReviewEntrypointInput, MechanicalReviewGateInput>
>;
type _ReviewLoopEntrypointUsesNamedInputContract = AssertTrue<
  IsAssignable<ReviewLoopEntrypointInput, ReviewExecutionLoopInput>
>;
type _MechanicalReviewRequiresAdmittedPlanArtifact = AssertTrue<
  IsAssignable<AdmittedPlanExecutionArtifact, ReviewAdmittedPlanInput>
>;
type _ReviewLoopRequiresAdmittedPlanArtifact = AssertTrue<
  IsAssignable<AdmittedPlanExecutionArtifact, ReviewExecutionLoopInput["admittedPlan"]>
>;
type _CreateReviewGateRequiresAdmittedPlanArtifact = AssertTrue<
  IsAssignable<AdmittedPlanExecutionArtifact, CreateReviewGateInput["admittedPlan"]>
>;
type _AdmittedPlanHandoffArtifactCanReachReview = AssertTrue<
  IsAssignable<AdmittedPlanHandoff["executionArtifact"], ReviewAdmittedPlanInput>
>;
type _FullAdmittedPlanCannotReachReview = AssertFalse<
  IsAssignable<AdmittedPlan, ReviewAdmittedPlanInput>
>;
type _RawPlanGraphCannotReachReview = AssertFalse<IsAssignable<PlanGraph, ReviewAdmittedPlanInput>>;
type _CandidatePlanCannotReachReview = AssertFalse<IsAssignable<CandidatePlan, ReviewAdmittedPlanInput>>;
type _FullPlanningHandoffCannotReachReview = AssertFalse<
  IsAssignable<AdmittedPlanHandoff, ReviewAdmittedPlanInput>
>;
type _PlanningAdmissionArtifactCannotReachReview = AssertFalse<
  IsAssignable<PlanningAdmissionArtifactPayload, ReviewAdmittedPlanInput>
>;
type _PlanningPileResultCannotReachReview = AssertFalse<
  IsAssignable<PlanningPileResult, ReviewAdmittedPlanInput>
>;
type _PlanningPileParseResultCannotReachReview = AssertFalse<
  IsAssignable<PlanningPileParseResult, ReviewAdmittedPlanInput>
>;
type _CandidateAdmissionResultCannotReachReview = AssertFalse<
  IsAssignable<AdmitCandidatePlanResult, ReviewAdmittedPlanInput>
>;
type _AcceptedCandidateAdmissionResultCannotReachReview = AssertFalse<
  IsAssignable<AdmitCandidatePlanAcceptedResult, ReviewAdmittedPlanInput>
>;
type _BatchCandidateAdmissionResultCannotReachReview = AssertFalse<
  IsAssignable<AdmitCandidatePlansResult, ReviewAdmittedPlanInput>
>;
type _MechanicalReviewNoLongerExposesConfirmedIntentInput = AssertFalse<
  IsAssignable<"intent", keyof MechanicalReviewGateInput>
>;
// AdmittedPlanRecord (the unbranded shape produced by admitCandidatePlan)
// must NOT satisfy the branded AdmittedPlan — only assertAdmittedPlanHandoff
// mints the brand (PLAN-A-01).
type _AdmittedPlanRecordIsNotAdmittedPlan = AssertFalse<IsAssignable<AdmittedPlanRecord, AdmittedPlan>>;
