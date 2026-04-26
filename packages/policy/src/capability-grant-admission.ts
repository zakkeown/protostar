import { CAPABILITY_ENVELOPE_BUDGET_LIMIT_FIELDS, TOOL_PERMISSION_LEVELS, validateCapabilityEnvelopeRepairLoopCount } from "@protostar/intent";

import type { CapabilityEnvelopeRepairLoopCountAdmissionFailure, IntentDraftExecuteGrant, IntentDraftFieldPath, IntentDraftToolPermissionGrant, RiskLevel, ToolPermissionLevel } from "@protostar/intent";

import type { CapabilityEnvelopeBudgetCapKey, CapabilityEnvelopeBudgetLimitViolation, CapabilityEnvelopeBudgetOverage, CapabilityEnvelopeExecuteGrantOverage, CapabilityEnvelopeExecuteGrantViolation, CapabilityEnvelopeExecuteGrantViolationCode, CapabilityEnvelopeToolPermissionOverage, CapabilityEnvelopeToolPermissionViolation, CapabilityEnvelopeToolPermissionViolationCode, ValidateCapabilityEnvelopeBudgetLimitsInput, ValidateCapabilityEnvelopeBudgetLimitsResult, ValidateCapabilityEnvelopeExecuteGrantsInput, ValidateCapabilityEnvelopeExecuteGrantsResult, ValidateCapabilityEnvelopeToolPermissionsInput, ValidateCapabilityEnvelopeToolPermissionsResult } from "./admission-contracts.js";

import { ARCHETYPE_POLICY_TABLE } from "./archetypes.js";

import type { GoalArchetype, GoalArchetypeCompatibilityBudgetCaps, GoalArchetypeExecutionScope, GoalArchetypePolicyEntry, GoalArchetypeToolPermissionGrantPolicy, GoalArchetypeToolPermissionLimitsPolicy } from "./archetypes.js";

import { authorityJustificationField, formatAllowedPolicyValues, isKnownGoalArchetype, isRiskLevel, isToolPermissionLevel, normalizeAuthorityJustification, normalizeText, riskRank } from "./shared.js";

export function validateCapabilityEnvelopeExecuteGrants(
  input: ValidateCapabilityEnvelopeExecuteGrantsInput
): ValidateCapabilityEnvelopeExecuteGrantsResult {
  const policyTable = input.policyTable ?? ARCHETYPE_POLICY_TABLE;
  const goalArchetype = normalizeText(input.goalArchetype) ?? "";
  const authorityJustification = normalizeAuthorityJustification(input.capabilityEnvelope);
  const overridden = authorityJustification !== undefined;

  if (!isKnownGoalArchetype(goalArchetype)) {
    const message = goalArchetype.length === 0
      ? "Execute-grant admission cannot select a policy row because goalArchetype is missing."
      : `Execute-grant admission cannot select a policy row for unknown goalArchetype '${goalArchetype}'.`;

    return {
      ok: false,
      goalArchetype,
      violations: [
        createCapabilityEnvelopeExecuteGrantViolation({
          code: "execute_grant_unknown_archetype",
          goalArchetype,
          fieldPath: "goalArchetype",
          severity: "block",
          message,
          overridable: false,
          overridden: false,
          allowedCommands: [],
          allowedExecutionScopes: [],
          executeGrantAllowed: false
        })
      ]
    };
  }

  const executeGrants = input.capabilityEnvelope?.executeGrants;
  if (!Array.isArray(executeGrants) || executeGrants.length === 0) {
    return {
      ok: true,
      goalArchetype,
      violations: []
    };
  }

  const policy = policyTable[goalArchetype];
  const violations = executeGrants.flatMap((grant, index): readonly CapabilityEnvelopeExecuteGrantViolation[] =>
    evaluateSingleCapabilityEnvelopeExecuteGrant({
      grant,
      index,
      goalArchetype,
      policy,
      overridden,
      authorityJustification
    })
  );

  return {
    ok: violations.length === 0,
    goalArchetype,
    violations
  };
}

