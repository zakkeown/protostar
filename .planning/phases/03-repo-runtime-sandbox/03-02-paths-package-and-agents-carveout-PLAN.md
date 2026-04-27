---
phase: 03-repo-runtime-sandbox
plan: 02
type: execute
wave: 0
depends_on: [01]
files_modified:
  - packages/paths/package.json
  - packages/paths/tsconfig.json
  - packages/paths/src/index.ts
  - packages/paths/src/resolve-workspace-root.ts
  - packages/paths/src/resolve-workspace-root.test.ts
  - pnpm-workspace.yaml
  - tsconfig.base.json
  - AGENTS.md
autonomous: true
requirements: [REPO-07]
must_haves:
  truths:
    - "@protostar/paths package exists with a single export resolveWorkspaceRoot()"
    - "resolveWorkspaceRoot walks parent dirs to pnpm-workspace.yaml and throws when none found"
    - "AGENTS.md has a scope-ceiling carve-out clause naming @protostar/paths and forbidding I/O / business logic in it"
    - "Package builds and tests pass via pnpm --filter @protostar/paths test"
  artifacts:
    - path: "packages/paths/src/resolve-workspace-root.ts"
      provides: "Synchronous parent-dir walk to pnpm-workspace.yaml"
      exports: ["resolveWorkspaceRoot"]
    - path: "packages/paths/package.json"
      provides: "Zero-runtime-dep utility package skeleton"
    - path: "AGENTS.md"
      provides: "Scope-ceiling carve-out for @protostar/paths"
      contains: "@protostar/paths"
  key_links:
    - from: "packages/paths/src/index.ts"
      to: "packages/paths/src/resolve-workspace-root.ts"
      via: "barrel re-export"
      pattern: "export.*resolveWorkspaceRoot"
---

<objective>
Stand up the new `@protostar/paths` package per Q-15 (user-locked despite AGENTS.md "no generic utils" guidance). Single export: `resolveWorkspaceRoot(): string`. Add the AGENTS.md carve-out clause with a scope ceiling.

Purpose: Wave 3 needs to import `resolveWorkspaceRoot` from a real package to replace the broken `INIT_CWD ?? cwd()` at `apps/factory-cli/src/main.ts:172, 199`. Standing the package up alone in Wave 0 means Wave 1+ runtime plans (which depend on it transitively via `@protostar/repo`) don't block on a missing workspace dep.
Output: New package at `packages/paths/`, AGENTS.md carve-out, registered in `pnpm-workspace.yaml` and `tsconfig.base.json` references chain.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/03-repo-runtime-sandbox/03-CONTEXT.md
@.planning/phases/03-repo-runtime-sandbox/03-RESEARCH.md
@.planning/phases/03-repo-runtime-sandbox/03-PATTERNS.md
@AGENTS.md
@packages/dogpile-types/package.json
@packages/dogpile-types/tsconfig.json
@pnpm-workspace.yaml
@tsconfig.base.json

Q-15 lock: Q-15 carves out a `@protostar/paths` package against AGENTS.md
"avoid generic utils packages" guidance. **Scope ceiling:** path resolution
only. No I/O. No business logic. If it grows beyond `pnpm-workspace.yaml`
walking, split it.

Pattern source (from `03-PATTERNS.md`):
- Package skeleton analog: `packages/dogpile-types/package.json` (smallest in repo, zero workspace deps)
- `resolveWorkspaceRoot()` — synchronous, RESEARCH.md sketches the shape (lines 651-672 in 03-RESEARCH.md and lines 405-420 in 03-PATTERNS.md). Use `existsSync` (synchronous so consumers at `apps/factory-cli/src/main.ts:172, 199` stay sync).

<interfaces>
From research/PATTERNS.md — the recommended shape:

```typescript
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

export function resolveWorkspaceRoot(startDir: string = process.cwd()): string {
  let cur = resolve(startDir);
  while (true) {
    if (existsSync(resolve(cur, "pnpm-workspace.yaml"))) return cur;
    const parent = dirname(cur);
    if (parent === cur) {
      throw new Error(`No pnpm-workspace.yaml ancestor of ${startDir}`);
    }
    cur = parent;
  }
}
```

