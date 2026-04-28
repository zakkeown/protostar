import type { StageArtifactRef } from "@protostar/artifacts";
import {
  composeArtifactList,
  composeFooter,
  composeJudgePanel,
  composeMechanicalSummary,
  composeRepairHistory,
  composeRunSummary,
  validatePrBody,
  type PrBody
} from "@protostar/delivery";
import type { JudgeCritique, ReviewFinding } from "@protostar/review";

export interface DeliveryBodyInput {
  readonly runId: string;
  readonly prUrl?: string;
  readonly target: { readonly owner: string; readonly repo: string; readonly baseBranch: string };
  readonly mechanical: { readonly verdict: "pass" | "fail"; readonly findings: readonly ReviewFinding[] };
  readonly critiques: readonly JudgeCritique[];
  readonly iterations: readonly RepairHistoryIterationLike[];
  readonly artifacts: readonly StageArtifactRef[];
}

export interface AssembledDelivery {
  readonly body: PrBody;
  readonly evidenceComments: readonly EvidenceComment[];
}

export interface EvidenceComment {
  readonly kind: "mechanical-full" | "judge-transcripts" | "repair-history" | "oversized-body-overflow";
  readonly body: PrBody;
}

interface RepairHistoryIterationLike {
  readonly iteration: number;
  readonly mechanicalVerdict: "pass" | "repair" | "block" | "fail";
  readonly modelVerdict: "pass" | "repair" | "block" | "fail";
}

export function assembleDeliveryBody(input: DeliveryBodyInput): AssembledDelivery {
  const sections = buildSections(input);
  const evidenceComments = buildStandardEvidenceComments(sections);
  const fullBody = joinSections([
    sections.runSummary,
    sections.mechanical,
    sections.judgePanel,
    sections.repairHistory,
    sections.artifactList,
    sections.footer
  ]);
  const validatedFullBody = validatePrBody(fullBody);

  if (validatedFullBody.ok) {
    return { body: validatedFullBody.value, evidenceComments };
  }

  if (validatedFullBody.refusal.kind !== "oversized-body") {
    throw new Error(`Delivery body assembly refused: ${validatedFullBody.refusal.kind}`);
  }

  const shorterBody = joinSections([
    sections.runSummary,
    "## Mechanical Review\n\n_Summary moved to PR comment._\n",
    "## Judge Panel\n\n_Summary moved to PR comment._\n",
    "## Repair History\n\n_Summary moved to PR comment._\n",
    sections.artifactList,
    sections.footer
  ]);
  const validatedShorterBody = validatePrBody(shorterBody);
  if (!validatedShorterBody.ok) {
    throw new Error(`Delivery body assembly refused: ${validatedShorterBody.refusal.kind}`);
  }

  return {
    body: validatedShorterBody.value,
    evidenceComments: [
      ...evidenceComments,
      validateEvidenceComment(
        "oversized-body-overflow",
        capOverflowComment(joinSections([sections.mechanical, sections.judgePanel, sections.repairHistory]))
      )
    ]
  };
}

function buildSections(input: DeliveryBodyInput): {
  readonly runSummary: string;
  readonly mechanical: string;
  readonly judgePanel: string;
  readonly repairHistory: string;
  readonly artifactList: string;
  readonly footer: string;
} {
  return {
    runSummary: composeRunSummary({ runId: input.runId, target: input.target, ...(input.prUrl !== undefined ? { prUrl: input.prUrl } : {}) }),
    mechanical: composeMechanicalSummary(input.mechanical),
    judgePanel: composeJudgePanel({ critiques: input.critiques }),
    repairHistory: composeRepairHistory({ iterations: input.iterations }),
    artifactList: composeArtifactList(input.artifacts),
    footer: composeFooter({ screenshotStatus: "deferred-v01" })
  };
}

function buildStandardEvidenceComments(sections: {
  readonly mechanical: string;
  readonly judgePanel: string;
  readonly repairHistory: string;
}): readonly EvidenceComment[] {
  return [
    validateEvidenceComment("mechanical-full", sections.mechanical),
    validateEvidenceComment("judge-transcripts", sections.judgePanel),
    validateEvidenceComment("repair-history", sections.repairHistory)
  ];
}

function validateEvidenceComment(kind: EvidenceComment["kind"], body: string): EvidenceComment {
  const validated = validatePrBody(body);
  if (!validated.ok) {
    throw new Error(`Delivery body assembly refused: ${validated.refusal.kind}`);
  }

  return { kind, body: validated.value };
}

function joinSections(sections: readonly string[]): string {
  return `${sections.map((section) => section.trimEnd()).join("\n\n")}\n`;
}

function capOverflowComment(body: string): string {
  const validated = validatePrBody(body);
  if (validated.ok) {
    return body;
  }

  if (validated.refusal.kind !== "oversized-body") {
    throw new Error(`Delivery body assembly refused: ${validated.refusal.kind}`);
  }

  return `${body.slice(0, 59_000)}\n\n_Overflow comment truncated to fit GitHub body limits._\n`;
}
