---
phase: 01-intent-planning-admission
plan: 06
type: execute
wave: 2
depends_on: [04, 05]
files_modified:
  - packages/intent/src/confirmed-intent.ts
  - packages/intent/src/confirmed-intent/index.ts
  - packages/intent/src/index.ts
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
    1. Create packages/admission-e2e/src/confirmed-intent-mint.contract.test.ts with the canonical describe/it shape. Body:
       - Import * as IntentPublicApi from "@protostar/intent" (ESM star import).
       - Define the allowlist of mint functions: ["promoteIntentDraft"] (as const string array).
       - Compile-time helper: a generic Assert<T extends true> that pins `IntentPublicApi["promoteIntentDraft"]` returns a result whose success branch contains a ConfirmedIntent (use the existing types from @protostar/intent — do not re-declare).
       - Runtime test: walk Object.keys(IntentPublicApi). For each key whose value is a function, attempt a type-narrowing check (this part is best-effort runtime; the LOAD-bearing check is the next item).
       - Compile-time exhaustiveness: declare a type-level union of all exports (`type IntentPublicSurface = typeof IntentPublicApi`). For each key K in IntentPublicSurface where ReturnType<IntentPublicSurface[K]> contains the ConfirmedIntent brand, assert K is "promoteIntentDraft" via a `Assert<Equal<ExtractMintingKeys<IntentPublicSurface>, "promoteIntentDraft">>` chain. If a future contributor adds e.g. `export function createConfirmedIntent()`, the type-level Equal will fail and `tsc -b` will reject the contract test.
       - Document the mechanism in a comment block at the top of the file.

    2. Extend packages/intent/src/public-split-exports.contract.test.ts to include schemaVersion and signature in the ConfirmedIntent expected-key set (KeysEqual<ConfirmedIntent, ...> Assert).

    3. Build + test:
       - pnpm --filter @protostar/admission-e2e test (the contract test runs, even if its primary check is type-level).
       - pnpm --filter @protostar/intent test (existing public-split-exports contract still passes after the new keys are added).

    4. Sanity spike (record outcome in SUMMARY, not gate-required):
       - Temporarily add `export function createConfirmedIntent(...) { ... }` to packages/intent/src/index.ts.
       - Run pnpm --filter @protostar/admission-e2e build.
       - Confirm tsc rejects with the expected error from the contract test.
       - Revert.
  </action>
  <verify>
    <automated>cd /Users/zakkeown/Code/protostar && pnpm --filter @protostar/admission-e2e test && pnpm --filter @protostar/intent test</automated>
  </verify>
  <acceptance_criteria>
    - ls packages/admission-e2e/src/confirmed-intent-mint.contract.test.ts exists.
    - grep -c "promoteIntentDraft" packages/admission-e2e/src/confirmed-intent-mint.contract.test.ts is at least 2 (allowlist + Assert reference).
    - pnpm --filter @protostar/admission-e2e build exits 0.
    - pnpm --filter @protostar/admission-e2e test exits 0.
    - pnpm --filter @protostar/intent test exits 0 (public-split-exports contract updated for schemaVersion + signature still passes).
    - SUMMARY records the sanity-spike outcome (does adding a fake mint cause tsc to fail?).
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
After completion, create .planning/phases/01-intent-planning-admission/01-06-SUMMARY.md recording: the brand mechanism, the parseConfirmedIntent narrowing decision (and every consumer it affected), the new keys on the readonly contract, and the sanity-spike outcome from Task 2 step 4.
</output>
