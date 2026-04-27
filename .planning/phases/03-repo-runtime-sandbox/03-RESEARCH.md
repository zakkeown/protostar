# Phase 3: Repo Runtime + Sandbox — Research

**Researched:** 2026-04-27
**Domain:** Pure-JS git mechanics, unified-diff patch apply, subprocess sandboxing, FS cap enforcement
**Confidence:** HIGH

## Summary

Phase 3 makes the repo boundary real: clone, branch, FS read/write under capability caps, unified-diff patch apply with pre-image SHA-256 verification, atomic rollback via fresh-clone-per-run, dirty-worktree refusal, and a sandboxed subprocess runner with two-layer argv defenses. CONTEXT.md locked all 18 questions; this research confirms most decisions are achievable with a small, named runtime-dep set, but **surfaces one factual error in Q-10** (isomorphic-git ships no `apply`/`applyPatch`/`patch` API — verified against the 73-function alphabetic index) which requires a decision revision before planning can proceed.

**Primary recommendation:** Pin `isomorphic-git@1.37.6` (clone, branch, statusMatrix, init/commit) **plus** `diff@9.0.0` (`parsePatch` + `applyPatch` for unified-diff mechanics) as the two runtime deps on `@protostar/repo`. PROJECT.md "zero external runtime deps" lock must rephrase to acknowledge both. Build the FS adapter as a brand-consuming, lstat-refusing, re-canonicalizing wrapper around `node:fs/promises`; the subprocess runner as a `spawn`-only allowlist with outer pattern guard + per-command schema. `@dogpile/sdk@0.2.0` is published, zero-dep, Apache-2.0 — pin and re-export types via the existing `dogpile-types` shim.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Q-01 Git lib:** `isomorphic-git` (pure JS). First runtime dep on `@protostar/repo`. Breaks PROJECT.md "zero external runtime deps" lock — explicit user choice; PROJECT.md must update.
- **Q-02 Workspace location:** Configurable `workspaceRoot` field in `.protostar/repo-policy.json`, default `.protostar/workspaces/{runId}/`. Validate it lives outside the source repo.
- **Q-03 Workspace lifecycle:** Fresh clone per run, no reuse. Collapses Q-11 to `rm -rf {workspaceRoot}/{runId}`.
- **Q-04 Clone auth:** Both — `RepoTarget.credentialRef` env-var token preferred; system credential helper / SSH agent fallback when ref unset. Admission decision records `auth.mode: "credentialRef" | "system" | "anonymous"` plus `auth.credentialRef?: string` (name only, never value).
- **Q-05 FS cap shape:** Both — mint-time check on `AuthorizedWorkspaceOp` AND adapter re-canonicalizes at use. Belt-and-suspenders.
- **Q-06 Symlinks:** Refuse all symlinks inside workspace at clone time. lstat tree-wide audit; first symlink → refusal artifact.
- **Q-07 Subprocess allowlist:** Hardcoded baseline `[git, pnpm, node, tsc]` in `@protostar/repo/src/subprocess-allowlist.ts` + `commandAllowlist?: string[]` in repo-policy may extend, never remove.
- **Q-08 Argv validation:** Both layers. Outer pattern guard (`-` prefix flag-allowlist, `[a-zA-Z0-9._/-]+` ref pattern, force `--` separator) + inner per-command schema (`{ allowedSubcommands, allowedFlags, refValuePattern }`) per `git`/`pnpm`/`node`/`tsc`.
- **Q-09 Subprocess capture:** Stream to file (`runs/{id}/subprocess/{n}-{stdout|stderr}.log`) + tail last N KB into admission decision. Defaults `subprocessTailBytes: { stdout: 8192, stderr: 4096 }` in repo-policy.
- **Q-10 Patch format:** Unified diff text + per-file pre-image SHA-256. **DECISION CONFLICT — see `## Constraint Conflicts` below.**
- **Q-11 Rollback:** `rm -rf {workspaceRoot}/{runId}`. No stash, no snapshot tags. Tombstone retained for failed runs (default 24h).
- **Q-12 Rollback granularity:** Best-effort. `applyChangeSet` returns `Array<{ path, status: "applied" | "skipped-hash-mismatch" | "skipped-error", error? }>`.
- **Q-13 Dirty detection:** Via `isomorphic-git` `statusMatrix`, semantics matching `git status --porcelain --untracked-files=no`. **See pitfall §2** — naive filtering does not match.
- **Q-14 Override flag:** New `capabilityEnvelope.workspace.allowDirty: boolean` (default `false`). Confirmed-intent schemaVersion bump 1.1.0 → 1.2.0.
- **Q-15 Path resolution:** New `@protostar/paths` package. `resolveWorkspaceRoot()` walks to `pnpm-workspace.yaml`. Carve-out clause needed in AGENTS.md.
- **Q-16 @dogpile/sdk:** Published; pin a version. Replace `link:` in `packages/dogpile-adapter/package.json:21`.
- **Q-17 .env.example:** Forward-look. `GITHUB_PAT`, `LM_STUDIO_ENDPOINT`, `LM_STUDIO_CODER_MODEL` (default `Qwen3-Coder-Next-MLX-4bit`), `LM_STUDIO_JUDGE_MODEL` (default `Qwen3-80B-Judge-MLX`).
- **Q-18 Sacrificial repo:** Programmatic helper `buildSacrificialRepo({ commits, branches, dirtyFiles, symlinks })` at `packages/repo/internal/test-fixtures/build-sacrificial-repo.ts`. Subpath export `./internal/test-fixtures`. Cleanup via `t.after`. Output to `os.tmpdir()/protostar-test-{nanoid}/`.

### Claude's Discretion
- Exact pinned versions of `isomorphic-git`, `diff`, and `@dogpile/sdk` (subject to verified-current at plan time).
- Internal module layout under `packages/repo/src/` (FS adapter, subprocess runner, allowlist, schema files, helpers).
- Whether `dogpile-types` shim is deleted (re-import from `@dogpile/sdk` directly) or retained (re-export from `@dogpile/sdk/types`). Research recommends **retain as re-export shim** (preserves adapter-pattern indirection).
- Subpath export layout for `@protostar/paths` (single barrel vs. function-per-file).
- Whether the FS adapter exposes `readFile`/`writeFile`/`deleteFile` separately or a single typed `applyOp(op, action)` dispatch.
- `nanoid` vs `crypto.randomUUID()` for tmpdir suffix in test-fixture (no extra dep — use `crypto.randomUUID()`).

