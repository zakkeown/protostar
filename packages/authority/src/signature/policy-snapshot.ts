import { createHash } from "node:crypto";

import type { CapabilityEnvelope } from "@protostar/intent";

import type { RepoPolicy } from "../repo-policy/parse.js";
import { canonicalizeJsonC14nV1 } from "./canonicalize.js";

export interface PolicySnapshot {
  readonly schemaVersion: "1.0.0";
  readonly capturedAt: string;
  readonly policy: object;
  readonly resolvedEnvelope: CapabilityEnvelope;
  readonly repoPolicyHash?: string;
}

export function buildPolicySnapshot(input: {
  readonly capturedAt?: string;
  readonly policy: object;
  readonly resolvedEnvelope: CapabilityEnvelope;
  readonly repoPolicy?: RepoPolicy | object;
}): PolicySnapshot {
  return Object.freeze({
    schemaVersion: "1.0.0",
    capturedAt: input.capturedAt ?? new Date().toISOString(),
    policy: input.policy,
    resolvedEnvelope: input.resolvedEnvelope,
    ...(input.repoPolicy !== undefined ? { repoPolicyHash: hashPolicySnapshot(input.repoPolicy) } : {})
  });
}

export function hashPolicySnapshot(value: unknown): string {
  return createHash("sha256").update(canonicalizeJsonC14nV1(value), "utf8").digest("hex");
}