export function validateCapabilityEnvelopeToolPermissions(
  input: ValidateCapabilityEnvelopeToolPermissionsInput
): ValidateCapabilityEnvelopeToolPermissionsResult {
  const policyTable = input.policyTable ?? ARCHETYPE_POLICY_TABLE;
  const goalArchetype = normalizeText(input.goalArchetype) ?? "";
  const authorityJustification = normalizeAuthorityJustification(input.capabilityEnvelope);
  const overridden = authorityJustification !== undefined;

  if (!isKnownGoalArchetype(goalArchetype)) {
    const message = goalArchetype.length === 0
      ? "Tool-permission admission cannot select a policy row because goalArchetype is missing."
      : `Tool-permission admission cannot select a policy row for unknown goalArchetype '${goalArchetype}'.`;

    return {
      ok: false,
      goalArchetype,
      violations: [
        createCapabilityEnvelopeToolPermissionViolation({
          code: "tool_permission_unknown_archetype",
          goalArchetype,
          fieldPath: "goalArchetype",
          severity: "block",
          message,
          overridable: false,
          overridden: false,
          allowedTools: [],
          allowedRiskLevels: [],
          maxRisk: "low",
          allowedPermissionLevels: [],
          maxPermissionLevel: "read"
        })
      ]
    };
  }

  const toolPermissions = input.capabilityEnvelope?.toolPermissions;
  if (!Array.isArray(toolPermissions) || toolPermissions.length === 0) {
    return {
      ok: true,
      goalArchetype,
      violations: []
    };
  }

  const policy = policyTable[goalArchetype];
  const violations = toolPermissions.flatMap((grant, index): readonly CapabilityEnvelopeToolPermissionViolation[] =>
    evaluateSingleCapabilityEnvelopeToolPermission({
      grant,
      index,
      goalArchetype,
      policy,
      overridden,
      authorityJustification
    })
  );

  return {
    ok: violations.length === 0,
    goalArchetype,
    violations
  };
}

export function validateCapabilityEnvelopeBudgetLimits(
  input: ValidateCapabilityEnvelopeBudgetLimitsInput
): ValidateCapabilityEnvelopeBudgetLimitsResult {
  const policyTable = input.policyTable ?? ARCHETYPE_POLICY_TABLE;
  const goalArchetype = normalizeText(input.goalArchetype) ?? "";
  const authorityJustification = normalizeAuthorityJustification(input.capabilityEnvelope);
  const overridden = authorityJustification !== undefined;

  if (!isKnownGoalArchetype(goalArchetype)) {
    const message = goalArchetype.length === 0
      ? "Budget-limit admission cannot select a policy row because goalArchetype is missing."
      : `Budget-limit admission cannot select a policy row for unknown goalArchetype '${goalArchetype}'.`;

    return {
      ok: false,
      goalArchetype,
      violations: [
        createCapabilityEnvelopeBudgetLimitViolation({
          code: "budget_limit_unknown_archetype",
          goalArchetype,
          fieldPath: "goalArchetype",
          severity: "block",
          message,
          overridable: false,
          overridden: false
        })
      ]
    };
  }

  const policy = policyTable[goalArchetype];
  const capabilityEnvelope = input.capabilityEnvelope;
  const budget = capabilityEnvelope?.budget;
  if (capabilityEnvelope === undefined || budget === undefined) {
    return {
      ok: true,
      goalArchetype,
      violations: []
    };
  }

  const caps = goalArchetypeBudgetCaps(policy);
  const budgetLimitViolations = CAPABILITY_ENVELOPE_BUDGET_LIMIT_FIELDS.flatMap(
    (budgetKey): readonly CapabilityEnvelopeBudgetLimitViolation[] => {
      if (budgetKey === "maxRepairLoops") {
        return [];
      }

      const cap = caps[budgetKey];
      const requested = budget[budgetKey];
      if (
        typeof cap !== "number" ||
        typeof requested !== "number" ||
        !Number.isFinite(requested) ||
        requested <= cap
      ) {
        return [];
      }

      return [
        createCapabilityEnvelopeBudgetLimitViolation({
          code: "budget_limit_exceeds_cap",
          goalArchetype,
          fieldPath: "capabilityEnvelope.budget",
          severity: "ambiguity",
          message: `Budget ${budgetKey} requests ${requested} above the ${goalArchetype} cap of ${cap}.`,
          overridable: true,
          overridden,
          ...authorityJustificationField(authorityJustification),
          budgetKey,
          requestedValue: requested,
          allowedCap: cap,
          overage: createBudgetOverage({
            goalArchetype,
            budgetKey,
            requested,
            cap,
            authorityJustification
          })
        })
      ];
    }
  );
  const repairLoopCountViolations = validateCapabilityEnvelopeRepairLoopCount({
    goalArchetype,
    capabilityEnvelope,
    selectedGoalArchetypePolicy: policy
  }).failures.map((failure) =>
    repairLoopCountFailureBudgetLimitViolation({
      failure,
      goalArchetype,
      authorityJustification,
      overridden
    })
  );
  const violations = [...budgetLimitViolations, ...repairLoopCountViolations];

  return {
    ok: violations.length === 0,
    goalArchetype,
    violations
  };
}

