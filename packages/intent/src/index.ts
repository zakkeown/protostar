export type IntentId = `intent_${string}`;
export type AcceptanceCriterionId = `ac_${string}`;
export type RiskLevel = "low" | "medium" | "high";

export interface AcceptanceCriterion {
  readonly id: AcceptanceCriterionId;
  readonly statement: string;
  readonly verification: "test" | "review" | "evidence" | "manual";
}

export interface RepoScopeGrant {
  readonly workspace: string;
  readonly path: string;
  readonly access: "read" | "write" | "execute";
}

export interface ToolPermissionGrant {
  readonly tool: string;
  readonly reason: string;
  readonly risk: RiskLevel;
}

export interface FactoryBudget {
  readonly maxUsd?: number;
  readonly maxTokens?: number;
  readonly timeoutMs?: number;
  readonly maxRepairLoops?: number;
}

export interface CapabilityEnvelope {
  readonly repoScopes: readonly RepoScopeGrant[];
  readonly toolPermissions: readonly ToolPermissionGrant[];
  readonly budget: FactoryBudget;
}

export interface ConfirmedIntent {
  readonly id: IntentId;
  readonly title: string;
  readonly problem: string;
  readonly requester: string;
  readonly confirmedAt: string;
  readonly acceptanceCriteria: readonly AcceptanceCriterion[];
  readonly capabilityEnvelope: CapabilityEnvelope;
  readonly constraints: readonly string[];
}

export interface ConfirmedIntentInput {
  readonly id: IntentId;
  readonly title: string;
  readonly problem: string;
  readonly requester: string;
  readonly acceptanceCriteria: readonly AcceptanceCriterion[];
  readonly capabilityEnvelope: CapabilityEnvelope;
  readonly constraints?: readonly string[];
  readonly confirmedAt?: string;
}

export function defineConfirmedIntent(input: ConfirmedIntentInput): ConfirmedIntent {
  if (input.acceptanceCriteria.length === 0) {
    throw new Error("Confirmed intent requires at least one acceptance criterion.");
  }

  return {
    id: input.id,
    title: input.title,
    problem: input.problem,
    requester: input.requester,
    confirmedAt: input.confirmedAt ?? new Date().toISOString(),
    acceptanceCriteria: input.acceptanceCriteria,
    capabilityEnvelope: input.capabilityEnvelope,
    constraints: input.constraints ?? []
  };
}
