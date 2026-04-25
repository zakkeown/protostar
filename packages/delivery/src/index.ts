import type { StageArtifactRef } from "@protostar/artifacts";
import type { ReviewGate } from "@protostar/review";

export type DeliveryChannel = "github-pr";
export type DeliveryPlanStatus = "ready" | "blocked";

export interface GitHubPrDeliveryPlan {
  readonly channel: DeliveryChannel;
  readonly status: DeliveryPlanStatus;
  readonly runId: string;
  readonly baseBranch: string;
  readonly headBranch: string;
  readonly title: string;
  readonly body: string;
  readonly artifacts: readonly StageArtifactRef[];
  readonly command?: readonly string[];
  readonly blockedReason?: string;
}

export function createGitHubPrDeliveryPlan(input: {
  readonly runId: string;
  readonly reviewGate: ReviewGate;
  readonly baseBranch?: string;
  readonly headBranch?: string;
  readonly title?: string;
}): GitHubPrDeliveryPlan {
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
    artifacts,
    command: ["gh", "pr", "create", "--base", baseBranch, "--head", headBranch, "--title", title, "--body-file", "delivery/pr-body.md"]
  };
}

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
