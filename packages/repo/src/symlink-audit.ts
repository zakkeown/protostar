import { readdir } from "node:fs/promises";
import { join, relative, sep } from "node:path";

export interface SymlinkAuditResult {
  readonly ok: boolean;
  /** Workspace-relative POSIX-style paths of all symlinks found. Empty when ok=true. */
  readonly offendingPaths: readonly string[];
}

export async function auditSymlinks(workspaceRoot: string): Promise<SymlinkAuditResult> {
  const entries = await readdir(workspaceRoot, {
    withFileTypes: true,
    recursive: true
  });

  if (entries.some((entry) => getDirentParentPath(entry) === undefined)) {
    return auditSymlinksByManualWalk(workspaceRoot);
  }

  const offendingPaths = entries
    .filter((entry) => entry.isSymbolicLink())
    .map((entry) => {
      const parent = getDirentParentPath(entry) ?? workspaceRoot;
      return toWorkspaceRelativePath(workspaceRoot, join(parent, entry.name));
    })
    .sort();

  return {
    ok: offendingPaths.length === 0,
    offendingPaths
  };
}

async function auditSymlinksByManualWalk(workspaceRoot: string): Promise<SymlinkAuditResult> {
  const offendingPaths: string[] = [];
  await collectSymlinks(workspaceRoot, workspaceRoot, offendingPaths);
  offendingPaths.sort();

  return {
    ok: offendingPaths.length === 0,
    offendingPaths
  };
}

async function collectSymlinks(
  workspaceRoot: string,
  currentDir: string,
  offendingPaths: string[]
): Promise<void> {
  const entries = await readdir(currentDir, { withFileTypes: true });
  for (const entry of entries) {
    const absolutePath = join(currentDir, entry.name);
    if (entry.isSymbolicLink()) {
      offendingPaths.push(toWorkspaceRelativePath(workspaceRoot, absolutePath));
    } else if (entry.isDirectory()) {
      await collectSymlinks(workspaceRoot, absolutePath, offendingPaths);
    }
  }
}

function getDirentParentPath(entry: { readonly parentPath?: string; readonly path?: string }): string | undefined {
  return entry.parentPath ?? entry.path;
}

function toWorkspaceRelativePath(workspaceRoot: string, absolutePath: string): string {
  return relative(workspaceRoot, absolutePath).split(sep).join("/");
}
