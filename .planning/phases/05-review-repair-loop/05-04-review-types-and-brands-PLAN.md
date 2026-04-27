---
phase: 05-review-repair-loop
plan: 04
type: execute
wave: 1
depends_on: [01, 02, 03]
files_modified:
  - packages/planning/src/repair-context.ts
  - packages/planning/src/repair-context.test.ts
  - packages/planning/src/execution-run-result.ts
  - packages/planning/src/execution-run-result.test.ts
  - packages/planning/src/index.ts
  - packages/review/src/repair-types.ts
  - packages/review/src/repair-types.test.ts
  - packages/review/src/judge-types.ts
  - packages/review/src/judge-types.test.ts
  - packages/review/src/delivery-authorization.ts
  - packages/review/src/delivery-authorization.test.ts
  - packages/review/src/lifecycle-events.ts
  - packages/review/src/lifecycle-events.test.ts
  - packages/review/src/index.ts
autonomous: true
requirements: [LOOP-03, LOOP-04, LOOP-05, LOOP-06]
must_haves:
  truths:
    - "`RepairPlan` interface lives in `@protostar/review` with literal Q-04 shape"
    - "`RepairContext` (Q-06) carries `previousAttempt`, `mechanicalCritiques`, optional `modelCritiques` — **lives in `@protostar/planning` (neutral leaf) to break the execution↔review cycle that would otherwise occur in 05-06**"
    - "`ExecutionRunResult` (Phase 4 first-pass execution outcome) lives in `@protostar/planning` (neutral leaf) — consumed by both `@protostar/execution` and `@protostar/review` without a cycle"
    - "`ModelReviewer` is a function-shaped interface `(input: ModelReviewInput) => Promise<ModelReviewResult>` (Q-10)"
    - "`JudgeCritique` matches Q-11 verbatim with rubric `Record<string, number>`"
    - "`DeliveryAuthorization` is a branded type only constructible via `mintDeliveryAuthorization` and `loadDeliveryAuthorization` — direct object literal does NOT type-check (Q-15, Q-16)"
    - "`ReviewLifecycleEvent` discriminated union has all seven kinds from Q-18; exhaustiveness test fails to compile when a kind is added without consumer update"
  artifacts:
    - path: packages/review/src/repair-types.ts
      provides: "RepairPlan, RepairTask, MechanicalCheckResult, ModelReviewInput, ModelReviewResult, ModelReviewer types (RepairContext re-exported from @protostar/planning for back-compat)"
    - path: packages/planning/src/repair-context.ts
      provides: "RepairContext + AdapterAttemptRef (neutral-leaf home — breaks execution↔review cycle)"
    - path: packages/planning/src/execution-run-result.ts
      provides: "ExecutionRunResult (Phase 4 first-pass execution outcome shape)"
    - path: packages/review/src/judge-types.ts
      provides: "JudgeCritique type"
    - path: packages/review/src/delivery-authorization.ts
      provides: "DeliveryAuthorization brand + mint + load helpers"
    - path: packages/review/src/lifecycle-events.ts
      provides: "ReviewLifecycleEvent discriminated union"
  key_links:
    - from: packages/review/src/index.ts
      to: 4 new modules
      via: "barrel re-export"
      pattern: "export \\* from \"./repair-types"
    - from: packages/review/src/delivery-authorization.ts
      to: DeliveryAuthorization brand
      via: "private __brand"
      pattern: "__brand: \"DeliveryAuthorization\""
---

<objective>
Lock the type surface of the Phase 5 loop. All four new modules are TYPES + minimal helpers — no I/O, no orchestration. Wave 2 (adapters) and Wave 3 (loop body) implement against these frozen contracts.

Per CONTEXT.md Q-04, Q-06, Q-10, Q-11, Q-15, Q-16, Q-18 — every type/shape is specified verbatim in the orchestrator's CONTEXT.md and lifted here.

