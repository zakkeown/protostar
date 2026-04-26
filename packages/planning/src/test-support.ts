import type {
  PlanGraphValidationViolation,
  PlanGraphValidationViolationCode,
  PlanGraphViolationAffectedPlanLocation,
  PlanningAdmissionRejectionReason,
  PlanningAdmissionReleaseGrantRejectionCode,
  PlanningAdmissionReleaseGrantRejectionReason
} from "./index.js";

export type ExpectedPlanGraphValidationViolation =
  {
    readonly validator: PlanGraphValidationViolation["validator"];
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
    readonly cyclePath?: PlanGraphValidationViolation["cyclePath"];
    readonly declaredRisk?: PlanGraphValidationViolation["declaredRisk"];
    readonly requiredRisk?: PlanGraphValidationViolation["requiredRisk"];
  };

export function withAffectedPlanLocations(
  violations: readonly ExpectedPlanGraphValidationViolation[]
): readonly PlanGraphValidationViolation[] {
  return violations.map(withAffectedPlanLocation);
}

export function withAffectedPlanLocation(
  violation: ExpectedPlanGraphValidationViolation
): PlanGraphValidationViolation {
  return {
    validator: violation.validator,
    code: violation.code,
    path: violation.path,
    affectedPlanLocation:
      violation.affectedPlanLocation ?? createExpectedPlanGraphViolationAffectedPlanLocation(violation),
    message: violation.message,
    ...(violation.taskId !== undefined ? { taskId: violation.taskId } : {}),
    ...(violation.duplicateTaskId !== undefined ? { duplicateTaskId: violation.duplicateTaskId } : {}),
    ...(violation.firstIndex !== undefined ? { firstIndex: violation.firstIndex } : {}),
    ...(violation.duplicateIndex !== undefined ? { duplicateIndex: violation.duplicateIndex } : {}),
    ...(violation.dependency !== undefined ? { dependency: violation.dependency } : {}),
    ...(violation.dependencyIndex !== undefined ? { dependencyIndex: violation.dependencyIndex } : {}),
    ...(violation.coverageIndex !== undefined ? { coverageIndex: violation.coverageIndex } : {}),
    ...(violation.acceptanceCriterionId !== undefined
      ? { acceptanceCriterionId: violation.acceptanceCriterionId }
      : {}),
    ...(violation.cyclePath !== undefined ? { cyclePath: violation.cyclePath } : {}),
    ...(violation.declaredRisk !== undefined ? { declaredRisk: violation.declaredRisk } : {}),
    ...(violation.requiredRisk !== undefined ? { requiredRisk: violation.requiredRisk } : {})
  };
}

export function expectedPlanningAdmissionRejectionReasons(
  violations: readonly ExpectedPlanGraphValidationViolation[]
): readonly PlanningAdmissionRejectionReason[] {
  return withAffectedPlanLocations(violations).map(
    ({ validator, code, path, affectedPlanLocation, message, taskId, acceptanceCriterionId }) => ({
      validator,
      code,
      path,
      affectedPlanLocation,
      message,
      ...(taskId !== undefined ? { taskId } : {}),
      ...(acceptanceCriterionId !== undefined ? { acceptanceCriterionId } : {})
    })
  );
}

export function expectedPlanningAdmissionReleaseGrantRejectionReasons(
  violations: readonly (ExpectedPlanGraphValidationViolation & {
    readonly code: PlanningAdmissionReleaseGrantRejectionCode;
  })[]
): readonly PlanningAdmissionReleaseGrantRejectionReason[] {
  return violations.map((violation) => {
    const affectedPlanLocation =
      violation.affectedPlanLocation ?? createExpectedPlanGraphViolationAffectedPlanLocation(violation);
    return {
      code: violation.code,
      path: violation.path,
      affectedPlanLocation,
      message: violation.message,
      ...(violation.taskId !== undefined ? { taskId: violation.taskId } : {})
    };
  });
}

function createExpectedPlanGraphViolationAffectedPlanLocation(
  violation: ExpectedPlanGraphValidationViolation
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

  if (isNodeViolationCode(violation.code)) {
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

function isNodeViolationCode(code: PlanGraphValidationViolationCode): boolean {
  return code === "duplicate-task-id" || code === "invalid-task-id" || code === "malformed-task";
}
