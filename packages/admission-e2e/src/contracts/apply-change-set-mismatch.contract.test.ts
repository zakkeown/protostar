import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import {
  applyChangeSet,
  mintPatchRequest,
  type PatchRequest
} from "@protostar/repo";

interface TestAuthorizedWorkspaceOp {
  readonly workspace: { readonly root: string; readonly trust: "trusted" | "untrusted" };
  readonly path: string;
  readonly access: "read" | "write" | "execute";
  readonly resolvedEnvelope: {
    readonly repoScopes: readonly unknown[];
    readonly toolPermissions: readonly unknown[];
    readonly workspace: { readonly allowDirty: boolean };
    readonly budget: Record<string, never>;
  };
}

const EMPTY_ENVELOPE: TestAuthorizedWorkspaceOp["resolvedEnvelope"] = Object.freeze({
  repoScopes: [],
  toolPermissions: [],
  workspace: { allowDirty: false },
  budget: {}
});

function opFor(workspaceRelativePath: string): TestAuthorizedWorkspaceOp {
  return Object.freeze({
    workspace: Object.freeze({ root: "/tmp/admission-e2e-test", trust: "trusted" as const }),
    path: workspaceRelativePath,
    access: "write" as const,
    resolvedEnvelope: EMPTY_ENVELOPE
  });
}

function validDiffFor(filename: string): string {
  return `--- a/${filename}\n+++ b/${filename}\n@@ -1,1 +1,1 @@\n-old\n+new\n`;
}

describe("apply-change-set path/op/diff invariant (AUTH-09, AUTH-10)", () => {
  it("refuses mint when path !== op.path", () => {
    const result = mintPatchRequest({
      path: "src/safe.ts",
      op: opFor("src/danger.ts") as unknown as Parameters<typeof mintPatchRequest>[0]["op"],
      diff: validDiffFor("src/safe.ts"),
      preImageSha256: "0".repeat(64)
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error, "path-mismatch");
  });

  it("refuses mint when diff filename !== path", () => {
    const result = mintPatchRequest({
      path: "src/safe.ts",
      op: opFor("src/safe.ts") as unknown as Parameters<typeof mintPatchRequest>[0]["op"],
      diff: validDiffFor("src/other.ts"),
      preImageSha256: "0".repeat(64)
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error, "diff-filename-mismatch");
  });

  it("refuses mint when diff is unparseable", () => {
    const result = mintPatchRequest({
      path: "src/safe.ts",
      op: opFor("src/safe.ts") as unknown as Parameters<typeof mintPatchRequest>[0]["op"],
      diff: "this is not a unified diff",
      preImageSha256: "0".repeat(64)
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error, "diff-parse-error");
  });

  it("canonicalization round-trip — './foo' === 'foo' === diff 'a/foo'", () => {
    const result = mintPatchRequest({
      path: "./src/file.ts",
      op: opFor("src/file.ts") as unknown as Parameters<typeof mintPatchRequest>[0]["op"],
      diff: validDiffFor("src/file.ts"),
      preImageSha256: "0".repeat(64)
    });
    assert.equal(result.ok, true);
  });

  it("applyChangeSet re-asserts on handcrafted fake-brand mismatch", async () => {
    const fake = {
      path: "src/safe.ts",
      op: opFor("src/danger.ts"),
      diff: validDiffFor("src/other.ts"),
      preImageSha256: "0".repeat(64)
    } as unknown as PatchRequest;

    const results = await applyChangeSet([fake]);
    assert.equal(results.length, 1);
    assert.equal(results[0]!.status, "skipped-error");
    assert.equal((results[0] as { error?: string }).error, "path-op-diff-mismatch");
  });
});
