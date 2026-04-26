import type { StageArtifactRef } from "@protostar/artifacts";
import {
  PLANNING_ADMISSION_ARTIFACT_NAME,
  type AdmittedPlanExecutionArtifact
} from "@protostar/planning";
import type { WorkspaceRef } from "@protostar/repo";

export type ExecutionTaskStatus = "pending" | "running" | "passed" | "failed" | "blocked";

export interface ExecutionTask {
  readonly planTaskId: string;
  readonly title: string;
  readonly status: ExecutionTaskStatus;
  readonly dependsOn: readonly string[];
}

export interface ExecutionRunPlan {
  readonly runId: string;
  readonly planId: string;
  readonly admittedPlan: AdmittedPlanExecutionArtifact["evidence"];
  readonly workspace: WorkspaceRef;
  readonly tasks: readonly ExecutionTask[];
}

export type ExecutionLifecycleEventType =
  | "task-pending"
  | "task-running"
  | "task-passed"
  | "task-failed"
  | "task-blocked";

export interface ExecutionLifecycleEvent {
  readonly type: ExecutionLifecycleEventType;
  readonly runId: string;
  readonly planTaskId: string;
  readonly at: string;
  readonly status: ExecutionTaskStatus;
  readonly reason?: string;
  readonly blockedBy?: readonly string[];
  readonly evidence?: readonly StageArtifactRef[];
}

export interface ExecutionDryRunTaskResult extends ExecutionTask {
  readonly status: "passed" | "failed" | "blocked";
  readonly evidence: readonly StageArtifactRef[];
  readonly reason?: string;
  readonly blockedBy?: readonly string[];
}

export interface ExecutionDryRunResult {
  readonly runId: string;
  readonly planId: string;
  readonly status: "passed" | "failed";
  readonly tasks: readonly ExecutionDryRunTaskResult[];
  readonly events: readonly ExecutionLifecycleEvent[];
  readonly evidence: readonly StageArtifactRef[];
}

export interface ExecutionDryRunOptions {
  readonly execution: ExecutionRunPlan;
  readonly failTaskIds?: readonly string[];
  readonly now?: () => string;
}

export type ExecutionAdmittedPlanAdmissionViolationCode =
  | "admitted-plan-artifact-not-object"
  | "admitted-plan-artifact-failed-planning-result"
  | "admitted-plan-artifact-failed-admission-result"
  | "admitted-plan-artifact-blocked-planning-admission"
  | "admitted-plan-artifact-candidate-plan-object"
  | "admitted-plan-artifact-raw-plan-object"
  | "admitted-plan-artifact-missing-field"
  | "admitted-plan-artifact-invalid-field"
  | "admitted-plan-artifact-reference-mismatch"
  | "admitted-plan-artifact-raw-task-body";

export interface ExecutionAdmittedPlanAdmissionViolation {
  readonly code: ExecutionAdmittedPlanAdmissionViolationCode;
  readonly path: string;
  readonly message: string;
}

export type ExecutionAdmittedPlanAdmissionValidation =
  | {
      readonly ok: true;
      readonly artifact: AdmittedPlanExecutionArtifact;
      readonly violations: readonly [];
      readonly errors: readonly [];
    }
  | {
      readonly ok: false;
      readonly violations: readonly ExecutionAdmittedPlanAdmissionViolation[];
      readonly errors: readonly string[];
    };

export interface PrepareExecutionRunInput {
  readonly runId: string;
  readonly admittedPlan: AdmittedPlanExecutionArtifact;
  readonly workspace: WorkspaceRef;
}

