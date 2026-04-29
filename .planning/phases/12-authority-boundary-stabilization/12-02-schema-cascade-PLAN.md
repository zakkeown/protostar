---
phase: 12-authority-boundary-stabilization
plan: 02
type: execute
wave: 0
depends_on: []
files_modified:
  - packages/intent/schema/confirmed-intent.schema.json
  - packages/intent/src/confirmed-intent.ts
  - packages/intent/src/promote-intent-draft.ts
  - packages/intent/src/internal/test-builders.ts
  - packages/intent/src/acceptance-criteria-normalization.test.ts
  - packages/intent/src/capability-envelope.test.ts
  - packages/intent/src/confirmed-intent-immutability.test.ts
  - packages/intent/src/confirmed-intent.test.ts
  - packages/intent/src/public-split-exports.contract.test.ts
  - packages/authority/src/stage-reader/factory.ts
  - packages/authority/src/stage-reader/factory.test.ts
  - packages/authority/src/signature/sign-verify.test.ts
  - packages/admission-e2e/src/signed-intent-1-5-0.test.ts
  - packages/admission-e2e/src/authority-governance-kernel.e2e.test.ts
  - packages/admission-e2e/src/calibration-log-append.contract.test.ts
  - packages/admission-e2e/src/evaluation-runner-no-fs.contract.test.ts
  - packages/admission-e2e/src/no-skipped-evaluation.contract.test.ts
  - packages/admission-e2e/src/planning-mission-prior-summary.contract.test.ts
  - packages/evaluation/src/create-spec-ontology-snapshot.test.ts
  - packages/evaluation/src/lineage-hash.test.ts
  - packages/lmstudio-adapter/internal/test-fixtures/cosmetic-tweak-fixture.ts
  - apps/factory-cli/src/load-factory-config.test.ts
  - apps/factory-cli/src/run-real-execution.test.ts
  - examples/intents/scaffold.json
  - examples/intents/bad/missing-capability.json
autonomous: true
requirements: [AUTH-04]
must_haves:
  truths:
    - "Every `\"1.5.0\"` schemaVersion literal in source/tests/fixtures becomes `\"1.6.0\"`"
    - "`confirmedIntent.capabilityEnvelope.mechanical.allowed` is a closed enum array of mechanical command names"
    - "Every existing test fixture and example intent has `mechanical: { allowed: [\"verify\", \"lint\"] }` so cosmetic-tweak runs continue to admit verify+lint"
    - "Both signed example intents are re-signed under the canonical c14n pipeline against schema 1.6.0"
    - "`signed-intent-1-5-0.test.ts` is renamed to `signed-intent-1-6-0.test.ts`"
  artifacts:
    - path: "packages/intent/schema/confirmed-intent.schema.json"
      provides: "Schema 1.6.0 with mechanical.allowed enum"
      contains: "1.6.0"
    - path: "packages/admission-e2e/src/signed-intent-1-6-0.test.ts"
      provides: "Renamed signed-intent test against 1.6.0"
      contains: "1.6.0"
  key_links:
    - from: "packages/intent/schema/confirmed-intent.schema.json"
      to: "packages/intent/src/confirmed-intent.ts"
      via: "type literal mirror"
      pattern: '"1\.6\.0"'
    - from: "examples/intents/scaffold.json"
      to: "packages/authority/src/signature/canonicalize.ts"
      via: "c14n re-signing"
      pattern: '"canonicalForm": "json-c14n@1.0"'
---

<objective>
Bump `confirmedIntent` schema 1.5.0 → 1.6.0, add `capabilityEnvelope.mechanical.allowed: string[]` (closed enum: `verify | typecheck | lint | test`), cascade every literal across 25 source files, re-sign the 2 signed example intents, rename the signed-intent test, and add `mechanical: { allowed: ["verify","lint"] }` to every existing fixture/example so cosmetic-tweak runs continue to admit (Pitfall 8).

