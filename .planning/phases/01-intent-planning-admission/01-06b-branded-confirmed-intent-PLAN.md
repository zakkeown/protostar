---
phase: 01-intent-planning-admission
plan: 06b
type: execute
wave: 3
depends_on: [04, 05, 06a]
files_modified:
  # Task A — brand + private mint + drop public assertConfirmedIntent
  - packages/intent/src/confirmed-intent.ts
  - packages/intent/src/confirmed-intent/index.ts
  - packages/intent/src/confirmed-intent-readonly.contract.ts
  - packages/intent/src/confirmed-intent-immutability.test.ts
  - packages/intent/src/promote-intent-draft.ts
  - packages/intent/src/index.ts
  - packages/intent/src/example-intent-fixtures.test.ts
  - packages/intent/src/example-intent-fixtures.test-support.ts
  # Task B — internal/test-builders subpath + intent-package test migration
  - packages/intent/src/internal/test-builders.ts
  - packages/intent/package.json
  - packages/intent/src/acceptance-criteria-normalization.test.ts
  - packages/intent/src/public-split-exports.contract.test.ts
  # Task C1 — cross-package test migration + dogpile-adapter
  - packages/dogpile-adapter/src/public-candidate-plan.contract.test.ts
  - packages/planning/src/candidate-admitted-plan-boundary.contract.ts
  - packages/planning/src/confirmed-intent-boundary.contract.ts
  - packages/planning/src/admitted-plan-handoff.test.ts
  - packages/planning/src/dogpile-candidate-plan-parsing.test.ts
  - packages/planning/src/acceptance-criterion-coverage-admission.test.ts
  - packages/planning/src/public-split-exports.contract.test.ts
  - packages/planning/src/pre-handoff-verification-admission.test.ts
  - packages/planning/src/duplicate-task-id-admission.test.ts
  - packages/planning/src/capability-envelope-grant-fields.test.ts
  - packages/planning/src/transitive-dependency-cycle-admission.test.ts
  - packages/planning/src/candidate-plan-admission.test.ts
  - packages/planning/src/task-risk-policy-compatibility-admission.test.ts
  - packages/planning/src/write-capability-envelope-admission.test.ts
  - packages/planning/src/release-grant-admission.test.ts
  - packages/planning/src/release-capability-envelope-admission.test.ts
  - packages/planning/src/task-required-capabilities-admission.test.ts
  - packages/planning/src/immediate-dependency-loop-admission.test.ts
  - packages/planning/src/plan-acceptance-criteria.test.ts
  - packages/planning/src/planning-admission-artifact.test.ts
  - packages/planning/src/self-task-dependency-admission.test.ts
  - packages/planning/src/unknown-ac-reference.test.ts
  - packages/planning/src/task-risk-declaration-admission.test.ts
  - packages/planning/src/plan-task-coverage.test.ts
  - packages/planning/src/planning-admission-evidence.test.ts
  - packages/planning/src/missing-task-dependency-admission.test.ts
  - packages/planning/src/pr-capability-envelope-admission.test.ts
  # Task C2 — factory-cli surgery (drop --intent flag + confirmed-intent-input source)
  - apps/factory-cli/src/confirmed-intent-handoff.ts
  - apps/factory-cli/src/confirmed-intent-handoff.contract.ts
  - apps/factory-cli/src/main.ts
  - apps/factory-cli/src/main.test.ts
  # Task D — admission-e2e public-surface contract test
  - packages/admission-e2e/src/confirmed-intent-mint.contract.test.ts
autonomous: true
requirements:
  - INTENT-02
must_haves:
  truths:
    - "ConfirmedIntent is a branded type (unique-symbol) — passing any plain object literal where ConfirmedIntent is required fails type-check (Q-03, Q-13b)"
    - "promoteIntentDraft is the SOLE function on @protostar/intent's public surface that produces a ConfirmedIntent (Q-13b)"
    - "assertConfirmedIntent is REMOVED from every public/subpath barrel of @protostar/intent (Q-13b — supersedes original Plan 06b step 1f)"
    - "defineConfirmedIntent is DELETED from the codebase (no rename, no internal alias)"
    - "buildConfirmedIntentForTest exists ONLY at the @protostar/intent/internal/test-builders subpath; it is invisible to `import * as IntentPublicApi from \"@protostar/intent\"` (Q-13d)"
    - "factory-cli no longer accepts a pre-confirmed-intent JSON file; the --intent CLI flag, the `intentPath` option, and the `confirmed-intent-input` ConfirmedIntentHandoffSource are all removed (Q-13c)"
    - "createConfirmedIntentHandoff has only one source — `draft-admission-gate` — with a non-optional `promotedIntent` input"
    - "ConfirmedIntent carries readonly schemaVersion: '1.0.0' and readonly signature: SignatureEnvelope | null (always null in Phase 1, per Q-13)"
    - "A contract test in admission-e2e pins the public surface — adding any new ConfirmedIntent producer fails `tsc -b`"
    - "Repo-wide build (`pnpm -r build`) and tests (`pnpm run verify:full`) pass with all 33+ migrated callsites green"
  artifacts:
    - path: packages/intent/src/confirmed-intent.ts
      provides: "Branded ConfirmedIntent type + module-private unique-symbol brand + module-internal mintConfirmedIntent + narrowed parseConfirmedIntent (returns ConfirmedIntentData on success). assertConfirmedIntent stays in this file ONLY as an internal helper if needed; not on any barrel."
      contains: "ConfirmedIntentBrand"
    - path: packages/intent/src/promote-intent-draft.ts
      provides: "promoteIntentDraft — the SOLE public producer of ConfirmedIntent; calls mintConfirmedIntent on the success branch."
      contains: "mintConfirmedIntent"
    - path: packages/intent/src/internal/test-builders.ts
      provides: "buildConfirmedIntentForTest(data: ConfirmedIntentData): ConfirmedIntent — test-only producer accessible via the @protostar/intent/internal/test-builders subpath. Calls mintConfirmedIntent directly."
      contains: "buildConfirmedIntentForTest"
    - path: packages/intent/package.json
      provides: "exports map adds ./internal/test-builders entry — separate from any consumer-facing subpath; banner in test-builders.ts marks it unstable test-only."
      contains: "./internal/test-builders"
    - path: apps/factory-cli/src/confirmed-intent-handoff.ts
      provides: "createConfirmedIntentHandoff with single source `draft-admission-gate` — confirmed-intent-input branch fully removed; promotedIntent input is non-optional."
      contains: "draft-admission-gate"
    - path: packages/admission-e2e/src/confirmed-intent-mint.contract.test.ts
      provides: "Contract test pinning that exactly one public-surface key (promoteIntentDraft) returns ConfirmedIntent. Negative assertion that buildConfirmedIntentForTest is NOT in the public surface."
  key_links:
    - from: packages/intent/src/promote-intent-draft.ts
      to: packages/intent/src/confirmed-intent.ts
      via: mintConfirmedIntent (sibling import — module-private brand, sibling-export mint)
      pattern: "mintConfirmedIntent"
    - from: packages/intent/src/internal/test-builders.ts
      to: packages/intent/src/confirmed-intent.ts
      via: mintConfirmedIntent (sibling import — same module-private brand, accessible only because internal/ is in-package)
      pattern: "mintConfirmedIntent"
    - from: packages/admission-e2e/src/confirmed-intent-mint.contract.test.ts
      to: "@protostar/intent (public barrel) + @protostar/intent/internal/brand-witness"
      via: type-level Equal<MintingKeys, "promoteIntentDraft"> + negative keyof assertion
      pattern: "MintingKeys"
---

<objective>
Make ConfirmedIntent a branded type produced ONLY by promoteIntentDraft on the public surface, with a dedicated non-public `internal/test-builders` subpath providing `buildConfirmedIntentForTest` for the 30+ test sites that previously called `defineConfirmedIntent`. Drop `assertConfirmedIntent` from every public barrel and remove the `confirmed-intent-input` CLI bypass entirely. This closes INTENT-02 by ensuring no test or CLI path can produce a ConfirmedIntent except through promoteIntentDraft (production) or buildConfirmedIntentForTest (tests, non-public).

This plan supersedes the BLOCKED original Plan 06b. The blocker SUMMARY at `01-06b-branded-confirmed-intent-SUMMARY.md` records the contradictions resolved here. User decisions Q-13b/c/d in 01-CONTEXT.md lock the dispositions:

- **Q-13b** — assertConfirmedIntent disposition: **Option A** (drop from public barrel; promoteIntentDraft is the only public producer).
- **Q-13c** — `confirmed-intent-input` CLI source: **Option α** (drop entirely; --intent flag + intentPath option also removed).
- **Q-13d** — Test helper for 30+ migration sites: **in scope** (`@protostar/intent/internal/test-builders` subpath).

