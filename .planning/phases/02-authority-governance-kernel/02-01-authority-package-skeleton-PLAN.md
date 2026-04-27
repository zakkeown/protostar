---
phase: 02-authority-governance-kernel
plan: 01
type: execute
wave: 0
depends_on: []
files_modified:
  - pnpm-workspace.yaml
  - tsconfig.json
  - package.json
  - packages/authority/package.json
  - packages/authority/tsconfig.json
  - packages/authority/src/index.ts
  - packages/authority/src/internal/brand-witness.ts
  - packages/authority/src/internal/test-builders.ts
  - packages/authority/schema/repo-policy.schema.json
  - packages/authority/schema/admission-decision-base.schema.json
  - packages/authority/schema/precedence-decision.schema.json
  - packages/authority/schema/policy-snapshot.schema.json
  - packages/authority/schema/escalation-marker.schema.json
  - packages/authority/test/skeleton.test.ts
autonomous: true
requirements:
  - GOV-01
  - GOV-02
  - GOV-03
  - GOV-05
must_haves:
  truths:
    - "`@protostar/authority` workspace exists and `pnpm install && pnpm -r build` succeed"
    - "`pnpm --filter @protostar/authority test` runs (skeleton smoke test)"
    - "Authority boundary preserved: zero `node:fs` imports anywhere under `packages/authority/src/`"
    - "Schema files exist under `packages/authority/schema/` with `schemaVersion: \"1.0.0\"` and are exported via `package.json` subpaths"
  artifacts:
    - path: packages/authority/package.json
      provides: "Workspace package manifest with subpath exports mirroring @protostar/intent (`.`, `./internal/brand-witness`, `./internal/test-builders`, `./schema/*`)"
      contains: '"name": "@protostar/authority"'
    - path: packages/authority/src/index.ts
      provides: "Public barrel — empty in Wave 0, populated by Waves 1-2"
      min_lines: 1
    - path: packages/authority/schema/repo-policy.schema.json
      provides: "JSON Schema for `.protostar/repo-policy.json` (Q-03)"
      contains: '"$id"'
  key_links:
    - from: pnpm-workspace.yaml
      to: packages/authority
      via: "packages/* glob — registers the new workspace"
      pattern: "packages"
    - from: tsconfig.json
      to: packages/authority/tsconfig.json
      via: "project references"
      pattern: "authority"
---

<objective>
Wave 0 scaffold for Phase 2. Creates `packages/authority` workspace package (pure-logic governance kernel — NO `node:fs` imports), wires it into pnpm-workspace + root tsconfig project references, lays down the five schema files the kernel will own, and ships a skeleton `node:test` so `pnpm --filter @protostar/authority test` passes immediately.

Per Q-01 (decision lock): name is `@protostar/authority`, NOT `@protostar/governance`. Per Architectural Responsibility Map (RESEARCH.md): authority package is pure logic + types; all fs writes live in `apps/factory-cli`; runtime trust assertion lives in `packages/repo`.

Purpose: Every Wave 1+ task imports types from this package. Without the skeleton, no other plan can land. This is the Nyquist Wave 0 step — every later task's `<verify>` references `pnpm --filter @protostar/authority test` or related commands that need the package to exist.

Output: A buildable, testable, empty `@protostar/authority` workspace + its schema directory.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/02-authority-governance-kernel/02-CONTEXT.md
@.planning/phases/02-authority-governance-kernel/02-RESEARCH.md
@.planning/phases/02-authority-governance-kernel/02-VALIDATION.md
@.planning/phases/01-intent-planning-admission/01-04-schema-version-infra-PLAN.md
@AGENTS.md
@packages/intent/package.json
@packages/intent/tsconfig.json
@pnpm-workspace.yaml
@tsconfig.json

<interfaces>
<!-- Reuse pattern from packages/intent (Phase 1) — copy structure verbatim. -->

From packages/intent/package.json (template for packages/authority/package.json):
- "type": "module"
- "main": "./dist/index.js" / "types": "./dist/index.d.ts"
- exports: ".", "./internal/brand-witness", "./internal/test-builders", "./schema/*"
- scripts: build="tsc -b"; test="pnpm run build && node --test dist/*.test.js"; typecheck="tsc -b --pretty false"
- "files": ["dist", "schema"]
- "sideEffects": false

