---
phase: 03-repo-runtime-sandbox
plan: 03
type: execute
wave: 0
depends_on: []
files_modified:
  - packages/intent/schema/confirmed-intent.schema.json
  - packages/intent/src/confirmed-intent.ts
  - packages/intent/src/capability-envelope.ts
  - packages/intent/src/promote-intent-draft.ts
  - packages/intent/src/internal/test-builders.ts
  - packages/intent/src/confirmed-intent.test.ts
  - packages/intent/src/confirmed-intent-immutability.test.ts
  - packages/intent/src/acceptance-criteria-normalization.test.ts
  - packages/intent/src/public-split-exports.contract.test.ts
  - apps/factory-cli/src/main.ts
  - apps/factory-cli/src/main.test.ts
  - examples/intents
autonomous: true
requirements: [REPO-06]
must_haves:
  truths:
    - "confirmed-intent schemaVersion bumped to 1.2.0 in JSON schema, TS literal type, parser, mint helper, and all examples"
    - "capabilityEnvelope.workspace.allowDirty: boolean field exists with default false"
    - "Parser default-fills workspace.allowDirty=false when capabilityEnvelope.workspace is absent (1.1.0→1.2.0 upconvert)"
    - "Every '1.1.0' literal occurrence audited and updated (or kept under documented historical-acceptance path)"
    - "Phase 1/2 contract tests still pass"
  artifacts:
    - path: "packages/intent/schema/confirmed-intent.schema.json"
      provides: "JSON schema 1.2.0 with workspace.allowDirty"
      contains: "1.2.0"
    - path: "packages/intent/src/capability-envelope.ts"
      provides: "CapabilityEnvelopeWorkspace type with allowDirty field"
      exports: ["CapabilityEnvelopeWorkspace"]
  key_links:
    - from: "packages/intent/src/confirmed-intent.ts"
      to: "packages/intent/src/capability-envelope.ts"
      via: "schema-version+workspace field threading"
      pattern: "1\\.2\\.0"
---

<objective>
Bump confirmed-intent schemaVersion 1.1.0 → 1.2.0 (additive: `capabilityEnvelope.workspace.allowDirty: boolean`, default `false`) per Q-14. Cascade the literal across schema file, TS types, parser, mint helper, all example fixtures, and Phase 1/2 contract tests.

Purpose: Wave 1's `dirty-worktree-status` plan needs to read `intent.capabilityEnvelope.workspace.allowDirty` to decide whether to refuse or proceed. Bumping the schema in Wave 0 unblocks Wave 1 dirty-worktree consumption AND the Wave 4 admission-e2e contract test that exercises `allowDirty: true`.
Output: Schema 1.2.0 with new field, parser handles old 1.1.0 inputs by default-filling, all `"1.1.0"` literals audited.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/03-repo-runtime-sandbox/03-CONTEXT.md
@.planning/phases/03-repo-runtime-sandbox/03-RESEARCH.md
@.planning/phases/03-repo-runtime-sandbox/03-PATTERNS.md
@packages/intent/schema/confirmed-intent.schema.json
@packages/intent/src/confirmed-intent.ts
@packages/intent/src/capability-envelope.ts
@packages/intent/src/promote-intent-draft.ts
@.planning/phases/02-authority-governance-kernel/02-03-signature-envelope-extension-SUMMARY.md

Q-14 lock: `capabilityEnvelope.workspace.allowDirty: boolean` (default `false`).
Schema bump 1.1.0 → 1.2.0. Phase 2 Plan 02-03 was the precedent hard-bump
(0→1.1.0); follow same task structure.

RESEARCH.md Pitfall 8 (lines 540-545): Audit every occurrence — schema file,
parser `readOptionalSchemaVersion`, mint helper literal, ALL `examples/intents/*.json`,
admission-e2e fixtures, Phase 1/2 contract tests pinning the literal.

