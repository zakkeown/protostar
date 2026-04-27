import type { IntentDraftRepoScopeGrant } from "./models.js";

import { assertTrustedWorkspaceForGrant } from "@protostar/authority";

import type { IntentDraftFieldPath } from "./draft-validation.js";

import type { CapabilityEnvelopeRepoScopeOverage, CapabilityEnvelopeWriteGrantViolation, CapabilityEnvelopeWriteGrantViolationCode, EvaluateRepoScopeAdmissionInput, IntentAdmissionPolicyFinding, RepoScopeAdmissionDecision, RepoScopeAdmissionReasonCode, RepoScopeAdmissionResult, RepoScopeAdmissionVerdict, ValidateCapabilityEnvelopeRepoScopesInput, ValidateCapabilityEnvelopeWriteGrantsInput, ValidateCapabilityEnvelopeWriteGrantsResult } from "./promotion-contracts.js";

import { authorityJustificationField, isKnownGoalArchetype, isRepoAccess, normalizeAuthorityJustification, normalizeText, uniqueOrdered } from "./admission-shared.js";

import { ARCHETYPE_POLICY_TABLE } from "./archetypes.js";

import type { GoalArchetype, GoalArchetypePolicyEntry, GoalArchetypeRepoScopePolicy, RepoAccessLevel } from "./archetypes.js";

export function validateCapabilityEnvelopeRepoScopes(
  input: ValidateCapabilityEnvelopeRepoScopesInput
): readonly IntentAdmissionPolicyFinding[] {
  return evaluateRepoScopeAdmission(input).results
    .filter((result) => result.decision === "deny" && result.severity === "ambiguity")
    .map((result) => ({
      code: "repo-authority-overage",
      fieldPath: result.fieldPath,
      severity: "ambiguity",
      message: result.message,
      overridable: result.overridable,
      overridden: result.overridden,
      ...authorityJustificationField(result.authorityJustification),
      ambiguityDimension: "constraints",
      reasonCode: result.reasonCode,
      ...(result.writeGrantViolationCode !== undefined
        ? { writeGrantViolationCode: result.writeGrantViolationCode }
        : {}),
      ...(result.overage !== undefined ? { overage: result.overage } : {})
    }));
}

export function validateCapabilityEnvelopeWriteGrants(
  input: ValidateCapabilityEnvelopeWriteGrantsInput
): ValidateCapabilityEnvelopeWriteGrantsResult {
  const policyTable = input.policyTable ?? ARCHETYPE_POLICY_TABLE;
  const goalArchetype = normalizeText(input.goalArchetype) ?? "";
  const authorityJustification = normalizeAuthorityJustification(input.capabilityEnvelope);
  const overridden = authorityJustification !== undefined;

  if (!isKnownGoalArchetype(goalArchetype)) {
    const message = goalArchetype.length === 0
      ? "Write-grant admission cannot select a policy row because goalArchetype is missing."
      : `Write-grant admission cannot select a policy row for unknown goalArchetype '${goalArchetype}'.`;

    return {
      ok: false,
      goalArchetype,
      violations: [
        createCapabilityEnvelopeWriteGrantViolation({
          code: "write_grant_unknown_archetype",
          reasonCode: "repo_scope_unknown_archetype",
          goalArchetype,
          fieldPath: "goalArchetype",
          severity: "block",
          message,
          overridable: false,
          overridden: false,
          requestedAccess: "write",
          allowedAccess: []
        })
      ]
    };
  }

  const policy = policyTable[goalArchetype];
  const repoScopes = input.capabilityEnvelope?.repoScopes;
  if (!Array.isArray(repoScopes) || repoScopes.length === 0) {
    return {
      ok: true,
      goalArchetype,
      violations: []
    };
  }

  const violations = repoScopes.flatMap((scope, index): readonly CapabilityEnvelopeWriteGrantViolation[] => {
    if (scope.access !== "write") {
      return [];
    }

    return evaluateSingleCapabilityEnvelopeWriteGrant({
      scope,
      index,
      goalArchetype,
      policy,
      overridden,
      authorityJustification
    });
  });

  return {
    ok: violations.length === 0,
    goalArchetype,
    violations
  };
}

