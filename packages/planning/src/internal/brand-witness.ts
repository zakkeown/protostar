// PRIVATE SUBPATH — `@protostar/planning/internal`.
//
// This module is consumed ONLY by `@protostar/admission-e2e` for the
// cross-package contract test that pins the AdmittedPlan mint surface
// (Plan 01-07, Q-04). It is NOT a public API. The contract may relocate or
// disappear in Phase 2 (GOV-06) when runtime signing layers on top of the
// brand. Do not import from any other package.
//
// Mechanism: re-exporting the branded `AdmittedPlan` type as a witness
// works because foreign modules cannot construct the type (the underlying
// `unique symbol` brand stays module-private to packages/planning), but
// they CAN ask "is this return type assignable to AdmittedPlan?" through
// the witness alias. That assignment query is exactly what the contract
// test needs to detect "what public functions return AdmittedPlan?".

export type { AdmittedPlan as AdmittedPlanBrandWitness } from "../index.js";
