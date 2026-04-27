---
phase: 05-review-repair-loop
plan: 03
type: execute
wave: 0
depends_on: []
files_modified:
  - packages/intent/schema/confirmed-intent.schema.json
  - packages/planning/src/index.ts
  - packages/planning/src/index.test.ts
  - examples/intents/
  - examples/planning-results/
  - packages/admission-e2e/
autonomous: true
requirements: [LOOP-04, LOOP-01]
must_haves:
  truths:
    - "`confirmedIntent.schemaVersion` const flips to `\"1.4.0\"`"
    - "`capabilityEnvelope.budget.maxRepairLoops` is a required-with-default integer field (default 3, min 1, max 10)"
    - "Plan-schema task type carries optional `acceptanceTestRefs: Array<{ acId, testFile, testName }>`"
    - "Every repo fixture / test that asserted `\"schemaVersion\": \"1.3.0\"` (or `\"1.2.0\"`) on a confirmed-intent literal is updated to `\"1.4.0\"` and re-signed where applicable"
    - "`pnpm run verify:full` passes against the new schema version"
  artifacts:
    - path: packages/intent/schema/confirmed-intent.schema.json
      provides: "schema 1.4.0 with budget.maxRepairLoops"
    - path: packages/planning/src/index.ts
      provides: "PlanTask.acceptanceTestRefs typed field"
  key_links:
    - from: packages/intent/schema/confirmed-intent.schema.json
      to: confirmedIntent.capabilityEnvelope.budget
      via: "JSON Schema additionalProperties closed"
      pattern: "maxRepairLoops"
    - from: packages/planning/src/index.ts
      to: PlanTask
      via: "type member"
      pattern: "acceptanceTestRefs"
---

<objective>
Hard-bump `confirmedIntent.schemaVersion` to `"1.4.0"`, adding `budget.maxRepairLoops` (Q-12). Add optional `task.acceptanceTestRefs` to the plan schema (Q-09) — the type lands here so Wave 2 (mechanical adapter) and Wave 3 (admission rule) can consume the field. Cascade every fixture in the repo that pins a confirmed-intent schema version literal.

Purpose: Single coordinated schema bump cluster. Phase 4's bump (1.2 → 1.3) is the predecessor; Phase 5 lifts to 1.4. Mirrors Phase 3 Plan 03-03 cascade pattern exactly.
Output: New schema version live; all fixtures re-signed; `pnpm run verify:full` green.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<external_dependency>
**Phase 4 prerequisite:** This plan assumes Phase 4 Plan 04-07 has shipped, taking confirmedIntent to schema `"1.3.0"` with `budget.adapterRetriesPerTask`, `budget.taskWallClockMs`, `network.allow`, and `network.allowedHosts`. If `packages/intent/schema/confirmed-intent.schema.json` still pins `"1.2.0"` when this plan executes, **STOP** and resolve Phase 4 first.

The current schema as of this plan's authorship (Phase 3 ship state) is `"1.2.0"`. Phase 4 adds the 1.3 fields. Phase 5 adds `budget.maxRepairLoops` on top of 1.3 → 1.4. If Phase 4 has not landed, this plan must instead target the 1.2 → 1.3 → 1.4 cumulative bump and add Phase 4's required fields too — surface that to the operator before executing.
</external_dependency>

<context>
@.planning/phases/05-review-repair-loop/05-CONTEXT.md
@packages/intent/schema/confirmed-intent.schema.json
@.planning/phases/03-repo-runtime-sandbox/03-03-confirmed-intent-schema-bump-PLAN.md
@.planning/phases/04-execution-engine/04-07-envelope-schema-bump-PLAN.md
@packages/planning/src/index.ts

