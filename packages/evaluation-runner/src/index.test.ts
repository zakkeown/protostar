import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { runEvaluationStages } from "./index.js";

describe("@protostar/evaluation-runner barrel", () => {
  it("exports the real runEvaluationStages function", () => {
    assert.equal(typeof runEvaluationStages, "function");
  });
});
