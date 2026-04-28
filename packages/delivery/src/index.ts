import type { StageArtifactRef } from "@protostar/artifacts";
import type { ReviewGate } from "@protostar/review";

export * from "./brands.js";
export * from "./delivery-contract.js";
export * from "./evidence-marker.js";
export * from "./pr-body/compose-footer.js";
export * from "./pr-body/compose-judge-panel.js";
export * from "./pr-body/compose-mechanical-summary.js";
export * from "./pr-body/compose-repair-history.js";
export * from "./pr-body/compose-run-summary.js";
export * from "./pr-body/compose-score-sheet.js";
export * from "./refusals.js";
export { isValidGitHubTokenFormat, validateBranchName, validatePrBody, validatePrTitle } from "./brands.js";
export { composeFooter } from "./pr-body/compose-footer.js";
export { composeJudgePanel } from "./pr-body/compose-judge-panel.js";
export { composeMechanicalSummary } from "./pr-body/compose-mechanical-summary.js";
export { composeRepairHistory } from "./pr-body/compose-repair-history.js";
export { composeRunSummary } from "./pr-body/compose-run-summary.js";
export { composeScoreSheet } from "./pr-body/compose-score-sheet.js";
export type { BranchName, PrBody, PrTitle } from "./brands.js";
export { buildEvidenceMarker, parseEvidenceMarker } from "./evidence-marker.js";
export type { DeliveryRefusal } from "./refusals.js";

export type DeliveryChannel = "github-pr";
export type DeliveryPlanStatus = "ready" | "blocked";

export interface LegacyGitHubPrDeliveryPlan {
  readonly channel: DeliveryChannel;
  readonly status: DeliveryPlanStatus;
  readonly runId: string;
  readonly baseBranch: string;
  readonly headBranch: string;
  readonly title: string;
  readonly body: string;
  readonly artifacts: readonly StageArtifactRef[];
  readonly blockedReason?: string;
}

/**
 * @deprecated Phase 7 replaces this review-gate based helper with the
 * DeliveryAuthorization-gated executeDelivery path from @protostar/delivery-runtime.
 */
export function createGitHubPrDeliveryPlanLegacy(input: {
  readonly runId: string;
  readonly reviewGate: ReviewGate;
  readonly baseBranch?: string;
  readonly headBranch?: string;
  readonly title?: string;
}): LegacyGitHubPrDeliveryPlan {
  const baseBranch = input.baseBranch ?? "main";
  const headBranch = input.headBranch ?? `protostar/${input.runId}`;
  const title = input.title ?? `Protostar factory run ${input.runId}`;
  const artifacts = [
    {
      stage: "release",
      kind: "github-pr-delivery-plan",
      uri: "delivery-plan.json",
      description: "Post-approval GitHub PR delivery plan."
    },
    {
      stage: "release",
      kind: "github-pr-body",
      uri: "delivery/pr-body.md",
      description: "GitHub PR body generated from the approved factory run."
    }
  ] satisfies readonly StageArtifactRef[];

  if (input.reviewGate.verdict !== "pass") {
    return {
      channel: "github-pr",
      status: "blocked",
      runId: input.runId,
      baseBranch,
      headBranch,
      title,
      body: createPrBody(input.runId, input.reviewGate),
      artifacts,
      blockedReason: `Review verdict is ${input.reviewGate.verdict}; PR delivery requires pass.`
    };
  }

  return {
    channel: "github-pr",
    status: "ready",
    runId: input.runId,
    baseBranch,
    headBranch,
    title,
    body: createPrBody(input.runId, input.reviewGate),
    artifacts
  };
}

/**
 * @deprecated Plan 07-05 replaces this legacy body with section composers.
 */
function createPrBody(runId: string, reviewGate: ReviewGate): string {
  return [
    `Factory run: ${runId}`,
    "",
    `Review verdict: ${reviewGate.verdict}`,
    `Plan: ${reviewGate.planId}`,
    "",
    "Artifacts:",
    "- manifest.json",
    "- plan.json",
    "- execution-result.json",
    "- review-gate.json",
    "",
    reviewGate.findings.length === 0
      ? "Mechanical review found no blocking or repair findings."
      : "Mechanical review findings remain; delivery is blocked until they are resolved."
  ].join("\n");
}
