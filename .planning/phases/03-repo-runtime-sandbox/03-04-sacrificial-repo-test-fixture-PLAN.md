---
phase: 03-repo-runtime-sandbox
plan: 04
type: execute
wave: 0
depends_on: [01]
files_modified:
  - packages/repo/internal/test-fixtures/build-sacrificial-repo.ts
  - packages/repo/internal/test-fixtures/index.ts
  - packages/repo/internal/test-fixtures/build-sacrificial-repo.test.ts
  - packages/repo/package.json
  - packages/repo/tsconfig.json
autonomous: true
requirements: [REPO-02]
must_haves:
  truths:
    - "buildSacrificialRepo({ commits, branches, dirtyFiles, symlinks }) returns a tmpdir path containing a real isomorphic-git repo"
    - "Subpath export ./internal/test-fixtures resolves and downstream packages can import buildSacrificialRepo"
    - "Cleanup via t.after(() => rm) is documented in fixture-builder JSDoc"
    - "Self-test verifies: empty repo, 3-commit linear history, branch-from-base-sha, dirty file present, symlink present"
  artifacts:
    - path: "packages/repo/internal/test-fixtures/build-sacrificial-repo.ts"
      provides: "Programmatic git-repo builder for Phase 3 contract tests"
      exports: ["buildSacrificialRepo", "BuildSacrificialRepoOptions"]
    - path: "packages/repo/internal/test-fixtures/index.ts"
      provides: "Subpath barrel"
  key_links:
    - from: "packages/repo/package.json"
      to: "packages/repo/internal/test-fixtures/build-sacrificial-repo.ts"
      via: "exports map subpath"
      pattern: "./internal/test-fixtures"
---

<objective>
Build the programmatic sacrificial-repo helper per Q-18: `buildSacrificialRepo({ commits, branches, dirtyFiles, symlinks })` returns a path to a fresh per-test git repo under `os.tmpdir()/protostar-test-{uuid}/`. Subpath-export it from `@protostar/repo` following the Phase 1/2 `internal/brand-witness.ts` discipline.

Purpose: Every Wave 1+ contract test (clone, branch, fs-adapter, dirty-worktree, symlink-audit, apply-change-set, subprocess-runner) consumes this builder. Standing it up alone in Wave 0 lets every Wave 1+ implementation plan be parallel-test-able without scrambling for shared fixture infrastructure.
Output: Builder function, subpath barrel, subpath export wired in package.json, self-test green.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/03-repo-runtime-sandbox/03-CONTEXT.md
@.planning/phases/03-repo-runtime-sandbox/03-RESEARCH.md
@.planning/phases/03-repo-runtime-sandbox/03-PATTERNS.md
@packages/intent/src/internal/brand-witness.ts
@packages/intent/package.json
@packages/repo/package.json
@packages/repo/tsconfig.json

Q-18 lock: helper at `packages/repo/internal/test-fixtures/build-sacrificial-repo.ts`;
subpath export `./internal/test-fixtures`. Cleanup via `t.after(() => rm)`.
Repo built via `isomorphic-git` `init`/`commit`/`branch` (consistent with Q-01).
Output to `os.tmpdir()/protostar-test-{nanoid}/`.

Discretion (RESEARCH.md): use `crypto.randomUUID()` instead of `nanoid` (no new dep).

PATTERNS.md analog: `packages/intent/src/internal/brand-witness.ts:1-12`
private-subpath header (verbatim discipline). Subpath export idiom from
`packages/intent/package.json:41-44`.

<interfaces>
Target API:

```typescript
export interface BuildSacrificialRepoOptions {
  /** Number of linear commits to create on the default branch (default 1). */
  readonly commits?: number;
  /** Additional branch names to create from HEAD (default []). */
  readonly branches?: readonly string[];
  /** Files to write but NOT commit (creates dirty worktree). [{ path, content }] */
  readonly dirtyFiles?: readonly { readonly path: string; readonly content: string }[];
  /** Symlinks to create. [{ path, target }] — target is workspace-relative or absolute. */
  readonly symlinks?: readonly { readonly path: string; readonly target: string }[];
  /** Default branch name (default "main"). */
  readonly defaultBranch?: string;
}

export interface SacrificialRepo {
  readonly dir: string;
  readonly headSha: string;
  readonly defaultBranch: string;
  /** Each created file's path (workspace-relative) — for tests that need to assert. */
  readonly seededPaths: readonly string[];
}

export async function buildSacrificialRepo(
  opts?: BuildSacrificialRepoOptions
): Promise<SacrificialRepo>;
```