function evaluateSingleCapabilityEnvelopeToolPermission(input: {
  readonly grant: IntentDraftToolPermissionGrant;
  readonly index: number;
  readonly goalArchetype: GoalArchetype;
  readonly policy: GoalArchetypePolicyEntry;
  readonly overridden: boolean;
  readonly authorityJustification: string | undefined;
}): readonly CapabilityEnvelopeToolPermissionViolation[] {
  const { grant, index, goalArchetype, policy, overridden, authorityJustification } = input;
  const grantPath = `capabilityEnvelope.toolPermissions.${index}` as IntentDraftFieldPath;
  const tool = normalizeToolPermissionTool(grant.tool);
  const explicitPermissionLevel = normalizeToolPermissionLevel(explicitToolPermissionLevelValue(grant));
  const permissionLevel = normalizeToolPermissionLevel(toolPermissionLevelValue(grant));
  const violations: CapabilityEnvelopeToolPermissionViolation[] = [];

  if (tool !== undefined && !toolAllowedByPolicy(tool, policy.toolPermissionGrants)) {
    const fieldPath = `${grantPath}.tool` as IntentDraftFieldPath;
    violations.push(
      createCapabilityEnvelopeToolPermissionViolation({
        code: "tool_permission_disallowed_tool",
        goalArchetype,
        fieldPath,
        severity: "ambiguity",
        message: toolPermissionDisallowedToolMessage({
          index,
          tool,
          goalArchetype,
          policy
        }),
        overridable: true,
        overridden,
        ...authorityJustificationField(authorityJustification),
        toolPermissionIndex: index,
        requestedTool: tool,
        ...(isRiskLevel(grant.risk) ? { requestedRisk: grant.risk } : {}),
        ...(explicitPermissionLevel !== undefined ? { requestedPermissionLevel: explicitPermissionLevel } : {}),
        allowedTools: policy.toolPermissionGrants.allowedTools,
        allowedRiskLevels: policy.toolPermissionLimits.allowedRiskLevels,
        maxRisk: policy.toolPermissionLimits.maxRisk,
        allowedPermissionLevels: policy.toolPermissionGrants.allowedPermissionLevels,
        maxPermissionLevel: policy.toolPermissionGrants.maxPermissionLevel,
        overage: createToolPermissionOverage({
          goalArchetype,
          index,
          fieldPath,
          violationCode: "tool_permission_disallowed_tool",
          requested: {
            ...(tool !== undefined ? { tool } : {}),
            ...(isRiskLevel(grant.risk) ? { risk: grant.risk } : {}),
            ...(explicitPermissionLevel !== undefined ? { permissionLevel: explicitPermissionLevel } : {})
          },
          allowed: {
            tools: policy.toolPermissionGrants.allowedTools
          },
          authorityJustification
        })
      })
    );
  }

  if (isRiskLevel(grant.risk) && !toolRiskAllowedByPolicy(grant.risk, policy.toolPermissionLimits)) {
    const fieldPath = `${grantPath}.risk` as IntentDraftFieldPath;
    violations.push(
      createCapabilityEnvelopeToolPermissionViolation({
        code: "tool_permission_disallowed_risk",
        goalArchetype,
        fieldPath,
        severity: "ambiguity",
        message:
          `Tool permission ${index + 1} requests ${grant.risk} risk above the ${goalArchetype} cap of ${policy.toolPermissionLimits.maxRisk}.`,
        overridable: true,
        overridden,
        ...authorityJustificationField(authorityJustification),
        toolPermissionIndex: index,
        ...(tool !== undefined ? { requestedTool: tool } : {}),
        requestedRisk: grant.risk,
        ...(explicitPermissionLevel !== undefined ? { requestedPermissionLevel: explicitPermissionLevel } : {}),
        allowedTools: policy.toolPermissionGrants.allowedTools,
        allowedRiskLevels: policy.toolPermissionLimits.allowedRiskLevels,
        maxRisk: policy.toolPermissionLimits.maxRisk,
        allowedPermissionLevels: policy.toolPermissionGrants.allowedPermissionLevels,
        maxPermissionLevel: policy.toolPermissionGrants.maxPermissionLevel,
        overage: createToolPermissionOverage({
          goalArchetype,
          index,
          fieldPath,
          violationCode: "tool_permission_disallowed_risk",
          requested: {
            ...(tool !== undefined ? { tool } : {}),
            risk: grant.risk,
            ...(explicitPermissionLevel !== undefined ? { permissionLevel: explicitPermissionLevel } : {})
          },
          allowed: {
            riskLevels: policy.toolPermissionLimits.allowedRiskLevels,
            maxRisk: policy.toolPermissionLimits.maxRisk
          },
          authorityJustification
        })
      })
    );
  }

  if (
    permissionLevel !== undefined &&
    !toolPermissionLevelAllowedByPolicy(permissionLevel, policy.toolPermissionGrants)
  ) {
    const fieldPath = toolPermissionLevelFieldPath(grant, index);
    violations.push(
      createCapabilityEnvelopeToolPermissionViolation({
        code: "tool_permission_disallowed_level",
        goalArchetype,
        fieldPath,
        severity: "ambiguity",
        message: toolPermissionDisallowedLevelMessage({
          index,
          permissionLevel,
          goalArchetype,
          policy
        }),
        overridable: true,
        overridden,
        ...authorityJustificationField(authorityJustification),
        toolPermissionIndex: index,
        ...(tool !== undefined ? { requestedTool: tool } : {}),
        ...(isRiskLevel(grant.risk) ? { requestedRisk: grant.risk } : {}),
        requestedPermissionLevel: permissionLevel,
        allowedTools: policy.toolPermissionGrants.allowedTools,
        allowedRiskLevels: policy.toolPermissionLimits.allowedRiskLevels,
        maxRisk: policy.toolPermissionLimits.maxRisk,
        allowedPermissionLevels: policy.toolPermissionGrants.allowedPermissionLevels,
        maxPermissionLevel: policy.toolPermissionGrants.maxPermissionLevel,
        overage: createToolPermissionOverage({
          goalArchetype,
          index,
          fieldPath,
          violationCode: "tool_permission_disallowed_level",
          requested: {
            ...(tool !== undefined ? { tool } : {}),
            ...(isRiskLevel(grant.risk) ? { risk: grant.risk } : {}),
            permissionLevel
          },
          allowed: {
            permissionLevels: policy.toolPermissionGrants.allowedPermissionLevels,
            maxPermissionLevel: policy.toolPermissionGrants.maxPermissionLevel
          },
          authorityJustification
        })
      })
    );
  }

  return violations;
}

