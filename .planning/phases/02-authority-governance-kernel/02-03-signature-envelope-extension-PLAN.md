---
phase: 02-authority-governance-kernel
plan: 03
type: execute
wave: 1
depends_on: [01]
files_modified:
  - packages/intent/src/confirmed-intent.ts
  - packages/intent/schema/confirmed-intent.schema.json
  - packages/intent/src/confirmed-intent.test.ts
autonomous: true
requirements:
  - GOV-06
must_haves:
  truths:
    - "`SignatureEnvelope` carries a new `canonicalForm` field tagged `\"json-c14n@1.0\"` (Q-18)"
    - "`confirmed-intent.schema.json` `schemaVersion` is widened to `enum: [\"1.0.0\", \"1.1.0\"]` (A8 lock — NOT a hard bump)"
    - "Phase 1 fixtures with `signature: null` + `schemaVersion: \"1.0.0\"` STILL VALIDATE — regression test passes"
    - "New 1.1.0 emissions carry the canonicalForm field; old 1.0.0 reads omit it"
    - "No `mintConfirmedIntent` re-export added to public barrel (Phase 1 contract test still pins surface to `promoteIntentDraft`)"
  artifacts:
    - path: packages/intent/src/confirmed-intent.ts
      provides: "Extended SignatureEnvelope type with canonicalForm field; schemaVersion widened to 1.0.0|1.1.0"
      contains: "canonicalForm"
    - path: packages/intent/schema/confirmed-intent.schema.json
      provides: "Schema accepts both 1.0.0 (Phase 1 shape, signature: null) and 1.1.0 (signed shape with canonicalForm)"
      contains: '"enum": ["1.0.0", "1.1.0"]'
  key_links:
    - from: packages/intent/src/confirmed-intent.ts
      to: packages/intent/schema/confirmed-intent.schema.json
      via: "TypeScript shape mirrors JSON Schema definition"
      pattern: "canonicalForm"
---

<objective>
Wave 1 / parallel-friendly: extend the `SignatureEnvelope` reserved by Phase 1 (Plan 06b at `packages/intent/src/confirmed-intent.ts:19-25`) with a `canonicalForm` discriminator tag (Q-18 lock = `"json-c14n@1.0"`), and **widen** the JSON Schema's `schemaVersion` from `const: "1.0.0"` to `enum: ["1.0.0", "1.1.0"]` per A8 lock — backward-compat for the 208 historical run dirs flagged in CONCERNS.md.

Per Q-18: "If the canonicalization scheme changes (e.g., RFC 8785 JCS), the field tag changes, and verification can either fail-closed on unknown tags or look up the right canonicalizer." Per A8: "widen rather than hard-bump."

Per RESEARCH.md Pitfall 6: "Phase 1 always emitted `signature: null`; Phase 2 emits filled signatures with `canonicalForm`. Both shapes valid against the widened schema." A regression test for the Phase 1 fixture is mandatory.

Per RESEARCH.md anti-pattern: "Treating `escalate` as a brand-new outcome literal." NOT this plan's concern; documented here for completeness — `escalate` already exists at `packages/intent/src/admission-decision.ts:28` and is reused in Wave 3.

Purpose: Wave 2's signer (Plan 05) needs the type-level slot for `canonicalForm`; without this plan, the signer would have to invent the field shape. Decoupling this from the signer keeps Wave 2 atomic.

Output: Type + schema both accept the canonicalForm field; old artifacts still validate; new artifacts can carry it.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/phases/02-authority-governance-kernel/02-CONTEXT.md
@.planning/phases/02-authority-governance-kernel/02-RESEARCH.md
@.planning/phases/01-intent-planning-admission/01-04-schema-version-infra-PLAN.md
@.planning/phases/01-intent-planning-admission/01-06b-branded-confirmed-intent-PLAN.md
@packages/intent/src/confirmed-intent.ts
@packages/intent/schema/confirmed-intent.schema.json

<interfaces>
<!-- Existing Phase 1 reservation. Extend, do not replace. -->

From packages/intent/src/confirmed-intent.ts (current — lines 19-25 region):
```ts
export interface SignatureEnvelope {
  readonly algorithm: "sha256";    // already locked
  readonly value: string;          // hex
}
// (Phase 1 reserved this; signature field on ConfirmedIntent is `SignatureEnvelope | null`)
```

