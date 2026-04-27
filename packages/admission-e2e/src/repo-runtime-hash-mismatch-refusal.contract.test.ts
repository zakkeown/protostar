import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, it } from "node:test";

import { buildAuthorizedWorkspaceOpForTest } from "@protostar/authority/internal/test-builders";
import { applyChangeSet, type PatchRequest } from "@protostar/repo";
import { buildSacrificialRepo } from "@protostar/repo/internal/test-fixtures";

import {
  assertRepoRuntimeDecisionShape,
  buildRepoRuntimeAdmissionDecision
} from "./_helpers/repo-runtime-evidence.js";

describe("repo-runtime hash-mismatch refusal contract", () => {
  it("pins skipped-hash-mismatch patch evidence without mutating the file", async (t) => {
    const repo = await buildSacrificialRepo({
      dirtyFiles: [{ path: "seed-0.txt", content: "stable\n" }]
    });
    t.after(() => rm(repo.dir, { recursive: true, force: true }));
    const patch: PatchRequest = {
      path: "seed-0.txt",
      op: buildAuthorizedWorkspaceOpForTest({
        workspace: { root: repo.dir, trust: "trusted" },
        path: resolve(repo.dir, "seed-0.txt"),
        access: "write",
        resolvedEnvelope: envelopeFor(repo.dir, resolve(repo.dir, "seed-0.txt"))
      }),
      diff: unifiedOneLinePatch("seed-0.txt", "stable", "changed"),
      preImageSha256: sha256Hex(Buffer.from("not-the-current-file\n"))
    };

    const patchResults = await applyChangeSet([patch]);
    const decision = buildRepoRuntimeAdmissionDecision({
      workspaceRoot: repo.dir,
      auth: { mode: "anonymous" },
      effectiveAllowlist: [],
      patchResults,
      subprocessRecords: []
    });

    assert.deepEqual(patchResults, [{ path: "seed-0.txt", status: "skipped-hash-mismatch" }]);
    assert.equal(await readFile(resolve(repo.dir, "seed-0.txt"), "utf8"), "stable\n");
    assertRepoRuntimeDecisionShape(decision);
    assert.deepEqual(decision.evidence.patchResults, patchResults);
  });
});

function envelopeFor(workspaceRoot: string, path: string) {
  return Object.freeze({
    repoScopes: Object.freeze([{ workspace: "self" as const, path, access: "write" as const }]),
    toolPermissions: Object.freeze([]),
    workspace: Object.freeze({ allowDirty: false }),
    budget: Object.freeze({}),
    executeGrants: Object.freeze([]),
    workspaceRoot
  });
}

function sha256Hex(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function unifiedOneLinePatch(path: string, beforeLine: string, afterLine: string): string {
  return [
    `--- a/${path}`,
    `+++ b/${path}`,
    "@@ -1,1 +1,1 @@",
    `-${beforeLine}`,
    `+${afterLine}`,
    ""
  ].join("\n");
}