Purpose: Single load-bearing artifact; prevents type drift across Wave 2 + Wave 3 plans.
Output: 4 new contract modules in `@protostar/review`, exhaustiveness tests, barrel re-export.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/05-review-repair-loop/05-CONTEXT.md
@packages/review/src/index.ts
@packages/review/src/admitted-plan-input.contract.ts
@packages/planning/src/index.ts
@packages/intent/src/index.ts
@.planning/phases/04-execution-engine/04-02-execution-contracts-PLAN.md

Naming/structural template: Phase 4 Plan 04-02 established `adapter-contract.ts`/`journal-types.ts` pattern in `@protostar/execution`. Mirror exactly.

<interfaces>
All shapes are literal copies from CONTEXT.md decisions. Use these verbatim.

```typescript
// packages/planning/src/repair-context.ts (NEUTRAL LEAF — cycle-break for 05-06)
// RepairContext + AdapterAttemptRef live in @protostar/planning so that
// @protostar/execution can import them without taking a dep on @protostar/review
// (review already depends on execution → that direction would cycle).
import type { ReviewFinding } from "@protostar/review";  // FORBIDDEN — see note below
import type { StageArtifactRef } from "@protostar/artifacts";

// NOTE: RepairContext.mechanicalCritiques cannot reference ReviewFinding directly
// without re-introducing a cycle. Resolution: define a planning-local
// `MechanicalCritiqueRef` shape (subset of ReviewFinding) here, and have
// @protostar/review re-export `RepairContext` after type-equality checking
// (review's ReviewFinding extends MechanicalCritiqueRef). Keep this leaf
// strictly zero-dependency on review.

export interface MechanicalCritiqueRef {
  readonly ruleId: string;
  readonly severity: "info" | "minor" | "major" | "critical";
  readonly repairTaskId?: string;
  readonly evidence?: Readonly<Record<string, unknown>>;
  readonly message: string;
}

export interface ModelCritiqueRef {
  readonly judgeId: string;
  readonly verdict: "pass" | "repair" | "block";
  readonly rationale: string;
  readonly taskRefs: readonly string[];
}

// Q-06 — neutral-leaf shapes
export interface AdapterAttemptRef {
  readonly planTaskId: string;
  readonly attempt: number;
  readonly evidenceArtifact?: StageArtifactRef;
}

export interface RepairContext {
  readonly previousAttempt: AdapterAttemptRef;
  readonly mechanicalCritiques: readonly MechanicalCritiqueRef[];
  readonly modelCritiques?: readonly ModelCritiqueRef[];
}
```

```typescript
// packages/planning/src/execution-run-result.ts (NEUTRAL LEAF)
// Phase 4 first-pass execution outcome shape. Lives in planning rather than
// execution so that review.run-review-repair-loop can import it without
// review→execution AND execution→review (via RepairContext) closing the cycle.
import type { StageArtifactRef } from "@protostar/artifacts";

export interface ExecutionRunResult {
  readonly schemaVersion: "1.0.0";
  readonly runId: string;
  readonly attempt: number;
  readonly status: "completed" | "failed" | "aborted";
  readonly journalArtifact: StageArtifactRef;
  readonly diffArtifact?: StageArtifactRef;
  readonly perTask: readonly { readonly planTaskId: string; readonly status: "ok" | "failed" | "skipped"; readonly evidenceArtifact?: StageArtifactRef }[];
}
```