### Deferred Ideas (OUT OF SCOPE)
- Workspace pool / hot reuse (Q-03 b/c) — no `workspacePool` field in repo-policy schema.
- Symlink resolve-and-reverify (Q-06 b/c) — strict refusal only.
- Anonymous/public-clone UX tuning (Q-04) — Phase 9 concern.
- Subprocess streaming consumer API (Q-09) — Phase 9 `inspect` concern.
- All-or-nothing rollback (Q-12 a) — best-effort only.
- Repo-policy lock-down mode to remove baseline allowlist commands (Q-07) — Phase 10+ hardening.
- `@protostar/paths` scope expansion beyond `pnpm-workspace.yaml`-walking — triggers package split.
- `feature-add` / `refactor` / `bugfix` archetypes — still `stub` per PROJECT.md.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| REPO-01 | Target repo registration: `defineWorkspace` accepts `RepoTarget` (URL + credentialRef) → verified `WorkspaceRef` | `isomorphic-git` `clone` with `onAuth` callback; admission decision records `auth.mode` + `auth.credentialRef` (name only). [VERIFIED: Context7 isomorphic-git docs] |
| REPO-02 | Workspace snapshot/branch creation: clone, checkout, branch from base SHA | `isomorphic-git` `clone({fs, http, dir, url, ref, depth, singleBranch})`, `branch({fs, dir, ref, object, checkout})`, `checkout({fs, dir, ref})`. [VERIFIED: Context7] |
| REPO-03 | File r/w caps enforced per `capabilityEnvelope` — paths outside workspace refused at repo layer | FS adapter takes `AuthorizedWorkspaceOp`, re-canonicalizes via `node:path` `resolve`, asserts envelope-prefix match before any `node:fs/promises` call. lstat refuses symlinks per Q-06. |
| REPO-04 | Subprocess invocations through repo-owned runner with allowlist + arg validation | `node:child_process.spawn` array form (NEVER shell strings). Two-layer guard: outer pattern + inner per-command schema. [VERIFIED: Node.js docs — spawn array form bypasses shell] |
| REPO-05 | `applyChangeSet` atomic; failure restores prior worktree | Pre-image SHA-256 verify → `diff.parsePatch` → `diff.applyPatch` → write. Q-11 collapses atomicity to fresh-clone-per-run; rollback = `fs.rm` workspace dir. |
| REPO-06 | Dirty-worktree refusal unless capability envelope explicitly allows | `isomorphic-git` `statusMatrix` filtered to tracked-file mods (HEAD=1 with workdir or stage divergence). New `workspace.allowDirty` capability bump (1.1.0→1.2.0). |
| REPO-07 | `workspaceRoot` resolved deterministically by walking up to `pnpm-workspace.yaml` | New `@protostar/paths` package. `resolveWorkspaceRoot(): string` walks parent dirs to `pnpm-workspace.yaml`. Replaces broken `INIT_CWD ?? cwd()` at `apps/factory-cli/src/main.ts:172, 199`. |
| REPO-08 | `@dogpile/sdk` installable on fresh-clone machine | `@dogpile/sdk@0.2.0` verified published (zero deps, Apache-2.0). Pin in `dogpile-adapter/package.json`. [VERIFIED: `npm view @dogpile/sdk@0.2.0` 2026-04-25] |
| REPO-09 | `.env.example` documents every env var the factory will read in Phases 4–7 | Forward-look set: `GITHUB_PAT`, `LM_STUDIO_ENDPOINT`, `LM_STUDIO_CODER_MODEL`, `LM_STUDIO_JUDGE_MODEL` per Q-17 lock. |
</phase_requirements>

---

## Constraint Conflicts

> **First thing the planner must address before drafting Wave 0.**

### CONFLICT-01: Q-10 says "apply via isomorphic-git's apply" — that API does not exist

**Evidence:** [VERIFIED: Context7 isomorphic-git alphabetic command index — 73 functions enumerated] `isomorphic-git` exposes `init, clone, commit, log, fetch, checkout, push, pull, fastForward, merge, abortMerge, walk, stash, branch, deleteBranch, renameBranch, listBranches, tag, annotatedTag, deleteTag, listTags, add, remove, listFiles, status, isIgnored, getRemoteInfo, getRemoteInfo2, addRemote, deleteRemote, listRemotes, listServerRefs, setConfig, getConfig, getConfigAll, addNote, readNote, removeNote, listNotes, readBlob, readCommit, readTag, readTree, writeBlob, writeCommit, writeTag, writeTree, readObject, writeObject, findRoot, expandRef, expandOid, resetIndex, updateIndex, listRefs, resolveRef, writeRef, deleteRef, hashBlob, statusMatrix, isDescendent, indexPack, packObjects, version` — no `apply`, no `applyPatch`, no `patch`, no `am`, no `diff`. Confirmed via WebSearch (HN, deepwiki, isomorphic-git.org/docs/en/alphabetic).

**Impact:** Q-10's "apply via isomorphic-git's apply with hash check" is not implementable as written. The *intent* (unified-diff text + pre-image SHA-256 verification, refuse on hash mismatch, best-effort partial apply per Q-12) is sound and locked; the *mechanism* must come from elsewhere.

**Recommendation (planner-actionable):**

Adopt `diff` (kpdecker/jsdiff) v9.0.0 as the patch-mechanics dep:
- **Package:** `diff@9.0.0` [VERIFIED: `npm view diff@9.0.0` 2026-04-13]
- **License:** BSD-3-Clause (compatible)
- **Types:** ships `libcjs/index.d.ts` and `libesm/index.d.ts`
- **ESM support:** dual-mode (`exports` field has both `import` and `require` conditions)
- **Surface used:**
  - `parsePatch(uniDiff: string): StructuredPatch[]` — tolerates git-style headers (`isGit`, `isRename` flags)
  - `applyPatch(source: string, patch: string | StructuredPatch | StructuredPatch[]): string | false` — returns `false` on hunk-fit failure, mapping cleanly to Q-12 `"skipped-error"` status

**Pipeline (planner sketch):**
```
For each patch in changeSet.patches:
  1. authorityOp = mintAuthorizedWorkspaceOp(workspace, patch.path, "write")  // Phase 2 brand
  2. preImageBytes = await fsAdapter.readFile(authorityOp)
  3. computedSha = sha256(preImageBytes)
  4. if (computedSha !== patch.preImageSha256)
     → record { path, status: "skipped-hash-mismatch" }, continue
  5. structured = diff.parsePatch(patch.diff)
  6. result = diff.applyPatch(preImageBytes.toString("utf8"), structured)
  7. if (result === false)
     → record { path, status: "skipped-error", error: "hunk fit failure" }, continue
  8. await fsAdapter.writeFile(authorityOp, Buffer.from(result, "utf8"))
  9. record { path, status: "applied" }
```

**Side effects on locked decisions:**
- **PROJECT.md rephrase (Q-01):** must acknowledge **two** runtime deps (`isomorphic-git` AND `diff`), not one.
- **Binary file path:** `diff.applyPatch` is text-only. Q-10 deferred-idea (filewise full-content fallback for binary) becomes load-bearing if cosmetic-tweak runs ever touch a binary. For Phase 3 v1, recommend: detect binary via patch headers (`Binary files ... differ`) → record `{ status: "skipped-error", error: "binary-not-supported" }` and document in `CONCERNS.md`.

**Planner action:** add a Wave 0 task to surface this conflict in CONTEXT.md errata or a dated decision-revision note, then proceed. Do **not** silently switch — this is a load-bearing mechanism change that must be visible in the audit trail.

### CONFLICT-02 (informational only): Q-13 statusMatrix filtering is non-trivial

**Evidence:** [VERIFIED: Context7 isomorphic-git statusMatrix docs] `statusMatrix` returns rows for **untracked** files too (HEAD=0, WORKDIR=2, STAGE=0). Naive `rows.length > 0 → dirty` would fire on freshly-cloned repos with `.protostar/runs/` style stragglers.

**Correct filter for `--untracked-files=no` semantics:**
```typescript
const FILE = 0, HEAD = 1, WORKDIR = 2, STAGE = 3;
const dirtyRows = matrix.filter(row =>
  row[HEAD] === 1 && (row[WORKDIR] !== row[HEAD] || row[STAGE] !== row[HEAD])
);
const isDirty = dirtyRows.length > 0;
```

This is a *specification* of Q-13 not a conflict, but if the planner encodes the literal "matrix non-empty = dirty" they will get false positives on every fresh clone with build artifacts. Document the filter explicitly in the plan.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Workspace clone / branch / checkout | `@protostar/repo` (FS authority) | — | Authority boundary lock; Phase 3 expands FS surface here only |
| FS read/write/delete with cap enforcement | `@protostar/repo` FS adapter | `@protostar/authority` (brand mint) | Belt-and-suspenders Q-05; mint stays in authority, consumption in repo |
| Subprocess spawn with allowlist + argv guard | `@protostar/repo` runner | `@protostar/authority` (brand mint) | Same pattern; Phase 3 wires consumer of `AuthorizedSubprocessOp` |
| Patch parse + apply | `@protostar/repo` (uses `diff` lib) | — | Lives behind FS adapter; never touches FS directly |
| Pre-image SHA-256 verify | `@protostar/repo` | — | Pure compute on bytes already authorized via FS adapter |
| Symlink refusal | `@protostar/repo` (clone-time tree audit) | — | One-shot post-clone walk; not per-op (per Q-06 strictness rationale) |
| Dirty-worktree detection | `@protostar/repo` | — | `statusMatrix` consumed once per run pre-patch + post-patch |
| Workspace cleanup / tombstone | `apps/factory-cli` (lifecycle) | `@protostar/repo` (cleanup helper) | Cleanup decision is run-lifecycle (success vs fail vs operator-resume); helper stays repo-side |
| `pnpm-workspace.yaml` discovery | `@protostar/paths` | — | New carve-out package, no I/O beyond stat-walking |
| `@dogpile/sdk` types | `@protostar/dogpile-types` (re-export shim) | `@dogpile/sdk` (upstream) | Preserve adapter-pattern indirection per ARCH lock |
| Subprocess capture (file + tail) | `@protostar/repo` runner | `apps/factory-cli` (writes log path) | Streams owned by runner; path resolution by caller |

