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

describe("repo-runtime best-effort patch evidence contract", () => {
  it("pins five-patch evidence with patch three skipped for hash mismatch", async (t) => {
    const files = [1, 2, 3, 4, 5].map((index) => ({
      path: `f${index}.txt`,
      before: `before-${index}\n`,
      after: `after-${index}\n`
    }));
    const repo = await buildSacrificialRepo({
      dirtyFiles: files.map(({ path, before }) => ({ path, content: before }))
    });
    t.after(() => rm(repo.dir, { recursive: true, force: true }));
    const patches = files.map(({ path, before, after }, index) => {
      const request = patchFor(repo.dir, path, before, after);
      return index === 2
        ? { ...request, preImageSha256: sha256Hex(Buffer.from("wrong-preimage\n")) }
        : request;
    });

    const patchResults = await applyChangeSet(patches);
    const decision = buildRepoRuntimeAdmissionDecision({
      workspaceRoot: repo.dir,
      auth: { mode: "anonymous" },
      effectiveAllowlist: [],
      patchResults,
      subprocessRecords: []
    });

    assert.deepEqual(patchResults, [
      { path: "f1.txt", status: "applied" },
      { path: "f2.txt", status: "applied" },
      { path: "f3.txt", status: "skipped-hash-mismatch" },
      { path: "f4.txt", status: "applied" },
      { path: "f5.txt", status: "applied" }
    ]);
    for (const [index, file] of files.entries()) {
      const expected = index === 2 ? file.before : file.after;
      assert.equal(await readFile(resolve(repo.dir, file.path), "utf8"), expected);
    }
    assertRepoRuntimeDecisionShape(decision);
    assert.deepEqual(decision.evidence.patchResults, patchResults);
  });
});

function patchFor(workspaceRoot: string, relativePath: string, before: string, after: string): PatchRequest {
  const absolutePath = resolve(workspaceRoot, relativePath);
  return {
    path: relativePath,
    op: buildAuthorizedWorkspaceOpForTest({
      workspace: { root: workspaceRoot, trust: "trusted" },
      path: absolutePath,
      access: "write",
      resolvedEnvelope: envelopeFor(absolutePath)
    }),
    diff: unifiedOneLinePatch(relativePath, before.trimEnd(), after.trimEnd()),
    preImageSha256: sha256Hex(Buffer.from(before))
  };
}

function envelopeFor(path: string) {
  return Object.freeze({
    repoScopes: Object.freeze([{ workspace: "self" as const, path, access: "write" as const }]),
    toolPermissions: Object.freeze([]),
    workspace: Object.freeze({ allowDirty: false }),
    budget: Object.freeze({}),
    executeGrants: Object.freeze([])
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
