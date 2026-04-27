import type { CapabilityEnvelope, ConfirmedIntent } from "@protostar/intent";
import type { RepoPolicy, TierConstraint } from "@protostar/authority";

export interface BuildTierConstraintsInput {
  readonly intent: ConfirmedIntent;
  readonly policy: {
    readonly envelope: CapabilityEnvelope;
    readonly source: string;
  };
  readonly repoPolicy: RepoPolicy;
  readonly operatorSettings: {
    readonly envelope: CapabilityEnvelope;
    readonly source: string;
  };
}

export function buildTierConstraints(input: BuildTierConstraintsInput): readonly TierConstraint[] {
  return Object.freeze([
    {
      tier: "confirmed-intent",
      envelope: input.intent.capabilityEnvelope,
      source: `intent:${input.intent.id}`
    },
    {
      tier: "policy",
      envelope: input.policy.envelope,
      source: input.policy.source
    },
    {
      tier: "repo-policy",
      envelope: input.repoPolicy,
      source: ".protostar/repo-policy.json"
    },
    {
      tier: "operator-settings",
      envelope: input.operatorSettings.envelope,
      source: input.operatorSettings.source
    }
  ]);
}