---

## Standard Stack

### Core (NEW runtime deps on `@protostar/repo`)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `isomorphic-git` | `1.37.6` | Clone, branch, checkout, statusMatrix, init, commit (test fixture builder). Pure-JS git protocol over `node:fs` and `isomorphic-git/http/node`. | Only viable pure-JS git option; no native bindings; programmatic API; Q-01 lock. [VERIFIED: `npm view isomorphic-git@1.37.6` 2026-04-27] |
| `diff` (kpdecker) | `9.0.0` | `parsePatch` + `applyPatch` for unified-diff mechanics (resolves CONFLICT-01). | Standard JS unified-diff library; BSD-3-Clause; ships `.d.ts`; ESM dual-mode. [VERIFIED: `npm view diff@9.0.0` 2026-04-13] |

### Core (NEW runtime dep on `@protostar/dogpile-adapter`)

| Library | Version | Purpose |
|---------|---------|---------|
| `@dogpile/sdk` | `0.2.0` | Replace `link:../../../dogpile`. Apache-2.0, zero deps, ships `./types` subpath, dual ESM/browser exports. [VERIFIED: `npm view @dogpile/sdk@0.2.0` 2026-04-25, published 2 days ago by maintainer `zkeown`] |

### Supporting (Node built-ins — no new deps)

| API | Use |
|-----|-----|
| `node:fs/promises` `readdir({recursive:true, withFileTypes:true})` | Symlink-tree audit (Q-06) — `dirent.isSymbolicLink()` faster than per-path lstat |
| `node:fs/promises` `lstat` | Per-op symlink double-check inside FS adapter |
| `node:fs/promises` `rm({recursive:true, force:true, maxRetries:3, retryDelay:100})` | Workspace tombstone cleanup (Q-11). Retry params handle transient Win/macOS file locks. |
| `node:child_process` `spawn(cmd, argv, {shell:false})` | Subprocess runner (Q-04). Array form bypasses shell — never `exec`/`execSync`. [VERIFIED: nodejs.org docs] |
| `node:crypto` `createHash("sha256")` | Pre-image hash verification (Q-10) |
| `node:crypto` `randomUUID()` | Test-fixture tmpdir suffix (instead of new `nanoid` dep) |
| `node:path` `resolve` + `relative` | FS adapter re-canonicalization + envelope prefix check |
| `node:url` `pathToFileURL` | Branch on URL clone vs local-path clone if needed |

### Alternatives Considered

| Instead of | Could Use | Why Rejected |
|------------|-----------|--------------|
| `diff@9.0.0` | `diff-apply@1.0.6` | Pulls 7 transitive deps (`alvamind`, `string-similarity`, `diff-match-patch`, `fastest-levenshtein`, ...) for fuzzy-match capability we don't need. Q-10 demands strict pre-image-hash gating, not fuzzy match. |
| `diff@9.0.0` | shell out to `git apply` | Violates Q-01 spirit (no system git binary required). Adds an argv-injection surface. |
| `isomorphic-git` | `nodegit` | Native bindings, large install, contradicts Q-01 pure-JS. |
| `isomorphic-git` | shell out to `git` | Operator-environment dependency; Q-01 explicitly rejected. |
| New `nanoid` dep | `crypto.randomUUID()` | Avoid dep growth — Node 22 ships `randomUUID`. |

**Installation:**
```bash
pnpm --filter @protostar/repo add isomorphic-git@1.37.6 diff@9.0.0
pnpm --filter @protostar/dogpile-adapter add @dogpile/sdk@0.2.0
pnpm --filter @protostar/dogpile-adapter remove @protostar/dogpile-types  # only if shim deleted
```

**Type defs:**
- `isomorphic-git` ships `index.d.cts` (CJS-flavored). Under `module: NodeNext`, ESM consumers see types via the `exports` map. [VERIFIED: `npm view isomorphic-git exports` shows `types` condition on each subpath.] Test under TS 6 strict during planning to confirm no patch-types shim is needed.
- `diff` ships both `libcjs/index.d.ts` and `libesm/index.d.ts` with proper `exports` conditions.
- `@dogpile/sdk` ships `dist/types.d.ts` via `./types` subpath — re-export shape from `dogpile-types`.

**Version verification (2026-04-27):**
```
isomorphic-git: 1.37.6 (modified 2026-04-27, today)
diff:           9.0.0  (modified 2026-04-13)
@dogpile/sdk:   0.2.0  (published 2026-04-25, 2 days ago, by zkeown)
```

---

## Architecture Patterns

### System Architecture Diagram

```
                                runFactory (apps/factory-cli)
                                       │
                                       │ resolveWorkspaceRoot()  ← @protostar/paths
                                       ▼
                          ┌────────────────────────────────┐
                          │  Phase 2 admission decisions   │
                          │  → AuthorizedWorkspaceOp brand │
                          │  → AuthorizedSubprocessOp brand│
                          └────────────────────────────────┘
                                       │
                                       │ branded ops (Phase 2 mint sites)
                                       ▼
                       ┌─────────────────────────────────────┐
                       │  @protostar/repo runtime (Phase 3)  │
                       │                                     │
                       │  ┌──── cloneWorkspace ───────────┐  │
                       │  │  isomorphic-git.clone         │  │
                       │  │  + onAuth(credentialRef|sys)  │  │
                       │  └──┬────────────────────────────┘  │
                       │     │  post-clone audit             │
                       │     ▼                               │
                       │  ┌──── lstat-walk symlink audit ──┐ │
                       │  │  refuse-and-mark-untrusted    │ │
                       │  └──┬────────────────────────────┘ │
                       │     │                              │
                       │     ▼                              │
                       │  ┌── dirtyWorktreeStatus (Q-13) ──┐│
                       │  │  isomorphic-git.statusMatrix  ││
                       │  │  filter HEAD=1 ∧ divergence   ││
                       │  └──┬────────────────────────────┘│
                       │     │                              │
                       │     ▼                              │
                       │  ┌── FS adapter ─────────────────┐ │
                       │  │  readFile/writeFile/deleteFile││
                       │  │  takes AuthorizedWorkspaceOp  ││
                       │  │  re-canonicalize + lstat-check││
                       │  └──┬────────────────────────────┘│
                       │     │                              │
                       │     ▼                              │
                       │  ┌── applyChangeSet ─────────────┐ │
                       │  │  for each patch:              ││
                       │  │   sha256(preImage) =? hash    ││
                       │  │   diff.parsePatch             ││
                       │  │   diff.applyPatch (false=fail)││
                       │  │  → returns per-file status[]  ││
                       │  └──┬────────────────────────────┘│
                       │     │                              │
                       │     ▼                              │
                       │  ┌── runCommand (subprocess) ────┐ │
                       │  │  AuthorizedSubprocessOp →     ││
                       │  │   outer pattern guard         ││
                       │  │   per-cmd schema (git/pnpm/  ││
                       │  │     node/tsc)                 ││
                       │  │   spawn(...,{shell:false})    ││
                       │  │   stream→file + tail buffer   ││
                       │  └────────────────────────────────┘│
                       │     ▲                              │
                       │     │ on success cleanup           │
                       │     │ on failure tombstone (24h)   │
                       └─────│──────────────────────────────┘
                             │
                             ▼
                    fs.rm (workspace dir) — atomic rollback Q-11
```

### Recommended Project Structure

