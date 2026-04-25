import type { FactoryStage } from "@protostar/artifacts";
import type { ConfirmedIntent } from "@protostar/intent";

export interface FactoryAutonomyPolicy {
  readonly allowDarkRun: boolean;
  readonly requiredHumanCheckpoints: readonly FactoryStage[];
  readonly maxAutonomousRisk: "low" | "medium" | "high";
}

export type PolicyVerdict =
  | {
      readonly type: "allow";
      readonly rationale: string;
    }
  | {
      readonly type: "needs-human";
      readonly checkpoint: FactoryStage;
      readonly rationale: string;
    }
  | {
      readonly type: "block";
      readonly rationale: string;
    };

export function authorizeFactoryStart(intent: ConfirmedIntent, policy: FactoryAutonomyPolicy): PolicyVerdict {
  if (!policy.allowDarkRun) {
    return {
      type: "needs-human",
      checkpoint: "intent",
      rationale: "Autonomous factory runs are disabled by policy."
    };
  }

  if (policy.requiredHumanCheckpoints.includes("planning")) {
    return {
      type: "needs-human",
      checkpoint: "planning",
      rationale: "Policy requires a human planning checkpoint before execution."
    };
  }

  const highestToolRisk = intent.capabilityEnvelope.toolPermissions.some((grant) => grant.risk === "high")
    ? "high"
    : intent.capabilityEnvelope.toolPermissions.some((grant) => grant.risk === "medium")
      ? "medium"
      : "low";

  if (riskRank(highestToolRisk) > riskRank(policy.maxAutonomousRisk)) {
    return {
      type: "block",
      rationale: `Capability envelope exceeds autonomous risk limit: ${highestToolRisk}.`
    };
  }

  return {
    type: "allow",
    rationale: "Confirmed intent and capability envelope fit the autonomy policy."
  };
}

function riskRank(risk: "low" | "medium" | "high"): number {
  return risk === "high" ? 3 : risk === "medium" ? 2 : 1;
}
