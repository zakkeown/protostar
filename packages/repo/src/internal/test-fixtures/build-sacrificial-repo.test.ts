import assert from "node:assert/strict";
import * as fs from "node:fs";
import { lstat, rm } from "node:fs/promises";
import { join } from "node:path";
import { describe, it } from "node:test";
import git from "isomorphic-git";
import { buildSacrificialRepo } from "./build-sacrificial-repo.js";

describe("buildSacrificialRepo", () => {
  it("creates a 1-commit repo on main by default", async (t) => {
    const repo = await buildSacrificialRepo();
    t.after(() => rm(repo.dir, { recursive: true, force: true }));

    const log = await git.log({ fs, dir: repo.dir });

    assert.equal(log.length, 1);
    assert.equal(repo.defaultBranch, "main");
    assert.equal(typeof repo.headSha, "string");
    assert.match(repo.headSha, /^[a-f0-9]{40}$/);
    assert.deepEqual(repo.seededPaths, ["seed-0.txt"]);
  });

  it("creates linear N-commit history when commits: 3", async (t) => {
    const repo = await buildSacrificialRepo({ commits: 3 });
    t.after(() => rm(repo.dir, { recursive: true, force: true }));

    const log = await git.log({ fs, dir: repo.dir });

    assert.equal(log.length, 3);
    assert.deepEqual(
      log.map((entry) => entry.commit.message),
      ["seed commit 2\n", "seed commit 1\n", "seed commit 0\n"]
    );
    assert.equal(log[0]?.oid, repo.headSha);
    assert.deepEqual(repo.seededPaths, ["seed-0.txt", "seed-1.txt", "seed-2.txt"]);
  });

  it("creates additional branches at HEAD", async (t) => {
    const repo = await buildSacrificialRepo({ branches: ["feat-a", "feat-b"] });
    t.after(() => rm(repo.dir, { recursive: true, force: true }));

    const branches = await git.listBranches({ fs, dir: repo.dir });
    const featAHead = await git.resolveRef({ fs, dir: repo.dir, ref: "feat-a" });
    const featBHead = await git.resolveRef({ fs, dir: repo.dir, ref: "feat-b" });

    assert.deepEqual(branches.sort(), ["feat-a", "feat-b", "main"]);
    assert.equal(featAHead, repo.headSha);
    assert.equal(featBHead, repo.headSha);
  });

  it("seeds dirty files without committing them", async (t) => {
    const repo = await buildSacrificialRepo({
      dirtyFiles: [{ path: "x.txt", content: "uncommitted" }]
    });
    t.after(() => rm(repo.dir, { recursive: true, force: true }));

    const status = await git.statusMatrix({ fs, dir: repo.dir, filepaths: ["x.txt"] });

    assert.deepEqual(status, [["x.txt", 0, 2, 0]]);
    assert.deepEqual(repo.seededPaths, ["seed-0.txt", "x.txt"]);
  });

  it("seeds symlinks", async (t) => {
    const repo = await buildSacrificialRepo({
      symlinks: [{ path: "link.txt", target: "seed-0.txt" }]
    });
    t.after(() => rm(repo.dir, { recursive: true, force: true }));

    const stat = await lstat(join(repo.dir, "link.txt"));

    assert.equal(stat.isSymbolicLink(), true);
    assert.deepEqual(repo.seededPaths, ["seed-0.txt", "link.txt"]);
  });

  it("resolves through the internal test-fixtures subpath export", async () => {
    const exported = await import("@protostar/repo/internal/test-fixtures");

    assert.equal(typeof exported.buildSacrificialRepo, "function");
  });
});
