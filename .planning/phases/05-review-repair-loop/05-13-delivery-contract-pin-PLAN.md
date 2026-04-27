---
phase: 05-review-repair-loop
plan: 13
type: execute
wave: 6
depends_on: [04, 12]
files_modified:
  - packages/delivery/src/index.ts
  - packages/delivery/src/delivery-contract.ts
  - packages/delivery/src/delivery-contract.test.ts
  - packages/delivery/package.json
  - packages/delivery/tsconfig.json
autonomous: true
requirements: [LOOP-05]
must_haves:
  truths:
    - "`packages/delivery/src/delivery-contract.ts` declares `createGitHubPrDeliveryPlan(authorization: DeliveryAuthorization, ...)` signature with DeliveryAuthorization as REQUIRED first argument"
    - "Type-level negative test: `@ts-expect-error` line proves `createGitHubPrDeliveryPlan(...)` without authorization fails to compile"
    - "Existing `createGitHubPrDeliveryPlan` body in `packages/delivery/src/index.ts` is preserved but DEPRECATED — Phase 7 implements the new signature"
    - "`packages/delivery` depends on `@protostar/review` for the brand type"
  artifacts:
    - path: packages/delivery/src/delivery-contract.ts
      provides: "type-only declaration of DeliveryAuthorization-gated function"
  key_links:
    - from: packages/delivery/src/delivery-contract.ts
      to: DeliveryAuthorization
      via: "type import"
      pattern: "from \"@protostar/review\""
---

<objective>
Pin the Phase 7 contract surface that consumes `DeliveryAuthorization` (Q-16). This plan declares the SIGNATURE only — Phase 7 implements the body. Locking it here prevents Phase 7 from accidentally re-declaring an unbranded variant.

Per Q-16: "Phase 7's `createGitHubPrDeliveryPlan(authorization: DeliveryAuthorization, ...)` cannot be called without a passing loop result. No bypass possible — even a misconfigured caller fails to compile."

Per Q-15 + advisor #5: declare the contract here as a type-only export. The current `packages/delivery/src/index.ts` has a runtime implementation taking `reviewGate` — keep it as `@deprecated` for backward compatibility; Phase 7 replaces.

Purpose: Cross-phase compile-time enforcement. Anyone calling delivery without the brand fails to compile, full stop.
Output: New `delivery-contract.ts` with type-only declaration + negative test + dependency on `@protostar/review`.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/05-review-repair-loop/05-CONTEXT.md
@packages/delivery/src/index.ts
@packages/review/src/delivery-authorization.ts
@packages/review/src/run-review-repair-loop.ts
@packages/intent/src/index.ts

<interfaces>
```typescript
// packages/delivery/src/delivery-contract.ts
import type { DeliveryAuthorization } from "@protostar/review";
import type { ConfirmedIntent } from "@protostar/intent";
import type { StageArtifactRef } from "@protostar/artifacts";

export interface GitHubPrDeliveryInput {
  readonly authorization: DeliveryAuthorization;     // Q-16 — REQUIRED, branded
  readonly confirmedIntent: ConfirmedIntent;
  readonly headRef: string;
  readonly baseRef: string;
  readonly title: string;
  readonly bodyArtifact: StageArtifactRef;
}

export interface GitHubPrDeliveryPlan {
  readonly kind: "github-pr-delivery-plan";
  readonly authorization: DeliveryAuthorization;
  readonly command: readonly string[];           // gh pr create ... — Phase 7 fills
  readonly artifact: StageArtifactRef;
}

// IMPLEMENTATION lands in Phase 7. This is a TYPE DECLARATION only.
// Phase 7 will export `createGitHubPrDeliveryPlan` from packages/delivery/src/index.ts
// with this exact signature. Any divergence breaks consumers (apps/factory-cli main.ts
// approved-branch).
export declare function createGitHubPrDeliveryPlan(
  input: GitHubPrDeliveryInput
): GitHubPrDeliveryPlan;
```

The `declare function` keyword tells TypeScript "this exists at runtime but the body lives elsewhere." When Phase 7 implements the function in `index.ts`, the declaration in `delivery-contract.ts` becomes ambient typing that Phase 7's implementation must satisfy.

**ALTERNATIVE if `declare function` causes runtime issues:** export it as a TYPE ALIAS:
```typescript
export type CreateGitHubPrDeliveryPlan = (input: GitHubPrDeliveryInput) => GitHubPrDeliveryPlan;
```
Phase 7 implements `const createGitHubPrDeliveryPlan: CreateGitHubPrDeliveryPlan = (...)`. Either approach satisfies Q-16. Planner pick during execution: prefer `declare function` for cleaner caller import; fall back to type alias if cycles or build issues arise.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: delivery-contract.ts + DeliveryAuthorization-gated signature</name>
  <files>packages/delivery/src/delivery-contract.ts, packages/delivery/src/delivery-contract.test.ts, packages/delivery/package.json, packages/delivery/tsconfig.json, packages/delivery/src/index.ts</files>
  <read_first>
    - packages/delivery/src/index.ts (current createGitHubPrDeliveryPlan body — lines 20-90)
    - packages/review/src/delivery-authorization.ts (Plan 05-04 — DeliveryAuthorization brand)
    - packages/delivery/package.json (current dependencies — verify @protostar/review absent so we add it cleanly)
    - .planning/phases/05-review-repair-loop/05-CONTEXT.md §Q-16
  </read_first>
  <behavior>
    - Test 1 (positive — type compiles with brand): construct a `DeliveryAuthorization` via `mintDeliveryAuthorization`; pass to `createGitHubPrDeliveryPlan` input — type-check passes.
    - Test 2 (NEGATIVE — `@ts-expect-error` without brand): attempt to call `createGitHubPrDeliveryPlan({ confirmedIntent, headRef, baseRef, title, bodyArtifact })` (no `authorization` field) — must `@ts-expect-error`.
    - Test 3 (NEGATIVE — wrong brand attempt): construct a plain object literal `{ runId: "x", decisionPath: "y" }` and pass as `authorization` — must `@ts-expect-error` (brand symbol missing). Mirrors Plan 05-04 Task 2 negative test.
    - Test 4 (signature shape): assert the function type is `(input: GitHubPrDeliveryInput) => GitHubPrDeliveryPlan` via `Parameters<typeof createGitHubPrDeliveryPlan>[0] extends GitHubPrDeliveryInput`.
  </behavior>
  <action>