Purpose: Mitigates T-12-01 (mechanical argv injection) at admission time. Mechanical commands become first-class capability — operator must list them at intent time, signed.
Output: Schema bump + 25-file cascade + 2 re-signed fixtures + renamed test + default `mechanical.allowed` injected into every existing fixture/intent.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/REQUIREMENTS.md
@.planning/phases/12-authority-boundary-stabilization/12-CONTEXT.md
@.planning/phases/12-authority-boundary-stabilization/12-RESEARCH.md
@.planning/phases/07-delivery/07-01-schema-cascade-PLAN.md
@.planning/phases/02-authority-governance-kernel/

<interfaces>
Existing schema literal sites (RESEARCH.md §"Schema Cascade 1.5.0 → 1.6.0" lines 608-654):

`packages/intent/schema/confirmed-intent.schema.json:21` — `"const": "1.5.0"`
`packages/intent/src/confirmed-intent.ts:44` — `readonly schemaVersion: "1.5.0"` (type literal)
`packages/intent/src/confirmed-intent.ts:86, 117, 296, 307` — additional literal sites
`packages/intent/src/confirmed-intent.ts:312` — `if (value === "1.5.0")` runtime check
`packages/intent/src/promote-intent-draft.ts:192` — runtime literal
`packages/authority/src/stage-reader/factory.ts:259` — up-conversion default

