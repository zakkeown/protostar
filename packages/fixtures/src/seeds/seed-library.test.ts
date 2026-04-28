import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getSeed, listSeedIds, seedLibrary } from "./index.js";

describe("seed library", () => {
  it("exports exactly the three Phase 10 cosmetic tweak seeds", () => {
    assert.equal(seedLibrary.length, 3);
  });

  it("locks the DOG-03 seed intent text verbatim", () => {
    assert.equal(getSeed("button-color-hover").intent, "Change the primary button color and add a hover state");
  });

  it("keeps every seed in the cosmetic-tweak archetype", () => {
    assert.deepEqual(
      seedLibrary.map((seed) => seed.archetype),
      ["cosmetic-tweak", "cosmetic-tweak", "cosmetic-tweak"]
    );
  });

  it("throws with the unknown seed id when a seed is missing", () => {
    assert.throws(() => getSeed("does-not-exist"), /does-not-exist/);
  });

  it("returns a frozen ordered seed id list", () => {
    const ids = listSeedIds();

    assert.deepEqual(ids, ["button-color-hover", "card-shadow", "navbar-aria"]);
    assert.equal(Object.isFrozen(ids), true);
  });

  it("deeply freezes the seed library and seed objects", () => {
    assert.equal(Object.isFrozen(seedLibrary), true);
    assert.equal(Object.isFrozen(seedLibrary[0]), true);
  });
});