function createCapabilityEnvelopeToolPermissionViolation(
  input: CapabilityEnvelopeToolPermissionViolation
): CapabilityEnvelopeToolPermissionViolation {
  return input;
}

function createCapabilityEnvelopeBudgetLimitViolation(
  input: CapabilityEnvelopeBudgetLimitViolation
): CapabilityEnvelopeBudgetLimitViolation {
  return input;
}

function repairLoopCountFailureBudgetLimitViolation(input: {
  readonly failure: CapabilityEnvelopeRepairLoopCountAdmissionFailure;
  readonly goalArchetype: GoalArchetype;
  readonly authorityJustification: string | undefined;
  readonly overridden: boolean;
}): CapabilityEnvelopeBudgetLimitViolation {
  if (input.failure.code === "repair_loop_count_unknown_archetype") {
    return createCapabilityEnvelopeBudgetLimitViolation({
      code: "budget_limit_unknown_archetype",
      goalArchetype: input.goalArchetype,
      fieldPath: "goalArchetype",
      severity: "block",
      message: input.failure.message,
      overridable: false,
      overridden: false
    });
  }

  const requestedValue = input.failure.requestedRepairLoopCount;
  const allowedCap = input.failure.allowedRepairLoopCount;
  if (requestedValue === undefined || allowedCap === undefined) {
    throw new Error("Repair-loop budget violation must include requested and allowed repair-loop counts.");
  }

  return createCapabilityEnvelopeBudgetLimitViolation({
    code: "budget_limit_exceeds_cap",
    goalArchetype: input.goalArchetype,
    fieldPath: "capabilityEnvelope.budget",
    severity: input.failure.severity,
    message: input.failure.message,
    overridable: true,
    overridden: input.overridden,
    ...authorityJustificationField(input.authorityJustification),
    budgetKey: "maxRepairLoops",
    requestedValue,
    allowedCap,
    overage: createBudgetOverage({
      goalArchetype: input.goalArchetype,
      budgetKey: "maxRepairLoops",
      requested: requestedValue,
      cap: allowedCap,
      authorityJustification: input.authorityJustification
    })
  });
}

