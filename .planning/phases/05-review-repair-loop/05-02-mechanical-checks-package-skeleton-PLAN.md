---
phase: 05-review-repair-loop
plan: 02
type: execute
wave: 0
depends_on: []
files_modified:
  - packages/mechanical-checks/package.json
  - packages/mechanical-checks/tsconfig.json
  - packages/mechanical-checks/src/index.ts
  - pnpm-workspace.yaml
  - tsconfig.json
autonomous: true
requirements: [LOOP-01]
must_haves:
  truths:
    - "`@protostar/mechanical-checks` workspace exists, builds, and is reachable from `pnpm run verify`"
    - "Package depends on `@protostar/execution` (adapter contract) and `@protostar/repo` (subprocess runner) — these are its only consumers"
    - "Empty `createMechanicalChecksAdapter` placeholder export compiles"
  artifacts:
    - path: packages/mechanical-checks/package.json
      provides: "workspace manifest naming `@protostar/mechanical-checks`"
    - path: packages/mechanical-checks/src/index.ts
      provides: "placeholder export of createMechanicalChecksAdapter symbol (TODO body)"
  key_links:
    - from: tsconfig.json
      to: packages/mechanical-checks
      via: "project references"
      pattern: "\"path\": \"packages/mechanical-checks\""
---

<objective>
Stand up `@protostar/mechanical-checks`: a single-purpose subprocess-driven adapter package (Q-07). Skeleton only — adapter implementation lands in Plan 05-07 once Phase 4's adapter contract types are stable.

Purpose: Decouple mechanical command execution (build/lint/typecheck) from the review verdict logic; review stays a pure inspector. Establish boundary at Wave 0.
Output: New workspace registered with pnpm + TypeScript project references; verify scripts pass.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/05-review-repair-loop/05-CONTEXT.md
@AGENTS.md
@packages/lmstudio-adapter/package.json
@packages/lmstudio-adapter/tsconfig.json
@pnpm-workspace.yaml
@tsconfig.json

Structural template: `packages/lmstudio-adapter` is the closest sibling — also an adapter package (Phase 4) that consumes Phase 3 subprocess runner. Mirror its `package.json` exactly.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Scaffold @protostar/mechanical-checks workspace</name>
  <files>packages/mechanical-checks/package.json, packages/mechanical-checks/tsconfig.json, packages/mechanical-checks/src/index.ts</files>
  <read_first>
    - packages/lmstudio-adapter/package.json (sibling adapter template)
    - packages/lmstudio-adapter/tsconfig.json
    - .planning/phases/05-review-repair-loop/05-CONTEXT.md §Q-07 ("New workspace `packages/mechanical-checks/`. Exports `createMechanicalChecksAdapter(config): ExecutionAdapter`...")
    - AGENTS.md (single-purpose package rule)
  </read_first>
  <action>
Create `packages/mechanical-checks/package.json` literal content:
```json
{
  "name": "@protostar/mechanical-checks",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" }
  },
  "scripts": {
    "build": "tsc -b",
    "test": "node --test dist/**/*.test.js",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "@protostar/execution": "workspace:*",
    "@protostar/repo": "workspace:*",
    "@protostar/intent": "workspace:*",
    "@protostar/review": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^6.0.3"
  }
}
```

Create `packages/mechanical-checks/tsconfig.json` extending repo `tsconfig.base.json`. `references`: `[{ "path": "../execution" }, { "path": "../repo" }, { "path": "../intent" }, { "path": "../review" }]`. `composite: true`, `outDir: "./dist"`, `rootDir: "./src"`.

Create `packages/mechanical-checks/src/index.ts`:
```ts
// Phase 5 Plan 05-07 lands the real createMechanicalChecksAdapter implementation.
// This skeleton exists so downstream Wave 2 plans can register imports.
export const __MECHANICAL_CHECKS_PACKAGE_SKELETON__ = true as const;
```

This package is the ONE place outside `apps/factory-cli` and `packages/repo` permitted to invoke subprocesses — and even then, only via Phase 3's `repoSubprocessRunner` (which lives in `packages/repo`). Document this in a leading comment in `index.ts` once the adapter is implemented (Plan 05-07).
  </action>
  <verify>
    <automated>cd /Users/zakkeown/Code/protostar && pnpm install --filter @protostar/mechanical-checks... 2>&1 | tail -5 && pnpm --filter @protostar/mechanical-checks build 2>&1 | tail -5 && grep -c '"name": "@protostar/mechanical-checks"' packages/mechanical-checks/package.json</automated>
  </verify>
  <acceptance_criteria>
    - `packages/mechanical-checks/package.json` contains `"name": "@protostar/mechanical-checks"`
    - `packages/mechanical-checks/package.json` contains `"@protostar/execution": "workspace:*"` and `"@protostar/repo": "workspace:*"`
    - `pnpm --filter @protostar/mechanical-checks build` exits 0
  </acceptance_criteria>
  <done>Package compiles; Wave 2 (Plan 05-07) can implement adapter against frozen contract.</done>
</task>

<task type="auto">
  <name>Task 2: Register workspace + project references</name>
  <files>pnpm-workspace.yaml, tsconfig.json</files>
  <read_first>
    - pnpm-workspace.yaml
    - tsconfig.json
    - .planning/phases/05-review-repair-loop/05-01-repair-package-skeleton-PLAN.md (sibling registration pattern — same wave, different package)
  </read_first>
  <action>
Add `packages/mechanical-checks` to `pnpm-workspace.yaml` `packages:` list (alphabetical placement matching existing convention).
Add `{ "path": "packages/mechanical-checks" }` to root `tsconfig.json` `references` array.

Note: Plan 05-01 also modifies `pnpm-workspace.yaml` and `tsconfig.json`. Those are same-wave parallel — file overlap means execute-phase will sequence them. Wave coordinator can either (a) merge both registrations in a single edit pass at wave boundary, or (b) run 05-01 then 05-02 with each appending its line. Both work because the additions are non-conflicting line insertions.
  </action>
  <verify>
    <automated>cd /Users/zakkeown/Code/protostar && grep -c 'packages/mechanical-checks' pnpm-workspace.yaml && grep -c '"path": "packages/mechanical-checks"' tsconfig.json && pnpm install 2>&1 | tail -3</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c 'packages/mechanical-checks' pnpm-workspace.yaml` ≥ 1
    - `grep -c '"path": "packages/mechanical-checks"' tsconfig.json` ≥ 1
    - `pnpm install` resolves
  </acceptance_criteria>
  <done>`@protostar/mechanical-checks` is part of the verify graph.</done>
</task>

</tasks>

<threat_model>
| Boundary | Description |
|----------|-------------|
| `@protostar/mechanical-checks` ↔ filesystem (via `packages/repo` subprocess runner) | only authorized subprocess path is the Phase 3 runner |

| Threat ID | Category | Component | Disposition | Mitigation |
|-----------|----------|-----------|-------------|------------|
| T-05-03 | Elevation of Privilege | adapter shells out directly | mitigate | adapter MUST consume `repoSubprocessRunner` from `@protostar/repo`; Plan 05-07 enforces; this skeleton has no implementation to violate yet |
</threat_model>

<verification>
- `pnpm install` resolves cleanly
- `pnpm --filter @protostar/mechanical-checks build` produces `dist/index.js`
</verification>

<success_criteria>
- New `packages/mechanical-checks/` workspace registered, builds, and is verified by root scripts
</success_criteria>

<output>
Create `.planning/phases/05-review-repair-loop/05-02-SUMMARY.md`: lists the new package, dependency declarations, and notes that the adapter implementation lands in Plan 05-07.
</output>
</content>
</invoke>