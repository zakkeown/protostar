import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { createFsRepoReader } from "./repo-reader-adapter.js";

describe("createFsRepoReader", () => {
  it("reads bytes and sha256 for workspace-relative files", async () => {
    const root = await mkdtemp(join(tmpdir(), "repo-reader-"));
    await mkdir(join(root, "src"));
    await writeFile(join(root, "src", "foo.ts"), "export const x = 1;\n");
    const reader = createFsRepoReader({ workspaceRoot: root });

    const result = await reader.readFile("src/foo.ts");

    assert.equal(new TextDecoder().decode(result.bytes), "export const x = 1;\n");
    assert.equal(result.sha256, createHash("sha256").update(result.bytes).digest("hex"));
  });

  it("rejects path traversal outside the workspace", async () => {
    const root = await mkdtemp(join(tmpdir(), "repo-reader-"));
    const reader = createFsRepoReader({ workspaceRoot: root });

    await assert.rejects(() => reader.readFile("../escape"), /path escapes workspace/);
  });

  it("globs relative paths under the workspace root", async () => {
    const root = await mkdtemp(join(tmpdir(), "repo-reader-"));
    await mkdir(join(root, "src", "nested"), { recursive: true });
    await writeFile(join(root, "src", "Button.tsx"), "");
    await writeFile(join(root, "src", "nested", "Thing.tsx"), "");
    await writeFile(join(root, "src", "other.ts"), "");
    const reader = createFsRepoReader({ workspaceRoot: root });

    assert.deepEqual(await reader.glob("**/*.tsx"), ["src/Button.tsx", "src/nested/Thing.tsx"]);
  });
});
