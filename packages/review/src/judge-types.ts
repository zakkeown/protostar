import type { ReviewVerdict } from "./index.js";

export interface JudgeCritique {
  readonly judgeId: string;
  readonly model: string;
  readonly rubric: Readonly<Record<string, number>>;
  readonly verdict: ReviewVerdict;
  readonly rationale: string;
  readonly taskRefs: readonly string[];
}
