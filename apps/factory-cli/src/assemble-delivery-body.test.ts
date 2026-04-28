import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { validatePrBody } from "@protostar/delivery";
import type { StageArtifactRef } from "@protostar/artifacts";
import type { JudgeCritique, ReviewFinding } from "@protostar/review";

import { assembleDeliveryBody, type DeliveryBodyInput } from "./assemble-delivery-body.js";

describe("assembleDeliveryBody", () => {
  it("assembles a fitting body in the required composer order with three evidence comments", () => {
    const assembled = assembleDeliveryBody(representativeInput());

    assert.equal(validatePrBody(assembled.body).ok, true);
    assert.deepEqual(assembled.evidenceComments.map((comment) => comment.kind), [
      "mechanical-full",
      "judge-transcripts",
      "repair-history"
    ]);
    assert.equal(
      String(assembled.body),
      `# Protostar Factory Run

- Run: \`run_20260428120000\`
- Target: \`protostar/factory@main\`

## Mechanical Review

❌ Mechanical review failed.

- \`execution-completed\` (major): execution result missing terminal event
  - Evidence: execution-result.json

## Judge Panel

| Judge | Model | Verdict | Mean Score |
|-------|-------|---------|------------|
| judge-a | qwen3 | pass | 4.50 |

<details>
<summary>judge-a rationale</summary>

Looks safe to deliver.

Rubric:
- correctness: 5
- evidence: 4
</details>

## Repair History

1. Iteration 1: mechanical \`repair\`, model \`pass\`

## Artifacts

- \`execution-result.json\`
- \`review-gate.json\`

_Screenshots: deferred until Phase 10 dogfood (toy repo not yet scaffolded)._
`
    );
  });

  it("spills oversized full sections into a fourth evidence comment and leaves summary stubs in the body", () => {
    const bigFinding = "mechanical transcript ".repeat(1000);
    const bigRationale = "review transcript ".repeat(1000);
    const assembled = assembleDeliveryBody(
      representativeInput({
        mechanical: {
          verdict: "fail",
          findings: [
            {
              ruleId: "execution-completed",
              severity: "major",
              summary: bigFinding,
              evidence: [
                {
                  stage: "execution",
                  kind: "execution-result",
                  uri: "execution-result.json",
                  description: "execution-result.json"
                }
              ]
            }
          ]
        },
        critiques: [
          {
            judgeId: "judge-big",
            model: "qwen3",
            verdict: "pass",
            rationale: bigRationale,
            rubric: { correctness: 5 },
            taskRefs: []
          }
        ],
        iterations: Array.from({ length: 550 }, (_, index) => ({
          iteration: index + 1,
          mechanicalVerdict: "repair" as const,
          modelVerdict: "pass" as const
        }))
      })
    );

    assert.equal(validatePrBody(assembled.body).ok, true);
    assert.equal(assembled.evidenceComments.length, 4);
    assert.deepEqual(assembled.evidenceComments.map((comment) => comment.kind), [
      "mechanical-full",
      "judge-transcripts",
      "repair-history",
      "oversized-body-overflow"
    ]);
    assert.match(assembled.body, /## Judge Panel\n\n_Summary moved to PR comment\._/);
    assert.match(assembled.evidenceComments[3]?.body ?? "", /review transcript review transcript/);
  });

  it("renders empty critiques and repair iterations cleanly", () => {
    const assembled = assembleDeliveryBody(
      representativeInput({
        mechanical: { verdict: "pass", findings: [] },
        critiques: [],
        iterations: []
      })
    );

    assert.match(assembled.body, /## Judge Panel\n\n_No judge critiques\._/);
    assert.match(assembled.body, /## Repair History\n\n_No repair iterations\._/);
    assert.equal(assembled.evidenceComments.length, 3);
  });

  it("returns branded PrBody values for body and every evidence comment", () => {
    const assembled = assembleDeliveryBody(representativeInput());

    assert.equal(validatePrBody(assembled.body).ok, true);
    for (const comment of assembled.evidenceComments) {
      assert.equal(validatePrBody(comment.body).ok, true);
    }
  });

  it("throws deterministically when a single evidence comment exceeds the comment body cap", () => {
    assert.throws(
      () =>
        assembleDeliveryBody(
          representativeInput({
            critiques: [
              {
                judgeId: "judge-too-large",
                model: "qwen3",
                verdict: "pass",
                rationale: "x".repeat(61_000),
                rubric: { correctness: 5 },
                taskRefs: []
              }
            ]
          })
        ),
      /Delivery body assembly refused: oversized-body/
    );
  });
});

function representativeInput(overrides: Partial<DeliveryBodyInput> = {}): DeliveryBodyInput {
  const findings: readonly ReviewFinding[] = [
    {
      ruleId: "execution-completed",
      severity: "major",
      summary: "execution result missing terminal event",
      evidence: [
        {
          stage: "execution",
          kind: "execution-result",
          uri: "execution-result.json",
          description: "execution-result.json"
        }
      ]
    }
  ];
  const critiques: readonly JudgeCritique[] = [
    {
      judgeId: "judge-a",
      model: "qwen3",
      verdict: "pass",
      rationale: "Looks safe to deliver.",
      rubric: { correctness: 5, evidence: 4 },
      taskRefs: ["task-1"]
    }
  ];
  const artifacts: readonly StageArtifactRef[] = [
    {
      stage: "execution",
      kind: "execution-result",
      uri: "execution-result.json",
      description: "Execution result"
    },
    {
      stage: "review",
      kind: "review-gate",
      uri: "review-gate.json",
      description: "Review gate"
    }
  ];

  return {
    runId: "run_20260428120000",
    target: { owner: "protostar", repo: "factory", baseBranch: "main" },
    mechanical: { verdict: "fail", findings },
    critiques,
    iterations: [{ iteration: 1, mechanicalVerdict: "repair", modelVerdict: "pass" }],
    artifacts,
    ...overrides
  };
}
