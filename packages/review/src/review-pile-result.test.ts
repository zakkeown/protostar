import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  assertReviewPileResult,
  parseReviewPileResult,
  type ReviewPileResult
} from "./review-pile-result.js";

describe("review-pile-result", () => {
  it("assertReviewPileResult rejects non-string output", () => {
    assert.throws(
      () => assertReviewPileResult({ output: 42 }),
      /output/
    );
  });

  it("assertReviewPileResult accepts a minimal valid shape", () => {
    const value: unknown = { output: "{}" };
    assertReviewPileResult(value);
    const typed: ReviewPileResult = value;
    assert.equal(typed.output, "{}");
  });

  it("parseReviewPileResult returns ok=false with descriptive error for non-JSON output", () => {
    const result = parseReviewPileResult({ output: "not json" });
    assert.equal(result.ok, false);
    if (result.ok === false) {
      assert.ok(result.errors.some((e) => e.includes("valid JSON")), `expected 'valid JSON' substring; got ${JSON.stringify(result.errors)}`);
    }
  });

  it("parseReviewPileResult returns ok=false when judgeCritiques missing", () => {
    const result = parseReviewPileResult({
      output: JSON.stringify({ aggregateVerdict: "pass" })
    });
    assert.equal(result.ok, false);
    if (result.ok === false) {
      assert.ok(result.errors.some((e) => e.includes("judgeCritiques")));
    }
  });

  it("parseReviewPileResult returns ok=true for valid body with 2 judgeCritiques and aggregateVerdict pass", () => {
    const body = {
      judgeCritiques: [
        {
          judgeId: "j1",
          model: "qwen-a",
          rubric: { quality: 0.8 },
          verdict: "pass",
          rationale: "ok",
          taskRefs: ["t-1"]
        },
        {
          judgeId: "j2",
          model: "qwen-b",
          rubric: { quality: 0.9 },
          verdict: "pass",
          rationale: "ok",
          taskRefs: ["t-1"]
        }
      ],
      aggregateVerdict: "pass"
    };
    const result = parseReviewPileResult({ output: JSON.stringify(body) });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.body.judgeCritiques.length, 2);
      assert.equal(result.body.aggregateVerdict, "pass");
    }
  });

  it("parseReviewPileResult accepts a fenced JSON review body", () => {
    const result = parseReviewPileResult({
      output: [
        "```json",
        JSON.stringify({
          judgeCritiques: [
            {
              judgeId: "review-correctness",
              model: "local",
              rubric: { quality: 1 },
              verdict: "pass",
              rationale: "ok",
              taskRefs: ["t-1"]
            }
          ],
          aggregateVerdict: "pass"
        }),
        "```"
      ].join("\n")
    });

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.body.aggregateVerdict, "pass");
      assert.equal(result.body.judgeCritiques[0]?.judgeId, "review-correctness");
    }
  });

  it("parseReviewPileResult merges role-prefixed broadcast JSON contributions", () => {
    const output = [
      "correctness-reviewer:review-correctness => " +
        JSON.stringify({
          judgeCritiques: [
            {
              judgeId: "review-correctness",
              model: "local",
              rubric: { correctness: 0.4 },
              verdict: "repair",
              rationale: "winning line evidence is weak",
              taskRefs: ["task-a"]
            }
          ],
          aggregateVerdict: "repair"
        }),
      "security-reviewer:review-security => " +
        JSON.stringify({
          judgeCritiques: [
            {
              judgeId: "review-security",
              model: "local",
              rubric: { security: 1 },
              verdict: "pass",
              rationale: "no authority expansion",
              taskRefs: []
            }
          ],
          aggregateVerdict: "pass"
        })
    ].join("\n");

    const result = parseReviewPileResult({ output });

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.body.aggregateVerdict, "repair");
      assert.deepEqual(result.body.judgeCritiques.map((critique) => critique.judgeId), [
        "review-correctness",
        "review-security"
      ]);
    }
  });

  it("parseReviewPileResult round-trips aggregateVerdict 'block'", () => {
    const body = {
      judgeCritiques: [
        {
          judgeId: "j1",
          model: "qwen-a",
          rubric: {},
          verdict: "block",
          rationale: "broken",
          taskRefs: []
        }
      ],
      aggregateVerdict: "block"
    };
    const result = parseReviewPileResult({ output: JSON.stringify(body) });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.body.aggregateVerdict, "block");
    }
  });
});
