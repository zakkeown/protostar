---
phase: 06-live-dogpile-piles
plan: 03
type: execute
wave: 1
depends_on: [01]
files_modified:
  - packages/dogpile-adapter/src/pile-failure-types.ts
  - packages/dogpile-adapter/src/resolve-pile-budget.ts
  - packages/dogpile-adapter/src/resolve-pile-budget.test.ts
  - packages/dogpile-adapter/src/map-sdk-stop-to-pile-failure.ts
  - packages/dogpile-adapter/src/map-sdk-stop-to-pile-failure.test.ts
  - packages/dogpile-adapter/src/index.ts
autonomous: true
requirements: [PILE-04, PILE-05]
tags: [dogpile, budget, failure-taxonomy, q-10, q-13]
must_haves:
  truths:
    - "PileFailure is a six-variant discriminated union with `class` discriminator: pile-timeout | pile-budget-exhausted | pile-schema-parse | pile-all-rejected | pile-network | pile-cancelled (Q-13)"
    - "resolvePileBudget(preset, envelope) returns the per-field min where both defined; envelope-undefined fields pass preset value through (envelope is a CAP not a FLOOR) (Q-10)"
    - "mapSdkStopToPileFailure translates each NormalizedStopReason variant deterministically and returns null for non-failure stops (judge:accepted, convergence, judge:score-threshold, budget:cost)"
  artifacts:
    - path: "packages/dogpile-adapter/src/pile-failure-types.ts"
      provides: "PileKind + PileFailure union + ResolvedPileBudget types"
      contains: "export type PileFailure"
    - path: "packages/dogpile-adapter/src/resolve-pile-budget.ts"
      provides: "Q-10 envelope-clamps-preset helper"
      contains: "export function resolvePileBudget"
    - path: "packages/dogpile-adapter/src/map-sdk-stop-to-pile-failure.ts"
      provides: "Q-13 SDK→Protostar failure translation"
      contains: "export function mapSdkStopToPileFailure"
    - path: "packages/dogpile-adapter/src/index.ts"
      provides: "Re-exports for Wave 1 Plan 04 and Wave 3 Plan 07 consumers"
      contains: "export type { PileFailure"
  key_links:
    - from: "packages/dogpile-adapter/src/resolve-pile-budget.ts"
      to: "@protostar/dogpile-types"
      via: "import type { … }"
      pattern: "from \\\"@protostar/dogpile-types\\\""
    - from: "packages/dogpile-adapter/src/map-sdk-stop-to-pile-failure.ts"
      to: "@protostar/dogpile-types (NormalizedStopReason)"
      via: "import type { NormalizedStopReason }"
      pattern: "NormalizedStopReason"
---

<objective>
Wave 1 part A — define the contract types and pure helpers that `runFactoryPile` (Plan 04) and `factory-cli` (Plan 07) will compose against. Lands `PileFailure`, `ResolvedPileBudget`, `resolvePileBudget`, `mapSdkStopToPileFailure` plus their tests, with no SDK runtime invocation yet.

Purpose: Interface-first ordering. Plan 04's `runFactoryPile` imports these symbols; landing them in their own plan keeps the dependency graph clean and gives the executor a tight, testable surface.

Output: Three pure modules + tests. All-pure. Fully unit-testable without LM Studio or any network.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/06-live-dogpile-piles/06-CONTEXT.md
@.planning/phases/06-live-dogpile-piles/06-RESEARCH.md
@packages/dogpile-adapter/src/index.ts

<interfaces>
<!-- From RESEARCH §"Code Examples" Examples 1, 3 — VERIFIED against installed @dogpile/sdk@0.2.0 .d.ts -->

`NormalizedStopReason` enum (from @dogpile/sdk types.d.ts:289):
```ts
export type NormalizedStopReason =
  | "budget:cost" | "budget:tokens" | "budget:iterations" | "budget:timeout"
  | "convergence" | "judge:accepted" | "judge:rejected" | "judge:score-threshold";
```

Mapping (Q-13):
- `budget:timeout`     → `pile-timeout`              (carries elapsedMs, configuredTimeoutMs)
- `budget:tokens`      → `pile-budget-exhausted`     (dimension: 'tokens')
- `budget:iterations`  → `pile-budget-exhausted`     (dimension: 'calls')
- `judge:rejected`     → `pile-all-rejected`         (caller fills candidatesEvaluated/judgeDecisions)
- `budget:cost` | `convergence` | `judge:accepted` | `judge:score-threshold` → null (NOT a failure)

`pile-network` and `pile-cancelled` arise from caught exceptions in Plan 04, not from a NormalizedStopReason. mapSdkStopToPileFailure does NOT produce them.

