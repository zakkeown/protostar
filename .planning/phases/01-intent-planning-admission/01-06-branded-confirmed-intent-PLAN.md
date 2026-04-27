---
phase: 01-intent-planning-admission
plan: 06
type: execute
wave: 2
depends_on: [04, 05]
files_modified:
  - packages/intent/src/confirmed-intent.ts
  - packages/intent/src/confirmed-intent/index.ts
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
    - "promoteIntentDraft is the SOLE function in @protostar/intent's public surface that produces a ConfirmedIntent value"
    - "A contract test in admission-e2e asserts the public surface contains exactly one ConfirmedIntent producer (promoteIntentDraft) and zero raw constructors / factory shortcuts"
    - "ConfirmedIntent carries readonly schemaVersion: '1.0.0' and readonly signature: SignatureEnvelope | null (always null in Phase 1, per Q-13)"
    - "The brand is unforgeable from outside the package: passing any plain object that structurally matches ConfirmedIntent fails type-checking at the consumer site"
  artifacts:
    - path: packages/intent/src/confirmed-intent.ts
      provides: "Branded ConfirmedIntent type + private mint function + promoteIntentDraft as sole public mint path"
      contains: "promoteIntentDraft"
    - path: packages/intent/src/internal/brand-witness.ts
      provides: "Type-only brand witness exposed via @protostar/intent/internal (admission-e2e only — unstable subpath)"
      contains: "ConfirmedIntentBrandWitness"
    - path: packages/admission-e2e/src/confirmed-intent-mint.contract.test.ts
      provides: "Contract test: only promoteIntentDraft can produce ConfirmedIntent on the public surface"
  key_links:
    - from: packages/intent/src/confirmed-intent.ts
      to: ConfirmedIntent brand
      via: unique symbol-keyed property + module-private mint function
      pattern: "promoteIntentDraft"
---

<objective>
Make ConfirmedIntent a branded type produced ONLY by promoteIntentDraft. Combine the brand approach (compile-time guarantee) with a public-surface contract test (catches "I'll just export it for tests" regressions). This closes INTENT-02 by ensuring no test or CLI bypass exists. Per Q-03 + Q-13.

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
@.planning/codebase/CONVENTIONS.md
@packages/intent/src/confirmed-intent.ts
@packages/intent/src/confirmed-intent
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

// Module-private — NOT exported
function mintConfirmedIntent(data: ConfirmedIntentData): ConfirmedIntent { ... }

