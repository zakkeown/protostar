import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";

import type { RepoReader } from "@protostar/execution";

export function createFsRepoReader(opts: { readonly workspaceRoot: string }): RepoReader {
  const root = resolve(opts.workspaceRoot);

  function resolveWorkspacePath(path: string): string {
    const abs = resolve(root, path);
    if (abs !== root && !abs.startsWith(root + sep)) {
      throw new Error(`path escapes workspace: ${path}`);
    }
    return abs;
  }

  return {
    async readFile(path) {
      const bytes = await readFile(resolveWorkspacePath(path));
      return {
        bytes,
        sha256: createHash("sha256").update(bytes).digest("hex")
      };
    },

    async glob(pattern) {
      const entries = await readdir(root, { recursive: true, withFileTypes: true });
      return entries
        .filter((entry) => entry.isFile())
        .map((entry) => normalizePath(relative(root, resolve(entry.parentPath ?? root, entry.name))))
        .filter((path) => matchesPattern(path, pattern))
        .sort((left, right) => left.localeCompare(right));
    }
  };
}

function normalizePath(path: string): string {
  return path.split(sep).join("/");
}

function matchesPattern(path: string, pattern: string): boolean {
  if (pattern === "**/*") return true;
  if (pattern.startsWith("**/*")) {
    return path.endsWith(pattern.slice(4));
  }
  if (pattern.endsWith("/**/*")) {
    return path.startsWith(pattern.slice(0, -"**/*".length));
  }
  if (!pattern.includes("*")) {
    return path === pattern;
  }
  const escaped = pattern
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, ".*")
    .replace(/\*/g, "[^/]*");
  return new RegExp(`^${escaped}$`).test(path);
}