```typescript
// packages/review/src/repair-types.ts (CONSUMER of planning leaf)
import type { ReviewFinding, ReviewVerdict, ReviewGate } from "./index.js";
import type { JudgeCritique } from "./judge-types.js";
import type { AdmittedPlanExecutionArtifact, RepairContext, AdapterAttemptRef } from "@protostar/planning";
import type { StageArtifactRef } from "@protostar/artifacts";

// Re-export the neutral-leaf types so existing review consumers keep working
export type { RepairContext, AdapterAttemptRef } from "@protostar/planning";

// Q-04
export interface RepairTask {
  readonly planTaskId: string;
  readonly mechanicalCritiques: readonly ReviewFinding[];
  readonly modelCritiques?: readonly JudgeCritique[];
}

export interface RepairPlan {
  readonly runId: string;
  readonly attempt: number;
  readonly repairs: readonly RepairTask[];
  readonly dependentTaskIds: readonly string[];
}

// Q-07 mechanical-checks structured evidence (consumed by review)
export interface MechanicalCheckCommandResult {
  readonly id: string;          // e.g. "verify", "lint"
  readonly argv: readonly string[];
  readonly exitCode: number;
  readonly durationMs: number;
  readonly stdoutPath: string;  // workspace-relative
  readonly stderrPath: string;
}

export interface MechanicalCheckResult {
  readonly schemaVersion: "1.0.0";
  readonly runId: string;
  readonly attempt: number;
  readonly commands: readonly MechanicalCheckCommandResult[];
  readonly diffNameOnly: readonly string[];   // Q-08 run-level: git diff --name-only base..head
  readonly findings: readonly ReviewFinding[]; // built by adapter; reviewed by review package
}

// Q-10
export interface ModelReviewInput {
  readonly admittedPlan: AdmittedPlanExecutionArtifact;
  readonly executionResult: unknown;        // Phase 4 ExecutionRunResult — opaque to types here
  readonly mechanicalGate: ReviewGate;
  readonly diff: { readonly nameOnly: readonly string[]; readonly unifiedDiff: string };
  readonly repairContext?: RepairContext;
}

export interface ModelReviewResult {
  readonly verdict: ReviewVerdict;
  readonly critiques: readonly JudgeCritique[];
}

export type ModelReviewer = (input: ModelReviewInput) => Promise<ModelReviewResult>;

// MechanicalChecker (consumed by loop in Plan 05-10)
export interface MechanicalCheckerInput {
  readonly admittedPlan: AdmittedPlanExecutionArtifact;
  readonly executionResult: unknown;
  readonly attempt: number;
  readonly runId: string;
}

export type MechanicalChecker = (input: MechanicalCheckerInput) => Promise<{
  readonly gate: ReviewGate;
  readonly result: MechanicalCheckResult;
}>;
```

```typescript
// judge-types.ts (Q-11 verbatim)
import type { ReviewVerdict } from "./index.js";

export interface JudgeCritique {
  readonly judgeId: string;
  readonly model: string;
  readonly rubric: Readonly<Record<string, number>>;
  readonly verdict: ReviewVerdict;          // 'pass' | 'repair' | 'block'
  readonly rationale: string;
  readonly taskRefs: readonly string[];
}
```

```typescript
// delivery-authorization.ts (Q-15 + Q-16)
import type { StageArtifactRef } from "@protostar/artifacts";

declare const DeliveryAuthorizationBrand: unique symbol;

export interface DeliveryAuthorization {
  readonly [DeliveryAuthorizationBrand]: true;
  readonly runId: string;
  readonly decisionPath: string;
}

export interface ReviewDecisionArtifact {
  readonly schemaVersion: "1.0.0";
  readonly runId: string;
  readonly planId: string;
  readonly mechanical: "pass";
  readonly model: "pass";                   // Q-15 strict: "skipped" rejected here
  readonly authorizedAt: string;            // ISO 8601
  readonly finalIteration: number;
  readonly finalDiffArtifact: StageArtifactRef;
  readonly signature?: string;
}

// Internal mint — only callable from within the loop on approved exit (Plan 05-10)
export function mintDeliveryAuthorization(input: {
  readonly runId: string;
  readonly decisionPath: string;
}): DeliveryAuthorization {
  return {
    [DeliveryAuthorizationBrand]: true,
    runId: input.runId,
    decisionPath: input.decisionPath
  };
}

// Re-mint from durable artifact (Phase 9 resume; Phase 7 verify-on-load)
// IMPLEMENTATION lands in Plan 05-10 (this module exposes the SHAPE only here;
// loadDeliveryAuthorization that touches fs lives behind an injected reader).
// Type-only declaration here.
export type LoadDeliveryAuthorization = (input: {
  readonly decisionPath: string;
  readonly readJson: (path: string) => Promise<unknown>;
}) => Promise<DeliveryAuthorization | null>;
```

