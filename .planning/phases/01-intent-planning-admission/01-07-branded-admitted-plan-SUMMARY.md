---
phase: 01-intent-planning-admission
plan: 07
subsystem: planning-admission
tags: [admitted-plan, brand, admission-e2e, plan-a-01]
requires:
  - "@protostar/planning AdmittedPlan + assertAdmittedPlanHandoff (Wave 1)"
  - "@protostar/admission-e2e scaffold (Plan 05)"
provides:
  - "Branded AdmittedPlan type — module-private unique-symbol brand"
  - "AdmittedPlanRecord (unbranded structural shape) for upstream callers"
  - "@protostar/planning/internal subpath exposing AdmittedPlanBrandWitness (admission-e2e only)"
  - "Cross-package contract test: assertAdmittedPlanHandoff is the SOLE public mint"
affects:
  - "@protostar/execution admitted-plan-input.contract.ts"
  - "@protostar/review admitted-plan-input.contract.ts"
  - "apps/factory-cli runFactory composition (typed against AdmittedPlanRecord upstream of handoff)"
tech-stack:
  added: []
  patterns:
    - "Unique-symbol branding with module-private mint (PLAN-A-01)"
    - "Witness re-export via private subpath for cross-package type-only assertions"
key-files:
  created:
    - packages/planning/src/admitted-plan-brand.contract.ts
    - packages/planning/src/internal/brand-witness.ts
    - packages/admission-e2e/src/admitted-plan-handoff.contract.test.ts
  modified:
    - packages/planning/src/index.ts
    - packages/planning/src/artifacts/index.ts
    - packages/planning/src/candidate-admitted-plan-boundary.contract.ts
    - packages/planning/src/candidate-plan-admission.test.ts
    - packages/planning/package.json
    - packages/execution/src/admitted-plan-input.contract.ts
    - packages/review/src/admitted-plan-input.contract.ts
    - apps/factory-cli/src/main.ts
decisions:
  - "Brand AdmittedPlan with module-private unique symbol; mint flows only through assertAdmittedPlanHandoff (Q-04)"
  - "Split AdmittedPlan into AdmittedPlanRecord (unbranded structural) + AdmittedPlan (branded) so admitCandidatePlan keeps its existing return shape without leaking the brand"
  - "Mirror Plan 06's planned ConfirmedIntent witness pattern: private @protostar/planning/internal subpath re-exports the branded type as AdmittedPlanBrandWitness, consumed only by admission-e2e contract test"
  - "Use ReturnsAdmittedPlan helper that detects the brand both directly (R contains witness) and indirectly (R has a `plan: witness` field — covers AdmittedPlanHandoff)"
metrics:
  duration: ~30 min
  completed: 2026-04-26
---

# Phase 1 Plan 07: Branded AdmittedPlan Summary

Symmetric front-door hardening: `AdmittedPlan` is now a branded type whose
unique-symbol brand stays module-private to `@protostar/planning`.
`assertAdmittedPlanHandoff` is the SOLE function on the public surface that
mints the brand. Closes the compile-time half of PLAN-A-01.

## What changed

### packages/planning/src/index.ts (load-bearing edit)

```ts
declare const AdmittedPlanBrand: unique symbol;

export interface AdmittedPlanRecord extends PlanGraph {
  readonly __protostarPlanAdmissionState: "admitted-plan";
  readonly capabilityEnvelope: AdmittedPlanCapabilityEnvelope;
}

export type AdmittedPlan = AdmittedPlanRecord & {
  readonly [AdmittedPlanBrand]: true;
};

// Module-private mint — only `assertAdmittedPlanHandoff` calls it.
function mintAdmittedPlan(record: AdmittedPlanRecord): AdmittedPlan {
  return record as AdmittedPlan;
}
```

The existing `markAdmittedPlan` private helper (used by both
`admitCandidatePlan` and `assertAdmittedPlanHandoff`) was narrowed to return
`AdmittedPlanRecord` (unbranded). Only `assertAdmittedPlanHandoff` then
re-mints via `mintAdmittedPlan` to produce the branded form.

