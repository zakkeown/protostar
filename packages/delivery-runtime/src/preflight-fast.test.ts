import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { preflightDeliveryFast } from "./preflight-fast.js";

describe("preflightDeliveryFast", () => {
  it("reports token-missing when PROTOSTAR_GITHUB_TOKEN is absent", () => {
    assert.deepEqual(preflightDeliveryFast({}), { outcome: "token-missing" });
  });

  it("reports token-missing when PROTOSTAR_GITHUB_TOKEN is empty", () => {
    assert.deepEqual(preflightDeliveryFast({ PROTOSTAR_GITHUB_TOKEN: "" }), { outcome: "token-missing" });
  });

  it("reports token-invalid for malformed tokens", () => {
    assert.deepEqual(preflightDeliveryFast({ PROTOSTAR_GITHUB_TOKEN: "not-a-token" }), {
      outcome: "token-invalid",
      reason: "format"
    });
  });

  it("accepts classic GitHub PAT format", () => {
    assert.deepEqual(preflightDeliveryFast({ PROTOSTAR_GITHUB_TOKEN: "ghp_123456789012345678901234567890123456" }), {
      outcome: "ok",
      tokenSource: "env"
    });
  });

  it("accepts fine-grained GitHub PAT format", () => {
    assert.deepEqual(
      preflightDeliveryFast({
        PROTOSTAR_GITHUB_TOKEN:
          "github_pat_1234567890123456789012_12345678901234567890123456789012345678901234567890123456789"
      }),
      { outcome: "ok", tokenSource: "env" }
    );
  });
});