1. Add `@protostar/review` to `packages/delivery/package.json` `dependencies`. Add `@protostar/intent` and `@protostar/artifacts` if not already present (likely they are — check first).
2. Add `{ "path": "../review" }` (and intent/artifacts if needed) to `packages/delivery/tsconfig.json` `references`.

3. Create `packages/delivery/src/delivery-contract.ts` per `<interfaces>`. Use `declare function` form first; if compile fails, switch to the type-alias fallback (document choice in SUMMARY).

4. Update `packages/delivery/src/index.ts`:
   - Add `export * from "./delivery-contract.js";` at top.
   - Mark the EXISTING `createGitHubPrDeliveryPlan` (the runtime impl with `reviewGate` parameter) as `@deprecated`. Rename it `createGitHubPrDeliveryPlanLegacy` to free the canonical name for Phase 7's implementation. (If renaming breaks existing callers in `apps/factory-cli`, Plan 05-12 already replaced the callsite — verify by grep first; if any active callsite remains in `factory-cli` that's a Plan 05-12 gap.)

5. Tests: `delivery-contract.test.ts` covers the 4 behaviors above. Use `@ts-expect-error` lines for the negative type-checks (mirrors Plan 05-04 Task 2 pattern).

**Phase 7 hand-off note (place in module header comment of delivery-contract.ts):**
> "This file is the Phase 5 type-pin for Phase 7. Phase 7 implements `createGitHubPrDeliveryPlan` against this signature in `packages/delivery/src/github-pr-delivery.ts` (or similar). Any change to the input/output types here is a cross-phase break — coordinate with Phase 7."
  </action>
  <verify>
    <automated>cd /Users/zakkeown/Code/protostar && grep -c 'DeliveryAuthorization' packages/delivery/src/delivery-contract.ts && grep -c '@protostar/review' packages/delivery/package.json && grep -c '@ts-expect-error' packages/delivery/src/delivery-contract.test.ts && grep -c '@deprecated\|createGitHubPrDeliveryPlanLegacy' packages/delivery/src/index.ts && pnpm --filter @protostar/delivery test 2>&1 | tail -10 && pnpm --filter @protostar/delivery build 2>&1 | tail -5</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c 'DeliveryAuthorization' packages/delivery/src/delivery-contract.ts` ≥ 1
    - `grep -c '@protostar/review' packages/delivery/package.json` ≥ 1 (dep added)
    - `grep -c '@ts-expect-error' packages/delivery/src/delivery-contract.test.ts` ≥ 2 (Tests 2 + 3)
    - `grep -c '@deprecated' packages/delivery/src/index.ts` ≥ 1 (legacy impl marked)
    - `pnpm --filter @protostar/delivery test` exits 0
    - `pnpm --filter @protostar/delivery build` exits 0
  </acceptance_criteria>
  <done>Delivery contract pinned at Phase 5 boundary; Phase 7 implements against the locked signature.</done>
</task>

</tasks>

<threat_model>
| Boundary | Description |
|----------|-------------|
| delivery contract ↔ Phase 7 implementation | type drift = silent loop bypass |

| Threat ID | Category | Component | Disposition | Mitigation |
|-----------|----------|-----------|-------------|------------|
| T-05-30 | Tampering | Phase 7 declares an unbranded delivery function bypassing the loop | mitigate | type-only declaration in Phase 5; Phase 7 must satisfy this signature; @ts-expect-error regression test in delivery-contract.test.ts |
| T-05-31 | Tampering | caller forges DeliveryAuthorization via object literal | mitigate | brand symbol enforcement (Plan 05-04 Task 2); negative test in this plan repeats the assertion |
</threat_model>

<verification>
- `pnpm --filter @protostar/delivery build` green
- `pnpm --filter @protostar/delivery test` green
- `@ts-expect-error` lines prove brand requirement at compile time
</verification>

<success_criteria>
- delivery-contract.ts declares DeliveryAuthorization-gated signature
- Type-level negative tests prove no bypass at compile time
- Phase 7 has a stable type-pin to satisfy
</success_criteria>

<output>
Create `.planning/phases/05-review-repair-loop/05-13-SUMMARY.md`: documents the type-pin location, the legacy rename, and the Phase 7 hand-off note.
</output>
</content>
</invoke>