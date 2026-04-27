import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { describe, it } from "node:test";

import { auditSymlinks } from "@protostar/repo";
import { buildSacrificialRepo } from "@protostar/repo/internal/test-fixtures";

import {
  assertRepoRuntimeDecisionShape,
  buildRepoRuntimeAdmissionDecision
} from "./_helpers/repo-runtime-evidence.js";

describe("repo-runtime symlink refusal contract", () => {
  it("pins symlinkRefusal evidence for a workspace-relative symlink", async (t) => {
    const repo = await buildSacrificialRepo({
      symlinks: [{ path: "link.txt", target: "seed-0.txt" }]
    });
    t.after(() => rm(repo.dir, { recursive: true, force: true }));

    const audit = await auditSymlinks(repo.dir);
    const symlinkRefusal = { offendingPaths: audit.offendingPaths };
    const decision = buildRepoRuntimeAdmissionDecision({
      workspaceRoot: repo.dir,
      auth: { mode: "anonymous" },
      effectiveAllowlist: [],
      symlinkRefusal,
      patchResults: [],
      subprocessRecords: []
    });

    assert.deepEqual(audit, {
      ok: false,
      offendingPaths: ["link.txt"]
    });
    assertRepoRuntimeDecisionShape(decision);
    assert.deepEqual(decision.evidence.symlinkRefusal, symlinkRefusal);
  });
});
