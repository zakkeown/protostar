import { createHash } from "node:crypto";

import type {
  AcceptanceCriterion,
  AcceptanceCriterionId,
  ConfirmedIntent,
  IntentId
} from "@protostar/intent";
import type { CapabilityEnvelope, RiskLevel } from "@protostar/policy/capability-envelope";

export type PlanTaskKind = "research" | "design" | "implementation" | "verification" | "release";

export type PlanTaskId = `task-${string}`;

export type PlanTaskRiskDeclaration = RiskLevel;

export interface PlanTaskRiskCompatibilityRule {
  readonly taskRisk: PlanTaskRiskDeclaration;
  readonly maxRequiredCapabilityRisk: RiskLevel;
  readonly allowedRequiredCapabilityRisks: readonly RiskLevel[];
  readonly rationale: string;
}

export const PLAN_TASK_RISK_COMPATIBILITY_RULES = {
  low: {
    taskRisk: "low",
    maxRequiredCapabilityRisk: "low",
    allowedRequiredCapabilityRisks: ["low"],
    rationale: "Low-risk tasks may only require low-risk capability-envelope tool permissions."
  },
  medium: {
    taskRisk: "medium",
    maxRequiredCapabilityRisk: "medium",
    allowedRequiredCapabilityRisks: ["low", "medium"],
    rationale: "Medium-risk tasks may require low- or medium-risk capability-envelope tool permissions."
  },
  high: {
    taskRisk: "high",
    maxRequiredCapabilityRisk: "high",
    allowedRequiredCapabilityRisks: ["low", "medium", "high"],
    rationale: "High-risk tasks may require any supported capability-envelope tool permission risk."
  }
} as const satisfies Record<PlanTaskRiskDeclaration, PlanTaskRiskCompatibilityRule>;

export type PlanTaskRepoScopeCapabilityRequirement = CapabilityEnvelope["repoScopes"][number];

export type PlanTaskToolPermissionCapabilityRequirement = CapabilityEnvelope["toolPermissions"][number];

export type PlanTaskExecuteGrantCapabilityRequirement = NonNullable<CapabilityEnvelope["executeGrants"]>[number];

export type PlanTaskBudgetCapabilityRequirement = CapabilityEnvelope["budget"];

type MutablePlanTaskBudgetCapabilityRequirement = {
  -readonly [Key in keyof PlanTaskBudgetCapabilityRequirement]?: PlanTaskBudgetCapabilityRequirement[Key];
};

export interface PlanTaskRequiredCapabilities {
  readonly repoScopes: readonly PlanTaskRepoScopeCapabilityRequirement[];
  readonly toolPermissions: readonly PlanTaskToolPermissionCapabilityRequirement[];
  readonly executeGrants?: readonly PlanTaskExecuteGrantCapabilityRequirement[];
  readonly workspace?: CapabilityEnvelope["workspace"];
  readonly budget: PlanTaskBudgetCapabilityRequirement;
}

export interface PlanAcceptanceCriterion {
  readonly id: AcceptanceCriterionId;
  readonly statement: string;
  readonly verification: AcceptanceCriterion["verification"];
}

export interface PlanTask {
  readonly id: PlanTaskId;
  readonly title: string;
  readonly kind: PlanTaskKind;
  readonly dependsOn: readonly PlanTaskId[];
  readonly covers: readonly AcceptanceCriterionId[];
  readonly requiredCapabilities: PlanTaskRequiredCapabilities;
  readonly risk: PlanTaskRiskDeclaration;
}

export interface PlanTaskCoverageLink {
  readonly taskId: PlanTaskId;
  readonly acceptedCriterionId: AcceptanceCriterionId;
}

export interface PlanTaskDependencyEdge {
  readonly dependentTaskId: PlanTaskId;
  readonly dependencyTaskId: PlanTaskId;
  readonly dependencyIndex: number;
}

export interface PlanTaskDependencyGraphNode {
  readonly taskId: PlanTaskId;
  readonly dependsOn: readonly PlanTaskId[];
  readonly dependedOnBy: readonly PlanTaskId[];
}

export interface PlanTaskDependencyGraph {
  readonly nodes: readonly PlanTaskDependencyGraphNode[];
  readonly edges: readonly PlanTaskDependencyEdge[];
}

export interface PlanTaskDependencyGraphConstruction {
  readonly ok: boolean;
  readonly graph: PlanTaskDependencyGraph;
  readonly violations: readonly PlanGraphValidationViolation[];
}

export interface PlanTaskCapabilityRequirement {
  readonly taskId: PlanTaskId;
  readonly requiredCapabilities: PlanTaskRequiredCapabilities;
}

export type PlanTaskCapabilityAdmissionVerdict = "allow";

export interface PlanTaskCapabilityAdmissionResult {
  readonly taskId: PlanTaskId;
  readonly requestedCapabilities: PlanTaskRequiredCapabilities;
  readonly admittedCapabilities: PlanTaskRequiredCapabilities;
  readonly verdict: PlanTaskCapabilityAdmissionVerdict;
}

export interface PlanGraph {
  readonly planId: string;
  readonly intentId: IntentId;
  readonly createdAt: string;
  readonly strategy: string;
  readonly acceptanceCriteria: readonly PlanAcceptanceCriterion[];
  readonly tasks: readonly PlanTask[];
}

declare const admittedPlanExecutionArtifactContract: unique symbol;

// Module-private brand — NOT exported. Only `mintAdmittedPlan` (private,
// invoked solely by `assertAdmittedPlanHandoff`) can produce a value carrying
// this property, because foreign modules cannot name the symbol. This closes
// PLAN-A-01: every admitted plan that reaches execution traversed the public
// admission boundary.
declare const AdmittedPlanBrand: unique symbol;

export interface CandidatePlan extends PlanGraph {
  readonly __protostarPlanAdmissionState: "candidate-plan";
}

/**
 * The capability envelope attached to an admitted plan.
 *
 * `allowedCapabilities` is a flat list of planning-admission grant identifiers
 * (e.g. `"planning-admission-grant:write"`) that were detected and approved
 * from the confirmed intent's capability envelope during admission.
 * Execution can inspect this list to enforce that only declared capabilities
 * are used without re-reading the original intent artifact.
 */
export interface AdmittedPlanCapabilityEnvelope {
  readonly allowedCapabilities: readonly string[];
}

/**
 * Structural shape of an admitted plan WITHOUT the private brand.
 *
 * `admitCandidatePlan` / `admitCandidatePlans` return this shape so callers
 * can persist the plan, attach evidence, etc., but cannot satisfy
 * `AdmittedPlan` directly — they MUST re-mint via `assertAdmittedPlanHandoff`
 * before handing off to execution.
 */
export interface AdmittedPlanRecord extends PlanGraph {
  readonly __protostarPlanAdmissionState: "admitted-plan";
  readonly capabilityEnvelope: AdmittedPlanCapabilityEnvelope;
}

/**
 * Branded admitted plan. The `[AdmittedPlanBrand]` property is keyed by a
 * module-private `unique symbol` — foreign modules cannot construct it.
 * `assertAdmittedPlanHandoff` is the SOLE function that produces this brand.
 */
export type AdmittedPlan = AdmittedPlanRecord & {
  readonly [AdmittedPlanBrand]: true;
};

export type CandidatePlanGraph = CandidatePlan;

export interface PlanningPileResult {
  readonly kind: "planning-pile-result";
  readonly output: string;
  readonly source: "fixture" | "dogpile";
  readonly modelProviderId?: string;
  readonly traceRef?: string;
}

export type PlanningPileParseResult =
  | {
      readonly ok: true;
      readonly candidatePlan: CandidatePlanGraph;
    }
  | {
      readonly ok: false;
      readonly errors: readonly string[];
    };

interface PlanningPileOutput {
  readonly planId?: string;
  readonly strategy: string;
  readonly tasks: readonly PlanTask[];
  readonly createdAt?: string;
}

export const PLAN_GRAPH_ADMISSION_VALIDATORS = [
  "intent-match",
  "accepted-criteria",
  "task-identity",
  "task-contracts",
  "pre-handoff-verification",
  "release-grant-task",
  "acceptance-coverage",
  "immediate-dependency-cycles",
  "transitive-dependency-cycles",
  "dependency-cycle-summary"
] as const;

export type PlanningAdmissionRegisteredValidatorName =
  typeof PLAN_GRAPH_ADMISSION_VALIDATORS[number];

export const PLAN_GRAPH_ADMISSION_VALIDATOR_VERSIONS = {
  "intent-match": "1",
  "accepted-criteria": "1",
  "task-identity": "1",
  "task-contracts": "1",
  "pre-handoff-verification": "1",
  "release-grant-task": "1",
  "acceptance-coverage": "1",
  "immediate-dependency-cycles": "1",
  "transitive-dependency-cycles": "1",
  "dependency-cycle-summary": "1"
} as const satisfies Record<PlanningAdmissionRegisteredValidatorName, string>;

export type PlanningAdmissionValidatorVersions =
  typeof PLAN_GRAPH_ADMISSION_VALIDATOR_VERSIONS;

export interface PlanningAdmissionRegisteredValidatorRun {
  readonly validator: PlanningAdmissionRegisteredValidatorName;
  readonly violationCount: number;
}

export interface PlanGraphValidation {
  readonly ok: boolean;
  readonly registeredValidatorRuns: readonly PlanningAdmissionRegisteredValidatorRun[];
  readonly violations: readonly PlanGraphValidationViolation[];
  readonly capabilityViolationDiagnostics: readonly PlanningCapabilityViolationDiagnostic[];
  readonly capabilityEnvelopeGrantFieldDetections: PlanningCapabilityEnvelopeGrantFieldDetections;
  readonly planningAdmissionGrantModel: PlanningAdmissionGrantModel;
  readonly errors: readonly string[];
  readonly taskCapabilityRequirements: readonly PlanTaskCapabilityRequirement[];
  readonly taskCapabilityAdmissions: readonly PlanTaskCapabilityAdmissionResult[];
  readonly preHandoffVerificationTriggers: readonly PlanningAdmissionPreHandoffVerificationTrigger[];
  readonly releaseGrantConditions: readonly PlanningAdmissionReleaseGrantCondition[];
  readonly releaseGrantAdmission: PlanningAdmissionReleaseGrantAdmissionEvidence;
  readonly taskRiskCompatibilityOutcomes: readonly PlanningAdmissionTaskRiskCompatibilityEvidence[];
  readonly acceptanceCoverage: readonly PlanningAdmissionAcceptanceCriterionCoverageEvidence[];
}

export const PLANNING_ADMISSION_ARTIFACT_NAME = "planning-admission.json";

export const PLANNING_ADMISSION_SCHEMA_VERSION = "protostar.planning.admission.v1";

export type PlanningAdmissionDecision = "allow" | "block";

export type PlanningAdmissionStatus = "plan-admitted" | "no-plan-admitted";

export type PlanningAdmissionTaskCapabilityAdmissionVerdict = PlanTaskCapabilityAdmissionVerdict;

export type PlanningAdmissionTaskCapabilityAdmissionEvidence = PlanTaskCapabilityAdmissionResult;

export type PlanGraphHash = `sha256:${string}`;

export type PlanningAdmissionGrantAuthority =
  | "repository-write"
  | "pull-request"
  | "release";

export type PlanningAdmissionGrantSource = "confirmed-intent-capability-envelope";

export type PlanningAdmissionGrantStatus = "detected";

export type PlanningAdmissionPreHandoffGrantKind = Extract<
  PlanningCapabilityEnvelopeGrantKind,
  "write" | "pr"
>;

export type PlanningAdmissionPreHandoffAuthority = Extract<
  PlanningAdmissionGrantAuthority,
  "repository-write" | "pull-request"
>;

export type PlanningAdmissionReleaseGrantKind = Extract<
  PlanningCapabilityEnvelopeGrantKind,
  "release"
>;

export type PlanningAdmissionReleaseGrantAuthority = Extract<
  PlanningAdmissionGrantAuthority,
  "release"
>;

export type PlanningAdmissionTaskCapabilityGrantRefSection =
  | "repoScopes"
  | "toolPermissions"
  | "executeGrants";

export type PlanningAdmissionTaskCapabilityGrantRefSource = Exclude<
  PlanningCapabilityEnvelopeGrantDetectionSource,
  "explicit-grant-field"
>;

export interface PlanningAdmissionTaskCapabilityGrantRef {
  readonly section: PlanningAdmissionTaskCapabilityGrantRefSection;
  readonly index: number;
  readonly source: PlanningAdmissionTaskCapabilityGrantRefSource;
}

export interface PlanningAdmissionPreHandoffVerificationTrigger {
  readonly taskId: PlanTaskId;
  readonly grantKind: PlanningAdmissionPreHandoffGrantKind;
  readonly authority: PlanningAdmissionPreHandoffAuthority;
  readonly source: "candidate-plan-required-capabilities";
  readonly verificationPhase: "pre-handoff";
  readonly capabilityRefs: readonly PlanningAdmissionTaskCapabilityGrantRef[];
}

export interface PlanningAdmissionReleaseGrantCondition {
  readonly taskId: PlanTaskId;
  readonly grantKind: PlanningAdmissionReleaseGrantKind;
  readonly authority: PlanningAdmissionReleaseGrantAuthority;
  readonly source: "candidate-plan-required-capabilities";
  readonly admissionPhase: "before-execution";
  readonly capabilityRefs: readonly PlanningAdmissionTaskCapabilityGrantRef[];
}

export interface PlanningAdmissionGrantEvidenceRef {
  readonly fieldPath: string;
  readonly detectionSource: PlanningCapabilityEnvelopeGrantDetectionSource;
}

export interface PlanningAdmissionGrant {
  readonly id: `planning-admission-grant:${PlanningCapabilityEnvelopeGrantKind}`;
  readonly kind: PlanningCapabilityEnvelopeGrantKind;
  readonly authority: PlanningAdmissionGrantAuthority;
  readonly source: PlanningAdmissionGrantSource;
  readonly status: PlanningAdmissionGrantStatus;
  readonly evidenceRefs: readonly PlanningAdmissionGrantEvidenceRef[];
}

export interface PlanningAdmissionGrantModel {
  readonly source: PlanningAdmissionGrantSource;
  readonly grants: readonly PlanningAdmissionGrant[];
}

export type PlanningAdmissionEvaluatedTaskRiskCompatibilityOutcome = "compatible" | "incompatible";

export type PlanningAdmissionTaskRiskCompatibilityOutcome =
  | PlanningAdmissionEvaluatedTaskRiskCompatibilityOutcome
  | "not-evaluable";

export type PlanningAdmissionTaskRiskCompatibilityUnevaluableCode =
  | "missing-task-risk"
  | "malformed-task-risk"
  | "missing-task-required-capabilities"
  | "malformed-task-required-capabilities";

export interface PlanningAdmissionEvaluatedTaskRiskCompatibilityEvidence {
  readonly taskId: string;
  readonly declaredRisk: PlanTaskRiskDeclaration;
  readonly requiredCapabilityRisk: RiskLevel;
  readonly allowedRequiredCapabilityRisks: readonly RiskLevel[];
  readonly outcome: PlanningAdmissionEvaluatedTaskRiskCompatibilityOutcome;
}

export interface PlanningAdmissionUnevaluableTaskRiskCompatibilityEvidence {
  readonly taskId: string;
  readonly declaredRisk?: PlanTaskRiskDeclaration;
  readonly requiredCapabilityRisk?: RiskLevel;
  readonly allowedRequiredCapabilityRisks?: readonly RiskLevel[];
  readonly outcome: "not-evaluable";
  readonly blockingViolationCodes: readonly PlanningAdmissionTaskRiskCompatibilityUnevaluableCode[];
  readonly reason: string;
}

export type PlanningAdmissionTaskRiskCompatibilityEvidence =
  | PlanningAdmissionEvaluatedTaskRiskCompatibilityEvidence
  | PlanningAdmissionUnevaluableTaskRiskCompatibilityEvidence;

export interface PlanningAdmissionAcceptedGateSummary {
  readonly planGraphValidationPassed: true;
  readonly taskCapabilityRequirementsExtracted: true;
  readonly taskRiskCompatibilityEvidenceAttached: true;
  readonly acceptanceCriterionCoverageEvidenceAttached: true;
}

export interface PlanningAdmissionRejectedGateSummary {
  readonly planGraphValidationPassed: false;
  readonly taskCapabilityRequirementsExtracted: false;
  readonly taskRiskCompatibilityEvidenceAttached: true;
  readonly acceptanceCriterionCoverageEvidenceAttached: false;
}

export interface PlanningAdmissionPreAdmissionFailureGateSummary {
  readonly planGraphValidationPassed: false;
  readonly candidatePlanCreated: false;
  readonly taskCapabilityRequirementsExtracted: false;
  readonly taskRiskCompatibilityEvidenceAttached: false;
  readonly acceptanceCriterionCoverageEvidenceAttached: false;
}

export type PlanningAdmissionGateSummary =
  | PlanningAdmissionAcceptedGateSummary
  | PlanningAdmissionRejectedGateSummary
  | PlanningAdmissionPreAdmissionFailureGateSummary;

export interface PlanningAdmissionAcceptedValidationEvidence {
  readonly validator: "validatePlanGraph";
  readonly ok: true;
  readonly violationCount: 0;
}

export interface PlanningAdmissionRejectedValidationEvidence {
  readonly validator: "validatePlanGraph";
  readonly ok: false;
  readonly violationCount: number;
  readonly violations: readonly PlanGraphValidationViolation[];
  readonly capabilityViolationDiagnostics: readonly PlanningCapabilityViolationDiagnostic[];
}

export type PlanningAdmissionPreAdmissionFailureCode = "candidate-plan-unavailable";

export interface PlanningAdmissionPreAdmissionViolation {
  readonly code: PlanningAdmissionPreAdmissionFailureCode;
  readonly path: string;
  readonly message: string;
}

export interface PlanningAdmissionPreAdmissionValidationEvidence {
  readonly validator: "createCandidatePlanGraph";
  readonly ok: false;
  readonly violationCount: number;
  readonly violations: readonly PlanningAdmissionPreAdmissionViolation[];
  readonly capabilityViolationDiagnostics: readonly [];
}

export type PlanningAdmissionValidationEvidence =
  | PlanningAdmissionAcceptedValidationEvidence
  | PlanningAdmissionRejectedValidationEvidence
  | PlanningAdmissionPreAdmissionValidationEvidence;

export interface PlanningAdmissionAttemptReference {
  readonly id: string;
  readonly candidatePlanId: PlanGraph["planId"];
  readonly intentId: IntentId;
  readonly candidatePlanCreatedAt: PlanGraph["createdAt"];
}

export interface PlanningAdmissionAdmittedPlanReference {
  readonly planId: PlanGraph["planId"];
  readonly uri: string;
  readonly pointer: "#";
  readonly sourceOfTruth: "PlanGraph";
}

export type PlanningAdmissionPlanGraphReference = PlanningAdmissionAdmittedPlanReference;

export type PlanningAdmissionCandidateSourceKind = "candidate-plan-graph" | "planning-pile-result";

export interface PlanningAdmissionPlanGraphCandidateSourceReference {
  readonly kind: "candidate-plan-graph";
  readonly planId: PlanGraph["planId"];
  readonly uri: string;
  readonly pointer: "#";
  readonly createdAt: PlanGraph["createdAt"];
  readonly sourceOfTruth: "PlanGraph";
}

export interface PlanningAdmissionPlanningPileResultSourceReference {
  readonly kind: "planning-pile-result";
  readonly uri: string;
  readonly pointer: "#";
  readonly sourceOfTruth: "PlanningPileResult";
}

export type PlanningAdmissionCandidateSourceReference =
  | PlanningAdmissionPlanGraphCandidateSourceReference
  | PlanningAdmissionPlanningPileResultSourceReference;

export interface PlanningAdmissionCandidatePlanIdentity {
  readonly planId: PlanGraph["planId"];
  readonly intentId: IntentId;
  readonly createdAt: PlanGraph["createdAt"];
  readonly source: PlanningAdmissionPlanGraphCandidateSourceReference;
}

export interface PlanningAdmissionUnavailableCandidatePlanIdentity {
  readonly planId: PlanGraph["planId"];
  readonly intentId: IntentId;
  readonly createdAt: string;
  readonly candidatePlanCreated: false;
  readonly source: PlanningAdmissionPlanningPileResultSourceReference;
}

export type PlanningAdmissionCandidateIdentity =
  | PlanningAdmissionCandidatePlanIdentity
  | PlanningAdmissionUnavailableCandidatePlanIdentity;

export type PlanningAdmissionFailureState = "validation-failed" | "pre-admission-failed";

export interface PlanningAdmissionRejectionReason {
  readonly validator: PlanningAdmissionRegisteredValidatorName;
  readonly code: PlanGraphValidationViolationCode;
  readonly path: string;
  readonly affectedPlanLocation: PlanGraphViolationAffectedPlanLocation;
  readonly message: string;
  readonly taskId?: string;
  readonly acceptanceCriterionId?: string;
}

export type PlanningAdmissionReleaseGrantRejectionCode =
  | "task-required-release-grant-denied"
  | "release-grant-without-explicit-release-task"
  | "release-grant-missing-verification-evidence";

export interface PlanningAdmissionReleaseGrantRejectionReason {
  readonly code: PlanningAdmissionReleaseGrantRejectionCode;
  readonly path: string;
  readonly affectedPlanLocation: PlanGraphViolationAffectedPlanLocation;
  readonly message: string;
  readonly taskId?: string;
}

export interface PlanningAdmissionReleaseGrantAdmissionEvidence {
  readonly decision: PlanningAdmissionDecision;
  readonly required: boolean;
  readonly conditionCount: number;
  readonly rejectedConditionCount: number;
  readonly rejectionReasons: readonly PlanningAdmissionReleaseGrantRejectionReason[];
}

export interface PlanningAdmissionFailureDetails {
  readonly state: "validation-failed";
  readonly status: "no-plan-admitted";
  readonly admittedPlanCreated: false;
  readonly candidatePlan: PlanningAdmissionCandidatePlanIdentity;
  readonly violationCount: number;
  readonly rejectionReasons: readonly PlanningAdmissionRejectionReason[];
}

export interface PlanningAdmissionPreAdmissionRejectionReason {
  readonly code: PlanningAdmissionPreAdmissionFailureCode;
  readonly path: string;
  readonly message: string;
}

export interface PlanningAdmissionPreAdmissionFailureDetails {
  readonly state: "pre-admission-failed";
  readonly status: "no-plan-admitted";
  readonly admittedPlanCreated: false;
  readonly candidatePlanCreated: false;
  readonly candidatePlanId: PlanGraph["planId"];
  readonly intentId: IntentId;
  readonly candidateSource: PlanningAdmissionPlanningPileResultSourceReference;
  readonly violationCount: number;
  readonly rejectionReasons: readonly PlanningAdmissionPreAdmissionRejectionReason[];
}

export type PlanningAdmissionHandoffStage = "execution" | "review";

export interface PlanningAdmissionHandoffMetadata {
  readonly readyFor: readonly PlanningAdmissionHandoffStage[];
  readonly admittedPlanUri: string;
  readonly planningAdmissionUri: string;
  readonly validationSource: typeof PLANNING_ADMISSION_ARTIFACT_NAME;
  readonly proofSource: "PlanGraph";
}

export interface PlanningAdmissionCoverageLinkEvidence {
  readonly taskId: PlanTaskId;
  readonly coveragePath: `tasks.${PlanTaskId}.covers.${number}`;
}

export interface PlanningAdmissionAcceptanceCriterionCoverageEvidence {
  readonly acceptanceCriterionId: AcceptanceCriterionId;
  readonly acceptedCriterionPath: `acceptanceCriteria.${number}`;
  readonly coverageLinks: readonly PlanningAdmissionCoverageLinkEvidence[];
}

export interface PlanningAdmissionAcceptedArtifactDetails {
  readonly gate: PlanningAdmissionAcceptedGateSummary;
  readonly validation: PlanningAdmissionAcceptedValidationEvidence;
  readonly grantModel: PlanningAdmissionGrantModel;
  readonly taskCapabilityAdmissions: readonly PlanningAdmissionTaskCapabilityAdmissionEvidence[];
  readonly preHandoffVerificationTriggers: readonly PlanningAdmissionPreHandoffVerificationTrigger[];
  readonly releaseGrantConditions: readonly PlanningAdmissionReleaseGrantCondition[];
  readonly releaseGrantAdmission: PlanningAdmissionReleaseGrantAdmissionEvidence;
  readonly taskRiskCompatibilityOutcomes: readonly PlanningAdmissionTaskRiskCompatibilityEvidence[];
  readonly acceptanceCoverage: readonly PlanningAdmissionAcceptanceCriterionCoverageEvidence[];
}

