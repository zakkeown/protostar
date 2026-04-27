// ============================================================================
// PRIVATE SUBPATH — admission-e2e ONLY. NOT a public API.
//
// The ConfirmedIntent brand is a module-private unique-symbol; foreign
// modules cannot name it directly. This subpath re-exports the branded type
// under an obvious witness alias so the admission-e2e contract test can
// type-pin the public mint surface (Plan 06b Task D).
//
// Phase 2 may relocate or remove this file without notice.
// ============================================================================

export type { ConfirmedIntent as ConfirmedIntentBrandWitness } from "../confirmed-intent.js";
