export type MechanicalSummaryVerdict = "pass" | "fail";

export interface MechanicalSummaryFinding {
  readonly ruleId: string;
  readonly severity: string;
  readonly summary: string;
  readonly evidence: readonly {
    readonly stage?: string;
    readonly kind?: string;
    readonly uri: string;
    readonly description?: string;
  }[];
}

export interface ComposeMechanicalSummaryInput {
  readonly verdict: MechanicalSummaryVerdict;
  readonly findings: readonly MechanicalSummaryFinding[];
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

function formatFinding(finding: MechanicalSummaryFinding): string {
  const evidence = finding.evidence[0];
  const evidenceExcerpt = evidence?.description ?? evidence?.uri ?? "none";
  return `- \`${finding.ruleId}\` (${finding.severity}): ${finding.summary}\n  - Evidence: ${evidenceExcerpt}`;
}
