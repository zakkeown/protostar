---
phase: 07-delivery
plan: 01
type: execute
wave: 0
depends_on: []
files_modified:
  - packages/intent/schema/confirmed-intent.schema.json
  - packages/intent/src/promote-intent-draft.ts
  - packages/intent/src/confirmed-intent.ts
  - packages/intent/src/confirmed-intent.test.ts
  - packages/intent/src/confirmed-intent-immutability.test.ts
  - packages/intent/src/capability-envelope.test.ts
  - packages/intent/src/public-split-exports.contract.test.ts
  - packages/intent/src/acceptance-criteria-normalization.test.ts
  - packages/intent/src/internal/test-builders.ts
  - packages/admission-e2e/src/signed-intent-1-4-0.test.ts
  - packages/admission-e2e/src/authority-governance-kernel.e2e.test.ts
  - packages/authority/src/signature/sign-verify.test.ts
  - packages/authority/src/stage-reader/factory.ts
  - packages/authority/src/stage-reader/factory.test.ts
  - packages/lmstudio-adapter/internal/test-fixtures/cosmetic-tweak-fixture.ts
  - examples/intents/scaffold.json
  - examples/intents/bad/missing-capability.json
  - apps/factory-cli/src/run-real-execution.test.ts
autonomous: true
requirements: [DELIVER-01, DELIVER-02]
must_haves:
  truths:
    - "confirmedIntent schema reports const schemaVersion 1.5.0"
    - "envelope supports capabilityEnvelope.delivery.target { owner, repo, baseBranch }"
    - "envelope supports capabilityEnvelope.budget.deliveryWallClockMs (default 600000, min 30000, max 3600000)"
    - "Both signed example intent fixtures verify against the bumped schema after re-signing"
    - "All 19 1.4.0 references in source/tests/fixtures bump to 1.5.0"
  artifacts:
    - path: packages/intent/schema/confirmed-intent.schema.json
      contains: '"const": "1.5.0"'
    - path: packages/intent/schema/confirmed-intent.schema.json
      contains: '"deliveryWallClockMs"'
    - path: packages/intent/schema/confirmed-intent.schema.json
      contains: '"delivery"'
    - path: examples/intents/scaffold.json
      contains: '"schemaVersion": "1.5.0"'
    - path: examples/intents/bad/missing-capability.json
      contains: '"schemaVersion": "1.5.0"'
    - path: packages/admission-e2e/src/signed-intent-1-5-0.test.ts
      provides: "Renamed signed-intent contract test for the bumped envelope"
  key_links:
    - from: packages/intent/schema/confirmed-intent.schema.json
      to: examples/intents/scaffold.json
      via: "Re-signing via Phase 2 c14n + signature pipeline"
      pattern: '"canonicalForm": "json-c14n@1.0"'
---

<objective>
Hard-bump `confirmedIntent` schema from 1.4.0 to 1.5.0, adding `capabilityEnvelope.delivery.target` (Q-05) and `capabilityEnvelope.budget.deliveryWallClockMs` (Q-14). Cascade the literal `"1.4.0"` references repo-wide (19 files identified by RESEARCH §"Schema-cascade audit") and re-sign the two signed example fixtures via the Phase 2 c14n pipeline. This plan is the foundation for every downstream plan in Phase 7 — without it, brand-mint, preflight, and runtime tasks cannot validate envelopes.

Purpose: tamper-evident delivery target + delivery wall-clock budget land in one coordinated migration (Phase 4 Pitfall 7 pattern, Q-05/Q-14 locks).
Output: Bumped schema, re-signed fixtures, all source references updated, all package tests still green.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/07-delivery/07-CONTEXT.md
@.planning/phases/07-delivery/07-RESEARCH.md
@.planning/phases/07-delivery/07-PATTERNS.md
@packages/intent/schema/confirmed-intent.schema.json
@packages/authority/src/signature/canonicalize.ts
@examples/intents/scaffold.json
@examples/intents/bad/missing-capability.json

<interfaces>
<!-- Schema bump pattern (incumbent Phase 5-03 + Phase 4-07 + Phase 3-03). -->
<!-- The schema literal `1.4.0` is bumped to `1.5.0`; capabilityEnvelope gains two siblings. -->

confirmed-intent.schema.json (current shape, line 21):
```json
"schemaVersion": { "const": "1.4.0" }
```

