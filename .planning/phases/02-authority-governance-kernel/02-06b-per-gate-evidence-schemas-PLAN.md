---
phase: 02-authority-governance-kernel
plan: 06b
type: execute
wave: 2
depends_on: [01, 06a]
files_modified:
  - packages/intent/schema/intent-admission-decision.schema.json
  - packages/intent/schema/capability-admission-decision.schema.json
  - packages/intent/schema/repo-scope-admission-decision.schema.json
  - packages/planning/schema/planning-admission-decision.schema.json
  - packages/repo/schema/workspace-trust-admission-decision.schema.json
  - packages/intent/package.json
  - packages/planning/package.json
  - packages/repo/package.json
autonomous: true
requirements:
  - GOV-03
  - GOV-05
must_haves:
  truths:
    - "All 5 per-gate evidence-extension schemas exist in their owning packages: intent (3 of them), planning (1), repo (1)"
    - "Each per-gate schema is a complete shape with `additionalProperties: false`, repeating the base fields inline (per Correction 5 — no $ref across packages)"
    - "Existing `packages/intent/schema/admission-decision.schema.json` is RENAMED via `git mv` to `intent-admission-decision.schema.json` — old filename is NOT preserved (per Correction 4: Plan 09 reader handles legacy fallback at READ time on the 208 historical run dirs; do NOT create a dual-write)"
    - "Each owning package's `package.json` exports gain the new schema subpath; the old `./schema/admission-decision.schema.json` export entry is REMOVED from packages/intent/package.json"
    - "Authority boundary preserved — schemas are static JSON files; zero runtime dependency on @protostar/authority for schema validation"
  artifacts:
    - path: packages/intent/schema/intent-admission-decision.schema.json
      provides: "Intent-gate evidence extension schema (renamed from admission-decision.schema.json)"
      contains: '"intent-admission-decision"'
    - path: packages/intent/schema/capability-admission-decision.schema.json
      provides: "Capability-gate evidence schema"
      contains: '"capability-admission-decision"'
    - path: packages/intent/schema/repo-scope-admission-decision.schema.json
      provides: "Repo-scope-gate evidence schema"
      contains: '"repo-scope-admission-decision"'
    - path: packages/planning/schema/planning-admission-decision.schema.json
      provides: "Planning-gate evidence schema"
      contains: '"planning-admission-decision"'
    - path: packages/repo/schema/workspace-trust-admission-decision.schema.json
      provides: "Workspace-trust gate evidence schema (NEW gate, Q-11/Q-12)"
      contains: '"workspace-trust-admission-decision"'
  key_links:
    - from: packages/intent/schema/intent-admission-decision.schema.json
      to: packages/intent/package.json
      via: "subpath export entry — readers import via @protostar/intent/schema/intent-admission-decision.schema.json"
      pattern: "intent-admission-decision.schema.json"
---

<objective>
Wave 2 — per-gate evidence-extension JSON schemas in their owning packages. (Split from original Plan 06 per WARNING 6 / revision iteration 2; authority-side base + brand are in companion Plan 06a.)

Per Q-13 hybrid: common header in `@protostar/authority`, per-gate evidence in owning packages. Per Q-14: existing `runs/{id}/admission-decision.json` (intent only) is renamed to `runs/{id}/intent-admission-decision.json`. Per Correction 4 (resolved 2026-04-27): the old `./schema/admission-decision.schema.json` export entry is REMOVED — Plan 09 stage reader handles legacy fallback at READ time for the 208 historical run dirs. Do NOT keep a dual-write.

Per Correction 5 (resolved 2026-04-27): each per-gate schema repeats the base fields with `additionalProperties: false`. Do NOT $ref across packages. Apply uniformly.

Per Correction 7 (WARNING 7 resolved): drop the "old name kept as alias" clause — single source of truth, single filename, single export entry.

Authority boundary: schemas are static JSON files. Zero `node:fs` imports.

Output: 5 schemas committed in owning packages with subpath exports, ready for Plan 07's per-gate writer to import + validate emissions, and Plan 09's stage reader to import + validate reads.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>

Read first: @.planning/phases/02-authority-governance-kernel/02-CORRECTIONS.md (Corrections 4, 5, 7 — schema composition + filename rename + drop alias)

@.planning/PROJECT.md
@.planning/phases/02-authority-governance-kernel/02-CONTEXT.md
@.planning/phases/02-authority-governance-kernel/02-RESEARCH.md
@.planning/phases/02-authority-governance-kernel/02-VALIDATION.md
@packages/intent/schema/admission-decision.schema.json
@packages/intent/src/admission-decision.ts
@packages/authority/schema/admission-decision-base.schema.json

