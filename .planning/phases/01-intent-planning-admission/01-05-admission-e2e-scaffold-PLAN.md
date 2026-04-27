---
phase: 01-intent-planning-admission
plan: 05
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/admission-e2e/package.json
  - packages/admission-e2e/tsconfig.json
  - packages/admission-e2e/src/index.ts
  - packages/admission-e2e/src/scaffold.test.ts
  - tsconfig.json
  - tsconfig.base.json
autonomous: true
requirements:
  - INTENT-03
must_haves:
  truths:
    - "Test-only workspace package packages/admission-e2e/ exists with the canonical pnpm run build && node --test dist/*.test.js script (Q-09)"
    - "Package depends on @protostar/intent, @protostar/policy, @protostar/planning, @protostar/execution via workspace:*"
    - "Package is auto-included in pnpm -r test (Plan 01's verify:full picks it up)"
    - "Smoke test builds and runs green (real cross-package contracts arrive in Plans 09 / 06 / 07)"
    - "Zero filesystem authority: no node:fs / child_process imports in src/ outside test runner integration (Authority boundary lock)"
  artifacts:
    - path: packages/admission-e2e/package.json
      provides: "Test-only cross-package contract workspace"
      contains: "@protostar/admission-e2e"
    - path: packages/admission-e2e/src/scaffold.test.ts
      provides: "Smoke test proving the workspace builds and runs"
  key_links:
    - from: packages/admission-e2e/package.json
      to: "@protostar/intent, @protostar/policy, @protostar/planning, @protostar/execution"
      via: "workspace:* dependencies"
      pattern: "workspace:"
---

<objective>
Stand up packages/admission-e2e/ — the new test-only workspace package that hosts cross-cutting admission contracts (AC normalization deep-equal in Plan 09, future Phase 2 capability handoff, future Phase 3 repo-scope handoff). Per CONTEXT.md Q-09 this prevents factory-cli tests from becoming the integration catch-all.

Purpose: Provide the home for cross-package contracts before Plans 06 / 07 / 09 need it. Establishing it in Wave 1 lets later waves drop tests in without scaffolding overhead.