export function validateAdmittedPlanExecutionArtifact(
  value: unknown
): ExecutionAdmittedPlanAdmissionValidation {
  const violations: ExecutionAdmittedPlanAdmissionViolation[] = [];

  if (!isRecord(value)) {
    violations.push({
      code: "admitted-plan-artifact-not-object",
      path: "admittedPlan",
      message:
        "Execution admission requires an admitted-plan execution artifact produced from planning-admission.json evidence."
    });
    return invalidAdmittedPlanAdmission(violations);
  }

  if (looksLikeFailedPlanningResult(value)) {
    violations.push({
      code: "admitted-plan-artifact-failed-planning-result",
      path: "admittedPlan",
      message:
        "Execution admission rejects failed planning results; persist a blocking planning-admission.json artifact instead of passing failed planning output downstream. " +
        `Refusal reason: ${formatRefusalReason(value)}`
    });
  }

  if (looksLikeFailedAdmissionResult(value)) {
    violations.push({
      code: "admitted-plan-artifact-failed-admission-result",
      path: "admittedPlan",
      message:
        "Execution admission rejects failed planning admission results; no admitted-plan execution artifact exists until planning-admission.json allows the candidate plan. " +
        `Refusal reason: ${formatRefusalReason(value)}`
    });
  }

  if (looksLikeBlockedPlanningAdmissionArtifact(value)) {
    const failureState = readPlanningFailureState(value);
    violations.push({
      code: "admitted-plan-artifact-blocked-planning-admission",
      path: "admittedPlan",
      message: `Execution admission rejects blocked planning-admission.json evidence${
        failureState === undefined ? "" : ` (${failureState})`
      }; candidate-to-admitted parsing or admission failed, so no execution artifact exists.`
    });
  }

  if (value["__protostarPlanAdmissionState"] === "candidate-plan") {
    violations.push({
      code: "admitted-plan-artifact-candidate-plan-object",
      path: "admittedPlan.__protostarPlanAdmissionState",
      message:
        "Execution admission rejects candidate PlanGraph objects; pass the admitted plan execution artifact created after planning-admission.json is persisted."
    });
  }

  if (looksLikeRawPlanGraph(value)) {
    violations.push({
      code: "admitted-plan-artifact-raw-plan-object",
      path: "admittedPlan",
      message:
        "Execution admission rejects candidate or raw PlanGraph objects; pass only an admitted-plan artifact reference from planning-admission.json handoff evidence."
    });
  }

  const planId = readRequiredString(value, "planId", "admittedPlan.planId", violations);
  const intentId = readRequiredString(value, "intentId", "admittedPlan.intentId", violations);
  validateAdmittedPlanReference(value, planId, violations);
  validateAdmittedPlanEvidence(value, planId, intentId, violations);
  validateExecutionTasks(value, violations);

  if (violations.length > 0) {
    return invalidAdmittedPlanAdmission(violations);
  }

  return {
    ok: true,
    artifact: value as unknown as AdmittedPlanExecutionArtifact,
    violations: [],
    errors: []
  };
}

export function assertAdmittedPlanExecutionArtifact(
  value: unknown
): asserts value is AdmittedPlanExecutionArtifact {
  const validation = validateAdmittedPlanExecutionArtifact(value);
  if (!validation.ok) {
    throw new Error(`Invalid admitted plan execution artifact: ${validation.errors.join("; ")}`);
  }
}

export function prepareExecutionRun(input: PrepareExecutionRunInput): ExecutionRunPlan {
  assertAdmittedPlanExecutionArtifact(input.admittedPlan);

  return {
    runId: input.runId,
    planId: input.admittedPlan.planId,
    admittedPlan: input.admittedPlan.evidence,
    workspace: input.workspace,
    tasks: input.admittedPlan.tasks.map((task) => ({
      planTaskId: task.planTaskId,
      title: task.title,
      status: "pending",
      dependsOn: task.dependsOn
    }))
  };
}

function validateAdmittedPlanReference(
  value: Record<string, unknown>,
  planId: string | undefined,
  violations: ExecutionAdmittedPlanAdmissionViolation[]
): void {
  const admittedPlan = readRequiredRecord(
    value,
    "admittedPlan",
    "admittedPlan.admittedPlan",
    violations
  );
  if (admittedPlan === undefined) {
    return;
  }

  const admittedPlanId = readRequiredString(
    admittedPlan,
    "planId",
    "admittedPlan.admittedPlan.planId",
    violations
  );
  if (planId !== undefined && admittedPlanId !== undefined && admittedPlanId !== planId) {
    violations.push({
      code: "admitted-plan-artifact-reference-mismatch",
      path: "admittedPlan.admittedPlan.planId",
      message: `Admitted plan reference ${admittedPlanId} must match artifact plan ${planId}.`
    });
  }

  readRequiredString(admittedPlan, "uri", "admittedPlan.admittedPlan.uri", violations);
  requireExactString(
    admittedPlan,
    "pointer",
    "admittedPlan.admittedPlan.pointer",
    "#",
    violations
  );
  requireExactString(
    admittedPlan,
    "sourceOfTruth",
    "admittedPlan.admittedPlan.sourceOfTruth",
    "PlanGraph",
    violations
  );
}