<interfaces>
<!-- Existing intent-gate schema (to be renamed) — preserve all evidence fields. -->
Existing: packages/intent/schema/admission-decision.schema.json (Phase 1; renamed in this plan)

<!-- Authority-side base shape (Plan 06a) — fields to repeat in each per-gate schema. -->
From Plan 06a `AdmissionDecisionBase`:
  schemaVersion: "1.0.0"
  runId: string (pattern: "^run-[A-Za-z0-9_-]+$")
  gate: GateName
  outcome: enum ["allow", "block", "escalate"]
  timestamp: ISO date-time
  precedenceResolution: { status, precedenceDecisionPath? }
  evidence: per-gate

<!-- Subpath export pattern from Phase 1 -->
packages/intent/package.json already exposes `./schema/*.schema.json` entries.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create 5 per-gate schemas + rename existing intent schema + update package.json exports</name>
  <files>
    packages/intent/schema/intent-admission-decision.schema.json,
    packages/intent/schema/capability-admission-decision.schema.json,
    packages/intent/schema/repo-scope-admission-decision.schema.json,
    packages/planning/schema/planning-admission-decision.schema.json,
    packages/repo/schema/workspace-trust-admission-decision.schema.json,
    packages/intent/package.json,
    packages/planning/package.json,
    packages/repo/package.json
  </files>
  <read_first>
    - packages/intent/schema/admission-decision.schema.json (current intent schema; preserve all evidence fields when renaming)
    - packages/intent/package.json (existing subpath exports; pattern to mirror)
    - packages/planning/package.json (existing subpath exports; mirror pattern)
    - packages/repo/package.json (may not have schema/ dir or `files` entry — add both if absent)
    - .planning/phases/02-authority-governance-kernel/02-CONTEXT.md Q-13, Q-14
    - .planning/phases/02-authority-governance-kernel/02-CORRECTIONS.md Corrections 4, 5, 7
  </read_first>
  <behavior>
    - All 5 per-gate JSON schemas use the same outer shape: `additionalProperties: false`, repeat base fields inline (Correction 5)
    - The intent-gate evidence extension preserves ALL evidence fields the existing Phase 1 `admission-decision.schema.json` already had — port verbatim
    - `packages/intent/package.json` exports gain `./schema/intent-admission-decision.schema.json`, `./schema/capability-admission-decision.schema.json`, `./schema/repo-scope-admission-decision.schema.json`. The old `./schema/admission-decision.schema.json` export entry is REMOVED (Correction 4).
    - `packages/planning/package.json` exports gain `./schema/planning-admission-decision.schema.json`
    - `packages/repo/package.json` exports gain `./schema/workspace-trust-admission-decision.schema.json`. If `packages/repo/schema/` does not exist, create it. Add `"schema"` to `files` entry if absent.
  </behavior>
  <action>
**Rename** `packages/intent/schema/admission-decision.schema.json` → `intent-admission-decision.schema.json` via:
```bash
git mv packages/intent/schema/admission-decision.schema.json packages/intent/schema/intent-admission-decision.schema.json
```
Update the `$id` field inside the file from `.../admission-decision.schema.json` to `.../intent-admission-decision.schema.json`. Update the `title` field to `IntentAdmissionDecision`. Add `gate: { const: "intent" }` to the schema properties (was previously implicit). Verify all evidence fields the file previously declared are preserved.

**REMOVE** the `"./schema/admission-decision.schema.json"` entry from `packages/intent/package.json` exports. Do NOT keep a dual entry. Do NOT copy bytes back to the old filename. Plan 09 stage reader handles legacy disk-fallback at READ time.

