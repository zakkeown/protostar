import type { Seed } from "./index.js";

export const cardShadowSeed: Seed = Object.freeze({
  id: "card-shadow",
  intent: "Add a subtle shadow and rounded corners to the card component",
  archetype: "cosmetic-tweak",
  notes: "Targets the intentionally flat card component in the toy repo.",
  acceptanceCriteria: Object.freeze([
    "The card component has a subtle shadow.",
    "The card component has rounded corners."
  ])
});