export function evaluateRepoScopeAdmission(input: EvaluateRepoScopeAdmissionInput): RepoScopeAdmissionDecision {
  const policyTable = input.policyTable ?? ARCHETYPE_POLICY_TABLE;
  const goalArchetype = normalizeText(input.goalArchetype) ?? "";
  const authorityJustification = normalizeAuthorityJustification(input.capabilityEnvelope);
  const overridden = authorityJustification !== undefined;

  if (!isKnownGoalArchetype(goalArchetype)) {
    return createRepoScopeAdmissionDecision(goalArchetype, [
      createRepoScopeAdmissionResult({
        decision: "deny",
        kind: "unknown",
        reasonCode: "repo_scope_unknown_archetype",
        fieldPath: "goalArchetype",
        message: goalArchetype.length === 0
          ? "Repository scope admission cannot select a policy row because goalArchetype is missing."
          : `Repository scope admission cannot select a policy row for unknown goalArchetype '${goalArchetype}'.`,
        severity: "block",
        overridable: false,
        overridden: false
      })
    ]);
  }

  const policy = policyTable[goalArchetype];
  const repoScopes = input.capabilityEnvelope?.repoScopes;
  if (!Array.isArray(repoScopes) || repoScopes.length === 0) {
    return createRepoScopeAdmissionDecision(goalArchetype, [
      createRepoScopeAdmissionResult({
        decision: "deny",
        kind: "missing",
        reasonCode: "repo_scope_missing",
        fieldPath: "capabilityEnvelope.repoScopes",
        message: `Repository scope admission denied for ${goalArchetype}: at least one repo scope is required.`,
        severity: "block",
        overridable: false,
        overridden: false
      })
    ]);
  }

  const results = repoScopes.flatMap((scope, index): readonly RepoScopeAdmissionResult[] =>
    evaluateSingleRepoScopeAdmission({
      scope,
      index,
      goalArchetype,
      policy,
      overridden,
      authorityJustification,
      workspaceTrust: input.workspaceTrust
    })
  );

  return createRepoScopeAdmissionDecision(goalArchetype, results);
}