Cascade pattern (proven in Phase 3 Plan 03-03 and Phase 4 Plan 04-07):
1. Bump `const` schema version literal in `confirmed-intent.schema.json`
2. Add new property under `properties.capabilityEnvelope.properties.budget.properties` with default
3. Re-grep entire repo for the OLD version literal — fix every match
4. Re-sign every signed-intent fixture using `buildSignatureEnvelope` (Phase 2 plan 02-05 helper)
5. `pnpm run verify:full` must pass

<interfaces>
JSON Schema addition (Q-12 — literal text):
```json
"maxRepairLoops": {
  "type": "integer",
  "minimum": 1,
  "maximum": 10,
  "default": 3,
  "description": "Maximum review→repair→review iterations before block-with-evidence (Phase 5 LOOP-04)."
}
```

TypeScript addition to `PlanTask` interface in `packages/planning/src/index.ts` (Q-09):
```typescript
readonly acceptanceTestRefs?: readonly {
  readonly acId: string;
  readonly testFile: string;
  readonly testName: string;
}[];
```
Optional on individual tasks; PLAN-LEVEL coverage (every `intent.acceptanceCriteria[].id` covered by ≥1 task's refs) is enforced by the admission rule landing in Plan 05-11 — not here.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Bump confirmed-intent schema 1.3.0 → 1.4.0 + maxRepairLoops</name>
  <files>packages/intent/schema/confirmed-intent.schema.json, packages/intent/src/confirmed-intent.test.ts (or analog)</files>
  <read_first>
    - packages/intent/schema/confirmed-intent.schema.json (current shape)
    - .planning/phases/05-review-repair-loop/05-CONTEXT.md §Q-12 ("Capability-envelope schema bump (1.3.0 → 1.4.0): add `budget.maxRepairLoops: number` (default 3)")
    - .planning/phases/04-execution-engine/04-07-envelope-schema-bump-PLAN.md (predecessor bump pattern)
    - .planning/phases/03-repo-runtime-sandbox/03-03-confirmed-intent-schema-bump-PLAN.md (proven cascade pattern)
  </read_first>
  <behavior>
    - Test 1: Valid intent with `budget.maxRepairLoops: 3` parses + validates.
    - Test 2: Intent without `maxRepairLoops` parses + receives default `3` (defaults policy mirrors `allowDirty: false` precedent from Phase 3).
    - Test 3: `maxRepairLoops: 0` rejects (minimum: 1).
    - Test 4: `maxRepairLoops: 11` rejects (maximum: 10).
    - Test 5: Schema `"1.3.0"` literal anywhere is a hard fail in the test (prevents stale fixtures sneaking through).
  </behavior>
  <action>
In `packages/intent/schema/confirmed-intent.schema.json`:
1. Change `"schemaVersion": { "const": "1.3.0" }` → `"schemaVersion": { "const": "1.4.0" }` (or `"1.2.0"` → `"1.4.0"` if Phase 4 hasn't landed — see `<external_dependency>` block).
2. Locate `properties.capabilityEnvelope.properties.budget.properties` and add the literal block from `<interfaces>`.
3. Confirm `additionalProperties: false` is set on `budget` (closed-key validation).

Update intent package tests to assert the five behaviors above. Use the same defaulting strategy Phase 3 used for `allowDirty` (apply default at parse time before downstream consumption).
  </action>
  <verify>
    <automated>cd /Users/zakkeown/Code/protostar && grep -c '"const": "1.4.0"' packages/intent/schema/confirmed-intent.schema.json && grep -c 'maxRepairLoops' packages/intent/schema/confirmed-intent.schema.json && pnpm --filter @protostar/intent test 2>&1 | tail -10</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c '"const": "1.4.0"' packages/intent/schema/confirmed-intent.schema.json` == 1
    - `grep -c 'maxRepairLoops' packages/intent/schema/confirmed-intent.schema.json` ≥ 1
    - `grep -c '"minimum": 1' packages/intent/schema/confirmed-intent.schema.json` ≥ 1 (within budget block)
    - `grep -c '"maximum": 10' packages/intent/schema/confirmed-intent.schema.json` ≥ 1 (within budget block)
    - `pnpm --filter @protostar/intent test` exits 0 with all 5 new tests
  </acceptance_criteria>
  <done>Schema bumped, defaults applied, tested. Cascade in Task 3 catches stale fixtures.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Add task.acceptanceTestRefs to plan-schema (TS)</name>
  <files>packages/planning/src/index.ts, packages/planning/src/acceptance-test-refs.test.ts</files>
  <read_first>
    - packages/planning/src/index.ts (PlanTask interface — line range from grep `interface PlanTask` then read ±50 lines)
    - .planning/phases/05-review-repair-loop/05-CONTEXT.md §Q-09 ("Plan-schema addition (Phase 5 owns the bump): `task.acceptanceTestRefs?: Array<{ acId: string, testFile: string, testName: string }>`")
  </read_first>
  <behavior>
    - Test 1: PlanTask without `acceptanceTestRefs` parses (optional).
    - Test 2: PlanTask with `acceptanceTestRefs: [{ acId: "ac-1", testFile: "t.test.ts", testName: "renders" }]` parses.
    - Test 3: PlanTask with `acceptanceTestRefs: [{ acId: "ac-1" }]` (missing testFile/testName) fails type-check (use `@ts-expect-error` and a runtime parse-rejection test).
  </behavior>
  <action>
1. Locate `interface PlanTask` (or the `PlanTaskSchema` zod/runtime equivalent) in `packages/planning/src/index.ts` via `grep -n "interface PlanTask\\|PlanTaskSchema" packages/planning/src/index.ts`.
2. Add the optional readonly array member exactly as specified in `<interfaces>`. Place after `targetFiles` for naming locality. Field is OPTIONAL on individual tasks — admission rule (Plan 05-11) enforces plan-level coverage.
3. If a runtime validator (zod / hand-rolled) accompanies the interface, mirror the addition there too. If not, the type-only addition is sufficient — admission rule will validate at the AdmittedPlan boundary.
4. Add tests covering the three behaviors. Test runtime parsing if a validator exists; otherwise assert via `@ts-expect-error` and `as const` literal construction.

Do NOT enforce plan-level coverage here. The admission rule lives in Plan 05-11. This plan only widens the type so consumers compile.
  </action>
  <verify>
    <automated>cd /Users/zakkeown/Code/protostar && grep -c 'acceptanceTestRefs' packages/planning/src/index.ts && pnpm --filter @protostar/planning test 2>&1 | tail -10</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c 'acceptanceTestRefs' packages/planning/src/index.ts` ≥ 1
    - `grep -cE 'acId|testFile|testName' packages/planning/src/index.ts` ≥ 3 (one per field name)
    - `pnpm --filter @protostar/planning test` exits 0
  </acceptance_criteria>
  <done>PlanTask carries the optional acceptanceTestRefs field; downstream waves can read it.</done>
</task>

<task type="auto">
  <name>Task 3: Cascade audit — re-sign every fixture pinning the old schema version</name>
  <files>examples/intents/**/*.json, examples/planning-results/**/*.json, packages/admission-e2e/src/**/*.ts, packages/intent/src/**/*.test.ts, packages/planning/src/**/*.test.ts</files>
  <read_first>
    - .planning/phases/03-repo-runtime-sandbox/03-03-confirmed-intent-schema-bump-PLAN.md "cascade audit" task (template)
    - .planning/phases/04-execution-engine/04-07-envelope-schema-bump-PLAN.md "Pitfall 7" (signed-intent regeneration pattern)
    - packages/authority/src/signature-helpers.ts (or wherever `buildSignatureEnvelope` lives — find via grep)
    - .planning/phases/05-review-repair-loop/05-CONTEXT.md "Specifics" §"Capability-envelope bump cluster"
  </read_first>
  <action>
1. Run repo-wide audit:
   ```bash
   grep -rln '"1.3.0"' packages/ examples/ apps/ --include='*.json' --include='*.ts' | grep -v node_modules | grep -v dist
   grep -rln '"1.2.0"' packages/ examples/ apps/ --include='*.json' --include='*.ts' | grep -v node_modules | grep -v dist
   ```
   For each match: if it's a confirmed-intent literal, bump to `"1.4.0"`. If it's a different schema (e.g. `clarification-report` is `"1.0.0"` — DO NOT touch), skip.

2. For every `examples/intents/*.json` containing a confirmed-intent envelope: bump `schemaVersion` to `"1.4.0"`, add `capabilityEnvelope.budget.maxRepairLoops: 3` (explicit even though default — operator-locked posture per Phase 4 Q-15 precedent), then re-sign using `buildSignatureEnvelope` from `@protostar/authority`. Use the existing fixture-regeneration script if one exists (`scripts/regenerate-signed-intent-fixtures.ts` or similar — find via `find . -name '*signed-intent*' -path '*/scripts/*'`); otherwise write a one-shot inline script and delete after use.

3. For `packages/admission-e2e/` and any other test workspace pinning the version: update string literals + re-sign attached fixtures.

4. Final check: `grep -rn '"1.3.0"' packages/ examples/ apps/ --include='*.json' --include='*.ts' | grep -v node_modules | grep -v dist | grep -i 'confirmedIntent\\|confirmed-intent'` returns 0 lines (no stale confirmed-intent versions).
  </action>
  <verify>
    <automated>cd /Users/zakkeown/Code/protostar && grep -rn '"schemaVersion".*"1\.3\.0"' packages/ examples/ apps/ --include='*.json' 2>/dev/null | grep -v node_modules | grep -v dist | grep -i 'capability\|confirmed' | wc -l | grep -q '^0$' && pnpm run verify:full 2>&1 | tail -20</automated>
  </verify>
  <acceptance_criteria>
    - No remaining `"schemaVersion": "1.3.0"` in confirmed-intent or capability-related fixtures (audit grep returns 0)
    - `pnpm run verify:full` exits 0 (full verify across every package)
    - Every signed-intent fixture has been re-signed (verify by spot-check: pick one fixture, run its `verifyConfirmedIntentSignature`, assert it passes)
  </acceptance_criteria>
  <done>Schema bump fully cascaded; verify:full green; fixtures re-signed.</done>
</task>

</tasks>

<threat_model>
| Boundary | Description |
|----------|-------------|
| schema version literal ↔ all fixtures + tests | drift = silent admission divergence |

| Threat ID | Category | Component | Disposition | Mitigation |
|-----------|----------|-----------|-------------|------------|
| T-05-04 | Tampering | stale `"1.3.0"` fixture passes admission against `"1.4.0"` schema | mitigate | const literal `"1.4.0"` in schema rejects stale; cascade audit (Task 3) catches every literal; verify:full enforces |
| T-05-05 | Repudiation | signed-intent fixture not re-signed after schema bump | mitigate | Task 3 explicit re-sign step + spot-check `verifyConfirmedIntentSignature` |
</threat_model>

<verification>
- `pnpm run verify:full` green
- `grep -c '1.4.0' packages/intent/schema/confirmed-intent.schema.json` ≥ 1
- No stale confirmed-intent `"1.3.0"` literals anywhere
</verification>

<success_criteria>
- confirmedIntent schema is `1.4.0` with `budget.maxRepairLoops` (default 3, range 1-10)
- PlanTask supports optional `acceptanceTestRefs` field
- Every fixture re-signed; verify:full green
</success_criteria>

<output>
Create `.planning/phases/05-review-repair-loop/05-03-SUMMARY.md`: documents the new schema version, the cascade scope (file count touched), and notes that Plan 05-04 reads `maxRepairLoops` from the resolved envelope and Plan 05-11 enforces plan-level AC coverage.
</output>
</content>
</invoke>