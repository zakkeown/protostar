---
phase: 08-evaluation-evolution
plan: 01
type: execute
wave: 0
depends_on: []
files_modified:
  - packages/evaluation-runner/package.json
  - packages/evaluation-runner/tsconfig.json
  - packages/evaluation-runner/tsconfig.build.json
  - packages/evaluation-runner/src/index.ts
  - packages/evaluation-runner/src/index.test.ts
  - pnpm-workspace.yaml
  - tsconfig.json
  - package.json
autonomous: true
requirements: []
must_haves:
  truths:
    - "Skeleton-only plan: this plan ships NO functionality; all listed Phase 8 requirements (EVAL-01..EVAL-04, EVOL-01..EVOL-03) are delivered by other plans (functional landings happen in 08-02 through 08-08; this plan only unblocks Wave 4 typing per Q-20)."
    - "@protostar/evaluation-runner workspace package exists and `pnpm install` succeeds"
    - "Package builds with `pnpm --filter @protostar/evaluation-runner build` against TS 6 strict + ESM NodeNext"
    - "Root tsconfig project references include the new package"
    - "Root verify pipeline includes a `pnpm --filter @protostar/evaluation-runner test` zero-test hook (mirror Phase 5 Plan 01 pattern for @protostar/repair)"
  artifacts:
    - path: packages/evaluation-runner/package.json
      provides: "Workspace package manifest"
      contains: '"name": "@protostar/evaluation-runner"'
    - path: packages/evaluation-runner/src/index.ts
      provides: "Public surface skeleton (placeholder export of runEvaluationStages signature)"
      exports: ["runEvaluationStages"]
    - path: packages/evaluation-runner/tsconfig.json
      provides: "Strict TS config + project references to deps"
  key_links:
    - from: pnpm-workspace.yaml
      to: packages/evaluation-runner
      via: "Workspace member listing"
      pattern: "evaluation-runner"
    - from: tsconfig.json
      to: packages/evaluation-runner
      via: "Root project reference"
      pattern: "evaluation-runner"
---

<objective>
Stand up the new `@protostar/evaluation-runner` workspace package skeleton (Q-20). It is the network + injected-reader adapter that orchestrates the three-stage evaluation: it imports `@protostar/evaluation` (pure scoring), `@protostar/dogpile-adapter` (pile invocation), and the new injected `snapshotReader` capability. **MUST NOT** import `node:fs`, `node:fs/promises`, `fs`, `node:path`, or `path` (Q-20 + Phase 6 Q-09 authority boundary).

This plan only lands the skeleton (package.json, tsconfig, throwing placeholder export, workspace registration, root verify hook). Real `runEvaluationStages` lands in Wave 4 (Plan 08-06).

Purpose: Unblock Wave 4 typing without disturbing Wave 1–3 pure-type/helper landings. Mirrors Phase 5 Plan 05-01 (`@protostar/repair`) and Plan 05-02 (`@protostar/mechanical-checks`) skeleton pattern.
Output: New empty workspace, registered, building, zero-test green; ready for Plan 08-06 to fill in.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/08-evaluation-evolution/08-CONTEXT.md
@AGENTS.md

@packages/repair/package.json
@packages/mechanical-checks/package.json
@packages/dogpile-adapter/package.json
@pnpm-workspace.yaml

<interfaces>
<!-- Skeleton placeholder export (real signature lands in Plan 08-06). -->

