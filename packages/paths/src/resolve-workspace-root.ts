import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

/**
 * Walk parent directories from `startDir` until a `pnpm-workspace.yaml` file
 * is found; return that directory.
 *
 * Synchronous on purpose - consumers at `apps/factory-cli/src/main.ts:172,199`
 * are synchronous at call site.
 *
 * Scope ceiling (AGENTS.md carve-out): path resolution only. No I/O beyond
 * `existsSync`. No business logic. If you find yourself adding helpers
 * unrelated to workspace-root location, split this package per AGENTS.md.
 *
 * @throws {Error} when no `pnpm-workspace.yaml` exists in any ancestor.
 */
export function resolveWorkspaceRoot(startDir: string = process.cwd()): string {
  let currentDir = resolve(startDir);

  while (true) {
    if (existsSync(resolve(currentDir, "pnpm-workspace.yaml"))) {
      return currentDir;
    }

    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) {
      throw new Error(`No pnpm-workspace.yaml ancestor of ${startDir}`);
    }

    currentDir = parentDir;
  }
}
