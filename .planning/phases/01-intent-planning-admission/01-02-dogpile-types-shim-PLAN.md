---
phase: 01-intent-planning-admission
plan: 02
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/dogpile-types/package.json
  - packages/dogpile-types/tsconfig.json
  - packages/dogpile-types/src/index.ts
  - packages/dogpile-adapter/package.json
  - packages/dogpile-adapter/src/index.ts
  - tsconfig.json
  - tsconfig.base.json
  - pnpm-lock.yaml
autonomous: true
requirements:
  - PLAN-A-03
must_haves:
  truths:
    - "`pnpm install --frozen-lockfile` succeeds on a fresh-clone machine with no sibling `dogpile/` directory"
    - "`packages/dogpile-adapter` no longer depends on `@dogpile/sdk` via a sibling-repo `link:` path"
    - "The minimal Dogpile surface used by Phase 1 (`AgentSpec`, `DogpileOptions`, `budget`, `convergence`, `firstOf`) is owned in-tree as `@protostar/dogpile-types`"
    - "`dogpile-adapter` retains zero filesystem authority (Authority boundary lock)"
  artifacts:
    - path: packages/dogpile-types/package.json
      provides: "In-tree type/runtime shim for the Dogpile SDK surface used by Phase 1"
      contains: "@protostar/dogpile-types"
    - path: packages/dogpile-types/src/index.ts
      provides: "Type definitions and minimal runtime helpers consumed by dogpile-adapter"
    - path: packages/dogpile-adapter/package.json
      provides: "Adapter dependency now points at workspace `@protostar/dogpile-types`, not sibling-repo link"
      contains: "@protostar/dogpile-types"
  key_links:
    - from: packages/dogpile-adapter/src/index.ts
      to: "@protostar/dogpile-types"
      via: "ESM import with .js extension"
      pattern: "from \"@protostar/dogpile-types"
---

<objective>
Resolve the `@dogpile/sdk` `link:../../../dogpile` sibling-repo dependency that breaks `pnpm install` on any fresh clone. This is a hard blocker for Phase 1's CI workflow (Plan 10 / Q-12) — `pnpm install --frozen-lockfile` in GH Actions has no sibling repo to link to. The chosen approach (per CONCERNS.md and CONTEXT.md `<specifics>`) is to vendor the minimal surface as a workspace package `packages/dogpile-types`. Phase 6 will revisit when `@dogpile/sdk` is published or vendored fully.

Purpose: Unblock CI; preserve `dogpile-adapter`'s zero-I/O posture; preserve all existing Phase 1 admission semantics (the adapter only re-exports planning candidate parsers today — no real pile invocation until Phase 6).

