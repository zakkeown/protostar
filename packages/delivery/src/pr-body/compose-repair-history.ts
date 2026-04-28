export type RepairHistoryVerdict = "pass" | "repair" | "block" | "fail";

export interface RepairHistoryIteration {
  readonly iteration: number;
  readonly mechanicalVerdict: RepairHistoryVerdict;
  readonly modelVerdict: RepairHistoryVerdict;
}

export interface ComposeRepairHistoryInput {
  readonly iterations: readonly RepairHistoryIteration[];
}

export function composeRepairHistory(input: ComposeRepairHistoryInput): string {
  if (input.iterations.length === 0) {
    return "## Repair History\n\n_No repair iterations._\n";
  }

  const lines = input.iterations
    .map(
      (iteration, index) =>
        `${index + 1}. Iteration ${iteration.iteration}: mechanical \`${iteration.mechanicalVerdict}\`, model \`${iteration.modelVerdict}\``
    )
    .join("\n");

  return `## Repair History

${lines}
`;
}
