import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { describe, it } from "node:test";

import { dirtyWorktreeStatus } from "@protostar/repo";
import { buildSacrificialRepo } from "@protostar/repo/internal/test-fixtures";

import {
  assertRepoRuntimeDecisionShape,
  buildRepoRuntimeAdmissionDecision
} from "./_helpers/repo-runtime-evidence.js";

describe("repo-runtime dirty-worktree refusal contract", () => {
  it("pins dirtyWorktree evidence for a modified tracked file", async (t) => {
    const repo = await buildSacrificialRepo({
      dirtyFiles: [{ path: "seed-0.txt", content: "dirty-after-commit\n" }]
    });
    t.after(() => rm(repo.dir, { recursive: true, force: true }));

    const dirtyWorktree = await dirtyWorktreeStatus(repo.dir);
    const decision = buildRepoRuntimeAdmissionDecision({
      workspaceRoot: repo.dir,
      auth: { mode: "anonymous" },
      effectiveAllowlist: [],
      dirtyWorktree,
      patchResults: [],
      subprocessRecords: []
    });

    assert.deepEqual(dirtyWorktree, {
      isDirty: true,
      dirtyFiles: ["seed-0.txt"]
    });
    assertRepoRuntimeDecisionShape(decision);
    assert.deepEqual(decision.evidence.dirtyWorktree, dirtyWorktree);
  });
});
