import type { FactoryStage } from "@protostar/artifacts";

import type { ConfirmedIntent, FactoryAutonomyPolicy } from "@protostar/intent";

// Re-export for backward-compat policy/index.ts and policy/admission/index.ts barrels.
export { evaluateIntentAmbiguityAdmission } from "@protostar/intent";

export { promoteIntentDraft } from "@protostar/intent";

// Plan 06a (Rule-4 deviation): createAdmissionDecisionArtifact + admission-decision-artifact
// constants and types relocated to @protostar/intent so admission-control.test.ts could
// stay atomic without a workspace dependency cycle. Re-exported here for surface preservation.
export { createAdmissionDecisionArtifact } from "@protostar/intent";

function riskRank(risk: "low" | "medium" | "high"): number {
  return risk === "high" ? 3 : risk === "medium" ? 2 : 1;
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
