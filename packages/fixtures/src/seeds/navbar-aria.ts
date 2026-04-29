import type { Seed } from "./index.js";

export const navbarAriaSeed: Seed = Object.freeze({
  id: "navbar-aria",
  intent: "Add aria-label attributes to nav-bar buttons for accessibility",
  archetype: "cosmetic-tweak",
  notes: "Targets the intentionally under-labeled nav buttons in the toy repo.",
  acceptanceCriteria: Object.freeze([
    "Each nav-bar button has an aria-label attribute.",
    "The aria-label text describes the button action."
  ])
});