`AdmitCandidatePlanAcceptedResult.admittedPlan` and
`AdmitCandidatePlansAcceptedResult.admittedPlan` were narrowed to
`AdmittedPlanRecord`; `CreateAdmittedPlanHandoffInput.plan` accepts
`CandidatePlan | AdmittedPlanRecord` (the branded form is its OUTPUT only).

### packages/execution/src/admitted-plan-input.contract.ts

Extended with:
- `_AdmittedPlanRecordIsNotAdmittedPlan` — pins that the upstream unbranded
  shape cannot satisfy the branded type at the execution boundary.
- A `@ts-expect-error` block proving a hand-rolled
  `AdmittedPlanExecutionArtifact` literal is rejected by the existing private
  artifact-brand symbol (`admittedPlanExecutionArtifactContract`).

### packages/review/src/admitted-plan-input.contract.ts

Mirrored the `_AdmittedPlanRecordIsNotAdmittedPlan` negative pin.

### apps/factory-cli/src/main.ts

`AdmittedPlanningOutput.admittedPlan`, `writePlanningAdmissionArtifacts`'s
`plan` parameter, and `createPlanOntologySnapshot`'s parameter type were
typed against `AdmittedPlanRecord` (or its union with the branded form
where the function accepts both upstream and downstream values). The brand
is acquired only at `assertAdmittedPlanHandoff`.

### packages/planning/src/internal/brand-witness.ts (new)

Re-exports the branded `AdmittedPlan` as `AdmittedPlanBrandWitness`.
Consumed only by `@protostar/admission-e2e`. Top-of-file banner records
the unstable contract — Phase 2 (GOV-06) may relocate.

### packages/planning/package.json

Added `./internal` subpath export wired to
`./dist/internal/brand-witness.{d.ts,js}`.

### packages/admission-e2e/src/admitted-plan-handoff.contract.test.ts (new)

Compile-time mechanism:

```ts
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

type _MintSurfacePinned = Assert<Equal<MintingKeys, "assertAdmittedPlanHandoff">>;
```

The `ReturnsAdmittedPlan` helper covers both:
- Direct: a function whose return type contains the witness (e.g.
  `(...): AdmittedPlan`).
- Indirect: a function whose return type has a `plan: AdmittedPlanBrandWitness`
  field — covers `assertAdmittedPlanHandoff` whose declared return is
  `AdmittedPlanHandoff` containing `plan: AdmittedPlan`.

## Validation spike (Task 2 step 6)

Per the plan's gating requirement, I temporarily added:

```ts
export function createAdmittedPlan(input: CreateAdmittedPlanHandoffInput): AdmittedPlan {
  return assertAdmittedPlanHandoff(input).plan;
}
```

to `packages/planning/src/index.ts` and re-ran
`pnpm --filter @protostar/admission-e2e build`. Result:

```
src/admitted-plan-handoff.contract.test.ts(62,34): error TS2344:
  Type 'false' does not satisfy the constraint 'true'.
```

at the `_MintSurfacePinned` line. Mechanism confirmed load-bearing — a new
public function returning `AdmittedPlan` makes `MintingKeys` a union of
`"createAdmittedPlan" | "assertAdmittedPlanHandoff"`, which is not equal to
`"assertAdmittedPlanHandoff"`, and the `Equal` assertion fails. Spike was
then reverted.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] Stale dist artifacts in `packages/planning/dist/`**

Pre-existing carry-forward from Wave 1 left compiled `.test.js` files in
`packages/planning/dist/` for tests that no longer exist in `src/` (e.g.
`admit.test.js`, `admit-semantic-admission.test.js`,
`dogpile-admitted-plan-entry-point.test.js`). These caused 5 failures in
the initial test run. Resolution: removed `packages/planning/dist/` and let
`tsc -b` regenerate clean. Same cleanup applied to `execution`, `review`,
`admission-e2e`, and `factory-cli` dist dirs to ensure tests run only the
current source. No source code changed; this is purely a build hygiene
recovery.