JSON Schema header pattern (from packages/intent/schema/clarification-report.schema.json):
- "$schema": "https://json-schema.org/draft/2020-12/schema"
- "$id": "https://protostar.local/schema/{name}.schema.json"
- "schemaVersion": { "const": "1.0.0" }   // const for in-package schemas; widen later only when needed
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Create @protostar/authority workspace skeleton</name>
  <files>
    packages/authority/package.json,
    packages/authority/tsconfig.json,
    packages/authority/src/index.ts,
    packages/authority/src/internal/brand-witness.ts,
    packages/authority/src/internal/test-builders.ts,
    packages/authority/test/skeleton.test.ts,
    pnpm-workspace.yaml,
    tsconfig.json,
    package.json
  </files>
  <read_first>
    - packages/intent/package.json (template — copy exports/scripts/files structure verbatim)
    - packages/intent/tsconfig.json (template — copy compilerOptions; references for any deps)
    - pnpm-workspace.yaml (verify packages/* glob already covers new workspace)
    - tsconfig.json (root — add project reference to packages/authority)
    - package.json (root — verify `verify`/`verify:full` scripts pick up new workspace via `pnpm -r`)
    - AGENTS.md §Package Boundaries (no node:fs in authority)
  </read_first>
  <behavior>
    - skeleton.test.ts runs and passes (sanity check that the package builds and tests execute)
    - `pnpm install` adds @protostar/authority to the workspace graph
    - `pnpm --filter @protostar/authority build` produces dist/index.js
    - `pnpm --filter @protostar/authority test` exits 0
    - `! grep -RIn 'node:fs\|from "fs"' packages/authority/src/` returns no matches (authority boundary)
  </behavior>
  <action>
Create `packages/authority/package.json` with name `@protostar/authority`, version `0.0.0`, private: true, type: module. Copy the entire `exports` block shape from `packages/intent/package.json`, replacing intent-specific subpaths with these slots (entries can be empty stubs — Wave 1+ fills them; the subpath EXPORTS must be present now so consumers can import them later):

  - `.` -> `./dist/index.js` / `./dist/index.d.ts`
  - `./internal/brand-witness` -> `./dist/internal/brand-witness.js`
  - `./internal/test-builders` -> `./dist/internal/test-builders.js`
  - `./schema/repo-policy.schema.json` -> `./schema/repo-policy.schema.json`
  - `./schema/admission-decision-base.schema.json` -> `./schema/admission-decision-base.schema.json`
  - `./schema/precedence-decision.schema.json` -> `./schema/precedence-decision.schema.json`
  - `./schema/policy-snapshot.schema.json` -> `./schema/policy-snapshot.schema.json`
  - `./schema/escalation-marker.schema.json` -> `./schema/escalation-marker.schema.json`

scripts: `build`/`test`/`typecheck` exactly as in `packages/intent/package.json`. `files: ["dist", "schema"]`. `sideEffects: false`. No dependencies in Wave 0 (Wave 1 will add `@protostar/intent` workspace dep).

Create `packages/authority/tsconfig.json` extending the root `tsconfig.base.json` (mirror `packages/intent/tsconfig.json`). `composite: true`, `outDir: "./dist"`, `rootDir: "./src"`, `include: ["src/**/*"]`. NO references in Wave 0; Waves 1-2 will add `references: [{path: "../intent"}, {path: "../repo"}]` as imports land.

Create `packages/authority/src/index.ts` with a single placeholder line: `export const __authorityPackageReady = true;` (valid TS module; barrel will be repopulated by Wave 1).

Create `packages/authority/src/internal/brand-witness.ts` and `packages/authority/src/internal/test-builders.ts` as empty placeholder modules (single `export {};` each so subpath exports resolve at build time).

Create `packages/authority/test/skeleton.test.ts`:
```ts
import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { __authorityPackageReady } from "../src/index.js";
describe("@protostar/authority skeleton", () => {
  it("package builds and tests run", () => assert.equal(__authorityPackageReady, true));
});
```
Note: test file lives under `packages/authority/test/` but the test runner script `node --test dist/*.test.js` only sees compiled files at the dist root. To match the template (Phase 1), instead place the test at `packages/authority/src/skeleton.test.ts` so it lands at `dist/skeleton.test.ts` after build. Adjust path accordingly if mirroring `packages/intent`'s test layout.

Update `pnpm-workspace.yaml`: verify `packages/*` already includes the new path (no change needed if so; document via grep in acceptance).

Update root `tsconfig.json`: add `{ "path": "packages/authority" }` to the `references` array.

Update root `package.json`: confirm `verify` / `verify:full` scripts use `pnpm -r run test` (or equivalent) so the new package is picked up automatically; if they use an explicit allowlist, append `@protostar/authority`. (Phase 1 plan 01-01 established `verify:full` as recursive — confirm this still holds; if it does, no change needed.)

Run `pnpm install` (registers new workspace) and `pnpm --filter @protostar/authority test`.
  </action>
  <verify>
    <automated>pnpm install &amp;&amp; pnpm --filter @protostar/authority test &amp;&amp; pnpm run verify:full</automated>
  </verify>
  <acceptance_criteria>
    - File `packages/authority/package.json` exists and contains string `"@protostar/authority"`
    - File `packages/authority/src/index.ts` exists
    - `pnpm --filter @protostar/authority test` exits 0
    - `pnpm run verify:full` exits 0 (regression — Phase 1's 293/293 tests still pass)
    - `grep -RIn --include='*.ts' "from ['\"]node:fs['\"]\\|from ['\"]fs['\"]" packages/authority/src/ | grep -v '^#' | wc -l` outputs `0`
    - Root `tsconfig.json` contains the substring `"packages/authority"` in its references array
  </acceptance_criteria>
  <done>New workspace builds, tests pass, root verify:full green, authority boundary preserved (no fs imports).</done>
</task>

<task type="auto">
  <name>Task 2: Lay down the five authority-owned schema files</name>
  <files>
    packages/authority/schema/repo-policy.schema.json,
    packages/authority/schema/admission-decision-base.schema.json,
    packages/authority/schema/precedence-decision.schema.json,
    packages/authority/schema/policy-snapshot.schema.json,
    packages/authority/schema/escalation-marker.schema.json
  </files>
  <read_first>
    - packages/intent/schema/clarification-report.schema.json (header + schemaVersion pattern)
    - packages/intent/schema/confirmed-intent.schema.json (signature envelope shape — referenced by policy-snapshot)
    - .planning/phases/02-authority-governance-kernel/02-RESEARCH.md §"`.protostar/repo-policy.json` proposed schema" (lines ~504-531)
    - .planning/phases/02-authority-governance-kernel/02-RESEARCH.md §"Recommended Project Structure" §"Pattern 3" §"Signature payload"
    - .planning/phases/02-authority-governance-kernel/02-CONTEXT.md Q-03, Q-04, Q-12, Q-16
  </read_first>
  <action>
Create five JSON Schema files. Each uses:
- `"$schema": "https://json-schema.org/draft/2020-12/schema"`
- `"$id": "https://protostar.local/schema/{name}.schema.json"`
- `"additionalProperties": false`
- A `schemaVersion` property — `{ "const": "1.0.0" }` (these are NEW schemas, no widening needed)

**1. `repo-policy.schema.json`** (per RESEARCH.md proposed schema, Q-03):
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://protostar.local/schema/repo-policy.schema.json",
  "title": "RepoPolicy",
  "type": "object",
  "additionalProperties": false,
  "required": ["schemaVersion"],
  "properties": {
    "schemaVersion": { "const": "1.0.0" },
    "allowedScopes": { "type": "array", "items": { "type": "string" } },
    "deniedTools": { "type": "array", "items": { "type": "string" } },
    "budgetCaps": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "maxUsd": { "type": "number" },
        "maxTokens": { "type": "number" },
        "timeoutMs": { "type": "number" },
        "maxRepairLoops": { "type": "number" }
      }
    },
    "trustOverride": { "enum": ["trusted", "untrusted"] }
  }
}
```

**2. `admission-decision-base.schema.json`** (Q-13 hybrid base — shared header all per-gate decisions extend):
- required: `["schemaVersion", "runId", "gate", "outcome", "timestamp", "precedenceResolution"]`
- `schemaVersion`: const "1.0.0"
- `runId`: string, pattern `^run-[A-Za-z0-9_-]+$` (mirror Phase 1 runId pattern)
- `gate`: enum `["intent","planning","capability","repo-scope","workspace-trust"]`
- `outcome`: enum `["allow","block","escalate"]` (matches existing `ADMISSION_DECISION_OUTCOMES`; do NOT define a new literal)
- `timestamp`: string, format date-time
- `precedenceResolution`: nested object with `status: enum ["no-conflict","resolved","blocked-by-tier"]` (Q-04 nested summary)
- `evidence`: object, `additionalProperties: true` (per-gate extensions live in their owning package's schema and constrain this further)

**3. `precedence-decision.schema.json`** (separate detail file emitted iff status ≠ "no-conflict", Q-04):
- required: `["schemaVersion","status","resolvedEnvelope","tiers","blockedBy"]`
- `status`: enum `["no-conflict","resolved","blocked-by-tier"]`
- `resolvedEnvelope`: object, additionalProperties: true (typed in TS; loose JSON for forward compat)
- `tiers`: array of `{tier, envelope, source}`; `tier` enum `["confirmed-intent","policy","repo-policy","operator-settings"]`
- `blockedBy`: array of `{tier, axis, message}` (Q-02 — full set, may be non-unique)

**4. `policy-snapshot.schema.json`** (the snapshot the signature references, Q-16):
- required: `["schemaVersion","capturedAt","policy","resolvedEnvelope"]`
- `schemaVersion`: const "1.0.0"
- `capturedAt`: date-time
- `policy`: object — captures the policy state at admission (additionalProperties: true for now; tightened in Phase 8)
- `resolvedEnvelope`: object — post-precedence intersection envelope
- `repoPolicyHash`: string (sha256 hex, optional — only present when `.protostar/repo-policy.json` was loaded)

**5. `escalation-marker.schema.json`** (Q-12, A5 lock — filename `runs/{id}/escalation-marker.json`):
- required: `["schemaVersion","runId","gate","reason","createdAt"]`
- `schemaVersion`: const "1.0.0"
- `runId`: string
- `gate`: enum (same as base)
- `reason`: string (human-readable)
- `createdAt`: date-time
- `awaiting`: enum `["operator-confirm","operator-resume"]` (default "operator-confirm" — Phase 9 wires the resume flow)

All five files MUST be added to `packages/authority/package.json` `exports` (already done in Task 1). Do not import these schemas at runtime in Wave 0 — Wave 2 plans wire them into validators.
  </action>
  <verify>
    <automated>node -e "for (const f of ['repo-policy','admission-decision-base','precedence-decision','policy-snapshot','escalation-marker']) { const s = require(\`./packages/authority/schema/\${f}.schema.json\`); if (s.\$id !== \`https://protostar.local/schema/\${f}.schema.json\`) { console.error(f); process.exit(1); } } console.log('ok');"</automated>
  </acceptance_criteria>
    - All five schema files exist with valid JSON (parse without error)
    - Each contains `"$id": "https://protostar.local/schema/{name}.schema.json"`
    - Each has `"additionalProperties": false` at the top level
    - `admission-decision-base.schema.json` `outcome.enum` equals `["allow","block","escalate"]` exactly (verified by grep: `grep -A1 '"outcome"' packages/authority/schema/admission-decision-base.schema.json | grep -q 'allow.*block.*escalate'`)
    - `repo-policy.schema.json` lists exactly these top-level properties: `schemaVersion, allowedScopes, deniedTools, budgetCaps, trustOverride`
    - `escalation-marker.schema.json` filename matches A5 lock (`runs/{id}/escalation-marker.json`)
  </acceptance_criteria>
  <done>Five schema files committed, each parseable JSON Draft 2020-12, exports wired in package.json, ready for Wave 2 consumers.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Workspace install boundary | Adding a new workspace package must not break Phase 1's verify:full (regression risk) |
| Authority package boundary | Future code under `packages/authority/src/` MUST NOT import `node:fs` — enforced now by zero-dep skeleton + grep regression in Plan 10 |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-2-3 | Tampering / Information Disclosure | `.protostar/repo-policy.json` schema (default-DENY when absent — A3 lock) | mitigate | Schema requires `schemaVersion`; Wave 2 parser treats absence as default-DENY (planning_context A3 override of research's default-permissive recommendation). This plan only ships the schema; behavior locked in Plan 04. |
| T-2-6 | Tampering | Stage reader accepts wrong-schema artifact | mitigate | All 5 schemas use `additionalProperties: false`; Wave 4 reader validates `schemaVersion` at read site (Plan 09). |
</threat_model>

<verification>
- `pnpm install && pnpm --filter @protostar/authority test` exits 0
- `pnpm run verify:full` exits 0 (Phase 1 regression: 293/293)
- Zero `node:fs` imports under `packages/authority/src/`
- All 5 schema files parseable JSON
</verification>

<success_criteria>
- New workspace package registered, builds, and tests pass
- Phase 1 full suite still green
- Authority boundary lock encoded structurally (no fs in authority)
- Five schema files committed, ready for Wave 1+ to fill
</success_criteria>

<output>
After completion, create `.planning/phases/02-authority-governance-kernel/02-01-authority-package-skeleton-SUMMARY.md`
</output>
