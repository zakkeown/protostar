import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, it } from "node:test";

import { createPatch } from "diff";

import { applyChangeSet, type PatchRequest } from "./apply-change-set.js";
import { readFile } from "./fs-adapter.js";
import { buildSacrificialRepo } from "./internal/test-fixtures/build-sacrificial-repo.js";

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

describe("applyChangeSet", () => {
  it("applies one clean text patch when the pre-image hash matches", async (t) => {
    const repo = await buildSacrificialRepo({
      dirtyFiles: [{ path: "story.txt", content: "alpha\nbeta\n" }]
    });
    t.after(() => rm(repo.dir, { recursive: true, force: true }));
    const original = Buffer.from("alpha\nbeta\n");
    const modified = "alpha\nbeta updated\n";
    const op = opFor(repo.dir, "story.txt");

    const results = await applyChangeSet([
      patchFor(op, "story.txt", original, modified)
    ]);

    assert.deepEqual(results, [{ path: "story.txt", status: "applied" }]);
    assert.deepEqual(await readFile(op), Buffer.from(modified));
  });

  it("applies five clean patches and preserves result order", async (t) => {
    const files = Array.from({ length: 5 }, (_, index) => ({
      path: `multi-${index + 1}.txt`,
      content: `before-${index + 1}\n`
    }));
    const repo = await buildSacrificialRepo({ dirtyFiles: files });
    t.after(() => rm(repo.dir, { recursive: true, force: true }));
    const patches = files.map((file, index) =>
      patchFor(opFor(repo.dir, file.path), file.path, Buffer.from(file.content), `after-${index + 1}\n`)
    );

    const results = await applyChangeSet(patches);

    assert.deepEqual(statusesOf(results), ["applied", "applied", "applied", "applied", "applied"]);
    for (const [index, file] of files.entries()) {
      assert.deepEqual(await readFile(opFor(repo.dir, file.path)), Buffer.from(`after-${index + 1}\n`));
    }
  });

  it("skips one patch when the pre-image hash does not match", async (t) => {
    const repo = await buildSacrificialRepo({
      dirtyFiles: [{ path: "hash.txt", content: "stable\n" }]
    });
    t.after(() => rm(repo.dir, { recursive: true, force: true }));
    const op = opFor(repo.dir, "hash.txt");

    const results = await applyChangeSet([
      {
        ...patchFor(op, "hash.txt", Buffer.from("stable\n"), "changed\n"),
        preImageSha256: sha256Hex(Buffer.from("different\n"))
      }
    ]);

    assert.deepEqual(results, [{ path: "hash.txt", status: "skipped-hash-mismatch" }]);
    assert.deepEqual(await readFile(op), Buffer.from("stable\n"));
  });

  it("continues best-effort through five patches when patch three hash-mismatches", async (t) => {
    const files = Array.from({ length: 5 }, (_, index) => ({
      path: `best-effort-${index + 1}.txt`,
      content: `before-${index + 1}\n`
    }));
    const repo = await buildSacrificialRepo({ dirtyFiles: files });
    t.after(() => rm(repo.dir, { recursive: true, force: true }));
    const patches = files.map((file, index) => {
      const request = patchFor(opFor(repo.dir, file.path), file.path, Buffer.from(file.content), `after-${index + 1}\n`);
      return index === 2
        ? { ...request, preImageSha256: sha256Hex(Buffer.from("not-the-file\n")) }
        : request;
    });

    const results = await applyChangeSet(patches);

    assert.deepEqual(statusesOf(results), ["applied", "applied", "skipped-hash-mismatch", "applied", "applied"]);
    for (const [index, file] of files.entries()) {
      const expected = index === 2 ? file.content : `after-${index + 1}\n`;
      assert.deepEqual(await readFile(opFor(repo.dir, file.path)), Buffer.from(expected));
    }
  });

  it("reports hunk-fit-failure when a valid patch does not fit the hashed pre-image", async (t) => {
    const repo = await buildSacrificialRepo({
      dirtyFiles: [{ path: "hunk.txt", content: "actual\ncontent\n" }]
    });
    t.after(() => rm(repo.dir, { recursive: true, force: true }));
    const op = opFor(repo.dir, "hunk.txt");
    const diff = mkPatch("different\nsource\n", "different\npatched\n", "hunk.txt");

    const results = await applyChangeSet([
      {
        path: "hunk.txt",
        op,
        diff,
        preImageSha256: sha256Hex(Buffer.from("actual\ncontent\n"))
      }
    ]);

    assert.deepEqual(results, [{ path: "hunk.txt", status: "skipped-error", error: "hunk-fit-failure" }]);
    assert.deepEqual(await readFile(op), Buffer.from("actual\ncontent\n"));
  });

  it("reports binary-not-supported for binary patch markers", async (t) => {
    const repo = await buildSacrificialRepo({
      dirtyFiles: [{ path: "icon.png", content: "not-really-png" }]
    });
    t.after(() => rm(repo.dir, { recursive: true, force: true }));
    const op = opFor(repo.dir, "icon.png");

    const results = await applyChangeSet([
      {
        path: "icon.png",
        op,
        diff: "Binary files a/icon.png and b/icon.png differ\n",
        preImageSha256: sha256Hex(Buffer.from("not-really-png"))
      }
    ]);

    assert.deepEqual(results, [{ path: "icon.png", status: "skipped-error", error: "binary-not-supported" }]);
    assert.deepEqual(await readFile(op), Buffer.from("not-really-png"));
  });

  it("reports parse-error for garbage patch text", async (t) => {
    const repo = await buildSacrificialRepo({
      dirtyFiles: [{ path: "garbage.txt", content: "plain\n" }]
    });
    t.after(() => rm(repo.dir, { recursive: true, force: true }));
    const op = opFor(repo.dir, "garbage.txt");

    const results = await applyChangeSet([
      {
        path: "garbage.txt",
        op,
        diff: "not a patch\n",
        preImageSha256: sha256Hex(Buffer.from("plain\n"))
      }
    ]);

    assert.deepEqual(results, [{ path: "garbage.txt", status: "skipped-error", error: "parse-error" }]);
  });

  it("reports io-error when the pre-image cannot be read", async (t) => {
    const repo = await buildSacrificialRepo();
    t.after(() => rm(repo.dir, { recursive: true, force: true }));
    const op = opFor(repo.dir, "missing.txt");

    const results = await applyChangeSet([
      {
        path: "missing.txt",
        op,
        diff: mkPatch("", "created\n", "missing.txt"),
        preImageSha256: sha256Hex(Buffer.from(""))
      }
    ]);

    assert.deepEqual(results, [{ path: "missing.txt", status: "skipped-error", error: "io-error" }]);
  });
});

function patchFor(
  op: TestAuthorizedWorkspaceOp,
  path: string,
  originalBytes: Buffer,
  modifiedText: string
): PatchRequest {
  return {
    path,
    op,
    diff: mkPatch(originalBytes.toString("utf8"), modifiedText, path),
    preImageSha256: sha256Hex(originalBytes)
  };
}

function mkPatch(originalText: string, modifiedText: string, path: string): string {
  return createPatch(path, originalText, modifiedText);
}

function sha256Hex(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function statusesOf(results: readonly { readonly status: string }[]): readonly string[] {
  return results.map(({ status }) => status);
}

function opFor(workspaceRoot: string, workspaceRelativePath: string): TestAuthorizedWorkspaceOp {
  return Object.freeze({
    workspace: Object.freeze({ root: workspaceRoot, trust: "trusted" as const }),
    path: resolve(workspaceRoot, workspaceRelativePath),
    access: "write",
    resolvedEnvelope: EMPTY_ENVELOPE
  });
}
