---
phase: 05-review-repair-loop
plan: 01
type: execute
wave: 0
depends_on: []
files_modified:
  - packages/repair/package.json
  - packages/repair/tsconfig.json
  - packages/repair/src/index.ts
  - pnpm-workspace.yaml
  - tsconfig.json
  - package.json
autonomous: true
requirements: [LOOP-03]
must_haves:
  truths:
    - "`@protostar/repair` workspace exists, builds, and is reachable from `pnpm run verify`"
    - "Package depends on `@protostar/review` and `@protostar/planning`; no fs/network imports"
    - "Empty `synthesizeRepairPlan` placeholder export compiles (real impl lands in Plan 05-05)"
  artifacts:
    - path: packages/repair/package.json
      provides: "workspace manifest naming `@protostar/repair`, type module, dist build script"
    - path: packages/repair/src/index.ts
      provides: "placeholder export of synthesizeRepairPlan symbol (TODO body)"
    - path: pnpm-workspace.yaml
      provides: "registers packages/repair"
  key_links:
    - from: tsconfig.json
      to: packages/repair
      via: "project references"
      pattern: "\"path\": \"packages/repair\""
    - from: package.json
      to: packages/repair
      via: "verify script via pnpm -r"
      pattern: "pnpm.*-r.*test"
---

<objective>
Stand up `@protostar/repair`: a single-purpose, zero-fs, pure-transform package that will hold `synthesizeRepairPlan` (Q-05). This plan is skeleton only — real implementation lands in Plan 05-05 once the review-package types it depends on (Plan 05-04) exist.

Purpose: Establish the package boundary at Wave 0 so downstream waves can import from it; satisfy AGENTS.md domain-first single-purpose rule (no catch-all).
Output: New workspace registered with pnpm + TypeScript project references; empty exports; verify scripts pass.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/05-review-repair-loop/05-CONTEXT.md
@AGENTS.md
@packages/dogpile-adapter/package.json
@packages/dogpile-adapter/tsconfig.json
@pnpm-workspace.yaml
@tsconfig.json
@package.json

Structural template: `packages/dogpile-adapter` is the closest analog (pure-transform, zero-fs, depends on cross-package types). Mirror its `package.json`, `tsconfig.json`, and barrel layout exactly.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Scaffold @protostar/repair workspace</name>
  <files>packages/repair/package.json, packages/repair/tsconfig.json, packages/repair/src/index.ts</files>
  <read_first>
    - packages/dogpile-adapter/package.json (structural template — pure-transform sibling)
    - packages/dogpile-adapter/tsconfig.json
    - .planning/phases/05-review-repair-loop/05-CONTEXT.md §Q-05 ("New `@protostar/repair` package. Pure transform... Depends on `@protostar/review` ... `@protostar/planning`. No fs imports.")
    - AGENTS.md (single-purpose package rule)
  </read_first>
  <action>
Create `packages/repair/package.json` mirroring `packages/dogpile-adapter/package.json` with these literal field substitutions:
```json
{
  "name": "@protostar/repair",
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
    "@protostar/review": "workspace:*",
    "@protostar/planning": "workspace:*",
    "@protostar/intent": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^6.0.3"
  }
}
```
Create `packages/repair/tsconfig.json` extending the repo root `tsconfig.base.json` (same as dogpile-adapter). Include `"references": [{ "path": "../review" }, { "path": "../planning" }, { "path": "../intent" }]`. `"composite": true`, `"outDir": "./dist"`, `"rootDir": "./src"`.

