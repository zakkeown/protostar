import { buttonColorHoverSeed } from "./button-color-hover.js";
import { cardShadowSeed } from "./card-shadow.js";
import { navbarAriaSeed } from "./navbar-aria.js";

export type SeedArchetype = "cosmetic-tweak";

export interface Seed {
  readonly id: string;
  readonly intent: string;
  readonly archetype: SeedArchetype;
  readonly notes: string;
}

export const seedLibrary = Object.freeze([
  buttonColorHoverSeed,
  cardShadowSeed,
  navbarAriaSeed
] as const);

const seedIds = Object.freeze(seedLibrary.map((seed) => seed.id));

export function getSeed(id: string): Seed {
  const seed = seedLibrary.find((candidate) => candidate.id === id);
  if (seed === undefined) {
    throw new Error(`Unknown seed id: ${id}`);
  }
  return seed;
}

export function listSeedIds(): readonly string[] {
  return seedIds;
}
