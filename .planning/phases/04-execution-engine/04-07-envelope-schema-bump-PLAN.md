---
phase: 04-execution-engine
plan: 07
type: execute
wave: 2
depends_on: [02]
files_modified:
  - packages/intent/schema/confirmed-intent.schema.json
  - packages/intent/src/index.ts
  - packages/intent/src/capability-envelope.ts
  - packages/intent/src/capability-envelope.test.ts
  - packages/admission-e2e/src/signed-intent-1-3-0.test.ts
  - examples/intents/**/*.json
  - examples/planning-results/**/*.json
autonomous: true
requirements: [EXEC-06, EXEC-07]
must_haves:
  truths:
    - "confirmed-intent.schema.json schemaVersion const is exactly `\"1.3.0\"`"
    - "capabilityEnvelope.budget.adapterRetriesPerTask is required (number, default 4)"
    - "capabilityEnvelope.budget.taskWallClockMs is required (number, default 180000)"
    - "capabilityEnvelope.network.allow is required (enum: none|loopback|allowlist)"
    - "capabilityEnvelope.network.allowedHosts is required IFF network.allow === 'allowlist' (if/then schema)"
    - "All signed-intent fixtures regenerated with valid 1.3.0 envelopes; no envelope-hash mismatch in any package"
    - "`pnpm run verify` passes across all packages after the bump (Pitfall 7 closed)"
  artifacts:
    - path: packages/intent/schema/confirmed-intent.schema.json
      provides: "1.3.0 schema with budget + network additions"
      contains: '"const": "1.3.0"'
    - path: packages/intent/src/capability-envelope.ts
      provides: "Typed CapabilityEnvelope reflecting 1.3.0 fields"
  key_links:
    - from: "packages/intent/schema/confirmed-intent.schema.json"
      to: "every package that signs/verifies ConfirmedIntent"
      via: "schemaVersion bump cascade"
      pattern: '"schemaVersion".*"1\\.3\\.0"'
---

<objective>
Bump the ConfirmedIntent schema from 1.2.0 → 1.3.0, adding the four fields locked in CONTEXT Q-14/Q-15/Q-18: `budget.adapterRetriesPerTask`, `budget.taskWallClockMs`, `network.allow`, `network.allowedHosts?`. Regenerate every signed-intent fixture across the repo. Honor RESEARCH Pitfall 7: NO compat shim, NO union schemas, full re-canonicalization sweep.

Per advisor: this plan does the schema work; Plan 02 already typed the fields in TS so Wave 1 didn't block on it. Wave 2's other plans depend on this schema landing first because their tests use signed intents.

Purpose: Capability envelope carries the new budget+network knobs at the schema level; signature flow re-canonicalizes against the new layout.
Output: Bumped schema + regenerated fixtures + green `pnpm run verify`.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/04-execution-engine/04-CONTEXT.md
@.planning/phases/04-execution-engine/04-RESEARCH.md
@.planning/phases/04-execution-engine/04-PATTERNS.md
@packages/intent/schema/confirmed-intent.schema.json
@packages/intent/src/index.ts

<interfaces>
Current schema (Phase 3 left it at 1.2.0 with `workspace.allowDirty: false`).

1.3.0 additions per Q-14, Q-15, Q-18:

```json
{
  "schemaVersion": { "const": "1.3.0" },
  "capabilityEnvelope": {
    "type": "object",
    "additionalProperties": false,
    "required": ["workspace", "network", "budget", "toolPermissions"],
    "properties": {
      "workspace": { ... },                          // unchanged from 1.2.0
      "toolPermissions": { ... },                     // unchanged
      "network": {
        "type": "object",
        "additionalProperties": false,
        "required": ["allow"],
        "properties": {
          "allow": { "enum": ["none", "loopback", "allowlist"] },
          "allowedHosts": { "type": "array", "items": { "type": "string", "format": "hostname" }, "minItems": 1 }
        },
        "if":   { "properties": { "allow": { "const": "allowlist" } } },
        "then": { "required": ["allowedHosts"] }
      },
      "budget": {
        "type": "object",
        "additionalProperties": false,
        "required": ["adapterRetriesPerTask", "taskWallClockMs", "maxRepairLoops"],
        "properties": {
          "adapterRetriesPerTask": { "type": "integer", "minimum": 1, "maximum": 10 },
          "taskWallClockMs":       { "type": "integer", "minimum": 1000, "maximum": 1800000 },
          "maxRepairLoops":        { "type": "integer", "minimum": 0, "maximum": 10 }
        }
      }
    }
  }
}
```