```
packages/repo/
├── src/
│   ├── index.ts                        # public exports
│   ├── workspace-trust-runtime.ts      # (existing — Phase 2)
│   ├── clone-workspace.ts              # cloneWorkspace + onAuth shim
│   ├── symlink-audit.ts                # post-clone tree walk + refusal
│   ├── fs-adapter.ts                   # readFile/writeFile/deleteFile
│   ├── apply-change-set.ts             # patch pipeline (sha256 + diff lib)
│   ├── dirty-worktree-status.ts        # statusMatrix filter (Q-13)
│   ├── subprocess-runner.ts            # spawn + stream + tail
│   ├── subprocess-allowlist.ts         # baseline const + policy intersect
│   ├── subprocess-schemas/
│   │   ├── git.ts
│   │   ├── pnpm.ts
│   │   ├── node.ts
│   │   └── tsc.ts
│   ├── argv-pattern-guard.ts           # outer flag-pattern + ref-pattern
│   ├── repo-policy.ts                  # parse .protostar/repo-policy.json
│   ├── workspace-cleanup.ts            # fs.rm with retries + tombstone semantics
│   └── *.test.ts                       # node:test against compiled dist/
├── internal/
│   └── test-fixtures/
│       ├── build-sacrificial-repo.ts   # buildSacrificialRepo helper (Q-18)
│       └── index.ts                    # subpath barrel
├── schema/
│   ├── workspace-trust-admission-decision.schema.json   # (existing)
│   ├── repo-runtime-admission-decision.schema.json      # NEW — Q-09
│   └── repo-policy.schema.json                          # NEW
└── package.json   # dependencies: isomorphic-git, diff, @protostar/authority,
                   #               @protostar/paths

packages/paths/                          # NEW (Q-15)
├── src/
│   ├── index.ts                         # resolveWorkspaceRoot()
│   └── resolve-workspace-root.test.ts
└── package.json   # zero runtime deps; pure compute over node:fs

packages/intent/schema/confirmed-intent.schema.json   # bump 1.1.0 → 1.2.0
packages/intent/src/capability-envelope.ts            # +allowDirty default false

apps/factory-cli/src/main.ts                          # uses resolveWorkspaceRoot()
                                                       # invokes cloneWorkspace
                                                       # cleanup-on-success / tombstone-on-fail

.env.example                                          # NEW (Q-17)
.gitignore                                            # +.protostar/workspaces/
.protostar/repo-policy.json                           # optional; schema referenced
```

### Pattern 1: Brand-Consuming FS Adapter (Belt-and-Suspenders, Q-05)

**What:** FS adapter accepts only `AuthorizedWorkspaceOp` brand (minted in `@protostar/authority` at Phase 2). At entry, adapter re-canonicalizes the path and asserts equality with the brand-carried canonical path before touching disk.

```typescript
// packages/repo/src/fs-adapter.ts
import { resolve, relative } from "node:path";
import { lstat, readFile as fsReadFile } from "node:fs/promises";
import type { AuthorizedWorkspaceOp } from "@protostar/authority";

export async function readFile(op: AuthorizedWorkspaceOp): Promise<Buffer> {
  // belt: brand was minted under cap check; suspenders: re-resolve at use
  const reResolved = resolve(op.workspaceRoot, op.relativePath);
  if (reResolved !== op.canonicalPath) {
    throw new FsCapViolation("re-canonicalization mismatch", op);
  }
  // strict symlink refusal at adapter (defense in depth vs Q-06 clone-time audit)
  const stat = await lstat(reResolved);
  if (stat.isSymbolicLink()) {
    throw new FsCapViolation("symlink-refusal", op);
  }
  // envelope prefix check
  const rel = relative(op.workspaceRoot, reResolved);
  if (rel.startsWith("..") || rel.startsWith("/")) {
    throw new FsCapViolation("escape-attempt", op);
  }
  return fsReadFile(reResolved);
}
```

### Pattern 2: Two-Layer Argv Guard (Q-08)

**What:** Outer pattern guard rejects flag-injection-style args; per-command schema gates subcommand + flag set.

```typescript
// packages/repo/src/argv-pattern-guard.ts
const REF_VALUE = /^[a-zA-Z0-9._/-]+$/;

export function applyOuterPatternGuard(
  argv: readonly string[],
  schema: { allowedFlagPrefixes: readonly string[]; refValuePattern: RegExp }
): void {
  let sawSeparator = false;
  for (const arg of argv) {
    if (arg === "--") { sawSeparator = true; continue; }
    if (!sawSeparator && arg.startsWith("-")) {
      // must match an allowed flag prefix exactly OR with =value form
      const flagBody = arg.split("=")[0];
      if (!schema.allowedFlagPrefixes.includes(flagBody)) {
        throw new ArgvViolation(`flag-not-allowed: ${flagBody}`);
      }
      continue;
    }
    // post-separator OR positional pre-separator: must match ref pattern
    if (!schema.refValuePattern.test(arg)) {
      throw new ArgvViolation(`ref-pattern-violation: ${arg}`);
    }
  }
}
```

```typescript
// packages/repo/src/subprocess-schemas/git.ts — example
export const gitSchema = {
  command: "git",
  allowedSubcommands: ["clone", "checkout", "branch", "status", "rev-parse"] as const,
  allowedFlags: {
    clone: ["--depth", "--single-branch", "--branch", "--no-tags"],
    checkout: ["-b", "--detach"],
    branch: ["--list", "-D"],
    status: ["--porcelain", "--untracked-files=no"],
    "rev-parse": ["--show-toplevel", "--abbrev-ref", "HEAD"]
  },
  refValuePattern: /^[a-zA-Z0-9._/-]+$/
} as const;
```

### Pattern 3: Stream-to-File + Rolling Tail Buffer (Q-09)

```typescript
// packages/repo/src/subprocess-runner.ts (sketch)
import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";

export async function runCommand(op: AuthorizedSubprocessOp, opts: {
  stdoutPath: string; stderrPath: string;
  stdoutTailBytes: number; stderrTailBytes: number;
}): Promise<SubprocessResult> {
  const child = spawn(op.command, op.argv, { shell: false, stdio: ["ignore", "pipe", "pipe"] });
  const stdoutStream = createWriteStream(opts.stdoutPath);
  const stderrStream = createWriteStream(opts.stderrPath);
  const stdoutTail = createRollingBuffer(opts.stdoutTailBytes);
  const stderrTail = createRollingBuffer(opts.stderrTailBytes);
  child.stdout.on("data", (chunk: Buffer) => { stdoutStream.write(chunk); stdoutTail.push(chunk); });
  child.stderr.on("data", (chunk: Buffer) => { stderrStream.write(chunk); stderrTail.push(chunk); });
  const exitCode = await new Promise<number>((res, rej) => {
    child.on("error", rej);
    child.on("exit", (code) => res(code ?? -1));
  });
  // CRITICAL: flush before resolving (Q-09 note)
  await Promise.all([
    new Promise<void>(r => stdoutStream.end(r)),
    new Promise<void>(r => stderrStream.end(r))
  ]);
  return {
    argv: op.argv, exitCode, durationMs: /*…*/, 
    stdoutPath: opts.stdoutPath, stderrPath: opts.stderrPath,
    stdoutTail: stdoutTail.toString(), stderrTail: stderrTail.toString(),
    stdoutBytes: stdoutTail.totalBytes, stderrBytes: stderrTail.totalBytes
  };
}
```

### Anti-Patterns to Avoid