Sync version chosen because consumers at `main.ts:172, 199` are sync at call site
(top-of-`runFactory` config resolution).
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Stand up packages/paths skeleton + sync resolveWorkspaceRoot + tests</name>
  <files>packages/paths/package.json, packages/paths/tsconfig.json, packages/paths/src/index.ts, packages/paths/src/resolve-workspace-root.ts, packages/paths/src/resolve-workspace-root.test.ts</files>
  <behavior>
    - Test 1 (sad path): from a tmpdir with NO ancestor `pnpm-workspace.yaml`, `resolveWorkspaceRoot(tmpdir)` throws with message containing the start dir.
    - Test 2 (happy path, deep nest): from `<repo>/apps/factory-cli/src` (or any subdir of the protostar repo), `resolveWorkspaceRoot(subdir)` returns the protostar workspace root and `existsSync(resolve(returned, "pnpm-workspace.yaml"))` is true.
    - Test 3 (start at root itself): `resolveWorkspaceRoot(workspaceRoot)` returns `workspaceRoot` (does not climb past).
    - Test 4 (default arg): `resolveWorkspaceRoot()` (no arg) returns the same value as Test 2 when invoked from a subdir of the repo (`process.cwd()` default).
    - Test 5 (sentinel file is the marker, not a `.git` dir): walking past a `pnpm-workspace.yaml` to find a `.git`-only dir is not the contract; only `pnpm-workspace.yaml` counts.
  </behavior>
  <action>
    1. Create `packages/paths/package.json` (mirror `packages/dogpile-types/package.json`):
    ```json
    {
      "name": "@protostar/paths",
      "version": "0.0.0",
      "private": true,
      "type": "module",
      "main": "./dist/index.js",
      "types": "./dist/index.d.ts",
      "exports": {
        ".": {
          "types": "./dist/index.d.ts",
          "import": "./dist/index.js"
        }
      },
      "files": ["dist"],
      "scripts": {
        "build": "tsc -b",
        "test": "pnpm run build && node --test \"dist/**/*.test.js\"",
        "typecheck": "tsc -b --pretty false"
      },
      "sideEffects": false
    }
    ```
    Note: NO `dependencies` block (zero runtime deps; uses node built-ins only).

    2. Create `packages/paths/tsconfig.json` mirroring `packages/dogpile-types/tsconfig.json` exactly (extends from base, outDir `dist`, includes `src`).

    3. Create `packages/paths/src/resolve-workspace-root.ts` with the sync implementation from `<interfaces>` above. Add JSDoc:
    ```typescript
    /**
     * Walk parent directories from `startDir` until a `pnpm-workspace.yaml` file
     * is found; return that directory.
     *
     * Synchronous on purpose — consumers at `apps/factory-cli/src/main.ts:172,199`
     * are synchronous at call site.
     *
     * Scope ceiling (AGENTS.md carve-out): path resolution only. No I/O beyond
     * `existsSync`. No business logic. If you find yourself adding helpers
     * unrelated to workspace-root location, split this package per AGENTS.md.
     *
     * @throws {Error} when no `pnpm-workspace.yaml` exists in any ancestor.
     */
    export function resolveWorkspaceRoot(startDir: string = process.cwd()): string { /* ... */ }
    ```

    4. Create `packages/paths/src/index.ts`:
    ```typescript
    export { resolveWorkspaceRoot } from "./resolve-workspace-root.js";
    ```

    5. Create `packages/paths/src/resolve-workspace-root.test.ts` with the five
    tests above. Use `node:test` + `node:assert/strict`. For Test 1 (sad path),
    use `node:os.tmpdir()` + `node:fs.mkdtempSync` to make an isolated dir
    with no `pnpm-workspace.yaml` ancestor — note: macOS `/var/folders/...` may
    have no `.yaml` ancestors but if some test machine does, use `/private/tmp`
    or a dir under `os.tmpdir()` and verify the failure mode.

    Caveat for sad-path test: walking up from `os.tmpdir()` may eventually hit
    a system root. Confirm `existsSync(resolve("/", "pnpm-workspace.yaml"))` is
    `false` on the test machine; the throw fires when `parent === cur` at the
    filesystem root. The error message contains the originating `startDir` for
    operator forensics.

    6. Register the package in `pnpm-workspace.yaml`. Read existing entries; the
    file already lists `packages/*` and `apps/*` glob — `packages/paths` is
    automatically included. Verify by running `pnpm -r list --depth -1` after
    install and confirming `@protostar/paths` appears.

    7. Register in `tsconfig.base.json` references (if the base config has a
    `references` array — read the file first; many monorepos use a top-level
    `tsconfig.json` aggregator instead). Add `{ "path": "./packages/paths" }`
    to whichever file references all packages. If unsure, search:
    `grep -l '"path".*"./packages/' tsconfig*.json`.

    8. Run `pnpm install` then `pnpm --filter @protostar/paths test`. All five
    tests must pass.
  </action>
  <verify>
    <automated>pnpm --filter @protostar/paths test</automated>
  </verify>
  <done>`packages/paths/` package exists, builds, and `pnpm --filter @protostar/paths test` reports 5/5 tests passing. `@protostar/paths` resolvable in workspace (`pnpm -r list --depth -1 | grep @protostar/paths`).</done>
