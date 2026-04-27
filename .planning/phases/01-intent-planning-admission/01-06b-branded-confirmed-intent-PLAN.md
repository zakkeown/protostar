---
phase: 01-intent-planning-admission
plan: 06b
type: execute
wave: 3
depends_on: [04, 05, 06a]
files_modified:
  - packages/intent/src/confirmed-intent.ts
  - packages/intent/src/confirmed-intent/index.ts
  - packages/intent/src/promote-intent-draft.ts
  - packages/intent/src/internal/brand-witness.ts
  - packages/intent/src/index.ts
  - packages/intent/package.json
  - packages/intent/src/public-split-exports.contract.test.ts
  - packages/intent/src/confirmed-intent-readonly.contract.ts
  - packages/intent/src/confirmed-intent-immutability.test.ts
  - packages/admission-e2e/src/confirmed-intent-mint.contract.test.ts
autonomous: true
requirements:
  - INTENT-02
must_haves:
  truths:
    - "ConfirmedIntent is a branded type whose constructor is module-private — no callable public constructor exists (Q-03)"
    - "promoteIntentDraft is the SOLE function in @protostar/intent's public surface that produces a ConfirmedIntent value (Plan 06a placed it in intent; this plan enforces it via the brand)"
    - "A contract test in admission-e2e asserts the public surface contains exactly one ConfirmedIntent producer (promoteIntentDraft) and zero raw constructors / factory shortcuts"
    - "ConfirmedIntent carries readonly schemaVersion: '1.0.0' and readonly signature: SignatureEnvelope | null (always null in Phase 1, per Q-13)"
    - "The brand is unforgeable from outside the package: passing any plain object that structurally matches ConfirmedIntent fails type-checking at the consumer site"
  artifacts:
    - path: packages/intent/src/confirmed-intent.ts
      provides: "Branded ConfirmedIntent type + module-private mint function (mintConfirmedIntent)"
      contains: "ConfirmedIntentBrand"
    - path: packages/intent/src/promote-intent-draft.ts
      provides: "promoteIntentDraft — the SOLE public caller of mintConfirmedIntent on the success branch (replacing the current defineConfirmedIntent call)"
      contains: "mintConfirmedIntent"
    - path: packages/intent/src/internal/brand-witness.ts
      provides: "Type-only brand witness exposed via @protostar/intent/internal (admission-e2e only — unstable subpath)"
      contains: "ConfirmedIntentBrandWitness"
    - path: packages/admission-e2e/src/confirmed-intent-mint.contract.test.ts
      provides: "Contract test: only promoteIntentDraft can produce ConfirmedIntent on the public surface"
  key_links:
    - from: packages/intent/src/confirmed-intent.ts
      to: ConfirmedIntent brand
      via: unique symbol-keyed property + module-private mint function
      pattern: "ConfirmedIntentBrand"
    - from: packages/intent/src/promote-intent-draft.ts
      to: packages/intent/src/confirmed-intent.ts
      via: mintConfirmedIntent (NOT defineConfirmedIntent — the latter is removed or demoted to private helper)
      pattern: "mintConfirmedIntent"
---

<objective>
Make ConfirmedIntent a branded type produced ONLY by promoteIntentDraft. Combine the brand approach (compile-time guarantee) with a public-surface contract test (catches "I'll just export it for tests" regressions). This closes INTENT-02 by ensuring no test or CLI bypass exists. Per Q-03 + Q-13.

This plan is the type-system half of Q-03's "promoteIntentDraft is the sole public mint." Plan 06a already accomplished the package-graph half by relocating promoteIntentDraft into @protostar/intent so it can call a module-private mint function in confirmed-intent.ts.

Purpose: A weak intent must not reach execution via any path. Branding plus public-surface pinning defeats both accidental and deliberate bypasses, including future regressions. The schemaVersion + reserved signature: null are added now so Phase 2 GOV-06 can fill in the signature without a shape migration.

Output: Branded ConfirmedIntent type with private mint, schemaVersion + signature fields, updated immutability contract, and a new admission-e2e contract test that pins the mint surface.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/phases/01-intent-planning-admission/01-CONTEXT.md
@.planning/phases/01-intent-planning-admission/01-06a-SUMMARY.md
@.planning/codebase/CONVENTIONS.md
@packages/intent/src/confirmed-intent.ts
@packages/intent/src/confirmed-intent
@packages/intent/src/promote-intent-draft.ts
@packages/intent/src/index.ts
@packages/intent/src/public-split-exports.contract.test.ts
@packages/intent/src/confirmed-intent-readonly.contract.ts
@packages/intent/schema/confirmed-intent.schema.json
</context>