- **`exec()` / `execSync()` / shell strings:** instant command-injection. Use `spawn` with array form only. [CITED: nodejs.org/api/child_process — array form bypasses shell]
- **Buffering full stdout/stderr in memory:** A `pnpm install` log can be MBs. Stream to disk + rolling tail.
- **`fs.readdir` without `withFileTypes:true` + manual `lstat` per entry:** N+1 syscall pattern. Use `readdir({ withFileTypes: true, recursive: true })` and check `dirent.isSymbolicLink()` — single recursive walk in Node 22.
- **Trusting `path.resolve` alone for workspace-confinement:** `resolve("/ws", "../../etc/passwd")` returns `/etc/passwd`. Always check `relative(root, resolved).startsWith("..")` — escape detection.
- **`path.normalize` instead of `path.resolve`:** doesn't resolve symlinks; doesn't anchor to absolute root. Always `resolve` then verify.
- **Naive `statusMatrix.length > 0 → dirty`:** counts untracked files. See CONFLICT-02 — must filter HEAD=1 ∧ (WORKDIR≠HEAD ∨ STAGE≠HEAD).
- **`isomorphic-git` `apply`:** does not exist (CONFLICT-01). Don't write code that calls it.
- **Recursive clones:** validate `workspaceRoot` is OUTSIDE the source repo at config-load time. Easy bug otherwise.
- **`onAuth` callback that returns the value of a credential ref directly:** evidence (admission decision) must record the **name** of the ref (`"GITHUB_PAT"`), never the value. Use `process.env[op.credentialRef]` inside `onAuth` only.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Pure-JS git clone over HTTP/S | Custom git protocol client | `isomorphic-git` 1.37.6 | Smart protocol, packfile parsing, ref negotiation — months of edge cases (rename detection, partial clones, shallow rewrites). |
| Unified-diff parsing | Hand-roll a hunk parser | `diff@9.0.0` `parsePatch` | Git-dialect awareness (`isGit`, `isRename`, file-header optional cases), context-line drift handling. |
| Unified-diff application | Hand-roll line splicing | `diff@9.0.0` `applyPatch` | Hunk fitting under whitespace drift, line-ending normalization, fuzzy fallback (which we *disable* via strict pre-image hash gate, but the parser still does the work). |
| `pnpm-workspace.yaml` discovery | Walk + parse YAML | Walk + presence check only | Don't parse — only check the file exists. No YAML dep. (`@protostar/paths` only needs to know the directory.) |
| SHA-256 hashing | Hand-roll | `node:crypto` `createHash("sha256")` | Built-in, FIPS-compatible, zero deps. |
| Recursive directory walk for symlinks | Custom `fs.readdir` recursion | `fs.readdir(dir, { withFileTypes: true, recursive: true })` (Node 22+) | Node 22 native; `dirent.isSymbolicLink()` avoids per-path `lstat` syscalls. |
| Workspace cleanup | `rm -rf` shellout | `fs.rm(dir, { recursive, force, maxRetries: 3, retryDelay: 100 })` | Native, cross-platform, retry-aware for Win/macOS file locks. |
| Argv injection patterns | Reinvent | OWASP child-process guidance + `spawn` array form | [CITED: nodejs.org docs] |

**Key insight:** Phase 3 is the FIRST real-I/O phase. Custom code at this boundary is where target-repo-corrupting bugs and credential-leak vulns live. Use library-blessed mechanics for git, diff, and process spawning; the project's value-add is the *cap envelope* and *brand-consumer pattern*, not the underlying mechanics.

---

## Runtime State Inventory

> Phase 3 is partly a refactor (replacing `INIT_CWD ?? cwd()` at `apps/factory-cli/src/main.ts:172, 199`; replacing `link:` dep at `packages/dogpile-adapter/package.json:21`).

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — Phase 3 introduces fresh per-run workspace dirs; no migration of existing data. Pre-existing `.protostar/runs/` are read-only artifacts and are not touched. | None |
| Live service config | None — no external services touched in Phase 3 | None |
| OS-registered state | None — Phase 3 spawns subprocesses but does not register persistent OS state | None |
| Secrets/env vars | NEW env vars referenced (none yet stored): `GITHUB_PAT`, `LM_STUDIO_ENDPOINT`, `LM_STUDIO_CODER_MODEL`, `LM_STUDIO_JUDGE_MODEL`. Phase 3 only introduces `.env.example` documenting them — code consumption is Phase 4–7. | Add `.env.example`. No secrets stored anywhere. |
| Build artifacts / installed packages | `packages/dogpile-adapter` currently has `link:../../../dogpile`. After replacing with `@dogpile/sdk@0.2.0` pin, `pnpm install` will fetch from registry; existing `node_modules` symlink to sibling repo becomes stale. `packages/dogpile-types` shim role decided in plan (retain as re-export shim or delete). | Run `pnpm install` after package.json edit; verify on a fresh clone with no sibling `~/Code/dogpile` directory. |

---

## Common Pitfalls

### Pitfall 1: `isomorphic-git.clone` `onAuth` retry storm on bad credentials

**What goes wrong:** When `onAuth` returns invalid credentials, `isomorphic-git` calls it again on retry. A naive impl that returns the same bad token loops forever.
**Why it happens:** `onAuth` is called per HTTP retry; library expects caller to detect repeated invocations and return `{ cancel: true }`.
**How to avoid:** Track invocation count in closure; after N=2 invocations with same credentialRef, return `{ cancel: true }` and surface a typed `CredentialRefusedError`.
**Warning signs:** Test runs that hang on private-repo clone; CI run times spiking.

### Pitfall 2: `statusMatrix` includes untracked files (CONFLICT-02 above)

**What goes wrong:** Naive `matrix.length > 0` reports dirty on freshly-cloned repos containing build artifacts (`dist/`, `node_modules/`, `.protostar/`).
**Why it happens:** `statusMatrix` returns rows for HEAD=0 untracked files.
**How to avoid:** Filter `row[HEAD] === 1 && (row[WORKDIR] !== row[HEAD] || row[STAGE] !== row[HEAD])`.
**Warning signs:** Phase 3 success-criterion test "dirty-worktree refusal on otherwise-clean clone" fails on first run.

### Pitfall 3: Binary files in unified diff

**What goes wrong:** `diff.applyPatch` on a binary-file patch returns `false` or produces garbage. Cosmetic-tweak loop touches a `.png` icon → run breaks unexpectedly.
**Why it happens:** Unified diff isn't a binary-safe format; git emits `Binary files a/x.png and b/x.png differ` placeholders.
**How to avoid:** In `applyChangeSet`, detect the `Binary files ... differ` marker on `parsePatch` output; record `{ status: "skipped-error", error: "binary-not-supported" }` and let Phase 5 review-loop decide.
**Warning signs:** Test fixture with PNG file; diff that fails silently.

### Pitfall 4: `path.resolve` doesn't catch symlink escapes

**What goes wrong:** Adapter resolves to a path inside `workspaceRoot`, but the path is itself a symlink pointing outside. `lstat` on the path says "symlink"; `stat` (or `readFile` without lstat) follows it and reads `/etc/passwd`.
**Why it happens:** `path.resolve` is purely lexical; it doesn't traverse symlinks.
**How to avoid:** **Always `lstat` first**, refuse symlinks per Q-06. Re-canonicalize per op. Combined with the clone-time tree audit, this is belt-and-suspenders.
**Warning signs:** A test that creates a symlink inside a workspace and asserts the FS adapter refuses it must be in the success-criterion suite.

### Pitfall 5: Subprocess runner not flushing log streams before resolving

**What goes wrong:** Test/operator reads `subprocess/{n}-stdout.log` and sees truncated content. Streams flushed asynchronously after process exits.
**Why it happens:** `child.on("exit")` fires before pipe→file flush completes.
**How to avoid:** `await new Promise<void>(res => stream.end(res))` for both stdout and stderr file streams before resolving the runner promise.
**Warning signs:** Flaky tail-vs-disk-mismatch tests.

### Pitfall 6: `fs.rm` race with antivirus / Spotlight on macOS

**What goes wrong:** `EBUSY` / `ENOTEMPTY` on cleanup of just-cloned workspaces.
**How to avoid:** `fs.rm(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })`. Document tombstone semantics — failed cleanups become tombstones for operator inspection (Q-11).

### Pitfall 7: `link:` not fully purged after `package.json` edit

**What goes wrong:** Replace `link:` with `0.2.0`; `pnpm install` succeeds but lockfile still pins the link target.
**How to avoid:** After edit, `pnpm install --force` or delete `pnpm-lock.yaml` entry for `@dogpile/sdk` and re-resolve. Add a Wave-N task to verify on a sibling-less machine (`mv ~/Code/dogpile ~/Code/dogpile.bak; rm -rf node_modules; pnpm install`).
**Warning signs:** REPO-08 success-criterion test: `pnpm install` on fresh clone with no sibling `dogpile/` succeeds.

### Pitfall 8: Confirmed-intent schema bump cascades through fixtures

