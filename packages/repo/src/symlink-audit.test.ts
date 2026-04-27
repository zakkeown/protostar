import assert from "node:assert/strict";
import { mkdir, rm, symlink } from "node:fs/promises";
import { join } from "node:path";
import { describe, it } from "node:test";
import { buildSacrificialRepo } from "./internal/test-fixtures/build-sacrificial-repo.js";
import { auditSymlinks } from "./symlink-audit.js";

describe("auditSymlinks", () => {
  it("returns ok for a clean default repo", async (t) => {
    const repo = await buildSacrificialRepo();
    t.after(() => rm(repo.dir, { recursive: true, force: true }));

    await assertAudit(repo.dir, {
      ok: true,
      offendingPaths: []
    });
  });

  it("reports a single symlink at the workspace root", async (t) => {
    const repo = await buildSacrificialRepo({
      symlinks: [{ path: "link.txt", target: "seed-0.txt" }]
    });
    t.after(() => rm(repo.dir, { recursive: true, force: true }));

    await assertAudit(repo.dir, {
      ok: false,
      offendingPaths: ["link.txt"]
    });
  });

  it("reports a nested symlink", async (t) => {
    const repo = await buildSacrificialRepo({
      dirtyFiles: [{ path: "subdir/file.txt", content: "nested\n" }]
    });
    t.after(() => rm(repo.dir, { recursive: true, force: true }));
    await symlink("../seed-0.txt", join(repo.dir, "subdir", "inner-link.txt"));

    await assertAudit(repo.dir, {
      ok: false,
      offendingPaths: ["subdir/inner-link.txt"]
    });
  });

  it("reports multiple symlinks", async (t) => {
    const repo = await buildSacrificialRepo({
      symlinks: [
        { path: "a-link.txt", target: "seed-0.txt" },
        { path: "nested/b-link.txt", target: "../seed-0.txt" }
      ]
    });
    t.after(() => rm(repo.dir, { recursive: true, force: true }));

    await assertAudit(repo.dir, {
      ok: false,
      offendingPaths: ["a-link.txt", "nested/b-link.txt"]
    });
  });

  it("reports a symlink that targets outside the workspace", async (t) => {
    const repo = await buildSacrificialRepo({
      symlinks: [{ path: "outside-link.txt", target: "/etc/hosts" }]
    });
    t.after(() => rm(repo.dir, { recursive: true, force: true }));

    await assertAudit(repo.dir, {
      ok: false,
      offendingPaths: ["outside-link.txt"]
    });
  });

  it("reports a broken symlink", async (t) => {
    const repo = await buildSacrificialRepo();
    t.after(() => rm(repo.dir, { recursive: true, force: true }));
    await mkdir(join(repo.dir, "broken"), { recursive: true });
    await symlink("missing-target.txt", join(repo.dir, "broken", "dangling.txt"));

    await assertAudit(repo.dir, {
      ok: false,
      offendingPaths: ["broken/dangling.txt"]
    });
  });
});

async function assertAudit(
  workspaceRoot: string,
  expected: { readonly ok: boolean; readonly offendingPaths: readonly string[] }
): Promise<void> {
  const result = await auditSymlinks(workspaceRoot);

  assert.equal(result.ok, expected.ok);
  assert.deepEqual(result.offendingPaths, expected.offendingPaths);
}
