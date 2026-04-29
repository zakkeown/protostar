import { access, readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

const requiredSections = Object.freeze([
  "## Public exports",
  "## Runtime dependencies",
  "## Authority constraints",
  "## Change log"
]);

describe("per-package README coverage", () => {
  it("requires README.md for every packages/* workspace and apps/factory-cli", async () => {
    const root = await repoRoot();
    const packageDirs = await workspacePackageDirs(root);

    for (const dir of packageDirs) {
      await assertFile(resolve(root, dir, "README.md"), `${dir} is missing README.md`);
    }
  });

  it("requires the standard README sections for every package", async () => {
    const root = await repoRoot();
    const packageDirs = await workspacePackageDirs(root);

    for (const dir of packageDirs) {
      const readmePath = resolve(root, dir, "README.md");
      const readme = await readFile(readmePath, "utf8");
      for (const section of requiredSections) {
        assert.ok(readme.includes(section), `${dir}/README.md missing ${section}`);
      }
    }
  });
});

async function workspacePackageDirs(root: string): Promise<readonly string[]> {
  const packagesRoot = resolve(root, "packages");
  const entries = await readdir(packagesRoot, { withFileTypes: true });
  const packageDirs: string[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dir = `packages/${entry.name}`;
    try {
      await access(resolve(root, dir, "package.json"));
      packageDirs.push(dir);
    } catch {
      // Not a workspace package.
    }
  }

  packageDirs.push("apps/factory-cli");
  return packageDirs.sort();
}

async function assertFile(path: string, message: string): Promise<void> {
  try {
    await access(path);
  } catch {
    assert.fail(message);
  }
}

async function repoRoot(): Promise<string> {
  let current = dirname(fileURLToPath(import.meta.url));
  for (;;) {
    try {
      await access(resolve(current, "pnpm-workspace.yaml"));
      return current;
    } catch {
      const parent = dirname(current);
      if (parent === current) throw new Error("repo root not found");
      current = parent;
    }
  }
}
