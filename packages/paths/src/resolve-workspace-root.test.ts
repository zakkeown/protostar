import assert from "node:assert/strict";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { resolveWorkspaceRoot } from "./index.js";

const packageDir = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(packageDir, "../../..");

describe("resolveWorkspaceRoot", () => {
  it("throws with the starting directory when no pnpm-workspace.yaml ancestor exists", () => {
    assert.equal(existsSync(resolve("/", "pnpm-workspace.yaml")), false);

    const startDir = mkdtempSync(join(tmpdir(), "protostar-paths-no-workspace-"));

    assert.throws(
      () => resolveWorkspaceRoot(startDir),
      (error: unknown) =>
        error instanceof Error &&
        error.message.includes("No pnpm-workspace.yaml ancestor") &&
        error.message.includes(startDir)
    );
  });

  it("returns the workspace root from a deeply nested repo subdirectory", () => {
    const nestedDir = resolve(workspaceRoot, "apps/factory-cli/src");
    const resolvedRoot = resolveWorkspaceRoot(nestedDir);

    assert.equal(resolvedRoot, workspaceRoot);
    assert.equal(existsSync(resolve(resolvedRoot, "pnpm-workspace.yaml")), true);
  });

  it("returns the workspace root when started at the root itself", () => {
    assert.equal(resolveWorkspaceRoot(workspaceRoot), workspaceRoot);
  });

  it("defaults to process.cwd()", () => {
    assert.equal(resolveWorkspaceRoot(), resolveWorkspaceRoot(process.cwd()));
  });

  it("uses pnpm-workspace.yaml as the sentinel rather than a .git directory", () => {
    let gitAncestor: string | undefined;
    let cur = workspaceRoot;

    while (true) {
      const parent = dirname(cur);
      if (parent === cur) {
        break;
      }

      if (existsSync(resolve(parent, ".git"))) {
        gitAncestor = parent;
        break;
      }

      cur = parent;
    }

    assert.equal(gitAncestor, undefined);
    assert.equal(resolveWorkspaceRoot(resolve(workspaceRoot, ".git")), workspaceRoot);
  });
});