function evaluateSingleRepoScopeAdmission(input: {
  readonly scope: IntentDraftRepoScopeGrant;
  readonly index: number;
  readonly goalArchetype: GoalArchetype;
  readonly policy: GoalArchetypePolicyEntry;
  readonly overridden: boolean;
  readonly authorityJustification: string | undefined;
  readonly workspaceTrust: Readonly<Record<string, "trusted" | "untrusted">> | undefined;
}): readonly RepoScopeAdmissionResult[] {
  const { scope, index, goalArchetype, policy, overridden, authorityJustification, workspaceTrust } = input;
  const scopePath = `capabilityEnvelope.repoScopes.${index}` as IntentDraftFieldPath;
  const workspace = normalizeText(scope.workspace);
  const path = normalizeText(scope.path);
  const access = scope.access;
  const results: RepoScopeAdmissionResult[] = [];

  if (workspace === undefined) {
    results.push(
      createRepoScopeAdmissionResult({
        decision: "deny",
        kind: "missing",
        reasonCode: "repo_scope_missing",
        fieldPath: `${scopePath}.workspace` as IntentDraftFieldPath,
        message: `Repository scope ${index + 1} is missing a workspace.`,
        severity: "block",
        overridable: false,
        overridden: false,
        scopeIndex: index
      })
    );
  }

  if (path === undefined) {
    results.push(
      createRepoScopeAdmissionResult({
        decision: "deny",
        kind: "missing",
        reasonCode: "repo_scope_missing",
        fieldPath: `${scopePath}.path` as IntentDraftFieldPath,
        message: `Repository scope ${index + 1} is missing a repository path.`,
        severity: "block",
        overridable: false,
        overridden: false,
        scopeIndex: index
      })
    );
  }

  if (access === undefined) {
    results.push(
      createRepoScopeAdmissionResult({
        decision: "deny",
        kind: "missing",
        reasonCode: "repo_scope_missing",
        fieldPath: `${scopePath}.access` as IntentDraftFieldPath,
        message: `Repository scope ${index + 1} is missing an access level.`,
        severity: "block",
        overridable: false,
        overridden: false,
        scopeIndex: index
      })
    );
  } else if (!isRepoAccess(access)) {
    results.push(
      createRepoScopeAdmissionResult({
        decision: "deny",
        kind: "unknown",
        reasonCode: "repo_scope_unknown_access",
        fieldPath: `${scopePath}.access` as IntentDraftFieldPath,
        message: `Repository scope ${index + 1} uses unknown access '${String(access)}'; expected read, write, or execute.`,
        severity: "block",
        overridable: false,
        overridden: false,
        scopeIndex: index
      })
    );
  } else if (access === "write") {
    results.push(
      ...evaluateSingleCapabilityEnvelopeWriteGrant({
        scope,
        index,
        goalArchetype,
        policy,
        overridden,
        authorityJustification
      }).map(repoScopeAdmissionResultFromWriteGrantViolation)
    );
  } else {
    if (workspace !== undefined && workspaceTrust !== undefined) {
      const declaredTrust = workspaceTrust[workspace];
      if (declaredTrust !== undefined) {
        const trustResult = assertTrustedWorkspaceForGrant({
          workspace: { root: workspace, trust: declaredTrust },
          requestedAccess: access,
          ...(path === "." ? { requestedScope: "workspace" } : {})
        });
        if (!trustResult.ok) {
          results.push(
            createRepoScopeAdmissionResult({
              decision: "deny",
              kind: "disallowed",
              reasonCode: "repo_scope_workspace_trust_refused",
              fieldPath: scopePath,
              severity: "block",
              message: trustResult.evidence.reason,
              overridable: false,
              overridden: false,
              scopeIndex: index
            })
          );
        }
      }
    }

    if (!repoScopeAccessAllowedByPolicy(policy, access)) {
      const fieldPath = `${scopePath}.access` as IntentDraftFieldPath;
      results.push(
        createRepoScopeAdmissionResult({
          decision: "deny",
          kind: "disallowed",
          reasonCode: "repo_scope_disallowed_access",
          fieldPath,
          severity: "ambiguity",
          message: repoScopeDisallowedAccessMessage({
            index,
            access,
            goalArchetype,
            policy,
          }),
          overridable: true,
          overridden,
          ...authorityJustificationField(authorityJustification),
          scopeIndex: index,
          overage: createRepoScopeOverage({
            goalArchetype,
            policy,
            index,
            fieldPath,
            reasonCode: "repo_scope_disallowed_access",
            requestedAccess: access,
            authorityJustification,
            ...(workspace !== undefined ? { workspace } : {}),
            ...(path !== undefined ? { path } : {})
          })
        })
      );
    }

    const pathBoundary = repoScopePathBoundaryForAccess(policy, access);
    if (path !== undefined && !repoScopePathFitsBoundary(path, pathBoundary)) {
      const fieldPath = `${scopePath}.path` as IntentDraftFieldPath;
      results.push(
        createRepoScopeAdmissionResult({
          decision: "deny",
          kind: "disallowed",
          reasonCode: "repo_scope_disallowed_path_boundary",
          fieldPath,
          severity: "ambiguity",
          message: `Repository scope ${index + 1} path '${path}' exceeds the ${goalArchetype} repo-scope path boundary (${pathBoundary}).`,
          overridable: true,
          overridden,
          ...authorityJustificationField(authorityJustification),
          scopeIndex: index,
          overage: createRepoScopeOverage({
            goalArchetype,
            policy,
            index,
            fieldPath,
            reasonCode: "repo_scope_disallowed_path_boundary",
            requestedAccess: access,
            authorityJustification,
            ...(workspace !== undefined ? { workspace } : {}),
            path
          })
        })
      );
    }
  }

  if (results.length > 0) {
    return results;
  }

  return [
    createRepoScopeAdmissionResult({
      decision: "allow",
      kind: "allowed",
      reasonCode: "repo_scope_allowed",
      fieldPath: scopePath,
      message: `Repository scope ${index + 1} is allowed by the ${goalArchetype} policy row.`,
      severity: "allow",
      overridable: false,
      overridden: false,
      scopeIndex: index
    })
  ];
}