TypeScript mirror in `packages/intent/src/capability-envelope.ts`:

```typescript
export interface CapabilityEnvelope {
  readonly workspace: { readonly trust: "trusted" | "untrusted"; readonly allowDirty: boolean; ... };
  readonly toolPermissions: { readonly network: "allow" | "deny"; readonly subprocess: "allow" | "deny"; ... };
  readonly network: { readonly allow: "none" | "loopback" | "allowlist"; readonly allowedHosts?: readonly string[] };
  readonly budget: { readonly adapterRetriesPerTask: number; readonly taskWallClockMs: number; readonly maxRepairLoops: number };
}
```

Defaults for v0.1 cosmetic-tweak: `network.allow: "loopback"`, `budget.adapterRetriesPerTask: 4`, `budget.taskWallClockMs: 180000`, `budget.maxRepairLoops: 0`.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Bump schema + TS types + envelope tests</name>
  <files>packages/intent/schema/confirmed-intent.schema.json, packages/intent/src/capability-envelope.ts, packages/intent/src/capability-envelope.test.ts, packages/intent/src/index.ts</files>
  <read_first>
    - packages/intent/schema/confirmed-intent.schema.json (current 1.2.0)
    - packages/intent/src/index.ts (current type exports)
    - .planning/phases/04-execution-engine/04-CONTEXT.md §Q-14, §Q-15, §Q-18
    - .planning/phases/04-execution-engine/04-RESEARCH.md §"Pitfall 7: Schema bump cascades"
  </read_first>
  <behavior>
    - Test 1: Schema's `schemaVersion` is exactly `"1.3.0"` (no widened union).
    - Test 2: A valid 1.3.0 envelope with `network.allow:"loopback"` (no `allowedHosts`) parses successfully.
    - Test 3: An envelope with `network.allow:"allowlist"` and missing `allowedHosts` fails validation.
    - Test 4: An envelope with `network.allow:"allowlist", allowedHosts:["api.github.com"]` parses successfully.
    - Test 5: Missing `budget.adapterRetriesPerTask` fails validation.
    - Test 6: `budget.taskWallClockMs: 0` fails (minimum 1000).
    - Test 7: TypeScript `CapabilityEnvelope` matches the JSON schema's shape (assignability test).
  </behavior>
  <action>
    1. Edit `packages/intent/schema/confirmed-intent.schema.json`:
       - `schemaVersion.const`: `"1.2.0"` → `"1.3.0"`.
       - Replace opaque `capabilityEnvelope: { type: "object" }` (or current 1.2.0 structure) with the structure in `<interfaces>` — explicit `additionalProperties: false`, full `required[]`, and the `if/then` for allowlist. KEEP existing `workspace.allowDirty` field from 1.2.0 (Phase 3 added it).
    2. Edit `packages/intent/src/capability-envelope.ts` (create if absent) to mirror the schema verbatim. Re-export from `packages/intent/src/index.ts`.
    3. If a hand-written validator exists (search `parseConfirmedIntent` / `validateCapabilityEnvelope`), update it to enforce the new fields. Pattern: same as Phase 2/3 hand-validators. NO Ajv dependency.
    4. Tests in `capability-envelope.test.ts`: run all 7 behaviors. For Test 7, use `expectAssignable<CapabilityEnvelope>({...full object...})`-style assertion via TS satisfies operator.
    5. Bump any `expectedSchemaVersion` constants (search: `grep -rn '"1.2.0"' packages/`).
  </action>
  <verify>
    <automated>cd /Users/zakkeown/Code/protostar && pnpm --filter @protostar/intent test 2>&1 | tail -20 && grep -c '"const": "1.3.0"' packages/intent/schema/confirmed-intent.schema.json && ! grep -rn '"1.2.0"' packages/intent/ packages/authority/ packages/policy/ packages/factory-cli/ 2>/dev/null | grep -v dist | grep -v node_modules | grep -v test-fixtures</automated>
  </verify>
  <acceptance_criteria>
    - Schema file contains `"const": "1.3.0"` exactly once
    - `network.allow` enum includes all three literals
    - `if/then` on allowlist requires allowedHosts
    - `pnpm --filter @protostar/intent test` green
    - No remaining `"1.2.0"` in non-dist source under `packages/intent/`
  </acceptance_criteria>
  <done>Schema bumped; TS types match; intent package green.</done>
</task>

