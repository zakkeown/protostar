import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { ReviewFinding } from "@protostar/review";

import { composeMechanicalSummary } from "./compose-mechanical-summary.js";

describe("composeMechanicalSummary", () => {
  it("renders the pass empty state", () => {
    assert.equal(composeMechanicalSummary({ verdict: "pass", findings: [] }), "## Mechanical Review\n\n✅ All checks passed.\n");
  });

  it("renders failing findings with rule and evidence excerpts", () => {
    const findings = [
      {
        ruleId: "execution-completed",
        severity: "critical",
        summary: "Task did not complete",
        evidence: [
          {
            stage: "execution",
            kind: "task-log",
            uri: "runs/r1/execution/task-1.log",
            description: "Task 1 stderr excerpt"
          }
        ]
      },
      {
        ruleId: "task-evidence-present",
        severity: "major",
        summary: "Missing evidence",
        evidence: []
      }
    ] satisfies readonly ReviewFinding[];

    assert.equal(
      composeMechanicalSummary({ verdict: "fail", findings }),
      [
        "## Mechanical Review",
        "",
        "❌ Mechanical review failed.",
        "",
        "- `execution-completed` (critical): Task did not complete",
        "  - Evidence: Task 1 stderr excerpt",
        "- `task-evidence-present` (major): Missing evidence",
        "  - Evidence: none",
        ""
      ].join("\n")
    );
  });
});
