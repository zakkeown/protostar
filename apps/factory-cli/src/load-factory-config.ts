import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { resolveFactoryConfig, type ResolvedFactoryConfig } from "@protostar/lmstudio-adapter";

export async function loadFactoryConfig(workspaceRoot: string): Promise<ResolvedFactoryConfig> {
  const filePath = join(workspaceRoot, ".protostar", "factory-config.json");
  let fileBytes: string | undefined;

  try {
    fileBytes = await readFile(filePath, "utf8");
  } catch (error: unknown) {
    if (isNodeErrno(error) && error.code === "ENOENT") {
      fileBytes = undefined;
    } else {
      throw error;
    }
  }

  const resolved = resolveFactoryConfig({
    ...(fileBytes !== undefined ? { fileBytes } : {}),
    env: process.env
  });
  if (!resolved.ok) {
    throw new Error(`invalid ${filePath}: ${resolved.errors.join("; ")}`);
  }
  return resolved.resolved;
}

function isNodeErrno(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && "code" in error;
}