PileKind values (Q-13 — match FactoryPileKind from index.ts:14):
`"planning" | "review" | "execution-coordination"`

ResolvedPileBudget shape (Q-10):
```ts
export interface ResolvedPileBudget {
  readonly maxTokens: number;
  readonly timeoutMs: number;
  readonly maxCalls?: number;
}
```

Per-field min semantics (Q-10):
- both undefined → fall back to Number.MAX_SAFE_INTEGER (helper guarantees a number on required fields)
- one defined → use it
- both defined → Math.min(a, b)
- maxCalls is optional output: included iff at least one of preset.maxCalls or envelope.maxCalls is defined
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: PileFailure union + ResolvedPileBudget types (interface-first)</name>
  <files>packages/dogpile-adapter/src/pile-failure-types.ts</files>
  <read_first>
    - .planning/phases/06-live-dogpile-piles/06-RESEARCH.md §"Example 3" (lines ~620-645)
    - packages/dogpile-adapter/src/index.ts (current FactoryPileKind on line 14)
  </read_first>
  <behavior>
    - Type file only — no runtime code, no functions. (Pure type definitions.)
    - All shapes are `readonly` and use `kind` + `class` discriminators per Q-13.
    - Compiles standalone (`tsc --noEmit` on this file via package build).
  </behavior>
  <action>
    Create `packages/dogpile-adapter/src/pile-failure-types.ts`. Define and export:

    ```ts
    export type PileKind = "planning" | "review" | "execution-coordination";

    export type PileSourceOfTruth =
      | "PlanningPileResult"
      | "ReviewPileResult"
      | "ExecutionCoordinationPileResult";

    export interface JudgeDecisionRef {
      readonly judgeId: string;
      readonly decision: "accepted" | "rejected";
      readonly reason?: string;
    }

    export type PileFailure =
      | { readonly kind: PileKind; readonly class: "pile-timeout"; readonly elapsedMs: number; readonly configuredTimeoutMs: number }
      | { readonly kind: PileKind; readonly class: "pile-budget-exhausted"; readonly dimension: "tokens" | "calls"; readonly consumed: number; readonly cap: number }
      | { readonly kind: PileKind; readonly class: "pile-schema-parse"; readonly sourceOfTruth: PileSourceOfTruth; readonly parseErrors: readonly string[] }
      | { readonly kind: PileKind; readonly class: "pile-all-rejected"; readonly candidatesEvaluated: number; readonly judgeDecisions: readonly JudgeDecisionRef[] }
      | { readonly kind: PileKind; readonly class: "pile-network"; readonly attempt: number; readonly lastError: { readonly code: string; readonly message: string } }
      | { readonly kind: PileKind; readonly class: "pile-cancelled"; readonly reason: "sigint" | "parent-abort" | "sentinel" };

    export interface PresetBudget {
      readonly maxTokens?: number;
      readonly timeoutMs?: number;
      readonly maxCalls?: number;
    }
    export interface EnvelopeBudget {
      readonly maxTokens?: number;
      readonly timeoutMs?: number;
      readonly maxCalls?: number;
    }
    export interface ResolvedPileBudget {
      readonly maxTokens: number;
      readonly timeoutMs: number;
      readonly maxCalls?: number;
    }
    ```

    Add file-header comment citing Q-13 (six-variant taxonomy) and Q-10 (resolved budget shape).
    Per D-13: each PileFailure variant carries its own evidence shape — do NOT collapse fields across variants.
  </action>
  <verify>
    <automated>pnpm --filter @protostar/dogpile-adapter build &amp;&amp; grep -q "export type PileFailure" packages/dogpile-adapter/src/pile-failure-types.ts &amp;&amp; grep -q "pile-timeout" packages/dogpile-adapter/src/pile-failure-types.ts &amp;&amp; grep -q "pile-cancelled" packages/dogpile-adapter/src/pile-failure-types.ts &amp;&amp; [ "$(grep -cE '\"pile-(timeout|budget-exhausted|schema-parse|all-rejected|network|cancelled)\"' packages/dogpile-adapter/src/pile-failure-types.ts)" -eq 6 ]</automated>
  </verify>
  <done>
    Build passes; file declares all six `class` discriminator strings; all types exported.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: resolvePileBudget (Q-10) + tests</name>
  <files>packages/dogpile-adapter/src/resolve-pile-budget.ts, packages/dogpile-adapter/src/resolve-pile-budget.test.ts</files>
  <read_first>
    - packages/dogpile-adapter/src/pile-failure-types.ts (Task 1 output — import PresetBudget, EnvelopeBudget, ResolvedPileBudget)
    - .planning/phases/06-live-dogpile-piles/06-RESEARCH.md §"Example 1" (lines ~559-599 — full reference implementation)
  </read_first>
  <behavior>
    - resolvePileBudget(preset, envelope) returns `ResolvedPileBudget`.
    - Per-field semantics (Q-10): envelope clamps preset (intersect = min of each defined field). Envelope-omitted fields fall through to preset's value.
    - When BOTH preset and envelope omit a required field (maxTokens / timeoutMs), output uses `Number.MAX_SAFE_INTEGER`.
    - `maxCalls` is included in output iff at least one input defines it.
    - Pure function: deterministic, no I/O, no clock reads.
  </behavior>
  <action>
    First write the test file `resolve-pile-budget.test.ts` using `node:test` + `node:assert/strict`. Test cases (each as an `it(...)` block):
    1. preset.maxTokens=24000, envelope.maxTokens=12000 → resolved.maxTokens === 12000 (envelope clamps).
    2. preset.maxTokens=24000, envelope omits maxTokens → resolved.maxTokens === 24000 (envelope is cap not floor).
    3. preset omits maxTokens, envelope.maxTokens=8000 → resolved.maxTokens === 8000.
    4. both omit maxTokens → resolved.maxTokens === Number.MAX_SAFE_INTEGER.
    5. preset.timeoutMs=120000, envelope.timeoutMs=60000 → resolved.timeoutMs === 60000.
    6. preset.maxCalls=5, envelope omits → resolved.maxCalls === 5.
    7. neither defines maxCalls → resolved.maxCalls is undefined (key absent in result; assert via `assert.equal('maxCalls' in result, false)`).
    8. preset.maxCalls=10, envelope.maxCalls=3 → resolved.maxCalls === 3.

    Run tests — they FAIL (RED).

    Then implement `resolve-pile-budget.ts` exactly per RESEARCH Example 1: `minDefined` helper + main `resolvePileBudget` body. Re-run tests — GREEN.

    Per D-10 (Q-10): mirrors `intersectEnvelopes` from Phase 2 precedence kernel; preset is the proposal, envelope is the cap.
  </action>
  <verify>
    <automated>pnpm --filter @protostar/dogpile-adapter test --grep resolve-pile-budget 2>&amp;1 | grep -E "pass|✔" | grep -c "resolve-pile-budget" | awk '{ if ($1 &gt;= 8) exit 0; else exit 1 }'</automated>
  </verify>
  <done>
    All 8 test cases pass under `pnpm --filter @protostar/dogpile-adapter test --grep resolve-pile-budget`; function is pure (no fs/path imports — confirmed by Plan 01's static no-fs test running on same package).
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: mapSdkStopToPileFailure (Q-13) + tests + barrel re-export</name>
  <files>packages/dogpile-adapter/src/map-sdk-stop-to-pile-failure.ts, packages/dogpile-adapter/src/map-sdk-stop-to-pile-failure.test.ts, packages/dogpile-adapter/src/index.ts</files>
  <read_first>
    - packages/dogpile-adapter/src/pile-failure-types.ts (Task 1)
    - .planning/phases/06-live-dogpile-piles/06-RESEARCH.md §"Example 3" + §"Pitfall 1" (NormalizedStopReason has no top-level RunResult.accounting field; this helper takes the stop reason as a direct argument supplied by Plan 04)
    - node_modules/.pnpm/@dogpile+sdk@0.2.0/node_modules/@dogpile/sdk/dist/types.d.ts:289 (NormalizedStopReason union — confirm exact strings)
  </read_first>
  <behavior>
    - Signature: `mapSdkStopToPileFailure(stop: NormalizedStopReason, ctx: { kind: PileKind; elapsedMs: number; budget: ResolvedPileBudget; tokensConsumed?: number; iterationsConsumed?: number }): PileFailure | null`.
    - Mapping (Q-13):
      - `"budget:timeout"`     → `{ kind, class: "pile-timeout", elapsedMs: ctx.elapsedMs, configuredTimeoutMs: ctx.budget.timeoutMs }`
      - `"budget:tokens"`      → `{ kind, class: "pile-budget-exhausted", dimension: "tokens", consumed: ctx.tokensConsumed ?? 0, cap: ctx.budget.maxTokens }`
      - `"budget:iterations"`  → `{ kind, class: "pile-budget-exhausted", dimension: "calls", consumed: ctx.iterationsConsumed ?? 0, cap: ctx.budget.maxCalls ?? Number.MAX_SAFE_INTEGER }`
      - `"judge:rejected"`     → `{ kind, class: "pile-all-rejected", candidatesEvaluated: 0, judgeDecisions: [] }` (caller in Plan 04 fills these from event log; this helper returns the structural placeholder)
      - `"budget:cost"` | `"convergence"` | `"judge:accepted"` | `"judge:score-threshold"` → `null`
    - Exhaustive switch with `assertNever` default — TypeScript catches any future SDK enum addition.
    - Pure: no I/O, no clock reads (elapsedMs supplied by caller).
  </behavior>
  <action>
    Write test file first. Test cases (8):
    1. `"budget:timeout"` with elapsedMs=130000, budget.timeoutMs=120000 → returns `{ class: "pile-timeout", elapsedMs: 130000, configuredTimeoutMs: 120000 }`.
    2. `"budget:tokens"` with budget.maxTokens=12000, tokensConsumed=12500 → `{ class: "pile-budget-exhausted", dimension: "tokens", consumed: 12500, cap: 12000 }`.
    3. `"budget:iterations"` with budget.maxCalls=5, iterationsConsumed=5 → `{ class: "pile-budget-exhausted", dimension: "calls", consumed: 5, cap: 5 }`.
    4. `"budget:iterations"` with budget.maxCalls undefined → cap === Number.MAX_SAFE_INTEGER.
    5. `"judge:rejected"` → returns `{ class: "pile-all-rejected", candidatesEvaluated: 0, judgeDecisions: [] }`.
    6. `"budget:cost"` → returns `null`.
    7. `"convergence"` → returns `null`.
    8. `"judge:accepted"` → returns `null` AND `"judge:score-threshold"` → returns `null` (combine into one assert.deepEqual block).

    Run tests — RED. Implement `map-sdk-stop-to-pile-failure.ts` with exhaustive switch + `assertNever` default branch. Re-run — GREEN.

    Then update `packages/dogpile-adapter/src/index.ts`:
    - Re-export types: `export type { PileKind, PileFailure, JudgeDecisionRef, PresetBudget, EnvelopeBudget, ResolvedPileBudget, PileSourceOfTruth } from "./pile-failure-types.js";`.
    - Re-export functions: `export { resolvePileBudget } from "./resolve-pile-budget.js";` and `export { mapSdkStopToPileFailure } from "./map-sdk-stop-to-pile-failure.js";`.

    Per D-13 (Q-13): six-variant union is the wire format Phase 8 will branch on; fineness is intentional.
  </action>
  <verify>
    <automated>pnpm --filter @protostar/dogpile-adapter test --grep map-sdk-stop &amp;&amp; pnpm --filter @protostar/dogpile-adapter build &amp;&amp; node -e "const m=require('@protostar/dogpile-adapter'); if (typeof m.resolvePileBudget !== 'function') throw new Error('missing resolvePileBudget'); if (typeof m.mapSdkStopToPileFailure !== 'function') throw new Error('missing mapSdkStopToPileFailure'); console.log('barrel ok')"</automated>
  </verify>
  <done>
    All 8 mapper tests pass; barrel re-exports both functions and the type bundle; package build passes; the dogpile-adapter no-fs static test (Plan 01 Task 3) still passes (no fs imports introduced).
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| @dogpile/sdk NormalizedStopReason → mapSdkStopToPileFailure | Pinned-SDK enum boundary; new enum values must error at compile time, not silently miss. |
| envelope (operator policy) → preset (developer default) | Trust direction: envelope is authority, preset is proposal; helper must never let preset exceed envelope. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-6-04 | Tampering / Elevation | resolvePileBudget allows preset to exceed envelope cap | mitigate | Per-field min semantics enforced; tests 1, 5, 8 prove envelope clamps preset; assertion is the only path so a bug fails the test |
| T-6-13 | Tampering | New SDK enum value falls through silently | mitigate | Exhaustive switch with `assertNever` default — TS compile error on missing case |
| T-6-14 | Information Disclosure | PileFailure evidence carries secrets (token contents, raw error stacks) | accept | All evidence fields are typed numerics or short strings (codes, dimensions); no message bodies leak from this layer |
</threat_model>

<verification>
- `pnpm --filter @protostar/dogpile-adapter test` passes all new tests.
- `pnpm --filter @protostar/dogpile-adapter build` passes.
- The static no-fs contract test (from Plan 01) still passes after these new files land.
</verification>

<success_criteria>
- Plan 04 (`runFactoryPile`) can `import { resolvePileBudget, mapSdkStopToPileFailure, type PileFailure, type ResolvedPileBudget, type PileKind } from "./pile-failure-types.js"` (or via the barrel).
- `pnpm verify` continues to pass repo-wide.
- All three tasks produce green automated verifications.
</success_criteria>

<output>
After completion, create `.planning/phases/06-live-dogpile-piles/06-03-SUMMARY.md` recording: PileFailure shape, helper test counts, barrel exports.
</output>
