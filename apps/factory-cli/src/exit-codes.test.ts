import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ExitCode } from "./exit-codes.js";

describe("ExitCode", () => {
  it("pins the public operator exit-code taxonomy", () => {
    assert.equal(ExitCode.Success, 0);
    assert.equal(ExitCode.GenericError, 1);
    assert.equal(ExitCode.UsageOrArgError, 2);
    assert.equal(ExitCode.NotFound, 3);
    assert.equal(ExitCode.Conflict, 4);
    assert.equal(ExitCode.CancelledByOperator, 5);
    assert.equal(ExitCode.NotResumable, 6);
    assert.equal(Object.keys(ExitCode).length, 7);
  });
});
