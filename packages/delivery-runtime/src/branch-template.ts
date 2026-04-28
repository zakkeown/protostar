import { randomBytes } from "node:crypto";

const ARCHETYPE_REGEX = /^[a-z0-9-]+$/;

/**
 * Phase 7 Q-07 branch entropy.
 *
 * Pitfall 10 calls out second-precision runId collisions; 4 random bytes give
 * an 8-character lowercase hex suffix with 32 bits of collision resistance.
 */
export function generateBranchSuffix(): string {
  return randomBytes(4).toString("hex");
}

/**
 * Builds `protostar/{archetype}/{runIdShort}-{suffix}` per Q-07.
 *
 * The returned string is intentionally unbranded; callers mint `BranchName`
 * through `@protostar/delivery` validation before crossing the I/O boundary.
 */
export function buildBranchName(input: {
  readonly archetype: string;
  readonly runId: string;
  readonly suffix?: string;
}): string {
  if (!ARCHETYPE_REGEX.test(input.archetype)) {
    throw new Error(`Invalid archetype "${input.archetype}" - must match ${ARCHETYPE_REGEX.source}`);
  }

  const runIdShort = input.runId.startsWith("run_") ? input.runId.slice(4) : input.runId;
  const suffix = input.suffix ?? generateBranchSuffix();
  return `protostar/${input.archetype}/${runIdShort}-${suffix}`;
}
