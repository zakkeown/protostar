import { composeScoreSheet, type JudgePanelCritique } from "./compose-score-sheet.js";

export interface ComposeJudgePanelInput {
  readonly critiques: readonly JudgePanelCritique[];
}

export function composeJudgePanel(input: ComposeJudgePanelInput): string {
  return composeScoreSheet(input.critiques);
}
