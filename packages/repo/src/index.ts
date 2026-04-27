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
export { assertWorkspaceTrust, WorkspaceTrustError } from "./workspace-trust-runtime.js";
export type { RuntimeWorkspaceOp } from "./workspace-trust-runtime.js";