Output: New `packages/dogpile-types` workspace, `dogpile-adapter` rewired to consume it, sibling `link:` removed.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/codebase/CONCERNS.md
@.planning/codebase/STRUCTURE.md
@.planning/codebase/CONVENTIONS.md
@packages/dogpile-adapter/package.json
@packages/dogpile-adapter/src/index.ts
@tsconfig.base.json
@tsconfig.json
@pnpm-workspace.yaml
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Create `packages/dogpile-types` workspace with minimal vendored surface</name>
  <read_first>
    - /Users/zakkeown/Code/protostar/packages/dogpile-adapter/src/index.ts (every symbol it imports from `@dogpile/sdk` — these define the minimal surface to vendor)
    - /Users/zakkeown/Code/protostar/packages/intent/package.json (canonical shape for a workspace package: name, type, exports, scripts, sideEffects, devDeps)
    - /Users/zakkeown/Code/protostar/packages/intent/tsconfig.json (canonical per-package tsconfig: rootDir/outDir, composite, references)
    - /Users/zakkeown/Code/protostar/tsconfig.base.json (paths block — must add `@protostar/dogpile-types` alias)
    - /Users/zakkeown/Code/protostar/tsconfig.json (root project references — must add the new package)
    - /Users/zakkeown/Code/protostar/.planning/codebase/CONVENTIONS.md (ESM `.js` import suffixes, `readonly`, kebab-case files, `as const satisfies`)
  </read_first>
  <behavior>
    - Test: `import { ... } from "@protostar/dogpile-types"` resolves the symbols `dogpile-adapter` actually imports today (grep `from "@dogpile/sdk"` in `packages/dogpile-adapter/src/index.ts` to enumerate)
    - Test: types match the shape `dogpile-adapter` consumes (existing `dogpile-adapter` build passes after rewire — see Task 2)
    - Test: package has `sideEffects: false` and zero runtime dependencies (Authority boundary preserved)
  </behavior>
  <action>
    Create the new workspace package:

    1. `packages/dogpile-types/package.json`:
       ```json
       {
         "name": "@protostar/dogpile-types",
         "version": "0.0.0",
         "private": true,
         "type": "module",
         "main": "./dist/index.js",
         "types": "./dist/index.d.ts",
         "exports": {
           ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" }
         },
         "scripts": {
           "build": "tsc -b",
           "test": "pnpm run build && node --test dist/*.test.js",
           "typecheck": "tsc -b --pretty false"
         },
         "sideEffects": false
       }
       ```

    2. `packages/dogpile-types/tsconfig.json`: copy the shape of `packages/intent/tsconfig.json` (composite, rootDir=src, outDir=dist, no project references needed — this package depends on nothing).

    3. `packages/dogpile-types/src/index.ts`: vendor the EXACT minimal surface that `packages/dogpile-adapter/src/index.ts` imports from `@dogpile/sdk`. Determine that surface by grepping; CONTEXT.md `<specifics>` lists `AgentSpec`, `DogpileOptions`, `budget`, `convergence`, `firstOf` as the expected baseline. Implement:
       - All TYPES as `readonly` interfaces / `as const satisfies` patterns per CONVENTIONS.md
       - Any RUNTIME helpers (`budget`, `convergence`, `firstOf`) as pure functions returning `readonly` objects — NO filesystem, no network, no `process.*`. Authority boundary lock: this package must never do I/O.
       - If a symbol's behavior is non-trivial and not derivable from `dogpile-adapter` usage, vendor a minimal type-only stub plus a runtime function whose body is `return { /* shape that satisfies adapter callers */ }`. The actual Dogpile pile is not invoked in Phase 1 (per CONTEXT.md: planning piles are out of scope until Phase 6).

    4. Add a single smoke test `packages/dogpile-types/src/index.test.ts` that imports every public symbol and asserts each is defined (mirrors the `public-split-exports.contract.test.ts` style in `packages/intent`).

    5. Add `@protostar/dogpile-types` to `tsconfig.base.json` `paths` (mirroring the entry pattern used for `@protostar/intent`).

    6. Add `{ "path": "packages/dogpile-types" }` to root `tsconfig.json` `references` array.

    7. `pnpm-workspace.yaml` already covers `packages/*` — no edit needed.
  </action>
  <verify>
    <automated>cd /Users/zakkeown/Code/protostar && pnpm --filter @protostar/dogpile-types build && pnpm --filter @protostar/dogpile-types test</automated>
  </verify>
  <acceptance_criteria>
    - `ls packages/dogpile-types/package.json packages/dogpile-types/src/index.ts packages/dogpile-types/tsconfig.json` all exist.
    - `node -e "console.log(require('./packages/dogpile-types/package.json').name)"` prints `@protostar/dogpile-types`.
    - `grep -c '"sideEffects": false' packages/dogpile-types/package.json` is `1`.
    - `grep -c "@protostar/dogpile-types" tsconfig.base.json` is at least `1` (paths entry).
    - `grep -c "packages/dogpile-types" tsconfig.json` is at least `1` (references entry).
    - `pnpm --filter @protostar/dogpile-types build` exits 0.
    - The smoke test in `packages/dogpile-types/src/index.test.ts` passes (`node --test dist/*.test.js` exits 0).
    - `grep -E "process\.|fs\.|child_process|require\(['\"](fs|path|child_process)" packages/dogpile-types/src/*.ts | grep -v '^#' | wc -l` is `0` (Authority boundary).
  </acceptance_criteria>
  <done>New workspace builds, tests pass, no I/O imports present.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Rewire `dogpile-adapter` to consume `@protostar/dogpile-types`; remove sibling link</name>
  <read_first>
    - /Users/zakkeown/Code/protostar/packages/dogpile-adapter/package.json (the `"@dogpile/sdk": "link:../../../dogpile"` line is the target)
    - /Users/zakkeown/Code/protostar/packages/dogpile-adapter/src/index.ts (every `from "@dogpile/sdk"` import — must change to `from "@protostar/dogpile-types"`)
    - /Users/zakkeown/Code/protostar/packages/dogpile-adapter/src/public-candidate-plan.contract.test.ts (existing contract — must still pass after rewire)
    - /Users/zakkeown/Code/protostar/packages/dogpile-types/src/index.ts (just created — confirm every symbol the adapter needs is exported)
  </read_first>
  <behavior>
    - Test: `dogpile-adapter`'s existing `*.test.ts` files still pass after the import swap
    - Test: `pnpm install --frozen-lockfile` (or `--no-frozen-lockfile` since lock will change) succeeds when run from a directory tree with NO sibling `dogpile/` repo present
    - Test: no remaining reference to `@dogpile/sdk` or `link:../../../dogpile` exists in `packages/dogpile-adapter/`
  </behavior>
  <action>
    1. In `packages/dogpile-adapter/package.json`:
       - Remove the `"@dogpile/sdk": "link:../../../dogpile"` line entirely.
       - Add `"@protostar/dogpile-types": "workspace:*"` to `dependencies`.

    2. In `packages/dogpile-adapter/src/index.ts` (and any sibling `*.ts` under `src/`): replace every `from "@dogpile/sdk"` with `from "@protostar/dogpile-types"`. Preserve `.js` suffix discipline NOT for cross-package imports (per CONVENTIONS.md, cross-package imports use the bare alias without `.js`).

    3. Run `pnpm install` from repo root to regenerate `pnpm-lock.yaml`. The new lock will no longer contain the sibling link.

    4. Run `pnpm --filter @protostar/dogpile-adapter build && pnpm --filter @protostar/dogpile-adapter test` to confirm the rewire compiles and existing contract tests still pass (notably `public-candidate-plan.contract.test.ts`).

    5. If any `@dogpile/sdk` symbol consumed by adapter is missing from the shim, ADD it to `packages/dogpile-types/src/index.ts` (Task 1) — do not partially rewire. Re-run Task 1's verify after each addition.
  </action>
  <verify>
    <automated>cd /Users/zakkeown/Code/protostar && grep -rn "@dogpile/sdk\|link:\.\./\.\./\.\./dogpile" packages/dogpile-adapter | grep -v '^#' | grep -v node_modules | grep -v dist; test $? -eq 1 && pnpm --filter @protostar/dogpile-adapter build && pnpm --filter @protostar/dogpile-adapter test</automated>
  </verify>
  <acceptance_criteria>
    - `grep -rn "@dogpile/sdk" packages/dogpile-adapter --include='*.ts' --include='*.json' | grep -v dist | grep -v node_modules | wc -l` is `0`.
    - `grep -c "link:\.\./\.\./\.\./dogpile" packages/dogpile-adapter/package.json` is `0`.
    - `grep -c '"@protostar/dogpile-types"' packages/dogpile-adapter/package.json` is `1`.
    - `pnpm --filter @protostar/dogpile-adapter build` exits 0.
    - `pnpm --filter @protostar/dogpile-adapter test` exits 0 (pre-existing tests including `public-candidate-plan.contract.test.ts` still pass).
    - `pnpm-lock.yaml` no longer contains a path resolution to `../../../dogpile` (`grep -c '\.\./\.\./\.\./dogpile' pnpm-lock.yaml` is `0`).
  </acceptance_criteria>
  <done>Adapter compiles and tests pass against the in-tree shim; sibling link removed from manifest and lockfile.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| dogpile-types ↔ dogpile-adapter | Type-only / pure-runtime boundary; no untrusted input crosses |
