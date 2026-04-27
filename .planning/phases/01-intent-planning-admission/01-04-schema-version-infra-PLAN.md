---
phase: 01-intent-planning-admission
plan: 04
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/intent/schema/clarification-report.schema.json
  - packages/intent/schema/confirmed-intent.schema.json
  - packages/planning/schema/no-plan-admitted.schema.json
  - packages/intent/src/clarification-report/index.ts
  - packages/intent/src/clarification-report-schema.test.ts
  - packages/intent/package.json
  - packages/planning/package.json
autonomous: true
requirements:
  - INTENT-01
  - PLAN-A-02
must_haves:
  truths:
    - "Every refusal artifact (clarification-report.json, no-plan-admitted.json) embeds schemaVersion '1.0.0' (Q-07)"
    - "JSON Schema files for each refusal artifact ship under packages/intent/schema/ and packages/planning/schema/"
    - "A test validates each emitted refusal artifact against its JSON Schema"
    - "ConfirmedIntent's schema includes schemaVersion '1.0.0' AND a reserved nullable signature property (Q-13 forward compat)"
    - "Schema files are subpath-exported so external consumers can validate without reaching into private state"
  artifacts:
    - path: packages/intent/schema/clarification-report.schema.json
      provides: "JSON Schema (draft 2020-12) for clarification-report.json refusal artifact"
      contains: "schemaVersion"
    - path: packages/intent/schema/confirmed-intent.schema.json
      provides: "JSON Schema for ConfirmedIntent including schemaVersion and reserved signature field"
      contains: "schemaVersion"
    - path: packages/planning/schema/no-plan-admitted.schema.json
      provides: "JSON Schema for no-plan-admitted.json refusal artifact"
      contains: "schemaVersion"
  key_links:
    - from: packages/intent/src/clarification-report/index.ts
      to: packages/intent/schema/clarification-report.schema.json
      via: "schemaVersion field embedded in every emitted report"
      pattern: "schemaVersion"
---

<objective>
Pay the schema-versioning cost upfront so Phase 2 (which requires schema-versioned admission decisions) doesn't migrate existing artifacts later. Every Phase 1 refusal artifact embeds schemaVersion "1.0.0" and ships a JSON Schema under the owning package's schema/ subpath. Per Q-07 + Q-13.

Purpose: Stable schema shape from day one; uniform inspection surface for Phase 9; uncomplicated content-hash work in Phase 2 GOV-06.

Output: schema/ directories under packages/intent and packages/planning populated with *.schema.json files; refusal-artifact emitters updated to embed schemaVersion; existing clarification-report-schema.test.ts extended to validate the embedded version.