</task>

<task type="auto">
  <name>Task 2: AGENTS.md carve-out clause</name>
  <files>AGENTS.md</files>
  <action>
    Append to `AGENTS.md` under the existing "Package Boundaries" or
    "Development Rules" section (whichever is the better fit semantically) a new
    clause:

    ```markdown
    ## @protostar/paths Carve-Out (added 2026-04-27, Phase 3 Q-15)

    AGENTS.md "domain-first only — avoid generic utils/agents/factory packages"
    rule has one user-locked exception: `@protostar/paths`.

    **Scope ceiling — path resolution only.** Permitted contents:
    - Deterministic walks from a starting directory to a sentinel file
      (`pnpm-workspace.yaml`, future: `.git`, etc. only with explicit lock-revision).
    - Pure-compute path manipulation (`node:path` `resolve` / `relative` / `dirname`).

    **Forbidden:**
    - I/O beyond `existsSync` / `statSync` for sentinel detection.
    - Business logic (intent, planning, execution, review, evaluation, delivery, repo).
    - Networking. Subprocess. JSON parsing. YAML parsing.

    If a second consumer needs a path helper that doesn't fit the ceiling, split
    `@protostar/paths` rather than expand it. The carve-out is one exception, not
    a precedent for more.
    ```
  </action>
  <verify>
    <automated>grep -c "@protostar/paths Carve-Out\|@protostar/paths" AGENTS.md | awk '$1 &gt;= 2 {exit 0} {exit 1}'</automated>
  </verify>
  <done>AGENTS.md mentions `@protostar/paths` under a carve-out heading with a scope ceiling and a "forbidden" list.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Caller cwd → workspace root | Caller chooses `startDir`; `resolveWorkspaceRoot` cannot trust the dir is sane (could be `/`, could be deeply nested) |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-03-02-01 | Tampering | startDir injection | accept | Function reads `pnpm-workspace.yaml` *presence*, never *content*. Worst case: caller controls where the walk anchors → returned root may be wrong but that's a caller bug, not an exploit. |
| T-03-02-02 | DoS | Symlink loop in start path | accept | `node:path.resolve` is lexical; `dirname` strictly shrinks; loop terminates at filesystem root. No symlink traversal here (existsSync follows symlinks but we don't recurse into target dirs, only stat-check). |
| T-03-02-03 | Information Disclosure | Error message contains startDir | accept | Operator-facing error; startDir is operator-chosen; no secret material leaks. |
</threat_model>

<validation_strategy>
- **Coverage:** REPO-07 (`workspaceRoot` resolved deterministically by walking up to `pnpm-workspace.yaml`).
- **Sample frequency:** `pnpm --filter @protostar/paths test` after task commit; `pnpm run verify:full` at wave end.
- **Observability:** Five unit tests cover sad path, happy path, root-of-walk, default-arg, and sentinel specificity.
- **Nyquist:** Function is pure (modulo `existsSync`); test runtime ~10ms; sampling ≪ feedback latency budget.
</validation_strategy>

<verification>
- `pnpm --filter @protostar/paths test` returns exit code 0 with 5 passing tests
- `pnpm -r list --depth -1 | grep -q @protostar/paths`
- `grep -c "@protostar/paths" AGENTS.md` ≥ 2 (heading + body reference)
</verification>

<success_criteria>
- `@protostar/paths` package exists, builds, tests green
- Single export `resolveWorkspaceRoot(startDir?: string): string` from package root
- AGENTS.md carve-out clause names `@protostar/paths`, lists scope ceiling and forbidden contents
- Package zero runtime deps (only `node:fs`, `node:path`)
- Synchronous implementation (matches `main.ts:172, 199` call-site sync style)
</success_criteria>

<output>
After completion, create `.planning/phases/03-repo-runtime-sandbox/03-02-SUMMARY.md` listing: files created, AGENTS.md clause text added, test count, dep status (zero runtime deps confirmed).
</output>
