---
phase: 01-intent-planning-admission
plan: 07
type: execute
wave: 2
depends_on: [05]
files_modified:
  - packages/planning/src/index.ts
  - packages/planning/src/artifacts/index.ts
  - packages/planning/src/candidate-admitted-plan-boundary.contract.ts
  - packages/planning/src/admitted-plan-handoff.test.ts
  - packages/execution/src/index.ts
  - packages/execution/src/admitted-plan-input.contract.ts
  - packages/admission-e2e/src/admitted-plan-handoff.contract.test.ts
autonomous: true
requirements:
  - PLAN-A-01
must_haves:
  truths:
    - "AdmittedPlan is a branded type whose constructor is module-private — no callable public constructor exists (Q-04)"
    - "assertAdmittedPlanHandoff is the SOLE function that produces an AdmittedPlan brand"
    - "Every candidate plan from any source (fixture or pile) flows through parsePlanningPileResult → admitCandidatePlans → assertAdmittedPlanHandoff (PLAN-A-01)"
    - "@protostar/execution's public surface accepts ONLY AdmittedPlan — raw CandidatePlan does not satisfy the input type"
    - "An admission-e2e contract test asserts only assertAdmittedPlanHandoff produces AdmittedPlan on the public surface"
    - "Zero runtime crypto in Phase 1 (Q-04 — runtime signature is Phase 2 GOV-06)"
  artifacts:
    - path: packages/planning/src/index.ts
      provides: "Branded AdmittedPlan type + private mint + assertAdmittedPlanHandoff as sole public mint"
      contains: "assertAdmittedPlanHandoff"
    - path: packages/execution/src/admitted-plan-input.contract.ts
      provides: "Compile-time pin: ExecutionRunPlan input type is AdmittedPlan, not CandidatePlan"
      contains: "AdmittedPlan"
    - path: packages/admission-e2e/src/admitted-plan-handoff.contract.test.ts
      provides: "Cross-package contract: only assertAdmittedPlanHandoff mints AdmittedPlan"
  key_links:
    - from: packages/planning/src/index.ts
      to: AdmittedPlan brand
      via: unique symbol-keyed property + module-private mint function
      pattern: "assertAdmittedPlanHandoff"
    - from: packages/execution/src/index.ts
      to: AdmittedPlan
      via: ExecutionRunPlan / prepareExecutionRun input type
      pattern: "AdmittedPlan"
---

<objective>
Mirror the ConfirmedIntent strategy (Plan 06) for AdmittedPlan: a unique-symbol brand minted only by assertAdmittedPlanHandoff. Execution's public surface accepts only the brand. Closes PLAN-A-01: every candidate plan flows through parsePlanningPileResult → admitCandidatePlans → assertAdmittedPlanHandoff with no compile-time bypass.

Purpose: Symmetric front-door hardening — execution literally cannot accept a non-admitted plan. Future Phase 2 (GOV-06) layers a runtime signature; Phase 1 stays compile-time only.

Output: Branded AdmittedPlan type, narrowed Execution input contract, and an admission-e2e contract test pinning the mint surface.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/phases/01-intent-planning-admission/01-CONTEXT.md
@.planning/codebase/CONVENTIONS.md
@packages/planning/src/index.ts
@packages/planning/src/artifacts
@packages/planning/src/candidate-admitted-plan-boundary.contract.ts
@packages/planning/src/admitted-plan-handoff.test.ts
@packages/execution/src/index.ts
@packages/execution/src/admitted-plan-input.contract.ts
</context>

<interfaces>
Expected branded shape:

```ts
declare const AdmittedPlanBrand: unique symbol;

export type AdmittedPlan = DeepReadonly<AdmittedPlanData> & {
  readonly [AdmittedPlanBrand]: true;
};

// Module-private — NOT exported
function mintAdmittedPlan(data: AdmittedPlanData): AdmittedPlan { ... }

// Sole public mint
export function assertAdmittedPlanHandoff(input: CandidatePlanAdmissionResult): AdmittedPlan { ... }
```