function evaluateSingleCapabilityEnvelopeExecuteGrant(input: {
  readonly grant: IntentDraftExecuteGrant;
  readonly index: number;
  readonly goalArchetype: GoalArchetype;
  readonly policy: GoalArchetypePolicyEntry;
  readonly overridden: boolean;
  readonly authorityJustification: string | undefined;
}): readonly CapabilityEnvelopeExecuteGrantViolation[] {
  const { grant, index, goalArchetype, policy, overridden, authorityJustification } = input;
  const command = normalizeCommand(grant.command);
  const executionScope = normalizeExecutionScope(grant.scope ?? grant.executionScope);
  const commandFieldPath = `capabilityEnvelope.executeGrants.${index}.command` as IntentDraftFieldPath;
  const scopeFieldPath = executeGrantScopeFieldPath(grant, index);
  const violations: CapabilityEnvelopeExecuteGrantViolation[] = [];

  if (!executeGrantCommandAllowedByPolicy(policy, command)) {
    violations.push(
      createCapabilityEnvelopeExecuteGrantViolation({
        code: "execute_grant_disallowed_command",
        goalArchetype,
        fieldPath: commandFieldPath,
        severity: "ambiguity",
        message: executeGrantDisallowedCommandMessage({
          index,
          command,
          goalArchetype,
          policy
        }),
        overridable: policy.executeGrant.overridable,
        overridden,
        ...authorityJustificationField(authorityJustification),
        executeGrantIndex: index,
        ...(command !== undefined ? { command } : {}),
        ...(executionScope !== undefined ? { executionScope } : {}),
        allowedCommands: policy.executeGrant.allowedCommands,
        allowedExecutionScopes: policy.executeGrant.allowedExecutionScopes,
        executeGrantAllowed: policy.executeGrant.allowed,
        pathBoundary: policy.executeGrant.pathBoundary,
        overage: createExecuteGrantOverage({
          goalArchetype,
          policy,
          index,
          fieldPath: commandFieldPath,
          violationCode: "execute_grant_disallowed_command",
          authorityJustification,
          ...(command !== undefined ? { command } : {}),
          ...(executionScope !== undefined ? { executionScope } : {})
        })
      })
    );
  }

  if (!executeGrantScopeAllowedByPolicy(policy, executionScope)) {
    violations.push(
      createCapabilityEnvelopeExecuteGrantViolation({
        code: "execute_grant_disallowed_scope",
        goalArchetype,
        fieldPath: scopeFieldPath,
        severity: "ambiguity",
        message: executeGrantDisallowedScopeMessage({
          index,
          executionScope,
          goalArchetype,
          policy
        }),
        overridable: policy.executeGrant.overridable,
        overridden,
        ...authorityJustificationField(authorityJustification),
        executeGrantIndex: index,
        ...(command !== undefined ? { command } : {}),
        ...(executionScope !== undefined ? { executionScope } : {}),
        allowedCommands: policy.executeGrant.allowedCommands,
        allowedExecutionScopes: policy.executeGrant.allowedExecutionScopes,
        executeGrantAllowed: policy.executeGrant.allowed,
        pathBoundary: policy.executeGrant.pathBoundary,
        overage: createExecuteGrantOverage({
          goalArchetype,
          policy,
          index,
          fieldPath: scopeFieldPath,
          violationCode: "execute_grant_disallowed_scope",
          authorityJustification,
          ...(command !== undefined ? { command } : {}),
          ...(executionScope !== undefined ? { executionScope } : {})
        })
      })
    );
  }

  return violations;
}