export interface PlanningAdmissionRejectedArtifactDetails {
  readonly gate: PlanningAdmissionRejectedGateSummary;
  readonly validation: PlanningAdmissionRejectedValidationEvidence;
  readonly grantModel: PlanningAdmissionGrantModel;
  readonly taskRiskCompatibilityOutcomes: readonly PlanningAdmissionTaskRiskCompatibilityEvidence[];
  readonly releaseGrantAdmission: PlanningAdmissionReleaseGrantAdmissionEvidence;
  readonly failure: PlanningAdmissionFailureDetails;
}

export interface PlanningAdmissionPreAdmissionFailureArtifactDetails {
  readonly gate: PlanningAdmissionPreAdmissionFailureGateSummary;
  readonly validation: PlanningAdmissionPreAdmissionValidationEvidence;
  readonly grantModel: PlanningAdmissionGrantModel;
  readonly failure: PlanningAdmissionPreAdmissionFailureDetails;
}

export type PlanningAdmissionArtifactDetails =
  | PlanningAdmissionAcceptedArtifactDetails
  | PlanningAdmissionRejectedArtifactDetails
  | PlanningAdmissionPreAdmissionFailureArtifactDetails;

export interface PlanningAdmissionAcceptedArtifactPayload {
  readonly schemaVersion: typeof PLANNING_ADMISSION_SCHEMA_VERSION;
  readonly artifact: typeof PLANNING_ADMISSION_ARTIFACT_NAME;
  readonly decision: "allow";
  readonly admissionStatus: "plan-admitted";
  readonly admitted: true;
  readonly admittedAt: string;
  readonly planningAttempt: PlanningAdmissionAttemptReference;
  readonly candidateSource: PlanningAdmissionPlanGraphCandidateSourceReference;
  readonly candidatePlan: PlanningAdmissionCandidatePlanIdentity;
  readonly planId: PlanGraph["planId"];
  readonly intentId: IntentId;
  readonly plan_hash: PlanGraphHash;
  readonly validators_passed: readonly PlanningAdmissionRegisteredValidatorName[];
  readonly validator_versions: PlanningAdmissionValidatorVersions;
  readonly errors: readonly [];
}

export interface PlanningAdmissionAcceptedArtifactRuntimeView
  extends PlanningAdmissionAcceptedArtifactPayload {
  readonly admittedPlan: PlanningAdmissionAdmittedPlanReference;
  readonly handoff: PlanningAdmissionHandoffMetadata;
  readonly details: PlanningAdmissionAcceptedArtifactDetails;
}

export interface PlanningAdmissionRejectedArtifactPayload {
  readonly schemaVersion: typeof PLANNING_ADMISSION_SCHEMA_VERSION;
  readonly artifact: typeof PLANNING_ADMISSION_ARTIFACT_NAME;
  readonly decision: "block";
  readonly admissionStatus: "no-plan-admitted";
  readonly admitted: false;
  readonly planningAttempt: PlanningAdmissionAttemptReference;
  readonly candidateSource: PlanningAdmissionCandidateSourceReference;
  readonly candidatePlan: PlanningAdmissionCandidatePlanIdentity;
  readonly planId: PlanGraph["planId"];
  readonly intentId: IntentId;
  readonly details: PlanningAdmissionRejectedArtifactDetails;
  readonly errors: readonly string[];
}

export interface PlanningAdmissionPreAdmissionFailureArtifactPayload {
  readonly schemaVersion: typeof PLANNING_ADMISSION_SCHEMA_VERSION;
  readonly artifact: typeof PLANNING_ADMISSION_ARTIFACT_NAME;
  readonly decision: "block";
  readonly admissionStatus: "no-plan-admitted";
  readonly admitted: false;
  readonly planningAttempt: PlanningAdmissionAttemptReference;
  readonly candidateSource: PlanningAdmissionPlanningPileResultSourceReference;
  readonly candidatePlan: PlanningAdmissionUnavailableCandidatePlanIdentity;
  readonly planId: PlanGraph["planId"];
  readonly intentId: IntentId;
  readonly details: PlanningAdmissionPreAdmissionFailureArtifactDetails;
  readonly errors: readonly string[];
}

export type PlanningAdmissionArtifactPayload =
  | PlanningAdmissionAcceptedArtifactPayload
  | PlanningAdmissionAcceptedArtifactRuntimeView
  | PlanningAdmissionRejectedArtifactPayload
  | PlanningAdmissionPreAdmissionFailureArtifactPayload;

export interface CreatePlanningAdmissionArtifactInput {
  readonly graph: CandidatePlan;
  readonly intent: ConfirmedIntent;
  readonly planningAttemptId?: string;
  readonly planGraphUri?: string;
  readonly admittedAt?: string;
  readonly planningAdmissionUri?: string;
  readonly candidateSourceUri?: string;
  readonly validation?: PlanGraphValidation;
  readonly planningAdmissionGrantModel?: unknown;
}

export interface AdmitCandidatePlanInput extends CreatePlanningAdmissionArtifactInput {}

export interface AdmitCandidatePlanAcceptedResult {
  readonly ok: true;
  readonly admittedPlan: AdmittedPlanRecord;
  readonly planningAdmission: PlanningAdmissionAcceptedArtifactRuntimeView;
  readonly validation: PlanGraphValidation;
  readonly rejectionReasons: readonly [];
  readonly errors: readonly [];
}

export interface AdmitCandidatePlanRejectedResult {
  readonly ok: false;
  readonly planningAdmission: PlanningAdmissionRejectedArtifactPayload;
  readonly validation: PlanGraphValidation;
  readonly rejectionReasons: readonly PlanningAdmissionRejectionReason[];
  readonly errors: readonly string[];
  readonly admittedPlan?: never;
}

export type AdmitCandidatePlanResult =
  | AdmitCandidatePlanAcceptedResult
  | AdmitCandidatePlanRejectedResult;

export interface PlanningAdmissionAcceptedCandidateAdmissionResult {
  readonly candidateIndex: number;
  readonly planId: PlanGraph["planId"];
  readonly intentId: IntentId;
  readonly createdAt: PlanGraph["createdAt"];
  readonly decision: "allow";
  readonly admissionStatus: "plan-admitted";
  readonly admitted: true;
  readonly validation: PlanningAdmissionAcceptedValidationEvidence;
  readonly rejectionReasons: readonly [];
  readonly errors: readonly [];
}

export interface PlanningAdmissionRejectedCandidateAdmissionResult {
  readonly candidateIndex: number;
  readonly planId: PlanGraph["planId"];
  readonly intentId: IntentId;
  readonly createdAt: PlanGraph["createdAt"];
  readonly decision: "block";
  readonly admissionStatus: "no-plan-admitted";
  readonly admitted: false;
  readonly validation: PlanningAdmissionRejectedValidationEvidence;
  readonly rejectionReasons: readonly PlanningAdmissionRejectionReason[];
  readonly errors: readonly string[];
}

export type PlanningAdmissionCandidateAdmissionResult =
  | PlanningAdmissionAcceptedCandidateAdmissionResult
  | PlanningAdmissionRejectedCandidateAdmissionResult;

export interface PlanningAdmissionCandidateAdmissionSummary {
  readonly allCandidatesValidated: true;
  readonly candidateCount: number;
  readonly admittedCandidateIndex?: number;
  readonly rejectedCandidateCount: number;
}

export interface PlanningAdmissionCandidateAdmissionEvidence {
  readonly candidateAdmissionSummary: PlanningAdmissionCandidateAdmissionSummary;
  readonly candidateAdmissionResults: readonly PlanningAdmissionCandidateAdmissionResult[];
}

export interface AdmitCandidatePlansInput
  extends Omit<CreatePlanningAdmissionArtifactInput, "graph" | "validation"> {
  readonly candidatePlans: readonly CandidatePlan[];
}

export interface AdmitCandidatePlansAcceptedResult {
  readonly ok: true;
  readonly admittedPlan: AdmittedPlanRecord;
  readonly candidatePlan: CandidatePlan;
  readonly admittedCandidateIndex: number;
  readonly planningAdmission: PlanningAdmissionAcceptedArtifactRuntimeView &
    PlanningAdmissionCandidateAdmissionEvidence;
  readonly validation: PlanGraphValidation;
  readonly candidateAdmissionResults: readonly PlanningAdmissionCandidateAdmissionResult[];
  readonly rejectionReasons: readonly [];
  readonly errors: readonly [];
}

export interface AdmitCandidatePlansRejectedResult {
  readonly ok: false;
  readonly planningAdmission: PlanningAdmissionRejectedArtifactPayload &
    PlanningAdmissionCandidateAdmissionEvidence;
  readonly validation: PlanGraphValidation;
  readonly candidateAdmissionResults: readonly PlanningAdmissionCandidateAdmissionResult[];
  readonly rejectionReasons: readonly PlanningAdmissionRejectionReason[];
  readonly errors: readonly string[];
  readonly admittedPlan?: never;
}

export type AdmitCandidatePlansResult =
  | AdmitCandidatePlansAcceptedResult
  | AdmitCandidatePlansRejectedResult;

export interface CreatePlanningPreAdmissionFailureArtifactInput {
  readonly intent: ConfirmedIntent;
  readonly candidatePlanId: PlanGraph["planId"];
  readonly errors: readonly string[];
  readonly planningAttemptId?: string;
  readonly attemptedAt?: string;
  readonly candidateSourceUri?: string;
  readonly planningAdmissionGrantModel?: unknown;
}

export type AdmittedPlanHandoffViolationCode =
  | "planning-admission-artifact-not-persisted"
  | "planning-admission-artifact-name-mismatch"
  | "planning-admission-uri-mismatch"
  | "planning-admission-not-admitted"
  | "planning-admission-errors-present"
  | "planning-admission-plan-mismatch"
  | "planning-admission-plan-hash-mismatch"
  | "planning-admission-intent-mismatch"
  | "planning-admission-admitted-plan-mismatch"
  | "planning-admission-handoff-not-ready-for-execution"
  | "planning-admission-validation-source-mismatch"
  | "planning-admission-proof-source-mismatch"
  | "planning-admission-validation-not-passed"
  | "planning-admission-validator-set-mismatch"
  | "planning-admission-validator-version-mismatch";

export interface PersistedPlanningAdmissionArtifactRef {
  readonly artifact: string;
  readonly uri: string;
  readonly persisted: boolean;
}

export interface AdmittedPlanHandoffEvidence {
  readonly planId: PlanGraph["planId"];
  readonly intentId: IntentId;
  readonly planGraphUri: string;
  readonly planningAdmissionArtifact: typeof PLANNING_ADMISSION_ARTIFACT_NAME;
  readonly planningAdmissionUri: typeof PLANNING_ADMISSION_ARTIFACT_NAME;
  readonly validationSource: typeof PLANNING_ADMISSION_ARTIFACT_NAME;
  readonly proofSource: "PlanGraph";
}

export interface AdmittedPlanExecutionTask {
  readonly planTaskId: PlanTaskId;
  readonly title: string;
  readonly dependsOn: readonly PlanTaskId[];
}

export interface AdmittedPlanExecutionArtifact {
  readonly [admittedPlanExecutionArtifactContract]: "admitted-plan-execution-artifact";
  readonly planId: PlanGraph["planId"];
  readonly intentId: IntentId;
  readonly admittedPlan: PlanningAdmissionAdmittedPlanReference;
  readonly evidence: AdmittedPlanHandoffEvidence;
  readonly tasks: readonly AdmittedPlanExecutionTask[];
}

export interface AdmittedPlanHandoff {
  readonly plan: AdmittedPlan;
  readonly planningAdmission: PlanningAdmissionAcceptedArtifactPayload;
  readonly evidence: AdmittedPlanHandoffEvidence;
  readonly executionArtifact: AdmittedPlanExecutionArtifact;
}

export interface CreateAdmittedPlanHandoffInput {
  readonly plan: CandidatePlan | AdmittedPlanRecord;
  readonly planningAdmission: PlanningAdmissionArtifactPayload;
  readonly planningAdmissionArtifact: PersistedPlanningAdmissionArtifactRef;
  readonly planGraphUri?: string;
}

export interface AdmittedPlanHandoffViolation {
  readonly code: AdmittedPlanHandoffViolationCode;
  readonly path: string;
  readonly message: string;
}

export type AdmittedPlanHandoffValidation =
  | {
      readonly ok: true;
      readonly violations: readonly [];
      readonly errors: readonly [];
    }
  | {
      readonly ok: false;
      readonly violations: readonly AdmittedPlanHandoffViolation[];
      readonly errors: readonly string[];
    };

export type PlanningCapabilityEnvelopeGrantKind = "write" | "pr" | "release";

export type PlanningCapabilityEnvelopeGrantDetectionSource =
  | "explicit-grant-field"
  | "repo-scope-access"
  | "tool-permission"
  | "execute-grant";

export type PlanningAdmissionGrantDeniedViolationCode =
  | "task-required-write-grant-denied"
  | "task-required-pull-request-grant-denied"
  | "task-required-release-grant-denied";

export interface PlanningCapabilityEnvelopeGrantDetection {
  readonly grantKind: PlanningCapabilityEnvelopeGrantKind;
  readonly fieldPath: string;
  readonly source: PlanningCapabilityEnvelopeGrantDetectionSource;
  readonly matchedValue: string;
}

export interface PlanningCapabilityEnvelopeGrantFieldDetections {
  readonly writeGrantFields: readonly PlanningCapabilityEnvelopeGrantDetection[];
  readonly prGrantFields: readonly PlanningCapabilityEnvelopeGrantDetection[];
  readonly releaseGrantFields: readonly PlanningCapabilityEnvelopeGrantDetection[];
  readonly detectedGrantKinds: readonly PlanningCapabilityEnvelopeGrantKind[];
}

export interface DetectCapabilityEnvelopeGrantFieldsInput {
  readonly capabilityEnvelope?: CapabilityEnvelope | Record<string, unknown>;
}

export interface NormalizePlanningAdmissionGrantModelInput {
  readonly detections: PlanningCapabilityEnvelopeGrantFieldDetections;
}

export type PlanGraphValidationViolationCode =
  | "intent-mismatch"
  | "tasks-not-array"
  | "malformed-task"
  | "invalid-task-id"
  | "malformed-task-title"
  | "malformed-task-kind"
  | "duplicate-task-id"
  | "malformed-task-dependencies"
  | "invalid-task-dependency-id"
  | "malformed-task-coverage"
  | "empty-task-coverage"
  | "invalid-task-coverage-accepted-criterion-id"
  | "duplicate-task-coverage-accepted-criterion-id"
  | "unknown-acceptance-criterion"
  | "unaccepted-task-coverage-accepted-criterion-id"
  | "missing-task-dependency"
  | "self-task-dependency"
  | "uncovered-acceptance-criterion"
  | "accepted-criteria-not-array"
  | "empty-accepted-criteria"
  | "malformed-accepted-criterion"
  | "invalid-accepted-criterion-id"
  | "duplicate-accepted-criterion-id"
  | "unknown-accepted-criterion"
  | "drifted-accepted-criterion"
  | "missing-accepted-criterion"
  | "dependency-cycle"
  | "missing-task-risk"
  | "malformed-task-risk"
  | "missing-task-required-capabilities"
  | "malformed-task-required-capabilities"
  | "malformed-task-required-repo-scope"
  | "malformed-task-required-tool-permission"
  | "malformed-task-required-execute-grant"
  | "malformed-task-required-budget"
  | PlanningAdmissionGrantDeniedViolationCode
  | "verification_required_by_envelope"
  | "release-grant-without-explicit-release-task"
  | "release-grant-missing-verification-evidence"
  | "task-risk-below-required-capability-risk"
  | "task-required-repo-scope-outside-intent-envelope"
  | "task-required-tool-permission-outside-intent-envelope"
  | "task-required-execute-grant-outside-intent-envelope"
  | "task-required-budget-outside-intent-envelope";

export type PlanningCapabilityViolationRule =
  | "missing-task-required-capabilities"
  | "malformed-task-required-capabilities"
  | "malformed-task-required-repo-scope"
  | "malformed-task-required-tool-permission"
  | "malformed-task-required-execute-grant"
  | "malformed-task-required-budget"
  | PlanningAdmissionGrantDeniedViolationCode
  | "task-risk-below-required-capability-risk"
  | "task-required-repo-scope-outside-intent-envelope"
  | "task-required-tool-permission-outside-intent-envelope"
  | "task-required-execute-grant-outside-intent-envelope"
  | "task-required-budget-outside-intent-envelope";

export type PlanningCapabilityViolationSeverity = "block";

export interface PlanningCapabilityViolationDiagnostic {
  readonly taskId: string;
  readonly violatedRule: PlanningCapabilityViolationRule;
  readonly capabilityPath: string;
  readonly severity: PlanningCapabilityViolationSeverity;
  readonly message: string;
}

export type PlanGraphViolationAffectedPlanLocationKind = "field" | "node" | "edge";

export interface PlanGraphViolationAffectedPlanLocation {
  readonly kind: PlanGraphViolationAffectedPlanLocationKind;
  readonly path: string;
  readonly taskId?: string;
  readonly dependencyTaskId?: string;
  readonly dependencyIndex?: number;
  readonly acceptanceCriterionId?: string;
}

interface PlanGraphValidationViolationDraft {
  readonly code: PlanGraphValidationViolationCode;
  readonly path: string;
  readonly affectedPlanLocation?: PlanGraphViolationAffectedPlanLocation;
  readonly message: string;
  readonly taskId?: string;
  readonly duplicateTaskId?: string;
  readonly firstIndex?: number;
  readonly duplicateIndex?: number;
  readonly dependency?: string;
  readonly dependencyIndex?: number;
  readonly coverageIndex?: number;
  readonly acceptanceCriterionId?: string;
  readonly cyclePath?: readonly PlanTaskId[];
  readonly declaredRisk?: RiskLevel;
  readonly requiredRisk?: RiskLevel;
}

export interface PlanGraphValidationViolation extends PlanGraphValidationViolationDraft {
  readonly validator: PlanningAdmissionRegisteredValidatorName;
  readonly affectedPlanLocation: PlanGraphViolationAffectedPlanLocation;
}

export interface CreatePlanGraphInput {
  readonly planId: string;
  readonly intent: ConfirmedIntent;
  readonly strategy: string;
  readonly tasks: readonly PlanTask[];
  readonly createdAt?: string;
}

export interface ValidatePlanGraphInput {
  readonly graph: PlanGraph;
  readonly intent: ConfirmedIntent;
  readonly planningAdmissionGrantModel?: unknown;
}

export function createPlanGraph(input: CreatePlanGraphInput): CandidatePlan {
  const graph: PlanGraph = {
    planId: input.planId,
    intentId: input.intent.id,
    createdAt: input.createdAt ?? new Date().toISOString(),
    strategy: input.strategy,
    acceptanceCriteria: input.intent.acceptanceCriteria.map(copyPlanAcceptanceCriterion),
    tasks: input.tasks
  };
  const validation = validatePlanGraph({
    graph,
    intent: input.intent
  });
  if (!validation.ok) {
    throw new Error(`Invalid plan graph: ${validation.errors.join("; ")}`);
  }
  return defineCandidatePlan({
    ...graph,
    tasks: normalizePlanTasksWithCapabilityRequirements(
      graph.tasks,
      validation.taskCapabilityRequirements
    )
  });
}

export function defineCandidatePlan(graph: PlanGraph): CandidatePlan {
  return graph as CandidatePlan;
}

export function parsePlanningPileResult(
  result: PlanningPileResult,
  context: {
    readonly intent: ConfirmedIntent;
    readonly defaultPlanId: string;
  }
): PlanningPileParseResult {
  const parsed = parsePlanningPileOutput(result.output);
  if (!parsed.ok) {
    return parsed;
  }

  return {
    ok: true,
    candidatePlan: createCandidatePlanGraphFromPlanningPileOutput(parsed.output, context)
  };
}

export function assertCandidatePlanFromPlanningPileResult(
  result: PlanningPileResult,
  context: {
    readonly intent: ConfirmedIntent;
    readonly defaultPlanId: string;
  }
): CandidatePlanGraph {
  const parsed = parsePlanningPileResult(result, context);
  if (!parsed.ok) {
    throw new Error(`Invalid planning pile result: ${parsed.errors.join("; ")}`);
  }
  return parsed.candidatePlan;
}

export function assertPlanningPileResult(value: unknown): PlanningPileResult {
  const errors: string[] = [];
  if (!isRecord(value)) {
    throw new Error("Invalid planning pile result: result must be a JSON object.");
  }

  const kind = readPlanningPileString(value, "kind", errors);
  const output = readPlanningPileString(value, "output", errors);
  const source = readPlanningPileString(value, "source", errors);
  const modelProviderId = readOptionalPlanningPileString(value, "modelProviderId", errors);
  const traceRef = readOptionalPlanningPileString(value, "traceRef", errors);

  if (kind !== undefined && kind !== "planning-pile-result") {
    errors.push("kind must be planning-pile-result.");
  }
  if (source !== undefined && !isPlanningPileResultSource(source)) {
    errors.push("source must be fixture or dogpile.");
  }
  if (errors.length > 0 || output === undefined || !isPlanningPileResultSource(source)) {
    throw new Error(`Invalid planning pile result: ${errors.join("; ")}`);
  }

  return {
    kind: "planning-pile-result",
    output,
    source,
    ...(modelProviderId !== undefined ? { modelProviderId } : {}),
    ...(traceRef !== undefined ? { traceRef } : {})
  };
}

function parsePlanningPileOutput(output: string):
  | {
      readonly ok: true;
      readonly output: PlanningPileOutput;
    }
  | {
      readonly ok: false;
      readonly errors: readonly string[];
    } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(output);
  } catch (error: unknown) {
    return {
      ok: false,
      errors: [`output must be valid JSON: ${error instanceof Error ? error.message : String(error)}`]
    };
  }

  const errors: string[] = [];
  if (!isRecord(parsed)) {
    return {
      ok: false,
      errors: ["output JSON must be an object."]
    };
  }

  collectPlanningPileUnexpectedKeys(parsed, PLANNING_PILE_OUTPUT_KEYS, "output", errors);

  const strategy = readPlanningPileString(parsed, "strategy", errors);
  const planId = readOptionalPlanningPileString(parsed, "planId", errors);
  const createdAt = readOptionalPlanningPileString(parsed, "createdAt", errors);
  const rawTasks = parsed["tasks"];
  const tasks = parsePlanningPilePlanTasks(rawTasks, errors);

  if (Array.isArray(rawTasks) && rawTasks.length === 0) {
    errors.push("tasks must contain at least one task.");
  }
  if (errors.length > 0 || strategy === undefined) {
    return {
      ok: false,
      errors
    };
  }

  return {
    ok: true,
    output: {
      strategy,
      tasks,
      ...(planId !== undefined ? { planId } : {}),
      ...(createdAt !== undefined ? { createdAt } : {})
    }
  };
}

function createCandidatePlanGraphFromPlanningPileOutput(
  output: PlanningPileOutput,
  context: {
    readonly intent: ConfirmedIntent;
    readonly defaultPlanId: string;
  }
): CandidatePlanGraph {
  return defineCandidatePlan({
    planId: output.planId ?? context.defaultPlanId,
    intentId: context.intent.id,
    createdAt: output.createdAt ?? new Date().toISOString(),
    strategy: output.strategy,
    acceptanceCriteria: context.intent.acceptanceCriteria.map(({ id, statement, verification }) => ({
      id,
      statement,
      verification
    })),
    tasks: output.tasks
  });
}