**Files modified:** none (dist regenerated)
**Commit:** N/A (recovery before commit)

### Architectural reconciliation (no user decision required)

The plan's `<interfaces>` snippet implied execution would accept raw
`AdmittedPlan` directly:

```ts
type ExpectedExecutionInput = AdmittedPlan;
```

But the existing Plan-05-shipped contract
(`packages/execution/src/admitted-plan-input.contract.ts`) explicitly
**refuses** raw `AdmittedPlan` at the execution boundary —
`_FullAdmittedPlanCannotReachExecution` is an `AssertFalse`. Execution
accepts `AdmittedPlanExecutionArtifact` only, which is itself
brand-protected via the existing module-private
`admittedPlanExecutionArtifactContract` unique symbol.

Reconciliation: I honored the plan's INTENT (the brand is the gate that
keeps non-admitted plans out of execution) without breaking the architecture
Plan 05 shipped. The brand on `AdmittedPlan` is now load-bearing because:

1. `AdmittedPlanHandoff.plan: AdmittedPlan` requires the brand — it can be
   produced ONLY by `assertAdmittedPlanHandoff` (mint), AND
2. `AdmittedPlanExecutionArtifact` is created by the private
   `createAdmittedPlanExecutionArtifact` helper, called ONLY from inside
   `assertAdmittedPlanHandoff`, AND
3. The artifact itself carries a separate private brand symbol that
   foreign modules cannot forge (proven by the new `@ts-expect-error`
   negative pin).

Both gates compose: the only path to `AdmittedPlanExecutionArtifact` is
through `assertAdmittedPlanHandoff`, which is the only path to the
`AdmittedPlan` brand. The contract test pins the visible mint surface
(AdmittedPlan), and the artifact brand pins the execution input. PLAN-A-01
is closed compile-time.

## Acceptance criteria check

| Criterion | Status |
|-----------|--------|
| `grep -c "AdmittedPlanBrand" packages/planning/src/index.ts ≥ 2` | ✅ (declaration + intersection) |
| `grep -c "export.*mintAdmittedPlan\|export.*AdmittedPlanBrand" packages/planning/src/index.ts == 0` | ✅ (both private) |
| `grep -c "assertAdmittedPlanHandoff" packages/planning/src/index.ts ≥ 1` | ✅ |
| `grep -c "AdmittedPlan" packages/execution/src/admitted-plan-input.contract.ts ≥ 2` | ✅ |
| `grep -c "@ts-expect-error" packages/execution/src/admitted-plan-input.contract.ts ≥ 1` | ✅ |
| `pnpm --filter {planning,execution,review,factory-cli,admission-e2e} test` | ✅ all green |
| `pnpm -r build` | ✅ |
| Manual TS spike fails as expected | ✅ (recorded above) |
| `packages/admission-e2e/src/admitted-plan-handoff.contract.test.ts` exists | ✅ |
| `packages/planning/src/internal/brand-witness.ts` exists | ✅ |
| `grep -c '"./internal"' packages/planning/package.json ≥ 1` | ✅ |
| Validation spike: adding `createAdmittedPlan` fails tsc | ✅ confirmed |

## Threat Flags

None. The brand mechanism mitigates T-01-07-01, T-01-07-02, and T-01-07-03
exactly as planned; no new surface introduced.

## Self-Check: PASSED

Verified files exist:
- `packages/planning/src/admitted-plan-brand.contract.ts` ✅
- `packages/planning/src/internal/brand-witness.ts` ✅
- `packages/admission-e2e/src/admitted-plan-handoff.contract.test.ts` ✅

Verified commits exist (`git log --oneline`):
- `54cbd8d` test(01-07): add failing contract — AdmittedPlan must carry a private brand ✅
- `d53d018` feat(01-07): brand AdmittedPlan with private mint via assertAdmittedPlanHandoff ✅
- `080846c` test(01-07): pin AdmittedPlan mint surface via admission-e2e contract test ✅
