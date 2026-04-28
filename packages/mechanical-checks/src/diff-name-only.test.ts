import assert from "node:assert/strict";
import * as fs from "node:fs";
import { rm, writeFile, mkdir, rename } from "node:fs/promises";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";

import git from "isomorphic-git";

import { buildSacrificialRepo } from "@protostar/repo/internal/test-fixtures";

import { computeDiffNameOnly } from "./diff-name-only.js";

const AUTHOR = {
  name: "protostar-test",
  email: "test@protostar.local",
  timestamp: 1_700_000_001,
  timezoneOffset: 0
} as const;

describe("computeDiffNameOnly", () => {
  it("returns one file changed by one commit on top of base", async (t) => {
    const repo = await buildSacrificialRepo();
    t.after(() => rm(repo.dir, { recursive: true, force: true }));

    await commitFiles(repo.dir, [{ path: "src/foo.ts", content: "export const foo = 1;\n" }]);

    assert.deepEqual(
      await computeDiffNameOnly({ workspaceRoot: repo.dir, baseRef: repo.headSha }),
      ["src/foo.ts"]
    );
  });

  it("returns an empty list when HEAD matches base", async (t) => {
    const repo = await buildSacrificialRepo();
    t.after(() => rm(repo.dir, { recursive: true, force: true }));

    assert.deepEqual(
      await computeDiffNameOnly({ workspaceRoot: repo.dir, baseRef: repo.headSha }),
      []
    );
  });

  it("returns all changed files sorted alphabetically", async (t) => {
    const repo = await buildSacrificialRepo();
    t.after(() => rm(repo.dir, { recursive: true, force: true }));

    await commitFiles(repo.dir, [
      { path: "src/zeta.ts", content: "z\n" },
      { path: "src/alpha.ts", content: "a\n" },
      { path: "src/mid.ts", content: "m\n" }
    ]);

    assert.deepEqual(
      await computeDiffNameOnly({ workspaceRoot: repo.dir, baseRef: repo.headSha }),
      ["src/alpha.ts", "src/mid.ts", "src/zeta.ts"]
    );
  });

  it("does not truncate a two-file diff for cosmetic-tweak enforcement", async (t) => {
    const repo = await buildSacrificialRepo();
    t.after(() => rm(repo.dir, { recursive: true, force: true }));

    await commitFiles(repo.dir, [
      { path: "a.ts", content: "a\n" },
      { path: "b.ts", content: "b\n" }
    ]);

    assert.equal(
      (await computeDiffNameOnly({ workspaceRoot: repo.dir, baseRef: repo.headSha })).length,
      2
    );
  });

  it("reports renames as delete plus add when statusMatrix cannot pair them", async (t) => {
    const repo = await buildSacrificialRepo();
    t.after(() => rm(repo.dir, { recursive: true, force: true }));
    await commitFiles(repo.dir, [{ path: "src/old-name.ts", content: "export const name = 'old';\n" }]);
    const baseRef = await git.resolveRef({ fs, dir: repo.dir, ref: "HEAD" });

    await mkdir(join(repo.dir, "src"), { recursive: true });
    await rename(join(repo.dir, "src/old-name.ts"), join(repo.dir, "src/new-name.ts"));
    await git.remove({ fs, dir: repo.dir, filepath: "src/old-name.ts" });
    await git.add({ fs, dir: repo.dir, filepath: "src/new-name.ts" });
    await git.commit({
      fs,
      dir: repo.dir,
      message: "rename file",
      author: AUTHOR,
      committer: AUTHOR
    });

    assert.deepEqual(
      await computeDiffNameOnly({ workspaceRoot: repo.dir, baseRef }),
      ["src/new-name.ts", "src/old-name.ts"]
    );
  });
});

async function commitFiles(
  dir: string,
  files: readonly { readonly path: string; readonly content: string }[]
): Promise<string> {
  for (const file of files) {
    const absolutePath = join(dir, file.path);
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, file.content);
    await git.add({ fs, dir, filepath: file.path });
  }

  return git.commit({
    fs,
    dir,
    message: `commit ${files.map((file) => file.path).join(", ")}`,
    author: AUTHOR,
    committer: AUTHOR
  });
}
