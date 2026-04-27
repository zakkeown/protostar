---
phase: 02-authority-governance-kernel
plan: 03
type: execute
wave: 1
depends_on: [01]
files_modified:
  - packages/intent/src/confirmed-intent.ts
  - packages/intent/src/promote-intent-draft.ts
  - packages/intent/schema/confirmed-intent.schema.json
  - packages/intent/src/confirmed-intent.test.ts
  - packages/intent/src/public-split-exports.contract.test.ts
  - packages/intent/src/confirmed-intent-immutability.test.ts
  - packages/intent/src/acceptance-criteria-normalization.test.ts
autonomous: true
requirements:
  - GOV-06
must_haves:
  truths:
    - "`SignatureEnvelope` carries a new `canonicalForm` field tagged `\"json-c14n@1.0\"` (Q-18)"
    - "`confirmed-intent.schema.json` `schemaVersion` is HARD-BUMPED to `\"1.1.0\"` (single value, Q-18 user lock — A8 widening assumption is OVERRIDDEN)"
    - "`mintConfirmedIntent` always emits `schemaVersion: \"1.1.0\"` going forward; signed-or-unsigned both use 1.1.0"
    - "Phase 1 in-repo tests that hardcoded `schemaVersion: \"1.0.0\"` are migrated to `\"1.1.0\"` (NOT preserved as regression — A8 overridden)"
    - "Legacy 1.0.0 artifacts on disk (208 historical run dirs) are handled by Plan 09's stage reader via try-new-then-legacy at read time — NOT by schema acceptance"
    - "No `mintConfirmedIntent` re-export added to public barrel (Phase 1 contract test still pins surface to `promoteIntentDraft`)"
  artifacts:
    - path: packages/intent/src/confirmed-intent.ts
      provides: "Extended SignatureEnvelope type with canonicalForm field; schemaVersion locked to single literal 1.1.0"
      contains: "canonicalForm"
    - path: packages/intent/schema/confirmed-intent.schema.json
      provides: "Schema accepts ONLY 1.1.0 (hard bump). signature may be null (unsigned) or a populated SignatureEnvelope (signed)"
      contains: '"const": "1.1.0"'
  key_links:
    - from: packages/intent/src/confirmed-intent.ts
      to: packages/intent/schema/confirmed-intent.schema.json
      via: "TypeScript shape mirrors JSON Schema definition"
      pattern: "canonicalForm"
---

<objective>
Wave 1 / parallel-friendly: extend the `SignatureEnvelope` reserved by Phase 1 (Plan 06b at `packages/intent/src/confirmed-intent.ts:19-25`) with a `canonicalForm` discriminator tag (Q-18 lock = `"json-c14n@1.0"`), and **hard-bump** the JSON Schema's `schemaVersion` from `const: "1.0.0"` to `const: "1.1.0"`.

**REVISION NOTE (iteration 2, 2026-04-27):** This plan was originally drafted to *widen* `schemaVersion` to `enum: ["1.0.0", "1.1.0"]` per assumption A8 from RESEARCH.md. **The user has explicitly OVERRIDDEN A8 via Q-18 lock and revision-iteration-2 directive: hard bump.** Schema accepts only 1.1.0 going forward. Legacy 1.0.0 artifacts on disk are handled at the read layer by Plan 09's stage reader (try-new-then-legacy pattern — already its design; see `02-09-stage-reader-and-repo-runtime-PLAN.md` Truth #2). Do NOT re-introduce dual-version validation or `if/then/else` schema branching.

Per Q-18 (user lock): canonicalization tag = `"json-c14n@1.0"`. If the canonicalization scheme changes (e.g., RFC 8785 JCS), the field tag changes, and verification can either fail-closed on unknown tags or look up the right canonicalizer.

Per RESEARCH.md anti-pattern: "Treating `escalate` as a brand-new outcome literal." NOT this plan's concern; documented here for completeness — `escalate` already exists at `packages/intent/src/admission-decision.ts:28` and is reused in Wave 3.

Purpose: Wave 2's signer (Plan 05) needs the type-level slot for `canonicalForm`; without this plan, the signer would have to invent the field shape. Decoupling this from the signer keeps Wave 2 atomic.