function parsePlanningPilePlanTasks(value: unknown, errors: string[]): readonly PlanTask[] {
  if (!Array.isArray(value)) {
    errors.push("tasks must be an array.");
    return [];
  }

  return value.flatMap((entry, index): PlanTask[] => {
    if (!isRecord(entry)) {
      errors.push(`tasks[${index}] must be an object.`);
      return [];
    }

    collectPlanningPileUnexpectedKeys(entry, PLANNING_PILE_TASK_KEYS, `tasks[${index}]`, errors);

    const id = readPlanningPileString(entry, `tasks[${index}].id`, errors);
    const title = readPlanningPileString(entry, `tasks[${index}].title`, errors);
    const kind = readPlanningPileString(entry, `tasks[${index}].kind`, errors);
    const risk = readPlanningPileString(entry, `tasks[${index}].risk`, errors);
    const dependsOn = readPlanningPileStringArray(entry, `tasks[${index}].dependsOn`, errors);
    const covers = readPlanningPileStringArray(entry, `tasks[${index}].covers`, errors);
    const requiredCapabilities = parsePlanningPileRequiredCapabilities(
      entry["requiredCapabilities"],
      `tasks[${index}].requiredCapabilities`,
      errors
    );

    if (kind !== undefined && !isPlanTaskKind(kind)) {
      errors.push(`tasks[${index}].kind must be research, design, implementation, verification, or release.`);
    }
    if (risk !== undefined && !isRiskLevel(risk)) {
      errors.push(`tasks[${index}].risk must be low, medium, or high.`);
    }
    if (id !== undefined && !isPlanTaskId(id)) {
      errors.push(`tasks[${index}].id must start with task-.`);
    }
    for (const [dependencyIndex, dependency] of dependsOn.entries()) {
      if (!isPlanTaskId(dependency)) {
        errors.push(`tasks[${index}].dependsOn[${dependencyIndex}] must start with task-.`);
      }
    }
    for (const criterionId of covers) {
      if (!criterionId.startsWith("ac_")) {
        errors.push(`tasks[${index}].covers entries must start with ac_.`);
      }
    }
    if (
      id === undefined ||
      !isPlanTaskId(id) ||
      title === undefined ||
      !isPlanTaskKind(kind) ||
      !isRiskLevel(risk) ||
      requiredCapabilities === undefined ||
      dependsOn.some((dependency) => !isPlanTaskId(dependency)) ||
      covers.some((criterionId) => !criterionId.startsWith("ac_"))
    ) {
      return [];
    }

    return [
      {
        id,
        title,
        kind,
        dependsOn: dependsOn as readonly PlanTaskId[],
        covers: covers as readonly AcceptanceCriterionId[],
        requiredCapabilities,
        risk
      }
    ];
  });
}

function parsePlanningPileRequiredCapabilities(
  value: unknown,
  path: string,
  errors: string[]
): PlanTaskRequiredCapabilities | undefined {
  const startingErrorCount = errors.length;

  if (value === undefined) {
    errors.push(`${path} must be provided in normalized capability-envelope shape.`);
    return undefined;
  }
  if (!isRecord(value)) {
    errors.push(`${path} must be an object in normalized capability-envelope shape.`);
    return undefined;
  }

  collectPlanningPileUnexpectedKeys(value, PLANNING_PILE_REQUIRED_CAPABILITIES_KEYS, path, errors);

  const repoScopes = parsePlanningPileRequiredCapabilityRepoScopes(value["repoScopes"], `${path}.repoScopes`, errors);
  const toolPermissions = parsePlanningPileRequiredCapabilityToolPermissions(
    value["toolPermissions"],
    `${path}.toolPermissions`,
    errors
  );
  const executeGrants = parsePlanningPileRequiredCapabilityExecuteGrants(
    value["executeGrants"],
    `${path}.executeGrants`,
    errors
  );
  const taskBudget = parsePlanningPileRequiredCapabilityBudget(value["budget"], `${path}.budget`, errors);

  if (
    errors.length > startingErrorCount ||
    repoScopes === undefined ||
    toolPermissions === undefined ||
    taskBudget === undefined
  ) {
    return undefined;
  }

  return {
    repoScopes,
    toolPermissions,
    ...(executeGrants !== undefined ? { executeGrants } : {}),
    budget: taskBudget
  };
}

function parsePlanningPileRequiredCapabilityRepoScopes(
  value: unknown,
  path: string,
  errors: string[]
): readonly PlanTaskRepoScopeCapabilityRequirement[] | undefined {
  if (value === undefined) {
    errors.push(`${path} must be an array.`);
    return undefined;
  }
  if (!Array.isArray(value)) {
    errors.push(`${path} must be an array.`);
    return undefined;
  }

  return value.flatMap((entry, index): PlanTaskRepoScopeCapabilityRequirement[] => {
    if (!isRecord(entry)) {
      errors.push(`${path}[${index}] must be an object.`);
      return [];
    }

    collectPlanningPileUnexpectedKeys(entry, PLANNING_PILE_REPO_SCOPE_KEYS, `${path}[${index}]`, errors);

    const workspace = readPlanningPileString(entry, `${path}[${index}].workspace`, errors);
    const repoPath = readPlanningPileString(entry, `${path}[${index}].path`, errors);
    const access = readPlanningPileString(entry, `${path}[${index}].access`, errors);

    if (access !== undefined && !isRepoAccess(access)) {
      errors.push(`${path}[${index}].access must be read, write, or execute.`);
    }
    if (workspace === undefined || repoPath === undefined || !isRepoAccess(access)) {
      return [];
    }

    return [{ workspace, path: repoPath, access }];
  });
}

function parsePlanningPileRequiredCapabilityToolPermissions(
  value: unknown,
  path: string,
  errors: string[]
): readonly PlanTaskToolPermissionCapabilityRequirement[] | undefined {
  if (value === undefined) {
    errors.push(`${path} must be an array.`);
    return undefined;
  }
  if (!Array.isArray(value)) {
    errors.push(`${path} must be an array.`);
    return undefined;
  }

  return value.flatMap((entry, index): PlanTaskToolPermissionCapabilityRequirement[] => {
    if (!isRecord(entry)) {
      errors.push(`${path}[${index}] must be an object.`);
      return [];
    }

    collectPlanningPileUnexpectedKeys(entry, PLANNING_PILE_TOOL_PERMISSION_KEYS, `${path}[${index}]`, errors);

    const tool = readPlanningPileString(entry, `${path}[${index}].tool`, errors);
    const permissionLevelPath = `${path}[${index}].permissionLevel`;
    const rawPermissionLevel = entry["permissionLevel"];
    const permissionLevel = rawPermissionLevel === undefined
      ? undefined
      : typeof rawPermissionLevel === "string" && rawPermissionLevel.trim().length > 0
        ? rawPermissionLevel
        : undefined;
    const normalizedPermissionLevel = isToolPermissionLevel(permissionLevel) ? permissionLevel : undefined;
    const reason = readPlanningPileString(entry, `${path}[${index}].reason`, errors);
    const risk = readPlanningPileString(entry, `${path}[${index}].risk`, errors);

    if (rawPermissionLevel !== undefined && permissionLevel === undefined) {
      errors.push(`${permissionLevelPath} must be a non-empty string when provided.`);
    } else if (permissionLevel !== undefined && normalizedPermissionLevel === undefined) {
      errors.push(`${permissionLevelPath} must be read, use, write, execute, or admin.`);
    }
    if (risk !== undefined && !isRiskLevel(risk)) {
      errors.push(`${path}[${index}].risk must be low, medium, or high.`);
    }
    if (
      tool === undefined ||
      reason === undefined ||
      !isRiskLevel(risk) ||
      (permissionLevel !== undefined && normalizedPermissionLevel === undefined)
    ) {
      return [];
    }

    return [
      {
        tool,
        ...(normalizedPermissionLevel !== undefined ? { permissionLevel: normalizedPermissionLevel } : {}),
        reason,
        risk
      }
    ];
  });
}

function parsePlanningPileRequiredCapabilityExecuteGrants(
  value: unknown,
  path: string,
  errors: string[]
): readonly PlanTaskExecuteGrantCapabilityRequirement[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    errors.push(`${path} must be an array when provided.`);
    return undefined;
  }

  return value.flatMap((entry, index): PlanTaskExecuteGrantCapabilityRequirement[] => {
    if (!isRecord(entry)) {
      errors.push(`${path}[${index}] must be an object.`);
      return [];
    }

    collectPlanningPileUnexpectedKeys(entry, PLANNING_PILE_EXECUTE_GRANT_KEYS, `${path}[${index}]`, errors);

    const command = readPlanningPileString(entry, `${path}[${index}].command`, errors);
    const scope = readPlanningPileString(entry, `${path}[${index}].scope`, errors);
    const reason = readOptionalPlanningPilePathString(entry, "reason", `${path}[${index}].reason`, errors);

    if (command === undefined || scope === undefined) {
      return [];
    }

    return [
      {
        command,
        scope,
        ...(reason !== undefined ? { reason } : {})
      }
    ];
  });
}

function parsePlanningPileRequiredCapabilityBudget(
  value: unknown,
  path: string,
  errors: string[]
): PlanTaskBudgetCapabilityRequirement | undefined {
  if (value === undefined) {
    errors.push(`${path} must be an object.`);
    return undefined;
  }
  if (!isRecord(value)) {
    errors.push(`${path} must be an object.`);
    return undefined;
  }

  collectPlanningPileUnexpectedKeys(value, PLANNING_PILE_BUDGET_KEYS, path, errors);

  return {
    ...readOptionalPlanningPileNumberObject(value, "maxUsd", `${path}.maxUsd`, errors),
    ...readOptionalPlanningPileNumberObject(value, "maxTokens", `${path}.maxTokens`, errors),
    ...readOptionalPlanningPileNumberObject(value, "timeoutMs", `${path}.timeoutMs`, errors),
    ...readOptionalPlanningPileNumberObject(value, "maxRepairLoops", `${path}.maxRepairLoops`, errors)
  };
}

function readPlanningPileString(
  record: Record<string, unknown>,
  path: string,
  errors: string[]
): string | undefined {
  const value = record[path.split(".").at(-1) ?? path];
  if (typeof value !== "string" || value.trim().length === 0) {
    errors.push(`${path} must be a non-empty string.`);
    return undefined;
  }
  return value;
}

function readOptionalPlanningPileString(
  record: Record<string, unknown>,
  key: string,
  errors: string[]
): string | undefined {
  const value = record[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string" || value.trim().length === 0) {
    errors.push(`${key} must be a non-empty string when provided.`);
    return undefined;
  }
  return value;
}

function readOptionalPlanningPilePathString(
  record: Record<string, unknown>,
  key: string,
  path: string,
  errors: string[]
): string | undefined {
  const value = record[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string" || value.trim().length === 0) {
    errors.push(`${path} must be a non-empty string when provided.`);
    return undefined;
  }
  return value;
}

function readPlanningPileStringArray(
  record: Record<string, unknown>,
  path: string,
  errors: string[]
): readonly string[] {
  const value = record[path.split(".").at(-1) ?? path];
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string" || entry.trim().length === 0)) {
    errors.push(`${path} must be an array of non-empty strings.`);
    return [];
  }
  return value;
}

function collectPlanningPileUnexpectedKeys(
  record: Record<string, unknown>,
  allowedKeys: readonly string[],
  path: string,
  errors: string[]
): void {
  const allowed = new Set(allowedKeys);
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) {
      errors.push(`${path}.${key} is not part of the candidate-plan planning pile contract.`);
    }
  }
}

function readOptionalPlanningPileNumberObject(
  record: Record<string, unknown>,
  key: keyof PlanTaskBudgetCapabilityRequirement,
  path: string,
  errors: string[]
): Partial<PlanTaskBudgetCapabilityRequirement> {
  const value = record[key];
  if (value === undefined) {
    return {};
  }
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    errors.push(`${path} must be a non-negative finite number when provided.`);
    return {};
  }
  return { [key]: value };
}

function isPlanningPileResultSource(value: unknown): value is PlanningPileResult["source"] {
  return value === "fixture" || value === "dogpile";
}

function isPlanTaskKind(value: unknown): value is PlanTaskKind {
  return (
    value === "research" ||
    value === "design" ||
    value === "implementation" ||
    value === "verification" ||
    value === "release"
  );
}

interface PlanTaskShapeAdmission {
  readonly tasks: readonly PlanTask[];
  readonly violations: readonly PlanGraphValidationViolationDraft[];
}

function collectPlanTaskShapeAdmission(graph: PlanGraph): PlanTaskShapeAdmission {
  const value = (graph as { readonly tasks?: unknown }).tasks;
  const violations: PlanGraphValidationViolationDraft[] = [];

  if (!Array.isArray(value)) {
    return {
      tasks: [],
      violations: [
        {
          code: "tasks-not-array",
          path: "tasks",
          message: "Plan graph tasks must be an array of candidate plan tasks."
        }
      ]
    };
  }

  const tasks = value.flatMap((entry, index): PlanTask[] => {
    const entryPath = `tasks.${index}`;
    if (!isRecord(entry)) {
      violations.push({
        code: "malformed-task",
        path: entryPath,
        message: `Plan graph ${entryPath} must be an object.`
      });
      return [];
    }

    const rawId = entry["id"];
    const taskId = typeof rawId === "string" ? rawId : `task-malformed-shape-${index}`;
    const taskPath = `tasks.${taskId}`;
    const title = entry["title"];
    const kind = entry["kind"];
    const dependsOn = entry["dependsOn"];
    const covers = entry["covers"];

    if (rawId === undefined || typeof rawId !== "string") {
      violations.push({
        code: "invalid-task-id",
        path: `${entryPath}.id`,
        message: `Plan graph ${entryPath}.id must be a stable task- task id.`
      });
    }

    if (!Array.isArray(dependsOn)) {
      violations.push({
        code: "malformed-task-dependencies",
        path: `${taskPath}.dependsOn`,
        taskId,
        message: `Task ${taskId} dependsOn must be an array of task ids.`
      });
    }

    if (!Array.isArray(covers)) {
      violations.push({
        code: "malformed-task-coverage",
        path: `${taskPath}.covers`,
        taskId,
        message: `Task ${taskId} covers must be an array of accepted criterion ids.`
      });
    }

    return [
      {
        id: taskId as PlanTaskId,
        title: title as PlanTask["title"],
        kind: (isPlanTaskKind(kind) ? kind : String(kind)) as PlanTaskKind,
        dependsOn: Array.isArray(dependsOn) ? (dependsOn as readonly PlanTaskId[]) : [],
        covers: Array.isArray(covers) ? (covers as readonly AcceptanceCriterionId[]) : [],
        requiredCapabilities: entry["requiredCapabilities"] as PlanTaskRequiredCapabilities,
        risk: entry["risk"] as PlanTaskRiskDeclaration
      }
    ];
  });

  return {
    tasks,
    violations
  };
}

export function hashPlanGraph(graph: PlanGraph): PlanGraphHash {
  // Hash only the canonical PlanGraph fields so that the hash is stable
  // whether the input is a CandidatePlan, an AdmittedPlan (which carries
  // extra fields like capabilityEnvelope), or a raw PlanGraph.
  const canonical: PlanGraph = {
    planId: graph.planId,
    intentId: graph.intentId,
    createdAt: graph.createdAt,
    strategy: graph.strategy,
    acceptanceCriteria: graph.acceptanceCriteria,
    tasks: graph.tasks
  };
  return `sha256:${createHash("sha256").update(stableStringify(canonical), "utf8").digest("hex")}`;
}

export function validatePlanGraph(input: ValidatePlanGraphInput): PlanGraphValidation {
  const graph = input.graph;
  const intent = input.intent;
  const violations: PlanGraphValidationViolation[] = [];
  const taskShapeAdmission = collectPlanTaskShapeAdmission(graph);
  const graphWithValidatedTasks: PlanGraph = {
    ...graph,
    tasks: taskShapeAdmission.tasks
  };
  const dependencyGraphConstruction = constructPlanTaskDependencyGraphInternal(taskShapeAdmission.tasks);
  const duplicateTaskIdViolations = dependencyGraphConstruction.duplicateTaskIdViolations;
  const confirmedIntentAcceptanceCriterionIds = new Set(intent.acceptanceCriteria.map((criterion) => criterion.id));
  const acceptedCriteriaAdmission = collectAcceptedAcceptanceCriteriaAdmission(graph, intent);
  const acceptedPlanCriterionIds = acceptedCriteriaAdmission.acceptedCriterionIds;
  const coveredAcceptanceCriterionIds = new Set<AcceptanceCriterionId>();
  const taskCapabilityRequirements: PlanTaskCapabilityRequirement[] = [];
  const taskCapabilityAdmissions: PlanTaskCapabilityAdmissionResult[] = [];
  const preHandoffVerificationTriggers: PlanningAdmissionPreHandoffVerificationTrigger[] = [];
  const releaseGrantConditions: PlanningAdmissionReleaseGrantCondition[] = [];
  const taskRiskCompatibilityOutcomes: PlanningAdmissionTaskRiskCompatibilityEvidence[] = [];
  const capabilityEnvelopeGrantFieldDetections = detectCapabilityEnvelopeGrantFields({
    capabilityEnvelope: intent.capabilityEnvelope
  });
  const detectedPlanningAdmissionGrantModel = normalizePlanningAdmissionGrantModel({
    detections: capabilityEnvelopeGrantFieldDetections
  });
  const planningAdmissionGrantModel = normalizePlanningAdmissionGrantModelForEvaluation(
    input.planningAdmissionGrantModel ?? detectedPlanningAdmissionGrantModel
  );
  const registeredValidatorRuns: PlanningAdmissionRegisteredValidatorRun[] = [];
  const runValidator = (
    validator: PlanningAdmissionRegisteredValidatorName,
    collectViolations: (violations: PlanGraphValidationViolationDraft[]) => void
  ): void => {
    const validatorViolations: PlanGraphValidationViolationDraft[] = [];
    collectViolations(validatorViolations);
    violations.push(
      ...validatorViolations.map((violation) =>
        withPlanningAdmissionValidator(validator, violation)
      )
    );
    registeredValidatorRuns.push({
      validator,
      violationCount: validatorViolations.length
    });
  };

  runValidator("intent-match", (validatorViolations) => {
    if (graph.intentId !== intent.id) {
      validatorViolations.push({
        code: "intent-mismatch",
        path: "intentId",
        message: `Plan graph intent ${graph.intentId} must match confirmed intent ${intent.id}.`
      });
    }
  });

  runValidator("accepted-criteria", (validatorViolations) => {
    validatorViolations.push(...acceptedCriteriaAdmission.violations);
  });
  runValidator("task-identity", (validatorViolations) => {
    validatorViolations.push(...duplicateTaskIdViolations);
  });

  runValidator("task-contracts", (validatorViolations) => {
    validatorViolations.push(...taskShapeAdmission.violations);
    for (const [taskIndex, task] of taskShapeAdmission.tasks.entries()) {
    if (!isPlanTaskId(task.id)) {
      validatorViolations.push({
        code: "invalid-task-id",
        path: `tasks.${task.id}.id`,
        taskId: task.id,
        message: `Task ${task.id} id must be a stable task- task id.`
      });
    }

    if (typeof task.title !== "string" || task.title.trim().length === 0) {
      validatorViolations.push({
        code: "malformed-task-title",
        path: `tasks.${task.id}.title`,
        taskId: task.id,
        message: `Task ${task.id} title must be a non-empty string.`
      });
    }

    if (!isPlanTaskKind(task.kind)) {
      validatorViolations.push({
        code: "malformed-task-kind",
        path: `tasks.${task.id}.kind`,
        taskId: task.id,
        message: `Task ${task.id} kind must be research, design, implementation, verification, or release.`
      });
    }

    const riskDeclarationViolation = validateTaskRiskDeclaration(task);
    if (riskDeclarationViolation !== undefined) {
      validatorViolations.push(riskDeclarationViolation);
    }

    const taskRequiredCapabilitiesAdmission = normalizeTaskRequiredCapabilities(task);
    const taskCapabilityViolations: PlanGraphValidationViolationDraft[] = [
      ...taskRequiredCapabilitiesAdmission.violations
    ];
    if (taskRequiredCapabilitiesAdmission.requiredCapabilities !== undefined) {
      taskCapabilityViolations.push(
        ...collectTaskRequiredCapabilityEnvelopeViolations({
          task,
          requiredCapabilities: taskRequiredCapabilitiesAdmission.requiredCapabilities,
          envelope: intent.capabilityEnvelope,
          grantModel: planningAdmissionGrantModel
        })
      );
    }
    const riskCompatibility = evaluateTaskRiskPolicyCompatibility({
      task,
      ...(riskDeclarationViolation !== undefined ? { riskDeclarationViolation } : {}),
      requiredCapabilitiesAdmission: taskRequiredCapabilitiesAdmission
    });
    taskRiskCompatibilityOutcomes.push(riskCompatibility.evidence);
    taskCapabilityViolations.push(...riskCompatibility.violations);
    validatorViolations.push(...taskCapabilityViolations);
    if (
      taskRequiredCapabilitiesAdmission.requiredCapabilities !== undefined &&
      isPlanTaskId(task.id)
    ) {
      preHandoffVerificationTriggers.push(
        ...classifyPlanTaskPreHandoffVerificationTriggers({
          taskId: task.id,
          requiredCapabilities: taskRequiredCapabilitiesAdmission.requiredCapabilities
        })
      );
      releaseGrantConditions.push(
        ...classifyPlanTaskReleaseGrantConditions({
          taskId: task.id,
          requiredCapabilities: taskRequiredCapabilitiesAdmission.requiredCapabilities
        })
      );
    }
    if (
      taskRequiredCapabilitiesAdmission.requiredCapabilities !== undefined &&
      taskCapabilityViolations.length === 0 &&
      isPlanTaskId(task.id)
    ) {
      taskCapabilityRequirements.push({
        taskId: task.id,
        requiredCapabilities: taskRequiredCapabilitiesAdmission.requiredCapabilities
      });
      taskCapabilityAdmissions.push(
        createPlanTaskCapabilityAdmissionResult({
          taskId: task.id,
          requiredCapabilities: taskRequiredCapabilitiesAdmission.requiredCapabilities
        })
      );
    }

    if (task.covers.length === 0) {
      validatorViolations.push({
        code: "empty-task-coverage",
        path: `tasks.${task.id}.covers`,
        taskId: task.id,
        message: `Task ${task.id} must cover at least one acceptance criterion.`
      });
    }
    const firstCoverageIndexByCriterionId = new Map<AcceptanceCriterionId, number>();
    for (const [coverageIndex, criterionId] of task.covers.entries()) {
      if (!isAcceptanceCriterionId(criterionId)) {
        validatorViolations.push({
          code: "invalid-task-coverage-accepted-criterion-id",
          path: `tasks.${task.id}.covers.${coverageIndex}`,
          taskId: task.id,
          coverageIndex,
          acceptanceCriterionId: String(criterionId),
          message: `Task ${task.id} coverage link ${coverageIndex} must reference a stable ac_ accepted criterion id.`
        });
        continue;
      }

      const firstCoverageIndex = firstCoverageIndexByCriterionId.get(criterionId);
      if (firstCoverageIndex === undefined) {
        firstCoverageIndexByCriterionId.set(criterionId, coverageIndex);
      } else {
        validatorViolations.push({
          code: "duplicate-task-coverage-accepted-criterion-id",
          path: `tasks.${task.id}.covers.${coverageIndex}`,
          taskId: task.id,
          coverageIndex,
          firstIndex: firstCoverageIndex,
          duplicateIndex: coverageIndex,
          acceptanceCriterionId: criterionId,
          message: `Task ${task.id} covers acceptance criterion ${criterionId} more than once.`
        });
      }

      if (!confirmedIntentAcceptanceCriterionIds.has(criterionId)) {
        validatorViolations.push({
          code: "unknown-acceptance-criterion",
          path: `tasks.${task.id}.covers.${coverageIndex}`,
          taskId: task.id,
          coverageIndex,
          acceptanceCriterionId: criterionId,
          message: `Task ${task.id} covers acceptance criterion ${criterionId} outside confirmed intent ${intent.id}.`
        });
      } else if (!acceptedPlanCriterionIds.has(criterionId)) {
        if (acceptedCriteriaAdmission.candidateCriterionIds.has(criterionId)) {
          validatorViolations.push({
            code: "unaccepted-task-coverage-accepted-criterion-id",
            path: `tasks.${task.id}.covers.${coverageIndex}`,
            taskId: task.id,
            coverageIndex,
            acceptanceCriterionId: criterionId,
            message: `Task ${task.id} covers acceptance criterion ${criterionId}, but that criterion is not in an accepted PlanGraph state.`
          });
        } else {
          validatorViolations.push({
            code: "unknown-acceptance-criterion",
            path: `tasks.${task.id}.covers.${coverageIndex}`,
            taskId: task.id,
            coverageIndex,
            acceptanceCriterionId: criterionId,
            message: `Task ${task.id} covers acceptance criterion ${criterionId} outside accepted AC catalog.`
          });
        }
      } else {
        coveredAcceptanceCriterionIds.add(criterionId);
      }
    }
    validatorViolations.push(
      ...dependencyGraphConstruction.dependencyViolations
        .filter((violation) => violation.taskIndex === taskIndex)
        .map(stripIndexedDependencyViolation)
    );
    }
  });

  runValidator("pre-handoff-verification", (validatorViolations) => {
    validatorViolations.push(
      ...collectPreHandoffVerificationTaskViolations({
        graph: graphWithValidatedTasks,
        dependencyGraph: dependencyGraphConstruction.graph,
        preHandoffVerificationTriggers
      })
    );
  });
  runValidator("release-grant-task", (validatorViolations) => {
    validatorViolations.push(
      ...collectReleaseGrantTaskViolations({
        graph: graphWithValidatedTasks,
        dependencyGraph: dependencyGraphConstruction.graph,
        releaseGrantConditions
      })
    );
  });

  runValidator("acceptance-coverage", (validatorViolations) => {
    const acCoverageResult = validateAcCoverage({
      graph: {
        acceptanceCriteria: intent.acceptanceCriteria,
        tasks: graphWithValidatedTasks.tasks
      },
      coveredIds: coveredAcceptanceCriterionIds
    });
    for (const acId of acCoverageResult.uncoveredAcIds) {
      validatorViolations.push({
        code: "uncovered-acceptance-criterion",
        path: "acceptanceCriteria",
        acceptanceCriterionId: acId,
        message: `Acceptance criterion ${acId} is not covered by any plan task.`
      });
    }
  });

  runValidator("immediate-dependency-cycles", (validatorViolations) => {
    validatorViolations.push(
      ...collectImmediateDependencyCycleViolations(dependencyGraphConstruction.graph)
    );
  });
  runValidator("transitive-dependency-cycles", (validatorViolations) => {
    validatorViolations.push(
      ...collectTransitiveDependencyCycleViolations(dependencyGraphConstruction.graph)
    );
  });

  runValidator("dependency-cycle-summary", (validatorViolations) => {
    if (
      duplicateTaskIdViolations.length === 0 &&
      hasDependencyCycle(dependencyGraphConstruction.graph)
    ) {
      validatorViolations.push({
        code: "dependency-cycle",
        path: "tasks.dependsOn",
        message: "Plan graph contains a dependency cycle."
      });
    }
  });
  assertPlanningAdmissionRegisteredValidatorRunsComplete(registeredValidatorRuns);

  const ok = violations.length === 0;
  const releaseGrantAdmission = createPlanningAdmissionReleaseGrantAdmission({
    releaseGrantConditions,
    violations
  });

  return {
    ok,
    registeredValidatorRuns,
    violations,
    capabilityViolationDiagnostics: collectPlanningCapabilityViolationDiagnostics(violations),
    capabilityEnvelopeGrantFieldDetections,
    planningAdmissionGrantModel,
    errors: violations.map((violation) => violation.message),
    taskCapabilityRequirements: ok ? taskCapabilityRequirements : [],
    taskCapabilityAdmissions: ok ? taskCapabilityAdmissions : [],
    preHandoffVerificationTriggers: ok ? preHandoffVerificationTriggers : [],
    releaseGrantConditions: ok ? releaseGrantConditions : [],
    releaseGrantAdmission,
    taskRiskCompatibilityOutcomes,
    acceptanceCoverage: ok ? collectPlanningAdmissionCoverageEvidence(graph) : []
  };
}

