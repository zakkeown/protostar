import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { EVALUATION_RUBRIC_DIMENSIONS, parseEvaluationPileResult } from "./index.js";

const validRubric = {
  acMet: 1,
  codeQuality: 0.9,
  security: 0.8,
  regressionRisk: 0.7,
  releaseReadiness: 0.6
} as const;

function critique(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    judgeId: "judge-a",
    model: "model-a",
    rubric: validRubric,
    verdict: "pass",
    rationale: "Looks ready.",
    ...overrides
  };
}

function parseBody(body: unknown) {
  return parseEvaluationPileResult(JSON.stringify(body));
}

describe("parseEvaluationPileResult", () => {
  it("accepts valid one-critique JSON with the exact rubric keys", () => {
    const result = parseBody({ judgeCritiques: [critique()] });

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.body.judgeCritiques.length, 1);
      assert.deepEqual(Object.keys(result.body.judgeCritiques[0]?.rubric ?? {}), [...EVALUATION_RUBRIC_DIMENSIONS]);
    }
  });

  it("accepts valid two-critique JSON", () => {
    const result = parseBody({
      judgeCritiques: [
        critique({ judgeId: "judge-a" }),
        critique({ judgeId: "judge-b", model: "model-b", verdict: "fail" })
      ]
    });

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.body.judgeCritiques.length, 2);
    }
  });

  it("returns a parse error for malformed JSON", () => {
    const result = parseEvaluationPileResult("not json");

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(result.errors.join("\n"), /JSON\.parse:/);
    }
  });

  it("rejects a root array", () => {
    const result = parseEvaluationPileResult("[]");

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.deepEqual(result.errors, ["root must be object"]);
    }
  });

  it("rejects missing judgeCritiques", () => {
    const result = parseBody({});

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(result.errors.join("\n"), /judgeCritiques must be array/);
    }
  });

  it("rejects a critique missing judgeId", () => {
    const { judgeId: _judgeId, ...missingJudgeId } = critique();
    const result = parseBody({ judgeCritiques: [missingJudgeId] });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(result.errors.join("\n"), /judgeCritiques\[0\]\.judgeId must be string/);
    }
  });

  it("rejects an unknown rubric key", () => {
    const result = parseBody({
      judgeCritiques: [critique({ rubric: { ...validRubric, acmet: 1 } })]
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(result.errors.join("\n"), /unknown rubric key: acmet/);
    }
  });

  it("rejects a missing rubric key", () => {
    const { releaseReadiness: _releaseReadiness, ...missingReleaseReadiness } = validRubric;
    const result = parseBody({ judgeCritiques: [critique({ rubric: missingReleaseReadiness })] });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(result.errors.join("\n"), /missing rubric key: releaseReadiness/);
    }
  });

  it("rejects an out-of-range rubric value", () => {
    const result = parseBody({ judgeCritiques: [critique({ rubric: { ...validRubric, acMet: 1.5 } })] });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(result.errors.join("\n"), /rubric value out of range/);
    }
  });

  it("rejects a non-numeric rubric value", () => {
    const result = parseBody({ judgeCritiques: [critique({ rubric: { ...validRubric, security: "high" } })] });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(result.errors.join("\n"), /rubric value not numeric/);
    }
  });

  it("rejects an invalid verdict", () => {
    const result = parseBody({ judgeCritiques: [critique({ verdict: "maybe" })] });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(result.errors.join("\n"), /verdict must be pass\|fail/);
    }
  });

  it("accepts an empty judgeCritiques array", () => {
    const result = parseBody({ judgeCritiques: [] });

    assert.deepEqual(result, { ok: true, body: { judgeCritiques: [] } });
  });
});
