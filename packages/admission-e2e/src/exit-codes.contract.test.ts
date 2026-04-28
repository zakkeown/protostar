import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ExitCode } from "@protostar/factory-cli/exit-codes";

describe("ExitCode integer values - Phase 9 Q-03 lock", () => {
  it("pins the public operator CLI exit code taxonomy", () => {
    const expected = [
      ["Success", 0],
      ["GenericError", 1],
      ["UsageOrArgError", 2],
      ["NotFound", 3],
      ["Conflict", 4],
      ["CancelledByOperator", 5],
      ["NotResumable", 6]
    ];

    assert.deepEqual(Object.entries(ExitCode), expected);
    assert.equal(
      JSON.stringify(Object.entries(ExitCode)),
      '[["Success",0],["GenericError",1],["UsageOrArgError",2],["NotFound",3],["Conflict",4],["CancelledByOperator",5],["NotResumable",6]]'
    );
  });
});
