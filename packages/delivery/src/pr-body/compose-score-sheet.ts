export type ReviewVerdict = "pass" | "repair" | "block";

export interface JudgePanelCritique {
  readonly judgeId: string;
  readonly model: string;
  readonly verdict: ReviewVerdict;
  readonly rationale: string;
  readonly rubric: Readonly<Record<string, number>>;
  readonly taskRefs: readonly string[];
}

const VERDICT_ORDER: Readonly<Record<ReviewVerdict, number>> = {
  block: 0,
  repair: 1,
  pass: 2
};

export function composeScoreSheet(critiques: readonly JudgePanelCritique[]): string {
  if (critiques.length === 0) {
    return "## Judge Panel\n\n_No judge critiques._\n";
  }

  const sorted = [...critiques].sort(
    (a, b) => VERDICT_ORDER[a.verdict] - VERDICT_ORDER[b.verdict] || a.judgeId.localeCompare(b.judgeId)
  );
  const tableRows = sorted.map(formatTableRow).join("\n");
  // Pitfall 8: <details> blocks are siblings of the table, never inside table cells.
  const details = sorted.map(formatDetails).join("\n\n");

  return `## Judge Panel

| Judge | Model | Verdict | Mean Score |
|-------|-------|---------|------------|
${tableRows}

${details}
`;
}

function formatTableRow(critique: JudgePanelCritique): string {
  return `| ${critique.judgeId} | ${critique.model} | ${critique.verdict} | ${meanRubricScore(critique).toFixed(2)} |`;
}

function formatDetails(critique: JudgePanelCritique): string {
  const rubricLines = Object.entries(critique.rubric)
    .map(([name, score]) => `- ${name}: ${score}`)
    .join("\n");

  return `<details>
<summary>${critique.judgeId} rationale</summary>

${critique.rationale}

Rubric:
${rubricLines}
</details>`;
}

function meanRubricScore(critique: JudgePanelCritique): number {
  const scores = Object.values(critique.rubric);
  if (scores.length === 0) {
    return 0;
  }

  return scores.reduce((sum, score) => sum + score, 0) / scores.length;
}