Create `packages/repair/src/index.ts` with placeholder content:
```ts
// Phase 5 Plan 05-05 lands the real synthesizeRepairPlan implementation.
// This skeleton exists so downstream Wave 1 plans can register imports.
export const __REPAIR_PACKAGE_SKELETON__ = true as const;
```
No `node:fs`, no `node:net`, no `fetch` references — verify by grep.
  </action>
  <verify>
    <automated>cd /Users/zakkeown/Code/protostar && pnpm install --filter @protostar/repair... 2>&1 | tail -5 && pnpm --filter @protostar/repair build 2>&1 | tail -5 && grep -v '^[[:space:]]*//' packages/repair/src/index.ts | grep -cE 'node:fs|node:net|^import.*fetch'</automated>
  </verify>
  <acceptance_criteria>
    - `packages/repair/package.json` contains literal string `"name": "@protostar/repair"`
    - `packages/repair/package.json` contains `"@protostar/review": "workspace:*"` and `"@protostar/planning": "workspace:*"`
    - `packages/repair/tsconfig.json` contains `"composite": true`
    - `pnpm --filter @protostar/repair build` exits 0
    - `grep -cE 'node:fs|node:net' packages/repair/src/index.ts` returns 0 (filtered, comment-stripped)
  </acceptance_criteria>
  <done>Package compiles; downstream plans can import from `@protostar/repair`.</done>
</task>

<task type="auto">
  <name>Task 2: Register workspace + project references + verify hook</name>
  <files>pnpm-workspace.yaml, tsconfig.json, package.json</files>
  <read_first>
    - pnpm-workspace.yaml (current package list)
    - tsconfig.json (current `references` array)
    - package.json (current `verify` and `verify:full` scripts)
    - .planning/phases/05-review-repair-loop/05-CONTEXT.md "Specifics" §"Three-package shape for Phase 5"
  </read_first>
  <action>
Add `packages/repair` to `pnpm-workspace.yaml` `packages:` list (alphabetical by basename if existing list is alphabetical; otherwise append before `apps/*`). Literal addition:
```yaml
  - packages/repair
```

Add to root `tsconfig.json` `references` array:
```json
{ "path": "packages/repair" }
```
(Insert in alphabetical order if existing references are alphabetical; otherwise append before `apps/*` references.)

Verify scripts in root `package.json`: confirm `pnpm -r run test` and `pnpm -r run build` already cover the new package via `pnpm --filter '@protostar/*'`. If `verify` / `verify:full` scripts hardcode a package list, append `@protostar/repair`. (Phase 1 Plan 01 standardised on `pnpm -r` so this is usually a no-op — confirm by reading the script body.)
  </action>
  <verify>
    <automated>cd /Users/zakkeown/Code/protostar && grep -c 'packages/repair' pnpm-workspace.yaml && grep -c '"path": "packages/repair"' tsconfig.json && pnpm install 2>&1 | tail -3 && pnpm run verify 2>&1 | tail -10</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c 'packages/repair' pnpm-workspace.yaml` ≥ 1
    - `grep -c '"path": "packages/repair"' tsconfig.json` ≥ 1
    - `pnpm install` exits 0 (lockfile resolves)
    - `pnpm run verify` exits 0 (skeleton package included, has zero tests, doesn't break suite)
  </acceptance_criteria>
  <done>`@protostar/repair` is part of the verify graph and pnpm workspace.</done>
</task>

</tasks>

<threat_model>
| Boundary | Description |
|----------|-------------|
| `@protostar/repair` public surface ↔ Wave 1+ consumers | type drift = silent semantic break |

| Threat ID | Category | Component | Disposition | Mitigation |
|-----------|----------|-----------|-------------|------------|
| T-05-01 | Tampering | repair package fs imports | mitigate | Acceptance grep blocks `node:fs`/`node:net`; AGENTS.md authority boundary repeated in package README on Plan 05-05 |
| T-05-02 | Information Disclosure | repair package leaks plan internals | accept | pure-transform package; consumers vet exports at Plan 05-05 |
</threat_model>

<verification>
- `pnpm install` resolves cleanly
- `pnpm --filter @protostar/repair build` produces `dist/index.js`
- `pnpm run verify` exits 0
</verification>

<success_criteria>
- New `packages/repair/` workspace registered, builds, and is verified by root scripts
- Skeleton has no implementation — Plan 05-05 fills `synthesizeRepairPlan`
</success_criteria>

<output>
Create `.planning/phases/05-review-repair-loop/05-01-SUMMARY.md`: lists the new package, its dependency declarations, and notes that downstream plans depend on this Wave 0 skeleton existing.
</output>
</content>
</invoke>