Known `1.1.0` literal sites (from grep, source files only — `dist/` is regenerated):
- `packages/intent/schema/confirmed-intent.schema.json:21`
- `packages/intent/src/confirmed-intent.ts` (mint default + parser path + literal type)
- `packages/intent/src/confirmed-intent.test.ts`
- `packages/intent/src/promote-intent-draft.ts`
- `packages/intent/src/internal/test-builders.ts`
- `packages/intent/src/confirmed-intent-immutability.test.ts`
- `packages/intent/src/acceptance-criteria-normalization.test.ts`
- `packages/intent/src/public-split-exports.contract.test.ts`
- `apps/factory-cli/src/main.ts` (likely — verify)
- `apps/factory-cli/src/main.test.ts` (likely — verify)
- `examples/intents/*.json` (verify presence; may not exist)
- `packages/admission-e2e/**` (verify)

**Re-grep at execution time** — list above is from planning-time grep; new
literals may have landed.

<interfaces>
Current shape (`packages/intent/src/capability-envelope.ts:82-87`):
```typescript
export interface CapabilityEnvelope {
  readonly repoScopes: readonly RepoScopeGrant[];
  readonly toolPermissions: readonly ToolPermissionGrant[];
  readonly executeGrants?: readonly ExecuteGrant[];
  readonly budget: FactoryBudget;
}
```

Target shape (additive):
```typescript
export interface CapabilityEnvelopeWorkspace {
  readonly allowDirty: boolean;
}

export interface CapabilityEnvelope {
  readonly repoScopes: readonly RepoScopeGrant[];
  readonly toolPermissions: readonly ToolPermissionGrant[];
  readonly executeGrants?: readonly ExecuteGrant[];
  readonly workspace?: CapabilityEnvelopeWorkspace; // default { allowDirty: false }
  readonly budget: FactoryBudget;
}
```