Re-signing pipeline:
- `packages/authority/src/signature/canonicalize.ts` (c14n)
- `packages/authority/src/signature/sign-verify.ts` (sign + verify)
- Marker: `"canonicalForm": "json-c14n@1.0"` (Phase 7 plan 07-01 pattern)
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Bump schema 1.5.0 → 1.6.0 + add mechanical.allowed enum</name>
  <files>packages/intent/schema/confirmed-intent.schema.json, packages/intent/src/confirmed-intent.ts, packages/intent/src/promote-intent-draft.ts, packages/authority/src/stage-reader/factory.ts</files>
  <read_first>
    - packages/intent/schema/confirmed-intent.schema.json (entire file — confirm `additionalProperties: false` parents and locate `capabilityEnvelope` properties block)
    - packages/intent/src/confirmed-intent.ts (lines 1-50, 80-130, 290-320 — every literal site)
    - packages/intent/src/promote-intent-draft.ts (lines 185-200)
    - packages/authority/src/stage-reader/factory.ts (lines 250-270)
    - .planning/phases/12-authority-boundary-stabilization/12-RESEARCH.md §"Schema Cascade 1.5.0 → 1.6.0" lines 608-654
    - .planning/phases/07-delivery/07-01-schema-cascade-PLAN.md (recipe for 1.4.0→1.5.0 — mirror its shape)
  </read_first>
  <behavior>
    - `loadConfirmedIntent` accepts a fixture with `schemaVersion: "1.6.0"` and `capabilityEnvelope.mechanical.allowed: ["verify"]` and returns a typed result with that shape.
    - Schema validation REFUSES `mechanical.allowed: ["bogus"]` (closed enum violation).
    - Schema validation REFUSES `schemaVersion: "1.5.0"` after the bump (const mismatch).
    - `promoteIntentDraft` minted intent has `schemaVersion: "1.6.0"`.
  </behavior>
  <action>
    1. **`packages/intent/schema/confirmed-intent.schema.json`**: change line 21 `"const": "1.5.0"` → `"const": "1.6.0"`. Locate the `capabilityEnvelope` property block (search for `"capabilityEnvelope"`); inside its `properties` object, ADD AFTER existing properties:
       ```jsonc
       "mechanical": {
         "type": "object",
         "additionalProperties": false,
         "properties": {
           "allowed": {
             "type": "array",
             "items": { "enum": ["verify", "typecheck", "lint", "test"] },
             "uniqueItems": true,
             "default": []
           }
         }
       }
       ```
       If `capabilityEnvelope.additionalProperties === false` (it should be — schema is closed), this enum is implicitly closed.

    2. **`packages/intent/src/confirmed-intent.ts`**: replace EVERY occurrence of `"1.5.0"` (string literal in TS — both type-literal positions and runtime checks) with `"1.6.0"`. Lines 44, 86, 117, 296, 307, 312 per RESEARCH. Also EXTEND the `CapabilityEnvelope` interface to include:
       ```typescript
       readonly mechanical?: {
         readonly allowed?: readonly ("verify" | "typecheck" | "lint" | "test")[];
       };
       ```
       Use `exactOptionalPropertyTypes`-friendly shape (no `| undefined` in the value type).

    3. **`packages/intent/src/promote-intent-draft.ts:192`**: replace `"1.5.0"` → `"1.6.0"`.

    4. **`packages/authority/src/stage-reader/factory.ts:259`**: replace the `"1.5.0"` default literal with `"1.6.0"`.

    Run `pnpm --filter @protostar/intent build` and `pnpm --filter @protostar/authority build` to confirm types compile. Test failures here are expected and addressed by Task 3.
  </action>
  <verify>
    <automated>grep -q '"const": "1.6.0"' packages/intent/schema/confirmed-intent.schema.json &amp;&amp; ! grep -q '"1\.5\.0"' packages/intent/src/confirmed-intent.ts packages/intent/src/promote-intent-draft.ts packages/authority/src/stage-reader/factory.ts &amp;&amp; grep -q '"verify".*"typecheck".*"lint".*"test"' packages/intent/schema/confirmed-intent.schema.json &amp;&amp; pnpm --filter @protostar/intent build &amp;&amp; pnpm --filter @protostar/authority build</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c '"1\.5\.0"' packages/intent/src/ packages/authority/src/` returns 0 across non-test source files (search excluding `.test.ts`).
    - `packages/intent/schema/confirmed-intent.schema.json` contains the literal substring `"const": "1.6.0"`.
    - Schema contains `"mechanical"` object with `"allowed"` enum of `["verify", "typecheck", "lint", "test"]`.
    - `pnpm --filter @protostar/intent build` exits 0.
    - `pnpm --filter @protostar/authority build` exits 0.
  </acceptance_criteria>
  <done>Schema and core type literals reflect 1.6.0 with mechanical.allowed; intent + authority packages compile.</done>
</task>

<task type="auto">
  <name>Task 2: Cascade test/fixture literals + inject mechanical.allowed defaults</name>
  <files>packages/intent/src/internal/test-builders.ts, packages/intent/src/acceptance-criteria-normalization.test.ts, packages/intent/src/capability-envelope.test.ts, packages/intent/src/confirmed-intent-immutability.test.ts, packages/intent/src/confirmed-intent.test.ts, packages/intent/src/public-split-exports.contract.test.ts, packages/authority/src/stage-reader/factory.test.ts, packages/authority/src/signature/sign-verify.test.ts, packages/admission-e2e/src/authority-governance-kernel.e2e.test.ts, packages/admission-e2e/src/calibration-log-append.contract.test.ts, packages/admission-e2e/src/evaluation-runner-no-fs.contract.test.ts, packages/admission-e2e/src/no-skipped-evaluation.contract.test.ts, packages/admission-e2e/src/planning-mission-prior-summary.contract.test.ts, packages/evaluation/src/create-spec-ontology-snapshot.test.ts, packages/evaluation/src/lineage-hash.test.ts, packages/lmstudio-adapter/internal/test-fixtures/cosmetic-tweak-fixture.ts, apps/factory-cli/src/load-factory-config.test.ts, apps/factory-cli/src/run-real-execution.test.ts, examples/intents/scaffold.json, examples/intents/bad/missing-capability.json</files>
  <read_first>
    - packages/intent/src/internal/test-builders.ts (the makeConfirmedIntent / make-style helpers — single edit propagates to many tests)
    - .planning/phases/12-authority-boundary-stabilization/12-RESEARCH.md §"Schema Cascade" recipe steps 5-6 + Pitfall 8 (lines 1029-1033)
    - examples/intents/scaffold.json (current shape; mechanical block to add)
    - examples/intents/bad/missing-capability.json
    - apps/factory-cli/src/wiring/review-loop.ts:115-125 (defaultMechanicalCommandsForArchetype — confirms which names cosmetic-tweak uses)
  </read_first>
  <action>
    Run a global search-and-replace across the 20 listed files: every literal `"1.5.0"` → `"1.6.0"`. Use `grep -rln '"1\.5\.0"' packages/ apps/ examples/` to confirm the file set matches the frontmatter list before editing — if any new `1.5.0` references exist (research scanned 2026-04-29), include them.

    For EVERY existing test fixture and example intent that constructs a `ConfirmedIntent` literal with a `capabilityEnvelope`, ADD a `mechanical` block:
    ```typescript
    capabilityEnvelope: {
      // ... existing fields ...
      mechanical: { allowed: ["verify", "lint"] }
    }
    ```
    or in JSON:
    ```jsonc
    "capabilityEnvelope": {
      "mechanical": { "allowed": ["verify", "lint"] }
    }
    ```
    The set `["verify", "lint"]` matches `defaultMechanicalCommandsForArchetype` for cosmetic-tweak (RESEARCH line 528). This preserves existing run behavior under default-deny (Pitfall 8).

    For `examples/intents/scaffold.json` and `examples/intents/bad/missing-capability.json`: add the `mechanical.allowed` block. These will need re-signing in Task 3 (the signature includes the entire envelope).

    Most propagation should flow through `packages/intent/src/internal/test-builders.ts` — check if the central builder injects `capabilityEnvelope` defaults; if yes, add `mechanical: { allowed: ["verify","lint"] }` there ONCE rather than per-test. Per-test files only need the `1.5.0` → `1.6.0` literal replacement.

    Skip files where `1.5.0` appears in a non-schemaVersion context (e.g., a node version, a date) — RESEARCH confirms the 25-file scan is exhaustive but verify each match before replacing.
  </action>
  <verify>
    <automated>(! grep -rln '"1\.5\.0"' packages/ apps/ examples/ 2>/dev/null) &amp;&amp; pnpm --filter @protostar/intent test &amp;&amp; pnpm --filter @protostar/evaluation test &amp;&amp; pnpm --filter @protostar/lmstudio-adapter build</automated>
  </verify>
  <acceptance_criteria>
    - `grep -rln '"1\.5\.0"' packages/ apps/ examples/` returns nothing (all 25 files cascaded; no stragglers).
    - `pnpm --filter @protostar/intent test` exits 0 (signed intent test still runs against the 1.5.0 fixture file — Task 3 renames it).
    - Every fixture or test that constructs a `capabilityEnvelope` includes `mechanical: { allowed: ["verify","lint"] }`.
  </acceptance_criteria>
  <done>All 1.5.0 → 1.6.0 literals cascaded; default mechanical.allowed injected per fixture; per-package builds green (signed-intent test still pending Task 3 re-sign).</done>
</task>

<task type="auto">
  <name>Task 3: Re-sign signed fixtures + rename signed-intent test</name>
  <files>examples/intents/scaffold.json, examples/intents/bad/missing-capability.json, packages/admission-e2e/src/signed-intent-1-5-0.test.ts, packages/admission-e2e/src/signed-intent-1-6-0.test.ts</files>
  <read_first>
    - packages/admission-e2e/src/signed-intent-1-5-0.test.ts (current contents; the test reconstructs the signature when it builds its fixture — pattern to mirror)
    - packages/authority/src/signature/sign-verify.ts (signing API)
    - packages/authority/src/signature/canonicalize.ts (c14n marker `json-c14n@1.0`)
    - examples/intents/scaffold.json (current signature block; needs replacement)
    - .planning/phases/12-authority-boundary-stabilization/12-RESEARCH.md §"Schema Cascade" recipe step 6-7 + Pitfall 1 (lines 988-993)
    - .planning/phases/07-delivery/07-01-schema-cascade-PLAN.md (re-sign recipe)
  </read_first>
  <action>
    1. **Rename the test file**: `git mv packages/admission-e2e/src/signed-intent-1-5-0.test.ts packages/admission-e2e/src/signed-intent-1-6-0.test.ts`. Inside the file, replace every test name string mentioning `"1.5.0"` with `"1.6.0"`.

    2. **Re-sign `examples/intents/scaffold.json`**: write a small one-shot node script (or interactive `node` REPL invocation) that:
       a. reads `examples/intents/scaffold.json`,
       b. strips the existing `signature` block,
       c. confirms `schemaVersion === "1.6.0"` and the body includes `capabilityEnvelope.mechanical.allowed: ["verify","lint"]`,
       d. invokes the signing API from `@protostar/authority` (`buildSignatureEnvelope` or equivalent — read `signature/sign-verify.ts` for the exact export name) using the existing test signing key,
       e. writes the new envelope back. The signature block must contain `"canonicalForm": "json-c14n@1.0"`.

    3. **Re-sign `examples/intents/bad/missing-capability.json`** the same way. (This fixture is intentionally missing a capability — the signature should still be valid against its body; the test asserts admission rejects it on capability grounds, not signature grounds.)

    4. Confirm signing by running `pnpm --filter @protostar/admission-e2e test` (the renamed `signed-intent-1-6-0.test.ts` should pass; signature mismatch would fail loud per Pitfall 1).

    Do NOT hand-craft signature hashes. Use the c14n+sign pipeline from `@protostar/authority` exactly as Phase 7 plan 07-01 did.
  </action>
  <verify>
    <automated>test ! -f packages/admission-e2e/src/signed-intent-1-5-0.test.ts &amp;&amp; test -f packages/admission-e2e/src/signed-intent-1-6-0.test.ts &amp;&amp; grep -q '"canonicalForm": "json-c14n@1.0"' examples/intents/scaffold.json &amp;&amp; grep -q '"schemaVersion": "1.6.0"' examples/intents/scaffold.json &amp;&amp; pnpm --filter @protostar/admission-e2e test</automated>
  </verify>
  <acceptance_criteria>
    - File `packages/admission-e2e/src/signed-intent-1-5-0.test.ts` does NOT exist.
    - File `packages/admission-e2e/src/signed-intent-1-6-0.test.ts` exists.
    - `examples/intents/scaffold.json` contains `"schemaVersion": "1.6.0"` AND `"canonicalForm": "json-c14n@1.0"` AND a `mechanical.allowed` array.
    - `pnpm --filter @protostar/admission-e2e test` exits 0 (signed-intent verify passes).
    - Full `pnpm run verify` deferred to 12-01 Task 3 (Wave 0 end-of-wave gate).
  </acceptance_criteria>
  <done>Schema 1.6.0 fully cascaded; signed fixtures re-signed via the canonical c14n pipeline; full verify green.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| operator config → admission | Free-form mechanical argv was the trust gap; closed enum at admission seals it |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-12-01 | Tampering / Elevation of Privilege | `confirmedIntent.schemaVersion` + `capabilityEnvelope.mechanical.allowed` enum | mitigate | Closed JSON-schema enum at admission time refuses unknown mechanical command names before signing |
</threat_model>

<verification>
- Full `pnpm run verify` (5x flake check) is the Wave 0 end-of-wave gate in 12-01 Task 3 — runs after this plan + 12-03 land.
- 0 occurrences of `"1.5.0"` remaining in source/tests/fixtures.
- 2 signed examples re-signed under c14n@1.0.
- `signed-intent-1-6-0.test.ts` renamed and green.
</verification>

<success_criteria>
- AUTH-04 satisfied: schema 1.6.0 with `mechanical.allowed` closed enum; cascade complete; fixtures re-signed.
- Pitfall 8 mitigated: every fixture defaults `mechanical: { allowed: ["verify","lint"] }` so cosmetic-tweak runs continue to admit.
</success_criteria>

<output>
After completion, create `.planning/phases/12-authority-boundary-stabilization/12-02-SUMMARY.md`
</output>
