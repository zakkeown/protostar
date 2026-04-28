export interface WorkspaceRef {
  readonly root: string;
  readonly defaultBranch?: string;
  readonly trust: "trusted" | "untrusted";
}

export interface PatchArtifact {
  readonly path: string;
  readonly operation: "add" | "modify" | "delete";
  readonly summary: string;
}

export interface RepoChangeSet {
  readonly workspace: WorkspaceRef;
  readonly branch: string;
  readonly patches: readonly PatchArtifact[];
}

export function defineWorkspace(input: WorkspaceRef): WorkspaceRef {
  if (input.root.trim().length === 0) {
    throw new Error("Workspace root must not be empty.");
  }
  return input;
}

export {
  __resetCloneWorkspaceDependenciesForTests,
  __setCloneWorkspaceDependenciesForTests,
  buildOnAuth,
  cloneWorkspace,
  CredentialRefusedError
} from "./clone-workspace.js";
export type { CloneAuthMode, CloneRequest, CloneResult } from "./clone-workspace.js";
export { cleanupWorkspace } from "./cleanup-workspace.js";
export type { CleanupOptions, CleanupReason, TombstoneRecord } from "./cleanup-workspace.js";
export { deleteFile, FsAdapterError, readFile, writeFile } from "./fs-adapter.js";
export type { AuthorizedWorkspaceOp, FsAdapter, FsAdapterErrorReason } from "./fs-adapter.js";
export { applyChangeSet } from "./apply-change-set.js";
export type { ApplyError, ApplyResult, ApplyStatus, PatchRequest } from "./apply-change-set.js";
export { applyOuterPatternGuard, ArgvViolation } from "./argv-pattern-guard.js";
export type { ArgvViolationReason, OuterGuardSchema } from "./argv-pattern-guard.js";
export { dirtyWorktreeStatus } from "./dirty-worktree-status.js";
export type { DirtyWorktreeStatus } from "./dirty-worktree-status.js";
export { intersectAllowlist, SUBPROCESS_BASELINE_ALLOWLIST } from "./subprocess-allowlist.js";
export { DEFAULT_REPO_POLICY, loadRepoPolicy, parseRepoPolicy } from "./repo-policy.js";
export type { ParseRepoPolicyResult, RepoPolicy } from "./repo-policy.js";
export { runCommand, SubprocessRefusedError } from "./subprocess-runner.js";
export type {
  AuthorizedSubprocessOp,
  RunCommandOptions,
  SubprocessRefusedReason,
  SubprocessResult
} from "./subprocess-runner.js";
export { GIT_SCHEMA, NODE_SCHEMA, PNPM_SCHEMA, TSC_SCHEMA } from "./subprocess-schemas/index.js";
export type { CommandSchema } from "./subprocess-schemas/index.js";
export { auditSymlinks } from "./symlink-audit.js";
export type { SymlinkAuditResult } from "./symlink-audit.js";
export { assertWorkspaceTrust, WorkspaceTrustError } from "./workspace-trust-runtime.js";
export type { RuntimeWorkspaceOp } from "./workspace-trust-runtime.js";
