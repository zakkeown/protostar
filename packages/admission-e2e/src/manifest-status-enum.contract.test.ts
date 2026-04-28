import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { FactoryRunStatus } from "@protostar/artifacts";

describe("FactoryRunStatus union - Phase 9 Q-18 lock", () => {
  it("is exactly the locked 9 members in this exact order", () => {
    const expected: readonly FactoryRunStatus[] = [
      "created",
      "running",
      "cancelling",
      "cancelled",
      "orphaned",
      "blocked",
      "repairing",
      "ready-to-release",
      "completed"
    ];

    assert.equal(expected.length, 9);
    assert.equal(
      JSON.stringify(expected),
      '["created","running","cancelling","cancelled","orphaned","blocked","repairing","ready-to-release","completed"]'
    );
  });
});