```typescript
// lifecycle-events.ts (Q-18 verbatim)
export type ReviewLifecycleEvent =
  | { readonly kind: "review-iteration-started"; readonly runId: string; readonly attempt: number; readonly at: string }
  | { readonly kind: "mechanical-verdict"; readonly runId: string; readonly attempt: number; readonly verdict: "pass" | "repair" | "block"; readonly findingsCount: number; readonly at: string }
  | { readonly kind: "model-verdict"; readonly runId: string; readonly attempt: number; readonly verdict: "pass" | "repair" | "block"; readonly judgeIds: readonly string[]; readonly at: string }
  | { readonly kind: "repair-plan-emitted"; readonly runId: string; readonly attempt: number; readonly repairTaskIds: readonly string[]; readonly at: string }
  | { readonly kind: "loop-approved"; readonly runId: string; readonly finalAttempt: number; readonly decisionUri: string; readonly at: string }
  | { readonly kind: "loop-blocked"; readonly runId: string; readonly reason: "budget-exhausted" | "critical-finding" | "mechanical-block" | "model-block"; readonly finalAttempt: number; readonly blockUri: string; readonly at: string }
  | { readonly kind: "loop-budget-exhausted"; readonly runId: string; readonly attempted: number; readonly blockUri: string; readonly at: string };
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: judge-types.ts + repair-types.ts</name>
  <files>packages/review/src/judge-types.ts, packages/review/src/judge-types.test.ts, packages/review/src/repair-types.ts, packages/review/src/repair-types.test.ts</files>
  <read_first>
    - .planning/phases/05-review-repair-loop/05-CONTEXT.md §Q-04, §Q-06, §Q-10, §Q-11
    - packages/review/src/index.ts (existing ReviewVerdict, ReviewGate, ReviewFinding exports)
    - packages/planning/src/index.ts (AdmittedPlanExecutionArtifact location)
    - .planning/phases/04-execution-engine/04-02-execution-contracts-PLAN.md (file naming pattern: `*-types.ts` and `*-types.test.ts`)
  </read_first>
  <behavior>
    - Test 1: Construct a `JudgeCritique` with `rubric: { 'design-quality': 0.7, 'test-coverage': 0.9 }` — open-key rubric is allowed.
    - Test 2: Construct a `RepairPlan` with two `RepairTask` entries, one with mechanicalCritiques only, one with both mechanical + model critiques.
    - Test 3: Construct a `RepairContext` with `previousAttempt: { planTaskId: "t-1", attempt: 2 }` and assert it's assignable to the `repairContext` slot of an executor input shape.
    - Test 4: `MechanicalCheckResult.findings` is assignable to `readonly ReviewFinding[]` (re-uses existing review type).
    - Test 5: `ModelReviewer` is a callable type — type-check a stub `const stub: ModelReviewer = async () => ({ verdict: "pass", critiques: [] });`.
  </behavior>
  <action>
1. **NEUTRAL-LEAF FIRST (cycle-break for 05-06):** Create `packages/planning/src/repair-context.ts` with `MechanicalCritiqueRef`, `ModelCritiqueRef`, `AdapterAttemptRef`, `RepairContext` per `<interfaces>`. Create `packages/planning/src/execution-run-result.ts` with `ExecutionRunResult`. Add both to `packages/planning/src/index.ts` barrel. **No imports from `@protostar/review` or `@protostar/execution`** — planning stays a leaf.
2. Create `packages/review/src/judge-types.ts` with the literal `JudgeCritique` interface.
3. Create `packages/review/src/repair-types.ts`: `RepairTask`, `RepairPlan`, `MechanicalCheckCommandResult`, `MechanicalCheckResult`, `ModelReviewInput`, `ModelReviewResult`, `ModelReviewer`, `MechanicalCheckerInput`, `MechanicalChecker`. **Re-export** `RepairContext` and `AdapterAttemptRef` from `@protostar/planning` so existing `@protostar/review` consumers keep their imports working.
4. Tests (`*.test.ts`) constructed per behaviors above. Use `as const` literal construction for type checks; use `node:test` for runtime equality assertions. Add tests under `packages/planning/src/repair-context.test.ts` and `packages/planning/src/execution-run-result.test.ts` for the new leaf types.
5. NO fs / network imports — verify via grep.
6. **Cycle-break verification:** run `pnpm -w exec tsc --build packages/planning packages/execution packages/review` and confirm exit 0 (no TS6202 cyclic project reference error).
  </action>
  <verify>
    <automated>cd /Users/zakkeown/Code/protostar && grep -c 'export interface RepairPlan' packages/review/src/repair-types.ts && grep -c 'export interface JudgeCritique' packages/review/src/judge-types.ts && grep -c 'export type ModelReviewer' packages/review/src/repair-types.ts && grep -c 'rubric: Readonly<Record<string, number>>' packages/review/src/judge-types.ts && grep -cE 'node:fs|node:net|fetch\(' packages/review/src/repair-types.ts && pnpm --filter @protostar/review test 2>&1 | tail -10</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c 'export interface RepairPlan' packages/review/src/repair-types.ts` == 1
    - `grep -c 'export interface JudgeCritique' packages/review/src/judge-types.ts` == 1
    - `grep -c 'export type ModelReviewer' packages/review/src/repair-types.ts` == 1
    - `grep -c 'export interface MechanicalCheckResult' packages/review/src/repair-types.ts` == 1
    - `grep -c 'export interface RepairContext' packages/planning/src/repair-context.ts` == 1
    - `grep -c 'export interface ExecutionRunResult' packages/planning/src/execution-run-result.ts` == 1
    - `grep -c 'export type { RepairContext' packages/review/src/repair-types.ts` == 1 (back-compat re-export)
    - `grep -cE '@protostar/review|@protostar/execution' packages/planning/src/repair-context.ts packages/planning/src/execution-run-result.ts` == 0 (planning stays leaf)
    - `grep -cE 'node:fs|node:net' packages/planning/src/repair-context.ts packages/planning/src/execution-run-result.ts packages/review/src/repair-types.ts | awk -F: '"'"'{s+=$2} END{exit !(s==0)}'"'"'` (zero fs/net)
    - `pnpm -w exec tsc --build packages/planning packages/execution packages/review` exits 0 (cycle-free)
    - `pnpm --filter @protostar/review test` exits 0 with new tests included
  </acceptance_criteria>
  <done>Repair + judge types pinned; Wave 2 adapters can compile against them.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: delivery-authorization.ts + brand mint + negative test</name>
  <files>packages/review/src/delivery-authorization.ts, packages/review/src/delivery-authorization.test.ts</files>
  <read_first>
    - .planning/phases/05-review-repair-loop/05-CONTEXT.md §Q-15, §Q-16
    - packages/intent/src (find ConfirmedIntent brand pattern via `grep -n "unique symbol\\|__brand" packages/intent/src/*.ts`) — mirror the brand pattern exactly
    - packages/authority/src (find Authorized*Op brand pattern — same posture per Q-15: "mirroring Phase 1's `ConfirmedIntent` (file + brand) pattern")
    - packages/artifacts/src/index.ts (StageArtifactRef shape)
  </read_first>
  <behavior>
    - Test 1: `mintDeliveryAuthorization({ runId: "r-1", decisionPath: "/path/to/review-decision.json" })` returns a value typed as `DeliveryAuthorization` and runtime carries the brand symbol.
    - Test 2 (NEGATIVE, type-level): `const fake: DeliveryAuthorization = { runId: "r-1", decisionPath: "x" } as DeliveryAuthorization;` is the ONLY way to forge — direct object literal `const fake: DeliveryAuthorization = { runId: "r-1", decisionPath: "x" };` MUST `@ts-expect-error` because the brand symbol is missing. Encode this with a `@ts-expect-error` line in the test file.
    - Test 3: `ReviewDecisionArtifact.model` literal type is exactly `"pass"` (not `"pass" | "skipped"`) — assert via `@ts-expect-error` on assigning `"skipped"`.
    - Test 4: Type alias `LoadDeliveryAuthorization` is exported and callable.
  </behavior>
  <action>