function validateAdmittedPlanEvidence(
  value: Record<string, unknown>,
  planId: string | undefined,
  intentId: string | undefined,
  violations: ExecutionAdmittedPlanAdmissionViolation[]
): void {
  const evidence = readRequiredRecord(value, "evidence", "admittedPlan.evidence", violations);
  if (evidence === undefined) {
    return;
  }

  const evidencePlanId = readRequiredString(
    evidence,
    "planId",
    "admittedPlan.evidence.planId",
    violations
  );
  if (planId !== undefined && evidencePlanId !== undefined && evidencePlanId !== planId) {
    violations.push({
      code: "admitted-plan-artifact-reference-mismatch",
      path: "admittedPlan.evidence.planId",
      message: `Admitted plan evidence ${evidencePlanId} must match artifact plan ${planId}.`
    });
  }

  const evidenceIntentId = readRequiredString(
    evidence,
    "intentId",
    "admittedPlan.evidence.intentId",
    violations
  );
  if (intentId !== undefined && evidenceIntentId !== undefined && evidenceIntentId !== intentId) {
    violations.push({
      code: "admitted-plan-artifact-reference-mismatch",
      path: "admittedPlan.evidence.intentId",
      message: `Admitted plan evidence intent ${evidenceIntentId} must match artifact intent ${intentId}.`
    });
  }

  readRequiredString(evidence, "planGraphUri", "admittedPlan.evidence.planGraphUri", violations);
  requireExactString(
    evidence,
    "planningAdmissionArtifact",
    "admittedPlan.evidence.planningAdmissionArtifact",
    PLANNING_ADMISSION_ARTIFACT_NAME,
    violations
  );
  requireExactString(
    evidence,
    "planningAdmissionUri",
    "admittedPlan.evidence.planningAdmissionUri",
    PLANNING_ADMISSION_ARTIFACT_NAME,
    violations
  );
  requireExactString(
    evidence,
    "validationSource",
    "admittedPlan.evidence.validationSource",
    PLANNING_ADMISSION_ARTIFACT_NAME,
    violations
  );
  requireExactString(
    evidence,
    "proofSource",
    "admittedPlan.evidence.proofSource",
    "PlanGraph",
    violations
  );
}

function validateExecutionTasks(
  value: Record<string, unknown>,
  violations: ExecutionAdmittedPlanAdmissionViolation[]
): void {
  const tasks = value["tasks"];
  if (!Array.isArray(tasks)) {
    violations.push({
      code: "admitted-plan-artifact-missing-field",
      path: "admittedPlan.tasks",
      message: "Admitted plan execution artifact must include a thin execution task list."
    });
    return;
  }

  if (tasks.length === 0) {
    violations.push({
      code: "admitted-plan-artifact-invalid-field",
      path: "admittedPlan.tasks",
      message: "Admitted plan execution artifact must include at least one execution task."
    });
  }

  const taskIds = new Set<string>();
  const taskDependencies: readonly { readonly planTaskId: string; readonly dependsOn: readonly string[] }[] =
    tasks.flatMap((task, taskIndex) => {
      const path = `admittedPlan.tasks.${taskIndex}`;
      if (!isRecord(task)) {
        violations.push({
          code: "admitted-plan-artifact-invalid-field",
          path,
          message: "Admitted plan execution task must be an object."
        });
        return [];
      }

      if (looksLikeRawPlanTask(task)) {
        violations.push({
          code: "admitted-plan-artifact-raw-task-body",
          path,
          message:
            "Execution admission rejects raw PlanGraph task bodies; admitted plan execution artifacts carry only planTaskId, title, and dependsOn."
        });
      }

      const planTaskId = readRequiredString(task, "planTaskId", `${path}.planTaskId`, violations);
      if (planTaskId !== undefined && !planTaskId.startsWith("task-")) {
        violations.push({
          code: "admitted-plan-artifact-invalid-field",
          path: `${path}.planTaskId`,
          message: `Execution task ${planTaskId} must reference a stable task- PlanGraph task id.`
        });
      }
      if (planTaskId !== undefined) {
        taskIds.add(planTaskId);
      }

      readRequiredString(task, "title", `${path}.title`, violations);
      const dependsOn = readRequiredStringArray(task, "dependsOn", `${path}.dependsOn`, violations);
      return planTaskId !== undefined && dependsOn !== undefined
        ? [{ planTaskId, dependsOn }]
        : [];
    });

  for (const task of taskDependencies) {
    for (const [dependencyIndex, dependencyTaskId] of task.dependsOn.entries()) {
      if (!taskIds.has(dependencyTaskId)) {
        violations.push({
          code: "admitted-plan-artifact-reference-mismatch",
          path: `admittedPlan.tasks.${task.planTaskId}.dependsOn.${dependencyIndex}`,
          message: `Execution task ${task.planTaskId} depends on missing admitted task ${dependencyTaskId}.`
        });
      }
    }
  }
}

