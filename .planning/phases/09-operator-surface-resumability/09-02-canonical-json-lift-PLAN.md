---
phase: 09-operator-surface-resumability
plan: 02
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/artifacts/src/canonical-json.ts
  - packages/artifacts/src/canonical-json.test.ts
  - packages/artifacts/src/index.ts
  - packages/execution/src/snapshot.ts
  - packages/execution/package.json
  - packages/execution/tsconfig.json
autonomous: true
requirements: [OP-07]
must_haves:
  truths:
    - "sortJsonValue is exported from @protostar/artifacts/canonical-json (Q-12)"
    - "packages/execution/src/snapshot.ts re-imports sortJsonValue from @protostar/artifacts (no parallel implementation)"
    - "serializeSnapshot produces byte-identical output before and after the lift (Phase 4 callers unchanged)"
    - "@protostar/artifacts adds canonical-json subpath export"
    - "@protostar/execution declares @protostar/artifacts as a dependency (if not already)"
  artifacts:
    - path: packages/artifacts/src/canonical-json.ts
      provides: "Lifted sortJsonValue helper (Q-12)"
      exports: ["sortJsonValue"]
    - path: packages/artifacts/src/canonical-json.test.ts
      provides: "Round-trip + idempotency tests for sortJsonValue"
    - path: packages/artifacts/src/index.ts
      contains: "canonical-json"
  key_links:
    - from: packages/execution/src/snapshot.ts
      to: packages/artifacts/src/canonical-json.ts
      via: "import { sortJsonValue } from '@protostar/artifacts/canonical-json'"
      pattern: "from .*@protostar/artifacts/canonical-json"
    - from: apps/factory-cli/src/io.ts
      to: packages/artifacts/src/canonical-json.ts
      via: "Plan 09-01 io.ts imports the same helper for writeStdoutJson"
      pattern: "from .*@protostar/artifacts/canonical-json"
---

<objective>
Lift the module-private `sortJsonValue` from `packages/execution/src/snapshot.ts:69` (Pitfall 2 — currently NOT exported) into a shared `packages/artifacts/src/canonical-json.ts` and re-import it from execution. This is the prerequisite for Q-12's stdout canonicalization across every Phase 9 command. Behavior of `serializeSnapshot` MUST be byte-identical before and after.

Purpose: Single canonical-JSON helper consumed by both Phase 4's `serializeSnapshot` (already-shipped) and Phase 9's `writeStdoutJson` (Plan 09-01). Q-12 lock.
Output: New shared module + tests; execution snapshot.ts re-imports without changing public behavior; subpath export available for factory-cli (Plan 09-01).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/09-operator-surface-resumability/09-CONTEXT.md
@.planning/phases/09-operator-surface-resumability/09-RESEARCH.md
@AGENTS.md
@packages/execution/src/snapshot.ts
@packages/artifacts/package.json
@packages/artifacts/src/index.ts