1. Create `packages/review/src/delivery-authorization.ts` with literal content from `<interfaces>`. Use `unique symbol` (TypeScript brand idiom — same posture as Phase 2 `Authorized*Op` brands; locate with `grep -n "unique symbol" packages/authority/src/*.ts` and copy the exact import/declare style).
2. `mintDeliveryAuthorization` is the ONLY constructor exposed. Place a `// INTERNAL: only call from runReviewRepairLoop on approved exit (Plan 05-10).` comment above it.
3. `LoadDeliveryAuthorization` is a TYPE ALIAS — implementation lives in Plan 05-10 (which has fs access via the loop's injected readJson). Do NOT implement it here.
4. Tests: cover Test 1 (runtime brand symbol presence), Test 2 (`@ts-expect-error` direct-literal forge), Test 3 (`@ts-expect-error` `model: "skipped"`), Test 4 (callable type alias).
  </action>
  <verify>
    <automated>cd /Users/zakkeown/Code/protostar && grep -c '__brand\|DeliveryAuthorizationBrand' packages/review/src/delivery-authorization.ts && grep -c 'export function mintDeliveryAuthorization' packages/review/src/delivery-authorization.ts && grep -c '@ts-expect-error' packages/review/src/delivery-authorization.test.ts && grep -cE 'model.*"pass"' packages/review/src/delivery-authorization.ts && pnpm --filter @protostar/review test 2>&1 | tail -10</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c 'unique symbol' packages/review/src/delivery-authorization.ts` ≥ 1
    - `grep -c 'export function mintDeliveryAuthorization' packages/review/src/delivery-authorization.ts` == 1
    - `grep -c '@ts-expect-error' packages/review/src/delivery-authorization.test.ts` ≥ 2 (one for forge, one for skipped-model)
    - `grep -c '"skipped"' packages/review/src/delivery-authorization.ts` == 0 (model literal is exactly "pass")
    - `pnpm --filter @protostar/review test` exits 0
  </acceptance_criteria>
  <done>Brand minted only via authority-approved path; type-level forge attempt fails to compile.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: lifecycle-events.ts + exhaustiveness test</name>
  <files>packages/review/src/lifecycle-events.ts, packages/review/src/lifecycle-events.test.ts, packages/review/src/index.ts</files>
  <read_first>
    - .planning/phases/05-review-repair-loop/05-CONTEXT.md §Q-18 (verbatim event union)
    - .planning/phases/04-execution-engine/04-02-execution-contracts-PLAN.md Task 2 (TaskJournalEvent exhaustiveness pattern — copy the assertNever helper)
    - packages/review/src/index.ts (current barrel)
  </read_first>
  <behavior>
    - Test 1: Construct one literal of each of the seven event kinds.
    - Test 2: `assertExhaustive` switch over `ReviewLifecycleEvent.kind` compiles; adding a synthetic 8th kind must `@ts-expect-error` in the default branch (commented stub).
    - Test 3: `loop-blocked.reason` accepts only the four discriminator literals (`'budget-exhausted' | 'critical-finding' | 'mechanical-block' | 'model-block'`).
    - Test 4: `mechanical-verdict.verdict` accepts only `'pass' | 'repair' | 'block'`.
  </behavior>
  <action>
1. Create `packages/review/src/lifecycle-events.ts` with the literal `ReviewLifecycleEvent` union from `<interfaces>` (verbatim from CONTEXT Q-18).
2. Tests: copy `assertExhaustive` helper from Phase 4 Plan 04-02 Task 1; build sample event of each kind; type-check exhaustiveness.
3. Update `packages/review/src/index.ts` barrel to add:
   ```ts
   export * from "./repair-types.js";
   export * from "./judge-types.js";
   export * from "./delivery-authorization.js";
   export * from "./lifecycle-events.js";
   ```
   Place re-exports above the existing `runMechanicalReviewExecutionLoop` exports — order doesn't matter for ESM but locality helps readers.
  </action>
  <verify>
    <automated>cd /Users/zakkeown/Code/protostar && grep -c 'review-iteration-started\|mechanical-verdict\|model-verdict\|repair-plan-emitted\|loop-approved\|loop-blocked\|loop-budget-exhausted' packages/review/src/lifecycle-events.ts | awk '$1 >= 7 {print "ok"}' | grep -q ok && grep -c 'export \* from "./repair-types' packages/review/src/index.ts && grep -c 'export \* from "./delivery-authorization' packages/review/src/index.ts && pnpm --filter @protostar/review test 2>&1 | tail -10</automated>
  </verify>
  <acceptance_criteria>
    - `lifecycle-events.ts` contains all seven kind discriminators (one grep per kind)
    - `grep -c 'export \\* from "./repair-types' packages/review/src/index.ts` == 1
    - `grep -c 'export \\* from "./judge-types' packages/review/src/index.ts` == 1
    - `grep -c 'export \\* from "./delivery-authorization' packages/review/src/index.ts` == 1
    - `grep -c 'export \\* from "./lifecycle-events' packages/review/src/index.ts` == 1
    - `pnpm --filter @protostar/review test` exits 0
  </acceptance_criteria>
  <done>Lifecycle event union pinned; barrel re-exports all four new modules; downstream waves import from `@protostar/review`.</done>
</task>

</tasks>

<threat_model>
| Boundary | Description |
|----------|-------------|
| `@protostar/review` public types ↔ Wave 2/3/4 consumers | type drift = silent semantic break |

| Threat ID | Category | Component | Disposition | Mitigation |
|-----------|----------|-----------|-------------|------------|
| T-05-06 | Tampering | DeliveryAuthorization forged via object literal | mitigate | `unique symbol` brand + `@ts-expect-error` regression test (Task 2) |
| T-05-07 | Tampering | ReviewLifecycleEvent gains a kind without consumer update | mitigate | exhaustiveness `assertNever` switch (Task 3) |
| T-05-08 | Repudiation | ReviewDecisionArtifact.model accepts "skipped" weakening LOOP-05 | mitigate | literal type `"pass"` (no union); `@ts-expect-error` test on "skipped" assignment (Task 2) |
</threat_model>

<verification>
- `pnpm --filter @protostar/review test` green with new tests
- `index.ts` barrel re-exports all four modules
- No fs/network imports in any new file (grep)
</verification>

<success_criteria>
- All Phase 5 typed contracts (RepairPlan, RepairContext, ModelReviewer, JudgeCritique, MechanicalCheckResult, DeliveryAuthorization, ReviewLifecycleEvent) live in `@protostar/review`
- Brand minting is the only path to `DeliveryAuthorization`
- ReviewLifecycleEvent exhaustiveness enforced at compile time
</success_criteria>

<output>
Create `.planning/phases/05-review-repair-loop/05-04-SUMMARY.md`: lists the new exports per module, links to where each is consumed (Plan 05-05 RepairPlan author, Plan 05-07 MechanicalCheckResult, Plan 05-08 ModelReviewer, Plan 05-10 brand mint + lifecycle event emission, Plan 05-13 brand consumer).
</output>
</content>
</invoke>