function createRepoScopeAdmissionDecision(
  goalArchetype: string,
  results: readonly RepoScopeAdmissionResult[]
): RepoScopeAdmissionDecision {
  const decision: RepoScopeAdmissionVerdict = results.some((result) => result.decision === "deny")
    ? "deny"
    : "allow";

  return {
    decision,
    allowed: decision === "allow",
    goalArchetype,
    reasonCodes: uniqueOrdered(
      results
        .filter((result) => result.decision === decision)
        .map((result) => result.reasonCode)
    ),
    results
  };
}

function createRepoScopeAdmissionResult(
  input: Omit<RepoScopeAdmissionResult, "scopeIndex"> & {
    readonly scopeIndex?: number;
  }
): RepoScopeAdmissionResult {
  const result: Omit<RepoScopeAdmissionResult, "scopeIndex"> = {
    decision: input.decision,
    kind: input.kind,
    reasonCode: input.reasonCode,
    ...(input.writeGrantViolationCode !== undefined
      ? { writeGrantViolationCode: input.writeGrantViolationCode }
      : {}),
    fieldPath: input.fieldPath,
    message: input.message,
    severity: input.severity,
    overridable: input.overridable,
    overridden: input.overridden,
    ...authorityJustificationField(input.authorityJustification),
    ...(input.overage !== undefined ? { overage: input.overage } : {})
  };

  return input.scopeIndex === undefined
    ? result
    : {
        ...result,
        scopeIndex: input.scopeIndex
      };
}

function repoScopeAccessAllowedByPolicy(policy: GoalArchetypePolicyEntry, access: RepoAccessLevel): boolean {
  if (access === "write") {
    return writeGrantAllowedByPolicy(policy);
  }
  if (access === "execute") {
    return policy.allowedRepoScopeValues.includes(access) && policy.executeGrant.allowed;
  }

  return policy.allowedRepoScopeValues.includes(access);
}

function writeGrantAllowedByPolicy(policy: GoalArchetypePolicyEntry): boolean {
  return policy.allowedRepoScopeValues.includes("write") && policy.writeGrant.allowed;
}

function repoScopePathBoundaryForAccess(
  policy: GoalArchetypePolicyEntry,
  access: RepoAccessLevel
): GoalArchetypeRepoScopePolicy["pathBoundary"] {
  if (access === "write") {
    return policy.writeGrant.allowed ? policy.writeGrant.pathBoundary : policy.repo_scope.pathBoundary;
  }
  if (access === "execute") {
    return policy.executeGrant.allowed ? policy.executeGrant.pathBoundary : policy.repo_scope.pathBoundary;
  }

  return policy.repo_scope.pathBoundary;
}