**Per-gate schemas** — all 5 follow this template (substitute `{gate}` and evidence content):

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://protostar.local/schema/{gate}-admission-decision.schema.json",
  "title": "{Gate}AdmissionDecision",
  "type": "object",
  "additionalProperties": false,
  "required": ["schemaVersion", "runId", "gate", "outcome", "timestamp", "precedenceResolution", "evidence"],
  "properties": {
    "schemaVersion": { "const": "1.0.0" },
    "runId": { "type": "string", "pattern": "^run-[A-Za-z0-9_-]+$" },
    "gate": { "const": "{gate}" },
    "outcome": { "enum": ["allow", "block", "escalate"] },
    "timestamp": { "type": "string", "format": "date-time" },
    "precedenceResolution": {
      "type": "object",
      "additionalProperties": false,
      "required": ["status"],
      "properties": {
        "status": { "enum": ["no-conflict", "resolved", "blocked-by-tier"] },
        "precedenceDecisionPath": { "type": "string" }
      }
    },
    "evidence": {
      "type": "object",
      "additionalProperties": false,
      "required": [...],
      "properties": { ...gate-specific evidence... }
    }
  }
}
```

Specific evidence content per gate:

- **`intent-admission-decision.schema.json`** (renamed from existing): preserve all current evidence fields (port verbatim). At minimum: `{ ambiguityScore, clarificationReportPath?, refusedReasons?, admissionStage }`. Reference current file for full list.
- **`capability-admission-decision.schema.json`**: evidence `{ requestedEnvelope: object, resolvedEnvelope: object, blockedAxes?: string[] }`.
- **`repo-scope-admission-decision.schema.json`**: evidence `{ requestedScopes: string[], grantedScopes: string[], deniedScopes?: string[] }`.
- **`planning-admission-decision.schema.json`**: evidence `{ candidatesConsidered: number, admittedPlanId?: string, refusedReasons?: string[] }`.
- **`workspace-trust-admission-decision.schema.json`**: evidence `{ workspacePath: string, declaredTrust: "trusted"|"untrusted", grantedAccess: "read"|"write"|"execute"|"none", refusalReason?: string }` — Q-11/Q-12 new gate.

**Update package.json exports:**

In `packages/intent/package.json` — REMOVE the old admission-decision entry, ADD three new entries:
```json
"./schema/intent-admission-decision.schema.json": "./schema/intent-admission-decision.schema.json",
"./schema/capability-admission-decision.schema.json": "./schema/capability-admission-decision.schema.json",
"./schema/repo-scope-admission-decision.schema.json": "./schema/repo-scope-admission-decision.schema.json"
```

In `packages/planning/package.json` — ADD:
```json
"./schema/planning-admission-decision.schema.json": "./schema/planning-admission-decision.schema.json"
```

In `packages/repo/package.json` — ADD (and ensure `"files"` includes `"schema"`):
```json
"./schema/workspace-trust-admission-decision.schema.json": "./schema/workspace-trust-admission-decision.schema.json"
```

If `packages/repo/schema/` does not exist on disk, create the directory and put the schema file there.
  </action>
  <verify>
    <automated>pnpm --filter @protostar/intent test &amp;&amp; pnpm --filter @protostar/planning test &amp;&amp; pnpm --filter @protostar/repo test &amp;&amp; pnpm run verify:full</automated>
  </verify>
  <acceptance_criteria>
    - All four `pnpm --filter` runs above exit 0
    - `pnpm run verify:full` exits 0 (Phase 1 regression — modulo any tests that reference the old `admission-decision.schema.json` filename; if any exist, update them as part of this task)
    - All 5 schema files exist:
      - `test -f packages/intent/schema/intent-admission-decision.schema.json && echo ok`
      - `test -f packages/planning/schema/planning-admission-decision.schema.json && echo ok`
      - `test -f packages/intent/schema/capability-admission-decision.schema.json && echo ok`
      - `test -f packages/intent/schema/repo-scope-admission-decision.schema.json && echo ok`
      - `test -f packages/repo/schema/workspace-trust-admission-decision.schema.json && echo ok`
    - Each schema has `"additionalProperties": false` at top level
    - The old `packages/intent/schema/admission-decision.schema.json` no longer exists: `test ! -f packages/intent/schema/admission-decision.schema.json && echo ok`
    - The old export entry is removed from packages/intent/package.json: `grep -c '"\\./schema/admission-decision\\.schema\\.json"' packages/intent/package.json` outputs `0`
    - Each schema declares `gate: { const: "{gate}" }` matching its filename
  </acceptance_criteria>
  <done>5 per-gate schemas committed in owning packages; old admission-decision.schema.json gone (legacy disk fallback handled by Plan 09); subpath exports updated; ready for factory-cli writer (Plan 07).</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Per-gate schema validation boundary | Stage readers (Plan 09) validate disk artifacts against these schemas before deserializing into branded types |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-2-6 | Tampering | Stage reader accepts a wrong-schema artifact | mitigate | Per-gate schemas use `additionalProperties: false`, `gate: { const }`, `outcome: enum` — each gate's reader (Plan 09) validates `schemaVersion` and matches `gate` literal at read time. |
</threat_model>

<verification>
- All four owning packages' tests pass (intent, planning, repo, authority)
- `pnpm run verify:full` exits 0
- 5 per-gate schemas exist and are valid JSON Schema 2020-12
- Old `admission-decision.schema.json` removed (single source of truth)
</verification>

<success_criteria>
- All 5 per-gate evidence-extension schemas committed in owning packages
- Old intent schema renamed via `git mv` (history preserved)
- Subpath exports updated; old export entry removed
- GOV-05 schema infrastructure ready for Plan 07 writer + Plan 09 reader
</success_criteria>

<output>
After completion, create `.planning/phases/02-authority-governance-kernel/02-06b-per-gate-evidence-schemas-SUMMARY.md`
</output>
</content>
</invoke>