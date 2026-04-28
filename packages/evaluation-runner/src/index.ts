export interface RunEvaluationStagesInput {
  // Real shape lands in Plan 08-06; placeholder accepts unknown to keep skeleton compilable.
  readonly runId: string;
}

export interface RunEvaluationStagesResult {
  readonly placeholder: true;
}

export async function runEvaluationStages(
  _input: RunEvaluationStagesInput
): Promise<RunEvaluationStagesResult> {
  throw new Error(
    "runEvaluationStages not yet wired (Phase 8 Plan 08-06 lands the real implementation)."
  );
}