export function detectCapabilityEnvelopeGrantFields(
  input: DetectCapabilityEnvelopeGrantFieldsInput
): PlanningCapabilityEnvelopeGrantFieldDetections {
  const envelope = input.capabilityEnvelope;
  if (!isRecord(envelope)) {
    return emptyCapabilityEnvelopeGrantFieldDetections();
  }

  const writeGrantFields: PlanningCapabilityEnvelopeGrantDetection[] = [];
  const prGrantFields: PlanningCapabilityEnvelopeGrantDetection[] = [];
  const releaseGrantFields: PlanningCapabilityEnvelopeGrantDetection[] = [];

  collectExplicitGrantFieldDetections(envelope, writeGrantFields, prGrantFields, releaseGrantFields);
  collectRepoScopeGrantFieldDetections(envelope["repoScopes"], writeGrantFields);
  collectToolPermissionGrantFieldDetections(envelope["toolPermissions"], prGrantFields, releaseGrantFields);
  collectExecuteGrantFieldDetections(envelope["executeGrants"], prGrantFields, releaseGrantFields);

  return {
    writeGrantFields,
    prGrantFields,
    releaseGrantFields,
    detectedGrantKinds: [
      ...(writeGrantFields.length > 0 ? ["write" as const] : []),
      ...(prGrantFields.length > 0 ? ["pr" as const] : []),
      ...(releaseGrantFields.length > 0 ? ["release" as const] : [])
    ]
  };
}

export function normalizePlanningAdmissionGrantModel(
  input: NormalizePlanningAdmissionGrantModelInput
): PlanningAdmissionGrantModel {
  return {
    source: "confirmed-intent-capability-envelope",
    grants: [
      ...normalizePlanningAdmissionGrant({
        kind: "write",
        authority: "repository-write",
        detections: input.detections.writeGrantFields
      }),
      ...normalizePlanningAdmissionGrant({
        kind: "pr",
        authority: "pull-request",
        detections: input.detections.prGrantFields
      }),
      ...normalizePlanningAdmissionGrant({
        kind: "release",
        authority: "release",
        detections: input.detections.releaseGrantFields
      })
    ]
  };
}

export function createPlanningAdmissionArtifact(
  input: CreatePlanningAdmissionArtifactInput
): PlanningAdmissionAcceptedArtifactRuntimeView | PlanningAdmissionRejectedArtifactPayload {
  const validation = validatePlanGraph({
    graph: input.graph,
    intent: input.intent,
    planningAdmissionGrantModel: input.planningAdmissionGrantModel
  });

  return createPlanningAdmissionArtifactFromValidation(input, validation);
}

function createPlanningAdmissionArtifactFromValidation(
  input: CreatePlanningAdmissionArtifactInput,
  validation: PlanGraphValidation
): PlanningAdmissionAcceptedArtifactRuntimeView | PlanningAdmissionRejectedArtifactPayload {
  const planningAttempt = createPlanningAdmissionAttemptReference(input);
  const admittedPlan = createPlanningAdmissionAdmittedPlanReference(input);
  const candidateSource = createPlanningAdmissionCandidateSourceReference(input);
  const candidatePlan = createPlanningAdmissionCandidatePlanIdentity({
    input,
    candidateSource
  });

  if (!validation.ok) {
    return {
      schemaVersion: PLANNING_ADMISSION_SCHEMA_VERSION,
      artifact: PLANNING_ADMISSION_ARTIFACT_NAME,
      decision: "block",
      admissionStatus: "no-plan-admitted",
      admitted: false,
      planningAttempt,
      candidateSource,
      candidatePlan,
      planId: input.graph.planId,
      intentId: input.intent.id,
      details: {
        gate: {
          planGraphValidationPassed: false,
          taskCapabilityRequirementsExtracted: false,
          taskRiskCompatibilityEvidenceAttached: true,
          acceptanceCriterionCoverageEvidenceAttached: false
        },
        validation: {
          validator: "validatePlanGraph",
          ok: false,
          violationCount: validation.violations.length,
          violations: validation.violations,
          capabilityViolationDiagnostics: validation.capabilityViolationDiagnostics
        },
        grantModel: validation.planningAdmissionGrantModel,
        taskRiskCompatibilityOutcomes: validation.taskRiskCompatibilityOutcomes,
        releaseGrantAdmission: validation.releaseGrantAdmission,
        failure: createPlanningAdmissionFailureDetails({
          input,
          candidatePlan,
          validation
        })
      },
      errors: validation.errors
    };
  }

  return createPlanningAdmissionAcceptedArtifactRuntimeView(
    {
      schemaVersion: PLANNING_ADMISSION_SCHEMA_VERSION,
      artifact: PLANNING_ADMISSION_ARTIFACT_NAME,
      decision: "allow",
      admissionStatus: "plan-admitted",
      admitted: true,
      admittedAt: input.admittedAt ?? new Date().toISOString(),
      planningAttempt,
      candidateSource,
      candidatePlan,
      planId: input.graph.planId,
      intentId: input.graph.intentId,
      plan_hash: hashPlanGraph(input.graph),
      validators_passed: validation.registeredValidatorRuns.map((run) => run.validator),
      validator_versions: PLAN_GRAPH_ADMISSION_VALIDATOR_VERSIONS,
      errors: []
    },
    {
      admittedPlan,
      handoff: createPlanningAdmissionHandoffMetadata({
        input,
        admittedPlan
      }),
      details: {
        gate: {
          planGraphValidationPassed: true,
          taskCapabilityRequirementsExtracted: true,
          taskRiskCompatibilityEvidenceAttached: true,
          acceptanceCriterionCoverageEvidenceAttached: true
        },
        validation: {
          validator: "validatePlanGraph",
          ok: true,
          violationCount: 0
        },
        grantModel: validation.planningAdmissionGrantModel,
        taskCapabilityAdmissions: collectPlanningAdmissionTaskCapabilityAdmissions(validation),
        preHandoffVerificationTriggers: validation.preHandoffVerificationTriggers,
        releaseGrantConditions: validation.releaseGrantConditions,
        releaseGrantAdmission: validation.releaseGrantAdmission,
        taskRiskCompatibilityOutcomes: validation.taskRiskCompatibilityOutcomes,
        acceptanceCoverage: validation.acceptanceCoverage
      }
    }
  );
}

export function admitCandidatePlan(input: AdmitCandidatePlanInput): AdmitCandidatePlanResult {
  const validation = validatePlanGraph({
    graph: input.graph,
    intent: input.intent,
    planningAdmissionGrantModel: input.planningAdmissionGrantModel
  });
  const planningAdmission = createPlanningAdmissionArtifactFromValidation(input, validation);

  if (!validation.ok) {
    if (planningAdmission.admitted) {
      throw new Error("Planning admission produced an admitted artifact for a rejected candidate plan.");
    }

    return {
      ok: false,
      planningAdmission,
      validation,
      rejectionReasons: planningAdmission.details.failure.rejectionReasons,
      errors: planningAdmission.errors
    };
  }

  if (!planningAdmission.admitted) {
    throw new Error("Planning admission produced a rejection artifact for an accepted candidate plan.");
  }

  return {
    ok: true,
    admittedPlan: markAdmittedPlan(input.graph, {
      allowedCapabilities: validation.planningAdmissionGrantModel.grants.map((grant) => grant.id)
    }),
    planningAdmission,
    validation,
    rejectionReasons: [],
    errors: []
  };
}

export function admitCandidatePlans(input: AdmitCandidatePlansInput): AdmitCandidatePlansResult {
  if (input.candidatePlans.length === 0) {
    throw new Error("Planning admission requires at least one candidate plan.");
  }

  const { candidatePlans, ...sharedAdmissionInput } = input;
  const candidateAdmissions = input.candidatePlans.map((candidatePlan, candidateIndex) =>
    admitCandidatePlan({
      ...sharedAdmissionInput,
      graph: candidatePlan,
      planningAttemptId: createPlanningCandidateAdmissionAttemptId(candidatePlan, candidateIndex)
    })
  );
  const candidateAdmissionResults = candidatePlans.map((candidatePlan, candidateIndex) => {
    const admission = candidateAdmissions[candidateIndex];
    if (admission === undefined) {
      throw new Error("Planning admission did not evaluate every candidate plan.");
    }

    return createPlanningAdmissionCandidateAdmissionResult({
      admission,
      candidatePlan,
      candidateIndex
    });
  });
  const admittedCandidateIndex = candidateAdmissions.findIndex((admission) => admission.ok);
  const rejectedCandidateCount = candidateAdmissions.filter((admission) => !admission.ok).length;

  if (admittedCandidateIndex >= 0) {
    const admittedCandidateAdmission = candidateAdmissions[admittedCandidateIndex];
    const admittedCandidatePlan = input.candidatePlans[admittedCandidateIndex];
    if (admittedCandidateAdmission === undefined || admittedCandidatePlan === undefined) {
      throw new Error("Planning admission selected a candidate outside the evaluated candidate set.");
    }
    if (!admittedCandidateAdmission.ok) {
      throw new Error("Planning admission selected a rejected candidate.");
    }

    const planningAdmission = attachPlanningAdmissionCandidateResults(
      admittedCandidateAdmission.planningAdmission,
      {
        candidateAdmissionSummary: {
          allCandidatesValidated: true,
          candidateCount: input.candidatePlans.length,
          admittedCandidateIndex,
          rejectedCandidateCount
        },
        candidateAdmissionResults
      }
    );

    return {
      ok: true,
      admittedPlan: admittedCandidateAdmission.admittedPlan,
      candidatePlan: admittedCandidatePlan,
      admittedCandidateIndex,
      planningAdmission,
      validation: admittedCandidateAdmission.validation,
      candidateAdmissionResults,
      rejectionReasons: [],
      errors: []
    };
  }

  const firstRejectedAdmission = candidateAdmissions[0];
  if (firstRejectedAdmission === undefined || firstRejectedAdmission.ok) {
    throw new Error("Planning admission could not select a rejected candidate result.");
  }

  const planningAdmission = attachPlanningAdmissionCandidateResults(
    firstRejectedAdmission.planningAdmission,
    {
      candidateAdmissionSummary: {
        allCandidatesValidated: true,
        candidateCount: input.candidatePlans.length,
        rejectedCandidateCount
      },
      candidateAdmissionResults
    }
  );

  return {
    ok: false,
    planningAdmission,
    validation: firstRejectedAdmission.validation,
    candidateAdmissionResults,
    rejectionReasons: candidateAdmissionResults.flatMap((result) => result.rejectionReasons),
    errors: candidateAdmissionResults.flatMap((result) => result.errors)
  };
}

function createPlanningCandidateAdmissionAttemptId(
  candidatePlan: CandidatePlan,
  candidateIndex: number
): string {
  return `planning-attempt:${candidatePlan.planId}:candidate-${candidateIndex + 1}`;
}

function createPlanningAdmissionCandidateAdmissionResult(input: {
  readonly admission: AdmitCandidatePlanResult;
  readonly candidatePlan: CandidatePlan;
  readonly candidateIndex: number;
}): PlanningAdmissionCandidateAdmissionResult {
  const base = {
    candidateIndex: input.candidateIndex,
    planId: input.candidatePlan.planId,
    intentId: input.candidatePlan.intentId,
    createdAt: input.candidatePlan.createdAt
  };

  if (input.admission.ok) {
    return {
      ...base,
      decision: "allow",
      admissionStatus: "plan-admitted",
      admitted: true,
      validation: input.admission.planningAdmission.details.validation,
      rejectionReasons: [],
      errors: []
    };
  }

  return {
    ...base,
    decision: "block",
    admissionStatus: "no-plan-admitted",
    admitted: false,
    validation: input.admission.planningAdmission.details.validation,
    rejectionReasons: input.admission.rejectionReasons,
    errors: input.admission.errors
  };
}

function attachPlanningAdmissionCandidateResults<T extends PlanningAdmissionArtifactPayload>(
  planningAdmission: T,
  evidence: PlanningAdmissionCandidateAdmissionEvidence
): T & PlanningAdmissionCandidateAdmissionEvidence {
  Object.assign(planningAdmission as object, evidence);
  return planningAdmission as T & PlanningAdmissionCandidateAdmissionEvidence;
}

export function createPlanningPreAdmissionFailureArtifact(
  input: CreatePlanningPreAdmissionFailureArtifactInput
): PlanningAdmissionPreAdmissionFailureArtifactPayload {
  const attemptedAt = input.attemptedAt ?? new Date().toISOString();
  const candidateSource = createPlanningPreAdmissionCandidateSourceReference(input);
  const violations = createPlanningPreAdmissionViolations(input.errors);
  const grantModel = normalizePlanningAdmissionGrantModelForEvaluation(
    input.planningAdmissionGrantModel ??
      normalizePlanningAdmissionGrantModel({
        detections: detectCapabilityEnvelopeGrantFields({
          capabilityEnvelope: input.intent.capabilityEnvelope
        })
      })
  );

  return {
    schemaVersion: PLANNING_ADMISSION_SCHEMA_VERSION,
    artifact: PLANNING_ADMISSION_ARTIFACT_NAME,
    decision: "block",
    admissionStatus: "no-plan-admitted",
    admitted: false,
    planningAttempt: {
      id: input.planningAttemptId ?? `planning-attempt:${input.candidatePlanId}`,
      candidatePlanId: input.candidatePlanId,
      intentId: input.intent.id,
      candidatePlanCreatedAt: attemptedAt
    },
    candidateSource,
    candidatePlan: createPlanningPreAdmissionCandidatePlanIdentity({
      input,
      attemptedAt,
      candidateSource
    }),
    planId: input.candidatePlanId,
    intentId: input.intent.id,
    details: {
      gate: {
        planGraphValidationPassed: false,
        candidatePlanCreated: false,
        taskCapabilityRequirementsExtracted: false,
        taskRiskCompatibilityEvidenceAttached: false,
        acceptanceCriterionCoverageEvidenceAttached: false
      },
      validation: {
        validator: "createCandidatePlanGraph",
        ok: false,
        violationCount: violations.length,
        violations,
        capabilityViolationDiagnostics: []
      },
      grantModel,
      failure: {
        state: "pre-admission-failed",
        status: "no-plan-admitted",
        admittedPlanCreated: false,
        candidatePlanCreated: false,
        candidatePlanId: input.candidatePlanId,
        intentId: input.intent.id,
        candidateSource,
        violationCount: violations.length,
        rejectionReasons: violations.map(copyPlanningPreAdmissionRejectionReason)
      }
    },
    errors: violations.map((violation) => violation.message)
  };
}

export function validateAdmittedPlanHandoff(
  input: CreateAdmittedPlanHandoffInput
): AdmittedPlanHandoffValidation {
  const planGraphUri = input.planGraphUri ?? "plan.json";
  const violations: AdmittedPlanHandoffViolation[] = [];
  const admission = input.planningAdmission;
  const artifactRef = input.planningAdmissionArtifact;
  const expectedPlanHash = hashPlanGraph(input.plan);

  if (artifactRef.persisted !== true) {
    violations.push({
      code: "planning-admission-artifact-not-persisted",
      path: "planningAdmissionArtifact.persisted",
      message: "Execution handoff requires persisted planning-admission.json evidence."
    });
  }

  if (artifactRef.artifact !== PLANNING_ADMISSION_ARTIFACT_NAME) {
    violations.push({
      code: "planning-admission-artifact-name-mismatch",
      path: "planningAdmissionArtifact.artifact",
      message: `Execution handoff requires artifact ${PLANNING_ADMISSION_ARTIFACT_NAME}.`
    });
  }

  if (artifactRef.uri !== PLANNING_ADMISSION_ARTIFACT_NAME) {
    violations.push({
      code: "planning-admission-uri-mismatch",
      path: "planningAdmissionArtifact.uri",
      message: `Execution handoff requires ${PLANNING_ADMISSION_ARTIFACT_NAME} at the canonical planning admission URI.`
    });
  }

  if ("artifact" in admission && admission.artifact !== PLANNING_ADMISSION_ARTIFACT_NAME) {
    violations.push({
      code: "planning-admission-artifact-name-mismatch",
      path: "planningAdmission.artifact",
      message: `Planning admission payload must identify ${PLANNING_ADMISSION_ARTIFACT_NAME}.`
    });
  }

  if ("planId" in admission && admission.planId !== input.plan.planId) {
    violations.push({
      code: "planning-admission-plan-mismatch",
      path: "planningAdmission.planId",
      message: `Planning admission plan ${admission.planId} must match PlanGraph ${input.plan.planId}.`
    });
  }

  if ("intentId" in admission && admission.intentId !== input.plan.intentId) {
    violations.push({
      code: "planning-admission-intent-mismatch",
      path: "planningAdmission.intentId",
      message: `Planning admission intent ${admission.intentId} must match PlanGraph intent ${input.plan.intentId}.`
    });
  }

  if (!admission.admitted) {
    violations.push({
      code: "planning-admission-not-admitted",
      path: "planningAdmission.admitted",
      message: "Execution handoff requires an admitted planning admission payload."
    });
  }

  if ("errors" in admission && admission.errors.length > 0) {
    violations.push({
      code: "planning-admission-errors-present",
      path: "planningAdmission.errors",
      message: "Execution handoff requires planning admission evidence with no admission errors."
    });
  }

  if (admission.admitted) {
    if (admission.plan_hash !== expectedPlanHash) {
      violations.push({
        code: "planning-admission-plan-hash-mismatch",
        path: "planningAdmission.plan_hash",
        message: `Planning admission plan hash ${admission.plan_hash} must match admitted PlanGraph hash ${expectedPlanHash}.`
      });
    }

    if (!sameOrderedValues(admission.validators_passed, PLAN_GRAPH_ADMISSION_VALIDATORS)) {
      violations.push({
        code: "planning-admission-validator-set-mismatch",
        path: "planningAdmission.validators_passed",
        message: "Planning admission validators_passed must enumerate every registered admission validator."
      });
    }

    const versionMismatches = PLAN_GRAPH_ADMISSION_VALIDATORS.filter(
      (validator) =>
        admission.validator_versions[validator] !== PLAN_GRAPH_ADMISSION_VALIDATOR_VERSIONS[validator]
    );
    if (versionMismatches.length > 0) {
      violations.push({
        code: "planning-admission-validator-version-mismatch",
        path: "planningAdmission.validator_versions",
        message: `Planning admission validator_versions are stale for: ${versionMismatches.join(", ")}.`
      });
    }
  }

  if (hasRuntimeAdmittedPlanReference(admission)) {
    if (admission.admittedPlan.planId !== input.plan.planId) {
      violations.push({
        code: "planning-admission-admitted-plan-mismatch",
        path: "planningAdmission.admittedPlan.planId",
        message: `Admitted plan reference ${admission.admittedPlan.planId} must match PlanGraph ${input.plan.planId}.`
      });
    }
    if (admission.admittedPlan.uri !== planGraphUri) {
      violations.push({
        code: "planning-admission-admitted-plan-mismatch",
        path: "planningAdmission.admittedPlan.uri",
        message: `Admitted plan URI ${admission.admittedPlan.uri} must match PlanGraph URI ${planGraphUri}.`
      });
    }
    if (admission.admittedPlan.sourceOfTruth !== "PlanGraph") {
      violations.push({
        code: "planning-admission-proof-source-mismatch",
        path: "planningAdmission.admittedPlan.sourceOfTruth",
        message: "Admitted plan proof source must remain PlanGraph."
      });
    }
  } else if (!admission.admitted) {
    violations.push({
      code: "planning-admission-admitted-plan-mismatch",
      path: "planningAdmission.admittedPlan",
      message: "Execution handoff requires an admittedPlan reference in planning admission evidence."
    });
  }

  if (hasRuntimeHandoffMetadata(admission)) {
    if (!admission.handoff.readyFor.includes("execution")) {
      violations.push({
        code: "planning-admission-handoff-not-ready-for-execution",
        path: "planningAdmission.handoff.readyFor",
        message: "Planning admission handoff must explicitly be ready for execution."
      });
    }
    if (admission.handoff.admittedPlanUri !== planGraphUri) {
      violations.push({
        code: "planning-admission-admitted-plan-mismatch",
        path: "planningAdmission.handoff.admittedPlanUri",
        message: `Planning admission handoff plan URI ${admission.handoff.admittedPlanUri} must match ${planGraphUri}.`
      });
    }
    if (admission.handoff.planningAdmissionUri !== PLANNING_ADMISSION_ARTIFACT_NAME) {
      violations.push({
        code: "planning-admission-uri-mismatch",
        path: "planningAdmission.handoff.planningAdmissionUri",
        message: `Planning admission handoff must reference ${PLANNING_ADMISSION_ARTIFACT_NAME}.`
      });
    }
    if (admission.handoff.validationSource !== PLANNING_ADMISSION_ARTIFACT_NAME) {
      violations.push({
        code: "planning-admission-validation-source-mismatch",
        path: "planningAdmission.handoff.validationSource",
        message: `Planning admission handoff validation source must be ${PLANNING_ADMISSION_ARTIFACT_NAME}.`
      });
    }
    if (admission.handoff.proofSource !== "PlanGraph") {
      violations.push({
        code: "planning-admission-proof-source-mismatch",
        path: "planningAdmission.handoff.proofSource",
        message: "Planning admission handoff proof source must remain PlanGraph."
      });
    }
  } else if (!admission.admitted) {
    violations.push({
      code: "planning-admission-handoff-not-ready-for-execution",
      path: "planningAdmission.handoff",
      message: "Execution handoff requires planning admission handoff metadata."
    });
  }

  if (
    hasRuntimeAdmissionDetails(admission) &&
    (!admission.details.validation.ok || admission.details.validation.violationCount !== 0)
  ) {
    violations.push({
      code: "planning-admission-validation-not-passed",
      path: "planningAdmission.details.validation",
      message: "Execution handoff requires passing PlanGraph validation evidence."
    });
  }

  if (hasRuntimeAdmissionDetails(admission) && !admission.details.gate.planGraphValidationPassed) {
    violations.push({
      code: "planning-admission-validation-not-passed",
      path: "planningAdmission.details.gate.planGraphValidationPassed",
      message: "Execution handoff requires a passed planning admission gate."
    });
  }

  if (violations.length > 0) {
    return {
      ok: false,
      violations,
      errors: violations.map((violation) => violation.message)
    };
  }

  return {
    ok: true,
    violations: [],
    errors: []
  };
}