**What goes wrong:** Bump `schemaVersion: "1.1.0"` → `"1.2.0"` (Q-14). Existing examples + admission-e2e fixtures still encode `"1.1.0"` literal. Tests fail.
**How to avoid:** Audit every occurrence: schema file, `parseConfirmedIntent` `readOptionalSchemaVersion`, `mintConfirmedIntent` literal, all `examples/intents/*.json`, all admission-e2e fixtures, contract tests that pin the literal. Phase 1/2 pattern (Plan 02-03 hard-bump) is the precedent — follow same task structure.
**Warning signs:** Phase 1/2 test suites fail after schema edit.

---

## Code Examples

### Cloning with credentialRef (Q-04)

```typescript
// Source: Context7 isomorphic-git/onAuth.md + clone.md
import git from "isomorphic-git";
import http from "isomorphic-git/http/node";
import fs from "node:fs";

async function cloneWithCredentialRef(target: RepoTarget, dir: string) {
  let onAuthCallCount = 0;
  await git.clone({
    fs, http, dir,
    url: target.url,
    singleBranch: true,
    depth: 1,
    onAuth: () => {
      onAuthCallCount += 1;
      if (onAuthCallCount > 2) return { cancel: true };
      if (target.credentialRef !== undefined) {
        const token = process.env[target.credentialRef];
        if (token === undefined) return { cancel: true };
        return { username: token, password: "x-oauth-basic" }; // GitHub PAT pattern
      }
      // anonymous / system fallback (Q-04): isomorphic-git has no system-helper integration;
      // returning {} forwards the original Authorization-less request, which works for public repos.
      return {};
    }
  });
}
```

### statusMatrix-based dirty detection (Q-13)

```typescript
// Source: Context7 isomorphic-git/statusMatrix.md
import git from "isomorphic-git";
import fs from "node:fs";

export async function dirtyWorktreeStatus(dir: string): Promise<{
  isDirty: boolean;
  dirtyFiles: readonly string[];
}> {
  const FILE = 0, HEAD = 1, WORKDIR = 2, STAGE = 3;
  const matrix = await git.statusMatrix({ fs, dir });
  // semantics: git status --porcelain --untracked-files=no
  // "tracked-file modifications block; untracked don't"
  const dirtyFiles = matrix
    .filter(row => row[HEAD] === 1 && (row[WORKDIR] !== row[HEAD] || row[STAGE] !== row[HEAD]))
    .map(row => row[FILE] as string);
  return { isDirty: dirtyFiles.length > 0, dirtyFiles };
}
```

### Symlink tree audit (Q-06)

```typescript
// Source: Node.js fs/promises docs (Node 22 recursive readdir)
import { readdir } from "node:fs/promises";
import { join } from "node:path";

export async function findSymlinks(workspaceDir: string): Promise<readonly string[]> {
  const symlinks: string[] = [];
  const entries = await readdir(workspaceDir, { withFileTypes: true, recursive: true });
  for (const entry of entries) {
    if (entry.isSymbolicLink()) {
      // Node 22 recursive Dirent has parentPath/path
      const parent = (entry as unknown as { parentPath?: string }).parentPath ?? workspaceDir;
      symlinks.push(join(parent, entry.name));
    }
  }
  return symlinks;
}
```

### Unified-diff apply with pre-image hash gate (Q-10 + CONFLICT-01 resolution)

```typescript
// Source: jsdocs.io diff@9.0.0 (parsePatch, applyPatch)
import { applyPatch, parsePatch } from "diff";
import { createHash } from "node:crypto";

export async function applyOnePatch(
  fs: FsAdapter,
  patch: { path: string; diff: string; preImageSha256: string },
  authorityOp: AuthorizedWorkspaceOp
): Promise<{ status: "applied" | "skipped-hash-mismatch" | "skipped-error"; error?: string }> {
  const preImage = await fs.readFile(authorityOp);
  const hash = createHash("sha256").update(preImage).digest("hex");
  if (hash !== patch.preImageSha256) {
    return { status: "skipped-hash-mismatch" };
  }
  const structured = parsePatch(patch.diff);
  const isBinary = structured.some(p => /^Binary files /.test((p.hunks?.[0]?.lines?.[0] ?? "") as string));
  if (isBinary) return { status: "skipped-error", error: "binary-not-supported" };
  const result = applyPatch(preImage.toString("utf8"), structured[0]!);
  if (result === false) return { status: "skipped-error", error: "hunk-fit-failure" };
  await fs.writeFile(authorityOp, Buffer.from(result, "utf8"));
  return { status: "applied" };
}
```

### `resolveWorkspaceRoot()` (Q-15)

