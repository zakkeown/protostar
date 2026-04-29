import type { Seed } from "./index.js";

export const buttonColorHoverSeed: Seed = Object.freeze({
  id: "button-color-hover",
  intent: "Change the primary button color and add a hover state",
  archetype: "cosmetic-tweak",
  notes: "DOG-03 baseline seed with the verbatim 2026-04-24 cosmetic tweak wording.",
  acceptanceCriteria: Object.freeze([
    "The primary button color changes from the baseline style.",
    "The primary button has a visible hover state."
  ])
});