From packages/intent/schema/confirmed-intent.schema.json (current):
```json
"schemaVersion": { "const": "1.0.0" }
"signature": { "anyOf": [ { "type": "null" }, { "$ref": "#/$defs/SignatureEnvelope" } ] }
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Extend SignatureEnvelope type + widen schema</name>
  <files>
    packages/intent/src/confirmed-intent.ts,
    packages/intent/schema/confirmed-intent.schema.json,
    packages/intent/src/confirmed-intent.test.ts
  </files>
  <read_first>
    - packages/intent/src/confirmed-intent.ts (find the current SignatureEnvelope reservation and the mintConfirmedIntent function)
    - packages/intent/schema/confirmed-intent.schema.json (entire file)
    - packages/intent/src/confirmed-intent.test.ts (existing test file — see how Phase 1 tests the schema; add new cases here)
    - .planning/phases/02-authority-governance-kernel/02-CONTEXT.md Q-18 (lock: canonicalForm tag = "json-c14n@1.0")
    - .planning/phases/02-authority-governance-kernel/02-RESEARCH.md §"Pitfall 6: schemaVersion bump strategy" (lines ~366-369)
  </read_first>
  <behavior>
    - `SignatureEnvelope` type now has `algorithm: "sha256"`, `canonicalForm: "json-c14n@1.0"`, `value: string` (hex)
    - The TS literal type for `canonicalForm` is `"json-c14n@1.0"` (single allowed value in Phase 2 — Q-18 says future tags can be added by extending the literal union; fail-closed on unknown is the verifier's job, not the type's)
    - JSON Schema `schemaVersion` is `enum: ["1.0.0", "1.1.0"]`
    - JSON Schema `SignatureEnvelope.canonicalForm`: `enum: ["json-c14n@1.0"]`
    - When `schemaVersion === "1.0.0"`: `signature` MUST be `null` (no canonicalForm field). When `schemaVersion === "1.1.0"`: `signature` may be a populated SignatureEnvelope with canonicalForm. Encode this conditional with JSON Schema `if/then/else` OR with `oneOf` over two complete shape definitions.
    - `mintConfirmedIntent` accepts an optional signature input; when provided, the canonicalForm is populated; the runtime `schemaVersion` literal in `mintConfirmedIntent` becomes `"1.0.0"` IFF `signature === null` ELSE `"1.1.0"` (auto-bump on signing — keeps Phase 1 fixture emissions byte-identical).
    - REGRESSION: an existing `intent.json` with `schemaVersion: "1.0.0"` and `signature: null` round-trips through `parseConfirmedIntent` → schema validate → returns ok (test must exist and pass)
  </behavior>
  <action>
**Type changes — `packages/intent/src/confirmed-intent.ts`:**

Extend the `SignatureEnvelope` interface (around the Phase-1-reserved slot at lines 19-25):
```ts
export type CanonicalFormTag = "json-c14n@1.0";  // Q-18 lock; extend union when v2 lands

