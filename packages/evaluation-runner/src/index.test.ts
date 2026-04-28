import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runEvaluationStages } from "./index.js";

describe("@protostar/evaluation-runner skeleton", () => {
  it("placeholder runEvaluationStages throws until Plan 08-06 wires it", async () => {
    await assert.rejects(
      () => runEvaluationStages({ runId: "test" }),
      /not yet wired/
    );
  });
});