Output: Type + schema both require the canonicalForm field on populated signatures; new artifacts emit `schemaVersion: "1.1.0"`; old 1.0.0 artifacts on disk handled by Plan 09 stage reader's legacy-fallback path.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
Read first: @.planning/phases/02-authority-governance-kernel/02-CORRECTIONS.md (Correction 1 stub-then-fill notes; BLOCKER 4 hard-bump resolution)

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
  <name>Task 1: Extend SignatureEnvelope type + hard-bump schema to 1.1.0 + migrate Phase 1 inline-literal tests</name>
  <files>
    packages/intent/src/confirmed-intent.ts,
    packages/intent/src/promote-intent-draft.ts,
    packages/intent/schema/confirmed-intent.schema.json,
    packages/intent/src/confirmed-intent.test.ts,
    packages/intent/src/public-split-exports.contract.test.ts,
    packages/intent/src/confirmed-intent-immutability.test.ts,
    packages/intent/src/acceptance-criteria-normalization.test.ts
  </files>
  <read_first>
    - .planning/phases/02-authority-governance-kernel/02-CORRECTIONS.md (BLOCKER 4 directive — hard bump per Q-18 user lock)
    - packages/intent/src/confirmed-intent.ts (find current SignatureEnvelope reservation, mintConfirmedIntent at line 92, parseConfirmedIntent at line 203, schemaVersion guard at line 281-288)
    - packages/intent/src/promote-intent-draft.ts (line 192 — production mint path; emits `schemaVersion: "1.0.0"` today; MUST be migrated to "1.1.0" alongside the type/schema bump or every newly minted intent fails parseConfirmedIntent)
    - packages/intent/schema/confirmed-intent.schema.json (entire file)
    - packages/intent/src/confirmed-intent.test.ts (existing test file — see how Phase 1 tests the schema; add new cases here)
    - packages/intent/src/public-split-exports.contract.test.ts (lines 52, 90 — hardcoded `schemaVersion: "1.0.0"` literals to migrate)
    - packages/intent/src/confirmed-intent-immutability.test.ts (lines 94, 156, 219 — same migration)
    - packages/intent/src/acceptance-criteria-normalization.test.ts (line 385 — same migration)
    - packages/intent/src/clarification-report-schema.test.ts (lines 102, 106 — these are for `clarification-report.schema.json`, NOT `confirmed-intent.schema.json` — DO NOT migrate; clarification-report is a different artifact and stays at 1.0.0)
    - .planning/phases/02-authority-governance-kernel/02-CONTEXT.md Q-18 (lock: canonicalForm tag = "json-c14n@1.0"; hard bump per user revision iteration 2)
  </read_first>
  <behavior>
    - `SignatureEnvelope` type now has `algorithm: "sha256"`, `canonicalForm: "json-c14n@1.0"`, `value: string` (hex)
    - The TS literal type for `canonicalForm` is `"json-c14n@1.0"` (single allowed value in Phase 2 — Q-18 says future tags can be added by extending the literal union; fail-closed on unknown is the verifier's job)
    - JSON Schema `schemaVersion` is `const: "1.1.0"` (single value — NOT an enum)
    - JSON Schema `SignatureEnvelope.canonicalForm`: `enum: ["json-c14n@1.0"]` (still an enum because future tags will extend it; today there's only one)
    - JSON Schema `signature`: `anyOf: [ {type: "null"}, {$ref: "#/$defs/SignatureEnvelope"} ]` — both shapes valid under 1.1.0 (signed or unsigned). NO `if/then/else` conditional on schemaVersion; the schema accepts only 1.1.0.
    - `mintConfirmedIntent` always emits `schemaVersion: "1.1.0"` (line 111 in current file). Signed-vs-unsigned is encoded in the `signature` field, NOT in the schemaVersion.
    - `parseConfirmedIntent` accepts ONLY `schemaVersion: "1.1.0"`. Update the guard at lines 281-288 (currently `errors.push("schemaVersion must be \"1.0.0\" when provided.")`) to require `"1.1.0"`. Legacy 1.0.0 disk artifacts are NOT this function's concern; Plan 09's stage reader handles legacy fallback BEFORE calling `parseConfirmedIntent` (it must up-convert or branch at the read layer).
    - Phase 1 in-repo tests that hardcoded `schemaVersion: "1.0.0"` are migrated to `"1.1.0"` (4 test files, 5 sites total — listed in `<files>`). Comment on each migration site: `// Migrated to 1.1.0 per Phase 2 Plan 03 hard bump (Q-18 user lock).`
    - The clarification-report tests (`clarification-report-schema.test.ts`) are NOT migrated — that schema is a different artifact and stays at 1.0.0.
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

In the `ConfirmedIntentBaseShape` interface (or wherever `schemaVersion` is currently a `"1.0.0"` literal), change to single literal:
```ts
schemaVersion: "1.1.0";
```

In `mintConfirmedIntent` (line ~111), the line currently setting `schemaVersion: "1.0.0"` becomes:
```ts
schemaVersion: "1.1.0",
```

In `parseConfirmedIntent`'s schemaVersion guard (lines 281-288 region — `readOptionalSchemaVersion`), update the literal check and error message:
```ts
errors.push('schemaVersion must be "1.1.0" when provided.');
```
And update the success path (line ~269) `schemaVersion: schemaVersion ?? "1.1.0"`.

**Production mint path — `packages/intent/src/promote-intent-draft.ts` line 192:**

This is the production producer used by factory-cli + tests + every promotion path. It currently emits `schemaVersion: "1.0.0"` literal at line 192. Update:
```ts
schemaVersion: "1.1.0",
```
Without this change, every newly minted intent will fail `parseConfirmedIntent` after Plan 03 lands (the guard now requires "1.1.0"). This is the production-breaking regression that makes Plan 03 hard-bump irreversible mid-phase if missed.

If `mintConfirmedIntent` validates the input signature shape, ensure it accepts `canonicalForm: "json-c14n@1.0"` only (other tags are fail-closed at verifier level — Plan 05).

DO NOT add `mintConfirmedIntent` to any public barrel — Phase 1's contract test pins surface to `promoteIntentDraft` only.

**Schema changes — `packages/intent/schema/confirmed-intent.schema.json`:**

Replace `"schemaVersion": { "const": "1.0.0" }` with `"schemaVersion": { "const": "1.1.0" }`.

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

**DO NOT** add an `if/then/else` or `allOf` block conditional on schemaVersion. Schema accepts only 1.1.0 with `signature: null | SignatureEnvelope`. Both signed and unsigned 1.1.0 emissions are valid; choice between them is encoded in the `signature` field, not the schemaVersion.

**Test migrations — Phase 1 inline literals → 1.1.0:**

Migrate the 5 sites listed in `<read_first>`. Each is an inline JS object literal with `schemaVersion: "1.0.0"` (and possibly an assertion comparing to `"1.0.0"`). Change the literal AND the comparison to `"1.1.0"`. Add a one-line comment above each migrated site:
```ts
// Migrated to 1.1.0 per Phase 2 Plan 03 hard bump (Q-18 user lock, revision iteration 2).
```

**Test changes — `packages/intent/src/confirmed-intent.test.ts`:**

Add four test cases for the new shape:

1. **Forward — 1.1.0 unsigned validates:** A constructed object with `schemaVersion: "1.1.0"`, `signature: null`, all required fields → `parseConfirmedIntent` returns `ok: true`.
2. **Forward — 1.1.0 signed validates:** `schemaVersion: "1.1.0"`, `signature: { algorithm: "sha256", canonicalForm: "json-c14n@1.0", value: "0".repeat(64) }` → `ok: true`.
3. **Negative — 1.0.0 fails (hard bump):** `{ schemaVersion: "1.0.0", signature: null, ... }` → `ok: false`, errors mentions `schemaVersion must be "1.1.0"`. **This pins the hard bump in a regression test.**
4. **Negative — unknown canonicalForm tag fails:** `{ schemaVersion: "1.1.0", signature: { ..., canonicalForm: "json-c14n@2.0", value: ... } }` → `ok: false` at the schema layer (fail-closed).
5. **Negative — value not 64-hex-char fails:** `value: "abc"` → `ok: false`.

Run `pnpm --filter @protostar/intent test` to confirm all pass.

**Note on Phase 1 fixture round-trip via tests:** any existing Phase 1 test that mints an intent (via `mintConfirmedIntent` or `promoteIntentDraft` or `buildConfirmedIntentForTest`) and asserts `schemaVersion === "1.0.0"` MUST be updated to assert `=== "1.1.0"`. This includes the 4 test files listed in `<files>` PLUS any other test discovered during execution. Use `grep -rn "schemaVersion.*1\\.0\\.0" packages/intent/ packages/admission-e2e/ packages/planning/` before completing the task to ensure nothing else is hardcoding 1.0.0 for confirmed-intent specifically. Filter out `clarification-report` matches (different artifact, stays at 1.0.0).
  </action>
  <verify>
    <automated>pnpm --filter @protostar/intent test &amp;&amp; pnpm --filter @protostar/admission-e2e test</automated>
  </verify>
  <acceptance_criteria>
    - `pnpm --filter @protostar/intent test` exits 0
    - `pnpm --filter @protostar/admission-e2e test` exits 0 (Phase 1 contract test still pins `promoteIntentDraft` as sole producer — no surface regression)
    - `grep -c 'canonicalForm' packages/intent/src/confirmed-intent.ts` >= 1
    - `grep -c 'json-c14n@1.0' packages/intent/src/confirmed-intent.ts` >= 1
    - `grep -c '"const": "1.1.0"' packages/intent/schema/confirmed-intent.schema.json` >= 1
    - `grep -c '"canonicalForm"' packages/intent/schema/confirmed-intent.schema.json` >= 1
    - `grep -v '^#' packages/intent/schema/confirmed-intent.schema.json | grep -c '"1.0.0"'` outputs `0` (hard bump — no 1.0.0 left in the confirmed-intent schema)
    - Hard-bump regression: `grep -rn "confirmed-intent.*schemaVersion.*1\\.0\\.0\\|schemaVersion.*1\\.0\\.0.*confirmed" packages/intent/ packages/admission-e2e/ --include="*.ts" | grep -v 'clarification' | wc -l` outputs `0` (no in-repo confirmed-intent tests still hardcode 1.0.0)
    - **Production mint path migrated (catches ALL bare `schemaVersion: "1.0.0"` sites in src/, excluding clarification-report):** `grep -rn 'schemaVersion[^"]*"1\\.0\\.0"' packages/intent/src/ | grep -v 'clarification-report' | wc -l` outputs `0`
    - `pnpm run verify:full` exits 0 (full regression — Phase 1 still passes after migration)
  </acceptance_criteria>
  <done>SignatureEnvelope extended; schema hard-bumped to 1.1.0 (single value); Phase 1 in-repo tests migrated; legacy disk-fixture handling deferred to Plan 09 stage reader; Wave 2 signer (Plan 05) can now type-check against the new shape.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Schema versioning boundary | Old artifacts (208 historical run dirs) handled by Plan 09 stage reader's legacy fallback at READ time — NOT by schema acceptance |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-2-7 | Tampering | Canonicalization ambiguity (different canonicalForm tags producing different hashes) | mitigate (partial) | This plan ships the discriminator field. The actual canonicalizer + fail-closed-on-unknown-tag logic ships in Plan 05. Together they close the gap. |
| T-2-6 | Tampering | Stage reader accepts a wrong-schema artifact | mitigate | Schema accepts only 1.1.0. Readers in Plan 09 validate against this schema after the legacy-fallback layer up-converts or branches on disk-version detection. |
</threat_model>

<verification>
- New 1.1.0 signed + unsigned shapes parse ok
- 1.0.0 fails parse (hard bump regression test pins this)
- Unknown canonicalForm tag fails schema validation (fail-closed)
- Phase 1 in-repo tests migrated to 1.1.0; `pnpm run verify:full` green
</verification>

<success_criteria>
- `SignatureEnvelope` type + schema accept `canonicalForm: "json-c14n@1.0"`
- `schemaVersion` hard-bumped to single literal `"1.1.0"` (Q-18 user lock)
- Phase 1 in-repo tests migrated; legacy disk artifacts handled by Plan 09 stage reader
- Plan 05 has type slot to populate
</success_criteria>

<output>
After completion, create `.planning/phases/02-authority-governance-kernel/02-03-signature-envelope-extension-SUMMARY.md`
</output>
</content>
</invoke>