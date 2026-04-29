import { buttonColorHoverSeed } from "./button-color-hover.js";
import { cardShadowSeed } from "./card-shadow.js";
import { tttGameSeed } from "./feature-add/ttt-game.js";
import { navbarAriaSeed } from "./navbar-aria.js";

export type SeedArchetype = "cosmetic-tweak" | "feature-add" | "bugfix" | "refactor";

export interface SeedCapabilityEnvelope {
  readonly budget?: {
    readonly maxRepairLoops?: number;
  };
}

export interface Seed {
  readonly id: string;
  readonly intent: string;
  readonly archetype: SeedArchetype;
  readonly notes: string;
  readonly acceptanceCriteria: readonly string[];
  readonly capabilityEnvelope?: SeedCapabilityEnvelope;
}

export type SeedLibrary = Readonly<Record<SeedArchetype, readonly Seed[]>>;

export const seedLibrary: SeedLibrary = Object.freeze({
  "cosmetic-tweak": freezeSeedArray([
    buttonColorHoverSeed,
    cardShadowSeed,
    navbarAriaSeed
  ]),
  "feature-add": freezeSeedArray([
    tttGameSeed
  ]),
  bugfix: freezeSeedArray([]),
  refactor: freezeSeedArray([])
});

const flattenedSeedLibrary = freezeSeedArray(Object.values(seedLibrary).flat());

const seedIdsByArchetype = Object.freeze({
  "cosmetic-tweak": freezeStringArray(seedLibrary["cosmetic-tweak"].map((seed) => seed.id)),
  "feature-add": freezeStringArray(seedLibrary["feature-add"].map((seed) => seed.id)),
  bugfix: freezeStringArray(seedLibrary.bugfix.map((seed) => seed.id)),
  refactor: freezeStringArray(seedLibrary.refactor.map((seed) => seed.id))
} satisfies Record<SeedArchetype, readonly string[]>);

export function getSeed(id: string): Seed {
  const seed = flattenedSeedLibrary.find((candidate) => candidate.id === id);
  if (seed === undefined) {
    throw new Error(`Unknown seed id: ${id}`);
  }
  return seed;
}

export function listSeedIds(archetype?: SeedArchetype): readonly string[] {
  return seedIdsByArchetype[archetype ?? "cosmetic-tweak"];
}

export function flattenSeedLibrary(): readonly Seed[] {
  return flattenedSeedLibrary;
}

function freezeSeedArray<TSeed extends Seed>(seeds: readonly TSeed[]): readonly TSeed[] {
  return Object.freeze([...seeds]);
}

function freezeStringArray(values: readonly string[]): readonly string[] {
  return Object.freeze([...values]);
}

export { tttGameSeed, tttGameExpectations } from "./feature-add/ttt-game.js";