Add to capabilityEnvelope.budget.properties (after existing budget fields, alongside `taskWallClockMs`):
```json
"deliveryWallClockMs": {
  "type": "integer",
  "minimum": 30000,
  "maximum": 3600000,
  "default": 600000
}
```

Add new sibling under capabilityEnvelope.properties (after executeGrants):
```json
"delivery": {
  "type": "object",
  "additionalProperties": false,
  "required": ["target"],
  "properties": {
    "target": {
      "type": "object",
      "additionalProperties": false,
      "required": ["owner", "repo", "baseBranch"],
      "properties": {
        "owner": { "type": "string", "pattern": "^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,38}[a-zA-Z0-9])?$" },
        "repo":  { "type": "string", "pattern": "^[a-zA-Z0-9._-]{1,100}$" },
        "baseBranch": { "type": "string", "pattern": "^[a-zA-Z0-9._/-]+$", "maxLength": 244 }
      }
    }
  }
}
```

Re-signing flow (Phase 2 incumbent):
- canonicalize(intent) → policy snapshot hash → buildSignatureEnvelope → sign-verify pipeline
- See `packages/authority/src/signature/canonicalize.ts` and `sign-verify.test.ts` for the c14n@1.0 helpers.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Bump schema constant + add delivery.target and budget.deliveryWallClockMs</name>
  <read_first>
    - packages/intent/schema/confirmed-intent.schema.json (the file being edited; current "const": "1.4.0" at line 21)
    - .planning/phases/07-delivery/07-PATTERNS.md §"packages/intent/schema/confirmed-intent.schema.json (schema bump)" — exact JSON snippets to insert
    - .planning/phases/07-delivery/07-CONTEXT.md Q-05, Q-14 — verbatim schema text
  </read_first>
  <files>packages/intent/schema/confirmed-intent.schema.json</files>
  <action>
    1. Change `"schemaVersion": { "const": "1.4.0" }` (line 21) to `"const": "1.5.0"`.
    2. Inside `capabilityEnvelope.properties.budget.properties`, add the `deliveryWallClockMs` integer field with `minimum: 30000`, `maximum: 3600000`, `default: 600000` per Q-14 verbatim.
    3. Inside `capabilityEnvelope.properties` (sibling of `executeGrants`, `network`, `budget`), add the `delivery` object with `additionalProperties: false`, `required: ["target"]`, and the nested `target` object as specified verbatim in 07-CONTEXT.md Q-05 (owner/repo/baseBranch with their patterns + maxLength: 244 on baseBranch).
    4. Do NOT add `delivery` to the top-level `required` array — delivery is optional at the envelope level (only required if any plan invokes Phase 7 delivery; admission keeps existing intents valid).
    5. Verify the schema parses by running the intent package's existing schema-parity tests after the cascade lands (Task 3 verifies).
  </action>
  <verify>
    <automated>node -e "const s=require('./packages/intent/schema/confirmed-intent.schema.json'); if(s.properties.schemaVersion.const !== '1.5.0') throw new Error('schemaVersion not 1.5.0'); if(!s.properties.capabilityEnvelope.properties.delivery) throw new Error('delivery missing'); if(!s.properties.capabilityEnvelope.properties.budget.properties.deliveryWallClockMs) throw new Error('deliveryWallClockMs missing'); console.log('ok');"</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c '"const": "1.5.0"' packages/intent/schema/confirmed-intent.schema.json` ≥ 1
    - `grep -c '"deliveryWallClockMs"' packages/intent/schema/confirmed-intent.schema.json` ≥ 1
    - `grep -c '"delivery"' packages/intent/schema/confirmed-intent.schema.json` ≥ 1
    - `grep -c '"baseBranch"' packages/intent/schema/confirmed-intent.schema.json` ≥ 1
    - JSON parses without error (node -e check passes).
  </acceptance_criteria>
  <done>Schema file at 1.5.0; delivery target and deliveryWallClockMs additions present; JSON valid.</done>
</task>

<task type="auto">
  <name>Task 2: Cascade `"1.4.0"` literal across 17 source/test files (excluding signed fixtures)</name>
  <read_first>
    - .planning/phases/07-delivery/07-RESEARCH.md §"Schema-cascade audit (1.4.0 → 1.5.0)" — exhaustive 19-file list (Task 3 handles the 2 signed JSON fixtures separately)
    - packages/intent/src/promote-intent-draft.ts (sets schemaVersion in intent build)
    - packages/intent/src/confirmed-intent.ts (validates schemaVersion error message)
    - packages/admission-e2e/src/signed-intent-1-4-0.test.ts (rename target)
  </read_first>
  <files>packages/intent/src/promote-intent-draft.ts, packages/intent/src/confirmed-intent.ts, packages/intent/src/confirmed-intent.test.ts, packages/intent/src/confirmed-intent-immutability.test.ts, packages/intent/src/capability-envelope.test.ts, packages/intent/src/public-split-exports.contract.test.ts, packages/intent/src/acceptance-criteria-normalization.test.ts, packages/intent/src/internal/test-builders.ts, packages/admission-e2e/src/authority-governance-kernel.e2e.test.ts, packages/authority/src/signature/sign-verify.test.ts, packages/authority/src/stage-reader/factory.ts, packages/authority/src/stage-reader/factory.test.ts, packages/lmstudio-adapter/internal/test-fixtures/cosmetic-tweak-fixture.ts, apps/factory-cli/src/run-real-execution.test.ts</files>
  <action>
    1. For each file in `<files>`, replace every occurrence of the literal string `"1.4.0"` with `"1.5.0"`. Use the file editor tool per file (do NOT shell sed; we want each diff inspected).
    2. In `packages/intent/src/confirmed-intent.ts`, also bump the error-message string `'schemaVersion must be "1.4.0" when provided.'` → `'schemaVersion must be "1.5.0" when provided.'`.
    3. Comments referencing "Phase 3 Plan 03 hard-bumps confirmed-intent artifacts to schemaVersion 1.4.0" should be updated to also mention "Phase 7 Plan 01 bumps to 1.5.0 (delivery.target + deliveryWallClockMs)".
    4. Rename `packages/admission-e2e/src/signed-intent-1-4-0.test.ts` → `packages/admission-e2e/src/signed-intent-1-5-0.test.ts` via `git mv` (preserves history). Update describe block + assertions inside (test text + `assert.equal(signed.intent.schemaVersion, "1.5.0")`).
    5. Inside the renamed test, extend coverage: add an assertion that `intent.capabilityEnvelope.delivery.target.owner === <owner>` after parsing; add an assertion that `intent.capabilityEnvelope.budget.deliveryWallClockMs` defaults to `600000` when omitted.
    6. Do NOT touch `examples/intents/*.json` here — those are signed and re-signed in Task 3.
    7. After all edits: `grep -rln '"1\.4\.0"' packages/ apps/` (excluding `node_modules`, `dist`, `.protostar/`, signed JSON fixtures) MUST return zero matches.
  </action>
  <verify>
    <automated>cd /Users/zakkeown/Code/protostar && (grep -rln '"1\.4\.0"' packages/ apps/ --exclude-dir=node_modules --exclude-dir=dist --exclude="*.json" 2>/dev/null | grep -v "^$" || true) | wc -l | awk '{ if ($1 != 0) { print "FAIL: " $1 " files still reference 1.4.0"; exit 1 } else { print "ok: zero 1.4.0 refs in source/tests" } }'</automated>
  </verify>
  <acceptance_criteria>
    - `grep -rln '"1\.4\.0"' packages/ apps/ --exclude-dir=node_modules --exclude-dir=dist --exclude="*.json"` returns zero lines.
    - File `packages/admission-e2e/src/signed-intent-1-4-0.test.ts` does NOT exist.
    - File `packages/admission-e2e/src/signed-intent-1-5-0.test.ts` exists and references `"1.5.0"`.
    - `pnpm --filter @protostar/intent build` succeeds.
  </acceptance_criteria>
  <done>All 17 non-fixture files reference 1.5.0; signed-intent test renamed; build green.</done>
</task>

<task type="auto">
  <name>Task 3: Re-sign `examples/intents/scaffold.json` and `examples/intents/bad/missing-capability.json` for 1.5.0</name>
  <read_first>
    - examples/intents/scaffold.json (current signed envelope at 1.4.0; preserves shape, only schemaVersion + signature change)
    - examples/intents/bad/missing-capability.json (the negative-fixture signed intent)
    - packages/authority/src/signature/canonicalize.ts (json-c14n@1.0 implementation)
    - packages/authority/src/signature/sign-verify.test.ts (test pattern that builds and verifies signed envelopes)
    - .planning/phases/07-delivery/07-PATTERNS.md §"Schema cascade" — re-signing path
  </read_first>
  <files>examples/intents/scaffold.json, examples/intents/bad/missing-capability.json</files>
  <action>
    1. For each fixture, parse the JSON. Bump `schemaVersion` from `"1.4.0"` to `"1.5.0"`. Add `capabilityEnvelope.delivery: { target: { owner: "protostar-test", repo: "fixture-toy", baseBranch: "main" } }` so that the bumped schema validates. Add `capabilityEnvelope.budget.deliveryWallClockMs: 600000`.
    2. Re-sign each envelope using the Phase 2 c14n + signature pipeline. Reuse the test-helper builder if needed (e.g., `buildSignatureEnvelope` from `packages/authority/src/signature/`); do not hand-craft the signature/hash. The signature MUST be regenerated — the canonical form changes when `schemaVersion`, `delivery`, and `budget.deliveryWallClockMs` change.
    3. Confirm the signed envelope verifies via `verifyConfirmedIntentSignature` (the central helper used by stage-reader + admission). Write a short Node script in the task or run an existing test (e.g., `pnpm --filter @protostar/admission-e2e test`) to verify both fixtures round-trip.
    4. The `bad/missing-capability.json` fixture is intentionally a refusal case — preserve its negative-intent property (it should still fail admission for the *capability-missing* reason, not for *schema-version-mismatch*). If adding `delivery` causes the fixture to suddenly pass admission, tweak which capability is missing while keeping the file's role intact.
    5. NEVER store a real GitHub PAT in any fixture. The `target` triple uses `protostar-test/fixture-toy/main` (synthetic, never reachable). This is a fixture, not a live test.
  </action>
  <verify>
    <automated>pnpm --filter @protostar/intent test && pnpm --filter @protostar/authority test && pnpm --filter @protostar/admission-e2e test</automated>
  </verify>
  <acceptance_criteria>
    - `grep '"schemaVersion"' examples/intents/scaffold.json` shows `"1.5.0"`.
    - `grep '"schemaVersion"' examples/intents/bad/missing-capability.json` shows `"1.5.0"`.
    - `grep -c '"delivery"' examples/intents/scaffold.json` ≥ 1.
    - `pnpm --filter @protostar/admission-e2e test` passes (signed-intent-1-5-0 + missing-capability cases included).
    - Both fixtures verify via `verifyConfirmedIntentSignature` (admission-e2e tests cover this).
  </acceptance_criteria>
  <done>Both signed fixtures bump to 1.5.0, re-signed via c14n@1.0, admission-e2e green.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| operator → fixture | Fixtures are author-controlled but consumed by admission as if from the operator; bad shape = admission refusal. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-07-01-01 | Tampering | confirmed-intent.schema.json | mitigate | Schema validation rejects unknown shape; const schemaVersion blocks downgrade; `additionalProperties: false` on `delivery` rejects extra fields. |
| T-07-01-02 | Tampering | examples/intents/scaffold.json | mitigate | Re-signed via c14n@1.0; `verifyConfirmedIntentSignature` detects any post-sign mutation. |
| T-07-01-03 | Information Disclosure | examples/intents/*.json | accept | Fixtures use synthetic `protostar-test/fixture-toy` target; never references a real PAT. |
</threat_model>

<verification>
- `pnpm --filter @protostar/intent test`
- `pnpm --filter @protostar/authority test`
- `pnpm --filter @protostar/admission-e2e test`
- Repo-wide `grep '"1\.4\.0"' packages/ apps/` returns zero (excluding node_modules/dist/.protostar).
</verification>

<success_criteria>
- Schema constant is 1.5.0; `delivery.target` and `budget.deliveryWallClockMs` additions present.
- Both signed example fixtures verify against the bumped schema.
- All 19 1.4.0 references migrated; signed-intent-1-4-0 test renamed to 1.5.0.
- `pnpm run verify` green at the wave-0 boundary (downstream waves layer on this).
</success_criteria>

<output>
After completion, create `.planning/phases/07-delivery/07-01-SUMMARY.md` documenting:
- Exact list of files modified
- The two signed fixtures' new signatures (or which test verifies them)
- Any compatibility notes for downstream plans (especially that Phase 7 delivery now requires `delivery.target` to be in the envelope before delivery preflight)
</output>