function createCapabilityEnvelopeExecuteGrantViolation(
  input: CapabilityEnvelopeExecuteGrantViolation
): CapabilityEnvelopeExecuteGrantViolation {
  return input;
}

function createExecuteGrantOverage(input: {
  readonly goalArchetype: GoalArchetype;
  readonly policy: GoalArchetypePolicyEntry;
  readonly index: number;
  readonly fieldPath: IntentDraftFieldPath;
  readonly violationCode: CapabilityEnvelopeExecuteGrantViolationCode;
  readonly command?: string;
  readonly executionScope?: GoalArchetypeExecutionScope;
  readonly authorityJustification: string | undefined;
}): CapabilityEnvelopeExecuteGrantOverage {
  return {
    kind: "execute_grant",
    goalArchetype: input.goalArchetype,
    fieldPath: input.fieldPath,
    authorityJustificationRequired: true,
    overrideFieldPath: "capabilityEnvelope.authorityJustification",
    ...authorityJustificationField(input.authorityJustification),
    executeGrantIndex: input.index,
    violationCode: input.violationCode,
    requested: {
      ...(input.command !== undefined ? { command: input.command } : {}),
      ...(input.executionScope !== undefined ? { executionScope: input.executionScope } : {})
    },
    allowed: {
      executeGrantAllowed: input.policy.executeGrant.allowed,
      commands: input.policy.executeGrant.allowedCommands,
      executionScopes: input.policy.executeGrant.allowedExecutionScopes,
      pathBoundary: input.policy.executeGrant.pathBoundary
    }
  };
}

function createToolPermissionOverage(input: {
  readonly goalArchetype: GoalArchetype;
  readonly index: number;
  readonly fieldPath: IntentDraftFieldPath;
  readonly violationCode: CapabilityEnvelopeToolPermissionViolationCode;
  readonly requested: CapabilityEnvelopeToolPermissionOverage["requested"];
  readonly allowed: CapabilityEnvelopeToolPermissionOverage["allowed"];
  readonly authorityJustification: string | undefined;
}): CapabilityEnvelopeToolPermissionOverage {
  return {
    kind: "tool_permission",
    goalArchetype: input.goalArchetype,
    fieldPath: input.fieldPath,
    authorityJustificationRequired: true,
    overrideFieldPath: "capabilityEnvelope.authorityJustification",
    ...authorityJustificationField(input.authorityJustification),
    toolPermissionIndex: input.index,
    ...(input.violationCode === "tool_permission_disallowed_risk"
      ? {}
      : { violationCode: input.violationCode }),
    requested: input.requested,
    allowed: input.allowed
  };
}

