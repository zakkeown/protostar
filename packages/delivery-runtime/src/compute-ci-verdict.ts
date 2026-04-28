export type CiVerdict = "pass" | "fail" | "pending" | "no-checks-configured";

export interface CiCheckRun {
  readonly name: string;
  readonly status: string;
  readonly conclusion: string | null;
}

const FAILING_CONCLUSIONS = new Set(["failure", "cancelled", "timed_out", "action_required"]);
const PASSING_CONCLUSIONS = new Set(["success", "neutral", "skipped"]);

/**
 * Phase 7 Q-15: compute CI status as an AND over the operator's required-check allowlist.
 */
export function computeCiVerdict(checkRuns: readonly CiCheckRun[], requiredChecks: readonly string[]): CiVerdict {
  if (requiredChecks.length === 0) {
    return "no-checks-configured";
  }

  const requiredRuns: CiCheckRun[] = [];
  for (const requiredName of requiredChecks) {
    const checkRun = checkRuns.find((candidate) => candidate.name === requiredName);
    if (checkRun === undefined) {
      return "pending";
    }
    requiredRuns.push(checkRun);
  }

  if (requiredRuns.some((checkRun) => checkRun.status !== "completed")) {
    return "pending";
  }

  if (requiredRuns.some((checkRun) => checkRun.conclusion !== null && FAILING_CONCLUSIONS.has(checkRun.conclusion))) {
    return "fail";
  }

  if (requiredRuns.every((checkRun) => checkRun.conclusion !== null && PASSING_CONCLUSIONS.has(checkRun.conclusion))) {
    return "pass";
  }

  return "pending";
}