| repo-clone ↔ pnpm install | CI cloning the repo without sibling layout |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-01-02-01 | Tampering | `packages/dogpile-types` runtime helpers | mitigate | Helpers are pure functions returning frozen objects; `sideEffects: false`; no I/O imports verifiable by grep gate |
| T-01-02-02 | Denial of Service | Fresh-clone CI machine | mitigate | Removing `link:../../../dogpile` makes `pnpm install --frozen-lockfile` deterministic on machines with no sibling repo |
| T-01-02-03 | Elevation of Privilege | dogpile-adapter Authority boundary | mitigate | Shim contains zero filesystem/network imports — adapter cannot accidentally inherit I/O capability through the shim (grep gate in T1 acceptance) |
</threat_model>

<verification>
- New workspace builds + tests pass.
- Adapter no longer references `@dogpile/sdk` or sibling link.
- `pnpm-lock.yaml` is regenerated and clean.
- Authority boundary preserved (no I/O imports in shim).
</verification>

<success_criteria>
On a fresh clone with no sibling `dogpile/` directory, `pnpm install` succeeds and `pnpm --filter @protostar/dogpile-adapter test` passes. This unblocks Plan 10's CI workflow.
</success_criteria>

<output>
After completion, create `.planning/phases/01-intent-planning-admission/01-02-SUMMARY.md` listing every symbol vendored into the shim (so Phase 6 knows what to expand or replace) and confirming the lockfile no longer references the sibling repo.
</output>