<interfaces>
```typescript
// packages/artifacts/src/canonical-json.ts (new)
// Exact behavior copied from packages/execution/src/snapshot.ts:69 — sorts object keys
// recursively; arrays preserve order; primitives unchanged. Pure, no I/O.
export function sortJsonValue(value: unknown): unknown;
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Lift sortJsonValue into @protostar/artifacts/canonical-json with round-trip tests</name>
  <read_first>
    - packages/execution/src/snapshot.ts (FULL FILE — sortJsonValue body at line ~69; serializeSnapshot at line 10; reduceJournalToSnapshot at line 14)
    - packages/artifacts/package.json (existing exports field; add canonical-json subpath)
    - packages/artifacts/src/index.ts (existing barrel re-exports)
    - packages/artifacts/tsconfig.json
    - packages/execution/package.json (confirm @protostar/artifacts dep — add if missing)
    - packages/execution/tsconfig.json (project references — add packages/artifacts if missing)
    - .planning/phases/09-operator-surface-resumability/09-CONTEXT.md (Q-12)
    - .planning/phases/09-operator-surface-resumability/09-RESEARCH.md (Pitfall 2)
  </read_first>
  <files>packages/artifacts/src/canonical-json.ts, packages/artifacts/src/canonical-json.test.ts, packages/artifacts/src/index.ts, packages/artifacts/package.json, packages/execution/src/snapshot.ts, packages/execution/package.json, packages/execution/tsconfig.json</files>
  <behavior>
    - canonical-json.test: sortJsonValue({b:2,a:1}) deep-equals {a:1,b:2}.
    - canonical-json.test: sortJsonValue([{b:2,a:1},{d:4,c:3}]) deep-equals [{a:1,b:2},{c:3,d:4}] — array order preserved, inner keys sorted.
    - canonical-json.test: sortJsonValue(null) === null; sortJsonValue(42) === 42; sortJsonValue("x") === "x"; sortJsonValue(true) === true.
    - canonical-json.test: idempotency — sortJsonValue(sortJsonValue(v)) deep-equals sortJsonValue(v) for a complex nested fixture.
    - canonical-json.test: stringify byte-equality — JSON.stringify(sortJsonValue({z:1,a:{c:3,b:2}})) === '{"a":{"b":2,"c":3},"z":1}'.
    - snapshot.test (existing): all current `serializeSnapshot` tests in packages/execution still pass after the import-only refactor.
  </behavior>
  <action>
    1. Create `packages/artifacts/src/canonical-json.ts`:
       - Copy the `sortJsonValue` function body verbatim from `packages/execution/src/snapshot.ts:69`.
       - Add `export` keyword.
       - Add a JSDoc comment: `/** Recursively sorts object keys; arrays preserve order; primitives unchanged. Used for byte-stable JSON output across factory-cli stdout (Q-12) and packages/execution snapshot serialization. */`
    2. Create `packages/artifacts/src/canonical-json.test.ts` covering the cases in `<behavior>` above, using `node:test` + `node:assert/strict`.
    3. Update `packages/artifacts/src/index.ts` to re-export from canonical-json: `export { sortJsonValue } from "./canonical-json.js";`.
    4. Update `packages/artifacts/package.json`:
       - Add subpath export: `"./canonical-json": { "types": "./dist/canonical-json.d.ts", "import": "./dist/canonical-json.js" }`.
       - Keep the existing `"."` export intact.
    5. Update `packages/execution/src/snapshot.ts`:
       - Remove the local `function sortJsonValue` definition.
       - Add `import { sortJsonValue } from "@protostar/artifacts/canonical-json";` at the top.
       - All callers (specifically `serializeSnapshot` at line 10) continue to call `sortJsonValue(...)` unchanged.
       - Other exports (`reduceJournalToSnapshot`, `serializeSnapshot`) MUST keep their public signatures and behavior.
    6. Update `packages/execution/package.json` `dependencies`:
       - If `@protostar/artifacts` is not already listed, add `"@protostar/artifacts": "workspace:*"`.
    7. Update `packages/execution/tsconfig.json` `references` array to include `{ "path": "../artifacts/tsconfig.build.json" }` if not already present.
    8. Run `pnpm install`, `pnpm --filter @protostar/artifacts build && pnpm --filter @protostar/artifacts test`, `pnpm --filter @protostar/execution build && pnpm --filter @protostar/execution test`, and `pnpm run verify`.
    9. Add a regression test to packages/artifacts/src/canonical-json.test.ts that round-trips a fixture deep-equal to a known serializeSnapshot output to lock byte-equality across the lift.
  </action>
  <verify>
    <automated>pnpm install && pnpm --filter @protostar/artifacts build && pnpm --filter @protostar/artifacts test && pnpm --filter @protostar/execution build && pnpm --filter @protostar/execution test</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c 'export function sortJsonValue' packages/artifacts/src/canonical-json.ts` is 1
    - `grep -c '\bfunction sortJsonValue\b' packages/execution/src/snapshot.ts | grep -v '^#'` is 0 (no local definition remains)
    - `grep -c 'from "@protostar/artifacts/canonical-json"' packages/execution/src/snapshot.ts` is 1
    - `grep -c '"./canonical-json"' packages/artifacts/package.json` is 1
    - `grep -c '"@protostar/artifacts"' packages/execution/package.json` is at least 1
    - `pnpm --filter @protostar/artifacts test` exits 0
    - `pnpm --filter @protostar/execution test` exits 0
    - `pnpm run verify` exits 0
  </acceptance_criteria>
  <done>sortJsonValue lifted; execution re-imports without behavior change; subpath export available for Plan 09-01 io.ts and Plan 09-11 admission-e2e contract test.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Cross-package canonical JSON | Single source of truth; divergent canonicalizers across packages would silently break byte-stability |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-09-02-01 | Tampering | sortJsonValue divergence | mitigate | Single export from artifacts; execution re-imports; admission-e2e contract test (Plan 09-11) round-trips through writeStdoutJson + sortJsonValue and asserts idempotency. |
| T-09-02-02 | Information Disclosure | snapshot byte-equality regression | mitigate | Existing serializeSnapshot tests + new round-trip test guard against drift. |
</threat_model>

<verification>
- `pnpm --filter @protostar/artifacts test` clean
- `pnpm --filter @protostar/execution test` clean (no Phase 4 regression)
- `pnpm run verify` clean
</verification>

<success_criteria>
- New canonical-json module exported with subpath
- Execution snapshot.ts uses the lifted helper without behavior change
- Round-trip + idempotency contract tests green
</success_criteria>

<output>
Create `.planning/phases/09-operator-surface-resumability/09-02-SUMMARY.md` summarizing the lift, the subpath export, and the byte-equality verification of serializeSnapshot.
</output>