function createBudgetOverage(input: {
  readonly goalArchetype: GoalArchetype;
  readonly budgetKey: CapabilityEnvelopeBudgetCapKey;
  readonly requested: number;
  readonly cap: number;
  readonly authorityJustification: string | undefined;
}): CapabilityEnvelopeBudgetOverage {
  return {
    kind: "budget",
    goalArchetype: input.goalArchetype,
    fieldPath: "capabilityEnvelope.budget",
    authorityJustificationRequired: true,
    overrideFieldPath: "capabilityEnvelope.authorityJustification",
    ...authorityJustificationField(input.authorityJustification),
    budgetKey: input.budgetKey,
    requested: {
      key: input.budgetKey,
      value: input.requested
    },
    allowed: {
      key: input.budgetKey,
      cap: input.cap
    }
  };
}

function executeGrantCommandAllowedByPolicy(
  policy: GoalArchetypePolicyEntry,
  command: string | undefined
): boolean {
  if (!policy.executeGrant.allowed || command === undefined) {
    return false;
  }

  return policy.executeGrant.allowedCommands
    .map(normalizeCommand)
    .some((allowedCommand) => allowedCommand === command);
}

function executeGrantScopeAllowedByPolicy(
  policy: GoalArchetypePolicyEntry,
  executionScope: GoalArchetypeExecutionScope | undefined
): boolean {
  if (!policy.executeGrant.allowed || executionScope === undefined) {
    return false;
  }

  return policy.executeGrant.allowedExecutionScopes.includes(executionScope);
}

function normalizeCommand(value: unknown): string | undefined {
  const text = normalizeText(value);
  return text === undefined ? undefined : text.replace(/\s+/g, " ");
}

function normalizeExecutionScope(value: unknown): GoalArchetypeExecutionScope | undefined {
  const text = normalizeText(value)?.toLowerCase().replace(/[_\s]+/g, "-");
  if (text === "bounded" || text === "bounded-path") {
    return "bounded";
  }
  if (text === "workspace" || text === "repository") {
    return text;
  }

  return undefined;
}

function executeGrantScopeFieldPath(
  grant: IntentDraftExecuteGrant,
  index: number
): IntentDraftFieldPath {
  return grant.scope === undefined && grant.executionScope !== undefined
    ? `capabilityEnvelope.executeGrants.${index}.executionScope` as IntentDraftFieldPath
    : `capabilityEnvelope.executeGrants.${index}.scope` as IntentDraftFieldPath;
}

function executeGrantDisallowedCommandMessage(input: {
  readonly index: number;
  readonly command: string | undefined;
  readonly goalArchetype: GoalArchetype;
  readonly policy: GoalArchetypePolicyEntry;
}): string {
  const requested = input.command === undefined ? "missing command" : `'${input.command}'`;
  const allowed = formatAllowedPolicyValues(input.policy.executeGrant.allowedCommands);
  const grantStatus = input.policy.executeGrant.allowed ? "enabled" : "disabled";

  return `Execute grant ${input.index + 1} command ${requested} is outside the ${input.goalArchetype} execute-command cap; allowed commands (${allowed}). execute grant is ${grantStatus}.`;
}

function executeGrantDisallowedScopeMessage(input: {
  readonly index: number;
  readonly executionScope: GoalArchetypeExecutionScope | undefined;
  readonly goalArchetype: GoalArchetype;
  readonly policy: GoalArchetypePolicyEntry;
}): string {
  const requested = input.executionScope === undefined ? "missing scope" : `'${input.executionScope}'`;
  const allowed = formatAllowedPolicyValues(input.policy.executeGrant.allowedExecutionScopes);
  const grantStatus = input.policy.executeGrant.allowed ? "enabled" : "disabled";

  return `Execute grant ${input.index + 1} execution scope ${requested} is outside the ${input.goalArchetype} execute-scope cap; allowed execution scopes (${allowed}; path boundary ${input.policy.executeGrant.pathBoundary}). execute grant is ${grantStatus}.`;
}