function evaluateSingleCapabilityEnvelopeWriteGrant(input: {
  readonly scope: IntentDraftRepoScopeGrant;
  readonly index: number;
  readonly goalArchetype: GoalArchetype;
  readonly policy: GoalArchetypePolicyEntry;
  readonly overridden: boolean;
  readonly authorityJustification: string | undefined;
}): readonly CapabilityEnvelopeWriteGrantViolation[] {
  const { scope, index, goalArchetype, policy, overridden, authorityJustification } = input;
  const scopePath = `capabilityEnvelope.repoScopes.${index}` as IntentDraftFieldPath;
  const workspace = normalizeText(scope.workspace);
  const path = normalizeText(scope.path);
  const violations: CapabilityEnvelopeWriteGrantViolation[] = [];

  if (!writeGrantAllowedByPolicy(policy)) {
    const fieldPath = `${scopePath}.access` as IntentDraftFieldPath;
    violations.push(
      createCapabilityEnvelopeWriteGrantViolation({
        code: "write_grant_disallowed_scope",
        reasonCode: "repo_scope_disallowed_access",
        goalArchetype,
        fieldPath,
        severity: "ambiguity",
        message: writeGrantDisallowedScopeMessage({
          index,
          goalArchetype,
          policy
        }),
        overridable: true,
        overridden,
        ...authorityJustificationField(authorityJustification),
        scopeIndex: index,
        ...(workspace !== undefined ? { workspace } : {}),
        ...(path !== undefined ? { path } : {}),
        requestedAccess: "write",
        allowedAccess: policy.allowedRepoScopeValues,
        pathBoundary: policy.writeGrant.pathBoundary,
        overage: createRepoScopeOverage({
          goalArchetype,
          policy,
          index,
          fieldPath,
          reasonCode: "repo_scope_disallowed_access",
          writeGrantViolationCode: "write_grant_disallowed_scope",
          requestedAccess: "write",
          authorityJustification,
          ...(workspace !== undefined ? { workspace } : {}),
          ...(path !== undefined ? { path } : {})
        })
      })
    );
  }

  if (path !== undefined && !repoScopePathFitsBoundary(path, policy.writeGrant.pathBoundary)) {
    const fieldPath = `${scopePath}.path` as IntentDraftFieldPath;
    violations.push(
      createCapabilityEnvelopeWriteGrantViolation({
        code: "write_grant_disallowed_path",
        reasonCode: "repo_scope_disallowed_path_boundary",
        goalArchetype,
        fieldPath,
        severity: "ambiguity",
        message:
          `Write grant ${index + 1} path '${path}' exceeds the ${goalArchetype} repo-scope path boundary (${policy.writeGrant.pathBoundary}) for write access.`,
        overridable: true,
        overridden,
        ...authorityJustificationField(authorityJustification),
        scopeIndex: index,
        ...(workspace !== undefined ? { workspace } : {}),
        path,
        requestedAccess: "write",
        allowedAccess: policy.allowedRepoScopeValues,
        pathBoundary: policy.writeGrant.pathBoundary,
        overage: createRepoScopeOverage({
          goalArchetype,
          policy,
          index,
          fieldPath,
          reasonCode: "repo_scope_disallowed_path_boundary",
          writeGrantViolationCode: "write_grant_disallowed_path",
          requestedAccess: "write",
          authorityJustification,
          ...(workspace !== undefined ? { workspace } : {}),
          path
        })
      })
    );
  }

  return violations;
}

function createCapabilityEnvelopeWriteGrantViolation(
  input: CapabilityEnvelopeWriteGrantViolation
): CapabilityEnvelopeWriteGrantViolation {
  return input.scopeIndex === undefined
    ? {
        code: input.code,
        reasonCode: input.reasonCode,
        goalArchetype: input.goalArchetype,
        fieldPath: input.fieldPath,
        severity: input.severity,
        message: input.message,
        overridable: input.overridable,
        overridden: input.overridden,
        ...authorityJustificationField(input.authorityJustification),
        requestedAccess: input.requestedAccess,
        allowedAccess: input.allowedAccess,
        ...(input.pathBoundary !== undefined ? { pathBoundary: input.pathBoundary } : {}),
        ...(input.overage !== undefined ? { overage: input.overage } : {})
      }
    : input;
}

function repoScopeAdmissionResultFromWriteGrantViolation(
  violation: CapabilityEnvelopeWriteGrantViolation
): RepoScopeAdmissionResult {
  return createRepoScopeAdmissionResult({
    decision: "deny",
    kind: violation.severity === "block" ? "unknown" : "disallowed",
    reasonCode: violation.reasonCode,
    writeGrantViolationCode: violation.code,
    fieldPath: violation.fieldPath,
    severity: violation.severity,
    message: violation.message,
    overridable: violation.overridable,
    overridden: violation.overridden,
    ...authorityJustificationField(violation.authorityJustification),
    ...(violation.scopeIndex !== undefined ? { scopeIndex: violation.scopeIndex } : {}),
    ...(violation.overage !== undefined ? { overage: violation.overage } : {})
  });
}