Scope: This plan establishes the FIELD and the SCHEMA FILES. Plan 06 (branded ConfirmedIntent) consumes the ConfirmedIntent schema and adds the runtime signature: null reservation. Plan 08 (refusal artifact layout) consumes the no-plan-admitted schema.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/phases/01-intent-planning-admission/01-CONTEXT.md
@.planning/codebase/CONVENTIONS.md
@packages/intent/src/clarification-report
@packages/intent/src/clarification-report-schema.test.ts
@packages/intent/package.json
@packages/planning/package.json
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Create JSON Schema files and subpath exports</name>
  <read_first>
    - /Users/zakkeown/Code/protostar/packages/intent/src/clarification-report/index.ts (current shape of clarification-report.json)
    - /Users/zakkeown/Code/protostar/packages/intent/src/confirmed-intent.ts (current ConfirmedIntent shape)
    - /Users/zakkeown/Code/protostar/packages/planning/src/artifacts/index.ts (current shape of no-plan-admitted.json)
    - /Users/zakkeown/Code/protostar/packages/intent/package.json (existing exports map)
    - /Users/zakkeown/Code/protostar/packages/planning/package.json (existing exports map)
    - /Users/zakkeown/Code/protostar/.planning/codebase/CONVENTIONS.md (subpath-export discipline)
  </read_first>
  <behavior>
    - Each schema file is valid JSON parseable by JSON.parse
    - Each declares "$schema": "https://json-schema.org/draft/2020-12/schema"
    - Each requires schemaVersion with const "1.0.0" (locks the version literally)
    - Subpath-export references resolve via package.json exports map
  </behavior>
  <action>
    1. Create packages/intent/schema/clarification-report.schema.json:
       - "$schema": "https://json-schema.org/draft/2020-12/schema"
       - "$id": "https://protostar.local/schema/clarification-report.schema.json"
       - title: "ClarificationReport"
       - type: "object", additionalProperties: false
       - required: ["schemaVersion", ...every other field of the current TS type]
       - properties.schemaVersion: { "const": "1.0.0" }
       - Derive every other property from the TypeScript type at packages/intent/src/clarification-report/index.ts. Map readonly arrays to {"type":"array"}, scalars to {"type":"string"|"number"|"boolean"}.

    2. Create packages/intent/schema/confirmed-intent.schema.json mirroring the same pattern. Include:
       - properties.schemaVersion: { "const": "1.0.0" }
       - properties.signature: { "oneOf": [ { "type": "null" }, { "type": "object", "required": ["algorithm","value"], "properties": { "algorithm": {"type":"string"}, "value": {"type":"string"} }, "additionalProperties": false } ] }
       Per Q-13, Phase 1 always emits signature: null. The schema accepts both shapes so Phase 2 GOV-06 doesn't need a schema migration.

    3. Create packages/planning/schema/no-plan-admitted.schema.json mirroring the shape of the current no-plan-admitted.json artifact (derive from packages/planning/src/artifacts/index.ts). Include schemaVersion "1.0.0" const.

    4. In packages/intent/package.json add to "exports":
         "./schema/clarification-report.schema.json": "./schema/clarification-report.schema.json",
         "./schema/confirmed-intent.schema.json": "./schema/confirmed-intent.schema.json"
       Place alongside existing exports. Do NOT remove existing entries.

    5. In packages/planning/package.json add to "exports":
         "./schema/no-plan-admitted.schema.json": "./schema/no-plan-admitted.schema.json"

    6. Schema files use *.schema.json convention (matches existing clarification-report-schema.test.ts test name). They are PURE JSON; place under packages/<pkg>/schema/, NOT under src/, so tsc does not compile them.

    7. Add a "files" entry to each affected package.json if absent that includes "schema" alongside "dist", for forward-compatibility with Phase 10 DOG-06 publish hygiene.
  </action>
  <verify>
    <automated>cd /Users/zakkeown/Code/protostar && bash -c 'for f in packages/intent/schema/clarification-report.schema.json packages/intent/schema/confirmed-intent.schema.json packages/planning/schema/no-plan-admitted.schema.json; do node -e "const s=JSON.parse(require(\"fs\").readFileSync(\"$f\",\"utf8\")); if(s[\"\\\$schema\"]!==\"https://json-schema.org/draft/2020-12/schema\"){process.exit(1)} if(!s.properties||!s.properties.schemaVersion||s.properties.schemaVersion.const!==\"1.0.0\"){process.exit(1)}" || exit 1; done' && pnpm --filter @protostar/intent build && pnpm --filter @protostar/planning build</automated>
  </verify>
  <acceptance_criteria>
    - All 3 schema files exist and parse as valid JSON.
    - Each contains the literal string "https://json-schema.org/draft/2020-12/schema".
    - Each contains a schemaVersion property with "const": "1.0.0" (verify by JSON.parse + property check; not by raw grep alone).
    - packages/intent/package.json exports map includes "./schema/clarification-report.schema.json" and "./schema/confirmed-intent.schema.json".
    - packages/planning/package.json exports map includes "./schema/no-plan-admitted.schema.json".
    - pnpm --filter @protostar/intent build exits 0; pnpm --filter @protostar/planning build exits 0.
  </acceptance_criteria>
  <done>3 schema files created, exports wired, both packages still build.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Embed schemaVersion in the clarification-report emitter and validate in tests</name>
  <read_first>
    - /Users/zakkeown/Code/protostar/packages/intent/src/clarification-report/index.ts (the emitter and type — find every place it constructs the report)
    - /Users/zakkeown/Code/protostar/packages/intent/src/clarification-report-schema.test.ts (existing schema test — extend it)
    - /Users/zakkeown/Code/protostar/packages/intent/schema/clarification-report.schema.json (created in Task 1)
    - /Users/zakkeown/Code/protostar/packages/intent/src/index.ts (barrel — ensure schemaVersion is part of the public type)
    - /Users/zakkeown/Code/protostar/packages/intent/src/public-split-exports.contract.test.ts (may need ClarificationReport key-list update)
  </read_first>
  <behavior>
    - Every clarification report produced by the public emitter has schemaVersion "1.0.0" as a top-level readonly field
    - An emitted report passes a hand-rolled validator against clarification-report.schema.json (no new runtime dep)
    - Compile-time contract on ClarificationReport requires schemaVersion: "1.0.0" literal type (Assert<KeysEqual<...>> pattern)
  </behavior>
  <action>
    1. In packages/intent/src/clarification-report/index.ts:
       - Add readonly schemaVersion: "1.0.0" to the ClarificationReport type.
       - Update every construction site to include schemaVersion: "1.0.0".
       - If the package has a *.contract.ts pinning ClarificationReport keys, add schemaVersion to the expected key list.

    2. Re-export schemaVersion as part of the public ClarificationReport type from packages/intent/src/index.ts (already exported transitively if the type already is — verify).

    3. Extend packages/intent/src/clarification-report-schema.test.ts:
       - Add a test that emits a report via the public emitter for a representative clarification scenario and asserts result.schemaVersion === "1.0.0".
       - Add a hand-rolled validator test:
           a. Use node:fs/promises readFile to load packages/intent/schema/clarification-report.schema.json (resolve via import.meta.url + URL/fileURLToPath, ESM-correct).
           b. JSON.parse it.
           c. Walk schema.required ensuring each is present in the emitted object.
           d. Walk schema.properties asserting type matches ("string"/"number"/"boolean"/"object"/"array").
           e. For const constraints (schemaVersion), assert exact equality.
       - Do NOT introduce ajv or any external validator (CONVENTIONS.md zero-runtime-deps lock).

    4. If packages/intent/src/public-split-exports.contract.test.ts pins literal exported keys for ClarificationReport, update its expected key list.

    5. Run pnpm --filter @protostar/intent test. New test passes; existing tests still pass.
  </action>
  <verify>
    <automated>cd /Users/zakkeown/Code/protostar && pnpm --filter @protostar/intent build && pnpm --filter @protostar/intent test</automated>
  </verify>
  <acceptance_criteria>
    - grep -c "schemaVersion" packages/intent/src/clarification-report/index.ts is at least 2 (type field + construction site).
    - grep -c "schemaVersion" packages/intent/src/clarification-report-schema.test.ts is at least 2 (assertion + schema load reference).
    - pnpm --filter @protostar/intent test exits 0.
    - The new validator test fails if schemaVersion is removed (verify by temporary mutation during local dev — not gate-required, but document in SUMMARY).
  </acceptance_criteria>
  <done>Emitter produces schemaVersion-tagged reports; test validates against the JSON Schema file.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Refusal artifact ↔ external consumer | Phase 9 inspect / external tooling reads the artifact and trusts its shape |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-01-04-01 | Spoofing | Refusal artifacts produced by future code paths | mitigate | schemaVersion const "1.0.0" + JSON Schema `additionalProperties: false` ensure unknown shapes are rejected at validation time |
| T-01-04-02 | Tampering | Schema files (pure JSON) | accept | Schemas live in version control; tampering surfaces in `git diff`. No runtime mutation path |
| T-01-04-03 | Information Disclosure | confirmed-intent.schema.json signature field | mitigate | Schema accepts only null OR a strict object shape with algorithm + value strings; no free-form fields |
</threat_model>

<verification>
- 3 schema files validate as draft 2020-12 with schemaVersion const "1.0.0".
- Refusal-artifact emitters (clarification-report) include schemaVersion literally.
- Hand-rolled validator test in packages/intent passes.
- Both packages still build.
</verification>

<success_criteria>
Every Phase 1 refusal artifact carries a forward-compatible schemaVersion. Phase 2 GOV-06 can layer signing on top without a shape migration.
</success_criteria>

<output>
After completion, create .planning/phases/01-intent-planning-admission/01-04-SUMMARY.md listing the 3 schema files, the consumers updated, and any field-list deltas to ClarificationReport / ConfirmedIntent surface contracts.
</output>