function hasRuntimeAdmittedPlanReference(
  admission: PlanningAdmissionArtifactPayload
): admission is PlanningAdmissionArtifactPayload & {
  readonly admittedPlan: PlanningAdmissionAdmittedPlanReference;
} {
  return "admittedPlan" in admission &&
    isRecord((admission as { readonly admittedPlan?: unknown }).admittedPlan);
}

function hasRuntimeHandoffMetadata(
  admission: PlanningAdmissionArtifactPayload
): admission is PlanningAdmissionArtifactPayload & {
  readonly handoff: PlanningAdmissionHandoffMetadata;
} {
  return "handoff" in admission &&
    isRecord((admission as { readonly handoff?: unknown }).handoff);
}

function hasRuntimeAdmissionDetails(
  admission: PlanningAdmissionArtifactPayload
): admission is PlanningAdmissionArtifactPayload & {
  readonly details: PlanningAdmissionArtifactDetails;
} {
  return isRecord((admission as { readonly details?: unknown }).details);
}

export function assertAdmittedPlanHandoff(input: CreateAdmittedPlanHandoffInput): AdmittedPlanHandoff {
  const validation = validateAdmittedPlanHandoff(input);
  if (!validation.ok) {
    throw new Error(`Invalid admitted plan handoff: ${validation.errors.join("; ")}`);
  }
  const capabilityEnvelope = extractCapabilityEnvelopeFromAdmission(input.planningAdmission);
  const admittedPlanRecord = markAdmittedPlan(input.plan, capabilityEnvelope);
  // SOLE public mint of the AdmittedPlan brand (PLAN-A-01).
  const admittedPlan = mintAdmittedPlan(admittedPlanRecord);
  const evidence = createAdmittedPlanHandoffEvidence(input);
  const planningAdmission = input.planningAdmission as PlanningAdmissionAcceptedArtifactPayload;
  const admittedPlanReference = hasRuntimeAdmittedPlanReference(input.planningAdmission)
    ? input.planningAdmission.admittedPlan
    : createAdmittedPlanHandoffReference(input);

  return {
    plan: admittedPlan,
    planningAdmission,
    evidence,
    executionArtifact: createAdmittedPlanExecutionArtifact({
      plan: admittedPlan,
      admittedPlan: admittedPlanReference,
      evidence
    })
  };
}

function createAdmittedPlanHandoffEvidence(input: CreateAdmittedPlanHandoffInput): AdmittedPlanHandoffEvidence {
  return {
    planId: input.plan.planId,
    intentId: input.plan.intentId,
    planGraphUri: input.planGraphUri ?? "plan.json",
    planningAdmissionArtifact: PLANNING_ADMISSION_ARTIFACT_NAME,
    planningAdmissionUri: PLANNING_ADMISSION_ARTIFACT_NAME,
    validationSource: PLANNING_ADMISSION_ARTIFACT_NAME,
    proofSource: "PlanGraph"
  };
}

function createAdmittedPlanHandoffReference(
  input: CreateAdmittedPlanHandoffInput
): PlanningAdmissionAdmittedPlanReference {
  return {
    planId: input.plan.planId,
    uri: input.planGraphUri ?? "plan.json",
    pointer: "#",
    sourceOfTruth: "PlanGraph"
  };
}

function createAdmittedPlanExecutionArtifact(input: {
  readonly plan: AdmittedPlan;
  readonly admittedPlan: PlanningAdmissionAdmittedPlanReference;
  readonly evidence: AdmittedPlanHandoffEvidence;
}): AdmittedPlanExecutionArtifact {
  return {
    planId: input.plan.planId,
    intentId: input.plan.intentId,
    admittedPlan: input.admittedPlan,
    evidence: input.evidence,
    tasks: topoSortPlanTasks(input.plan.tasks).map((task) => ({
      planTaskId: task.id,
      title: task.title,
      dependsOn: task.dependsOn
    }))
  } as unknown as AdmittedPlanExecutionArtifact;
}

function topoSortPlanTasks(tasks: readonly PlanTask[]): readonly PlanTask[] {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const visited = new Set<string>();
  const sorted: PlanTask[] = [];

  function visit(task: PlanTask): void {
    if (visited.has(task.id)) {
      return;
    }
    visited.add(task.id);
    for (const dependency of task.dependsOn) {
      const dependencyTask = byId.get(dependency);
      if (dependencyTask) {
        visit(dependencyTask);
      }
    }
    sorted.push(task);
  }

  for (const task of tasks) {
    visit(task);
  }

  return sorted;
}

function markAdmittedPlan(
  plan: CandidatePlan | AdmittedPlanRecord,
  capabilityEnvelope: AdmittedPlanCapabilityEnvelope
): AdmittedPlanRecord {
  // If the plan is already an AdmittedPlanRecord (it has a capabilityEnvelope
  // from a previous admission step), return it unchanged to preserve object
  // identity. NOTE: this returns the unbranded record — only
  // `assertAdmittedPlanHandoff` -> `mintAdmittedPlan` produces the brand.
  if (isAdmittedPlanRecordAtRuntime(plan)) {
    return plan;
  }
  return {
    planId: plan.planId,
    intentId: plan.intentId,
    createdAt: plan.createdAt,
    strategy: plan.strategy,
    acceptanceCriteria: plan.acceptanceCriteria,
    tasks: plan.tasks,
    __protostarPlanAdmissionState: "admitted-plan",
    capabilityEnvelope
  };
}

/**
 * Mint the branded AdmittedPlan from a validated AdmittedPlanRecord. SOLE
 * caller is `assertAdmittedPlanHandoff`. Module-private — foreign modules
 * cannot name `AdmittedPlanBrand` and therefore cannot fabricate this value.
 */
function mintAdmittedPlan(record: AdmittedPlanRecord): AdmittedPlan {
  return record as AdmittedPlan;
}

/**
 * Runtime check: a plan object that already has a `capabilityEnvelope` field
 * has already crossed the admission boundary and is an AdmittedPlanRecord.
 */
function isAdmittedPlanRecordAtRuntime(
  plan: CandidatePlan | AdmittedPlanRecord
): plan is AdmittedPlanRecord {
  return "capabilityEnvelope" in plan;
}

/**
 * Derive the AdmittedPlanCapabilityEnvelope from the detected grant model
 * stored in the planning admission artifact's runtime details.
 */
function extractCapabilityEnvelopeFromAdmission(
  admission: PlanningAdmissionArtifactPayload
): AdmittedPlanCapabilityEnvelope {
  if (hasRuntimeAdmissionDetails(admission)) {
    const grantModel = admission.details.grantModel;
    return {
      allowedCapabilities: grantModel.grants.map((grant) => grant.id)
    };
  }
  return { allowedCapabilities: [] };
}

export function constructPlanTaskDependencyGraph(
  tasks: readonly PlanTask[]
): PlanTaskDependencyGraphConstruction {
  const construction = constructPlanTaskDependencyGraphInternal(tasks);
  const duplicateTaskIdViolations = construction.duplicateTaskIdViolations.map((violation) =>
    withPlanningAdmissionValidator("task-identity", violation)
  );
  const dependencyViolations = construction.dependencyViolations
    .map(stripIndexedDependencyViolation)
    .map((violation) => withPlanningAdmissionValidator("task-contracts", violation));

  return {
    ok: construction.duplicateTaskIdViolations.length === 0 && dependencyViolations.length === 0,
    graph: construction.graph,
    violations: [
      ...duplicateTaskIdViolations,
      ...dependencyViolations
    ]
  };
}

export interface ValidateAcCoverageInput {
  readonly graph: Pick<PlanGraph, "acceptanceCriteria" | "tasks">;
  /**
   * Pre-computed set of covered criterion ids. When provided the function uses
   * this set instead of computing coverage from graph.tasks. Pass the curated
   * coveredAcceptanceCriterionIds set from the admission boundary to enforce
   * strict semantics (only valid, accepted-catalog coverage links count).
   */
  readonly coveredIds?: ReadonlySet<AcceptanceCriterionId>;
}

export interface ValidateAcCoverageResult {
  readonly ok: boolean;
  readonly uncoveredAcIds: readonly AcceptanceCriterionId[];
  readonly errors: readonly string[];
}

/**
 * Admission-boundary AC-coverage check: returns an error for every criterion
 * in graph.acceptanceCriteria that has zero covering tasks.
 *
 * This function is the enforcement mechanism for the AC-coverage constraint in
 * the planning admission boundary. validatePlanGraph's "acceptance-coverage"
 * validator delegates to this function, passing the curated
 * coveredAcceptanceCriterionIds set so that only valid, accepted-catalog
 * coverage links count as proof.
 *
 * When coveredIds is omitted the function computes coverage from graph.tasks
 * directly (lenient: any task.covers entry matching an accepted AC id counts).
 */
export function validateAcCoverage(input: ValidateAcCoverageInput): ValidateAcCoverageResult {
  const coveredIds: ReadonlySet<AcceptanceCriterionId> = input.coveredIds ?? (() => {
    const ids = new Set<AcceptanceCriterionId>();
    for (const task of input.graph.tasks) {
      for (const acId of task.covers) {
        ids.add(acId);
      }
    }
    return ids;
  })();

  const uncoveredAcIds: AcceptanceCriterionId[] = [];
  const errors: string[] = [];
  for (const criterion of input.graph.acceptanceCriteria) {
    if (!coveredIds.has(criterion.id)) {
      uncoveredAcIds.push(criterion.id);
      errors.push(`Acceptance criterion ${criterion.id} is not covered by any plan task.`);
    }
  }

  return {
    ok: uncoveredAcIds.length === 0,
    uncoveredAcIds,
    errors
  };
}

export function collectPlanTaskCoverageLinks(graph: Pick<PlanGraph, "tasks">): readonly PlanTaskCoverageLink[] {
  return graph.tasks.flatMap((task) =>
    task.covers.map((acceptedCriterionId) => ({
      taskId: task.id,
      acceptedCriterionId
    }))
  );
}

export function collectPlanTaskCapabilityRequirements(
  graph: Pick<PlanGraph, "tasks">
): readonly PlanTaskCapabilityRequirement[] {
  return graph.tasks.map((task) => ({
    taskId: task.id,
    requiredCapabilities: copyPlanTaskRequiredCapabilities(task.requiredCapabilities)
  }));
}

export function classifyPlanTaskPreHandoffVerificationTriggers(
  requirement: PlanTaskCapabilityRequirement
): readonly PlanningAdmissionPreHandoffVerificationTrigger[] {
  return collectTaskPreHandoffVerificationTriggers(requirement);
}

export function classifyPlanTaskReleaseGrantConditions(
  requirement: PlanTaskCapabilityRequirement
): readonly PlanningAdmissionReleaseGrantCondition[] {
  return collectTaskReleaseGrantConditions(requirement);
}

export function collectPlanningCapabilityViolationDiagnostics(
  violations: readonly PlanGraphValidationViolation[]
): readonly PlanningCapabilityViolationDiagnostic[] {
  return violations.flatMap((violation): PlanningCapabilityViolationDiagnostic[] => {
    if (!isPlanningCapabilityViolationRule(violation.code) || violation.taskId === undefined) {
      return [];
    }

    return [
      {
        taskId: violation.taskId,
        violatedRule: violation.code,
        capabilityPath: capabilityPathForViolation(violation),
        severity: "block",
        message: violation.message
      }
    ];
  });
}

function withPlanningAdmissionValidator(
  validator: PlanningAdmissionRegisteredValidatorName,
  violation: PlanGraphValidationViolationDraft
): PlanGraphValidationViolation {
  const { affectedPlanLocation, ...violationDetails } = violation;
  return {
    validator,
    ...violationDetails,
    affectedPlanLocation: affectedPlanLocation ?? createPlanGraphViolationAffectedPlanLocation(violation)
  };
}

function createPlanGraphViolationAffectedPlanLocation(
  violation: PlanGraphValidationViolationDraft
): PlanGraphViolationAffectedPlanLocation {
  const base = {
    path: violation.path,
    ...(violation.taskId !== undefined ? { taskId: violation.taskId } : {}),
    ...(violation.acceptanceCriterionId !== undefined
      ? { acceptanceCriterionId: violation.acceptanceCriterionId }
      : {})
  };

  if (violation.taskId !== undefined && violation.dependency !== undefined) {
    return {
      kind: "edge",
      ...base,
      dependencyTaskId: violation.dependency,
      ...(violation.dependencyIndex !== undefined ? { dependencyIndex: violation.dependencyIndex } : {})
    };
  }

  if (
    violation.code === "duplicate-task-id" ||
    violation.code === "invalid-task-id" ||
    violation.code === "malformed-task"
  ) {
    return {
      kind: "node",
      ...base
    };
  }

  return {
    kind: "field",
    ...base
  };
}

function assertPlanningAdmissionRegisteredValidatorRunsComplete(
  runs: readonly PlanningAdmissionRegisteredValidatorRun[]
): void {
  const runValidators = runs.map((run) => run.validator);
  const missingValidators = PLAN_GRAPH_ADMISSION_VALIDATORS.filter(
    (validator) => !runValidators.includes(validator)
  );
  const unexpectedValidators = runValidators.filter(
    (validator) => !PLAN_GRAPH_ADMISSION_VALIDATORS.includes(validator)
  );
  const outOfOrder = runValidators.some(
    (validator, index) => validator !== PLAN_GRAPH_ADMISSION_VALIDATORS[index]
  );

  if (
    runs.length !== PLAN_GRAPH_ADMISSION_VALIDATORS.length ||
    missingValidators.length > 0 ||
    unexpectedValidators.length > 0 ||
    outOfOrder
  ) {
    throw new Error("Planning admission validator registry did not run to completion.");
  }
}

function collectPlanningAdmissionTaskCapabilityAdmissions(
  validation: PlanGraphValidation
): readonly PlanningAdmissionTaskCapabilityAdmissionEvidence[] {
  return validation.taskCapabilityAdmissions.map(copyPlanTaskCapabilityAdmissionResult);
}

function createPlanningAdmissionAcceptedArtifactRuntimeView(
  payload: PlanningAdmissionAcceptedArtifactPayload,
  metadata: Omit<PlanningAdmissionAcceptedArtifactRuntimeView, keyof PlanningAdmissionAcceptedArtifactPayload>
): PlanningAdmissionAcceptedArtifactRuntimeView {
  return new Proxy(payload, {
    get(target, property, receiver) {
      if (typeof property === "string" && property in metadata) {
        return metadata[property as keyof typeof metadata];
      }
      return Reflect.get(target, property, receiver);
    },
    has(target, property) {
      return Reflect.has(target, property);
    },
    getOwnPropertyDescriptor(target, property) {
      return Reflect.getOwnPropertyDescriptor(target, property);
    },
    ownKeys(target) {
      return Reflect.ownKeys(target);
    }
  }) as PlanningAdmissionAcceptedArtifactRuntimeView;
}

function createPlanningAdmissionAttemptReference(
  input: CreatePlanningAdmissionArtifactInput
): PlanningAdmissionAttemptReference {
  return {
    id: input.planningAttemptId ?? `planning-attempt:${input.graph.planId}`,
    candidatePlanId: input.graph.planId,
    intentId: input.intent.id,
    candidatePlanCreatedAt: input.graph.createdAt
  };
}

function createPlanningAdmissionAdmittedPlanReference(
  input: CreatePlanningAdmissionArtifactInput
): PlanningAdmissionAdmittedPlanReference {
  return {
    planId: input.graph.planId,
    uri: input.planGraphUri ?? "plan.json",
    pointer: "#",
    sourceOfTruth: "PlanGraph"
  };
}

function createPlanningAdmissionCandidateSourceReference(
  input: CreatePlanningAdmissionArtifactInput
): PlanningAdmissionPlanGraphCandidateSourceReference {
  return {
    kind: "candidate-plan-graph",
    planId: input.graph.planId,
    uri: input.candidateSourceUri ?? input.planGraphUri ?? "plan.json",
    pointer: "#",
    createdAt: input.graph.createdAt,
    sourceOfTruth: "PlanGraph"
  };
}

function createPlanningAdmissionCandidatePlanIdentity(input: {
  readonly input: CreatePlanningAdmissionArtifactInput;
  readonly candidateSource: PlanningAdmissionPlanGraphCandidateSourceReference;
}): PlanningAdmissionCandidatePlanIdentity {
  return {
    planId: input.input.graph.planId,
    intentId: input.input.graph.intentId,
    createdAt: input.input.graph.createdAt,
    source: input.candidateSource
  };
}

function createPlanningPreAdmissionCandidateSourceReference(
  input: CreatePlanningPreAdmissionFailureArtifactInput
): PlanningAdmissionPlanningPileResultSourceReference {
  return {
    kind: "planning-pile-result",
    uri: input.candidateSourceUri ?? "planning-result.json",
    pointer: "#",
    sourceOfTruth: "PlanningPileResult"
  };
}

function createPlanningPreAdmissionCandidatePlanIdentity(input: {
  readonly input: CreatePlanningPreAdmissionFailureArtifactInput;
  readonly attemptedAt: string;
  readonly candidateSource: PlanningAdmissionPlanningPileResultSourceReference;
}): PlanningAdmissionUnavailableCandidatePlanIdentity {
  return {
    planId: input.input.candidatePlanId,
    intentId: input.input.intent.id,
    createdAt: input.attemptedAt,
    candidatePlanCreated: false,
    source: input.candidateSource
  };
}

function createPlanningPreAdmissionViolations(
  errors: readonly string[]
): readonly PlanningAdmissionPreAdmissionViolation[] {
  const messages = errors.length > 0
    ? errors
    : ["Candidate PlanGraph could not be created before planning admission."];

  return messages.map((message, index) => ({
    code: "candidate-plan-unavailable",
    path: `planningResult.output.${index}`,
    message
  }));
}

function createPlanningAdmissionFailureDetails(input: {
  readonly input: CreatePlanningAdmissionArtifactInput;
  readonly candidatePlan: PlanningAdmissionCandidatePlanIdentity;
  readonly validation: PlanGraphValidation;
}): PlanningAdmissionFailureDetails {
  return {
    state: "validation-failed",
    status: "no-plan-admitted",
    admittedPlanCreated: false,
    candidatePlan: copyPlanningAdmissionCandidatePlanIdentity(input.candidatePlan),
    violationCount: input.validation.violations.length,
    rejectionReasons: input.validation.violations.map(copyPlanningAdmissionRejectionReason)
  };
}

function copyPlanningAdmissionCandidatePlanIdentity(
  candidatePlan: PlanningAdmissionCandidatePlanIdentity
): PlanningAdmissionCandidatePlanIdentity {
  return {
    planId: candidatePlan.planId,
    intentId: candidatePlan.intentId,
    createdAt: candidatePlan.createdAt,
    source: {
      kind: candidatePlan.source.kind,
      planId: candidatePlan.source.planId,
      uri: candidatePlan.source.uri,
      pointer: candidatePlan.source.pointer,
      createdAt: candidatePlan.source.createdAt,
      sourceOfTruth: candidatePlan.source.sourceOfTruth
    }
  };
}

function copyPlanningPreAdmissionRejectionReason(
  violation: PlanningAdmissionPreAdmissionViolation
): PlanningAdmissionPreAdmissionRejectionReason {
  return {
    code: violation.code,
    path: violation.path,
    message: violation.message
  };
}

function copyPlanningAdmissionRejectionReason(
  violation: PlanGraphValidationViolation
): PlanningAdmissionRejectionReason {
  return {
    validator: violation.validator,
    code: violation.code,
    path: violation.path,
    affectedPlanLocation: violation.affectedPlanLocation,
    message: violation.message,
    ...(violation.taskId !== undefined ? { taskId: violation.taskId } : {}),
    ...(violation.acceptanceCriterionId !== undefined
      ? { acceptanceCriterionId: violation.acceptanceCriterionId }
      : {})
  };
}

function createPlanningAdmissionReleaseGrantAdmission(input: {
  readonly releaseGrantConditions: readonly PlanningAdmissionReleaseGrantCondition[];
  readonly violations: readonly PlanGraphValidationViolation[];
}): PlanningAdmissionReleaseGrantAdmissionEvidence {
  const rejectionReasons = input.violations.flatMap(copyPlanningAdmissionReleaseGrantRejectionReason);

  return {
    decision: rejectionReasons.length === 0 ? "allow" : "block",
    required: input.releaseGrantConditions.length > 0 || rejectionReasons.length > 0,
    conditionCount: input.releaseGrantConditions.length,
    rejectedConditionCount: rejectionReasons.length,
    rejectionReasons
  };
}

function copyPlanningAdmissionReleaseGrantRejectionReason(
  violation: PlanGraphValidationViolation
): readonly PlanningAdmissionReleaseGrantRejectionReason[] {
  if (!isPlanningAdmissionReleaseGrantRejectionCode(violation.code)) {
    return [];
  }

  return [
    {
      code: violation.code,
      path: violation.path,
      affectedPlanLocation: violation.affectedPlanLocation,
      message: violation.message,
      ...(violation.taskId !== undefined ? { taskId: violation.taskId } : {})
    }
  ];
}

function isPlanningAdmissionReleaseGrantRejectionCode(
  code: PlanGraphValidationViolationCode
): code is PlanningAdmissionReleaseGrantRejectionCode {
  return code === "task-required-release-grant-denied" ||
    code === "release-grant-without-explicit-release-task" ||
    code === "release-grant-missing-verification-evidence";
}

function createPlanningAdmissionHandoffMetadata(input: {
  readonly input: CreatePlanningAdmissionArtifactInput;
  readonly admittedPlan: PlanningAdmissionAdmittedPlanReference;
}): PlanningAdmissionHandoffMetadata {
  return {
    readyFor: ["execution", "review"],
    admittedPlanUri: input.admittedPlan.uri,
    planningAdmissionUri: input.input.planningAdmissionUri ?? PLANNING_ADMISSION_ARTIFACT_NAME,
    validationSource: PLANNING_ADMISSION_ARTIFACT_NAME,
    proofSource: "PlanGraph"
  };
}

function collectPlanningAdmissionCoverageEvidence(
  graph: PlanGraph
): readonly PlanningAdmissionAcceptanceCriterionCoverageEvidence[] {
  return graph.acceptanceCriteria.map((criterion, acceptedCriterionIndex) => ({
    acceptanceCriterionId: criterion.id,
    acceptedCriterionPath: `acceptanceCriteria.${acceptedCriterionIndex}` as `acceptanceCriteria.${number}`,
    coverageLinks: graph.tasks.flatMap((task) =>
      task.covers.flatMap((acceptedCriterionId, coverageIndex): PlanningAdmissionCoverageLinkEvidence[] =>
        acceptedCriterionId === criterion.id
          ? [
              {
                taskId: task.id,
                coveragePath: `tasks.${task.id}.covers.${coverageIndex}` as `tasks.${PlanTaskId}.covers.${number}`
              }
            ]
          : []
      )
    )
  }));
}