Implementation notes:
- Use `node:os.tmpdir()` + `node:fs/promises.mkdtemp` with prefix `protostar-test-` (mkdtemp generates the random suffix; no need for randomUUID). If a stable-length suffix is desired, append `crypto.randomUUID()`.
- `git.init({ fs, dir, defaultBranch })`. `fs` is the `node:fs` module.
- For each commit i in `[0, commits)`: write `seed-{i}.txt` with content `commit-{i}\n`, `git.add({ fs, dir, filepath })`, `git.commit({ fs, dir, message: \`seed commit \${i}\`, author: { name: "protostar-test", email: "test@protostar.local" } })`.
- For each branch in `branches`: `git.branch({ fs, dir, ref: branchName, object: "HEAD" })`.
- For each dirtyFile: `await fs.writeFile(resolve(dir, path), content)` (no add/commit).
- For each symlink: `await fs.symlink(target, resolve(dir, path))`.
- Return `{ dir, headSha: await git.resolveRef({ fs, dir, ref: "HEAD" }), defaultBranch, seededPaths: [...] }`.

No-cleanup-here pattern: caller invokes `t.after(() => rm(dir, { recursive: true, force: true }))`.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Implement buildSacrificialRepo + subpath barrel + private-subpath header</name>
  <files>packages/repo/internal/test-fixtures/build-sacrificial-repo.ts, packages/repo/internal/test-fixtures/index.ts</files>
  <behavior>
    Tests in Task 2 cover:
    - Default invocation creates 1 commit on `main` with no branches, no dirty files, no symlinks.
    - `commits: 3` produces a linear 3-commit history (verify via `git.log`).
    - `branches: ["feat-a", "feat-b"]` produces both branches at HEAD (verify via `git.listBranches`).
    - `dirtyFiles: [{ path: "x.txt", content: "uncommitted" }]` writes the file but `git.statusMatrix` reports it (HEAD=0, WORKDIR=2, STAGE=0).
    - `symlinks: [{ path: "link.txt", target: "seed-0.txt" }]` creates a symlink (verify via `lstat(...).isSymbolicLink()`).
  </behavior>
  <action>
    1. Create `packages/repo/internal/test-fixtures/build-sacrificial-repo.ts`.
    Header (mirror `packages/intent/src/internal/brand-witness.ts:1-12` adapted):
    ```typescript
    // ============================================================================
    // PRIVATE SUBPATH — packages/repo tests + admission-e2e ONLY. NOT a public API.
    //
    // Programmatic builder for sacrificial git repos used in Phase 3 contract
    // tests. Backed by isomorphic-git init/commit/branch over a tmpdir. Output
    // path returned to caller; cleanup via `t.after(() => fs.rm(...))`.
    //
    // Phase N may relocate or remove this file without notice.
    // ============================================================================
    ```

    Implement per `<interfaces>`. Imports:
    ```typescript
    import { mkdtemp, writeFile, symlink } from "node:fs/promises";
    import * as fs from "node:fs";
    import { tmpdir } from "node:os";
    import { join, resolve } from "node:path";
    import git from "isomorphic-git";
    ```

    Test author signature is fixed (`protostar-test <test@protostar.local>`)
    to keep commit SHAs reproducible across machines (within the same git tree
    semantics — author + content + tree determine SHA).

    Set `committer: author` to match for SHA stability. Set
    `author.timestamp: 1700000000` and `author.timezoneOffset: 0` for fully
    deterministic SHAs across runs (some tests assert on specific SHAs; making
    them stable is cheap).

    2. Create `packages/repo/internal/test-fixtures/index.ts`:
    ```typescript
    export {
      buildSacrificialRepo,
      type BuildSacrificialRepoOptions,
      type SacrificialRepo
    } from "./build-sacrificial-repo.js";
    ```

    3. Verify `packages/repo/tsconfig.json` `include` covers `internal/**/*.ts`.
    If not (likely already does — check first), add it.
  </action>
  <verify>
    <automated>pnpm --filter @protostar/repo build</automated>
  </verify>
  <done>Source compiles to `dist/internal/test-fixtures/build-sacrificial-repo.js` + `.d.ts`. Header present. Both files (impl + barrel) exist.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Self-test for the fixture builder + subpath-export wiring + verify import works</name>
  <files>packages/repo/internal/test-fixtures/build-sacrificial-repo.test.ts, packages/repo/package.json</files>
  <behavior>
    Test file uses `node:test` + `node:assert/strict`. Five tests as listed in
    Task 1 behavior section. Each test wraps `buildSacrificialRepo` in a
    `t.after` cleanup hook.

    Subpath export wiring: `import { buildSacrificialRepo } from "@protostar/repo/internal/test-fixtures"` must resolve from a sibling package (smoke test inside the repo's own test file is sufficient — exercises the build output, not just source).
  </behavior>
  <action>
    1. Create `packages/repo/internal/test-fixtures/build-sacrificial-repo.test.ts`:
    ```typescript
    import { describe, it, after } from "node:test";
    import assert from "node:assert/strict";
    import { rm, lstat } from "node:fs/promises";
    import * as fs from "node:fs";
    import git from "isomorphic-git";
    import { buildSacrificialRepo } from "./build-sacrificial-repo.js";

    describe("buildSacrificialRepo", () => {
      it("creates a 1-commit repo on main by default", async (t) => {
        const repo = await buildSacrificialRepo();
        t.after(() => rm(repo.dir, { recursive: true, force: true }));
        const log = await git.log({ fs, dir: repo.dir });
        assert.equal(log.length, 1);
        assert.equal(repo.defaultBranch, "main");
        assert.equal(typeof repo.headSha, "string");
        assert.match(repo.headSha, /^[a-f0-9]{40}$/);
      });

      it("creates linear N-commit history when commits: 3", async (t) => { /* ... */ });
      it("creates additional branches at HEAD", async (t) => { /* ... */ });
      it("seeds dirty files (uncommitted, statusMatrix shows them)", async (t) => { /* ... */ });
      it("seeds symlinks (lstat reports isSymbolicLink)", async (t) => { /* ... */ });
    });
    ```

    Fill in the four sketched tests using `git.log`, `git.listBranches`,
    `git.statusMatrix`, and `lstat`.

    2. Edit `packages/repo/package.json` `exports` map to add the subpath:
    ```json
    "exports": {
      ".": {
        "types": "./dist/index.d.ts",
        "import": "./dist/index.js"
      },
      "./internal/test-fixtures": {
        "types": "./dist/internal/test-fixtures/index.d.ts",
        "import": "./dist/internal/test-fixtures/index.js"
      },
      "./schema/workspace-trust-admission-decision.schema.json": "./schema/workspace-trust-admission-decision.schema.json"
    }
    ```

    Also add `internal` to `files` array if package publishes `dist` only — verify
    that `dist/internal/...` ships.

    3. Run `pnpm --filter @protostar/repo test`. All five fixture tests pass.

    4. Smoke test the subpath export resolves from a sibling package — quick
    in-tree script (do NOT commit it; just run and remove):
    ```bash
    cd packages/admission-e2e && node -e 'import("@protostar/repo/internal/test-fixtures").then(m => console.log(typeof m.buildSacrificialRepo))'
    ```
    Should print `function`. (This proves the exports map resolves; no test commit.)
  </action>
  <verify>
    <automated>pnpm --filter @protostar/repo test &amp;&amp; node -e 'const p=require("./packages/repo/package.json"); if(!p.exports["./internal/test-fixtures"])process.exit(1)'</automated>
  </verify>
  <done>5/5 fixture tests pass. `packages/repo/package.json` exports map includes `./internal/test-fixtures`. Subpath import resolves from a sibling package.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Test fixture → tmpdir | Fixture writes to `os.tmpdir()`; assumes operator/CI tmpdir is writable & cleanup-safe |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-03-04-01 | DoS | Test that doesn't clean up tmpdir | mitigate | Header documents `t.after(() => rm)` requirement; self-test follows the pattern. CI cleans tmpdir between runs anyway. |
| T-03-04-02 | Tampering | Public consumption leaks fixture into prod | mitigate | `internal/` subpath + private-subpath header banner mirrors `brand-witness.ts` discipline. Linters/reviewers catch leakage. |
| T-03-04-03 | Information Disclosure | Symlink option creates absolute-target symlinks | accept | Test fixture is operator-controlled; symlink option is for negative tests (Plan 06 symlink-refusal). No prod path. |
</threat_model>

<validation_strategy>
- **Coverage:** REPO-02 partial (fixture infrastructure for clone/branch tests).
- **Sample frequency:** Per-task `pnpm --filter @protostar/repo test`; fixture self-test runs ~2s.
- **Observability:** Each test prints which case ran via `node:test` reporter; tmpdir paths show up in failure output for forensics.
- **Nyquist:** Self-test exercises every option (commits, branches, dirtyFiles, symlinks); five tests cover the full surface.
</validation_strategy>

<verification>
- `pnpm --filter @protostar/repo test` green with 5+ fixture tests
- `cat packages/repo/package.json | jq '.exports["./internal/test-fixtures"]'` returns non-null
- Subpath import smoke (manual one-liner above)
</verification>

<success_criteria>
- `buildSacrificialRepo` exported from `@protostar/repo/internal/test-fixtures`
- Default + 4 option-driven self-tests pass
- Private-subpath header present (Q-18 discipline)
- Deterministic author/committer + timestamp produce stable SHAs across runs (nice-to-have for downstream test stability)
</success_criteria>

<output>
After completion, create `.planning/phases/03-repo-runtime-sandbox/03-04-SUMMARY.md` with: file list, exports map diff, deterministic-SHA proof (re-run test twice, assert headSha equality), any platform-specific symlink quirks observed (e.g., Windows ENOSYS — Phase 3 development is darwin-only per env so unlikely).
</output>
