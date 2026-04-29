import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { flattenSeedLibrary, getSeed, listSeedIds, seedLibrary } from "./index.js";

describe("seed library", () => {
  it("exports a frozen per-archetype record", () => {
    assert.equal(Object.isFrozen(seedLibrary), true);
    assert.deepEqual(Object.keys(seedLibrary), [
      "cosmetic-tweak",
      "feature-add",
      "bugfix",
      "refactor"
    ]);
  });

  it("locks the DOG-03 seed intent text verbatim", () => {
    assert.equal(getSeed("button-color-hover").intent, "Change the primary button color and add a hover state");
  });

  it("preserves the ordered Phase 10 cosmetic tweak seed ids", () => {
    const groupedLibrary = seedLibrary as unknown as Record<string, readonly { readonly id: string; readonly archetype: string }[]>;

    assert.deepEqual(
      groupedLibrary["cosmetic-tweak"]?.map((seed) => seed.id),
      ["button-color-hover", "card-shadow", "navbar-aria"]
    );
    assert.deepEqual(
      groupedLibrary["cosmetic-tweak"]?.map((seed) => seed.archetype),
      ["cosmetic-tweak", "cosmetic-tweak", "cosmetic-tweak"]
    );
  });

  it("includes the TTT feature-add seed and empty future archetype groups", () => {
    const groupedLibrary = seedLibrary as unknown as Record<string, readonly { readonly id: string; readonly archetype: string }[]>;

    assert.deepEqual(groupedLibrary["feature-add"]?.map((seed) => seed.id), ["ttt-game"]);
    assert.deepEqual(groupedLibrary.bugfix, []);
    assert.deepEqual(groupedLibrary.refactor, []);
  });

  it("throws with the unknown seed id when a seed is missing", () => {
    assert.throws(() => getSeed("does-not-exist"), /does-not-exist/);
  });

  it("returns a frozen ordered seed id list", () => {
    const ids = listSeedIds();

    assert.deepEqual(ids, ["button-color-hover", "card-shadow", "navbar-aria"]);
    assert.equal(Object.isFrozen(ids), true);
  });

  it("returns frozen ordered seed id lists by archetype", () => {
    const listSeedIdsByArchetype = listSeedIds as (archetype?: string) => readonly string[];
    const ids = listSeedIdsByArchetype("cosmetic-tweak");

    assert.deepEqual(ids, ["button-color-hover", "card-shadow", "navbar-aria"]);
    assert.equal(Object.isFrozen(ids), true);
  });

  it("returns a frozen flattened seed list across archetypes", () => {
    const seeds = flattenSeedLibrary();

    assert.deepEqual(seeds.map((seed) => seed.id), ["button-color-hover", "card-shadow", "navbar-aria", "ttt-game"]);
    assert.equal(Object.isFrozen(seeds), true);
  });

  it("deeply freezes grouped seed arrays and seed objects", () => {
    const groupedLibrary = seedLibrary as unknown as Record<string, readonly unknown[]>;

    assert.equal(Object.isFrozen(groupedLibrary["cosmetic-tweak"]), true);
    assert.equal(Object.isFrozen(groupedLibrary["cosmetic-tweak"]?.[0]), true);
    assert.equal(Object.isFrozen(groupedLibrary["feature-add"]), true);
    assert.equal(Object.isFrozen(groupedLibrary["feature-add"]?.[0]), true);
  });
});
