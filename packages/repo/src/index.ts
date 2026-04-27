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

export { deleteFile, FsAdapterError, readFile, writeFile } from "./fs-adapter.js";
export type { AuthorizedWorkspaceOp, FsAdapterErrorReason } from "./fs-adapter.js";
export { applyChangeSet } from "./apply-change-set.js";
export type { ApplyError, ApplyResult, ApplyStatus, PatchRequest } from "./apply-change-set.js";
export { applyOuterPatternGuard, ArgvViolation } from "./argv-pattern-guard.js";
export type { ArgvViolationReason, OuterGuardSchema } from "./argv-pattern-guard.js";
export { intersectAllowlist, SUBPROCESS_BASELINE_ALLOWLIST } from "./subprocess-allowlist.js";
export { runCommand, SubprocessRefusedError } from "./subprocess-runner.js";
export type {
  AuthorizedSubprocessOp,
  RunCommandOptions,
  SubprocessRefusedReason,
  SubprocessResult
} from "./subprocess-runner.js";
export { assertWorkspaceTrust, WorkspaceTrustError } from "./workspace-trust-runtime.js";
export type { RuntimeWorkspaceOp } from "./workspace-trust-runtime.js";