Purpose: A weak intent must not reach execution via any path. The brand defeats compile-time forgery; the public-surface contract test catches future "I'll just export it for tests" regressions; the non-public test subpath keeps the migration mechanical without weakening the public surface.

Output: Branded ConfirmedIntent with private mint, two non-public mint paths (mintConfirmedIntent for sibling files, buildConfirmedIntentForTest for tests via subpath), 33+ migrated callsites, factory-cli with single draft-admission source, and a public-surface contract test.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/phases/01-intent-planning-admission/01-CONTEXT.md
@.planning/phases/01-intent-planning-admission/01-06a-SUMMARY.md
@.planning/phases/01-intent-planning-admission/01-06b-branded-confirmed-intent-SUMMARY.md
@.planning/codebase/CONVENTIONS.md
@packages/intent/src/confirmed-intent.ts
@packages/intent/src/confirmed-intent/index.ts
@packages/intent/src/promote-intent-draft.ts
@packages/intent/src/index.ts
@packages/intent/src/public-split-exports.contract.test.ts
@packages/intent/src/confirmed-intent-readonly.contract.ts
@packages/intent/schema/confirmed-intent.schema.json
@packages/intent/package.json
@apps/factory-cli/src/confirmed-intent-handoff.ts
@apps/factory-cli/src/confirmed-intent-handoff.contract.ts
@apps/factory-cli/src/main.ts
</context>

<interfaces>
**Branded shape (Task A produces this exactly):**

```ts
// packages/intent/src/confirmed-intent.ts
declare const ConfirmedIntentBrand: unique symbol;

export interface SignatureEnvelope {
  readonly algorithm: string;
  readonly value: string;
}

// ConfirmedIntentData = the un-branded payload (what defineConfirmedIntent used to produce shape-wise).
export type ConfirmedIntentData = DeepReadonly<{ /* existing fields */ }> & {
  readonly schemaVersion: "1.0.0";
  readonly signature: SignatureEnvelope | null;
};

export type ConfirmedIntent = ConfirmedIntentData & {
  readonly [ConfirmedIntentBrand]: true;
};

// Module-internal mint — exported for sibling files (promote-intent-draft.ts,
// internal/test-builders.ts). NOT on any public barrel.
export function mintConfirmedIntent(data: ConfirmedIntentData): ConfirmedIntent;

// parseConfirmedIntent retains its public role (validates external JSON) but its
// success branch is NARROWED to ConfirmedIntentData (un-branded). Callers that
// need the brand must re-promote via promoteIntentDraft.
export function parseConfirmedIntent(input: unknown):
  | { readonly ok: true; readonly data: ConfirmedIntentData }
  | { readonly ok: false; readonly errors: readonly string[] };

// assertConfirmedIntent: REMOVED from public/subpath barrels (Q-13b Option A).
// May remain as an internal helper inside confirmed-intent.ts if needed,
// but MUST NOT be re-exported from index.ts or confirmed-intent/index.ts.

// defineConfirmedIntent: DELETED entirely (no rename, no alias).
```

**Test helper (Task B produces this exactly):**

```ts
// packages/intent/src/internal/test-builders.ts
// PRIVATE SUBPATH — test-only. NOT a public API. Phase 2 may relocate or
// remove without notice. DO NOT import from production code or from
// packages/intent/src/index.ts or any consumer-facing subpath barrel.
import { mintConfirmedIntent, type ConfirmedIntent, type ConfirmedIntentData }
  from "../confirmed-intent.js";

/** Test-only producer: mints a ConfirmedIntent from already-shaped data without
 *  running the promotion pipeline. Use ONLY in test files. Production code
 *  must obtain ConfirmedIntent via promoteIntentDraft.
 */
export function buildConfirmedIntentForTest(data: ConfirmedIntentData): ConfirmedIntent {
  return mintConfirmedIntent(data);
}
```

**Migration shape — every test that today calls `defineConfirmedIntent({...})`** swaps to:

```ts
import { buildConfirmedIntentForTest } from "@protostar/intent/internal/test-builders";
const x = buildConfirmedIntentForTest({ /* same payload + schemaVersion: "1.0.0", signature: null */ });
```