function createRepoScopeOverage(input: {
  readonly goalArchetype: GoalArchetype;
  readonly policy: GoalArchetypePolicyEntry;
  readonly index: number;
  readonly fieldPath: IntentDraftFieldPath;
  readonly reasonCode: RepoScopeAdmissionReasonCode;
  readonly writeGrantViolationCode?: CapabilityEnvelopeWriteGrantViolationCode;
  readonly requestedAccess: RepoAccessLevel;
  readonly authorityJustification: string | undefined;
  readonly workspace?: string;
  readonly path?: string;
}): CapabilityEnvelopeRepoScopeOverage {
  return {
    kind: "repo_scope",
    goalArchetype: input.goalArchetype,
    fieldPath: input.fieldPath,
    authorityJustificationRequired: true,
    overrideFieldPath: "capabilityEnvelope.authorityJustification",
    ...authorityJustificationField(input.authorityJustification),
    scopeIndex: input.index,
    reasonCode: input.reasonCode,
    ...(input.writeGrantViolationCode !== undefined
      ? { writeGrantViolationCode: input.writeGrantViolationCode }
      : {}),
    requested: {
      access: input.requestedAccess,
      ...(input.workspace !== undefined ? { workspace: input.workspace } : {}),
      ...(input.path !== undefined ? { path: input.path } : {})
    },
    allowed: {
      accessLevels: policyAllowedRepoScopeValues(input.policy),
      maxAccess: input.policy.repo_scope.maxAccess,
      pathBoundary: repoScopePathBoundaryForAccess(input.policy, input.requestedAccess),
      writeGrantAllowed: input.policy.writeGrant.allowed,
      executeGrantAllowed: input.policy.executeGrant.allowed
    }
  };
}

function policyAllowedRepoScopeValues(policy: GoalArchetypePolicyEntry): readonly RepoAccessLevel[] {
  return policy.allowedRepoScopeValues;
}

function writeGrantDisallowedScopeMessage(input: {
  readonly index: number;
  readonly goalArchetype: GoalArchetype;
  readonly policy: GoalArchetypePolicyEntry;
}): string {
  const grantStatus = input.policy.writeGrant.allowed ? "enabled" : "disabled";

  return `Write grant ${input.index + 1} requests write access outside the ${input.goalArchetype} write-grant cap; allowed repo-scope values (${input.policy.allowedRepoScopeValues.join(", ")}; cap ${input.policy.repo_scope.maxAccess}). write grant is ${grantStatus}.`;
}

function repoScopeDisallowedAccessMessage(input: {
  readonly index: number;
  readonly access: RepoAccessLevel;
  readonly goalArchetype: GoalArchetype;
  readonly policy: GoalArchetypePolicyEntry;
}): string {
  const grant = input.access === "write"
    ? input.policy.writeGrant
    : input.access === "execute"
      ? input.policy.executeGrant
      : undefined;
  const grantSummary = grant === undefined
    ? ""
    : ` ${grant.access} grant is ${grant.allowed ? "enabled" : "disabled"}.`;

  return `Repository scope ${input.index + 1} requests ${input.access} access outside the ${input.goalArchetype} allowed repo-scope values (${input.policy.allowedRepoScopeValues.join(", ")}; cap ${input.policy.repo_scope.maxAccess}).${grantSummary}`;
}

function repoScopePathFitsBoundary(
  path: string,
  boundary: GoalArchetypeRepoScopePolicy["pathBoundary"]
): boolean {
  if (!isRepositoryRelativePath(path)) {
    return false;
  }

  if (boundary === "bounded") {
    return !isRepositoryRootPath(path) && !containsWildcardPathSegment(path);
  }

  return true;
}

function isRepositoryRelativePath(path: string): boolean {
  const normalizedPath = normalizeRepoScopePath(path);

  if (normalizedPath.length === 0 || normalizedPath.startsWith("/") || normalizedPath.startsWith("~")) {
    return false;
  }
  if (/^[a-zA-Z]:\//.test(normalizedPath)) {
    return false;
  }

  return !normalizedPath.split("/").some((segment) => segment === "..");
}

function isRepositoryRootPath(path: string): boolean {
  const normalizedPath = normalizeRepoScopePath(path);

  return normalizedPath === "." || normalizedPath === "./";
}

function containsWildcardPathSegment(path: string): boolean {
  return normalizeRepoScopePath(path).split("/").some((segment) => segment.includes("*"));
}

function normalizeRepoScopePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+/g, "/").trim();
}
