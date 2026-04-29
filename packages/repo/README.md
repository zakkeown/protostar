# @protostar/repo

Filesystem-authorized repository runtime for clone, workspace access, patch apply, subprocesses, policy, and cleanup.

## Public exports

- `WorkspaceRef` - public surface exported from `src/index.ts`.
- `PatchArtifact` - public surface exported from `src/index.ts`.
- `RepoChangeSet` - public surface exported from `src/index.ts`.
- `defineWorkspace` - public surface exported from `src/index.ts`.
- `export { CloneAuthMode, CloneRequest, CloneResult } from "./clone-workspace.js"` - public surface exported from `src/index.ts`.
- `export { cleanupWorkspace } from "./cleanup-workspace.js"` - public surface exported from `src/index.ts`.
- `export { CleanupOptions, CleanupReason, TombstoneRecord } from "./cleanup-workspace.js"` - public surface exported from `src/index.ts`.
- `export { deleteFile, FsAdapterError, readFile, writeFile } from "./fs-adapter.js"` - public surface exported from `src/index.ts`.
- `export { AuthorizedWorkspaceOp, FsAdapter, FsAdapterErrorReason } from "./fs-adapter.js"` - public surface exported from `src/index.ts`.
- `export { applyChangeSet } from "./apply-change-set.js"` - public surface exported from `src/index.ts`.
- `export { ApplyError, ApplyResult, ApplyStatus, PatchRequest } from "./apply-change-set.js"` - public surface exported from `src/index.ts`.
- `export { applyOuterPatternGuard, ArgvViolation } from "./argv-pattern-guard.js"` - public surface exported from `src/index.ts`.
- `export { ArgvViolationReason, OuterGuardSchema } from "./argv-pattern-guard.js"` - public surface exported from `src/index.ts`.
- `export { dirtyWorktreeStatus } from "./dirty-worktree-status.js"` - public surface exported from `src/index.ts`.
- `export { DirtyWorktreeStatus } from "./dirty-worktree-status.js"` - public surface exported from `src/index.ts`.
- `export { intersectAllowlist, SUBPROCESS_BASELINE_ALLOWLIST } from "./subprocess-allowlist.js"` - public surface exported from `src/index.ts`.
- `export { DEFAULT_REPO_POLICY, loadRepoPolicy, parseRepoPolicy } from "./repo-policy.js"` - public surface exported from `src/index.ts`.
- `export { ParseRepoPolicyResult, RepoPolicy } from "./repo-policy.js"` - public surface exported from `src/index.ts`.

## Runtime dependencies

- `@protostar/authority`
- `@protostar/paths`
- `diff`
- `isomorphic-git`

## Authority constraints

fs-permitted, network-forbidden filesystem tier. Repository reads/writes, clone, patch application, subprocess allowlists, cleanup, and workspace checks stay scoped to authorized workspaces.

## Change log

See [root CHANGELOG.md](../../CHANGELOG.md) (managed by changesets).
