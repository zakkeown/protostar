import * as fs from "node:fs";

import git from "isomorphic-git";

const FILE = 0;
const BASE = 1;
const WORKDIR = 2;
const STAGE = 3;

export async function computeDiffNameOnly(input: {
  readonly workspaceRoot: string;
  readonly baseRef: string;
  readonly headRef?: string;
}): Promise<readonly string[]> {
  const changedAtHead = await namesChangedAtRef(input.workspaceRoot, input.baseRef);
  if (input.headRef === undefined || input.headRef === "HEAD") {
    return changedAtHead;
  }

  const currentHead = await git.resolveRef({ fs, dir: input.workspaceRoot, ref: "HEAD" });
  try {
    await git.checkout({ fs, dir: input.workspaceRoot, ref: input.headRef });
    return await namesChangedAtRef(input.workspaceRoot, input.baseRef);
  } finally {
    await git.checkout({ fs, dir: input.workspaceRoot, ref: currentHead });
  }
}

async function namesChangedAtRef(workspaceRoot: string, baseRef: string): Promise<readonly string[]> {
  const matrix = await git.statusMatrix({ fs, dir: workspaceRoot, ref: baseRef });
  return matrix
    .filter((row) => row[WORKDIR] !== row[BASE] || row[STAGE] !== row[BASE])
    .map((row) => String(row[FILE]))
    .sort();
}