<task type="auto">
  <name>Task 2: Regenerate signed-intent fixtures + repo-wide verify sweep</name>
  <files>examples/intents/**/*.json, examples/planning-results/**/*.json, packages/admission-e2e/src/signed-intent-1-3-0.test.ts, packages/factory-cli/test-fixtures/*.json (if present)</files>
  <read_first>
    - .planning/phases/04-execution-engine/04-RESEARCH.md §"Pitfall 7"
    - packages/authority/src — find signature/canonicalization helpers
    - examples/intents/ (all current fixtures)
    - packages/admission-e2e/src (existing tests)
  </read_first>
  <behavior>
    - Test 1: Every fixture under `examples/intents/` parses against the 1.3.0 schema.
    - Test 2: Each signed-intent fixture's envelope hash recomputes correctly (re-canonicalized against 1.3.0).
    - Test 3 (new): Round-trip test in `admission-e2e/src/signed-intent-1-3-0.test.ts` builds a ConfirmedIntent with the four new fields, signs it, verifies it.
    - Test 4: `pnpm run verify` (all packages) passes — no envelope-hash mismatch anywhere.
  </behavior>
  <action>
    1. Find every fixture that contains `"schemaVersion": "1.2.0"` and a capability envelope. Run:
       ```bash
       grep -rln '"schemaVersion": "1.2.0"' examples/ packages/*/test-fixtures/ packages/*/src/__fixtures__/ 2>/dev/null
       ```
    2. For each fixture:
       - Update `schemaVersion` to `"1.3.0"`.
       - Add the four new fields with v0.1 defaults: `network.allow:"loopback"`, `budget.adapterRetriesPerTask:4`, `budget.taskWallClockMs:180000`, `budget.maxRepairLoops:0` (or whatever value the existing fixture used for maxRepairLoops; preserve it).
       - If the fixture is a SIGNED intent, recompute the envelope hash + signature using the helpers in `packages/authority/src/...signature*`. Either:
         a. Run a small one-off script committed under `scripts/regenerate-signed-fixtures.ts` (preferred, repeatable).
         b. Hand-edit the hash if the helper is non-trivial to script.
       Preference: (a) — script lives alongside the bump for future schema versions.
    3. Add `packages/admission-e2e/src/signed-intent-1-3-0.test.ts`: build → sign → verify → assert all four new fields readable from the verified envelope.
    4. Run `pnpm run verify` from repo root. Fix any cascading failures (most likely: `policy`, `planning`, `execution`, `review`, `factory-cli`, `admission-e2e` tests asserting envelope contents).
  </action>
  <verify>
    <automated>cd /Users/zakkeown/Code/protostar && pnpm run verify 2>&1 | tail -30 && ! grep -rln '"schemaVersion": "1.2.0"' examples/ packages/*/test-fixtures/ packages/*/src/ 2>/dev/null | grep -v dist | grep -v node_modules</automated>
  </verify>
  <acceptance_criteria>
    - `pnpm run verify` exits 0
    - No `"1.2.0"` literal remains in non-dist source/fixtures
    - New `signed-intent-1-3-0.test.ts` exists and passes in `admission-e2e`
    - Regeneration script (if used) committed
  </acceptance_criteria>
  <done>Pitfall 7 closed; full repo verify green on 1.3.0.</done>
</task>

</tasks>

<threat_model>
| Threat ID | Category | Component | Disposition | Mitigation |
|-----------|----------|-----------|-------------|------------|
| T-04-19 | Tampering | Schema widened to accept 1.2.0 OR 1.3.0 (silent compat) | mitigate | `const` (not enum/oneOf) — schema rejects 1.2.0 outright. Test 1 pins this |
| T-04-20 | Repudiation | Envelope-hash mismatch silently ignored | mitigate | `pnpm run verify` exercises signature verification across all packages; mismatch fails the gate |
| T-04-21 | Tampering | `network.allow:"allowlist"` with empty `allowedHosts` | mitigate | Schema `minItems: 1` + `if/then` requires the field; Test 3 pins it |
</threat_model>

<verification>
- `pnpm run verify` green
- `grep -rn '"1.2.0"' packages/ examples/` returns only intentional historical references (or zero)
- `signed-intent-1-3-0.test.ts` passes; envelope round-trip through canonicalize→sign→verify
</verification>

<success_criteria>
- 1.3.0 schema is the only valid version
- Envelope shape matches the four CONTEXT Q-14/Q-15/Q-18 additions
- Full repo verify green; no compat shim
</success_criteria>

<output>
Create `.planning/phases/04-execution-engine/04-07-SUMMARY.md`: schema diff, default values for v0.1, list of fixture files regenerated, regeneration-script location.
</output>