// Sole public mint
export function promoteIntentDraft(...): ConfirmedIntentPromotionResult { ... }
```

Public-surface contract: only `promoteIntentDraft` may produce a `ConfirmedIntent` on the @protostar/intent root barrel and any subpath barrels.
</interfaces>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Brand ConfirmedIntent + private mint + schemaVersion + signature reservation</name>
  <read_first>
    - /Users/zakkeown/Code/protostar/packages/intent/src/confirmed-intent.ts (current type + every mint site)
    - /Users/zakkeown/Code/protostar/packages/intent/src/confirmed-intent (subpath module dir)
    - /Users/zakkeown/Code/protostar/packages/intent/src/confirmed-intent-readonly.contract.ts (current readonly contract)
    - /Users/zakkeown/Code/protostar/packages/intent/src/confirmed-intent-immutability.test.ts (existing immutability tests)
    - /Users/zakkeown/Code/protostar/packages/intent/src/index.ts (public barrel — verify what is exported)
    - /Users/zakkeown/Code/protostar/packages/intent/schema/confirmed-intent.schema.json (Plan 04 — schema includes schemaVersion + nullable signature)
  </read_first>
  <behavior>
    - At module scope: declare const ConfirmedIntentBrand: unique symbol (NOT exported).
    - ConfirmedIntent type intersects with { readonly [ConfirmedIntentBrand]: true; readonly schemaVersion: "1.0.0"; readonly signature: SignatureEnvelope | null }.
    - mintConfirmedIntent (or equivalent private factory) is the only function that returns a value satisfying ConfirmedIntent — it is NOT exported.
    - promoteIntentDraft (and only promoteIntentDraft) calls mintConfirmedIntent. Its return type is ConfirmedIntentPromotionResult which carries the branded ConfirmedIntent on success.
    - In Phase 1 every minted ConfirmedIntent has schemaVersion: "1.0.0" and signature: null literally.
    - Existing immutability + readonly contract tests still pass after the brand is added (DeepReadonly preserved).
    - Compile-time: a consumer cannot construct a plain object and assign it to ConfirmedIntent — TS rejects (`Property [ConfirmedIntentBrand] is missing`).
  </behavior>
  <action>
    1. In packages/intent/src/confirmed-intent.ts:
       a. Add `declare const ConfirmedIntentBrand: unique symbol;` at module top (before any export).
       b. Define `export interface SignatureEnvelope { readonly algorithm: string; readonly value: string }` (used by Phase 2 GOV-06; Phase 1 emits null only).
       c. Update the ConfirmedIntent type to intersect: existing readonly fields + `readonly schemaVersion: "1.0.0"` + `readonly signature: SignatureEnvelope | null` + `readonly [ConfirmedIntentBrand]: true`.
       d. Replace any current public ConfirmedIntent constructor / factory with a module-private function `function mintConfirmedIntent(data): ConfirmedIntent { return { ...data, schemaVersion: "1.0.0", signature: null, [ConfirmedIntentBrand]: true } as ConfirmedIntent; }`. Do NOT export it.
       e. Update promoteIntentDraft to call mintConfirmedIntent on the success branch. Verify it remains the only call site.
       f. Update assertConfirmedIntent / parseConfirmedIntent and any other helper that REWRAPS a previously-confirmed value: they may re-mint via mintConfirmedIntent internally, but must NOT expose a public constructor. parseConfirmedIntent, if it accepts external JSON and produces a ConfirmedIntent, becomes a second mint path — Q-03's decision is "promoteIntentDraft is the only public mint." Therefore: if parseConfirmedIntent currently produces ConfirmedIntent, narrow its return type to a NON-branded ParsedConfirmedIntent shape (or rename), and require callers to re-promote through promoteIntentDraft. SUMMARY must record this decision and any consumers updated.

    2. Update packages/intent/src/confirmed-intent-readonly.contract.ts: add the new fields (schemaVersion, signature) to the expected key set of the Assert<KeysEqual<...>> helper.

    3. Update packages/intent/src/confirmed-intent-immutability.test.ts: add a test minting via promoteIntentDraft and asserting (a) result.schemaVersion === "1.0.0", (b) result.signature === null in Phase 1.

    4. Verify packages/intent/src/index.ts barrel does NOT export mintConfirmedIntent or any internal brand helper. Public exports of the ConfirmedIntent module: ConfirmedIntent (type), SignatureEnvelope (type), promoteIntentDraft (value), assertConfirmedIntent (value if it currently is exported), parseConfirmedIntent (value, with narrowed return type per 1f).

    5. If apps/factory-cli or any other workspace package currently constructs ConfirmedIntent via parseConfirmedIntent expecting the brand, update that consumer to call promoteIntentDraft instead. Track every site touched in SUMMARY.

    6. Build + test: pnpm --filter @protostar/intent test must pass. The repo-wide build (pnpm -r build) must still succeed; if a downstream consumer (factory-cli, policy, planning, execution, review) breaks because of the parseConfirmedIntent narrowing, fix the consumer in this task — do not paper over with `as ConfirmedIntent` casts.
  </action>
  <verify>
    <automated>cd /Users/zakkeown/Code/protostar && pnpm --filter @protostar/intent test && pnpm -r build</automated>
  </verify>
  <acceptance_criteria>
    - grep -c "ConfirmedIntentBrand" packages/intent/src/confirmed-intent.ts is at least 2 (declare + intersection).
    - grep -c "export.*mintConfirmedIntent\|export.*ConfirmedIntentBrand" packages/intent/src/confirmed-intent.ts is 0 (the brand symbol and mint function are not exported).
    - grep -c "promoteIntentDraft" packages/intent/src/index.ts is at least 1 (still exported as the public mint).
    - grep -c "schemaVersion" packages/intent/src/confirmed-intent.ts is at least 2 (type field + mint site).
    - grep -c "signature" packages/intent/src/confirmed-intent.ts is at least 2 (type field + mint site).
    - pnpm --filter @protostar/intent test exits 0.
    - pnpm -r build exits 0 (every consumer still compiles).
    - Manual TS spike (record in SUMMARY): a temporary file `const x: ConfirmedIntent = {} as any` compiles; `const x: ConfirmedIntent = { goal: 'x' }` fails because the brand property is missing. Not a gate, but a signal.
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
  </read_first>
  <behavior>
    - admission-e2e contract test imports * from "@protostar/intent" and walks the export bag.
    - For every exported function, the test asserts: if its return type is or contains ConfirmedIntent, the export name is "promoteIntentDraft" (only one allowed mint path).
    - Test fails if any future contributor adds e.g. createConfirmedIntent / makeConfirmedIntent / unsafeConfirmedIntent to the public surface.
    - The existing intent-package public-split-exports contract is also extended with a new assertion: ConfirmedIntent type's expected key set includes schemaVersion, signature, and the brand marker.
  </behavior>
  <action>
    **Mechanism choice (Option A — internal brand witness subpath).** The `ConfirmedIntentBrand` declared in Task 1 is a module-private `unique symbol` that cannot be named from a foreign module. To make the type-level enumeration writable from admission-e2e, expose a TYPE-ONLY brand witness via a private `./internal` subpath export. This gives a real type-level guarantee (the subpath is documented "unstable; admission-e2e only") rather than relying on hard-coded negative pins.

    1. Create packages/intent/src/internal/brand-witness.ts. Body:
       - `export type ConfirmedIntentBrandWitness = ConfirmedIntent[typeof __brandKey];` is NOT viable because `ConfirmedIntentBrand` itself is module-private. Instead, expose the BRANDED TYPE itself (re-exporting the whole ConfirmedIntent type as a witness suffices, since "what return types contain the brand" reduces to "what return types are assignable to ConfirmedIntent"):
         ```ts
         // packages/intent/src/internal/brand-witness.ts
         // PRIVATE SUBPATH — admission-e2e only. NOT a public API. Do not import from
         // application code. Phase 2 may relocate or remove this file without notice.
         export type { ConfirmedIntent as ConfirmedIntentBrandWitness } from "../confirmed-intent.js";
         ```
       - This creates a stable TYPE name foreign modules CAN reference, while the underlying `unique symbol` remains module-private (consumers cannot construct a ConfirmedIntent — they can only ASK whether something IS one).
       - The contract test then enumerates exports whose ReturnType is assignable to `ConfirmedIntentBrandWitness` and asserts the key set equals `"promoteIntentDraft"`.

    2. Extend packages/intent/package.json `exports` to expose the internal subpath. Add (preserving existing entries):
       ```json
       "./internal": {
         "types": "./dist/internal/brand-witness.d.ts",
         "import": "./dist/internal/brand-witness.js"
       }
       ```
       Document the subpath as "unstable — admission-e2e only" in a comment-equivalent (since package.json has no comments, record this in the package's README addendum or in 01-06-SUMMARY.md and as a top-of-file banner inside brand-witness.ts).

    3. Create packages/admission-e2e/src/confirmed-intent-mint.contract.test.ts with the canonical describe/it shape. Body:
       - Import * as IntentPublicApi from "@protostar/intent" (ESM star import — namespace object of the public surface).
       - Import the witness type: `import type { ConfirmedIntentBrandWitness } from "@protostar/intent/internal";`
       - Define the allowlist: `const ALLOWED_MINT_KEYS = ["promoteIntentDraft"] as const;`
       - Compile-time mechanism (the LOAD-bearing check):
         ```ts
         type IntentPublicSurface = typeof IntentPublicApi;
         type Equal<X, Y> =
           (<T>() => T extends X ? 1 : 2) extends (<T>() => T extends Y ? 1 : 2) ? true : false;
         type Assert<T extends true> = T;

         // For each function-typed key K in the public surface, decide whether its
         // success-branch return type contains a ConfirmedIntentBrandWitness.
         type ReturnsConfirmed<K extends keyof IntentPublicSurface> =
           IntentPublicSurface[K] extends (...args: any[]) => infer R
             ? Extract<R, ConfirmedIntentBrandWitness> extends never
               ? (R extends { readonly confirmed: ConfirmedIntentBrandWitness } ? true : false)
               : true
             : false;

         type MintingKeys = {
           [K in keyof IntentPublicSurface]: ReturnsConfirmed<K> extends true ? K : never
         }[keyof IntentPublicSurface];

         // The single assertion: the set of minting keys is exactly "promoteIntentDraft".
         type _MintSurfacePinned = Assert<Equal<MintingKeys, "promoteIntentDraft">>;
         ```
       - Runtime smoke (best-effort): `assert.equal(typeof IntentPublicApi.promoteIntentDraft, "function");` plus `assert.deepEqual([...ALLOWED_MINT_KEYS], ["promoteIntentDraft"]);`
       - Document the mechanism in a comment block at the top of the file: explain that the type-level `Equal<MintingKeys, "promoteIntentDraft">` is the gate; runtime checks are smoke only; if the equality breaks, tsc -b fails the test build.

    4. Update packages/admission-e2e/tsconfig.json (if needed): the subpath import resolves through the workspace's `paths` and the package's `exports` field — verify by running `pnpm --filter @protostar/admission-e2e build` after Task 1 and after creating brand-witness.ts. If subpath resolution fails, add a paths entry mapping `@protostar/intent/internal` to `../intent/dist/internal/brand-witness.d.ts` (mirror however other intent subpaths like `./draft` are referenced from sibling packages — grep for an existing example).

    5. Extend packages/intent/src/public-split-exports.contract.test.ts to include schemaVersion and signature in the ConfirmedIntent expected-key set (KeysEqual<ConfirmedIntent, ...> Assert). The brand symbol property is module-private and CANNOT appear in the foreign-module key set; document this in a comment.

    6. Build + test:
       - pnpm --filter @protostar/intent build (the new internal subpath compiles).
       - pnpm --filter @protostar/admission-e2e build (subpath import resolves; type-level Equal holds).
       - pnpm --filter @protostar/admission-e2e test.
       - pnpm --filter @protostar/intent test.

    7. Sanity spike (record outcome in SUMMARY — VALIDATION GATE for the chosen mechanism):
       - Temporarily add `export function createConfirmedIntent(...): ConfirmedIntent { ... }` to packages/intent/src/index.ts that returns a value via promoteIntentDraft internally (so the function is type-correct).
       - Run pnpm --filter @protostar/admission-e2e build.
       - Confirm tsc rejects with an `Equal` failure pointing at `_MintSurfacePinned` / `MintingKeys`.
       - Revert. If the spike does NOT fail, the mechanism is broken — STOP and escalate; do not ship the contract test as-is.
  </action>
  <verify>
    <automated>cd /Users/zakkeown/Code/protostar && pnpm --filter @protostar/admission-e2e test && pnpm --filter @protostar/intent test</automated>
  </verify>
  <acceptance_criteria>
    - ls packages/admission-e2e/src/confirmed-intent-mint.contract.test.ts exists.
    - ls packages/intent/src/internal/brand-witness.ts exists.
    - grep -c "ConfirmedIntentBrandWitness" packages/intent/src/internal/brand-witness.ts is at least 1.
    - grep -c '"./internal"' packages/intent/package.json is at least 1 (subpath export wired).
    - grep -c "ConfirmedIntentBrandWitness" packages/admission-e2e/src/confirmed-intent-mint.contract.test.ts is at least 1 (witness imported).
    - grep -c "MintingKeys" packages/admission-e2e/src/confirmed-intent-mint.contract.test.ts is at least 2 (definition + Assert).
    - grep -c "promoteIntentDraft" packages/admission-e2e/src/confirmed-intent-mint.contract.test.ts is at least 2 (allowlist + Equal target).
    - pnpm --filter @protostar/intent build exits 0.
    - pnpm --filter @protostar/admission-e2e build exits 0.
    - pnpm --filter @protostar/admission-e2e test exits 0.
    - pnpm --filter @protostar/intent test exits 0 (public-split-exports contract updated for schemaVersion + signature still passes).
    - SUMMARY records the sanity-spike outcome — adding `createConfirmedIntent` to the public barrel MUST cause tsc -b to fail at `_MintSurfacePinned`. If it does not, the mechanism is broken; do not ship.
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

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-01-06-01 | Spoofing | ConfirmedIntent at consumer call site | mitigate | unique symbol brand + module-private mint; consumer cannot fabricate the brand without importing the symbol (which is not exported) |
| T-01-06-02 | Elevation of Privilege | Future contributor adding a public ConfirmedIntent factory | mitigate | admission-e2e contract test fails tsc -b if any new function on the public surface returns ConfirmedIntent |
| T-01-06-03 | Tampering | parseConfirmedIntent reads external JSON and returned a ConfirmedIntent today | mitigate | Narrow parseConfirmedIntent's return type to a non-branded shape; consumers must re-promote via promoteIntentDraft (Task 1 step 1f) |
</threat_model>

<verification>
- ConfirmedIntent type carries the brand + schemaVersion + signature fields.
- Only promoteIntentDraft mints the brand; private mintConfirmedIntent is not exported.
- Public-surface contract (admission-e2e) compiles only when "promoteIntentDraft" is the sole minting export.
- All affected packages build and test green.
</verification>

<success_criteria>
INTENT-02 closed: no test or CLI path can produce a ConfirmedIntent except by going through promoteIntentDraft. Forward-compat for Phase 2 GOV-06 (signature) is reserved.
</success_criteria>

<output>
After completion, create .planning/phases/01-intent-planning-admission/01-06-SUMMARY.md recording: the brand mechanism (Option A — internal brand witness subpath), the `@protostar/intent/internal` subpath export rationale and stability disclaimer, the parseConfirmedIntent narrowing decision (and every consumer it affected), the new keys on the readonly contract, and the sanity-spike outcome from Task 2 step 7.
</output>