function readRequiredRecord(
  record: Record<string, unknown>,
  key: string,
  path: string,
  violations: ExecutionAdmittedPlanAdmissionViolation[]
): Record<string, unknown> | undefined {
  const value = record[key];
  if (!isRecord(value)) {
    violations.push({
      code: "admitted-plan-artifact-missing-field",
      path,
      message: `${path} must be an object on an admitted-plan execution artifact.`
    });
    return undefined;
  }
  return value;
}

function readRequiredString(
  record: Record<string, unknown>,
  key: string,
  path: string,
  violations: ExecutionAdmittedPlanAdmissionViolation[]
): string | undefined {
  const value = record[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    violations.push({
      code: "admitted-plan-artifact-missing-field",
      path,
      message: `${path} must be a non-empty string on an admitted-plan execution artifact.`
    });
    return undefined;
  }
  return value;
}

function readRequiredStringArray(
  record: Record<string, unknown>,
  key: string,
  path: string,
  violations: ExecutionAdmittedPlanAdmissionViolation[]
): readonly string[] | undefined {
  const value = record[key];
  if (!Array.isArray(value)) {
    violations.push({
      code: "admitted-plan-artifact-missing-field",
      path,
      message: `${path} must be an array of PlanGraph task ids on an admitted-plan execution artifact.`
    });
    return undefined;
  }

  const values: string[] = [];
  for (const [index, entry] of value.entries()) {
    if (typeof entry !== "string" || entry.trim().length === 0) {
      violations.push({
        code: "admitted-plan-artifact-invalid-field",
        path: `${path}.${index}`,
        message: `${path}.${index} must be a non-empty PlanGraph task id.`
      });
      continue;
    }
    if (!entry.startsWith("task-")) {
      violations.push({
        code: "admitted-plan-artifact-invalid-field",
        path: `${path}.${index}`,
        message: `${path}.${index} must reference a stable task- PlanGraph task id.`
      });
    }
    values.push(entry);
  }

  return values;
}

function requireExactString(
  record: Record<string, unknown>,
  key: string,
  path: string,
  expected: string,
  violations: ExecutionAdmittedPlanAdmissionViolation[]
): void {
  const value = readRequiredString(record, key, path, violations);
  if (value !== undefined && value !== expected) {
    violations.push({
      code: "admitted-plan-artifact-reference-mismatch",
      path,
      message: `${path} must be ${expected}.`
    });
  }
}

function looksLikeRawPlanGraph(value: Record<string, unknown>): boolean {
  return (
    ("createdAt" in value || "strategy" in value || "acceptanceCriteria" in value) &&
    Array.isArray(value["tasks"])
  );
}

function looksLikeRawPlanTask(value: Record<string, unknown>): boolean {
  return (
    "id" in value ||
    "kind" in value ||
    "covers" in value ||
    "requiredCapabilities" in value ||
    "risk" in value
  );
}

function looksLikeFailedPlanningResult(value: Record<string, unknown>): boolean {
  return (
    value["ok"] === false &&
    Array.isArray(value["errors"]) &&
    !("planningAdmission" in value) &&
    !("validation" in value) &&
    !("rejectionReasons" in value)
  );
}

function looksLikeFailedAdmissionResult(value: Record<string, unknown>): boolean {
  return (
    (value["ok"] === false &&
      (isRecord(value["planningAdmission"]) ||
        isRecord(value["validation"]) ||
        Array.isArray(value["rejectionReasons"]) ||
        Array.isArray(value["candidateAdmissionResults"]))) ||
    (value["admitted"] === false &&
      value["admissionStatus"] === "no-plan-admitted" &&
      isRecord(value["validation"]) &&
      Array.isArray(value["rejectionReasons"]))
  );
}

function looksLikeBlockedPlanningAdmissionArtifact(value: Record<string, unknown>): boolean {
  return (
    value["artifact"] === PLANNING_ADMISSION_ARTIFACT_NAME &&
    (value["admitted"] === false ||
      value["decision"] === "block" ||
      value["admissionStatus"] === "no-plan-admitted")
  );
}

function formatRefusalReason(value: Record<string, unknown>): string {
  const failureState = readPlanningFailureState(value) ?? readNestedPlanningFailureState(value);
  const errors = [
    ...readStringErrors(value["errors"]),
    ...readNestedPlanningAdmissionErrors(value)
  ];
  const reason = errors.length > 0 ? errors.join("; ") : "no admitted plan was created";
  return failureState === undefined ? reason : `${failureState}: ${reason}`;
}

function readNestedPlanningFailureState(value: Record<string, unknown>): string | undefined {
  const planningAdmission = value["planningAdmission"];
  return isRecord(planningAdmission) ? readPlanningFailureState(planningAdmission) : undefined;
}