function normalizePlanTasksWithCapabilityRequirements(
  tasks: readonly PlanTask[],
  requirements: readonly PlanTaskCapabilityRequirement[]
): readonly PlanTask[] {
  const capabilitiesByTaskId = new Map(
    requirements.map((requirement) => [requirement.taskId, requirement.requiredCapabilities])
  );

  return tasks.map((task) => {
    const requiredCapabilities = capabilitiesByTaskId.get(task.id);
    return requiredCapabilities === undefined
      ? task
      : {
          ...task,
          requiredCapabilities
        };
  });
}

function copyPlanAcceptanceCriterion(criterion: AcceptanceCriterion): PlanAcceptanceCriterion {
  return {
    id: criterion.id,
    statement: criterion.statement,
    verification: criterion.verification
  };
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortJsonValue(value));
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJsonValue);
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entryValue]) => [key, sortJsonValue(entryValue)])
    );
  }
  return value;
}

function sameOrderedValues<T>(actual: readonly T[], expected: readonly T[]): boolean {
  return actual.length === expected.length &&
    actual.every((value, index) => value === expected[index]);
}

interface AcceptedAcceptanceCriteriaAdmission {
  readonly violations: readonly PlanGraphValidationViolationDraft[];
  readonly candidateCriterionIds: ReadonlySet<AcceptanceCriterionId>;
  readonly acceptedCriterionIds: ReadonlySet<AcceptanceCriterionId>;
}

function collectAcceptedAcceptanceCriteriaAdmission(
  graph: PlanGraph,
  intent: ConfirmedIntent
): AcceptedAcceptanceCriteriaAdmission {
  const value = (graph as { readonly acceptanceCriteria?: unknown }).acceptanceCriteria;
  const intentCriteriaById = new Map(intent.acceptanceCriteria.map((criterion) => [criterion.id, criterion]));
  const seenIds = new Set<AcceptanceCriterionId>();
  const candidateCriterionIds = new Set<AcceptanceCriterionId>();
  const acceptedCriterionIds = new Set<AcceptanceCriterionId>();
  const violations: PlanGraphValidationViolationDraft[] = [];

  if (!Array.isArray(value)) {
    return {
      violations: [
        {
          code: "accepted-criteria-not-array",
          path: "acceptanceCriteria",
          message: "Plan graph acceptanceCriteria must be an array of accepted criteria."
        }
      ],
      candidateCriterionIds,
      acceptedCriterionIds
    };
  }

  if (value.length === 0) {
    violations.push({
      code: "empty-accepted-criteria",
      path: "acceptanceCriteria",
      message: "Plan graph acceptanceCriteria must contain at least one accepted criterion."
    });
  }

  for (const [index, criterion] of value.entries()) {
    const path = `acceptanceCriteria.${index}`;
    if (!isRecord(criterion)) {
      violations.push({
        code: "malformed-accepted-criterion",
        path,
        message: `Plan graph ${path} must be an object.`
      });
      continue;
    }

    const id = criterion["id"];
    const statement = criterion["statement"];
    const verification = criterion["verification"];

    if (!isAcceptanceCriterionId(id)) {
      violations.push({
        code: "invalid-accepted-criterion-id",
        path: `${path}.id`,
        message: `Plan graph ${path}.id must be a stable ac_ acceptance criterion id.`
      });
    }
    if (typeof statement !== "string" || statement.trim().length === 0) {
      violations.push({
        code: "malformed-accepted-criterion",
        path: `${path}.statement`,
        message: `Plan graph ${path}.statement must be a non-empty string.`
      });
    }
    if (!isAcceptanceCriterionVerification(verification)) {
      violations.push({
        code: "malformed-accepted-criterion",
        path: `${path}.verification`,
        message: `Plan graph ${path}.verification must be test, evidence, or manual.`
      });
    }

    if (!isAcceptanceCriterionId(id)) {
      continue;
    }
    candidateCriterionIds.add(id);

    if (seenIds.has(id)) {
      violations.push({
        code: "duplicate-accepted-criterion-id",
        path: `${path}.id`,
        acceptanceCriterionId: id,
        message: `Plan graph ${path}.id duplicates accepted criterion ${id}.`
      });
      continue;
    }
    seenIds.add(id);

    const intentCriterion = intentCriteriaById.get(id);
    if (intentCriterion === undefined) {
      violations.push({
        code: "unknown-accepted-criterion",
        path: `${path}.id`,
        acceptanceCriterionId: id,
        message: `Plan graph ${path}.id references acceptance criterion ${id} outside confirmed intent ${intent.id}.`
      });
      continue;
    }

    let accepted = true;
    if (statement !== intentCriterion.statement) {
      accepted = false;
      violations.push({
        code: "drifted-accepted-criterion",
        path: `${path}.statement`,
        acceptanceCriterionId: id,
        message: `Plan graph ${path}.statement must match confirmed intent criterion ${id}.`
      });
    }
    if (verification !== intentCriterion.verification) {
      accepted = false;
      violations.push({
        code: "drifted-accepted-criterion",
        path: `${path}.verification`,
        acceptanceCriterionId: id,
        message: `Plan graph ${path}.verification must match confirmed intent criterion ${id}.`
      });
    }
    if (accepted && typeof statement === "string" && isAcceptanceCriterionVerification(verification)) {
      acceptedCriterionIds.add(id);
    }
  }

  for (const criterion of intent.acceptanceCriteria) {
    if (!seenIds.has(criterion.id)) {
      violations.push({
        code: "missing-accepted-criterion",
        path: "acceptanceCriteria",
        acceptanceCriterionId: criterion.id,
        message: `Plan graph acceptanceCriteria must include accepted criterion ${criterion.id} from confirmed intent ${intent.id}.`
      });
    }
  }

  return {
    violations,
    candidateCriterionIds,
    acceptedCriterionIds
  };
}

function isAcceptanceCriterionId(value: unknown): value is AcceptanceCriterionId {
  return typeof value === "string" && /^ac_[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(value);
}

function isAcceptanceCriterionVerification(value: unknown): value is AcceptanceCriterion["verification"] {
  return value === "test" || value === "evidence" || value === "manual";
}

function isPlanTaskId(value: unknown): value is PlanTaskId {
  return typeof value === "string" && /^task-[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(value);
}

function isPlanningCapabilityViolationRule(
  value: PlanGraphValidationViolationCode
): value is PlanningCapabilityViolationRule {
  return CAPABILITY_VIOLATION_RULES.has(value as PlanningCapabilityViolationRule);
}

function capabilityPathForViolation(violation: PlanGraphValidationViolation): string {
  if (violation.code === "task-risk-below-required-capability-risk") {
    return `tasks.${violation.taskId}.requiredCapabilities.toolPermissions`;
  }

  return violation.path;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function emptyCapabilityEnvelopeGrantFieldDetections(): PlanningCapabilityEnvelopeGrantFieldDetections {
  return {
    writeGrantFields: [],
    prGrantFields: [],
    releaseGrantFields: [],
    detectedGrantKinds: []
  };
}

function normalizePlanningAdmissionGrant(input: {
  readonly kind: PlanningCapabilityEnvelopeGrantKind;
  readonly authority: PlanningAdmissionGrantAuthority;
  readonly detections: readonly PlanningCapabilityEnvelopeGrantDetection[];
}): readonly PlanningAdmissionGrant[] {
  if (input.detections.length === 0) {
    return [];
  }

  return [
    {
      id: `planning-admission-grant:${input.kind}`,
      kind: input.kind,
      authority: input.authority,
      source: "confirmed-intent-capability-envelope",
      status: "detected",
      evidenceRefs: input.detections.map((detection) => ({
        fieldPath: detection.fieldPath,
        detectionSource: detection.source
      }))
    }
  ];
}

function normalizePlanningAdmissionGrantModelForEvaluation(grantModel: unknown): PlanningAdmissionGrantModel {
  if (
    !isRecord(grantModel) ||
    grantModel["source"] !== "confirmed-intent-capability-envelope" ||
    !Array.isArray(grantModel["grants"])
  ) {
    return emptyPlanningAdmissionGrantModel();
  }

  const seenGrantKinds = new Set<PlanningCapabilityEnvelopeGrantKind>();
  const grants: PlanningAdmissionGrant[] = [];
  for (const candidateGrant of grantModel["grants"]) {
    const grant = normalizePlanningAdmissionGrantForEvaluation(candidateGrant);
    if (grant === undefined || seenGrantKinds.has(grant.kind)) {
      continue;
    }
    seenGrantKinds.add(grant.kind);
    grants.push(grant);
  }

  return {
    source: "confirmed-intent-capability-envelope",
    grants
  };
}

function emptyPlanningAdmissionGrantModel(): PlanningAdmissionGrantModel {
  return {
    source: "confirmed-intent-capability-envelope",
    grants: []
  };
}

function normalizePlanningAdmissionGrantForEvaluation(grant: unknown): PlanningAdmissionGrant | undefined {
  if (!isRecord(grant) || !isPlanningCapabilityEnvelopeGrantKind(grant["kind"])) {
    return undefined;
  }

  const kind = grant["kind"];
  const authority = planningAdmissionGrantAuthorityForKind(kind);
  if (
    grant["id"] !== planningAdmissionGrantId(kind) ||
    grant["authority"] !== authority ||
    grant["source"] !== "confirmed-intent-capability-envelope" ||
    grant["status"] !== "detected" ||
    !Array.isArray(grant["evidenceRefs"])
  ) {
    return undefined;
  }

  const evidenceRefs = grant["evidenceRefs"].flatMap(normalizePlanningAdmissionGrantEvidenceRef);
  if (evidenceRefs.length === 0 || evidenceRefs.length !== grant["evidenceRefs"].length) {
    return undefined;
  }

  return {
    id: planningAdmissionGrantId(kind),
    kind,
    authority,
    source: "confirmed-intent-capability-envelope",
    status: "detected",
    evidenceRefs
  };
}

function normalizePlanningAdmissionGrantEvidenceRef(
  evidenceRef: unknown
): PlanningAdmissionGrantEvidenceRef[] {
  if (!isRecord(evidenceRef) || !isPlanningCapabilityEnvelopeGrantDetectionSource(evidenceRef["detectionSource"])) {
    return [];
  }

  const fieldPath = normalizeNonEmptyString(evidenceRef["fieldPath"]);
  if (fieldPath === undefined) {
    return [];
  }

  return [
    {
      fieldPath,
      detectionSource: evidenceRef["detectionSource"]
    }
  ];
}

function planningAdmissionGrantModelHasGrant(
  grantModel: PlanningAdmissionGrantModel,
  kind: PlanningCapabilityEnvelopeGrantKind
): boolean {
  return grantModel.grants.some((grant) => grant.kind === kind);
}

function planningAdmissionGrantId(
  kind: PlanningCapabilityEnvelopeGrantKind
): PlanningAdmissionGrant["id"] {
  return `planning-admission-grant:${kind}`;
}

function planningAdmissionGrantAuthorityForKind(
  kind: PlanningCapabilityEnvelopeGrantKind
): PlanningAdmissionGrantAuthority {
  switch (kind) {
    case "write":
      return "repository-write";
    case "pr":
      return "pull-request";
    case "release":
      return "release";
  }
}

function isPlanningCapabilityEnvelopeGrantKind(
  value: unknown
): value is PlanningCapabilityEnvelopeGrantKind {
  return value === "write" || value === "pr" || value === "release";
}

function isPlanningCapabilityEnvelopeGrantDetectionSource(
  value: unknown
): value is PlanningCapabilityEnvelopeGrantDetectionSource {
  return value === "explicit-grant-field" ||
    value === "repo-scope-access" ||
    value === "tool-permission" ||
    value === "execute-grant";
}

function collectExplicitGrantFieldDetections(
  envelope: Record<string, unknown>,
  writeGrantFields: PlanningCapabilityEnvelopeGrantDetection[],
  prGrantFields: PlanningCapabilityEnvelopeGrantDetection[],
  releaseGrantFields: PlanningCapabilityEnvelopeGrantDetection[]
): void {
  collectExplicitGrantFieldsForKind(envelope, "write", ["writeGrant", "writeGrants"], writeGrantFields);
  collectExplicitGrantFieldsForKind(
    envelope,
    "pr",
    ["prGrant", "prGrants", "pullRequestGrant", "pullRequestGrants"],
    prGrantFields
  );
  collectExplicitGrantFieldsForKind(envelope, "release", ["releaseGrant", "releaseGrants"], releaseGrantFields);

  const nestedGrants = envelope["grants"];
  if (!isRecord(nestedGrants)) {
    return;
  }

  collectExplicitGrantFieldsForKind(
    nestedGrants,
    "write",
    ["write", "writeGrant", "writeGrants"],
    writeGrantFields,
    "capabilityEnvelope.grants"
  );
  collectExplicitGrantFieldsForKind(
    nestedGrants,
    "pr",
    ["pr", "pullRequest", "prGrant", "prGrants", "pullRequestGrant", "pullRequestGrants"],
    prGrantFields,
    "capabilityEnvelope.grants"
  );
  collectExplicitGrantFieldsForKind(
    nestedGrants,
    "release",
    ["release", "releaseGrant", "releaseGrants"],
    releaseGrantFields,
    "capabilityEnvelope.grants"
  );
}

function collectExplicitGrantFieldsForKind(
  record: Record<string, unknown>,
  grantKind: PlanningCapabilityEnvelopeGrantKind,
  fieldNames: readonly string[],
  detections: PlanningCapabilityEnvelopeGrantDetection[],
  basePath = "capabilityEnvelope"
): void {
  for (const fieldName of fieldNames) {
    if (!Object.hasOwn(record, fieldName)) {
      continue;
    }

    detections.push({
      grantKind,
      fieldPath: `${basePath}.${fieldName}`,
      source: "explicit-grant-field",
      matchedValue: summarizeCapabilityGrantFieldValue(record[fieldName])
    });
  }
}

function collectRepoScopeGrantFieldDetections(
  repoScopes: unknown,
  writeGrantFields: PlanningCapabilityEnvelopeGrantDetection[]
): void {
  if (!Array.isArray(repoScopes)) {
    return;
  }

  repoScopes.forEach((scope, index) => {
    if (!isRecord(scope)) {
      return;
    }

    const access = normalizeNonEmptyString(scope["access"])?.toLowerCase();
    if (access !== "write") {
      return;
    }

    writeGrantFields.push({
      grantKind: "write",
      fieldPath: `capabilityEnvelope.repoScopes.${index}.access`,
      source: "repo-scope-access",
      matchedValue: "write"
    });
  });
}

function collectToolPermissionGrantFieldDetections(
  toolPermissions: unknown,
  prGrantFields: PlanningCapabilityEnvelopeGrantDetection[],
  releaseGrantFields: PlanningCapabilityEnvelopeGrantDetection[]
): void {
  if (!Array.isArray(toolPermissions)) {
    return;
  }

  toolPermissions.forEach((permission, index) => {
    if (!isRecord(permission)) {
      return;
    }

    const tool = normalizeNonEmptyString(permission["tool"]);
    const reason = normalizeNonEmptyString(permission["reason"]);
    const permissionLevel = normalizeNonEmptyString(
      permission["permissionLevel"] ?? permission["permission"] ?? permission["level"]
    );
    const searchable = [tool, reason].flatMap((value) => value === undefined ? [] : [value]).join(" ");

    if (!capabilityToolCanDrivePrOrReleaseGrant(tool, permissionLevel)) {
      return;
    }
    if (mentionsPullRequestGrant(searchable)) {
      prGrantFields.push({
        grantKind: "pr",
        fieldPath: reason === undefined
          ? `capabilityEnvelope.toolPermissions.${index}.tool`
          : `capabilityEnvelope.toolPermissions.${index}.reason`,
        source: "tool-permission",
        matchedValue: reason ?? tool ?? ""
      });
    }
    if (mentionsReleaseGrant(searchable)) {
      releaseGrantFields.push({
        grantKind: "release",
        fieldPath: reason === undefined
          ? `capabilityEnvelope.toolPermissions.${index}.tool`
          : `capabilityEnvelope.toolPermissions.${index}.reason`,
        source: "tool-permission",
        matchedValue: reason ?? tool ?? ""
      });
    }
  });
}

function collectExecuteGrantFieldDetections(
  executeGrants: unknown,
  prGrantFields: PlanningCapabilityEnvelopeGrantDetection[],
  releaseGrantFields: PlanningCapabilityEnvelopeGrantDetection[]
): void {
  if (!Array.isArray(executeGrants)) {
    return;
  }

  executeGrants.forEach((grant, index) => {
    if (!isRecord(grant)) {
      return;
    }

    const command = normalizeNonEmptyString(grant["command"]);
    if (command === undefined) {
      return;
    }
    if (mentionsPullRequestGrant(command)) {
      prGrantFields.push({
        grantKind: "pr",
        fieldPath: `capabilityEnvelope.executeGrants.${index}.command`,
        source: "execute-grant",
        matchedValue: command
      });
    }
    if (mentionsReleaseGrant(command)) {
      releaseGrantFields.push({
        grantKind: "release",
        fieldPath: `capabilityEnvelope.executeGrants.${index}.command`,
        source: "execute-grant",
        matchedValue: command
      });
    }
  });
}

function capabilityToolCanDrivePrOrReleaseGrant(
  tool: string | undefined,
  permissionLevel: string | undefined
): boolean {
  if (tool === undefined) {
    return false;
  }
  const normalizedTool = tool.toLowerCase();
  if (!["gh", "github", "github-cli", "shell"].includes(normalizedTool)) {
    return false;
  }

  const normalizedPermissionLevel = permissionLevel?.toLowerCase() ?? "use";
  return normalizedPermissionLevel === "write" ||
    normalizedPermissionLevel === "execute" ||
    normalizedPermissionLevel === "admin";
}

function mentionsPullRequestGrant(value: string): boolean {
  const normalized = value.toLowerCase();
  return /\bgh\s+pr\b/.test(normalized) ||
    /\bprs?\b/.test(normalized) ||
    /\bpull[-\s]?request\b/.test(normalized);
}

function mentionsReleaseGrant(value: string): boolean {
  const normalized = value.toLowerCase();
  return /\bgh\s+release\b/.test(normalized) ||
    /\brelease\b/.test(normalized) ||
    /\bpublish\b/.test(normalized);
}

function summarizeCapabilityGrantFieldValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "boolean" || typeof value === "number" || value === null) {
    return String(value);
  }
  if (Array.isArray(value)) {
    return `array(${value.length})`;
  }
  if (isRecord(value)) {
    return "object";
  }
  return typeof value;
}

function validateTaskRiskDeclaration(task: PlanTask): PlanGraphValidationViolationDraft | undefined {
  const risk = (task as { readonly risk?: unknown }).risk;
  if (risk === undefined) {
    return {
      code: "missing-task-risk",
      path: `tasks.${task.id}.risk`,
      taskId: task.id,
      message: `Task ${task.id} risk must be explicitly declared as low, medium, or high.`
    };
  }
  if (!isRiskLevel(risk)) {
    return {
      code: "malformed-task-risk",
      path: `tasks.${task.id}.risk`,
      taskId: task.id,
      message: `Task ${task.id} risk must be low, medium, or high.`
    };
  }

  return undefined;
}

interface TaskRequiredCapabilitiesAdmission {
  readonly requiredCapabilities?: PlanTaskRequiredCapabilities;
  readonly violations: readonly PlanGraphValidationViolationDraft[];
}

function normalizeTaskRequiredCapabilities(task: PlanTask): TaskRequiredCapabilitiesAdmission {
  const value = (task as { readonly requiredCapabilities?: unknown }).requiredCapabilities;
  const path = `tasks.${task.id}.requiredCapabilities`;
  const violations: PlanGraphValidationViolationDraft[] = [];

  if (value === undefined) {
    return {
      violations: [
        {
          code: "missing-task-required-capabilities",
          path,
          taskId: task.id,
          message: `Task ${task.id} requiredCapabilities must be provided in normalized capability-envelope shape.`
        }
      ]
    };
  }
  if (!isRecord(value)) {
    return {
      violations: [
        {
          code: "malformed-task-required-capabilities",
          path,
          taskId: task.id,
          message: `Task ${task.id} requiredCapabilities must be an object in normalized capability-envelope shape.`
        }
      ]
    };
  }

  const repoScopes = normalizeTaskRequiredRepoScopes(value["repoScopes"], `${path}.repoScopes`, task.id, violations);
  const toolPermissions = normalizeTaskRequiredToolPermissions(
    value["toolPermissions"],
    `${path}.toolPermissions`,
    task.id,
    violations
  );
  const executeGrants = normalizeTaskRequiredExecuteGrants(
    value["executeGrants"],
    `${path}.executeGrants`,
    task.id,
    violations
  );
  const budget = normalizeTaskRequiredBudget(value["budget"], `${path}.budget`, task.id, violations);

  return {
    requiredCapabilities: {
      repoScopes: repoScopes ?? [],
      toolPermissions: toolPermissions ?? [],
      ...(executeGrants !== undefined ? { executeGrants } : {}),
      ...(isRecord(value["workspace"]) ? { workspace: { allowDirty: value["workspace"]["allowDirty"] === true } } : {}),
      budget: budget ?? {}
    },
    violations
  };
}

function normalizeTaskRequiredRepoScopes(
  value: unknown,
  path: string,
  taskId: string,
  violations: PlanGraphValidationViolationDraft[]
): readonly PlanTaskRepoScopeCapabilityRequirement[] | undefined {
  if (!Array.isArray(value)) {
    violations.push({
      code: "malformed-task-required-capabilities",
      path,
      taskId,
      message: `Task ${taskId} requiredCapabilities.repoScopes must be an array.`
    });
    return undefined;
  }

  return value.flatMap((scope, index): PlanTaskRepoScopeCapabilityRequirement[] => {
    const scopePath = `${path}.${index}`;
    if (!isRecord(scope)) {
      violations.push({
        code: "malformed-task-required-repo-scope",
        path: scopePath,
        taskId,
        message: `Task ${taskId} requiredCapabilities.repoScopes.${index} must be an object.`
      });
      return [];
    }

    const workspace = normalizeNonEmptyString(scope["workspace"]);
    const repoPath = normalizeNonEmptyString(scope["path"]);
    const access = scope["access"];

    if (workspace === undefined) {
      violations.push({
        code: "malformed-task-required-repo-scope",
        path: `${scopePath}.workspace`,
        taskId,
        message: `Task ${taskId} requiredCapabilities.repoScopes.${index}.workspace must be a non-empty string.`
      });
    }
    if (repoPath === undefined) {
      violations.push({
        code: "malformed-task-required-repo-scope",
        path: `${scopePath}.path`,
        taskId,
        message: `Task ${taskId} requiredCapabilities.repoScopes.${index}.path must be a non-empty string.`
      });
    }
    if (!isRepoAccess(access)) {
      violations.push({
        code: "malformed-task-required-repo-scope",
        path: `${scopePath}.access`,
        taskId,
        message: `Task ${taskId} requiredCapabilities.repoScopes.${index}.access must be read, write, or execute.`
      });
    }
    if (workspace === undefined || repoPath === undefined || !isRepoAccess(access)) {
      return [];
    }

    return [
      {
        workspace,
        path: repoPath,
        access
      }
    ];
  });
}

function normalizeTaskRequiredToolPermissions(
  value: unknown,
  path: string,
  taskId: string,
  violations: PlanGraphValidationViolationDraft[]
): readonly PlanTaskToolPermissionCapabilityRequirement[] | undefined {
  if (!Array.isArray(value)) {
    violations.push({
      code: "malformed-task-required-capabilities",
      path,
      taskId,
      message: `Task ${taskId} requiredCapabilities.toolPermissions must be an array.`
    });
    return undefined;
  }

  return value.flatMap((permission, index): PlanTaskToolPermissionCapabilityRequirement[] => {
    const permissionPath = `${path}.${index}`;
    if (!isRecord(permission)) {
      violations.push({
        code: "malformed-task-required-tool-permission",
        path: permissionPath,
        taskId,
        message: `Task ${taskId} requiredCapabilities.toolPermissions.${index} must be an object.`
      });
      return [];
    }

    const tool = normalizeNonEmptyString(permission["tool"]);
    const reason = normalizeNonEmptyString(permission["reason"]);
    const permissionLevel = permission["permissionLevel"];
    const risk = permission["risk"];

    if (tool === undefined) {
      violations.push({
        code: "malformed-task-required-tool-permission",
        path: `${permissionPath}.tool`,
        taskId,
        message: `Task ${taskId} requiredCapabilities.toolPermissions.${index}.tool must be a non-empty string.`
      });
    }
    if (
      permissionLevel !== undefined &&
      !isToolPermissionLevel(permissionLevel)
    ) {
      violations.push({
        code: "malformed-task-required-tool-permission",
        path: `${permissionPath}.permissionLevel`,
        taskId,
        message:
          `Task ${taskId} requiredCapabilities.toolPermissions.${index}.permissionLevel must be read, use, write, execute, or admin.`
      });
    }
    if (reason === undefined) {
      violations.push({
        code: "malformed-task-required-tool-permission",
        path: `${permissionPath}.reason`,
        taskId,
        message: `Task ${taskId} requiredCapabilities.toolPermissions.${index}.reason must be a non-empty string.`
      });
    }
    if (!isRiskLevel(risk)) {
      violations.push({
        code: "malformed-task-required-tool-permission",
        path: `${permissionPath}.risk`,
        taskId,
        message: `Task ${taskId} requiredCapabilities.toolPermissions.${index}.risk must be low, medium, or high.`
      });
    }
    if (
      tool === undefined ||
      reason === undefined ||
      !isRiskLevel(risk) ||
      (permissionLevel !== undefined && !isToolPermissionLevel(permissionLevel))
    ) {
      return [];
    }

    return [
      {
        tool,
        ...(permissionLevel !== undefined ? { permissionLevel } : {}),
        reason,
        risk
      }
    ];
  });
}

function normalizeTaskRequiredExecuteGrants(
  value: unknown,
  path: string,
  taskId: string,
  violations: PlanGraphValidationViolationDraft[]
): readonly PlanTaskExecuteGrantCapabilityRequirement[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    violations.push({
      code: "malformed-task-required-capabilities",
      path,
      taskId,
      message: `Task ${taskId} requiredCapabilities.executeGrants must be an array when provided.`
    });
    return undefined;
  }

  return value.flatMap((grant, index): PlanTaskExecuteGrantCapabilityRequirement[] => {
    const grantPath = `${path}.${index}`;
    if (!isRecord(grant)) {
      violations.push({
        code: "malformed-task-required-execute-grant",
        path: grantPath,
        taskId,
        message: `Task ${taskId} requiredCapabilities.executeGrants.${index} must be an object.`
      });
      return [];
    }

    const command = normalizeNonEmptyString(grant["command"]);
    const scope = normalizeNonEmptyString(grant["scope"]);
    const reason = normalizeNonEmptyString(grant["reason"]);

    if (command === undefined) {
      violations.push({
        code: "malformed-task-required-execute-grant",
        path: `${grantPath}.command`,
        taskId,
        message: `Task ${taskId} requiredCapabilities.executeGrants.${index}.command must be a non-empty string.`
      });
    }
    if (scope === undefined) {
      violations.push({
        code: "malformed-task-required-execute-grant",
        path: `${grantPath}.scope`,
        taskId,
        message: `Task ${taskId} requiredCapabilities.executeGrants.${index}.scope must be a non-empty string.`
      });
    }
    if (grant["reason"] !== undefined && reason === undefined) {
      violations.push({
        code: "malformed-task-required-execute-grant",
        path: `${grantPath}.reason`,
        taskId,
        message: `Task ${taskId} requiredCapabilities.executeGrants.${index}.reason must be a non-empty string when provided.`
      });
    }
    if (command === undefined || scope === undefined || (grant["reason"] !== undefined && reason === undefined)) {
      return [];
    }

    return [
      {
        command,
        scope,
        ...(reason !== undefined ? { reason } : {})
      }
    ];
  });
}

