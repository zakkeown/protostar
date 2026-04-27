# Testing Patterns

**Analysis Date:** 2026-04-26

## Test Framework

**Runner:**
- **`node:test`** — Node 22+ built-in test runner. No third-party framework.
- No `jest`, `vitest`, `mocha`, `ava`, etc. — zero test deps.

**Assertion Library:**
- **`node:assert/strict`** — built-in, imported as `import assert from "node:assert/strict";`.

**Build-then-run flow:**
- Tests are written in TypeScript under `src/`, compiled by `tsc -b` to `dist/`, then executed by Node against the compiled `*.test.js` files.
- Per-package script (`packages/intent/package.json`, `apps/factory-cli/package.json`):
  ```
  "test": "pnpm run build && node --test dist/*.test.js"
  ```

**Run Commands:**
```bash
pnpm run verify                                # typecheck + intent + factory-cli tests (root)
pnpm --filter @protostar/intent test           # build + run intent package tests
pnpm --filter @protostar/factory-cli test      # build + run CLI smoke tests
pnpm --filter @protostar/policy run typecheck  # typecheck only
pnpm run factory                               # full demo composition smoke run
```

`pnpm run verify` (the gate enforced by `AGENTS.md`) currently runs **only** intent + factory-cli tests plus a global typecheck. Other packages have tests but are validated transitively via typecheck and the factory-cli smoke.

## Test File Organization

**Location:** Co-located with source under `packages/<pkg>/src/`. There is no separate `test/`, `__tests__/`, or `spec/` directory.

**Naming:**
- `<focus>.test.ts` — runtime behavior tests.
- `<focus>.contract.test.ts` — public surface / split-export pinning (e.g. `packages/intent/src/public-split-exports.contract.test.ts`, `packages/dogpile-adapter/src/public-candidate-plan.contract.test.ts`).
- `<focus>.contract.ts` — compile-time type-shape pins (no `describe`/`it`; pure type assertions, picked up by `tsc`).
- `<focus>.fixtures.ts` — exported fixture builders/data (`packages/intent/src/greenfield-ambiguity.fixtures.ts`).
- `<focus>.test-support.ts` — shared test helpers consumed by multiple `.test.ts` files (`packages/policy/src/example-intent-fixtures.test-support.ts`).

**Layout example (`packages/planning/src/`):** ~24 `.test.ts` files, each pinning one admission rule (`duplicate-task-id-admission.test.ts`, `release-grant-admission.test.ts`, `transitive-dependency-cycle-admission.test.ts`, …). One assertion focus per file is the dominant pattern.

## Test Structure

**Standard suite skeleton** (from `packages/intent/src/intent-ambiguity-scoring.test.ts:17`):

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  INTENT_AMBIGUITY_DIMENSION_WEIGHTS,
  assessIntentAmbiguity,
  type IntentDraft
} from "./index.js";

describe("intent ambiguity scoring", () => {
  it("defines stable greenfield and brownfield weighting profiles", () => {
    assert.deepEqual(Object.keys(INTENT_AMBIGUITY_WEIGHTING_PROFILES), ["greenfield", "brownfield"]);
    assert.deepEqual(getIntentAmbiguityWeightingProfile("greenfield"), { ... });
  });
});

function clearDraft(): IntentDraft { /* fixture builder */ }
```

**Conventions:**
- One top-level `describe(...)` per file naming the unit under test.
- Nested `describe` allowed when grouping multiple feature axes (e.g. `describe("AC 40104 focused draft gate coverage", ...)` in `packages/policy/src/admission-control.test.ts:61`).
- Test names are full sentences in present tense: `"promotes complete valid drafts with normalized confirmed-intent output"`, `"auto-fails otherwise passing aggregates when any required dimension is structurally missing"`.
- Tests reference acceptance-criterion ids in suite/it titles (`"AC 40104 ..."`, `requester: "ouroboros-ac-20102"`) to trace back to intent fixtures.
- **Fixture builders sit at the bottom of the test file** as `function clearDraft()`, `function draftWithDistinctDimensionSignals()`, etc. — co-located, not extracted, unless reused across files.

## Assertion Style

- `assert.equal(actual, expected)` — strict equality, used for primitives and identity checks.
- `assert.deepEqual(actual, expected)` — used heavily for object/array shape pinning, including full object literal comparisons.
- `assert.match(string, /regex/)` — used to assert clarification messages contain expected phrases without coupling to full text.
- `assert.ok(value, message)` — for narrowed-existence checks before drilling in.
- Failure messages: passed as third arg only when iterating cases (e.g. `assert.equal(score, 1, testCase.name)`).
- Exact numeric equality (e.g. `assert.equal(missingTarget.ambiguity, 0.298)`) is the norm — production code rounds through `roundScore` to make this safe.

## Test Patterns

**Table-driven cases:**
```ts
const cases: readonly { name: string; draft: IntentDraft; mode: "greenfield" | "brownfield"; ... }[] = [
  { name: "brownfield context", draft: draftMissingContext, mode: "brownfield", ... },
  { name: "greenfield constraints", draft: draftMissingConstraints, mode: "greenfield", ... }
];
for (const testCase of cases) {
  const assessment = assessIntentAmbiguity(testCase.draft, { mode: testCase.mode, threshold: testCase.threshold });
  assert.equal(assessment.accepted, false, testCase.name);
}
```
(`packages/intent/src/intent-ambiguity-scoring.test.ts:380`). Single `it(...)` walks a `readonly` array of cases, passing `testCase.name` as the assertion label.

**Determinism / idempotence checks:**
Many suites call the function twice and `assert.deepEqual(first, second)` to pin determinism (e.g. `intent-ambiguity-scoring.test.ts:347`, `assessCosmeticTweakAmbiguityDetails` repeated calls).

**Type-shape contracts:**
`packages/intent/src/intent-ambiguity.contract.ts` uses compile-time helpers:
```ts
type Assert<T extends true> = T;
type IfEquals<X, Y, Then = true, Else = false> = ...;
type KeysEqual<T, Expected extends PropertyKey> = IfEquals<keyof T, Expected>;