Parser contract: `parseCapabilityEnvelope` defaults `workspace.allowDirty=false`
when input.workspace is absent; rejects non-boolean `allowDirty` with structured error.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Bump JSON schema, TS types, parser, mint helper to 1.2.0 + add allowDirty</name>
  <files>packages/intent/schema/confirmed-intent.schema.json, packages/intent/src/confirmed-intent.ts, packages/intent/src/capability-envelope.ts, packages/intent/src/promote-intent-draft.ts, packages/intent/src/internal/test-builders.ts</files>
  <behavior>
    Tests added in Task 2. Behavior here:
    - JSON schema: `schemaVersion` const = `"1.2.0"`. `capabilityEnvelope` (currently `{ "type": "object" }` free-form per PATTERNS.md note) — keep free-form for now or add a structured `workspace` property; choose minimal-disruption.
    - TS literal type: `schemaVersion: "1.2.0"`. Parser accepts `"1.2.0"` only (not `"1.1.0"` — clean cut, mirroring Phase 2's 02-03 hard-bump precedent). Existing parsed-from-disk artifacts produced by Phase 1/2 are runtime data; if any are loaded by tests, regenerate fixtures.
    - `parseCapabilityEnvelope`: if `input.workspace` is undefined → `workspace: { allowDirty: false }`. If present, must be `{ allowDirty: boolean }`; reject any other key under `workspace` (closed-set per PATTERNS.md `rejectUnknownKeys` pattern).
    - `mintConfirmedIntent` writes `schemaVersion: "1.2.0"`.
  </behavior>
  <action>
    1. **Re-grep first** (planner data is from 2026-04-27; verify):
    ```bash
    grep -rn '"1\.1\.0"' packages/intent/src packages/intent/schema apps/factory-cli/src examples packages/admission-e2e/src 2>/dev/null
    ```
    Capture the list; you'll update each occurrence.

    2. Edit `packages/intent/schema/confirmed-intent.schema.json`:
    - Line ~21: `"schemaVersion": { "const": "1.2.0" }`
    - If `capabilityEnvelope` is currently free-form (`{ "type": "object" }`), keep that for forward-compat; the structural validation lives in TS via `parseCapabilityEnvelope`. (Phase 2 Plan 02-03 followed this minimal-JSON-schema posture.)

    3. Edit `packages/intent/src/capability-envelope.ts`:
    - Add `export interface CapabilityEnvelopeWorkspace { readonly allowDirty: boolean; }`
    - Add `readonly workspace?: CapabilityEnvelopeWorkspace` field on `CapabilityEnvelope` (between `executeGrants` and `budget` to match the additive natural-grouping).
    - Extend `parseCapabilityEnvelope` to default-fill: if `record.workspace` is undefined, return shape with `workspace: { allowDirty: false }`. If present, validate `record.workspace` is an object with exactly key `allowDirty` (use `readBoolean(record.workspace, "capabilityEnvelope.workspace.allowDirty", errors)`); reject unknown keys via the same `rejectUnknownKeys` shape Phase 2 uses.

    4. Edit `packages/intent/src/confirmed-intent.ts`:
    - Literal type `schemaVersion: "1.2.0"` everywhere it appears (likely 2-3 sites).
    - `mintConfirmedIntent` returns `{ schemaVersion: "1.2.0", ... }`.
    - Parser path that historically accepted `"1.1.0"` now only accepts `"1.2.0"`. Error message: `'schemaVersion must be "1.2.0" when provided.'`

    5. Edit `packages/intent/src/promote-intent-draft.ts` (line ~149) — bump literal.

    6. Edit `packages/intent/src/internal/test-builders.ts` — bump default literal in builder function and the JSDoc comment that references `"1.1.0"`.
  </action>
  <verify>
    <automated>pnpm --filter @protostar/intent test</automated>
  </verify>
  <done>Schema file pins const `1.2.0`, TS types pin literal `"1.2.0"` everywhere, parser default-fills `workspace.allowDirty=false`, builders mint at `1.2.0`. Build succeeds.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Update intent test fixtures + add allowDirty test cases</name>
  <files>packages/intent/src/confirmed-intent.test.ts, packages/intent/src/confirmed-intent-immutability.test.ts, packages/intent/src/acceptance-criteria-normalization.test.ts, packages/intent/src/public-split-exports.contract.test.ts</files>
  <behavior>
    - All existing tests that pinned `"1.1.0"` now pin `"1.2.0"` and continue to pass.
    - New test (in `confirmed-intent.test.ts`): minting with `capabilityEnvelope.workspace = { allowDirty: true }` round-trips through parser unchanged.
    - New test: minting WITHOUT `workspace` field → parser default-fills `workspace: { allowDirty: false }`.
    - New test: minting with `capabilityEnvelope.workspace.allowDirty = "yes"` (non-boolean) is rejected with structured error.
    - New test: minting with `capabilityEnvelope.workspace = { allowDirty: false, extraKey: 1 }` is rejected (closed-set check).
  </behavior>
  <action>
    1. In every test file in `<files>`, replace each `"1.1.0"` literal with
    `"1.2.0"`. Verify by re-grepping after edits.

    2. In `packages/intent/src/confirmed-intent.test.ts`, add four new tests
    listed above under "behavior". Use the existing test-builder pattern from
    `internal/test-builders.ts` (now bumped) for the happy-path case; build
    rejection cases by directly passing malformed objects to the parser.

    3. Run `pnpm --filter @protostar/intent test` — expect all green.

    4. Spot-check Phase 2 dependent packages:
    ```bash
    pnpm --filter @protostar/authority --filter @protostar/admission-e2e test
    ```
    If any pin `"1.1.0"` and break, update those literals too — capture in
    SUMMARY which packages required edits.
  </action>
  <verify>
    <automated>pnpm --filter @protostar/intent test &amp;&amp; pnpm --filter @protostar/authority test &amp;&amp; pnpm --filter @protostar/admission-e2e test</automated>
  </verify>
  <done>All `1.1.0` → `1.2.0` literal replacements done in test files. Four new `allowDirty` tests pass. Authority + admission-e2e suites green.</done>
</task>

<task type="auto">
  <name>Task 3: Audit + update factory-cli and admission-e2e and example fixtures</name>
  <files>apps/factory-cli/src/main.ts, apps/factory-cli/src/main.test.ts, examples/intents</files>
  <action>
    1. Final cascade audit:
    ```bash
    grep -rn '"1\.1\.0"' apps packages examples 2>/dev/null | grep -v 'dist/' | grep -v 'node_modules/'
    ```

    2. For each result, decide:
       - **Phase 1/2 schema-version pin** → bump to `"1.2.0"`
       - **Phase 1/2 historical evidence test** (asserts a *frozen* old artifact) → leave; document in SUMMARY
       - **Builder default** → bump
       - **Example fixture** → bump

    3. For `examples/intents/*.json` if present: each example's `schemaVersion`
    field bumps to `"1.2.0"`. Also add `capabilityEnvelope.workspace: { allowDirty: false }`
    to each example for explicitness (default-fill works, but explicit examples
    document the new field for operators).

    4. Run full suite to confirm nothing regressed:
    ```bash
    pnpm run verify:full
    ```

    Expect green. If anything fails, the failure either (a) pins a literal not
    yet caught — bump it, or (b) is an unrelated pre-existing failure (Plans
    02-11..02-15 are still pending) — document and proceed; do NOT fix unrelated
    regressions in this plan.
  </action>
  <verify>
    <automated>! grep -rn '"1\.1\.0"' apps packages examples 2&gt;/dev/null | grep -v 'dist/' | grep -v 'node_modules/' | grep -v '\.planning/' | grep -v 'historical' &amp;&amp; pnpm run verify:full</automated>
  </verify>
  <done>No source file outside `dist/`, `node_modules/`, `.planning/`, or explicitly-historical evidence comments contains the literal `"1.1.0"`. `pnpm run verify:full` green (modulo pre-existing Phase 2 Plans 11-15 gaps, which must be documented in SUMMARY if encountered).</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Confirmed-intent file → parser | Parser receives JSON; structural validation produces or refuses brand |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-03-03-01 | Tampering | Schema-bump silent acceptance of old version | mitigate | Hard-cut: parser rejects `"1.1.0"` (mirroring Phase 2 02-03 precedent). Operator must regenerate intents under 1.2.0 — no silent upconvert. |
| T-03-03-02 | Elevation of Privilege | `allowDirty: true` injected into intent | mitigate | Default `false`; capability requires explicit operator action via `--confirmed-intent` (Phase 2 Q-11 two-key launch). Phase 3 Wave 1 dirty-worktree refusal is the consumer; this plan only ships the wire. |
| T-03-03-03 | Tampering | Closed-set check missing on `workspace` sub-object | mitigate | `rejectUnknownKeys` pattern (Phase 2 `repo-policy/parse.ts:138-149` analog) enforced; tests added in Task 2. |
</threat_model>

<validation_strategy>
- **Coverage:** REPO-06 wire (consumed in Plan 09 dirty-worktree).
- **Sample frequency:** Per-task `pnpm --filter @protostar/intent test`; Task 3 runs `verify:full`.
- **Observability:** New `allowDirty` tests exercise default-fill, happy path, type-error, closed-set. Phase 2 contract tests catch literal-version regressions.
- **Nyquist:** Three tasks; per-task verify is unit-test fast (~5s).
</validation_strategy>

<verification>
- `grep -c '"1.2.0"' packages/intent/schema/confirmed-intent.schema.json` ≥ 1
- `grep -c "allowDirty" packages/intent/src/capability-envelope.ts` ≥ 2 (interface + parser)
- `pnpm --filter @protostar/intent test` green
- `pnpm --filter @protostar/admission-e2e test` green
- No `"1.1.0"` literals in source tree (excl. `dist/`, `node_modules/`, `.planning/`, historical-evidence comments)
</verification>

<success_criteria>
- Schema file pins `1.2.0`
- `CapabilityEnvelopeWorkspace.allowDirty` exists with default `false`
- All `"1.1.0"` source literals updated; cascade audit clean
- Phase 1/2 test suites pass under bumped schema
- Examples (if present) updated to `1.2.0` with explicit `workspace` block
</success_criteria>

<output>
After completion, create `.planning/phases/03-repo-runtime-sandbox/03-03-SUMMARY.md` listing: (a) every file edited in the cascade, (b) cascade-audit result (final grep output), (c) any pre-existing failures encountered & deferred to Plans 02-11..02-15.
</output>
