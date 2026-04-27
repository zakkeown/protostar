import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { DENY_ALL_REPO_POLICY, parseRepoPolicy, type RepoPolicy } from "@protostar/authority";

export async function loadRepoPolicy(workspaceRoot: string): Promise<RepoPolicy> {
  const filePath = join(workspaceRoot, ".protostar", "repo-policy.json");
  let raw: string;

  try {
    raw = await readFile(filePath, "utf8");
  } catch (error: unknown) {
    if (isNodeErrno(error) && error.code === "ENOENT") {
      return DENY_ALL_REPO_POLICY;
    }
    throw error;
  }

  const parsed = parseRepoPolicy(JSON.parse(raw));
  if (!parsed.ok) {
    throw new Error(`invalid .protostar/repo-policy.json: ${parsed.errors.join("; ")}`);
  }

  return parsed.policy;
}

function isNodeErrno(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && "code" in error;
}