function normalizeTaskRequiredBudget(
  value: unknown,
  path: string,
  taskId: string,
  violations: PlanGraphValidationViolationDraft[]
): PlanTaskBudgetCapabilityRequirement | undefined {
  if (!isRecord(value)) {
    violations.push({
      code: "malformed-task-required-capabilities",
      path,
      taskId,
      message: `Task ${taskId} requiredCapabilities.budget must be an object.`
    });
    return undefined;
  }

  const budget: MutablePlanTaskBudgetCapabilityRequirement = {};
  for (const key of TASK_CAPABILITY_BUDGET_KEYS) {
    const budgetValue = value[key];
    if (budgetValue === undefined) {
      continue;
    }
    if (typeof budgetValue !== "number" || !Number.isFinite(budgetValue) || budgetValue < 0) {
      violations.push({
        code: "malformed-task-required-budget",
        path: `${path}.${key}`,
        taskId,
        message:
          `Task ${taskId} requiredCapabilities.budget.${key} must be a non-negative finite number when provided.`
      });
      continue;
    }
    budget[key] = budgetValue;
  }

  return budget;
}

function copyPlanTaskRequiredCapabilities(
  capabilities: PlanTaskRequiredCapabilities
): PlanTaskRequiredCapabilities {
  return {
    repoScopes: capabilities.repoScopes.map((scope) => ({ ...scope })),
    toolPermissions: capabilities.toolPermissions.map((permission) => ({ ...permission })),
    ...(capabilities.executeGrants !== undefined
      ? {
          executeGrants: capabilities.executeGrants.map((grant) => ({ ...grant }))
        }
      : {}),
    ...(capabilities.workspace !== undefined ? { workspace: { allowDirty: capabilities.workspace.allowDirty } } : {}),
    budget: { ...capabilities.budget }
  };
}

function createPlanTaskCapabilityAdmissionResult(input: {
  readonly taskId: PlanTaskId;
  readonly requiredCapabilities: PlanTaskRequiredCapabilities;
}): PlanTaskCapabilityAdmissionResult {
  return {
    taskId: input.taskId,
    requestedCapabilities: copyPlanTaskRequiredCapabilities(input.requiredCapabilities),
    admittedCapabilities: copyPlanTaskRequiredCapabilities(input.requiredCapabilities),
    verdict: "allow"
  };
}

function copyPlanTaskCapabilityAdmissionResult(
  result: PlanTaskCapabilityAdmissionResult
): PlanTaskCapabilityAdmissionResult {
  return {
    taskId: result.taskId,
    requestedCapabilities: copyPlanTaskRequiredCapabilities(result.requestedCapabilities),
    admittedCapabilities: copyPlanTaskRequiredCapabilities(result.admittedCapabilities),
    verdict: result.verdict
  };
}

function collectTaskPreHandoffVerificationTriggers(
  requirement: PlanTaskCapabilityRequirement
): readonly PlanningAdmissionPreHandoffVerificationTrigger[] {
  const refsByGrantKind = new Map<
    PlanningAdmissionPreHandoffGrantKind,
    PlanningAdmissionTaskCapabilityGrantRef[]
  >();

  const addRef = (
    grantKind: PlanningAdmissionPreHandoffGrantKind,
    ref: PlanningAdmissionTaskCapabilityGrantRef
  ): void => {
    const refs = refsByGrantKind.get(grantKind) ?? [];
    if (
      !refs.some((existing) =>
        existing.section === ref.section &&
        existing.index === ref.index &&
        existing.source === ref.source
      )
    ) {
      refs.push(ref);
    }
    refsByGrantKind.set(grantKind, refs);
  };

  requirement.requiredCapabilities.repoScopes.forEach((scope, index) => {
    if (scope.access !== "write") {
      return;
    }
    addRef("write", {
      section: "repoScopes",
      index,
      source: "repo-scope-access"
    });
  });

  requirement.requiredCapabilities.toolPermissions.forEach((permission, index) => {
    for (const grantKind of preHandoffGrantKinds(planningGrantKindsRequiredForToolPermission(permission))) {
      addRef(grantKind, {
        section: "toolPermissions",
        index,
        source: "tool-permission"
      });
    }
  });

  (requirement.requiredCapabilities.executeGrants ?? []).forEach((grant, index) => {
    for (const grantKind of preHandoffGrantKinds(planningGrantKindsRequiredForExecuteGrant(grant))) {
      addRef(grantKind, {
        section: "executeGrants",
        index,
        source: "execute-grant"
      });
    }
  });

  return PRE_HANDOFF_GRANT_KIND_ORDER.flatMap((grantKind): PlanningAdmissionPreHandoffVerificationTrigger[] => {
    const capabilityRefs = refsByGrantKind.get(grantKind) ?? [];
    if (capabilityRefs.length === 0) {
      return [];
    }

    return [
      {
        taskId: requirement.taskId,
        grantKind,
        authority: preHandoffAuthorityForGrantKind(grantKind),
        source: "candidate-plan-required-capabilities",
        verificationPhase: "pre-handoff",
        capabilityRefs
      }
    ];
  });
}

function collectTaskReleaseGrantConditions(
  requirement: PlanTaskCapabilityRequirement
): readonly PlanningAdmissionReleaseGrantCondition[] {
  const capabilityRefs: PlanningAdmissionTaskCapabilityGrantRef[] = [];

  const addRef = (ref: PlanningAdmissionTaskCapabilityGrantRef): void => {
    if (
      !capabilityRefs.some((existing) =>
        existing.section === ref.section &&
        existing.index === ref.index &&
        existing.source === ref.source
      )
    ) {
      capabilityRefs.push(ref);
    }
  };

  requirement.requiredCapabilities.toolPermissions.forEach((permission, index) => {
    if (!planningGrantKindsRequiredForToolPermission(permission).includes("release")) {
      return;
    }

    addRef({
      section: "toolPermissions",
      index,
      source: "tool-permission"
    });
  });

  (requirement.requiredCapabilities.executeGrants ?? []).forEach((grant, index) => {
    if (!planningGrantKindsRequiredForExecuteGrant(grant).includes("release")) {
      return;
    }

    addRef({
      section: "executeGrants",
      index,
      source: "execute-grant"
    });
  });

  if (capabilityRefs.length === 0) {
    return [];
  }

  return [
    {
      taskId: requirement.taskId,
      grantKind: "release",
      authority: "release",
      source: "candidate-plan-required-capabilities",
      admissionPhase: "before-execution",
      capabilityRefs
    }
  ];
}

function collectPreHandoffVerificationTaskViolations(input: {
  readonly graph: PlanGraph;
  readonly dependencyGraph: PlanTaskDependencyGraph;
  readonly preHandoffVerificationTriggers: readonly PlanningAdmissionPreHandoffVerificationTrigger[];
}): readonly PlanGraphValidationViolationDraft[] {
  const taskById = collectUniquePlanTasksById(input.graph.tasks);
  const dependencyIdsByTaskId = new Map(
    input.dependencyGraph.nodes.map((node) => [node.taskId, node.dependsOn])
  );
  const triggerGrantKindsByTaskId = new Map<PlanTaskId, Set<PlanningAdmissionPreHandoffGrantKind>>();

  for (const trigger of input.preHandoffVerificationTriggers) {
    const grantKinds = triggerGrantKindsByTaskId.get(trigger.taskId) ?? new Set<PlanningAdmissionPreHandoffGrantKind>();
    grantKinds.add(trigger.grantKind);
    triggerGrantKindsByTaskId.set(trigger.taskId, grantKinds);
  }

  return [...triggerGrantKindsByTaskId.entries()].flatMap(([taskId, grantKinds]): PlanGraphValidationViolationDraft[] => {
    const task = taskById.get(taskId);
    if (task === undefined || !isExecutionHandoffTask(task)) {
      return [];
    }

    if (hasPrecedingVerificationTask({ taskId, taskById, dependencyIdsByTaskId })) {
      return [];
    }

    return [
      {
        code: "verification_required_by_envelope",
        path: `tasks.${taskId}.dependsOn`,
        taskId,
        message:
          `Task ${taskId} requires ${formatPreHandoffGrantKinds(grantKinds)} authority for execution handoff ` +
          "and must depend on an explicit verification task before admission."
      }
    ];
  });
}

function collectReleaseGrantTaskViolations(input: {
  readonly graph: PlanGraph;
  readonly dependencyGraph: PlanTaskDependencyGraph;
  readonly releaseGrantConditions: readonly PlanningAdmissionReleaseGrantCondition[];
}): readonly PlanGraphValidationViolationDraft[] {
  const taskById = collectUniquePlanTasksById(input.graph.tasks);
  const dependencyIdsByTaskId = new Map(
    input.dependencyGraph.nodes.map((node) => [node.taskId, node.dependsOn])
  );

  return input.releaseGrantConditions.flatMap((condition): PlanGraphValidationViolationDraft[] => {
    const task = taskById.get(condition.taskId);
    if (task === undefined) {
      return [];
    }

    const violations: PlanGraphValidationViolationDraft[] = [];
    if (task.kind !== "release") {
      violations.push({
        code: "release-grant-without-explicit-release-task",
        path: `tasks.${condition.taskId}.kind`,
        taskId: condition.taskId,
        message:
          `Task ${condition.taskId} requires release authority and must be an explicit release task ` +
          "before planning admission."
      });
      return violations;
    }

    if (!hasPrecedingVerificationTask({ taskId: condition.taskId, taskById, dependencyIdsByTaskId })) {
      violations.push({
        code: "release-grant-missing-verification-evidence",
        path: `tasks.${condition.taskId}.dependsOn`,
        taskId: condition.taskId,
        message:
          `Task ${condition.taskId} requires release authority and must depend on explicit verification ` +
          "evidence before planning admission."
      });
    }

    return violations;
  });
}

function collectUniquePlanTasksById(tasks: readonly PlanTask[]): ReadonlyMap<PlanTaskId, PlanTask> {
  const countsByTaskId = new Map<string, number>();
  for (const task of tasks) {
    countsByTaskId.set(task.id, (countsByTaskId.get(task.id) ?? 0) + 1);
  }

  const taskById = new Map<PlanTaskId, PlanTask>();
  for (const task of tasks) {
    if (isPlanTaskId(task.id) && countsByTaskId.get(task.id) === 1) {
      taskById.set(task.id, task);
    }
  }
  return taskById;
}

function isExecutionHandoffTask(task: PlanTask): boolean {
  return task.kind === "implementation";
}

function hasPrecedingVerificationTask(input: {
  readonly taskId: PlanTaskId;
  readonly taskById: ReadonlyMap<PlanTaskId, PlanTask>;
  readonly dependencyIdsByTaskId: ReadonlyMap<PlanTaskId, readonly PlanTaskId[]>;
}): boolean {
  const visited = new Set<PlanTaskId>();
  const stack = [...(input.dependencyIdsByTaskId.get(input.taskId) ?? [])];

  while (stack.length > 0) {
    const dependencyTaskId = stack.pop();
    if (dependencyTaskId === undefined || visited.has(dependencyTaskId)) {
      continue;
    }
    visited.add(dependencyTaskId);

    const dependencyTask = input.taskById.get(dependencyTaskId);
    if (dependencyTask?.kind === "verification") {
      return true;
    }

    stack.push(...(input.dependencyIdsByTaskId.get(dependencyTaskId) ?? []));
  }

  return false;
}

function formatPreHandoffGrantKinds(
  grantKinds: ReadonlySet<PlanningAdmissionPreHandoffGrantKind>
): string {
  return PRE_HANDOFF_GRANT_KIND_ORDER
    .filter((grantKind) => grantKinds.has(grantKind))
    .map((grantKind) => grantKind === "pr" ? "pull-request" : grantKind)
    .join(" and ");
}

function preHandoffGrantKinds(
  grantKinds: readonly PlanningCapabilityEnvelopeGrantKind[]
): readonly PlanningAdmissionPreHandoffGrantKind[] {
  return grantKinds.filter(isPlanningAdmissionPreHandoffGrantKind);
}

function isPlanningAdmissionPreHandoffGrantKind(
  grantKind: PlanningCapabilityEnvelopeGrantKind
): grantKind is PlanningAdmissionPreHandoffGrantKind {
  return grantKind === "write" || grantKind === "pr";
}

function preHandoffAuthorityForGrantKind(
  grantKind: PlanningAdmissionPreHandoffGrantKind
): PlanningAdmissionPreHandoffAuthority {
  switch (grantKind) {
    case "write":
      return "repository-write";
    case "pr":
      return "pull-request";
  }
}

interface TaskRiskPolicyCompatibilityAdmission {
  readonly evidence: PlanningAdmissionTaskRiskCompatibilityEvidence;
  readonly violations: readonly PlanGraphValidationViolationDraft[];
}

function evaluateTaskRiskPolicyCompatibility(input: {
  readonly task: PlanTask;
  readonly riskDeclarationViolation?: PlanGraphValidationViolationDraft;
  readonly requiredCapabilitiesAdmission: TaskRequiredCapabilitiesAdmission;
}): TaskRiskPolicyCompatibilityAdmission {
  const declaredRisk = (input.task as { readonly risk?: unknown }).risk;
  if (!isRiskLevel(declaredRisk) || input.requiredCapabilitiesAdmission.requiredCapabilities === undefined) {
    return {
      evidence: createUnevaluableTaskRiskCompatibilityEvidence(input),
      violations: []
    };
  }

  const rule = PLAN_TASK_RISK_COMPATIBILITY_RULES[declaredRisk];
  const requiredRisk = highestRequiredCapabilityRisk(input.requiredCapabilitiesAdmission.requiredCapabilities);
  const compatible = riskLevelCovers(rule.maxRequiredCapabilityRisk, requiredRisk);
  const evidence: PlanningAdmissionTaskRiskCompatibilityEvidence = {
    taskId: input.task.id,
    declaredRisk,
    requiredCapabilityRisk: requiredRisk,
    allowedRequiredCapabilityRisks: [...rule.allowedRequiredCapabilityRisks],
    outcome: compatible ? "compatible" : "incompatible"
  };

  if (compatible) {
    return {
      evidence,
      violations: []
    };
  }

  return {
    evidence,
    violations: [
      {
        code: "task-risk-below-required-capability-risk",
        path: `tasks.${input.task.id}.risk`,
        taskId: input.task.id,
        declaredRisk,
        requiredRisk,
        message:
          `Task ${input.task.id} declares ${declaredRisk} risk but requires ${requiredRisk} capability risk; ` +
          `${declaredRisk} tasks may only require ${rule.allowedRequiredCapabilityRisks.join(", ")} capability risk.`
      }
    ]
  };
}

function createUnevaluableTaskRiskCompatibilityEvidence(input: {
  readonly task: PlanTask;
  readonly riskDeclarationViolation?: PlanGraphValidationViolationDraft;
  readonly requiredCapabilitiesAdmission: TaskRequiredCapabilitiesAdmission;
}): PlanningAdmissionUnevaluableTaskRiskCompatibilityEvidence {
  const declaredRisk = (input.task as { readonly risk?: unknown }).risk;
  const blockingViolationCodes = collectTaskRiskCompatibilityUnevaluableCodes(input);
  const validDeclaredRisk = isRiskLevel(declaredRisk) ? declaredRisk : undefined;
  const requiredCapabilityRisk = input.requiredCapabilitiesAdmission.requiredCapabilities === undefined
    ? undefined
    : highestRequiredCapabilityRisk(input.requiredCapabilitiesAdmission.requiredCapabilities);

  return {
    taskId: String(input.task.id),
    ...(validDeclaredRisk !== undefined
      ? {
          declaredRisk: validDeclaredRisk,
          allowedRequiredCapabilityRisks: [
            ...PLAN_TASK_RISK_COMPATIBILITY_RULES[validDeclaredRisk].allowedRequiredCapabilityRisks
          ]
        }
      : {}),
    ...(requiredCapabilityRisk !== undefined ? { requiredCapabilityRisk } : {}),
    outcome: "not-evaluable",
    blockingViolationCodes,
    reason: formatTaskRiskCompatibilityUnevaluableReason(input.task.id, blockingViolationCodes)
  };
}

function collectTaskRiskCompatibilityUnevaluableCodes(input: {
  readonly riskDeclarationViolation?: PlanGraphValidationViolationDraft;
  readonly requiredCapabilitiesAdmission: TaskRequiredCapabilitiesAdmission;
}): readonly PlanningAdmissionTaskRiskCompatibilityUnevaluableCode[] {
  return [
    ...new Set(
      [
        input.riskDeclarationViolation?.code,
        ...(input.requiredCapabilitiesAdmission.requiredCapabilities === undefined
          ? input.requiredCapabilitiesAdmission.violations.map((violation) => violation.code)
          : [])
      ].filter(isTaskRiskCompatibilityUnevaluableCode)
    )
  ];
}

function isTaskRiskCompatibilityUnevaluableCode(
  code: PlanGraphValidationViolationCode | undefined
): code is PlanningAdmissionTaskRiskCompatibilityUnevaluableCode {
  return code === "missing-task-risk" ||
    code === "malformed-task-risk" ||
    code === "missing-task-required-capabilities" ||
    code === "malformed-task-required-capabilities";
}

function formatTaskRiskCompatibilityUnevaluableReason(
  taskId: string,
  blockingViolationCodes: readonly PlanningAdmissionTaskRiskCompatibilityUnevaluableCode[]
): string {
  if (
    blockingViolationCodes.some((code) => code === "missing-task-risk" || code === "malformed-task-risk") &&
    blockingViolationCodes.some(
      (code) => code === "missing-task-required-capabilities" || code === "malformed-task-required-capabilities"
    )
  ) {
    return `Task ${taskId} risk compatibility could not be evaluated because task risk and required capabilities are not admissible.`;
  }

  if (blockingViolationCodes.some((code) => code === "missing-task-risk" || code === "malformed-task-risk")) {
    return `Task ${taskId} risk compatibility could not be evaluated because task risk is not admissible.`;
  }

  if (
    blockingViolationCodes.some(
      (code) => code === "missing-task-required-capabilities" || code === "malformed-task-required-capabilities"
    )
  ) {
    return `Task ${taskId} risk compatibility could not be evaluated because required capabilities are not admissible.`;
  }

  return `Task ${taskId} risk compatibility could not be evaluated because admission prerequisites are not admissible.`;
}

function highestRequiredCapabilityRisk(capabilities: PlanTaskRequiredCapabilities): RiskLevel {
  return capabilities.toolPermissions.reduce<RiskLevel>(
    (highestRisk, permission) => riskLevelCovers(permission.risk, highestRisk) ? permission.risk : highestRisk,
    "low"
  );
}

function collectTaskRequiredCapabilityEnvelopeViolations(input: {
  readonly task: PlanTask;
  readonly requiredCapabilities: PlanTaskRequiredCapabilities;
  readonly envelope: CapabilityEnvelope;
  readonly grantModel: PlanningAdmissionGrantModel;
}): readonly PlanGraphValidationViolationDraft[] {
  return [
    ...collectRequiredPlanningGrantModelViolations(input),
    ...collectRequiredRepoScopeEnvelopeViolations(input),
    ...collectRequiredToolPermissionEnvelopeViolations(input),
    ...collectRequiredExecuteGrantEnvelopeViolations(input),
    ...collectRequiredBudgetEnvelopeViolations(input)
  ];
}

function collectRequiredPlanningGrantModelViolations(input: {
  readonly task: PlanTask;
  readonly requiredCapabilities: PlanTaskRequiredCapabilities;
  readonly grantModel: PlanningAdmissionGrantModel;
}): readonly PlanGraphValidationViolationDraft[] {
  return [
    ...collectRequiredRepoScopeGrantModelViolations(input),
    ...collectRequiredToolPermissionGrantModelViolations(input),
    ...collectRequiredExecuteGrantModelViolations(input)
  ];
}