export type IntentAmbiguityAssessmentShapeContract = Assert<
  KeysEqual<IntentAmbiguityAssessment, "mode" | "weightingProfile" | "threshold" | ...>
>;
```
These have no runtime body; `tsc -b` is the test. Drift in the type's keys breaks the build.

**Public-surface contracts:**
`*public-split-exports.contract.test.ts` files import every exported symbol from each subpath barrel and assert presence + identity, ensuring subpath exports stay synced with the root index.

## Mocking

**Framework:** `node:test` built-ins — `import { mock } from "node:test";` (see `apps/factory-cli/src/main.test.ts:6`). No `jest.mock`, `sinon`, `proxyquire`, etc.

**Pattern:**
- Production code accepts dependencies via an injectable parameter object (e.g. `runFactory(opts, deps?: FactoryCompositionDependencies)` in `apps/factory-cli/src/main.ts`). Tests pass test doubles directly rather than monkey-patching modules.
- `mock.fn(impl?)` is used sparingly and only for the CLI smoke layer.

**What to mock:**
- External adapters (`repo`, `execution`, network/CLI shells) when exercising the factory composition end-to-end.

**What NOT to mock:**
- Pure functions in `intent`, `planning`, `policy`, `evaluation`. Tests call them directly with literal fixtures.

## Fixtures and Factories

**Inline builders:**
Most test files declare local fixture functions at the bottom (`clearDraft`, `clearCosmeticTweakDraft`, `cosmeticTweakDraftMissingTarget`, `draftWithDistinctDimensionSignals`). Each returns a fresh literal so tests can spread + override.

**Shared fixtures:**
- `packages/intent/src/greenfield-ambiguity.fixtures.ts` and `brownfield-ambiguity.fixtures.ts` export named constants like `clearGreenfieldIntentDraftFixture` consumed by sibling tests.
- `packages/policy/src/example-intent-fixtures.test-support.ts` is reused across multiple policy admission tests.

**Real-world fixture artifacts:**
- `examples/intents/scaffold.draft.json`
- `examples/planning-results/bad-missing-acceptance-coverage.json`
- `examples/planning-results/bad-cyclic-plan-graph.json`
- `examples/planning-results/bad-capability-envelope-expansion.json`

These JSON fixtures back the CLI smoke (`apps/factory-cli/src/main.test.ts:31`) so the end-to-end path is exercised against the same files an operator would run via `pnpm run factory`.

**Acceptance-criterion ids in fixtures:** `requester: "ouroboros-ac-20102"`-style ids embed traceability to the originating acceptance criterion.

## CLI Integration / Smoke Tests

`apps/factory-cli/src/main.test.ts` is the highest-fidelity test in the repo:
- Spawns the compiled CLI (`spawn(node, [cliPath, ...])`) under `mkdtemp` directories.
- Resolves fixtures relative to the repo root (`resolve(distDir, "../../..")`).
- Asserts on:
  - Exit codes
  - Files produced under the run output dir (e.g. `intent.json`, `planning-admission.json`, `execution-events.json`, `delivery/pr-body.md`)
  - File contents parsed back via `parseConfirmedIntent`, `JSON.parse`
- Uses `withTempDir(async (tempDir) => { ... })` helpers for cleanup.

## Coverage

- **No coverage tool configured** (no `c8`, `nyc`, `--experimental-test-coverage` flag). Coverage is not measured or enforced.
- The de-facto bar is "every admission rule has its own dedicated `*.test.ts`" — see the ~24 admission-rule files under `packages/planning/src/`.

## Async Testing

```ts
it("serializes only the normalized ConfirmedIntent JSON on successful draft admission", async () => {
  await withTempDir(async (tempDir) => {
    const draft = clearCosmeticDraft();
    const draftPath = resolve(tempDir, "clear-cosmetic.json");
    await writeFile(draftPath, JSON.stringify(draft));
    // ...
  });
});
```
- Tests are `async` arrow functions; `await` for `node:fs/promises`, `spawn`, etc.
- No timeouts customized — defaults from `node:test` apply.

## Error Testing

`assert.throws(() => fn(), /pattern/)` for synchronous throws; `await assert.rejects(fn(), /pattern/)` for async. More commonly, validation tests call the pure validator and `assert.deepEqual(result.errors, [...])` rather than catching exceptions, since the codebase prefers reporting over throwing.

---

*Testing analysis: 2026-04-26*
