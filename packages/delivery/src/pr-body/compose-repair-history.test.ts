import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { composeRepairHistory } from "./compose-repair-history.js";

describe("composeRepairHistory", () => {
  it("renders the empty repair history state", () => {
    assert.equal(composeRepairHistory({ iterations: [] }), "## Repair History\n\n_No repair iterations._\n");
  });

  it("renders each iteration with mechanical and model verdicts", () => {
    const out = composeRepairHistory({
      iterations: [
        { iteration: 1, mechanicalVerdict: "repair", modelVerdict: "repair" },
        { iteration: 2, mechanicalVerdict: "pass", modelVerdict: "pass" }
      ]
    });

    assert.equal(
      out,
      "## Repair History\n\n1. Iteration 1: mechanical `repair`, model `repair`\n2. Iteration 2: mechanical `pass`, model `pass`\n"
    );
  });
});