function collectRequiredRepoScopeGrantModelViolations(input: {
  readonly task: PlanTask;
  readonly requiredCapabilities: PlanTaskRequiredCapabilities;
  readonly grantModel: PlanningAdmissionGrantModel;
}): readonly PlanGraphValidationViolationDraft[] {
  return input.requiredCapabilities.repoScopes.flatMap((requiredScope, index): PlanGraphValidationViolationDraft[] => {
    if (requiredScope.access !== "write" || planningAdmissionGrantModelHasGrant(input.grantModel, "write")) {
      return [];
    }

    return [
      createPlanningGrantDeniedViolation({
        task: input.task,
        kind: "write",
        path: `tasks.${input.task.id}.requiredCapabilities.repoScopes.${index}`,
        requirement:
          `repo scope ${requiredScope.workspace}:${requiredScope.path}:${requiredScope.access}`
      })
    ];
  });
}

function collectRequiredToolPermissionGrantModelViolations(input: {
  readonly task: PlanTask;
  readonly requiredCapabilities: PlanTaskRequiredCapabilities;
  readonly grantModel: PlanningAdmissionGrantModel;
}): readonly PlanGraphValidationViolationDraft[] {
  return input.requiredCapabilities.toolPermissions.flatMap((requiredPermission, index): PlanGraphValidationViolationDraft[] =>
    planningGrantKindsRequiredForToolPermission(requiredPermission).flatMap((kind) =>
      planningAdmissionGrantModelHasGrant(input.grantModel, kind)
        ? []
        : [
            createPlanningGrantDeniedViolation({
              task: input.task,
              kind,
              path: `tasks.${input.task.id}.requiredCapabilities.toolPermissions.${index}`,
              requirement:
                `tool permission ${requiredPermission.tool} (${toolPermissionLevelForGrant(requiredPermission)}, ${requiredPermission.risk})`
            })
          ]
    )
  );
}

function collectRequiredExecuteGrantModelViolations(input: {
  readonly task: PlanTask;
  readonly requiredCapabilities: PlanTaskRequiredCapabilities;
  readonly grantModel: PlanningAdmissionGrantModel;
}): readonly PlanGraphValidationViolationDraft[] {
  return (input.requiredCapabilities.executeGrants ?? []).flatMap((requiredGrant, index): PlanGraphValidationViolationDraft[] =>
    planningGrantKindsRequiredForExecuteGrant(requiredGrant).flatMap((kind) =>
      planningAdmissionGrantModelHasGrant(input.grantModel, kind)
        ? []
        : [
            createPlanningGrantDeniedViolation({
              task: input.task,
              kind,
              path: `tasks.${input.task.id}.requiredCapabilities.executeGrants.${index}`,
              requirement:
                `execute grant '${requiredGrant.command}' in scope '${requiredGrant.scope}'`
            })
          ]
    )
  );
}

function createPlanningGrantDeniedViolation(input: {
  readonly task: PlanTask;
  readonly kind: PlanningCapabilityEnvelopeGrantKind;
  readonly path: string;
  readonly requirement: string;
}): PlanGraphValidationViolationDraft {
  return {
    code: planningGrantDeniedViolationCode(input.kind),
    path: input.path,
    taskId: input.task.id,
    message:
      `Task ${input.task.id} requires ${input.requirement}, but the normalized planning admission grant model ` +
      `does not contain a valid ${input.kind} grant.`
  };
}

function planningGrantDeniedViolationCode(
  kind: PlanningCapabilityEnvelopeGrantKind
): PlanningAdmissionGrantDeniedViolationCode {
  switch (kind) {
    case "write":
      return "task-required-write-grant-denied";
    case "pr":
      return "task-required-pull-request-grant-denied";
    case "release":
      return "task-required-release-grant-denied";
  }
}

function planningGrantKindsRequiredForToolPermission(
  requiredPermission: PlanTaskToolPermissionCapabilityRequirement
): readonly PlanningCapabilityEnvelopeGrantKind[] {
  if (!capabilityToolCanDrivePrOrReleaseGrant(requiredPermission.tool, toolPermissionLevelForGrant(requiredPermission))) {
    return [];
  }

  return planningGrantKindsMentionedByText(`${requiredPermission.tool} ${requiredPermission.reason}`);
}

function planningGrantKindsRequiredForExecuteGrant(
  requiredGrant: PlanTaskExecuteGrantCapabilityRequirement
): readonly PlanningCapabilityEnvelopeGrantKind[] {
  return planningGrantKindsMentionedByText(requiredGrant.command);
}

function planningGrantKindsMentionedByText(value: string): readonly PlanningCapabilityEnvelopeGrantKind[] {
  return [
    ...(mentionsPullRequestGrant(value) ? ["pr" as const] : []),
    ...(mentionsReleaseGrant(value) ? ["release" as const] : [])
  ];
}

function collectRequiredRepoScopeEnvelopeViolations(input: {
  readonly task: PlanTask;
  readonly requiredCapabilities: PlanTaskRequiredCapabilities;
  readonly envelope: CapabilityEnvelope;
}): readonly PlanGraphValidationViolationDraft[] {
  return input.requiredCapabilities.repoScopes.flatMap((requiredScope, index): PlanGraphValidationViolationDraft[] => {
    const admitted = input.envelope.repoScopes.some((scope) => repoScopeCoversRequiredScope(scope, requiredScope));
    if (admitted) {
      return [];
    }

    return [
      {
        code: "task-required-repo-scope-outside-intent-envelope",
        path: `tasks.${input.task.id}.requiredCapabilities.repoScopes.${index}`,
        taskId: input.task.id,
        message:
          `Task ${input.task.id} requires repo scope ${requiredScope.workspace}:${requiredScope.path}:${requiredScope.access} outside confirmed intent capability envelope.`
      }
    ];
  });
}

function collectRequiredToolPermissionEnvelopeViolations(input: {
  readonly task: PlanTask;
  readonly requiredCapabilities: PlanTaskRequiredCapabilities;
  readonly envelope: CapabilityEnvelope;
}): readonly PlanGraphValidationViolationDraft[] {
  return input.requiredCapabilities.toolPermissions.flatMap((requiredPermission, index): PlanGraphValidationViolationDraft[] => {
    const admitted = input.envelope.toolPermissions.some((permission) =>
      toolPermissionCoversRequiredPermission(permission, requiredPermission)
    );
    if (admitted) {
      return [];
    }

    return [
      {
        code: "task-required-tool-permission-outside-intent-envelope",
        path: `tasks.${input.task.id}.requiredCapabilities.toolPermissions.${index}`,
        taskId: input.task.id,
        message:
          `Task ${input.task.id} requires tool permission ${requiredPermission.tool} (${toolPermissionLevelForGrant(requiredPermission)}, ${requiredPermission.risk}) outside confirmed intent capability envelope.`
      }
    ];
  });
}

function collectRequiredExecuteGrantEnvelopeViolations(input: {
  readonly task: PlanTask;
  readonly requiredCapabilities: PlanTaskRequiredCapabilities;
  readonly envelope: CapabilityEnvelope;
}): readonly PlanGraphValidationViolationDraft[] {
  const envelopeExecuteGrants = input.envelope.executeGrants ?? [];

  return (input.requiredCapabilities.executeGrants ?? []).flatMap((requiredGrant, index): PlanGraphValidationViolationDraft[] => {
    const admitted = envelopeExecuteGrants.some((grant) =>
      grant.command === requiredGrant.command && grant.scope === requiredGrant.scope
    );
    if (admitted) {
      return [];
    }

    return [
      {
        code: "task-required-execute-grant-outside-intent-envelope",
        path: `tasks.${input.task.id}.requiredCapabilities.executeGrants.${index}`,
        taskId: input.task.id,
        message:
          `Task ${input.task.id} requires execute grant '${requiredGrant.command}' in scope '${requiredGrant.scope}' outside confirmed intent capability envelope.`
      }
    ];
  });
}

function collectRequiredBudgetEnvelopeViolations(input: {
  readonly task: PlanTask;
  readonly requiredCapabilities: PlanTaskRequiredCapabilities;
  readonly envelope: CapabilityEnvelope;
}): readonly PlanGraphValidationViolationDraft[] {
  const violations: PlanGraphValidationViolationDraft[] = [];

  for (const key of TASK_CAPABILITY_BUDGET_KEYS) {
    const requiredValue = input.requiredCapabilities.budget[key];
    if (requiredValue === undefined) {
      continue;
    }

    const admittedValue = input.envelope.budget[key];
    if (typeof admittedValue === "number" && Number.isFinite(admittedValue) && requiredValue <= admittedValue) {
      continue;
    }

    violations.push({
      code: "task-required-budget-outside-intent-envelope",
      path: `tasks.${input.task.id}.requiredCapabilities.budget.${key}`,
      taskId: input.task.id,
      message:
        `Task ${input.task.id} requires budget ${key}=${requiredValue} outside confirmed intent capability envelope.`
    });
  }

  return violations;
}

function repoScopeCoversRequiredScope(
  admitted: PlanTaskRepoScopeCapabilityRequirement,
  required: PlanTaskRepoScopeCapabilityRequirement
): boolean {
  return admitted.workspace === required.workspace &&
    repoScopeAccessCovers(admitted.access, required.access) &&
    repoScopePathCovers(admitted.path, required.path);
}

function repoScopeAccessCovers(
  admittedAccess: PlanTaskRepoScopeCapabilityRequirement["access"],
  requiredAccess: PlanTaskRepoScopeCapabilityRequirement["access"]
): boolean {
  if (requiredAccess === "read") {
    return admittedAccess === "read" || admittedAccess === "write";
  }

  return admittedAccess === requiredAccess;
}

function repoScopePathCovers(admittedPath: string, requiredPath: string): boolean {
  const admitted = normalizeRepoScopePathForContainment(admittedPath);
  const required = normalizeRepoScopePathForContainment(requiredPath);

  if (admitted === ".") {
    return true;
  }

  return required === admitted || required.startsWith(`${admitted}/`);
}

function normalizeRepoScopePathForContainment(path: string): string {
  const normalized = path.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/\/$/, "").trim();
  if (normalized === "" || normalized === "./") {
    return ".";
  }
  return normalized.startsWith("./") ? normalized.slice(2) : normalized;
}

function toolPermissionCoversRequiredPermission(
  admitted: PlanTaskToolPermissionCapabilityRequirement,
  required: PlanTaskToolPermissionCapabilityRequirement
): boolean {
  return (admitted.tool === required.tool || admitted.tool === "*") &&
    riskLevelCovers(admitted.risk, required.risk) &&
    toolPermissionLevelCovers(toolPermissionLevelForGrant(admitted), toolPermissionLevelForGrant(required));
}

function riskLevelCovers(admittedRisk: RiskLevel, requiredRisk: RiskLevel): boolean {
  return RISK_LEVEL_RANK[admittedRisk] >= RISK_LEVEL_RANK[requiredRisk];
}

function toolPermissionLevelForGrant(
  grant: PlanTaskToolPermissionCapabilityRequirement
): NonNullable<PlanTaskToolPermissionCapabilityRequirement["permissionLevel"]> {
  return grant.permissionLevel ?? "use";
}

function toolPermissionLevelCovers(
  admittedLevel: NonNullable<PlanTaskToolPermissionCapabilityRequirement["permissionLevel"]>,
  requiredLevel: NonNullable<PlanTaskToolPermissionCapabilityRequirement["permissionLevel"]>
): boolean {
  return TOOL_PERMISSION_LEVEL_RANK[admittedLevel] >= TOOL_PERMISSION_LEVEL_RANK[requiredLevel];
}

const TASK_CAPABILITY_BUDGET_KEYS = [
  "maxUsd",
  "maxTokens",
  "timeoutMs",
  "maxRepairLoops"
] as const satisfies readonly (keyof PlanTaskBudgetCapabilityRequirement)[];

const PLANNING_PILE_OUTPUT_KEYS = ["planId", "strategy", "tasks", "createdAt"] as const;
const PLANNING_PILE_TASK_KEYS = [
  "id",
  "title",
  "kind",
  "dependsOn",
  "covers",
  "requiredCapabilities",
  "risk"
] as const;
const PLANNING_PILE_REQUIRED_CAPABILITIES_KEYS = [
  "repoScopes",
  "toolPermissions",
  "executeGrants",
  "budget"
] as const;
const PLANNING_PILE_REPO_SCOPE_KEYS = ["workspace", "path", "access"] as const;
const PLANNING_PILE_TOOL_PERMISSION_KEYS = ["tool", "permissionLevel", "reason", "risk"] as const;
const PLANNING_PILE_EXECUTE_GRANT_KEYS = ["command", "scope", "reason"] as const;
const PLANNING_PILE_BUDGET_KEYS = [
  "maxUsd",
  "maxTokens",
  "timeoutMs",
  "maxRepairLoops"
] as const satisfies readonly (keyof PlanTaskBudgetCapabilityRequirement)[];

const PRE_HANDOFF_GRANT_KIND_ORDER = [
  "write",
  "pr"
] as const satisfies readonly PlanningAdmissionPreHandoffGrantKind[];

const RISK_LEVEL_RANK = {
  low: 1,
  medium: 2,
  high: 3
} as const satisfies Record<RiskLevel, number>;

const TOOL_PERMISSION_LEVEL_RANK = {
  read: 1,
  use: 2,
  write: 3,
  execute: 4,
  admin: 5
} as const satisfies Record<NonNullable<PlanTaskToolPermissionCapabilityRequirement["permissionLevel"]>, number>;

const CAPABILITY_VIOLATION_RULES = new Set<PlanningCapabilityViolationRule>([
  "missing-task-required-capabilities",
  "malformed-task-required-capabilities",
  "malformed-task-required-repo-scope",
  "malformed-task-required-tool-permission",
  "malformed-task-required-execute-grant",
  "malformed-task-required-budget",
  "task-required-write-grant-denied",
  "task-required-pull-request-grant-denied",
  "task-required-release-grant-denied",
  "task-risk-below-required-capability-risk",
  "task-required-repo-scope-outside-intent-envelope",
  "task-required-tool-permission-outside-intent-envelope",
  "task-required-execute-grant-outside-intent-envelope",
  "task-required-budget-outside-intent-envelope"
]);

function normalizeNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > 0 ? normalized : undefined;
}

function isRepoAccess(value: unknown): value is PlanTaskRepoScopeCapabilityRequirement["access"] {
  return value === "read" || value === "write" || value === "execute";
}

function isRiskLevel(value: unknown): value is RiskLevel {
  return value === "low" || value === "medium" || value === "high";
}

function isToolPermissionLevel(
  value: unknown
): value is NonNullable<PlanTaskToolPermissionCapabilityRequirement["permissionLevel"]> {
  return value === "read" || value === "use" || value === "write" || value === "execute" || value === "admin";
}

function collectDuplicateTaskIdViolations(tasks: readonly PlanTask[]): readonly PlanGraphValidationViolationDraft[] {
  const firstTaskIndexById = new Map<string, number>();
  const violations: PlanGraphValidationViolationDraft[] = [];

  tasks.forEach((task, index) => {
    const firstIndex = firstTaskIndexById.get(task.id);
    if (firstIndex === undefined) {
      firstTaskIndexById.set(task.id, index);
      return;
    }

    violations.push({
      code: "duplicate-task-id",
      path: `tasks.${index}.id`,
      taskId: task.id,
      duplicateTaskId: task.id,
      firstIndex,
      duplicateIndex: index,
      message: `Task ${task.id} duplicates task id from tasks.${firstIndex}.`
    });
  });

  return violations;
}

interface MutablePlanTaskDependencyGraphNode {
  readonly taskId: PlanTaskId;
  readonly dependsOn: PlanTaskId[];
  readonly dependedOnBy: PlanTaskId[];
}

interface IndexedDependencyViolation extends PlanGraphValidationViolationDraft {
  readonly taskIndex: number;
}

interface PlanTaskDependencyGraphInternalConstruction {
  readonly graph: PlanTaskDependencyGraph;
  readonly duplicateTaskIdViolations: readonly PlanGraphValidationViolationDraft[];
  readonly dependencyViolations: readonly IndexedDependencyViolation[];
}

function constructPlanTaskDependencyGraphInternal(
  tasks: readonly PlanTask[]
): PlanTaskDependencyGraphInternalConstruction {
  const duplicateTaskIdViolations = collectDuplicateTaskIdViolations(tasks);
  const duplicateTaskIds = new Set(
    duplicateTaskIdViolations.flatMap((violation) =>
      violation.duplicateTaskId === undefined ? [] : [violation.duplicateTaskId]
    )
  );
  const taskIds = new Set(tasks.map((task) => task.id));
  const nodeByTaskId = new Map<PlanTaskId, MutablePlanTaskDependencyGraphNode>();
  const edges: PlanTaskDependencyEdge[] = [];
  const dependencyViolations: IndexedDependencyViolation[] = [];

  for (const task of tasks) {
    if (!isPlanTaskId(task.id) || nodeByTaskId.has(task.id)) {
      continue;
    }
    nodeByTaskId.set(task.id, {
      taskId: task.id,
      dependsOn: [],
      dependedOnBy: []
    });
  }

  for (const [taskIndex, task] of tasks.entries()) {
    for (const [dependencyIndex, dependency] of task.dependsOn.entries()) {
      const violation = validateTaskDependencyReference({
        task,
        dependency,
        dependencyIndex,
        taskIds,
        duplicateTaskIds
      });

      if (violation !== undefined) {
        dependencyViolations.push({
          ...violation,
          taskIndex
        });
      }

      if (!isResolvableDependencyGraphEdge(task, dependency, taskIds, duplicateTaskIds)) {
        continue;
      }

      edges.push({
        dependentTaskId: task.id,
        dependencyTaskId: dependency,
        dependencyIndex
      });
      nodeByTaskId.get(task.id)?.dependsOn.push(dependency);
      nodeByTaskId.get(dependency)?.dependedOnBy.push(task.id);
    }
  }

  return {
    graph: {
      nodes: [...nodeByTaskId.values()].map((node) => ({
        taskId: node.taskId,
        dependsOn: [...node.dependsOn],
        dependedOnBy: [...node.dependedOnBy]
      })),
      edges
    },
    duplicateTaskIdViolations,
    dependencyViolations
  };
}

function validateTaskDependencyReference(input: {
  readonly task: PlanTask;
  readonly dependency: PlanTaskId;
  readonly dependencyIndex: number;
  readonly taskIds: ReadonlySet<string>;
  readonly duplicateTaskIds: ReadonlySet<string>;
}): PlanGraphValidationViolationDraft | undefined {
  if (!isPlanTaskId(input.dependency)) {
    return {
      code: "invalid-task-dependency-id",
      path: `tasks.${input.task.id}.dependsOn.${input.dependencyIndex}`,
      taskId: input.task.id,
      dependency: input.dependency,
      dependencyIndex: input.dependencyIndex,
      message: `Task ${input.task.id} dependency ${input.dependency} must reference a stable task- task id.`
    };
  }

  if (input.dependency === input.task.id && !input.duplicateTaskIds.has(input.task.id)) {
    return {
      code: "self-task-dependency",
      path: `tasks.${input.task.id}.dependsOn.${input.dependencyIndex}`,
      taskId: input.task.id,
      dependency: input.dependency,
      dependencyIndex: input.dependencyIndex,
      message: `Task ${input.task.id} cannot depend on itself.`
    };
  }

  if (!input.taskIds.has(input.dependency)) {
    return {
      code: "missing-task-dependency",
      path: `tasks.${input.task.id}.dependsOn.${input.dependencyIndex}`,
      taskId: input.task.id,
      dependency: input.dependency,
      dependencyIndex: input.dependencyIndex,
      message: `Task ${input.task.id} depends on missing task ${input.dependency}.`
    };
  }

  return undefined;
}

function isResolvableDependencyGraphEdge(
  task: PlanTask,
  dependency: PlanTaskId,
  taskIds: ReadonlySet<string>,
  duplicateTaskIds: ReadonlySet<string>
): task is PlanTask & { readonly id: PlanTaskId } {
  return (
    isPlanTaskId(task.id) &&
    isPlanTaskId(dependency) &&
    taskIds.has(dependency) &&
    !duplicateTaskIds.has(task.id) &&
    !duplicateTaskIds.has(dependency)
  );
}

function stripIndexedDependencyViolation(violation: IndexedDependencyViolation): PlanGraphValidationViolationDraft {
  const { taskIndex: _taskIndex, ...stripped } = violation;
  return stripped;
}

function collectImmediateDependencyCycleViolations(
  graph: PlanTaskDependencyGraph
): readonly PlanGraphValidationViolationDraft[] {
  const edgeKeys = new Set(
    graph.edges.map((edge) => dependencyEdgeKey(edge.dependentTaskId, edge.dependencyTaskId))
  );
  const violations: PlanGraphValidationViolationDraft[] = [];

  for (const edge of graph.edges) {
    if (edge.dependentTaskId === edge.dependencyTaskId) {
      continue;
    }
    if (!edgeKeys.has(dependencyEdgeKey(edge.dependencyTaskId, edge.dependentTaskId))) {
      continue;
    }

    violations.push({
      code: "dependency-cycle",
      path: `tasks.${edge.dependentTaskId}.dependsOn.${edge.dependencyIndex}`,
      taskId: edge.dependentTaskId,
      dependency: edge.dependencyTaskId,
      dependencyIndex: edge.dependencyIndex,
      message:
        `Task ${edge.dependentTaskId} cannot depend on ${edge.dependencyTaskId} because ` +
        `${edge.dependencyTaskId} already depends on ${edge.dependentTaskId}.`
    });
  }

  return violations;
}

function collectTransitiveDependencyCycleViolations(
  graph: PlanTaskDependencyGraph
): readonly PlanGraphValidationViolationDraft[] {
  const dependenciesByTaskId = new Map(graph.nodes.map((node) => [node.taskId, node.dependsOn]));
  const dependencyIndexByEdgeKey = new Map(
    graph.edges.map((edge) => [
      dependencyEdgeKey(edge.dependentTaskId, edge.dependencyTaskId),
      edge.dependencyIndex
    ])
  );
  const reportedCycleKeys = new Set<string>();
  const violations: PlanGraphValidationViolationDraft[] = [];

  function visit(taskId: PlanTaskId, path: readonly PlanTaskId[]): void {
    for (const dependency of dependenciesByTaskId.get(taskId) ?? []) {
      const cycleStartIndex = path.indexOf(dependency);
      if (cycleStartIndex !== -1) {
        const cyclePath = [...path.slice(cycleStartIndex), dependency];
        const cycleNodes = cyclePath.slice(0, -1);
        if (cycleNodes.length <= 2) {
          continue;
        }

        const cycleKey = canonicalCycleKey(cycleNodes);
        if (reportedCycleKeys.has(cycleKey)) {
          continue;
        }
        reportedCycleKeys.add(cycleKey);

        const dependencyIndex = dependencyIndexByEdgeKey.get(dependencyEdgeKey(taskId, dependency)) ?? 0;
        violations.push({
          code: "dependency-cycle",
          path: `tasks.${taskId}.dependsOn.${dependencyIndex}`,
          taskId,
          dependency,
          dependencyIndex,
          cyclePath,
          message: `Task dependency cycle detected: ${cyclePath.join(" -> ")}.`
        });
        continue;
      }

      visit(dependency, [...path, dependency]);
    }
  }

  for (const node of graph.nodes) {
    visit(node.taskId, [node.taskId]);
  }

  return violations;
}

function canonicalCycleKey(cycleNodes: readonly PlanTaskId[]): string {
  const rotations = cycleNodes.map((_taskId, index) => [
    ...cycleNodes.slice(index),
    ...cycleNodes.slice(0, index)
  ]);
  return rotations
    .map((rotation) => rotation.join("\u0000"))
    .sort()[0] ?? "";
}

function dependencyEdgeKey(dependentTaskId: PlanTaskId, dependencyTaskId: PlanTaskId): string {
  return `${dependentTaskId}\u0000${dependencyTaskId}`;
}

function hasDependencyCycle(graph: PlanTaskDependencyGraph): boolean {
  const dependencyIdsByTaskId = new Map(graph.nodes.map((node) => [node.taskId, node.dependsOn]));
  const visiting = new Set<string>();
  const visited = new Set<string>();

  function visit(taskId: PlanTaskId): boolean {
    if (visited.has(taskId)) {
      return false;
    }
    if (visiting.has(taskId)) {
      return true;
    }

    visiting.add(taskId);
    for (const dependency of dependencyIdsByTaskId.get(taskId) ?? []) {
      if (visit(dependency)) {
        return true;
      }
    }
    visiting.delete(taskId);
    visited.add(taskId);
    return false;
  }

  return graph.nodes.some((node) => visit(node.taskId));
}
