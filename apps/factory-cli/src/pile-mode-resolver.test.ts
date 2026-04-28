import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolvePileMode } from "./pile-mode-resolver.js";

describe("resolvePileMode (Q-04 precedence)", () => {
  it("CLI flag wins over config and default", () => {
    assert.equal(
      resolvePileMode("planning", { planningMode: "live" }, { planning: { mode: "fixture" } }),
      "live"
    );
  });

  it("config wins when CLI flag absent", () => {
    assert.equal(
      resolvePileMode("review", {}, { review: { mode: "live" } }),
      "live"
    );
  });

  it('returns "fixture" when both CLI and config absent', () => {
    assert.equal(resolvePileMode("planning", {}, undefined), "fixture");
  });

  it("returns fixture when piles block present but kind unset", () => {
    assert.equal(resolvePileMode("executionCoordination", {}, { planning: { mode: "live" } }), "fixture");
  });

  it("does not crash on undefined CLI flags", () => {
    assert.equal(
      resolvePileMode("executionCoordination", { execCoordMode: undefined }, undefined),
      "fixture"
    );
  });
});