function readNestedPlanningAdmissionErrors(value: Record<string, unknown>): readonly string[] {
  const planningAdmission = value["planningAdmission"];
  return isRecord(planningAdmission) ? readStringErrors(planningAdmission["errors"]) : [];
}

function readStringErrors(value: unknown): readonly string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((error): error is string => typeof error === "string" && error.trim().length > 0);
}

function readPlanningFailureState(value: Record<string, unknown>): string | undefined {
  const details = value["details"];
  if (!isRecord(details)) {
    return undefined;
  }

  const failure = details["failure"];
  if (!isRecord(failure)) {
    return undefined;
  }

  const state = failure["state"];
  return typeof state === "string" && state.trim().length > 0 ? state : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalidAdmittedPlanAdmission(
  violations: readonly ExecutionAdmittedPlanAdmissionViolation[]
): ExecutionAdmittedPlanAdmissionValidation {
  return {
    ok: false,
    violations,
    errors: violations.map((violation) => violation.message)
  };
}

export function runExecutionDryRun(options: ExecutionDryRunOptions): ExecutionDryRunResult {
  const failedTaskIds = new Set(options.failTaskIds ?? []);
  const now = options.now ?? (() => new Date().toISOString());
  const taskStatus = new Map<string, ExecutionDryRunTaskResult>();
  const events: ExecutionLifecycleEvent[] = [];
  const evidence: StageArtifactRef[] = [];

  for (const task of options.execution.tasks) {
    events.push({
      type: "task-pending",
      runId: options.execution.runId,
      planTaskId: task.planTaskId,
      at: now(),
      status: "pending"
    });

    const blockedBy = task.dependsOn.filter((dependencyId) => taskStatus.get(dependencyId)?.status !== "passed");
    if (blockedBy.length > 0) {
      const reason = `Blocked by unresolved or failed dependencies: ${blockedBy.join(", ")}.`;
      const result: ExecutionDryRunTaskResult = {
        ...task,
        status: "blocked",
        evidence: [],
        blockedBy,
        reason
      };
      taskStatus.set(task.planTaskId, result);
      events.push({
        type: "task-blocked",
        runId: options.execution.runId,
        planTaskId: task.planTaskId,
        at: now(),
        status: "blocked",
        blockedBy,
        reason
      });
      continue;
    }

    events.push({
      type: "task-running",
      runId: options.execution.runId,
      planTaskId: task.planTaskId,
      at: now(),
      status: "running"
    });

    if (failedTaskIds.has(task.planTaskId)) {
      const reason = "Injected dry-run failure.";
      const taskEvidence = [taskEvidenceRef(task.planTaskId, "failed")];
      evidence.push(...taskEvidence);
      const result: ExecutionDryRunTaskResult = {
        ...task,
        status: "failed",
        evidence: taskEvidence,
        reason
      };
      taskStatus.set(task.planTaskId, result);
      events.push({
        type: "task-failed",
        runId: options.execution.runId,
        planTaskId: task.planTaskId,
        at: now(),
        status: "failed",
        reason,
        evidence: taskEvidence
      });
      continue;
    }

    const taskEvidence = [taskEvidenceRef(task.planTaskId, "passed")];
    evidence.push(...taskEvidence);
    const result: ExecutionDryRunTaskResult = {
      ...task,
      status: "passed",
      evidence: taskEvidence
    };
    taskStatus.set(task.planTaskId, result);
    events.push({
      type: "task-passed",
      runId: options.execution.runId,
      planTaskId: task.planTaskId,
      at: now(),
      status: "passed",
      evidence: taskEvidence
    });
  }

  const tasks = options.execution.tasks.map((task) => {
    const result = taskStatus.get(task.planTaskId);
    if (!result) {
      throw new Error(`Execution dry run did not produce a result for task ${task.planTaskId}.`);
    }
    return result;
  });

  return {
    runId: options.execution.runId,
    planId: options.execution.planId,
    status: tasks.every((task) => task.status === "passed") ? "passed" : "failed",
    tasks,
    events,
    evidence
  };
}

function taskEvidenceRef(planTaskId: string, status: "passed" | "failed"): StageArtifactRef {
  return {
    stage: "execution",
    kind: status === "passed" ? "dry-run-task-pass" : "dry-run-task-failure",
    uri: `execution-evidence/${planTaskId}.json`,
    description:
      status === "passed"
        ? `Dry-run evidence for completed task ${planTaskId}.`
        : `Dry-run evidence for failed task ${planTaskId}.`
  };
}