```typescript
// Source: Node.js fs.access docs; protostar @protostar/paths package design
import { access } from "node:fs/promises";
import { dirname, resolve } from "node:path";

export async function resolveWorkspaceRoot(start: string = process.cwd()): Promise<string> {
  let dir = resolve(start);
  for (;;) {
    try {
      await access(resolve(dir, "pnpm-workspace.yaml"));
      return dir;
    } catch { /* not here */ }
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error(`No pnpm-workspace.yaml found walking up from ${start}.`);
    }
    dir = parent;
  }
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `process.env.INIT_CWD ?? process.cwd()` (current `main.ts:172, 199`) | `@protostar/paths.resolveWorkspaceRoot()` walking to `pnpm-workspace.yaml` | Phase 3 (Q-15) | Reliable in subdirs, scripts, and CI runners |
| `link:../../../dogpile` sibling-repo link | Pinned `@dogpile/sdk@0.2.0` from npm | Phase 3 (Q-16) | Fresh-clone installable; no sibling-repo coupling |
| Hardcoded `trust: "trusted"` (removed in Phase 2) → no real workspace I/O | Branded `AuthorizedWorkspaceOp` consumed by FS adapter; real clone+branch | Phase 3 | First real I/O behind the dark factory |
| `node:fs.readdir` with manual recursion + per-path `lstat` | `readdir({ withFileTypes: true, recursive: true })` + `dirent.isSymbolicLink()` | Node 22 | One-pass tree walk; faster on large repos |
| `child_process.exec` shell strings | `spawn(cmd, argv, { shell: false })` array form + per-cmd schema | Phase 3 (Q-08) | No shell injection surface |

**Deprecated/outdated:**
- `nodegit` (native bindings) — explicitly rejected per Q-01
- shelling out to system `git` — Q-01 rejected
- `diff-apply@1.0.6` — pulls 7 transitive deps for fuzzy match we don't need

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `diff@9.0.0` `parsePatch` recognizes git-dialect headers (`isGit`, `isRename`) without extra config | Code Examples / CONFLICT-01 | Patches from real-world `git diff` output may need pre-processing; minor planner adjustment |
| A2 | `isomorphic-git/http/node` is the right HTTP transport for our Node 22 server-side use | Standard Stack | Minor — falls back to documented use, but verify in Wave 0 smoke test |
| A3 | Node 22's `readdir({ withFileTypes: true, recursive: true })` populates `dirent.parentPath` | Code Examples (symlink audit) | If absent, fall back to manual recursion — minor perf hit, no correctness impact |
| A4 | `@dogpile/sdk@0.2.0` exports `AgentSpec`, `DogpileOptions`, `budget`, `convergence`, `firstOf` matching the `dogpile-types` shim | Standard Stack | If types diverge, shim must adapt — Wave 0 task to verify with `tsc --noEmit` against re-export |
| A5 | `isomorphic-git.clone` with empty `onAuth` (no creds) succeeds for public repos | Code Examples (clone) | If GitHub rejects, must add `User-Agent` header or anonymous-clone branch — minor |
| A6 | `apps/factory-cli/src/main.test.ts` (2930 lines) does not assume `INIT_CWD`-based path resolution in a way that breaks under `resolveWorkspaceRoot()` | Phase Requirements (REPO-07) | Risk medium — verify test fixtures don't depend on `INIT_CWD` quirks |

**Empty-table check:** This research has 6 assumptions tagged. The Q-10 mechanism revision (CONFLICT-01) is **not** an assumption — it's a verified fact backed by Context7 alphabetic index + WebSearch + multiple authoritative sources.

---

## Open Questions

1. **Should `dogpile-types` shim be deleted or retained?**
   - What we know: `@dogpile/sdk@0.2.0` is published with `./types` subpath; surfaces match the shim.
   - What's unclear: User intent on adapter-pattern indirection.
   - Recommendation: **Retain as re-export shim** (`export type { AgentSpec, DogpileOptions } from "@dogpile/sdk/types"; export { budget, convergence, firstOf } from "@dogpile/sdk"`). Preserves authority-boundary insulation; if upstream surface drifts, shim absorbs the change.

2. **`isomorphic-git` rename detection for patch apply?**
   - What we know: `parsePatch` exposes `isRename` flag on git-dialect patches.
   - What's unclear: Q-01 note flagged "Patch-apply edge cases historically lag git proper — Phase 3 tests must exercise rename-detection and binary-file paths explicitly."
   - Recommendation: Wave-N task — write contract test for rename patch; if `applyPatch` mishandles, record as known limitation in CONCERNS.md and emit `{ status: "skipped-error", error: "rename-not-supported" }` for v1.

3. **`@protostar/paths` API surface beyond `resolveWorkspaceRoot()`?**
   - What we know: AGENTS.md carve-out is "deterministic path resolution only — no I/O, no business logic" (Q-15 note).
   - What's unclear: Whether to expose internal helpers (`isWorkspaceMember`, `relativeToWorkspace`) now or wait.
   - Recommendation: Single export `resolveWorkspaceRoot(): Promise<string>` for v1. Add helpers only when a second consumer needs them.

4. **Wave 0 vs Wave 1 split?**
   - What we know: Phase 1/2 pattern uses Wave 0 for skeletal/scaffolding plans, Wave 1+ for parallel implementation.
   - Recommendation (planner-actionable): Wave 0 = `@protostar/paths` skeleton + `@protostar/repo` deps install + CONFLICT-01 erratum; Wave 1 = FS adapter, subprocess runner, symlink audit, sacrificial-repo helper (parallel); Wave 2 = clone, applyChangeSet, dirtyWorktreeStatus (parallel, depend on Wave 1); Wave 3 = factory-cli wiring + cleanup + admission decision; Wave 4 = admission-e2e contract suite + `.env.example` + `@dogpile/sdk` pin.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | runtime | ✓ | v22.22.1 (machine) / `>=22` declared in root `package.json` | — |
| pnpm | package manager | ✓ | `pnpm@10.33.0` (root `packageManager`) | — |
| TypeScript | build | ✓ | `^6.0.3` | — |
| `isomorphic-git` (npm) | Phase 3 NEW | ✓ | `1.37.6` published 2026-04-27 | none — Q-01 lock |
| `diff` (npm) | Phase 3 NEW (CONFLICT-01) | ✓ | `9.0.0` published 2026-04-13 | `diff-apply` (7 deps) — rejected |
| `@dogpile/sdk` (npm) | Phase 3 (REPO-08) | ✓ | `0.2.0` published 2026-04-25 | none — Q-16 lock |
| Network access to `registry.npmjs.org` | install | (assumed CI/dev) | — | offline cache via pnpm store |
| GitHub API access for clone | runtime (test fixture if any uses live URL) | NOT REQUIRED | — | All clone tests use sacrificial repo (Q-18 builds programmatically; no network) |
| System `git` binary | NOT REQUIRED (Q-01) | — | — | — |

**Missing dependencies with no fallback:** None.
**Missing dependencies with fallback:** None.

All Phase 3 tools are installable via the registry; tests run hermetic via `buildSacrificialRepo` and `os.tmpdir()`.

---

## Validation Architecture

`workflow.nyquist_validation: true` (config.json), so this section is included.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | `node:test` built-in (Node 22) |
| Config file | none — per-package `package.json` scripts of form `pnpm run build && node --test "dist/**/*.test.js"` |
| Quick run command | `pnpm --filter @protostar/repo test` (per-package) |
| Full suite command | `pnpm run verify:full` (root) — `tsc -b && pnpm -r test` |
| Phase gate | `pnpm run verify:full` green before `/gsd-verify-work` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| REPO-01 | `defineWorkspace` accepts `RepoTarget`, produces `WorkspaceRef`; admission decision records `auth.mode` + `auth.credentialRef` (name only) | unit + contract | `pnpm --filter @protostar/repo test` (test file `clone-workspace.test.ts` — NEW) | ❌ Wave 0 |
| REPO-02 | clone, checkout, branch from base SHA against sacrificial repo | unit | `pnpm --filter @protostar/repo test` (`clone-workspace.test.ts`) | ❌ Wave 0 |
| REPO-03 | FS adapter refuses path outside workspace; refuses symlinks | unit | `pnpm --filter @protostar/repo test` (`fs-adapter.test.ts` — NEW) | ❌ Wave 0 |
| REPO-04 | subprocess runner refuses out-of-allowlist arg; refuses out-of-schema flag; refuses ref-pattern violation | unit | `pnpm --filter @protostar/repo test` (`subprocess-runner.test.ts`, `argv-pattern-guard.test.ts` — NEW) | ❌ Wave 0 |
| REPO-05 | `applyChangeSet` apply 5 patches; on patch 3 hash mismatch, patches 1,2,4,5 applied + 3 evidenced | unit | `pnpm --filter @protostar/repo test` (`apply-change-set.test.ts` — NEW) | ❌ Wave 0 |
| REPO-06 | dirty-worktree refusal; `allowDirty: true` capability bypasses | unit + e2e | `pnpm --filter @protostar/repo test` + `pnpm --filter @protostar/admission-e2e test` | ❌ Wave 0 |
| REPO-07 | `resolveWorkspaceRoot()` finds `pnpm-workspace.yaml` from subdir; throws when absent | unit | `pnpm --filter @protostar/paths test` (NEW package) | ❌ Wave 0 |
| REPO-08 | `pnpm install` succeeds with no sibling `dogpile/` directory | smoke | `mv ~/Code/dogpile ~/Code/dogpile.bak; rm -rf node_modules; pnpm install` (manual or CI matrix) | ❌ Manual gate |
| REPO-09 | `.env.example` documents `GITHUB_PAT`, `LM_STUDIO_ENDPOINT`, `LM_STUDIO_CODER_MODEL`, `LM_STUDIO_JUDGE_MODEL` | static | grep test in `apps/factory-cli/src/main.test.ts` or new `env-example.test.ts` | ❌ Wave N |

**Cross-package contract tests** (in `packages/admission-e2e`):
- Dirty-worktree refusal evidence shape
- Symlink refusal evidence shape
- Subprocess-allowlist refusal evidence shape
- Patch-apply best-effort partial-result evidence shape
- Hash-mismatch refusal evidence shape

### Sampling Rate

- **Per task commit:** `pnpm --filter @protostar/{affected-package} test` (~5–15s per package)
- **Per wave merge:** `pnpm run verify:full` (full suite, all packages)
- **Phase gate:** `pnpm run verify:full` green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `packages/repo/internal/test-fixtures/build-sacrificial-repo.ts` — programmatic git-repo builder using `isomorphic-git` `init`/`commit`/`branch`
- [ ] `packages/repo/internal/test-fixtures/index.ts` — subpath barrel
- [ ] `packages/repo/internal/test-fixtures/build-sacrificial-repo.test.ts` — fixture self-test
- [ ] `packages/repo/src/clone-workspace.test.ts`, `fs-adapter.test.ts`, `apply-change-set.test.ts`, `dirty-worktree-status.test.ts`, `subprocess-runner.test.ts`, `argv-pattern-guard.test.ts`, `symlink-audit.test.ts`
- [ ] `packages/paths/` — full new package skeleton (src/, test, package.json, tsconfig.json)
- [ ] `packages/repo/package.json` exports — add `./internal/test-fixtures` subpath
- [ ] `packages/repo/package.json` deps — add `isomorphic-git`, `diff`, `@protostar/paths`
- [ ] `packages/admission-e2e` — new contract test files for the five evidence shapes listed above
- [ ] `packages/intent/schema/confirmed-intent.schema.json` — bump 1.1.0 → 1.2.0 with `workspace.allowDirty`
- [ ] `apps/factory-cli/src/main.ts` — replace two `INIT_CWD ?? cwd()` sites with `resolveWorkspaceRoot()`; wire clone/cleanup; wire `defineWorkspace` to consume `RepoTarget`
- [ ] `.env.example` (new file)
- [ ] `.gitignore` — add `.protostar/workspaces/`

---

## Security Domain

`security_enforcement` is implicit-enabled (no explicit `false` in config.json). This phase is the FIRST real-I/O surface — security is load-bearing.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes (clone auth) | `onAuth` callback returning `{ username: token, password: "x-oauth-basic" }` for GitHub PAT; never log token; cancel after 2 retries |
| V3 Session Management | no | (no sessions in Phase 3) |
| V4 Access Control | yes | Capability-envelope-driven FS adapter + subprocess allowlist; brand-only entry from Phase 2; belt-and-suspenders mint+adapter check |
| V5 Input Validation | yes (critical) | Outer pattern guard + per-command schema for argv (Q-08); `isomorphic-git` does its own ref-name validation; `diff.parsePatch` validates patch structure |
| V6 Cryptography | yes | `node:crypto` `createHash("sha256")` for pre-image verification — never hand-roll |
| V7 Error Handling and Logging | yes | Refusal artifacts via `.protostar/refusals.jsonl` triple-write (Phase 1/2 pattern); admission decisions never log secret values, only ref names |
| V12 File and Resources | yes | Symlink refusal (Q-06); `path.resolve` + `relative` escape detection; `lstat`-first |
| V14 Configuration | yes | Hardcoded baseline allowlist, intersect-with-policy union, never remove (Q-07) |

### Known Threat Patterns for Phase 3 Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Argv injection via PR title / branch name (CONCERNS.md, ROADMAP.md risk register) | Tampering | Two-layer guard (Q-08): outer flag-pattern, inner per-command schema; `spawn` array form, never shell strings |
| Path traversal via patch path (`../../etc/passwd`) | Tampering | FS adapter re-canonicalizes via `path.resolve`; rejects `relative(root, resolved).startsWith("..")` |
| Symlink TOCTOU (path inside workspace, but symlink target outside) | Tampering, Info Disclosure | `lstat` per op; tree-wide symlink-refusal at clone (Q-06); double-check at adapter |
| Credential leak via admission-decision evidence | Info Disclosure | Decision records `auth.credentialRef` **name** only (Q-04 note); env-var values never persisted to artifacts |
| Recursive workspace clone (workspaceRoot inside source repo) | DoS, Tampering | Validate `workspaceRoot` lives outside source repo at config-load time (Q-02 note) |
| Bad PAT retry storm via `onAuth` | DoS | Closure-tracked invocation counter; `{ cancel: true }` after N=2 |
| Patch-apply on unintended file (post-clone tree mutation) | Tampering | Pre-image SHA-256 verification per file (Q-10); fresh-clone-per-run (Q-03) eliminates pre-existing-state vector |
| Disk-fill via tombstone accumulation on stuck-run streak (Q-11 note) | DoS | Repo-policy `tombstoneRetentionHours` (default 24); document in CONCERNS.md |
| Sibling-repo `link:` privilege escalation (current `@dogpile/sdk` link allows arbitrary sibling code injection) | Tampering | REPO-08 — pin to published `0.2.0` version |

---

## Sources

### Primary (HIGH confidence)
- **Context7** `/isomorphic-git/isomorphic-git` — clone, branch, checkout, statusMatrix, init, commit, onAuth surfaces; alphabetic command index (73 functions, none named `apply`)
- **isomorphic-git.org/docs/en/alphabetic** (via WebFetch) — confirmed no `apply`/`applyPatch`/`patch`/`am`/`diff` function exported
- **`npm view isomorphic-git@1.37.6`** (2026-04-27) — version, deps, exports map
- **`npm view diff@9.0.0`** (2026-04-13) — version, license, types, exports
- **`npm view @dogpile/sdk@0.2.0`** (2026-04-25) — published, zero deps, Apache-2.0, exports map (incl. `./types`)
- **Node.js docs** `nodejs.org/api/child_process` — `spawn` array form bypasses shell; `exec` warning
- **Node.js docs** `nodejs.org/api/fs` — `readdir({ withFileTypes, recursive })` Node 22 native; `rm({ maxRetries, retryDelay })`

### Secondary (MEDIUM confidence)
- **Snyk Advisor** `diff.parsePatch` / `diff.applyPatch` signatures — verified return types (`StructuredPatch[]`, `string | false`)
- **OWASP child-process guidance** (eslint-plugin-security) — argv-allowlist, never `exec`
- **CONTEXT.md Q-01..Q-18** — user locks; absorbed verbatim into User Constraints

### Tertiary (LOW confidence)
- (none required — all critical claims verified against primary sources)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — versions verified against npm registry today
- Architecture: HIGH — Phase 1/2 patterns are precedent; new mechanisms (FS adapter, subprocess runner) follow Q-05/Q-08 user locks
- Pitfalls: HIGH — CONFLICT-01 verified against authoritative source; statusMatrix semantics verified against official docs
- Security: HIGH — STRIDE coverage maps to CONCERNS.md and ROADMAP risk register
- Validation: HIGH — `node:test` + per-package + admission-e2e is the established Phase 1/2 pattern

**Research date:** 2026-04-27
**Valid until:** 2026-05-27 (30 days; isomorphic-git is fast-moving — re-verify version at plan time)

---

## RESEARCH COMPLETE

**Phase:** 3 — Repo Runtime + Sandbox
**Confidence:** HIGH

### Key Findings
- **CONFLICT-01 (load-bearing):** Q-10 says "apply via isomorphic-git's apply" but isomorphic-git ships **no** apply/applyPatch/patch API (verified against the 73-function alphabetic index). Recommendation: adopt `diff@9.0.0` (`parsePatch` + `applyPatch`) as the second runtime dep on `@protostar/repo`. Planner must surface this in a decision-revision before drafting Wave 0.
- **CONFLICT-02 (specification):** Q-13 statusMatrix semantics require explicit filtering (`HEAD === 1 && (WORKDIR ≠ HEAD || STAGE ≠ HEAD)`); naive `matrix.length > 0` reports dirty on every fresh clone with build artifacts.
- `@dogpile/sdk@0.2.0` is published, zero-dep, Apache-2.0 — pin and re-export types via the existing `dogpile-types` shim (recommendation: retain shim as re-export layer).
- Node 22's recursive `readdir({withFileTypes, recursive})` + `dirent.isSymbolicLink()` is the standard one-pass symlink audit.
- Subprocess runner pattern: `spawn(cmd, argv, {shell:false})` + outer flag-pattern + per-cmd schema + stream-to-file + rolling tail buffer + flush-on-exit.
- Confirmed-intent schema bump 1.1.0 → 1.2.0 cascades across schema file, parser, mint helper, ALL example fixtures, and Phase 1/2 contract tests — Wave-N audit task required.

### File Created
`/Users/zakkeown/Code/protostar/.planning/phases/03-repo-runtime-sandbox/03-RESEARCH.md`

### Confidence Assessment
| Area | Level | Reason |
|------|-------|--------|
| Standard Stack | HIGH | All three new deps verified against npm registry on research date |
| Architecture | HIGH | Phase 1/2 patterns precedent; Q-05/Q-08 user locks specify mint+adapter shape |
| Pitfalls | HIGH | CONFLICT-01 verified authoritatively; statusMatrix and symlink edges verified against official docs |
| Security | HIGH | STRIDE map covers CONCERNS.md + ROADMAP risk register entries |

### Open Questions (deferred to plan-phase)
1. `dogpile-types` shim role — recommend retain as re-export
2. `isomorphic-git` rename-detection edge case — Wave-N contract test
3. `@protostar/paths` API surface beyond `resolveWorkspaceRoot()` — single export for v1
4. Wave 0 vs Wave 1 split — recommended sequencing in Open Questions §4

### Ready for Planning
Research complete. **Planner: address CONFLICT-01 first (decision revision: `diff@9.0.0` for patch mechanics, not `isomorphic-git.apply` which does not exist) before drafting Wave 0 tasks.**
