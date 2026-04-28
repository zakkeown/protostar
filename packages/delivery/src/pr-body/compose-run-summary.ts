export interface PrBodyTarget {
  readonly owner: string;
  readonly repo: string;
  readonly baseBranch: string;
}

export interface ComposeRunSummaryInput {
  readonly runId: string;
  readonly prUrl?: string;
  readonly target: PrBodyTarget;
}

export function composeRunSummary(input: ComposeRunSummaryInput): string {
  return `# Protostar Factory Run

- Run: \`${input.runId}\`
- Target: \`${input.target.owner}/${input.target.repo}@${input.target.baseBranch}\`
`;
}