export interface SignatureEnvelope {
  readonly algorithm: "sha256";
  readonly canonicalForm: CanonicalFormTag;
  readonly value: string;  // hex SHA-256 digest
}
```

In the `ConfirmedIntentBaseShape` interface (or wherever `schemaVersion` is currently a `"1.0.0"` literal), widen to the union:
```ts
schemaVersion: "1.0.0" | "1.1.0";
```

In `mintConfirmedIntent`, the line currently setting `schemaVersion: "1.0.0"` (around line 116 per the read above) becomes:
```ts
schemaVersion: input.signature ? "1.1.0" : "1.0.0",
```
This preserves byte-identical Phase 1 emissions whenever `signature` is null (the only case Phase 1 actually exercised — Wave 1 has shipped no signed-intent yet).

If `mintConfirmedIntent` validates the input signature shape, ensure it accepts `canonicalForm: "json-c14n@1.0"` only (other tags are fail-closed at verifier level — Plan 05).

DO NOT add `mintConfirmedIntent` to any public barrel — Phase 1's contract test pins surface to `promoteIntentDraft` only.

**Schema changes — `packages/intent/schema/confirmed-intent.schema.json`:**

Replace `"schemaVersion": { "const": "1.0.0" }` with `"schemaVersion": { "enum": ["1.0.0", "1.1.0"] }`.

In the `SignatureEnvelope` `$defs` definition, add the `canonicalForm` property:
```json
"SignatureEnvelope": {
  "type": "object",
  "additionalProperties": false,
  "required": ["algorithm", "canonicalForm", "value"],
  "properties": {
    "algorithm": { "const": "sha256" },
    "canonicalForm": { "enum": ["json-c14n@1.0"] },
    "value": { "type": "string", "pattern": "^[0-9a-f]{64}$" }
  }
}
```

Add an `allOf` constraint pinning the schemaVersion ↔ signature shape conditional:
```json
"allOf": [
  {
    "if": { "properties": { "schemaVersion": { "const": "1.0.0" } } },
    "then": { "properties": { "signature": { "type": "null" } } }
  },
  {
    "if": { "properties": { "schemaVersion": { "const": "1.1.0" } } },
    "then": { "properties": { "signature": { "$ref": "#/$defs/SignatureEnvelope" } } }
  }
]
```

**Test changes — `packages/intent/src/confirmed-intent.test.ts`:**

Add three test cases (or new test files alongside existing ones — match Phase 1 pattern):

1. **Regression — Phase 1 shape still validates:** `parseConfirmedIntent` against a fixture with `schemaVersion: "1.0.0"` and `signature: null` returns `ok: true`. Use any existing `examples/intents/*.json` Phase 1 fixture as input.
2. **Forward — 1.1.0 with canonicalForm validates:** A constructed object with `schemaVersion: "1.1.0"`, `signature: { algorithm: "sha256", canonicalForm: "json-c14n@1.0", value: "0".repeat(64) }` parses ok.
3. **Negative — 1.0.0 with non-null signature fails:** `{ schemaVersion: "1.0.0", signature: { algorithm: "sha256", canonicalForm: "json-c14n@1.0", value: "0".repeat(64) } }` → `ok: false`.
4. **Negative — unknown canonicalForm tag fails:** `{ schemaVersion: "1.1.0", signature: { ..., canonicalForm: "json-c14n@2.0", value: ... } }` → `ok: false` at the schema layer (fail-closed).
5. **Negative — value not 64-hex-char fails:** `value: "abc"` → `ok: false`.

Run `pnpm --filter @protostar/intent test` to confirm all pass.
  </action>
  <verify>
    <automated>pnpm --filter @protostar/intent test &amp;&amp; pnpm --filter @protostar/admission-e2e test</automated>
  </verify>
  <acceptance_criteria>
    - `pnpm --filter @protostar/intent test` exits 0
    - `pnpm --filter @protostar/admission-e2e test` exits 0 (Phase 1 contract test still pins `promoteIntentDraft` as sole producer — no regression)
    - `grep -c 'canonicalForm' packages/intent/src/confirmed-intent.ts` >= 1
    - `grep -c 'json-c14n@1.0' packages/intent/src/confirmed-intent.ts` >= 1
    - `grep -c '\"enum\": \\[\"1.0.0\", \"1.1.0\"\\]' packages/intent/schema/confirmed-intent.schema.json` >= 1
    - `grep -c '\"canonicalForm\"' packages/intent/schema/confirmed-intent.schema.json` >= 1
    - `pnpm run verify:full` exits 0 (regression — entire Phase 1 suite still passes)
  </acceptance_criteria>
  <done>SignatureEnvelope extended, schema widened, Phase 1 fixtures regress-tested green, Wave 2 signer (Plan 05) can now type-check against the new shape.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Schema versioning boundary | Old artifacts (208 historical run dirs) MUST keep validating after Phase 2 ships |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-2-7 | Tampering | Canonicalization ambiguity (different canonicalForm tags producing different hashes) | mitigate (partial) | This plan ships the discriminator field. The actual canonicalizer + fail-closed-on-unknown-tag logic ships in Plan 05. Together they close the gap. |
| T-2-6 | Tampering | Stage reader accepts a wrong-schema artifact | mitigate | Schema's `if/then/else` constraint forbids 1.0.0 + non-null signature AND 1.1.0 + null signature; readers in Plan 09 validate against the widened schema. |
</threat_model>

<verification>
- Phase 1 fixture regression: existing `examples/intents/*.json` parse + validate ok
- New 1.1.0-with-signature shape parses ok
- Unknown canonicalForm tag fails schema validation (fail-closed)
- `pnpm run verify:full` green
</verification>

<success_criteria>
- `SignatureEnvelope` type + schema accept `canonicalForm: "json-c14n@1.0"`
- `schemaVersion` widened to `["1.0.0", "1.1.0"]` (no hard bump)
- Phase 1 fixtures still validate
- Plan 05 has type slot to populate
</success_criteria>

<output>
After completion, create `.planning/phases/02-authority-governance-kernel/02-03-signature-envelope-extension-SUMMARY.md`
</output>
