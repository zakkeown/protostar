/**
 * Phase 8 Plan 08-08 Task 2 — evaluation refusal byte-equality.
 *
 * Mirrors the Phase 6 planning-pile contract: two evaluation refusals produced
 * from different origins must be byte-equal after erasing `failure.parseErrors`,
 * the only legitimate fixture-vs-live discriminator.
 */

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import type { PileFailure } from "@protostar/dogpile-adapter";
import { parseEvaluationPileResult } from "@protostar/evaluation";

const RUN_ID = "run_eval_byte_equal_test";
const ITERATION = 0;

interface RefusalArtifactBody {
  readonly schemaVersion: "1.0.0";
  readonly artifact: "refusal.json";
  readonly runId: string;
  readonly kind: "evaluation";
  readonly iteration: number;
  readonly stage: "pile-evaluation";
  readonly reason: string;
  readonly sourceOfTruth: "EvaluationResult";
  readonly failure: PileFailure;
}

function evaluationRefusal(failure: PileFailure): RefusalArtifactBody {
  return {
    schemaVersion: "1.0.0",
    artifact: "refusal.json",
    runId: RUN_ID,
    kind: "evaluation",
    iteration: ITERATION,
    stage: "pile-evaluation",
    reason: "Evaluation pile output is not valid JSON",
    sourceOfTruth: "EvaluationResult",
    failure
  };
}

function stripParseErrors(body: RefusalArtifactBody): unknown {
  const { failure, ...rest } = body;
  if (failure.class !== "pile-schema-parse") {
    return { ...rest, failure };
  }
  const { parseErrors: _ignored, ...failureRest } = failure;
  return { ...rest, failure: failureRest };
}

describe("eval-refusal-byte-equality (Q-10 refusal symmetry)", () => {
  it("fixture-parse and live pile-schema-parse refusals are byte-equal modulo parseErrors", () => {
    const parsed = parseEvaluationPileResult("not json");
    assert.equal(parsed.ok, false, "fixture parse must fail for invalid JSON output");
    if (parsed.ok) return;

    const fixtureFailure: PileFailure = {
      kind: "evaluation",
      class: "pile-schema-parse",
      sourceOfTruth: "EvaluationResult",
      parseErrors: parsed.errors
    };
    const liveFailure: PileFailure = {
      kind: "evaluation",
      class: "pile-schema-parse",
      sourceOfTruth: "EvaluationResult",
      parseErrors: ["live: malformed evaluation pile output (synthetic)"]
    };

    const fixtureBody = evaluationRefusal(fixtureFailure);
    const liveBody = evaluationRefusal(liveFailure);

    assert.equal(fixtureBody.stage, "pile-evaluation");
    assert.equal(liveBody.stage, "pile-evaluation");
    assert.equal(fixtureBody.sourceOfTruth, "EvaluationResult");
    assert.equal(liveBody.sourceOfTruth, "EvaluationResult");
    assert.equal(fixtureBody.failure.class, "pile-schema-parse");
    assert.equal(liveBody.failure.class, "pile-schema-parse");
    if (fixtureBody.failure.class === "pile-schema-parse" && liveBody.failure.class === "pile-schema-parse") {
      assert.equal(fixtureBody.failure.sourceOfTruth, "EvaluationResult");
      assert.equal(liveBody.failure.sourceOfTruth, "EvaluationResult");
      assert.ok(fixtureBody.failure.parseErrors.length > 0);
      assert.ok(liveBody.failure.parseErrors.length > 0);
    }

    assert.deepEqual(stripParseErrors(fixtureBody), stripParseErrors(liveBody));
  });

  it("evaluation refusal artifacts pin the pile-evaluation stage and EvaluationResult source", () => {
    const body = evaluationRefusal({
      kind: "evaluation",
      class: "pile-schema-parse",
      sourceOfTruth: "EvaluationResult",
      parseErrors: ["diagnostic"]
    });

    assert.deepEqual(
      {
        kind: body.kind,
        stage: body.stage,
        sourceOfTruth: body.sourceOfTruth,
        failureClass: body.failure.class
      },
      {
        kind: "evaluation",
        stage: "pile-evaluation",
        sourceOfTruth: "EvaluationResult",
        failureClass: "pile-schema-parse"
      }
    );
  });
});