function toolRiskAllowedByPolicy(
  risk: RiskLevel,
  limits: GoalArchetypeToolPermissionLimitsPolicy
): boolean {
  return limits.allowedRiskLevels.includes(risk) && riskRank(risk) <= riskRank(limits.maxRisk);
}

function toolAllowedByPolicy(
  tool: string,
  policy: GoalArchetypeToolPermissionGrantPolicy
): boolean {
  const allowedTools = policy.allowedTools.map(normalizeToolPermissionTool).filter(isDefined);

  return allowedTools.includes("*") || allowedTools.includes(tool);
}

function toolPermissionLevelAllowedByPolicy(
  level: ToolPermissionLevel,
  policy: GoalArchetypeToolPermissionGrantPolicy
): boolean {
  return policy.allowedPermissionLevels.includes(level) &&
    toolPermissionLevelRank(level) <= toolPermissionLevelRank(policy.maxPermissionLevel);
}

function normalizeToolPermissionTool(value: unknown): string | undefined {
  return normalizeText(value)?.toLowerCase();
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}

function toolPermissionLevelValue(grant: IntentDraftToolPermissionGrant): unknown {
  return explicitToolPermissionLevelValue(grant) ?? "use";
}

export function explicitToolPermissionLevelValue(grant: IntentDraftToolPermissionGrant): unknown {
  return grant.permissionLevel ?? grant.permission ?? grant.level;
}

export function normalizeToolPermissionLevel(value: unknown): ToolPermissionLevel | undefined {
  const text = normalizeText(value)?.toLowerCase().replace(/[_\s]+/g, "-");

  return isToolPermissionLevel(text) ? text : undefined;
}

export function toolPermissionLevelFieldPath(
  grant: IntentDraftToolPermissionGrant,
  index: number
): IntentDraftFieldPath {
  if (grant.permissionLevel !== undefined) {
    return `capabilityEnvelope.toolPermissions.${index}.permissionLevel` as IntentDraftFieldPath;
  }
  if (grant.permission !== undefined) {
    return `capabilityEnvelope.toolPermissions.${index}.permission` as IntentDraftFieldPath;
  }
  if (grant.level !== undefined) {
    return `capabilityEnvelope.toolPermissions.${index}.level` as IntentDraftFieldPath;
  }

  return `capabilityEnvelope.toolPermissions.${index}.permissionLevel` as IntentDraftFieldPath;
}

function toolPermissionDisallowedToolMessage(input: {
  readonly index: number;
  readonly tool: string;
  readonly goalArchetype: GoalArchetype;
  readonly policy: GoalArchetypePolicyEntry;
}): string {
  return `Tool permission ${input.index + 1} requests tool '${input.tool}' outside the ${input.goalArchetype} tool cap; allowed tools (${formatAllowedPolicyValues(input.policy.toolPermissionGrants.allowedTools)}).`;
}

function toolPermissionDisallowedLevelMessage(input: {
  readonly index: number;
  readonly permissionLevel: ToolPermissionLevel;
  readonly goalArchetype: GoalArchetype;
  readonly policy: GoalArchetypePolicyEntry;
}): string {
  return `Tool permission ${input.index + 1} requests ${input.permissionLevel} permission above the ${input.goalArchetype} permission cap of ${input.policy.toolPermissionGrants.maxPermissionLevel}; allowed levels (${formatAllowedPolicyValues(input.policy.toolPermissionGrants.allowedPermissionLevels)}).`;
}

function toolPermissionLevelRank(level: ToolPermissionLevel): number {
  return TOOL_PERMISSION_LEVELS.indexOf(level);
}

function goalArchetypeBudgetCaps(policy: GoalArchetypePolicyEntry): GoalArchetypeCompatibilityBudgetCaps {
  return {
    ...policy.budgetCaps,
    ...(typeof policy.budgets.maxUsd === "number" ? { maxUsd: policy.budgets.maxUsd } : {}),
    ...(typeof policy.budgets.maxTokens === "number" ? { maxTokens: policy.budgets.maxTokens } : {}),
    timeoutMs: policy.budgets.timeoutMs,
    maxRepairLoops: policy.budgets.repair_loop_count
  };
}
