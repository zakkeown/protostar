import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { buildBranchName, generateBranchSuffix } from "./branch-template.js";

describe("branch-template", () => {
  it("builds the Q-07 protostar branch name with an explicit suffix", () => {
    assert.equal(
      buildBranchName({
        archetype: "cosmetic-tweak",
        runId: "run_20260428143052",
        suffix: "a3k9z2cd"
      }),
      "protostar/cosmetic-tweak/20260428143052-a3k9z2cd"
    );
  });

  it("leaves run IDs without the run_ prefix unchanged", () => {
    assert.equal(
      buildBranchName({
        archetype: "cosmetic-tweak",
        runId: "20260428143052",
        suffix: "a3k9z2cd"
      }),
      "protostar/cosmetic-tweak/20260428143052-a3k9z2cd"
    );
  });

  it("uses an 8-character lowercase hex suffix by default", () => {
    assert.match(
      buildBranchName({ archetype: "cosmetic-tweak", runId: "run_20260428143052" }),
      /^protostar\/cosmetic-tweak\/20260428143052-[0-9a-f]{8}$/
    );
  });

  it("rejects archetypes outside the lowercase slug alphabet", () => {
    assert.throws(
      () => buildBranchName({ archetype: "Cosmetic_Tweak", runId: "run_20260428143052", suffix: "a3k9z2cd" }),
      /Invalid archetype/
    );
  });

  it("generates only 8-character lowercase hex suffixes across a sample", () => {
    for (let index = 0; index < 100; index += 1) {
      assert.match(generateBranchSuffix(), /^[0-9a-f]{8}$/);
    }
  });

  it("keeps typical generated branches comfortably under the git ref limit", () => {
    const branch = buildBranchName({
      archetype: "cosmetic-tweak",
      runId: "run_20260428143052_intent_delivery_smoke",
      suffix: "a3k9z2cd"
    });

    assert.equal(branch.length < 244, true);
  });
});