Execution input pin (packages/execution/src/admitted-plan-input.contract.ts):

```ts
import type { AdmittedPlan } from "@protostar/planning";
type ExpectedExecutionInput = AdmittedPlan;
type Assert<T extends true> = T;
type IfEquals<X, Y, Then = true, Else = false> = ...;
// Compile-time check that the public prepareExecutionRun parameter
// type extends AdmittedPlan and refuses raw CandidatePlanGraph.
```
</interfaces>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Brand AdmittedPlan + private mint + narrow execution input</name>
  <read_first>
    - /Users/zakkeown/Code/protostar/packages/planning/src/index.ts (5361-line file per CONCERNS.md — locate AdmittedPlan type, every mint site, assertAdmittedPlanHandoff, parsePlanningPileResult, admitCandidatePlans)
    - /Users/zakkeown/Code/protostar/packages/planning/src/artifacts/index.ts (AdmittedPlan and planning-admission artifact)
    - /Users/zakkeown/Code/protostar/packages/planning/src/candidate-admitted-plan-boundary.contract.ts (existing boundary contract)
    - /Users/zakkeown/Code/protostar/packages/planning/src/admitted-plan-handoff.test.ts (existing handoff tests)
    - /Users/zakkeown/Code/protostar/packages/execution/src/index.ts (prepareExecutionRun and ExecutionRunPlan input)
    - /Users/zakkeown/Code/protostar/packages/execution/src/admitted-plan-input.contract.ts (compile-time pin to extend)
    - /Users/zakkeown/Code/protostar/packages/review/src/admitted-plan-input.contract.ts (similar pin — mirror)
    - /Users/zakkeown/Code/protostar/apps/factory-cli/src/main.ts (every site that produces or consumes AdmittedPlan)
  </read_first>
  <behavior>
    - At module scope in planning: declare const AdmittedPlanBrand: unique symbol (NOT exported).
    - AdmittedPlan type intersects with { readonly [AdmittedPlanBrand]: true }.
    - mintAdmittedPlan is module-private; assertAdmittedPlanHandoff is the only call site.
    - Existing assertAdmittedPlanHandoff tests still pass.
    - prepareExecutionRun (and any other execution entry consuming AdmittedPlan) accepts only branded AdmittedPlan; passing a CandidatePlanGraph fails tsc -b.
    - review package (which also has admitted-plan-input.contract.ts) is updated identically.
    - factory-cli's runFactory composition still compiles because it goes through assertAdmittedPlanHandoff before calling prepareExecutionRun.
  </behavior>
  <action>
    1. In packages/planning/src/index.ts (or wherever AdmittedPlan is declared — likely the index given its 5361-line size):
       a. Add `declare const AdmittedPlanBrand: unique symbol;` at module scope (NOT exported).
       b. Update AdmittedPlan type to intersect with `{ readonly [AdmittedPlanBrand]: true }`.
       c. Add private function `function mintAdmittedPlan(data): AdmittedPlan { return { ...data, [AdmittedPlanBrand]: true } as AdmittedPlan; }`. Do NOT export.
       d. Update assertAdmittedPlanHandoff: on the success branch, return `mintAdmittedPlan(...)`. Confirm it remains the only call site.
       e. If any other public function currently returns AdmittedPlan, narrow its return type to a non-branded shape (e.g. CandidateAdmissionRecord) and require callers to re-mint via assertAdmittedPlanHandoff. Document every consumer touched.

    2. In packages/planning/src/candidate-admitted-plan-boundary.contract.ts: add the brand to the expected key list (Assert<KeysEqual<AdmittedPlan, ...known fields..., typeof AdmittedPlanBrand>> — use the typeof of the symbol literal where appropriate, or pin via a separate Assert that mintAdmittedPlan return type is assignable to AdmittedPlan and the brand property is required).

    3. In packages/execution/src/admitted-plan-input.contract.ts:
       a. Import type AdmittedPlan from "@protostar/planning".
       b. Add a compile-time assertion: `type Assert<T extends true> = T;` `type IfExtends<A, B> = A extends B ? true : false;` `type ExecutionInputPin = Assert<IfExtends<Parameters<typeof prepareExecutionRun>[0], AdmittedPlan>>` (or whatever the public entry parameter is — discover by reading packages/execution/src/index.ts).
       c. Add a NEGATIVE pin using `@ts-expect-error`: passing a raw CandidatePlanGraph to prepareExecutionRun must fail. Use the existing CONVENTIONS.md pattern (other negative contracts in packages/planning/src/*.contract.ts use the same `@ts-expect-error` discipline).

    4. In packages/execution/src/index.ts: ensure prepareExecutionRun's exported parameter type is exactly AdmittedPlan (re-export from @protostar/planning if needed). Do NOT introduce `as any` or widening casts. If a current internal helper accepts a non-branded shape, mark it private (move to a non-exported file or strip it from the barrel).

    5. In packages/review/src/admitted-plan-input.contract.ts: mirror the change so review's public consumer also requires the brand.

    6. In apps/factory-cli/src/main.ts: confirm runFactory's plan flow goes parsePlanningPileResult → admitCandidatePlans → assertAdmittedPlanHandoff → prepareExecutionRun. If any path skips assertAdmittedPlanHandoff (the dry-run readPlanningFixtureInput path noted in CONCERNS.md), route it through assertAdmittedPlanHandoff before calling prepareExecutionRun.

    7. Build + test:
       - pnpm --filter @protostar/planning test
       - pnpm --filter @protostar/execution test
       - pnpm --filter @protostar/review test
       - pnpm --filter @protostar/factory-cli test
       - pnpm -r build (every consumer compiles)
  </action>
  <verify>
    <automated>cd /Users/zakkeown/Code/protostar && pnpm --filter @protostar/planning test && pnpm --filter @protostar/execution test && pnpm --filter @protostar/review test && pnpm --filter @protostar/factory-cli test && pnpm -r build</automated>
  </verify>
  <acceptance_criteria>
    - grep -c "AdmittedPlanBrand" packages/planning/src/index.ts is at least 2 (declare + intersection).
    - grep -c "export.*mintAdmittedPlan\|export.*AdmittedPlanBrand" packages/planning/src/index.ts is 0.
    - grep -c "assertAdmittedPlanHandoff" packages/planning/src/index.ts is at least 1 (still exported).
    - grep -c "AdmittedPlan" packages/execution/src/admitted-plan-input.contract.ts is at least 2 (import + Assert).
    - grep -c "@ts-expect-error" packages/execution/src/admitted-plan-input.contract.ts is at least 1 (negative pin).
    - All four pnpm --filter test commands above exit 0.
    - pnpm -r build exits 0.
    - Manual TS spike (record in SUMMARY): a temp file `prepareExecutionRun({} as CandidatePlanGraph)` fails tsc -b with a "missing AdmittedPlanBrand" or equivalent error.
  </acceptance_criteria>
  <done>Brand applied; execution + review inputs narrowed; every workspace consumer compiles and tests green.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Pin the public mint surface for AdmittedPlan in admission-e2e</name>
  <read_first>
    - /Users/zakkeown/Code/protostar/packages/admission-e2e/src/index.ts (Plan 05 — confirm scaffold)
    - /Users/zakkeown/Code/protostar/packages/admission-e2e/src/confirmed-intent-mint.contract.test.ts (Plan 06 — mirror its mechanism)
    - /Users/zakkeown/Code/protostar/packages/planning/src/index.ts (Task 1 — brand + private mint + assertAdmittedPlanHandoff)
    - /Users/zakkeown/Code/protostar/packages/planning/src/candidate-admitted-plan-boundary.contract.ts (existing boundary)
  </read_first>
  <behavior>
    - admission-e2e contract test imports * from "@protostar/planning".
    - For every exported function, asserts: if its return type contains AdmittedPlan (i.e. has the brand marker), the export name is "assertAdmittedPlanHandoff".
    - Test fails (tsc -b error) if a future contributor adds e.g. createAdmittedPlan / makeAdmittedPlan to the public surface.
    - Plan 09's parameterized e2e test will exercise the runtime path; this contract is the compile-time pin.
  </behavior>
  <action>
    1. Create packages/admission-e2e/src/admitted-plan-handoff.contract.test.ts mirroring the structure of confirmed-intent-mint.contract.test.ts (Plan 06):
       - Import * as PlanningPublicApi from "@protostar/planning".
       - Allowlist: ["assertAdmittedPlanHandoff"] as const.
       - Compile-time mechanism: extract every exported function whose ReturnType contains the AdmittedPlan brand; assert that key set equals the allowlist (Assert<Equal<...>>).
       - Runtime smoke: assert typeof PlanningPublicApi.assertAdmittedPlanHandoff === "function".
       - Document the mechanism in a top-of-file comment block.

    2. Build + test:
       - pnpm --filter @protostar/admission-e2e test (passes).

    3. Sanity spike (record in SUMMARY, not gate-required):
       - Temporarily add `export function createAdmittedPlan(...) { ... }` to packages/planning/src/index.ts (or a re-export shim).
       - Run pnpm --filter @protostar/admission-e2e build.
       - Confirm tsc rejects.
       - Revert.
  </action>
  <verify>
    <automated>cd /Users/zakkeown/Code/protostar && pnpm --filter @protostar/admission-e2e test</automated>
  </verify>
  <acceptance_criteria>
    - ls packages/admission-e2e/src/admitted-plan-handoff.contract.test.ts exists.
    - grep -c "assertAdmittedPlanHandoff" packages/admission-e2e/src/admitted-plan-handoff.contract.test.ts is at least 2 (allowlist + assertion).
    - pnpm --filter @protostar/admission-e2e build exits 0.
    - pnpm --filter @protostar/admission-e2e test exits 0.
    - SUMMARY records the sanity-spike outcome.
  </acceptance_criteria>
  <done>Cross-package contract pins the AdmittedPlan mint surface; admission-e2e green.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| @protostar/planning public barrel ↔ execution + review + factory-cli | A fabricated AdmittedPlan would bypass every planning admission rule |
| Execution / review input boundary ↔ caller | The brand is the gate — without it, prepareExecutionRun must refuse |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-01-07-01 | Spoofing | AdmittedPlan at execution call site | mitigate | unique symbol brand + module-private mint; consumer cannot fabricate the brand |
| T-01-07-02 | Elevation of Privilege | Future contributor adding a public AdmittedPlan factory | mitigate | admission-e2e contract test fails tsc -b if any new function on the public surface returns the brand |
| T-01-07-03 | Tampering | Dry-run / fixture path that today bypasses assertAdmittedPlanHandoff | mitigate | Task 1 step 6 routes every plan flow through assertAdmittedPlanHandoff before prepareExecutionRun |
</threat_model>

<verification>
- AdmittedPlan brand applied; only assertAdmittedPlanHandoff mints.
- Execution + review input contracts narrowed; raw CandidatePlanGraph rejected by tsc.
- factory-cli routes every plan flow through assertAdmittedPlanHandoff.
- admission-e2e contract pins the mint surface; all packages green.
</verification>

<success_criteria>
PLAN-A-01 closed: every candidate plan, fixture or pile, must traverse parsePlanningPileResult → admitCandidatePlans → assertAdmittedPlanHandoff to reach execution. The compiler enforces it.
</success_criteria>

<output>
After completion, create .planning/phases/01-intent-planning-admission/01-07-SUMMARY.md recording: the brand mechanism, every consumer narrowed (execution, review, factory-cli call sites), and the sanity-spike outcome from Task 2 step 3.
</output>
