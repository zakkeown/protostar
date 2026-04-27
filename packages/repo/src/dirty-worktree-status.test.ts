import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { describe, it } from "node:test";

import { dirtyWorktreeStatus } from "./dirty-worktree-status.js";
import { buildSacrificialRepo } from "./internal/test-fixtures/build-sacrificial-repo.js";

describe("dirtyWorktreeStatus", () => {
  it("reports a clean one-commit repo as not dirty", async (t) => {
    const repo = await buildSacrificialRepo();
    t.after(() => rm(repo.dir, { recursive: true, force: true }));

    const status = await dirtyWorktreeStatus(repo.dir);

    assert.deepEqual(status, { isDirty: false, dirtyFiles: [] });
  });

  it("ignores untracked files like git status --untracked-files=no", async (t) => {
    const repo = await buildSacrificialRepo({
      dirtyFiles: [{ path: "untracked.txt", content: "new\n" }]
    });
    t.after(() => rm(repo.dir, { recursive: true, force: true }));

    const status = await dirtyWorktreeStatus(repo.dir);

    assert.deepEqual(status, { isDirty: false, dirtyFiles: [] });
  });

  it("reports tracked files modified after commit", async (t) => {
    const repo = await buildSacrificialRepo({
      dirtyFiles: [{ path: "seed-0.txt", content: "modified after commit\n" }]
    });
    t.after(() => rm(repo.dir, { recursive: true, force: true }));

    const status = await dirtyWorktreeStatus(repo.dir);

    assert.deepEqual(status, { isDirty: true, dirtyFiles: ["seed-0.txt"] });
  });

  it("keeps a fresh clone with untracked dist artifacts clean for CONFLICT-02", async (t) => {
    const repo = await buildSacrificialRepo({
      dirtyFiles: [{ path: "dist/foo.js", content: "compiled artifact\n" }]
    });
    t.after(() => rm(repo.dir, { recursive: true, force: true }));

    const status = await dirtyWorktreeStatus(repo.dir);

    assert.deepEqual(status, { isDirty: false, dirtyFiles: [] });
  });
});