<interfaces>
Expected branded shape (executor produces this exactly):

```ts
declare const ConfirmedIntentBrand: unique symbol;

export interface SignatureEnvelope {
  readonly algorithm: string;
  readonly value: string;
}

export type ConfirmedIntent = DeepReadonly<ConfirmedIntentData> & {
  readonly schemaVersion: "1.0.0";
  readonly signature: SignatureEnvelope | null;
  readonly [ConfirmedIntentBrand]: true;
};

// Module-private (kept off every public/subpath barrel)
function mintConfirmedIntent(data: ConfirmedIntentData): ConfirmedIntent { ... }

// Sole public mint (lives in promote-intent-draft.ts after 06a)
export function promoteIntentDraft(...): ConfirmedIntentPromotionResult { ... }
```

Public-surface contract: only `promoteIntentDraft` may produce a `ConfirmedIntent` on the @protostar/intent root barrel and any subpath barrels (root + `./admission` + `./confirmed-intent`).

**Same-package cross-file mint problem.** mintConfirmedIntent lives in confirmed-intent.ts; promote-intent-draft.ts is a sibling file in the same package and must call it. Two options; Option A is chosen:

- **Option A (CHOSEN):** export `mintConfirmedIntent` from confirmed-intent.ts BUT keep it OFF every public-facing barrel (root index.ts + ./admission + ./confirmed-intent). The unique-symbol brand is still module-private (cannot be NAMED outside confirmed-intent.ts), so even if mintConfirmedIntent leaked at runtime, no caller could construct a competing brand without importing the symbol. The admission-e2e contract test (Task 2) plus the public-split-exports tests in both packages enforce that no public barrel exposes the mint.
- **Option B (rejected):** keep mintConfirmedIntent strictly module-private and inline it into promote-intent-draft.ts. Rejected because it spreads brand-construction across two files; future Phase 2 GOV-06 (signature) wants a single mint site.
</interfaces>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Brand ConfirmedIntent + private mint + schemaVersion + signature reservation</name>
  <read_first>
    - /Users/zakkeown/Code/protostar/packages/intent/src/confirmed-intent.ts (current type + every mint site)
    - /Users/zakkeown/Code/protostar/packages/intent/src/confirmed-intent (subpath module dir)
    - /Users/zakkeown/Code/protostar/packages/intent/src/confirmed-intent-readonly.contract.ts (current readonly contract)
    - /Users/zakkeown/Code/protostar/packages/intent/src/confirmed-intent-immutability.test.ts (existing immutability tests)
    - /Users/zakkeown/Code/protostar/packages/intent/src/promote-intent-draft.ts (06a — currently calls defineConfirmedIntent on success; this task switches it to mintConfirmedIntent)
    - /Users/zakkeown/Code/protostar/packages/intent/src/index.ts (public barrel — verify what is exported)
    - /Users/zakkeown/Code/protostar/packages/intent/schema/confirmed-intent.schema.json (Plan 04 — schema includes schemaVersion + nullable signature)
  </read_first>
  <behavior>
    - At module scope of confirmed-intent.ts: declare const ConfirmedIntentBrand: unique symbol (NOT exported).
    - ConfirmedIntent type intersects with { readonly [ConfirmedIntentBrand]: true; readonly schemaVersion: "1.0.0"; readonly signature: SignatureEnvelope | null }.
    - mintConfirmedIntent is the only function that returns a value satisfying ConfirmedIntent — it is NOT on any public/subpath barrel.
    - promoteIntentDraft (and only promoteIntentDraft) calls mintConfirmedIntent. Its return type is the Phase-1 promotion-result discriminated union; the `ok: true` branch carries the branded ConfirmedIntent.
    - In Phase 1 every minted ConfirmedIntent has schemaVersion: "1.0.0" and signature: null literally.
    - Existing immutability + readonly contract tests still pass after the brand is added (DeepReadonly preserved).
    - Compile-time: a consumer cannot construct a plain object and assign it to ConfirmedIntent — TS rejects (`Property [ConfirmedIntentBrand] is missing`).
  </behavior>
  <action>
    1. In `packages/intent/src/confirmed-intent.ts`:
       a. Add `declare const ConfirmedIntentBrand: unique symbol;` at module top (before any export).
       b. Define `export interface SignatureEnvelope { readonly algorithm: string; readonly value: string }` (used by Phase 2 GOV-06; Phase 1 emits null only).
       c. Update the `ConfirmedIntent` type to intersect: existing readonly fields + `readonly schemaVersion: "1.0.0"` + `readonly signature: SignatureEnvelope | null` + `readonly [ConfirmedIntentBrand]: true`.
       d. Replace any current public ConfirmedIntent constructor / factory with a module-scope function:
          ```ts
          export function mintConfirmedIntent(data: ConfirmedIntentData): ConfirmedIntent {
            return { ...data, schemaVersion: "1.0.0", signature: null, [ConfirmedIntentBrand]: true } as ConfirmedIntent;
          }
          ```
          NOTE the `export`: per Option A in `<interfaces>`, mintConfirmedIntent must be importable from a sibling file in the same package (promote-intent-draft.ts), but MUST NOT appear on any public barrel.
       e. Update `packages/intent/src/promote-intent-draft.ts`: replace the success-branch `defineConfirmedIntent({...})` call with `mintConfirmedIntent({...})`. Import via relative `./confirmed-intent.js`. Verify it remains the only call site by `grep -c "mintConfirmedIntent" packages/intent/src/*.ts` — must be exactly 2 (declaration + the one caller in promote-intent-draft.ts).
       f. Update `assertConfirmedIntent` and `parseConfirmedIntent` (still in confirmed-intent.ts):
          - `assertConfirmedIntent` is a TYPE GUARD over an already-branded value — it stays. Keep its predicate signature `value is ConfirmedIntent` (TS narrows on the brand).
          - `parseConfirmedIntent` currently accepts external JSON and produces a `ConfirmedIntent` (today, via `defineConfirmedIntent`). Per Q-03, the brand mint must be sole. Decision: NARROW its return type to a NON-branded shape (e.g. change the result type's success branch from `{ ok: true; intent: ConfirmedIntent }` to `{ ok: true; data: ConfirmedIntentData }` where `ConfirmedIntentData` is the un-branded payload). Callers that need a branded ConfirmedIntent must re-promote through `promoteIntentDraft`. RECORD every consumer site touched in SUMMARY.
       g. The existing `defineConfirmedIntent` symbol becomes either (i) deleted if no consumer remains, or (ii) renamed to a clearly-non-public helper (e.g. `freezeConfirmedIntentShape`) used internally by `mintConfirmedIntent` for the freeze step. Recommended: keep the freeze logic as a private helper that returns the un-branded data; have `mintConfirmedIntent` apply the brand. Remove `defineConfirmedIntent` from `packages/intent/src/index.ts` AND from `packages/intent/src/confirmed-intent/index.ts` (the subpath barrel currently re-exports it).

    2. Update `packages/intent/src/confirmed-intent-readonly.contract.ts`: add the new fields (`schemaVersion`, `signature`) to the expected key set of the `Assert<KeysEqual<...>>` helper. The brand symbol property is module-private and CANNOT appear in the foreign-module key set; document this with a comment.

    3. Update `packages/intent/src/confirmed-intent-immutability.test.ts`: add a test minting via `promoteIntentDraft` (using a passing draft fixture from `intent/src/example-intent-fixtures.test-support.ts` — relocated by Plan 06a) and asserting (a) `result.intent.schemaVersion === "1.0.0"`, (b) `result.intent.signature === null` in Phase 1.

    4. Verify `packages/intent/src/index.ts` barrel does NOT export `mintConfirmedIntent` or any internal brand helper. Public exports of the ConfirmedIntent module after this task: `ConfirmedIntent` (type), `SignatureEnvelope` (type), `assertConfirmedIntent` (value), `parseConfirmedIntent` (value, with narrowed return type per 1f), `ConfirmedIntentInput` (type, if still used), `ConfirmedIntentParseResult` (type). `defineConfirmedIntent` MUST be absent. `promoteIntentDraft` remains exported (from 06a). Same removal in `packages/intent/src/confirmed-intent/index.ts`.

    5. If `apps/factory-cli` or any other workspace package currently constructs `ConfirmedIntent` via `parseConfirmedIntent` or `defineConfirmedIntent` expecting the brand, update that consumer to call `promoteIntentDraft` instead. Track every site touched in SUMMARY. (Likely sites: `apps/factory-cli/src/confirmed-intent-handoff.ts` already uses `assertConfirmedIntent` — verify it still narrows correctly to the branded type.)

    6. Build + test: `pnpm --filter @protostar/intent test` must pass. The repo-wide build (`pnpm -r build`) must still succeed; if a downstream consumer (factory-cli, policy, planning, execution, review) breaks because of the parseConfirmedIntent narrowing, fix the consumer in this task — do not paper over with `as ConfirmedIntent` casts.
  </action>
  <verify>
    <automated>cd /Users/zakkeown/Code/protostar && pnpm --filter @protostar/intent test && pnpm -r build</automated>
  </verify>
  <acceptance_criteria>
    - `grep -v '^\s*//\|^\s*\*' packages/intent/src/confirmed-intent.ts | grep -c "ConfirmedIntentBrand"` >= 2 (declare + intersection).
    - `grep -v '^\s*//\|^\s*\*' packages/intent/src/index.ts | grep -cE "(mintConfirmedIntent|ConfirmedIntentBrand|defineConfirmedIntent)"` == 0 (the brand symbol, mint function, and old non-branded factory are not on the public barrel).
    - `grep -v '^\s*//\|^\s*\*' packages/intent/src/confirmed-intent/index.ts | grep -cE "(mintConfirmedIntent|defineConfirmedIntent)"` == 0 (the subpath barrel doesn't leak them either).
    - `grep -c "promoteIntentDraft" packages/intent/src/index.ts` >= 1 (still exported as the public mint).
    - `grep -c "schemaVersion" packages/intent/src/confirmed-intent.ts` >= 2 (type field + mint site).
    - `grep -c "signature" packages/intent/src/confirmed-intent.ts` >= 2 (type field + mint site).
    - `grep -c "mintConfirmedIntent" packages/intent/src/promote-intent-draft.ts` == 1 (sole caller).
    - `pnpm --filter @protostar/intent test` exits 0.
    - `pnpm -r build` exits 0 (every consumer still compiles).
    - **Manual TS spike (record in SUMMARY):** a temporary file `const x: ConfirmedIntent = {} as any` compiles; `const x: ConfirmedIntent = { goal: 'x' }` fails because the brand property is missing. Not a gate, but a signal.
  </acceptance_criteria>
  <done>Branded type compiled, private mint enforced, downstream consumers updated, tests pass.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Pin the public mint surface in admission-e2e</name>
  <read_first>
    - /Users/zakkeown/Code/protostar/packages/admission-e2e/src/index.ts (Plan 05 — confirm package is wired)
    - /Users/zakkeown/Code/protostar/packages/intent/src/public-split-exports.contract.test.ts (existing public-surface contract — extend)
    - /Users/zakkeown/Code/protostar/packages/intent/src/index.ts (current public barrel — enumerate exports)
    - /Users/zakkeown/Code/protostar/packages/intent/src/confirmed-intent.ts (Task 1 — brand + private mint just landed)
    - /Users/zakkeown/Code/protostar/packages/intent/src/promote-intent-draft.ts (Task 1 — now calls mintConfirmedIntent)
  </read_first>
  <behavior>
    - admission-e2e contract test imports * from "@protostar/intent" and walks the export bag.
    - For every exported function, the test asserts: if its return type is or contains ConfirmedIntent, the export name is "promoteIntentDraft" (only one allowed mint path).
    - Test fails if any future contributor adds e.g. createConfirmedIntent / makeConfirmedIntent / unsafeConfirmedIntent to the public surface.
    - The existing intent-package public-split-exports contract is also extended with a new assertion: ConfirmedIntent type's expected key set includes schemaVersion, signature.
  </behavior>
  <action>
    **Mechanism choice (Option A — internal brand witness subpath).** The `ConfirmedIntentBrand` declared in Task 1 is a module-private `unique symbol` that cannot be named from a foreign module. To make the type-level enumeration writable from admission-e2e, expose a TYPE-ONLY brand witness via a private `./internal` subpath export.

    1. Create `packages/intent/src/internal/brand-witness.ts`. Body:
       ```ts
       // PRIVATE SUBPATH — admission-e2e only. NOT a public API. Do not import from
       // application code. Phase 2 may relocate or remove this file without notice.
       export type { ConfirmedIntent as ConfirmedIntentBrandWitness } from "../confirmed-intent.js";
       ```

    2. Extend `packages/intent/package.json`'s `exports` to expose the internal subpath. Add (preserving existing entries):
       ```json
       "./internal": {
         "types": "./dist/internal/brand-witness.d.ts",
         "import": "./dist/internal/brand-witness.js"
       }
       ```
       Document the subpath as "unstable — admission-e2e only" via the top-of-file banner inside `brand-witness.ts` and record the disclaimer in `01-06b-SUMMARY.md`.

    3. Create `packages/admission-e2e/src/confirmed-intent-mint.contract.test.ts` with the canonical describe/it shape. Body (executor will adjust the success-branch field name once they read promote-intent-draft.ts; per the existing 803-line admission.ts source, the field is `intent`):
       ```ts
       import * as IntentPublicApi from "@protostar/intent";
       import type { ConfirmedIntentBrandWitness } from "@protostar/intent/internal";
       import { strict as assert } from "node:assert";
       import { describe, it } from "node:test";

       const ALLOWED_MINT_KEYS = ["promoteIntentDraft"] as const;

       // Compile-time mechanism (the LOAD-bearing check):
       type IntentPublicSurface = typeof IntentPublicApi;
       type Equal<X, Y> =
         (<T>() => T extends X ? 1 : 2) extends (<T>() => T extends Y ? 1 : 2) ? true : false;
       type Assert<T extends true> = T;

       // For each function-typed key K in the public surface, decide whether its
       // return type contains a ConfirmedIntentBrandWitness (directly or under common
       // discriminated-union shapes).
       type ReturnsConfirmed<K extends keyof IntentPublicSurface> =
         IntentPublicSurface[K] extends (...args: any[]) => infer R
           ? Extract<R, ConfirmedIntentBrandWitness> extends never
             ? (R extends { readonly intent: ConfirmedIntentBrandWitness } ? true : false)
             : true
           : false;

       type MintingKeys = {
         [K in keyof IntentPublicSurface]: ReturnsConfirmed<K> extends true ? K : never
       }[keyof IntentPublicSurface];

       // The single assertion: the set of minting keys is exactly "promoteIntentDraft".
       type _MintSurfacePinned = Assert<Equal<MintingKeys, "promoteIntentDraft">>;

       describe("ConfirmedIntent mint surface", () => {
         it("only promoteIntentDraft mints ConfirmedIntent on @protostar/intent public surface", () => {
           assert.equal(typeof IntentPublicApi.promoteIntentDraft, "function");
           assert.deepEqual([...ALLOWED_MINT_KEYS], ["promoteIntentDraft"]);
         });
       });
       ```
       Document at top: the type-level `Equal<MintingKeys, "promoteIntentDraft">` is the gate; runtime checks are smoke only; if the equality breaks, `tsc -b` fails the test build.

    4. Update `packages/admission-e2e/tsconfig.json` (if needed): the subpath import resolves through the workspace's `paths` and the package's `exports` field — verify by running `pnpm --filter @protostar/admission-e2e build` after Task 1 and after creating brand-witness.ts. If subpath resolution fails, add a `paths` entry mapping `@protostar/intent/internal` to `../intent/dist/internal/brand-witness.d.ts` (mirror however other intent subpaths like `./admission`, `./draft`, `./confirmed-intent` are referenced from sibling packages — grep for an existing example).

    5. Extend `packages/intent/src/public-split-exports.contract.test.ts` to include `schemaVersion` and `signature` in the ConfirmedIntent expected-key set (`KeysEqual<ConfirmedIntent, ...>` Assert). The brand symbol property is module-private and CANNOT appear in the foreign-module key set; document this in a comment. Also assert that `mintConfirmedIntent` and `defineConfirmedIntent` are NOT in the export namespace (negative assertions on `keyof typeof IntentPublicApi`).

    6. Build + test:
       - `pnpm --filter @protostar/intent build` (the new internal subpath compiles).
       - `pnpm --filter @protostar/admission-e2e build` (subpath import resolves; type-level Equal holds).
       - `pnpm --filter @protostar/admission-e2e test`.
       - `pnpm --filter @protostar/intent test`.

    7. **Sanity spike (record outcome in SUMMARY — VALIDATION GATE for the chosen mechanism):**
       - Temporarily add `export function createConfirmedIntent(input: any): ConfirmedIntent { return promoteIntentDraft(input).intent as ConfirmedIntent; }` to `packages/intent/src/index.ts`.
       - Run `pnpm --filter @protostar/admission-e2e build`.
       - Confirm `tsc` rejects with an `Equal` failure pointing at `_MintSurfacePinned` / `MintingKeys`.
       - Revert. If the spike does NOT fail, the mechanism is broken — STOP and escalate; do not ship the contract test as-is.
  </action>
  <verify>
    <automated>cd /Users/zakkeown/Code/protostar && pnpm --filter @protostar/admission-e2e test && pnpm --filter @protostar/intent test</automated>
  </verify>
  <acceptance_criteria>
    - `ls packages/admission-e2e/src/confirmed-intent-mint.contract.test.ts` exists.
    - `ls packages/intent/src/internal/brand-witness.ts` exists.
    - `grep -c "ConfirmedIntentBrandWitness" packages/intent/src/internal/brand-witness.ts` >= 1.
    - `grep -c '"./internal"' packages/intent/package.json` >= 1 (subpath export wired).
    - `grep -c "ConfirmedIntentBrandWitness" packages/admission-e2e/src/confirmed-intent-mint.contract.test.ts` >= 1 (witness imported).
    - `grep -c "MintingKeys" packages/admission-e2e/src/confirmed-intent-mint.contract.test.ts` >= 2 (definition + Assert).
    - `grep -c "promoteIntentDraft" packages/admission-e2e/src/confirmed-intent-mint.contract.test.ts` >= 2 (allowlist + Equal target).
    - `pnpm --filter @protostar/intent build` exits 0.
    - `pnpm --filter @protostar/admission-e2e build` exits 0.
    - `pnpm --filter @protostar/admission-e2e test` exits 0.
    - `pnpm --filter @protostar/intent test` exits 0 (public-split-exports contract updated for schemaVersion + signature still passes).
    - SUMMARY records the sanity-spike outcome — adding `createConfirmedIntent` to the public barrel MUST cause `tsc -b` to fail at `_MintSurfacePinned`. If it does not, the mechanism is broken; do not ship.
  </acceptance_criteria>
  <done>Cross-package contract pins the mint surface; both packages still test green.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| @protostar/intent public barrel ↔ every consumer | A single weak export bypasses every downstream admission check |
| ConfirmedIntent brand ↔ external object literal | Type system must reject hand-built ConfirmedIntent forgeries |
| Same-package mint cross-file access | mintConfirmedIntent must be reachable from promote-intent-draft.ts but invisible on every public/subpath barrel |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-01-06b-01 | Spoofing | ConfirmedIntent at consumer call site | mitigate | unique symbol brand + module-private symbol; consumer cannot fabricate the brand without importing the symbol (which is not exported) |
| T-01-06b-02 | Elevation of Privilege | Future contributor adding a public ConfirmedIntent factory | mitigate | admission-e2e contract test fails tsc -b if any new function on the public surface returns ConfirmedIntent |
| T-01-06b-03 | Tampering | parseConfirmedIntent reads external JSON and returned a ConfirmedIntent today | mitigate | Narrow parseConfirmedIntent's return type to a non-branded shape; consumers must re-promote via promoteIntentDraft (Task 1 step 1f) |
| T-01-06b-04 | Information Disclosure | mintConfirmedIntent leaking via the package barrel because it's TS-export-visible (Option A) | mitigate | Public-split-exports contract test in BOTH packages enumerates the barrel and asserts mintConfirmedIntent + defineConfirmedIntent are absent. Admission-e2e contract test additionally enforces only one ConfirmedIntent producer on the public surface — even if mintConfirmedIntent leaked, this test would fail. |
</threat_model>

<verification>
- ConfirmedIntent type carries the brand + schemaVersion + signature fields.
- Only promoteIntentDraft mints the brand; mintConfirmedIntent is not on any public barrel.
- Public-surface contract (admission-e2e) compiles only when "promoteIntentDraft" is the sole minting export.
- All affected packages build and test green.
</verification>

<success_criteria>
INTENT-02 closed: no test or CLI path can produce a ConfirmedIntent except by going through promoteIntentDraft. Forward-compat for Phase 2 GOV-06 (signature) is reserved.
</success_criteria>

<output>
After completion, create `.planning/phases/01-intent-planning-admission/01-06b-SUMMARY.md` recording: the brand mechanism (Option A — internal brand witness subpath), the `@protostar/intent/internal` subpath export rationale and stability disclaimer, the parseConfirmedIntent narrowing decision (and every consumer it affected), the new keys on the readonly contract, and the sanity-spike outcome from Task 2 step 7.
</output>