The helper signature `(data: ConfirmedIntentData) => ConfirmedIntent` is intentionally a near-mechanical replacement for `defineConfirmedIntent` so the 30+ migrated callsites do not need restructuring — only the new `schemaVersion` + `signature` fields must be added per fixture (or supplied by a default-merging variant — executor's call; the simplest is a tiny wrapper that fills the two new fields if absent).

**factory-cli single-source handoff (Task C2 produces this):**

```ts
// apps/factory-cli/src/confirmed-intent-handoff.ts
import type { ConfirmedIntent } from "@protostar/intent/confirmed-intent";
import type { PromoteIntentDraftResult } from "@protostar/intent/admission";

export type ConfirmedIntentHandoffSource = "draft-admission-gate"; // single source

export interface ConfirmedIntentHandoff {
  readonly source: ConfirmedIntentHandoffSource;
  readonly intent: ConfirmedIntent;
  readonly ambiguityAssessment: IntentAmbiguityAssessment;
}

export interface CreateConfirmedIntentHandoffInput {
  readonly intentMode: IntentAmbiguityMode;
  readonly promotedIntent: PromoteIntentDraftResult; // NON-optional
}

export function createConfirmedIntentHandoff(
  input: CreateConfirmedIntentHandoffInput
): ConfirmedIntentHandoff {
  if (!input.promotedIntent.ok) {
    throw new Error("Cannot hand a failed IntentDraft admission result to downstream factory stages.");
  }
  return {
    source: "draft-admission-gate",
    intent: input.promotedIntent.intent,
    ambiguityAssessment: input.promotedIntent.ambiguityAssessment
  };
}
```

The `assertConfirmedIntent` import is removed; `parsedIntentInput` parameter is removed; the `confirmed-intent-input` literal disappears from the union (becomes a single literal type).
</interfaces>

<tasks>

<task type="auto" tdd="true">
  <name>Task A: Brand ConfirmedIntent + module-internal mint + drop assertConfirmedIntent + delete defineConfirmedIntent</name>
  <read_first>
    - /Users/zakkeown/Code/protostar/packages/intent/src/confirmed-intent.ts (current type + every mint site; defineConfirmedIntent + assertConfirmedIntent + parseConfirmedIntent definitions)
    - /Users/zakkeown/Code/protostar/packages/intent/src/confirmed-intent/index.ts (subpath barrel — currently re-exports defineConfirmedIntent + assertConfirmedIntent + parseConfirmedIntent)
    - /Users/zakkeown/Code/protostar/packages/intent/src/confirmed-intent-readonly.contract.ts (current readonly contract — needs schemaVersion + signature added)
    - /Users/zakkeown/Code/protostar/packages/intent/src/confirmed-intent-immutability.test.ts (existing tests using defineConfirmedIntent — migrate to promoteIntentDraft)
    - /Users/zakkeown/Code/protostar/packages/intent/src/promote-intent-draft.ts (lines 178-192 — calls defineConfirmedIntent today; switches to mintConfirmedIntent)
    - /Users/zakkeown/Code/protostar/packages/intent/src/index.ts (public barrel — verify what is exported; will lose defineConfirmedIntent + assertConfirmedIntent)
    - /Users/zakkeown/Code/protostar/packages/intent/src/example-intent-fixtures.test.ts (lines 166, 243 — call `parseConfirmedIntent(...).intent`; narrowing renames `.intent` → `.data`)
    - /Users/zakkeown/Code/protostar/packages/intent/src/example-intent-fixtures.test-support.ts (fixture loader exposing parseConfirmedIntent result)
    - /Users/zakkeown/Code/protostar/packages/intent/schema/confirmed-intent.schema.json (Plan 04 schema — already includes schemaVersion + nullable signature; TS type catches up here)
  </read_first>
  <behavior>
    - At module scope of confirmed-intent.ts: `declare const ConfirmedIntentBrand: unique symbol` (NOT exported, NOT named).
    - `ConfirmedIntent` type intersects un-branded `ConfirmedIntentData` (which includes `schemaVersion: "1.0.0"` + `signature: SignatureEnvelope | null`) with `{ readonly [ConfirmedIntentBrand]: true }`.
    - `mintConfirmedIntent` is exported from confirmed-intent.ts (sibling-importable) but NOT re-exported from index.ts or confirmed-intent/index.ts.
    - `promoteIntentDraft` is the only sibling caller of `mintConfirmedIntent` after Task A. (Task B adds the second sibling caller — `internal/test-builders.ts`.)
    - `parseConfirmedIntent` is still exported publicly, but its success branch returns `{ ok: true; data: ConfirmedIntentData }` (no brand). Existing consumers that index `.intent` on the success arm must update to `.data`.
    - `assertConfirmedIntent` is REMOVED from `packages/intent/src/index.ts` AND from `packages/intent/src/confirmed-intent/index.ts`. It may remain as a non-exported internal helper in confirmed-intent.ts if its narrowing is used internally, OR it can be deleted entirely if no internal caller remains. Executor checks: `grep -rln "assertConfirmedIntent" packages/intent/src/` after the change — every match must be inside confirmed-intent.ts (declaration only) OR zero matches.
    - `defineConfirmedIntent` is DELETED. Any freeze/normalization logic it performed is folded into `mintConfirmedIntent` directly. `grep -rln "defineConfirmedIntent" packages/intent/src/` after Task A must return zero matches.
    - Compile-time: `const x: ConfirmedIntent = { goal: 'x', ... }` fails because the brand property is missing.
    - Phase 1 mints always produce `schemaVersion: "1.0.0"` and `signature: null` literally.
    - Existing immutability + readonly contract tests pass after the brand is added (DeepReadonly preserved); immutability test is migrated to mint via `promoteIntentDraft` rather than `defineConfirmedIntent`.
  </behavior>
  <action>
    1. **Edit `packages/intent/src/confirmed-intent.ts`:**
       a. Add at module top: `declare const ConfirmedIntentBrand: unique symbol;` (no export).
       b. Add `export interface SignatureEnvelope { readonly algorithm: string; readonly value: string }` (Phase 2 GOV-06 will use; Phase 1 emits null only).
       c. Define/promote `export type ConfirmedIntentData = <existing-readonly-shape> & { readonly schemaVersion: "1.0.0"; readonly signature: SignatureEnvelope | null }`.
       d. Redefine `export type ConfirmedIntent = ConfirmedIntentData & { readonly [ConfirmedIntentBrand]: true }`.
       e. Delete `defineConfirmedIntent` (the entire export). Any freeze / normalization step it performed is folded into `mintConfirmedIntent`.
       f. Add `export function mintConfirmedIntent(data: ConfirmedIntentData): ConfirmedIntent { return { ...data, [ConfirmedIntentBrand]: true } as ConfirmedIntent; }` — NOTE the `export` is for sibling files only; barrel scrubs in step 4 keep it off the public surface.
       g. Narrow `parseConfirmedIntent`'s result type: success branch becomes `{ readonly ok: true; readonly data: ConfirmedIntentData }`. Update its body to no longer call the (deleted) `defineConfirmedIntent` — return the validated payload directly under the `data` key. Update the exported result type alias (`ConfirmedIntentParseResult` or whatever it's called).
       h. **Decide on `assertConfirmedIntent`.** Two options, executor picks based on internal usage:
          - (i) If no caller inside `packages/intent/src/` remains after step 4 below, delete it.
          - (ii) If an internal caller remains, keep it as a non-exported file-local function (drop the `export` keyword).
          Either way, it is GONE from `packages/intent/src/index.ts` and `packages/intent/src/confirmed-intent/index.ts` per Q-13b.

    2. **Edit `packages/intent/src/promote-intent-draft.ts`:** Replace the success-branch call (currently `defineConfirmedIntent({...})`) with `mintConfirmedIntent({...})`. Import via relative `./confirmed-intent.js`. Add the `schemaVersion: "1.0.0"` and `signature: null` literals to the data passed to `mintConfirmedIntent`. Confirm exactly one call site: `grep -c "mintConfirmedIntent" packages/intent/src/promote-intent-draft.ts` == 1.

    3. **Edit `packages/intent/src/confirmed-intent-readonly.contract.ts`:** Add `"schemaVersion"` and `"signature"` to the expected key set of the `Assert<KeysEqual<ConfirmedIntent, ...>>` helper. Add a comment: `// The unique-symbol brand property is module-private and CANNOT appear in the foreign-module key set; KeysEqual asserts the structural shape only.`

    4. **Edit `packages/intent/src/index.ts`:** Remove every export of `defineConfirmedIntent` and `assertConfirmedIntent`. Verify with `grep -E "(defineConfirmedIntent|assertConfirmedIntent|mintConfirmedIntent|ConfirmedIntentBrand)" packages/intent/src/index.ts | grep -v '^\s*//\|^\s*\*'` == empty. Keep: `ConfirmedIntent` (type), `ConfirmedIntentData` (type), `SignatureEnvelope` (type), `parseConfirmedIntent` (value, narrowed), `promoteIntentDraft` (value, from 06a). Same scrub on `packages/intent/src/confirmed-intent/index.ts` — strip both `defineConfirmedIntent` and `assertConfirmedIntent`.

    5. **Edit `packages/intent/src/example-intent-fixtures.test.ts`:** At lines 166 and 243 (and any other site using `parseConfirmedIntent(...).intent`), rename `.intent` → `.data`. Also update `packages/intent/src/example-intent-fixtures.test-support.ts` if it surfaces the parse result type to consumers.

    6. **Edit `packages/intent/src/confirmed-intent-immutability.test.ts`:** Replace `defineConfirmedIntent` calls with `promoteIntentDraft` calls (using a passing draft fixture from `intent/src/example-intent-fixtures.test-support.ts`). Add assertions: `result.intent.schemaVersion === "1.0.0"` and `result.intent.signature === null`.

    7. **Verify:**
       - `pnpm --filter @protostar/intent build` exits 0.
       - `pnpm --filter @protostar/intent test` — at this point the public-split-exports.contract.test.ts inside intent will FAIL because it still references `defineConfirmedIntent` / `assertConfirmedIntent`. That's expected; Task B fixes it. Skip this filter and instead run `pnpm --filter @protostar/intent test -- --test-only-known-good` if your runner supports it, or accept that the intent test gate is red until Task B lands. The repo-wide build (`pnpm -r build`) WILL fail because cross-package callsites still import the deleted symbols — Tasks B+C fix those.
       - **Self-check before commit:** `grep -rln "defineConfirmedIntent" packages/intent/src/` == 0 (entirely gone from intent's source). `grep -E "assertConfirmedIntent" packages/intent/src/index.ts packages/intent/src/confirmed-intent/index.ts | grep -v '^\s*//\|^\s*\*'` == 0 (off both barrels).

       **Note to executor:** Task A intentionally leaves the repo non-building because dozens of cross-package callsites still reference the deleted symbols. Tasks B and C migrate those. Do NOT attempt to satisfy `pnpm -r build` at the end of Task A — the build gate moves to Task C2's verify step.
  </action>
  <verify>
    <automated>cd /Users/zakkeown/Code/protostar && pnpm --filter @protostar/intent build && (grep -E "(defineConfirmedIntent|assertConfirmedIntent|mintConfirmedIntent|ConfirmedIntentBrand)" packages/intent/src/index.ts packages/intent/src/confirmed-intent/index.ts | grep -v '^\s*//\|^\s*\*' && echo BARREL_LEAK_DETECTED && exit 1) || (! grep -rl "defineConfirmedIntent" packages/intent/src/ && echo TASK_A_BARREL_AND_DELETION_CLEAN)</automated>
  </verify>
  <acceptance_criteria>
    - `grep -v '^\s*//\|^\s*\*' packages/intent/src/confirmed-intent.ts | grep -c "ConfirmedIntentBrand"` >= 2 (declare + intersection).
    - `grep -rln "defineConfirmedIntent" packages/intent/src/` == 0 (deleted entirely).
    - `grep -v '^\s*//\|^\s*\*' packages/intent/src/index.ts | grep -cE "(mintConfirmedIntent|ConfirmedIntentBrand|defineConfirmedIntent|assertConfirmedIntent)"` == 0 (all four absent from public barrel).
    - `grep -v '^\s*//\|^\s*\*' packages/intent/src/confirmed-intent/index.ts | grep -cE "(mintConfirmedIntent|defineConfirmedIntent|assertConfirmedIntent)"` == 0 (subpath barrel also clean).
    - `grep -c "promoteIntentDraft" packages/intent/src/index.ts` >= 1 (still exported as public mint).
    - `grep -c "schemaVersion" packages/intent/src/confirmed-intent.ts` >= 2 (type field + mint site literal).
    - `grep -c "signature" packages/intent/src/confirmed-intent.ts` >= 2 (type field + mint site literal).
    - `grep -c "mintConfirmedIntent" packages/intent/src/promote-intent-draft.ts` == 1 (sole sibling caller post-Task-A; Task B adds a second in internal/test-builders.ts).
    - `pnpm --filter @protostar/intent build` exits 0.
    - **Manual TS spike (record in SUMMARY):** `const x: ConfirmedIntent = { goal: 'x', ... } as { readonly [k: string]: unknown }` fails with `Property [ConfirmedIntentBrand] is missing`. Not a gate, but a signal the brand works.
    - **Expected red gates** (will be green after Tasks B+C): `pnpm --filter @protostar/intent test` (public-split-exports.contract.test.ts still references deleted symbols), `pnpm -r build` (cross-package callsites unmigrated).
  </acceptance_criteria>
  <done>Branded type compiled inside intent package; private mint enforced; defineConfirmedIntent + assertConfirmedIntent removed from every barrel; deletion of defineConfirmedIntent confirmed via grep. Repo-wide build is intentionally red pending Tasks B+C.</done>
</task>

<task type="auto" tdd="true">
  <name>Task B: Add internal/test-builders subpath + migrate intent-package-internal test callsites</name>
  <read_first>
    - /Users/zakkeown/Code/protostar/packages/intent/package.json (current exports map)
    - /Users/zakkeown/Code/protostar/packages/intent/src/confirmed-intent.ts (Task A landed mintConfirmedIntent + ConfirmedIntentData)
    - /Users/zakkeown/Code/protostar/packages/intent/src/acceptance-criteria-normalization.test.ts (calls defineConfirmedIntent — migrate)
    - /Users/zakkeown/Code/protostar/packages/intent/src/public-split-exports.contract.test.ts (calls defineConfirmedIntent + parseConfirmedIntent via subpath; needs migration + extension to assert internal/test-builders is NOT in IntentPublicApi keys)
    - /Users/zakkeown/Code/protostar/packages/intent/src/index.ts (Task A scrubbed; verify still no references to internal/)
  </read_first>
  <behavior>
    - `packages/intent/src/internal/test-builders.ts` exists with `buildConfirmedIntentForTest(data: ConfirmedIntentData): ConfirmedIntent` calling `mintConfirmedIntent` directly. Top-of-file banner marks it test-only/unstable.
    - `packages/intent/package.json` exports map gains a `./internal/test-builders` entry mapping to `./dist/internal/test-builders.{d.ts,js}`.
    - `packages/intent/src/index.ts` and `packages/intent/src/confirmed-intent/index.ts` and EVERY other consumer-facing barrel under `packages/intent/src/` MUST NOT import or re-export from `./internal/test-builders`.
    - `packages/intent/src/acceptance-criteria-normalization.test.ts` and `packages/intent/src/public-split-exports.contract.test.ts` are migrated from `defineConfirmedIntent` → `buildConfirmedIntentForTest` (imported from the subpath).
    - `packages/intent/src/public-split-exports.contract.test.ts` is extended to assert (a) `ConfirmedIntent` expected-key-set includes `schemaVersion` + `signature`, (b) negative `keyof typeof IntentPublicApi` does NOT include `defineConfirmedIntent`, `assertConfirmedIntent`, `mintConfirmedIntent`, OR `buildConfirmedIntentForTest`.
    - `pnpm --filter @protostar/intent test` is green after Task B.
  </behavior>
  <action>
    1. **Create `packages/intent/src/internal/test-builders.ts`:**
       ```ts
       // ============================================================================
       // PRIVATE SUBPATH — TEST-ONLY. NOT a public API.
       //
       // This file is reachable only via the `@protostar/intent/internal/test-builders`
       // subpath import. Phase 2 may relocate or remove this file without notice.
       //
       // RULES:
       //  - DO NOT import from production code.
       //  - DO NOT re-export from packages/intent/src/index.ts or any consumer-facing
       //    subpath barrel under packages/intent/src/. The admission-e2e contract test
       //    in Plan 06b Task D enforces this.
       //  - Production code that needs a ConfirmedIntent must call promoteIntentDraft.
       // ============================================================================

       import {
         mintConfirmedIntent,
         type ConfirmedIntent,
         type ConfirmedIntentData
       } from "../confirmed-intent.js";

       /** Test-only producer. Mints a ConfirmedIntent from already-shaped data without
        *  running the promotion pipeline. The callsite-mechanical replacement for the
        *  deleted defineConfirmedIntent. */
       export function buildConfirmedIntentForTest(data: ConfirmedIntentData): ConfirmedIntent {
         return mintConfirmedIntent(data);
       }
       ```

    2. **Edit `packages/intent/package.json`:** Add the following entry to `exports` (preserving existing entries; ordering: place after `./admission` for visual grouping):
       ```json
       "./internal/test-builders": {
         "types": "./dist/internal/test-builders.d.ts",
         "import": "./dist/internal/test-builders.js"
       }
       ```
       Do NOT add an `./internal` wildcard. The subpath name is intentionally specific so Task D can grep for it precisely.

    3. **Verify the subpath isn't leaked from any in-package barrel.** Run:
       ```bash
       grep -rE "from ['\"]\\./internal/test-builders['\"]|from ['\"]\\./internal\\.js['\"]|from ['\"]\\./internal/" packages/intent/src/ --include='*.ts' | grep -v '^\s*//\|^\s*\*' | grep -v '/internal/test-builders\.ts:'
       ```
       Expected output: every match (besides comments) is inside a `*.test.ts` file. If any non-test file imports from `./internal/`, abort the task — that's a leak.

    4. **Migrate `packages/intent/src/acceptance-criteria-normalization.test.ts`:** Replace `import { defineConfirmedIntent } from "@protostar/intent"` with `import { buildConfirmedIntentForTest } from "@protostar/intent/internal/test-builders"`. Replace every `defineConfirmedIntent({...})` call with `buildConfirmedIntentForTest({..., schemaVersion: "1.0.0", signature: null })`. The two new fields are required by the new ConfirmedIntentData shape.

    5. **Migrate + extend `packages/intent/src/public-split-exports.contract.test.ts`:**
       a. Replace `defineConfirmedIntent` calls with `buildConfirmedIntentForTest` (imported from `@protostar/intent/internal/test-builders`).
       b. Update existing `KeysEqual<ConfirmedIntent, ...>` Assert to include `"schemaVersion"` and `"signature"` in the expected key set. Add comment: `// Brand symbol is module-private and not foreign-namable; KeysEqual asserts the structural shape only.`
       c. Add new negative assertion block:
          ```ts
          import * as IntentPublicApi from "@protostar/intent";
          type IntentPublicKeys = keyof typeof IntentPublicApi;
          type Assert<T extends true> = T;
          // None of these may appear on the public barrel:
          type _NoDefineConfirmedIntent = Assert<"defineConfirmedIntent" extends IntentPublicKeys ? false : true>;
          type _NoAssertConfirmedIntent = Assert<"assertConfirmedIntent" extends IntentPublicKeys ? false : true>;
          type _NoMintConfirmedIntent = Assert<"mintConfirmedIntent" extends IntentPublicKeys ? false : true>;
          type _NoBuildConfirmedIntentForTest = Assert<"buildConfirmedIntentForTest" extends IntentPublicKeys ? false : true>;
          ```
          (If the existing file uses a different pattern for negative assertions, match its style — but cover all four names.)

    6. **Verify:**
       - `pnpm --filter @protostar/intent build` exits 0 (the new internal subpath compiles into `dist/internal/test-builders.{js,d.ts}`).
       - `pnpm --filter @protostar/intent test` exits 0 (intent's own tests now green).
       - `ls packages/intent/dist/internal/test-builders.js` exists.
       - `node -e "import('@protostar/intent/internal/test-builders').then(m => console.log(typeof m.buildConfirmedIntentForTest))"` (run from `packages/intent/`) prints `function`. (Smoke check that the export path resolves.)
  </action>
  <verify>
    <automated>cd /Users/zakkeown/Code/protostar && pnpm --filter @protostar/intent build && pnpm --filter @protostar/intent test</automated>
  </verify>
  <acceptance_criteria>
    - `ls packages/intent/src/internal/test-builders.ts` exists.
    - `grep -c "buildConfirmedIntentForTest" packages/intent/src/internal/test-builders.ts` >= 1.
    - `grep -c "mintConfirmedIntent" packages/intent/src/internal/test-builders.ts` >= 1.
    - `grep -c "PRIVATE SUBPATH" packages/intent/src/internal/test-builders.ts` >= 1 (banner present).
    - `grep -c '"./internal/test-builders"' packages/intent/package.json` >= 1.
    - `grep -rE "from ['\"]\\./internal/" packages/intent/src/ --include='*.ts' | grep -v '^\s*//\|^\s*\*' | grep -v 'internal/test-builders\.ts' | grep -v '\.test\.ts:'` returns empty (no non-test in-package file imports the subpath).
    - `grep -c "buildConfirmedIntentForTest" packages/intent/src/acceptance-criteria-normalization.test.ts` >= 1.
    - `grep -c "buildConfirmedIntentForTest" packages/intent/src/public-split-exports.contract.test.ts` >= 1.
    - `grep -c "defineConfirmedIntent" packages/intent/src/acceptance-criteria-normalization.test.ts` == 0.
    - `grep -c "defineConfirmedIntent" packages/intent/src/public-split-exports.contract.test.ts` == 0.
    - `pnpm --filter @protostar/intent test` exits 0.
  </acceptance_criteria>
  <done>internal/test-builders subpath wired and importable; intent package builds + tests green.</done>
</task>

<task type="auto" tdd="true">
  <name>Task C1: Migrate cross-package test callsites (planning + dogpile-adapter) to buildConfirmedIntentForTest</name>
  <read_first>
    - /Users/zakkeown/Code/protostar/packages/intent/src/internal/test-builders.ts (Task B — confirms the helper signature)
    - /Users/zakkeown/Code/protostar/packages/planning/src/admitted-plan-handoff.test.ts (sample callsite for the migration shape)
    - /Users/zakkeown/Code/protostar/packages/planning/src/candidate-admitted-plan-boundary.contract.ts (type-level contract using defineConfirmedIntent)
    - /Users/zakkeown/Code/protostar/packages/planning/src/confirmed-intent-boundary.contract.ts (type-level contract using defineConfirmedIntent)
    - /Users/zakkeown/Code/protostar/packages/planning/package.json (verify @protostar/intent is a dependency — subpath import will resolve via the workspace exports map)
    - /Users/zakkeown/Code/protostar/packages/dogpile-adapter/src/public-candidate-plan.contract.test.ts (single migration site)
    - /Users/zakkeown/Code/protostar/packages/dogpile-adapter/package.json (verify @protostar/intent is a dependency)
  </read_first>
  <behavior>
    - Every `defineConfirmedIntent` import in `packages/planning/src/` (28 files) and `packages/dogpile-adapter/src/` (1 file) is replaced with `buildConfirmedIntentForTest` from `@protostar/intent/internal/test-builders`.
    - Every `defineConfirmedIntent({...})` callsite is replaced with `buildConfirmedIntentForTest({..., schemaVersion: "1.0.0", signature: null})` — the two new required fields added per the Task A shape change.
    - `packages/planning` and `packages/dogpile-adapter` build + test green.
    - `grep -rln "defineConfirmedIntent" packages/planning/src/ packages/dogpile-adapter/src/` == 0 after the task.
  </behavior>
  <action>
    1. **Enumerate migration sites** (already counted; recorded here for executor traceability):

       | Package | File | defineConfirmedIntent occurrences |
       |---------|------|-----------------------------------:|
       | dogpile-adapter | `src/public-candidate-plan.contract.test.ts` | 4 |
       | planning | `src/candidate-admitted-plan-boundary.contract.ts` | 2 |
       | planning | `src/confirmed-intent-boundary.contract.ts` | 2 |
       | planning | `src/admitted-plan-handoff.test.ts` | 2 |
       | planning | `src/dogpile-candidate-plan-parsing.test.ts` | 2 |
       | planning | `src/acceptance-criterion-coverage-admission.test.ts` | 2 |
       | planning | `src/public-split-exports.contract.test.ts` | 4 |
       | planning | `src/pre-handoff-verification-admission.test.ts` | 2 |
       | planning | `src/duplicate-task-id-admission.test.ts` | 2 |
       | planning | `src/capability-envelope-grant-fields.test.ts` | 2 |
       | planning | `src/transitive-dependency-cycle-admission.test.ts` | 2 |
       | planning | `src/candidate-plan-admission.test.ts` | 2 |
       | planning | `src/task-risk-policy-compatibility-admission.test.ts` | 2 |
       | planning | `src/write-capability-envelope-admission.test.ts` | 3 |
       | planning | `src/release-grant-admission.test.ts` | 2 |
       | planning | `src/release-capability-envelope-admission.test.ts` | 3 |
       | planning | `src/task-required-capabilities-admission.test.ts` | 4 |
       | planning | `src/immediate-dependency-loop-admission.test.ts` | 2 |
       | planning | `src/plan-acceptance-criteria.test.ts` | 2 |
       | planning | `src/planning-admission-artifact.test.ts` | 2 |
       | planning | `src/self-task-dependency-admission.test.ts` | 2 |
       | planning | `src/unknown-ac-reference.test.ts` | 2 |
       | planning | `src/task-risk-declaration-admission.test.ts` | 2 |
       | planning | `src/plan-task-coverage.test.ts` | 2 |
       | planning | `src/planning-admission-evidence.test.ts` | 2 |
       | planning | `src/missing-task-dependency-admission.test.ts` | 2 |
       | planning | `src/pr-capability-envelope-admission.test.ts` | 3 |
       **Total: 28 planning files (24 .test.ts + 2 .contract.ts where the contracts construct fixtures inside their test bodies — re-grep at start of task to confirm) + 1 dogpile-adapter file.**

       (Numbers per `grep -c` at plan time. Re-run `grep -c "defineConfirmedIntent" packages/planning/src/*.ts packages/dogpile-adapter/src/*.ts` at task start to verify nothing drifted.)

    2. **For each file in the table above, perform the mechanical migration:**
       a. Find the import: `import { defineConfirmedIntent } from "@protostar/intent"` (or via `@protostar/intent/confirmed-intent` subpath in some files).
       b. Replace with: `import { buildConfirmedIntentForTest } from "@protostar/intent/internal/test-builders"`.
       c. If the file imports OTHER symbols from `@protostar/intent` alongside `defineConfirmedIntent`, leave those imports intact — only the `defineConfirmedIntent` symbol moves. Often the result is two import statements (one from the public barrel, one from `internal/test-builders`).
       d. Find every `defineConfirmedIntent(payload)` call. Replace identifier with `buildConfirmedIntentForTest`. **Add the two new required fields to the payload object literal** if they are not already present:
          ```ts
          schemaVersion: "1.0.0",
          signature: null
          ```
          Most fixture payloads in these files are short literal objects; a `schemaVersion` line + `signature: null` line per call.

       **Helper for executor — sed-style sweep (verify per-file before applying en masse):**
       ```bash
       # Smoke-test the regex on one file first:
       perl -pe 's{from "\@protostar/intent"}{from "\@protostar/intent/internal/test-builders"}g; s{defineConfirmedIntent}{buildConfirmedIntentForTest}g' packages/planning/src/admitted-plan-handoff.test.ts | diff - packages/planning/src/admitted-plan-handoff.test.ts | head -40
       ```
       The schemaVersion + signature fields must be added MANUALLY per call object — do NOT use sed for that step (object-literal context is too varied). Read each file's call sites and edit the object literals directly.

       **WARNING:** Some `@protostar/intent` imports in these files include OTHER named symbols (e.g. `ConfirmedIntent` type, `assertConfirmedIntent`). Be careful with the import-line replacement — split the import into two lines if needed:
       ```ts
       import { ConfirmedIntent } from "@protostar/intent";
       import { buildConfirmedIntentForTest } from "@protostar/intent/internal/test-builders";
       ```

    3. **Verify per-package builds:**
       - `pnpm --filter @protostar/planning build` exits 0.
       - `pnpm --filter @protostar/planning test` exits 0.
       - `pnpm --filter @protostar/dogpile-adapter build` exits 0.
       - `pnpm --filter @protostar/dogpile-adapter test` exits 0.

    4. **Self-check before commit:**
       - `grep -rln "defineConfirmedIntent" packages/planning/src/ packages/dogpile-adapter/src/` == 0 (zero remaining references).
       - `grep -rc "buildConfirmedIntentForTest" packages/planning/src/ packages/dogpile-adapter/src/ | grep -c ":0$"` is small (most files have at least one usage now).

    5. **If any callsite uses defineConfirmedIntent in a way the helper signature doesn't cover** (e.g. partial / sparse-overrides pattern that defineConfirmedIntent supported but `buildConfirmedIntentForTest(data: ConfirmedIntentData)` does not): record the file in SUMMARY and adjust the call to supply the full ConfirmedIntentData shape inline. If this happens at >5 sites, STOP and flag in SUMMARY — the helper signature was wrong and Task B needs a sparse-overrides revision.
  </action>
  <verify>
    <automated>cd /Users/zakkeown/Code/protostar && (! grep -rl "defineConfirmedIntent" packages/planning/src/ packages/dogpile-adapter/src/) && pnpm --filter @protostar/planning test && pnpm --filter @protostar/dogpile-adapter test</automated>
  </verify>
  <acceptance_criteria>
    - `grep -rln "defineConfirmedIntent" packages/planning/src/` == 0.
    - `grep -rln "defineConfirmedIntent" packages/dogpile-adapter/src/` == 0.
    - `pnpm --filter @protostar/planning build` exits 0.
    - `pnpm --filter @protostar/planning test` exits 0.
    - `pnpm --filter @protostar/dogpile-adapter build` exits 0.
    - `pnpm --filter @protostar/dogpile-adapter test` exits 0.
  </acceptance_criteria>
  <done>All 29 cross-package callsites migrated; planning + dogpile-adapter green; defineConfirmedIntent fully extinct in those packages.</done>
</task>

<task type="auto" tdd="true">
  <name>Task C2: Drop --intent CLI flag + confirmed-intent-input handoff source from factory-cli</name>
  <read_first>
    - /Users/zakkeown/Code/protostar/apps/factory-cli/src/confirmed-intent-handoff.ts (current — has assertConfirmedIntent + confirmed-intent-input branch)
    - /Users/zakkeown/Code/protostar/apps/factory-cli/src/confirmed-intent-handoff.contract.ts (type-level contract — currently passes; verify still passes after rewrite)
    - /Users/zakkeown/Code/protostar/apps/factory-cli/src/main.ts (lines 70-71 option types; line 160 path resolution; line 165 parse; line 192 assertConfirmedIntent at runId; lines 223-227 createConfirmedIntentHandoff call; line 1117-1119 flag→option mapping)
    - /Users/zakkeown/Code/protostar/apps/factory-cli/src/main.test.ts (lines 10, 197, 284, 304, 431 — parseConfirmedIntent indexes; need `.intent` → `.data` rename + any test of --intent CLI flag retired)
    - /Users/zakkeown/Code/protostar/apps/factory-cli/src/refusals-index.test.ts (smoke — check it doesn't reference the dropped CLI surface)
    - /Users/zakkeown/Code/protostar/packages/intent/src/internal/test-builders.ts (Task B helper — main.test.ts may need it for constructing test fixtures)
  </read_first>
  <behavior>
    - `--intent` CLI flag is gone. `--intentDraft` (or whatever the existing draft flag is named — verify via reading the parser around line 1100) is the only intent input.
    - `RunCommandOptions.intentPath` field is removed; `intentDraftPath` becomes the only path option.
    - `apps/factory-cli/src/confirmed-intent-handoff.ts` exports a single-source `ConfirmedIntentHandoffSource = "draft-admission-gate"` and a `createConfirmedIntentHandoff` whose input requires a non-optional `promotedIntent`.
    - The `assertConfirmedIntent` import is removed from `confirmed-intent-handoff.ts` and `main.ts`.
    - `parseConfirmedIntent` usage in `main.test.ts` is migrated from `.intent` → `.data` per Task A's narrowing.
    - The factory-cli docstrings, examples, error messages, and CLI help text no longer mention `--intent` or "confirmed intent input" as a supported pathway.
    - `pnpm --filter @protostar/factory-cli build` and `pnpm --filter @protostar/factory-cli test` are green.
    - `pnpm -r build` is green (entire repo compiles).
    - `pnpm run verify:full` exits 0 (full integration gate).
  </behavior>
  <action>
    1. **Edit `apps/factory-cli/src/confirmed-intent-handoff.ts`** — replace its body with the shape from `<interfaces>` block above. Specifically:
       - Remove the `import { assertConfirmedIntent, type ConfirmedIntent } from "@protostar/intent/confirmed-intent"` and replace with `import type { ConfirmedIntent } from "@protostar/intent/confirmed-intent"` (type-only — assertConfirmedIntent no longer exists on that subpath barrel).
       - Change the `ConfirmedIntentHandoffSource` union to a single literal: `export type ConfirmedIntentHandoffSource = "draft-admission-gate";`.
       - Remove `parsedIntentInput` from `CreateConfirmedIntentHandoffInput`.
       - Make `promotedIntent` non-optional on the input.
       - Function body: keep only the `draft-admission-gate` branch. Drop the `confirmed-intent-input` branch entirely.

    2. **Verify `confirmed-intent-handoff.contract.ts` still passes.** It only checks that `ConfirmedIntent` is assignable to `ConfirmedIntentHandoff["intent"]` and `IntentDraft` is not — both remain true post-rewrite. If it doesn't compile, narrow the assertion accordingly; do not delete the contract.

    3. **Edit `apps/factory-cli/src/main.ts`:**
       a. Remove the `assertConfirmedIntent` import (line 26).
       b. Remove `intentPath` from `RunCommandOptions` (line 70).
       c. Update `intentPath` resolution (line 160): change to `const intentPath = resolve(workspaceRoot, options.intentDraftPath ?? "");` — drop the `?? options.intentPath ?? ""` fallback. If `intentDraftPath` is undefined at this point, fail loudly: `if (options.intentDraftPath === undefined) throw new Error("intentDraftPath is required");`.
       d. Since `capturedIntentDraftBeforeAdmission` is now never undefined when reaching the runFactory body (intentDraftPath is required), simplify lines 166-193 — `capturedIntentDraftBeforeAdmission`, `clarificationReport`, `promotedIntent`, `admissionDecision` are all unconditionally defined. The `runId` ternary collapses to: `const runId = options.runId ?? (promotedIntent.ok === true ? createRunId(promotedIntent.intent.id) : createDraftRunId(capturedIntentDraftBeforeAdmission));`. The `assertConfirmedIntent(parsedIntentInput).id` branch (line 192) is gone.
       e. Update the `createConfirmedIntentHandoff` call (lines 223-227) to drop the `parsedIntentInput` argument — the function no longer accepts it.
       f. Edit the CLI flag parser (around line 1117): remove the `flags.intent !== undefined ? { intentPath: flags.intent } : ...` branch. The `intentSource` becomes simply `{ intentDraftPath: draftPath as string }`. If `draftPath` is undefined at this point, return an error (the parser likely already guards this — verify and tighten if needed).
       g. Remove the `--intent` flag from any flag-definition table (search for `--intent` near the flag-parser; if there's a `--intent` entry separate from `--intentDraft`, delete it).
       h. Update any usage / help string mentioning `--intent` or "confirmed intent input file" — remove or rewrite.

    4. **Edit `apps/factory-cli/src/main.test.ts`:**
       a. The `parseConfirmedIntent(...)` callsites at lines 197, 284, 304, 431 currently access `.intent` on the success arm — rename to `.data` per Task A narrowing.
       b. Remove or rewrite any test case that exercises the `--intent` flag, the `intentPath` option, or the `confirmed-intent-input` source. Search for `"confirmed-intent-input"` (the literal) and `intentPath:` / `--intent ` (with trailing space) in the test file. Each match is either deleted (if the test was specifically about that pathway) or migrated to use `intentDraftPath` + a draft fixture. If a test case is about "factory accepts pre-confirmed JSON," it is dead and should be deleted (record in SUMMARY).
       c. If any test needs to construct a `ConfirmedIntent` fixture for assertions (separate from the factory pipeline), import `buildConfirmedIntentForTest` from `@protostar/intent/internal/test-builders`. Add `apps/factory-cli/package.json` dependency on `@protostar/intent` if it's already there — it is, so just import.

    5. **Verify `apps/factory-cli/src/refusals-index.test.ts`** doesn't reference the dropped CLI surface. If it does (unlikely), update similarly.

    6. **Repo-wide verification:**
       - `pnpm --filter @protostar/factory-cli build` exits 0.
       - `pnpm --filter @protostar/factory-cli test` exits 0.
       - `pnpm -r build` exits 0 (every package + app compiles).
       - `pnpm run verify:full` exits 0 (the gate for INTENT-02 closure).

    7. **Self-check before commit:**
       - `grep -rln "assertConfirmedIntent" apps/factory-cli/src/` == 0.
       - `grep -rln "confirmed-intent-input" apps/factory-cli/src/` == 0 (literal string fully removed).
       - `grep -E "\\-\\-intent\\b" apps/factory-cli/src/main.ts apps/factory-cli/src/main.test.ts` == 0 (the bare `--intent` flag is gone; `--intentDraft`/`--intent-mode` etc. unaffected).
       - `grep -c "intentPath" apps/factory-cli/src/main.ts` == 0 (option field removed; only `intentDraftPath` remains).
  </action>
  <verify>
    <automated>cd /Users/zakkeown/Code/protostar && (! grep -rl "assertConfirmedIntent" apps/factory-cli/src/) && (! grep -rl "confirmed-intent-input" apps/factory-cli/src/) && pnpm --filter @protostar/factory-cli test && pnpm -r build && pnpm run verify:full</automated>
  </verify>
  <acceptance_criteria>
    - `grep -rln "assertConfirmedIntent" apps/factory-cli/src/` == 0.
    - `grep -rln "confirmed-intent-input" apps/factory-cli/src/` == 0.
    - `grep -c "intentPath\b" apps/factory-cli/src/main.ts | grep -v "intentDraftPath"` == 0 (the `intentPath` option name fully gone; `intentDraftPath` stays).
    - `grep -c "ConfirmedIntentHandoffSource" apps/factory-cli/src/confirmed-intent-handoff.ts` >= 1 with body `"draft-admission-gate"` only (single literal).
    - `grep -c "draft-admission-gate" apps/factory-cli/src/confirmed-intent-handoff.ts` >= 2 (type literal + return value).
    - `pnpm --filter @protostar/factory-cli build` exits 0.
    - `pnpm --filter @protostar/factory-cli test` exits 0.
    - `pnpm -r build` exits 0.
    - `pnpm run verify:full` exits 0.
  </acceptance_criteria>
  <done>factory-cli accepts only IntentDraft input; CLI bypass via pre-confirmed JSON is removed at every layer (option, flag, handoff source, runFactory body); repo-wide verify:full green.</done>
</task>

<task type="auto" tdd="true">
  <name>Task D: Pin the public mint surface — admission-e2e contract test</name>
  <read_first>
    - /Users/zakkeown/Code/protostar/packages/admission-e2e/src/index.ts (Plan 05 — confirm package wired)
    - /Users/zakkeown/Code/protostar/packages/admission-e2e/package.json (verify deps include @protostar/intent)
    - /Users/zakkeown/Code/protostar/packages/admission-e2e/tsconfig.json (verify references include @protostar/intent)
    - /Users/zakkeown/Code/protostar/packages/intent/src/index.ts (after Tasks A+B — public barrel state)
    - /Users/zakkeown/Code/protostar/packages/intent/src/internal/test-builders.ts (Task B — confirms file location for the leak grep)
    - /Users/zakkeown/Code/protostar/packages/intent/src/promote-intent-draft.ts (success-arm shape — confirm `intent` field name on the discriminated union)
  </read_first>
  <behavior>
    - `packages/admission-e2e/src/confirmed-intent-mint.contract.test.ts` exists. It imports `* as IntentPublicApi from "@protostar/intent"` at runtime and uses a `unique symbol` brand witness obtained via type-only import to enumerate which public functions return ConfirmedIntent.
    - Type-level `Equal<MintingKeys, "promoteIntentDraft">` Assert holds — the only public function returning ConfirmedIntent is `promoteIntentDraft`.
    - Runtime smoke assertion: `typeof IntentPublicApi.promoteIntentDraft === "function"`.
    - **No-leak grep**: a runtime `it()` block reads `packages/intent/src/index.ts` and every file matching `packages/intent/src/**/index.ts` and asserts none of them import from `./internal/`. (Rationale: the type-level check covers the public namespace, but the leak vector is a non-test in-package barrel re-exporting the test helper.)
    - Negative `keyof typeof IntentPublicApi` assertion includes `"buildConfirmedIntentForTest"` — adding it to the public barrel fails `tsc -b`.
    - Sanity-spike outcome documented in SUMMARY: temporarily exporting `createConfirmedIntent` or `buildConfirmedIntentForTest` from `packages/intent/src/index.ts` causes `tsc -b` to fail at one of the type-level Asserts.
    - `pnpm --filter @protostar/admission-e2e build && pnpm --filter @protostar/admission-e2e test` green.
  </behavior>
  <action>
    1. **Brand witness subpath** — needed because `ConfirmedIntentBrand` is module-private and not foreign-namable.
       Create `packages/intent/src/internal/brand-witness.ts`:
       ```ts
       // PRIVATE SUBPATH — admission-e2e only. NOT a public API. Phase 2 may
       // relocate or remove without notice.
       export type { ConfirmedIntent as ConfirmedIntentBrandWitness } from "../confirmed-intent.js";
       ```

    2. **Add subpath to `packages/intent/package.json` exports map:**
       ```json
       "./internal/brand-witness": {
         "types": "./dist/internal/brand-witness.d.ts",
         "import": "./dist/internal/brand-witness.js"
       }
       ```
       (Type-only file but TS still emits a tiny `.js`; declare the import too for ESM resolution.)

    3. **Verify `packages/admission-e2e/package.json` has `@protostar/intent` as a workspace dependency.** If not, add it (`"@protostar/intent": "workspace:*"`). Verify `packages/admission-e2e/tsconfig.json` `references` includes `{ "path": "../intent" }`. (Per Plan 05 it should already.)

    4. **Create `packages/admission-e2e/src/confirmed-intent-mint.contract.test.ts`:**
       ```ts
       import * as IntentPublicApi from "@protostar/intent";
       import type { ConfirmedIntentBrandWitness } from "@protostar/intent/internal/brand-witness";
       import { strict as assert } from "node:assert";
       import { describe, it } from "node:test";
       import { readFile, readdir } from "node:fs/promises";
       import { resolve, dirname } from "node:path";
       import { fileURLToPath } from "node:url";

       // ---- Type-level pin: only one public function returns ConfirmedIntent ----
       type IntentPublicSurface = typeof IntentPublicApi;
       type Equal<X, Y> =
         (<T>() => T extends X ? 1 : 2) extends (<T>() => T extends Y ? 1 : 2) ? true : false;
       type Assert<T extends true> = T;

       type ReturnsConfirmed<K extends keyof IntentPublicSurface> =
         IntentPublicSurface[K] extends (...args: any[]) => infer R
           ? Extract<R, ConfirmedIntentBrandWitness> extends never
             ? (R extends { readonly intent: ConfirmedIntentBrandWitness } ? true : false)
             : true
           : false;

       type MintingKeys = {
         [K in keyof IntentPublicSurface]: ReturnsConfirmed<K> extends true ? K : never
       }[keyof IntentPublicSurface];

       type _MintSurfacePinned = Assert<Equal<MintingKeys, "promoteIntentDraft">>;

       // ---- Type-level negative: test helper is NOT on public surface ----
       type IntentPublicKeys = keyof typeof IntentPublicApi;
       type _NoBuildConfirmedIntentForTest =
         Assert<"buildConfirmedIntentForTest" extends IntentPublicKeys ? false : true>;
       type _NoMintConfirmedIntent =
         Assert<"mintConfirmedIntent" extends IntentPublicKeys ? false : true>;
       type _NoDefineConfirmedIntent =
         Assert<"defineConfirmedIntent" extends IntentPublicKeys ? false : true>;
       type _NoAssertConfirmedIntent =
         Assert<"assertConfirmedIntent" extends IntentPublicKeys ? false : true>;

       // ---- Runtime smoke + leak grep ----
       const __dirname = dirname(fileURLToPath(import.meta.url));
       const intentSrcRoot = resolve(__dirname, "../../intent/src");

       async function* walkBarrels(dir: string): AsyncGenerator<string> {
         const entries = await readdir(dir, { withFileTypes: true });
         for (const entry of entries) {
           const full = resolve(dir, entry.name);
           if (entry.isDirectory()) {
             // Skip the internal/ subtree itself — it's the source, not a leak vector.
             if (entry.name === "internal") continue;
             yield* walkBarrels(full);
           } else if (entry.name === "index.ts") {
             yield full;
           }
         }
       }

       describe("ConfirmedIntent mint surface", () => {
         it("only promoteIntentDraft mints ConfirmedIntent on @protostar/intent public surface", () => {
           assert.equal(typeof IntentPublicApi.promoteIntentDraft, "function");
         });

         it("no consumer-facing barrel re-exports from ./internal/*", async () => {
           const offenders: string[] = [];
           for await (const barrel of walkBarrels(intentSrcRoot)) {
             const body = await readFile(barrel, "utf8");
             // Strip line + block comments for the leak check.
             const stripped = body
               .replace(/\/\*[\s\S]*?\*\//g, "")
               .replace(/^\s*\/\/.*$/gm, "");
             if (/from\s+["']\.\/internal\//.test(stripped)
               || /from\s+["']\.\.\/internal\//.test(stripped)
               || /from\s+["']\.\.\/\.\.\/internal\//.test(stripped)) {
               offenders.push(barrel);
             }
           }
           assert.deepEqual(offenders, [],
             `Public/subpath barrels must not re-export from internal/. Offenders: ${offenders.join(", ")}`);
         });
       });
       ```
       Top-of-file comment: "The type-level Assert<Equal<...>> is the LOAD-bearing check; runtime smoke is a tripwire. If the type-level Equal breaks, `tsc -b` fails before this file runs at all."

    5. **Build + test:**
       - `pnpm --filter @protostar/intent build` (rebuild — internal/brand-witness.ts compiled).
       - `pnpm --filter @protostar/admission-e2e build` (subpath import resolves, type-level Equal holds).
       - `pnpm --filter @protostar/admission-e2e test` (runtime smoke + leak grep pass).

    6. **Sanity spike (record both outcomes in SUMMARY — VALIDATION GATE):**
       a. **Spike 1 (positive-key leak):** Temporarily add `export function createConfirmedIntent(input: any): ConfirmedIntent { return promoteIntentDraft(input).intent as ConfirmedIntent; }` to `packages/intent/src/index.ts`. Run `pnpm --filter @protostar/admission-e2e build`. Confirm `tsc` rejects with an `Equal<MintingKeys, ...>` failure (or equivalent at `_MintSurfacePinned`). Revert. If it does NOT fail, the type-level mechanism is broken — STOP and escalate; do not ship.
       b. **Spike 2 (test-helper leak):** Temporarily add `export { buildConfirmedIntentForTest } from "./internal/test-builders.js";` to `packages/intent/src/index.ts`. Run `pnpm --filter @protostar/admission-e2e build`. Confirm `tsc` rejects at `_NoBuildConfirmedIntentForTest`. Revert. If it does NOT fail, the negative-key mechanism is broken — STOP and escalate.
       c. **Spike 3 (runtime leak grep):** Temporarily add `export * from "./internal/test-builders.js";` to `packages/intent/src/confirmed-intent/index.ts`. Run `pnpm --filter @protostar/admission-e2e test`. Confirm the runtime "no consumer-facing barrel re-exports from ./internal/*" test FAILS, listing the offending barrel. Revert. (This catches `export * from`, which can defeat type-level keyof checks if the target subpath has no value exports.)

    7. **Final gate:** `pnpm run verify:full` exits 0.
  </action>
  <verify>
    <automated>cd /Users/zakkeown/Code/protostar && pnpm --filter @protostar/intent build && pnpm --filter @protostar/admission-e2e test && pnpm --filter @protostar/intent test && pnpm run verify:full</automated>
  </verify>
  <acceptance_criteria>
    - `ls packages/admission-e2e/src/confirmed-intent-mint.contract.test.ts` exists.
    - `ls packages/intent/src/internal/brand-witness.ts` exists.
    - `grep -c "ConfirmedIntentBrandWitness" packages/intent/src/internal/brand-witness.ts` >= 1.
    - `grep -c '"./internal/brand-witness"' packages/intent/package.json` >= 1.
    - `grep -c '"./internal/test-builders"' packages/intent/package.json` >= 1 (Task B already added this; verify it survived).
    - `grep -c "ConfirmedIntentBrandWitness" packages/admission-e2e/src/confirmed-intent-mint.contract.test.ts` >= 1.
    - `grep -c "MintingKeys" packages/admission-e2e/src/confirmed-intent-mint.contract.test.ts` >= 2.
    - `grep -c "_MintSurfacePinned" packages/admission-e2e/src/confirmed-intent-mint.contract.test.ts` >= 1.
    - `grep -c "_NoBuildConfirmedIntentForTest" packages/admission-e2e/src/confirmed-intent-mint.contract.test.ts` >= 1.
    - `grep -c "no consumer-facing barrel" packages/admission-e2e/src/confirmed-intent-mint.contract.test.ts` >= 1 (runtime leak-grep test present).
    - `pnpm --filter @protostar/admission-e2e build` exits 0.
    - `pnpm --filter @protostar/admission-e2e test` exits 0.
    - `pnpm --filter @protostar/intent test` exits 0.
    - `pnpm run verify:full` exits 0.
    - SUMMARY records all three sanity-spike outcomes — Spikes 1, 2, and 3 each cause a corresponding failure when applied. If any does not fail, the contract test is shipped broken; do not commit.
  </acceptance_criteria>
  <done>Public mint surface pinned at three layers (type-level positive, type-level negative, runtime leak grep); all three sanity spikes confirmed to break the build; repo-wide verify:full green.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| @protostar/intent public barrel ↔ every consumer | A single weak public export bypasses every downstream admission check |
| ConfirmedIntent brand ↔ external object literal | Type system must reject hand-built ConfirmedIntent forgeries |
| Same-package mint cross-file access | mintConfirmedIntent must be reachable from sibling files (promote-intent-draft.ts, internal/test-builders.ts) but invisible on every public/subpath barrel |
| internal/test-builders subpath ↔ public barrel | Test helper exists at a private subpath; must not leak via re-export from any consumer-facing barrel |
| factory-cli intent input ↔ runFactory pipeline | Removed: pre-confirmed JSON file as a CLI input bypasses the IntentDraft → promoteIntentDraft → ConfirmedIntent pipeline (Q-13c) |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-01-06b-01 | Spoofing | ConfirmedIntent at consumer call site | mitigate | unique symbol brand + module-private symbol; consumer cannot fabricate the brand without naming the symbol (which is not exported). |
| T-01-06b-02 | Elevation of Privilege | Future contributor adding a public ConfirmedIntent factory | mitigate | admission-e2e contract test (Task D) `_MintSurfacePinned` Assert fails `tsc -b` if any new public function returns ConfirmedIntent. |
| T-01-06b-03 | Tampering | parseConfirmedIntent reads external JSON and previously returned a ConfirmedIntent | mitigate | Task A narrows parseConfirmedIntent's success branch to `{ ok: true; data: ConfirmedIntentData }` (un-branded); consumers must re-promote via promoteIntentDraft. |
| T-01-06b-04 | Information Disclosure | mintConfirmedIntent leaking via the package barrel because it is sibling-importable | mitigate | Task A scrubs both `index.ts` and `confirmed-intent/index.ts`; Task B's public-split-exports.contract.test.ts adds negative-keyof asserts; Task D's admission-e2e contract test adds (a) type-level mint-surface pin, (b) type-level negative-keyof asserts including `mintConfirmedIntent`, `buildConfirmedIntentForTest`, `defineConfirmedIntent`, `assertConfirmedIntent`, and (c) a runtime leak-grep over every consumer-facing `index.ts` under `packages/intent/src/`. |
| T-01-06b-05 | Elevation of Privilege | buildConfirmedIntentForTest leaking via re-export from a consumer-facing barrel | mitigate | Task B's banner + Task D's three-layer check (type-level negative-keyof + runtime leak-grep + sanity-spike validation that adding `export * from "./internal/test-builders.js"` to a barrel breaks the build). |
| T-01-06b-06 | Elevation of Privilege | factory-cli accepts pre-confirmed JSON as a bypass channel | mitigate | Task C2 removes the `--intent` flag, the `intentPath` option, the `confirmed-intent-input` source literal, and the `assertConfirmedIntent`-based runFactory branch. The single remaining input is `--intentDraft` → IntentDraft → promoteIntentDraft (Q-13c). |
| T-01-06b-07 | Tampering | assertConfirmedIntent (a public function returning a brand) acts as a second mint path | mitigate | Task A removes assertConfirmedIntent from both barrels. May remain as a non-exported file-internal helper or be deleted entirely (Q-13b Option A). |
</threat_model>

<verification>
- ConfirmedIntent type carries the brand + schemaVersion + signature fields.
- Only promoteIntentDraft mints the brand on the public surface.
- assertConfirmedIntent and defineConfirmedIntent are absent from every public/subpath barrel; defineConfirmedIntent is fully deleted.
- buildConfirmedIntentForTest exists only at the @protostar/intent/internal/test-builders subpath — invisible to `import * from "@protostar/intent"`.
- factory-cli accepts only IntentDraft input; the --intent flag, intentPath option, and confirmed-intent-input handoff source are gone.
- All 33+ migrated callsites in planning, dogpile-adapter, intent, and factory-cli compile and test green.
- admission-e2e contract test passes; sanity spikes confirm the three-layer leak guard triggers on simulated regressions.
- `pnpm run verify:full` exits 0.
</verification>

<success_criteria>
INTENT-02 closed: no test or CLI path can produce a ConfirmedIntent except by going through promoteIntentDraft (production) or buildConfirmedIntentForTest (tests, accessible only via the non-public `@protostar/intent/internal/test-builders` subpath, with three layers of contract enforcement against accidental public exposure). Forward-compat for Phase 2 GOV-06 (signature) is reserved via `signature: SignatureEnvelope | null` (always null in Phase 1).
</success_criteria>

<output>
After completion, create `.planning/phases/01-intent-planning-admission/01-06b-SUMMARY.md` recording:
- The brand mechanism (Option A — sibling-export mint + module-private unique symbol).
- The two non-public mint subpaths: `internal/brand-witness` (type-only, admission-e2e) and `internal/test-builders` (value, test-only). Stability disclaimer wording.
- The parseConfirmedIntent narrowing decision and every consumer that touched `.intent` → `.data` (`example-intent-fixtures.test.ts` + `apps/factory-cli/src/main.test.ts` lines 197/284/304/431).
- The three Q-13b/c/d decisions locked in 01-CONTEXT.md (cross-link to the lock entries).
- The 33+ callsite migration: per-package counts, any sites that needed manual restructuring beyond the mechanical sed, any sites the helper signature didn't cover (if >5, note the helper signature was wrong and Task B needs revision).
- The factory-cli surgery: which CLI flags / option fields / source literals were removed; any test cases retired.
- The new readonly-contract keys (schemaVersion + signature).
- All three sanity-spike outcomes from Task D step 6 (positive-key leak, test-helper leak, runtime leak grep). Each MUST have caused a corresponding failure when applied; record the exact `tsc` error or test failure message.
</output>
