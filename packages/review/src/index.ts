import type { StageArtifactRef } from "@protostar/artifacts";
import type { ExecutionRunPlan } from "@protostar/execution";
import type { PlanGraph } from "@protostar/planning";

export type ReviewVerdict = "pass" | "repair" | "block";
export type ReviewSeverity = "info" | "minor" | "major" | "critical";

export interface ReviewFinding {
  readonly severity: ReviewSeverity;
  readonly summary: string;
  readonly evidence: readonly StageArtifactRef[];
  readonly repairTaskId?: string;
}

export interface ReviewGate {
  readonly planId: string;
  readonly runId: string;
  readonly verdict: ReviewVerdict;
  readonly findings: readonly ReviewFinding[];
}

export function createReviewGate(input: {
  readonly plan: PlanGraph;
  readonly execution: ExecutionRunPlan;
  readonly findings?: readonly ReviewFinding[];
}): ReviewGate {
  const findings = input.findings ?? [];
  const verdict: ReviewVerdict = findings.some((finding) => finding.severity === "critical")
    ? "block"
    : findings.length > 0
      ? "repair"
      : "pass";

  return {
    planId: input.plan.planId,
    runId: input.execution.runId,
    verdict,
    findings
  };
}