```typescript
// packages/evaluation-runner/src/index.ts
export interface RunEvaluationStagesInput {
  // Real shape lands in Plan 08-06; placeholder accepts unknown to keep skeleton compilable.
  readonly runId: string;
}
export interface RunEvaluationStagesResult {
  readonly placeholder: true;
}

export async function runEvaluationStages(
  _input: RunEvaluationStagesInput
): Promise<RunEvaluationStagesResult> {
  throw new Error(
    "runEvaluationStages not yet wired (Phase 8 Plan 08-06 lands the real implementation)."
  );
}
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create @protostar/evaluation-runner package skeleton</name>
  <read_first>
    - packages/repair/package.json (Phase 5 Plan 01 template — copy exports, scripts, devDeps shape)
    - packages/repair/tsconfig.json (strict TS posture template)
    - packages/repair/tsconfig.build.json (build-only config template)
    - packages/mechanical-checks/package.json (second skeleton precedent)
    - packages/dogpile-adapter/package.json (network-only adapter precedent — copy `dependencies` shape)
    - .planning/phases/08-evaluation-evolution/08-CONTEXT.md (Q-20 — surface, no-fs invariant)
    - AGENTS.md (domain-first packaging — confirm "evaluation-runner" is a real domain, not a catch-all)
  </read_first>
  <files>packages/evaluation-runner/package.json, packages/evaluation-runner/tsconfig.json, packages/evaluation-runner/tsconfig.build.json, packages/evaluation-runner/src/index.ts, packages/evaluation-runner/src/index.test.ts</files>
  <action>
    1. Create `packages/evaluation-runner/package.json` with:
       - `"name": "@protostar/evaluation-runner"`
       - `"version": "0.0.0"`
       - `"type": "module"`
       - `"main": "./dist/index.js"`, `"types": "./dist/index.d.ts"`
       - `"exports": { ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" } }`
       - `"scripts": { "build": "tsc -b tsconfig.build.json", "test": "node --test --test-reporter=spec dist/**/*.test.js" }` — match exact Phase 5 repair script shape
       - `"dependencies"`: `"@protostar/evaluation": "workspace:*"`, `"@protostar/dogpile-adapter": "workspace:*"`, `"@protostar/dogpile-types": "workspace:*"`, `"@protostar/intent": "workspace:*"`, `"@protostar/planning": "workspace:*"`, `"@protostar/review": "workspace:*"`
       - **NO `dependencies` on `node:fs` etc.** Confirm by inspection.
       - `"devDependencies"`: `"typescript": "^5.6.0"` (match repair)
       - `"private": true`
    2. Create `packages/evaluation-runner/tsconfig.json` extending root `tsconfig.base.json` (or whatever base repair uses) with:
       - `compilerOptions.outDir`: `./dist`
       - `compilerOptions.rootDir`: `./src`
       - `compilerOptions.composite: true`
       - `references` listing each workspace dep with `{ "path": "../<dep>/tsconfig.build.json" }`
       - `include`: `["src/**/*"]`
    3. Create `packages/evaluation-runner/tsconfig.build.json` matching repair's build-config shape (typically excludes `*.test.ts`).
    4. Create `packages/evaluation-runner/src/index.ts` with the verbatim placeholder from `<interfaces>` above.
    5. Create `packages/evaluation-runner/src/index.test.ts` with a single `node:test` case asserting the placeholder throws:
       ```typescript
       import { describe, it } from "node:test";
       import assert from "node:assert/strict";
       import { runEvaluationStages } from "./index.js";

       describe("@protostar/evaluation-runner skeleton", () => {
         it("placeholder runEvaluationStages throws until Plan 08-06 wires it", async () => {
           await assert.rejects(
             () => runEvaluationStages({ runId: "test" }),
             /not yet wired/
           );
         });
       });
       ```
    6. Run `pnpm --filter @protostar/evaluation-runner build` — must succeed.
  </action>
  <verify>
    <automated>pnpm --filter @protostar/evaluation-runner build && pnpm --filter @protostar/evaluation-runner test</automated>
  </verify>
  <acceptance_criteria>
    - `test -f packages/evaluation-runner/package.json` returns 0
    - `grep -c '"name": "@protostar/evaluation-runner"' packages/evaluation-runner/package.json` is 1
    - `grep -c '"@protostar/evaluation"' packages/evaluation-runner/package.json` is 1
    - `grep -c '"@protostar/dogpile-adapter"' packages/evaluation-runner/package.json` is 1
    - `grep -rE '\bfrom ["'\'']node:fs|node:path|"fs"|"path"' packages/evaluation-runner/src/` returns zero matches (Q-20 invariant)
    - `pnpm --filter @protostar/evaluation-runner build` exits 0
    - `pnpm --filter @protostar/evaluation-runner test` exits 0 (placeholder rejection test passes)
  </acceptance_criteria>
  <done>Package skeleton compiles; placeholder test green; no-fs imports clean.</done>
</task>

<task type="auto">
  <name>Task 2: Register package in workspace + root TS references + root verify hook</name>
  <read_first>
    - pnpm-workspace.yaml (existing workspace member list — confirm format)
    - tsconfig.json (root project references list)
    - package.json (root scripts — locate the `verify` chain or per-package zero-test wiring; mirror what Phase 5 Plan 01 added for `@protostar/repair`)
    - .planning/phases/05-review-repair-loop/05-01-repair-package-skeleton-SUMMARY.md (if present, else 05-01-repair-package-skeleton-PLAN.md) — verify hook precedent
  </read_first>
  <files>pnpm-workspace.yaml, tsconfig.json, package.json</files>
  <action>
    1. Add `packages/evaluation-runner` to `pnpm-workspace.yaml` (alphabetical position; check if list is sorted).
    2. Add `{ "path": "packages/evaluation-runner" }` (or `tsconfig.build.json` form — match the repo convention; check what `packages/repair` uses) to root `tsconfig.json` `references` array.
    3. Run `pnpm install` to register the workspace.
    4. Locate the root `verify` script (likely `pnpm -r run build && pnpm -r run test` or similar). Confirm `pnpm -r run test` will pick up `@protostar/evaluation-runner` automatically via the workspace recursion (no manual edit needed if recursive). If verify chains test commands explicitly per package, append `&& pnpm --filter @protostar/evaluation-runner test`. Document choice in commit message.
    5. Run `pnpm run verify` from repo root — must pass (or surface only known-flake clusters explicitly listed in STATE.md, not new failures from this skeleton).
  </action>
  <verify>
    <automated>pnpm install && pnpm --filter @protostar/evaluation-runner build && pnpm --filter @protostar/evaluation-runner test</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c 'evaluation-runner' pnpm-workspace.yaml` is at least 1
    - `grep -c 'evaluation-runner' tsconfig.json` is at least 1
    - `pnpm install` exits 0
    - `pnpm --filter @protostar/evaluation-runner build` exits 0
    - `pnpm --filter @protostar/evaluation-runner test` exits 0
    - Repo-wide build (`pnpm -r build`) does not regress
  </acceptance_criteria>
  <done>Workspace + TS references registered; install + build green.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| dependency import surface | New package must not pull in `node:fs` to preserve authority boundary |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-08-01-01 | Elevation of Privilege | packages/evaluation-runner/src/* | mitigate | Plan 08-06 lands a static no-fs contract test. This skeleton plan greps for fs imports as the initial gate. |
| T-08-01-02 | Tampering | package.json `dependencies` | accept | Workspace deps are pinned; package is private (not published). |
</threat_model>

<verification>
- `pnpm install` clean
- `pnpm --filter @protostar/evaluation-runner build` clean
- `pnpm --filter @protostar/evaluation-runner test` clean
- No `node:fs` / `node:path` imports in new package src/
</verification>

<success_criteria>
- New `@protostar/evaluation-runner` workspace exists and builds
- Placeholder `runEvaluationStages` export throws "not yet wired"
- Root TS references + workspace registration land
- Zero-test hook + build hook green
</success_criteria>

<output>
Create `.planning/phases/08-evaluation-evolution/08-01-SUMMARY.md` summarizing the new workspace, its dependencies, and noting the no-fs invariant is contract-tested in Plan 08-06.
</output>
</output>
