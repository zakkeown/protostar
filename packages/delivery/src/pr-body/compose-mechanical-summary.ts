import type { ReviewFinding } from "@protostar/review";

export type MechanicalSummaryVerdict = "pass" | "fail";

export interface ComposeMechanicalSummaryInput {
  readonly verdict: MechanicalSummaryVerdict;
  readonly findings: readonly ReviewFinding[];
}

export function composeMechanicalSummary(input: ComposeMechanicalSummaryInput): string {
  if (input.verdict === "pass") {
    return "## Mechanical Review\n\n✅ All checks passed.\n";
  }

  const findings = input.findings.map(formatFinding).join("\n");
  return `## Mechanical Review

❌ Mechanical review failed.

${findings}
`;
}

function formatFinding(finding: ReviewFinding): string {
  const evidence = finding.evidence[0];
  const evidenceExcerpt = evidence?.description ?? evidence?.uri ?? "none";
  return `- \`${finding.ruleId}\` (${finding.severity}): ${finding.summary}\n  - Evidence: ${evidenceExcerpt}`;
}