Output: New workspace package, builds clean, pnpm -r test picks it up, smoke test proves the runner works.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/phases/01-intent-planning-admission/01-CONTEXT.md
@.planning/codebase/CONVENTIONS.md
@.planning/codebase/TESTING.md
@.planning/codebase/STRUCTURE.md
@packages/intent/package.json
@packages/intent/tsconfig.json
@tsconfig.base.json
@tsconfig.json
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Create the @protostar/admission-e2e workspace package</name>
  <read_first>
    - /Users/zakkeown/Code/protostar/packages/intent/package.json (canonical workspace package shape)
    - /Users/zakkeown/Code/protostar/packages/intent/tsconfig.json (canonical per-package tsconfig)
    - /Users/zakkeown/Code/protostar/packages/intent/src/intent-ambiguity-scoring.test.ts (canonical test file shape: describe/it, assert.deepEqual, fixtures at bottom)
    - /Users/zakkeown/Code/protostar/.planning/codebase/CONVENTIONS.md (ESM .js suffix, readonly, kebab-case)
    - /Users/zakkeown/Code/protostar/.planning/codebase/TESTING.md (build-then-run flow)
    - /Users/zakkeown/Code/protostar/tsconfig.base.json (paths block — must add @protostar/admission-e2e)
    - /Users/zakkeown/Code/protostar/tsconfig.json (root references — must add new package)
  </read_first>
  <behavior>
    - pnpm --filter @protostar/admission-e2e build succeeds
    - pnpm --filter @protostar/admission-e2e test passes (smoke test runs)
    - pnpm -r test includes the new package (it has a test script)
    - Package depends on intent/policy/planning/execution via workspace:*
  </behavior>
  <action>
    1. Create packages/admission-e2e/package.json. Required fields (verbatim values where shown):
       - name: "@protostar/admission-e2e"
       - version: "0.0.0"
       - private: true
       - type: "module"
       - main: "./dist/index.js"
       - types: "./dist/index.d.ts"
       - exports: { ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" } }
       - scripts: { "build": "tsc -b", "test": "pnpm run build && node --test dist/*.test.js", "typecheck": "tsc -b --pretty false" }
       - dependencies: { "@protostar/intent": "workspace:*", "@protostar/policy": "workspace:*", "@protostar/planning": "workspace:*", "@protostar/execution": "workspace:*" }
       - sideEffects: false

    2. Create packages/admission-e2e/tsconfig.json mirroring packages/intent/tsconfig.json. Required:
       - extends: "../../tsconfig.base.json"
       - compilerOptions: { rootDir: "src", outDir: "dist", composite: true, types: ["node"] }
       - include: ["src/**/*.ts"]
       - references: [ { "path": "../intent" }, { "path": "../policy" }, { "path": "../planning" }, { "path": "../execution" } ]

    3. Create packages/admission-e2e/src/index.ts with a minimal barrel exporting one constant. Exact body:
         export const ADMISSION_E2E_PACKAGE_NAME = "@protostar/admission-e2e" as const;

    4. Create packages/admission-e2e/src/scaffold.test.ts as the smoke test. Use the canonical test shape: import assert from node:assert/strict; import describe + it from node:test; import the constant; assert it equals the literal "@protostar/admission-e2e".

    5. In tsconfig.base.json, add to the paths block:
         "@protostar/admission-e2e": ["./packages/admission-e2e/src/index.ts"]
       Mirror the entry pattern used for "@protostar/intent".

    6. In root tsconfig.json, add { "path": "packages/admission-e2e" } to the references array.

    7. pnpm-workspace.yaml already covers packages/* — no edit needed.

    8. Run pnpm install from repo root to register the new workspace; the lockfile will pick up its workspace links.

    Authority boundary: scaffold.test.ts and src/index.ts MUST NOT import node:fs, node:child_process, or any workspace I/O. This is a contract test home, not a runner. Plan 09 will introduce path-discovery via node:fs only inside its test files.
  </action>
  <verify>
    <automated>cd /Users/zakkeown/Code/protostar && pnpm install && pnpm --filter @protostar/admission-e2e build && pnpm --filter @protostar/admission-e2e test</automated>
  </verify>
  <acceptance_criteria>
    - ls packages/admission-e2e/package.json packages/admission-e2e/tsconfig.json packages/admission-e2e/src/index.ts packages/admission-e2e/src/scaffold.test.ts all exist.
    - node -e "console.log(require('./packages/admission-e2e/package.json').name)" prints "@protostar/admission-e2e".
    - node -e "const p=require('./packages/admission-e2e/package.json'); for(const k of ['@protostar/intent','@protostar/policy','@protostar/planning','@protostar/execution']) if(p.dependencies[k]!=='workspace:*') process.exit(1)" exits 0.
    - grep -c "@protostar/admission-e2e" tsconfig.base.json is at least 1.
    - grep -c "packages/admission-e2e" tsconfig.json is at least 1.
    - pnpm --filter @protostar/admission-e2e build exits 0.
    - pnpm --filter @protostar/admission-e2e test exits 0.
    - grep -rE "node:fs|node:child_process|require\\([\\'\"]fs[\\'\"]\\)" packages/admission-e2e/src 2>/dev/null | grep -v dist | wc -l is 0.
  </acceptance_criteria>
  <done>New workspace builds, smoke test passes, no I/O imports in src/.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| admission-e2e package boundary ↔ rest of monorepo | Test-only package; must not gain authority creep |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-01-05-01 | Elevation of Privilege | admission-e2e package | mitigate | Authority boundary grep gate (no node:fs / child_process imports in src/) verified by Task 1 acceptance |
| T-01-05-02 | Spoofing | Test runner discovering the new package | mitigate | pnpm -r test recursion + presence of "test" script + scaffold smoke test ensures the package is actually exercised, not silently skipped |
</threat_model>

<verification>
- packages/admission-e2e builds and tests green.
- Workspace registered in pnpm-workspace coverage and tsconfig references.
- No I/O imports in src/.
</verification>

<success_criteria>
The cross-package contract home exists. Plan 09 can drop a parameterized e2e test in. Plan 06 can extend public-split-exports contracts here. Future Phase 2/3 cross-stage contracts have a destination.
</success_criteria>

<output>
After completion, create .planning/phases/01-intent-planning-admission/01-05-SUMMARY.md noting the package's location, the four workspace deps wired, and the empty-contract-test list (Plans 06/07/09 will populate).
</output>
