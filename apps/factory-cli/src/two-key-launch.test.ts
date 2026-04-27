import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { validateTwoKeyLaunch } from "./two-key-launch.js";

describe("two-key launch validator", () => {
  it("allows untrusted launch without a confirmed intent", () => {
    assert.deepEqual(validateTwoKeyLaunch({ trust: "untrusted" }), { ok: true });
  });

  it("allows untrusted launch with a confirmed intent", () => {
    assert.deepEqual(validateTwoKeyLaunch({ trust: "untrusted", confirmedIntent: "intent.json" }), { ok: true });
  });

  it("refuses trusted launch without a confirmed intent", () => {
    const result = validateTwoKeyLaunch({ trust: "trusted" });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.refusal.missingFlag, "--confirmed-intent");
    }
  });

  it("allows trusted launch with a confirmed intent", () => {
    assert.deepEqual(validateTwoKeyLaunch({ trust: "trusted", confirmedIntent: "intent.json" }), { ok: true });
  });

  it("explains two-key launch in the refusal reason", () => {
    const result = validateTwoKeyLaunch({ trust: "trusted" });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(result.refusal.reason, /two-key launch/);
    }
  });
});
