---
phase: 01-intent-planning-admission
plan: 04
subsystem: intent + planning refusal-artifact schemas
tags: [schema, refusal-artifact, json-schema, forward-compat, phase-2-prep]
requires:
  - existing CLARIFICATION_REPORT_JSON_SCHEMA in packages/intent/src/clarification.ts
provides:
  - packages/intent/schema/clarification-report.schema.json
  - packages/intent/schema/confirmed-intent.schema.json
  - packages/planning/schema/no-plan-admitted.schema.json
  - "@protostar/intent/schema/clarification-report.schema.json subpath export"
  - "@protostar/intent/schema/confirmed-intent.schema.json subpath export"
  - "@protostar/planning/schema/no-plan-admitted.schema.json subpath export"
affects:
  - packages/intent/src/clarification.ts (CLARIFICATION_REPORT_SCHEMA_VERSION = "1.0.0")
  - packages/intent/src/clarification-report-schema.test.ts (added schema-file validator test)
tech-stack:
  added: []
  patterns:
    - "Pure-JSON schema files alongside dist/, exposed via package.json exports map"
    - "Hand-rolled $ref-following validator (no runtime dep) honoring CONVENTIONS.md zero-runtime-deps lock"
key-files:
  created:
    - packages/intent/schema/clarification-report.schema.json
    - packages/intent/schema/confirmed-intent.schema.json
    - packages/planning/schema/no-plan-admitted.schema.json
  modified:
    - packages/intent/package.json
    - packages/planning/package.json
    - packages/intent/src/clarification.ts
    - packages/intent/src/clarification-report-schema.test.ts
decisions:
  - "schemaVersion locked to literal '1.0.0' (Q-07) — replaces verbose 'protostar.intent.clarification-report.v1'"
  - "ConfirmedIntent schema reserves nullable signature: {algorithm,value} for Phase 2 GOV-06 (Q-13)"
  - "Hand-rolled validator instead of ajv per CONVENTIONS.md zero-runtime-deps lock"
  - "PLANNING_ADMISSION_SCHEMA_VERSION (admission-decision artifact) is intentionally NOT changed — distinct from the refusal-artifact schemaVersion this plan defines"
metrics:
  duration: ~10 min
  completed: 2026-04-26
---

# Phase 1 Plan 04: Schema Version Infrastructure Summary

JSON Schema files (draft 2020-12) for the three Phase 1 refusal/intent artifacts now ship under each owning package's `schema/` subpath, every file pins `schemaVersion: "1.0.0"` as a const, and the clarification-report emitter has been re-pinned to that literal so Phase 2 GOV-06 can layer signing without a shape migration.

## Tasks completed

| Task | Name | Commit |
|------|------|--------|
| 1 | Create JSON Schema files and subpath exports | 977578c |
| 2 | Embed schemaVersion "1.0.0" in clarification-report emitter and validate via shipped schema file | a620dea |

## Files

### Created
- `packages/intent/schema/clarification-report.schema.json` — draft 2020-12, schemaVersion const "1.0.0", mirrors the existing in-source `CLARIFICATION_REPORT_JSON_SCHEMA` shape
- `packages/intent/schema/confirmed-intent.schema.json` — includes nullable `signature: { algorithm, value }` reservation per Q-13 (Plan 06 wires runtime)
- `packages/planning/schema/no-plan-admitted.schema.json` — refusal-artifact schema (Plan 08 wires runtime)

### Modified
- `packages/intent/package.json` — adds `./schema/clarification-report.schema.json` + `./schema/confirmed-intent.schema.json` exports, `"files": ["dist", "schema"]`
- `packages/planning/package.json` — adds `./schema/no-plan-admitted.schema.json` export, `"files": ["dist", "schema"]`
- `packages/intent/src/clarification.ts` — `CLARIFICATION_REPORT_SCHEMA_VERSION` flipped from `"protostar.intent.clarification-report.v1"` to `"1.0.0"`; the in-source `CLARIFICATION_REPORT_JSON_SCHEMA.properties.schemaVersion.const` follows automatically
- `packages/intent/src/clarification-report-schema.test.ts` — adds `clarification-report.schema.json file validates emitted reports` describe block: loads the file via `fileURLToPath(new URL("../schema/...", import.meta.url))`, parses, walks `$ref`/`required`/`properties`/`type`/`const`/`enum`/`items` against a freshly emitted report

## Surface contract deltas

- `ClarificationReport.schemaVersion` literal changed from `"protostar.intent.clarification-report.v1"` to `"1.0.0"`. Type is still `typeof CLARIFICATION_REPORT_SCHEMA_VERSION`, so all type-narrowing call sites recompile cleanly.
- No changes to `ConfirmedIntent` runtime type (Plan 06 owns brand + `signature` field).
- No changes to `PlanningAdmission*` runtime types (Plan 08 owns no-plan-admitted runtime wiring; the existing `PLANNING_ADMISSION_SCHEMA_VERSION = "protostar.planning.admission.v1"` describes a different artifact and is intentionally untouched).

## Verification

- `pnpm --filter @protostar/intent build` — exit 0
- `pnpm --filter @protostar/planning build` — exit 0
- `pnpm --filter @protostar/intent test` — 56 tests, 11 suites, 0 failed (includes the new schema-file validator subtest)
- All three schema files: `JSON.parse` valid; `$schema` exact match; `properties.schemaVersion.const === "1.0.0"`

## Deviations from Plan

### None requiring auto-fix
- Acceptance criterion in plan reads "grep -c 'schemaVersion' packages/intent/src/clarification-report/index.ts is at least 2". That file is a pure barrel re-exporting from `../clarification.js`; it has 1 mention (the named re-export). The substance of the criterion — "type field + construction site" — is met in the underlying source file `packages/intent/src/clarification.ts` (4 mentions: type literal, schema property, schema const, construction site at line 350). Documenting as a literal-vs-substance nuance, not an auto-fix.

### Threat-model coverage (no new threats)
- T-01-04-01 (Spoofing): mitigated — `additionalProperties: false` on every schema; `schemaVersion` is `const "1.0.0"`.
- T-01-04-02 (Tampering): accepted as designed — schemas live in version control.
- T-01-04-03 (Information Disclosure on signature): mitigated — `confirmed-intent.schema.json` `signature` is `oneOf[null, {algorithm, value}]` with `additionalProperties: false`.

## Known stubs

None. The two ConfirmedIntent / no-plan-admitted schema files describe forward shapes; the runtime types they will eventually validate are Plan 06 / Plan 08 work, which is the scope boundary the plan explicitly draws.

## Self-Check: PASSED

Files exist:
- packages/intent/schema/clarification-report.schema.json — FOUND
- packages/intent/schema/confirmed-intent.schema.json — FOUND
- packages/planning/schema/no-plan-admitted.schema.json — FOUND

Commits exist:
- 977578c (task 1) — FOUND
- a620dea (task 2) — FOUND

Tests pass: 56/56 in @protostar/intent (includes `clarification-report.schema.json file validates emitted reports`).
