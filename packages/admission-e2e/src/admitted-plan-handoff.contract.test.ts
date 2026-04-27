// Cross-package contract: `assertAdmittedPlanHandoff` is the SOLE function on
// the public `@protostar/planning` surface that returns a value carrying the
// `AdmittedPlan` brand. (Plan 01-07, Q-04, PLAN-A-01.)
//
// Mechanism (load-bearing):
//
//   1. The brand symbol is module-private to `@protostar/planning`. Foreign
//      modules cannot name it.
//   2. We import the branded `AdmittedPlan` type as a witness through the
//      private `@protostar/planning/internal` subpath. This subpath is
//      consumed ONLY by this test — it is not a public API and may relocate
//      in Phase 2 (GOV-06) when runtime signing layers on top.
//   3. `MintingKeys` extracts every public-surface key whose function return
//      contains the `AdmittedPlanBrandWitness` (directly or as an
//      `AdmittedPlanHandoff.plan` field).
//   4. `Equal<MintingKeys, "assertAdmittedPlanHandoff">` is asserted to be
//      `true` at compile time. If a future contributor adds e.g.
//      `createAdmittedPlan(): AdmittedPlan` to the public barrel,
//      `MintingKeys` becomes a union and the `Equal` assertion fails — the
//      contract test fails to typecheck.
//
// VALIDATION SPIKE (record in SUMMARY.md): adding a public
// `createAdmittedPlan` to `packages/planning/src/index.ts` MUST cause
// `pnpm --filter @protostar/admission-e2e build` to fail at
// `_MintSurfacePinned`.

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import * as PlanningPublicApi from "@protostar/planning";
import type { AdmittedPlanBrandWitness } from "@protostar/planning/internal";

type PlanningPublicSurface = typeof PlanningPublicApi;

type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends (<T>() => T extends Y ? 1 : 2) ? true : false;

type Assert<T extends true> = T;

// A function "returns AdmittedPlan" if either:
//   (a) Its return type, intersected with the witness, is non-never
//       (covers a direct `(...): AdmittedPlan` signature), or
//   (b) Its return type is an object with a `plan: AdmittedPlan` field
//       (covers `assertAdmittedPlanHandoff` whose return type is
//       `AdmittedPlanHandoff` containing the branded plan).
type ReturnsAdmittedPlan<K extends keyof PlanningPublicSurface> =
  PlanningPublicSurface[K] extends (...args: never[]) => infer R
    ? [Extract<R, AdmittedPlanBrandWitness>] extends [never]
      ? R extends { readonly plan: AdmittedPlanBrandWitness }
        ? true
        : false
      : true
    : false;

type MintingKeys = {
  [K in keyof PlanningPublicSurface]: ReturnsAdmittedPlan<K> extends true ? K : never;
}[keyof PlanningPublicSurface];

// Compile-time gate. If anything other than `assertAdmittedPlanHandoff`
// surfaces an AdmittedPlan, this fails with "Type 'X' does not satisfy the
// constraint 'true'" and the build refuses.
type _MintSurfacePinned = Assert<Equal<MintingKeys, "assertAdmittedPlanHandoff">>;

const ALLOWED_MINT_KEYS = ["assertAdmittedPlanHandoff"] as const;

describe("admission-e2e: AdmittedPlan mint surface", () => {
  it("exports assertAdmittedPlanHandoff as the sole public mint", () => {
    for (const key of ALLOWED_MINT_KEYS) {
      assert.equal(
        typeof PlanningPublicApi[key],
        "function",
        `Expected @protostar/planning to export ${key} as a function.`
      );
    }
    // Runtime smoke — the type-level check (_MintSurfacePinned) is the
    // load-bearing gate; a passing tsc -b is what proves the contract.
    assert.equal(typeof PlanningPublicApi.assertAdmittedPlanHandoff, "function");
  });
});
