import type { JudgeCritique } from "@protostar/review";

import { composeScoreSheet } from "./compose-score-sheet.js";

export interface ComposeJudgePanelInput {
  readonly critiques: readonly JudgeCritique[];
}

export function composeJudgePanel(input: ComposeJudgePanelInput): string {
  return composeScoreSheet(input.critiques);
}
