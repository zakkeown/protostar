import * as fs from "node:fs";

import git from "isomorphic-git";

export interface DirtyWorktreeStatus {
  readonly isDirty: boolean;
  /** Workspace-relative tracked paths whose HEAD entry differs from workdir or index. */
  readonly dirtyFiles: readonly string[];
}

/** Wraps isomorphic-git statusMatrix with git status --untracked-files=no semantics. */
export async function dirtyWorktreeStatus(dir: string): Promise<DirtyWorktreeStatus> {
  const FILE = 0;
  const HEAD = 1;
  const WORKDIR = 2;
  const STAGE = 3;
  const matrix = await git.statusMatrix({ fs, dir });
  const dirtyFiles = matrix
    .filter((row) => row[HEAD] === 1 && (row[WORKDIR] !== row[HEAD] || row[STAGE] !== row[HEAD]))
    .map((row) => String(row[FILE]))
    .sort();

  return {
    isDirty: dirtyFiles.length > 0,
    dirtyFiles
  };
}
