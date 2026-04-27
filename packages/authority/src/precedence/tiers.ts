import type { CapabilityEnvelope } from "@protostar/intent";

export type TierName = "confirmed-intent" | "policy" | "repo-policy" | "operator-settings";

export const TIER_PRECEDENCE_ORDER: readonly TierName[] = [
  "confirmed-intent",
  "policy",
  "repo-policy",
  "operator-settings"
] as const;

export type TrustOverride = "trusted" | "untrusted";

export interface TierEnvelope extends CapabilityEnvelope {
  readonly deniedTools?: readonly string[];
  readonly trustOverride?: TrustOverride;
}

export interface TierConstraint {
  readonly tier: TierName;
  readonly envelope: TierEnvelope;
  readonly source: string;
}
