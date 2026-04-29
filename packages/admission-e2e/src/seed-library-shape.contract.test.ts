import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { seedLibrary } from "@protostar/fixtures";

type ContractSeed = {
  readonly id?: unknown;
  readonly intent?: unknown;
  readonly archetype?: unknown;
  readonly notes?: unknown;
  readonly acceptanceCriteria?: unknown;
};

const expectedArchetypes = [
  "cosmetic-tweak",
  "feature-add",
  "bugfix",
  "refactor"
] as const;

describe("seed-library feature-add ttt-game shape", () => {
  it("exports a frozen record keyed by every Phase 11 seed archetype", () => {
    assert.equal(Object.isFrozen(seedLibrary), true);
    assert.deepEqual(Object.keys(seedLibrary), expectedArchetypes);
  });

  it("keeps every seed shape complete and aligned with its record key", () => {
    const groupedLibrary = seedLibrary as unknown as Record<string, readonly ContractSeed[]>;

    for (const archetype of expectedArchetypes) {
      const seeds = groupedLibrary[archetype];
      assert.ok(Array.isArray(seeds), `${archetype} should be an array`);
      assert.equal(Object.isFrozen(seeds), true, `${archetype} array should be frozen`);

      for (const seed of seeds) {
        assert.equal(typeof seed.id, "string", `${archetype} seed id`);
        assert.equal(typeof seed.intent, "string", `${archetype} seed intent`);
        assert.equal(typeof seed.notes, "string", `${archetype} seed notes`);
        assert.equal(seed.archetype, archetype);
        assert.ok(Array.isArray(seed.acceptanceCriteria), `${String(seed.id)} acceptanceCriteria`);
      }
    }
  });

  it("includes the feature-add ttt-game seed", () => {
    const groupedLibrary = seedLibrary as unknown as Record<string, readonly ContractSeed[]>;

    assert.deepEqual(groupedLibrary["feature-add"]?.map((seed) => seed.id), ["ttt-game"]);
  });
});
