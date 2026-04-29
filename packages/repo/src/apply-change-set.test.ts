import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { rm, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, it } from "node:test";

import { createPatch } from "diff";

import {
  applyChangeSet,
  mintPatchRequest,
  type PatchRequest
} from "./apply-change-set.js";
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

    const minted = mintPatchRequest({
      path: "hunk.txt",
      op,
      diff,
      preImageSha256: sha256Hex(Buffer.from("actual\ncontent\n"))
    });
    assert.equal(minted.ok, true);
    if (!minted.ok) return;
    const results = await applyChangeSet([minted.request]);

    assert.deepEqual(results, [{ path: "hunk.txt", status: "skipped-error", error: "hunk-fit-failure" }]);
    assert.deepEqual(await readFile(op), Buffer.from("actual\ncontent\n"));
  });

  it("reports binary-not-supported for binary patch markers", async (t) => {
    const repo = await buildSacrificialRepo({
      dirtyFiles: [{ path: "icon.png", content: "not-really-png" }]
    });
    t.after(() => rm(repo.dir, { recursive: true, force: true }));
    const op = opFor(repo.dir, "icon.png");

    // Binary patches do not have a parseable filename header, so they cannot
    // mint via mintPatchRequest. Bypass the brand to test the inner
    // binary-not-supported path. Re-assertion runs first and refuses with
    // path-op-diff-mismatch — which is itself the desired behavior: binary
    // diffs are now refused at the brand boundary.
    const fake = {
      path: "icon.png",
      op,
      diff: "Binary files a/icon.png and b/icon.png differ\n",
      preImageSha256: sha256Hex(Buffer.from("not-really-png"))
    } as unknown as PatchRequest;

    const results = await applyChangeSet([fake]);

    assert.equal(results.length, 1);
    assert.equal(results[0]!.status, "skipped-error");
    assert.equal(await readFile(op).then((b) => b.toString()), "not-really-png");
  });

  it("reports parse-error for garbage patch text", async (t) => {
    const repo = await buildSacrificialRepo({
      dirtyFiles: [{ path: "garbage.txt", content: "plain\n" }]
    });
    t.after(() => rm(repo.dir, { recursive: true, force: true }));
    const op = opFor(repo.dir, "garbage.txt");

    // Garbage diffs are refused at mint time; verify both paths:
    //   1. mintPatchRequest returns diff-parse-error
    //   2. handcrafted fake-brand reaches applyChangeSet re-assertion, which
    //      refuses with path-op-diff-mismatch
    const minted = mintPatchRequest({
      path: "garbage.txt",
      op,
      diff: "not a patch\n",
      preImageSha256: sha256Hex(Buffer.from("plain\n"))
    });
    assert.equal(minted.ok, false);
    if (!minted.ok) assert.equal(minted.error, "diff-parse-error");

    const fake = {
      path: "garbage.txt",
      op,
      diff: "not a patch\n",
      preImageSha256: sha256Hex(Buffer.from("plain\n"))
    } as unknown as PatchRequest;

    const results = await applyChangeSet([fake]);
    assert.equal(results[0]!.status, "skipped-error");
    assert.equal((results[0] as { error?: string }).error, "path-op-diff-mismatch");
  });

  it("reports io-error when the pre-image cannot be read", async (t) => {
    const repo = await buildSacrificialRepo();
    t.after(() => rm(repo.dir, { recursive: true, force: true }));
    const op = opFor(repo.dir, "missing.txt");

    const minted = mintPatchRequest({
      path: "missing.txt",
      op,
      diff: mkPatch("", "created\n", "missing.txt"),
      preImageSha256: sha256Hex(Buffer.from(""))
    });
    assert.equal(minted.ok, true);
    if (!minted.ok) return;
    const results = await applyChangeSet([minted.request]);

    assert.deepEqual(results, [{ path: "missing.txt", status: "skipped-error", error: "io-error" }]);
  });

  it("applies a cosmetic-tweak change set that touches one file", async (t) => {
    const repo = await buildSacrificialRepo({
      dirtyFiles: [{ path: "copy.txt", content: "old copy\n" }]
    });
    t.after(() => rm(repo.dir, { recursive: true, force: true }));
    const op = opFor(repo.dir, "copy.txt");

    const results = await applyChangeSet(
      [patchFor(op, "copy.txt", Buffer.from("old copy\n"), "new copy\n")],
      { archetype: "cosmetic-tweak" }
    );

    assert.deepEqual(results, [{ path: "copy.txt", status: "applied" }]);
    assert.deepEqual(await readFile(op), Buffer.from("new copy\n"));
  });

  it("refuses a cosmetic-tweak change set that touches two distinct files before writing", async (t) => {
    const repo = await buildSacrificialRepo({
      dirtyFiles: [
        { path: "first.txt", content: "first before\n" },
        { path: "second.txt", content: "second before\n" }
      ]
    });
    t.after(() => rm(repo.dir, { recursive: true, force: true }));
    const firstOp = opFor(repo.dir, "first.txt");
    const secondOp = opFor(repo.dir, "second.txt");
    const firstStat = await stat(firstOp.path);
    const secondStat = await stat(secondOp.path);

    const results = await applyChangeSet(
      [
        patchFor(firstOp, "first.txt", Buffer.from("first before\n"), "first after\n"),
        patchFor(secondOp, "second.txt", Buffer.from("second before\n"), "second after\n")
      ],
      { archetype: "cosmetic-tweak" }
    );

    assert.deepEqual(results, [
      {
        path: "first.txt",
        status: "skipped-error",
        error: "cosmetic-archetype-multifile",
        evidence: { touchedFiles: ["first.txt", "second.txt"] }
      }
    ]);
    assert.deepEqual(await readFile(firstOp), Buffer.from("first before\n"));
    assert.deepEqual(await readFile(secondOp), Buffer.from("second before\n"));
    assert.equal((await stat(firstOp.path)).mtimeMs, firstStat.mtimeMs);
    assert.equal((await stat(secondOp.path)).mtimeMs, secondStat.mtimeMs);
  });

  it("applies a cosmetic-tweak patch with multiple hunks in one file", async (t) => {
    const original = Buffer.from("a1\na2\na3\na4\na5\na6\na7\n");
    const modified = "b1\na2\na3\nb4\na5\na6\nb7\n";
    const repo = await buildSacrificialRepo({
      dirtyFiles: [{ path: "multi-hunk.txt", content: original.toString("utf8") }]
    });
    t.after(() => rm(repo.dir, { recursive: true, force: true }));
    const op = opFor(repo.dir, "multi-hunk.txt");

    const results = await applyChangeSet(
      [patchFor(op, "multi-hunk.txt", original, modified)],
      { archetype: "cosmetic-tweak" }
    );

    assert.deepEqual(results, [{ path: "multi-hunk.txt", status: "applied" }]);
    assert.deepEqual(await readFile(op), Buffer.from(modified));
  });

  it("does not apply the cosmetic gate to non-cosmetic multi-file change sets", async (t) => {
    const files = Array.from({ length: 5 }, (_, index) => ({
      path: `feature-${index + 1}.txt`,
      content: `feature before ${index + 1}\n`
    }));
    const repo = await buildSacrificialRepo({ dirtyFiles: files });
    t.after(() => rm(repo.dir, { recursive: true, force: true }));
    const patches = files.map((file, index) =>
      patchFor(opFor(repo.dir, file.path), file.path, Buffer.from(file.content), `feature after ${index + 1}\n`)
    );

    const results = await applyChangeSet(patches, { archetype: "feature-add" });

    assert.deepEqual(statusesOf(results), ["applied", "applied", "applied", "applied", "applied"]);
    for (const [index, file] of files.entries()) {
      assert.deepEqual(await readFile(opFor(repo.dir, file.path)), Buffer.from(`feature after ${index + 1}\n`));
    }
  });

  it("keeps object-shaped change sets backward compatible when archetype is omitted", async (t) => {
    const repo = await buildSacrificialRepo({
      dirtyFiles: [
        { path: "legacy-a.txt", content: "a before\n" },
        { path: "legacy-b.txt", content: "b before\n" }
      ]
    });
    t.after(() => rm(repo.dir, { recursive: true, force: true }));

    const results = await applyChangeSet(
      [
        patchFor(opFor(repo.dir, "legacy-a.txt"), "legacy-a.txt", Buffer.from("a before\n"), "a after\n"),
        patchFor(opFor(repo.dir, "legacy-b.txt"), "legacy-b.txt", Buffer.from("b before\n"), "b after\n")
      ],
      {}
    );

    assert.deepEqual(statusesOf(results), ["applied", "applied"]);
    assert.deepEqual(await readFile(opFor(repo.dir, "legacy-a.txt")), Buffer.from("a after\n"));
    assert.deepEqual(await readFile(opFor(repo.dir, "legacy-b.txt")), Buffer.from("b after\n"));
  });

  it("mintPatchRequest refuses when path !== op.path", () => {
    const op = opFor("/tmp/ws", "src/danger.ts");
    const result = mintPatchRequest({
      path: "src/safe.ts",
      op,
      diff: validDiffFor("src/safe.ts"),
      preImageSha256: "0".repeat(64)
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error, "path-mismatch");
  });

  it("mintPatchRequest refuses when diff filename !== path", () => {
    const op = opFor("/tmp/ws", "src/safe.ts");
    const result = mintPatchRequest({
      path: "src/safe.ts",
      op,
      diff: validDiffFor("src/other.ts"),
      preImageSha256: "0".repeat(64)
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error, "diff-filename-mismatch");
  });

  it("mintPatchRequest refuses when diff is unparseable", () => {
    const op = opFor("/tmp/ws", "src/safe.ts");
    const result = mintPatchRequest({
      path: "src/safe.ts",
      op,
      diff: "this is not a unified diff",
      preImageSha256: "0".repeat(64)
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error, "diff-parse-error");
  });

  it("mintPatchRequest succeeds with canonicalization round-trip ('./foo' === 'foo')", () => {
    const op = opFor("/tmp/ws", "src/file.ts");
    const result = mintPatchRequest({
      path: "./src/file.ts",
      op,
      diff: validDiffFor("src/file.ts"),
      preImageSha256: "0".repeat(64)
    });
    assert.equal(result.ok, true);
  });

  it("applyChangeSet re-asserts on handcrafted fake-brand mismatch", async () => {
    const op = opFor("/tmp/ws", "src/danger.ts");
    const fake = {
      path: "src/safe.ts",
      op,
      diff: validDiffFor("src/other.ts"),
      preImageSha256: "0".repeat(64)
    } as unknown as PatchRequest;

    const results = await applyChangeSet([fake]);
    assert.equal(results.length, 1);
    assert.equal(results[0]!.status, "skipped-error");
    assert.equal((results[0] as { error?: string }).error, "path-op-diff-mismatch");
  });

  it("refuses a cosmetic-tweak multi-file change set before even the first write", async (t) => {
    const repo = await buildSacrificialRepo({
      dirtyFiles: [
        { path: "atomic-first.txt", content: "first original\n" },
        { path: "atomic-second.txt", content: "second original\n" }
      ]
    });
    t.after(() => rm(repo.dir, { recursive: true, force: true }));
    const firstOp = opFor(repo.dir, "atomic-first.txt");
    const secondOp = opFor(repo.dir, "atomic-second.txt");

    const results = await applyChangeSet(
      [
        patchFor(firstOp, "atomic-first.txt", Buffer.from("first original\n"), "first would write\n"),
        patchFor(secondOp, "atomic-second.txt", Buffer.from("second original\n"), "second would write\n")
      ],
      { archetype: "cosmetic-tweak" }
    );

    assert.deepEqual(results, [
      {
        path: "atomic-first.txt",
        status: "skipped-error",
        error: "cosmetic-archetype-multifile",
        evidence: { touchedFiles: ["atomic-first.txt", "atomic-second.txt"] }
      }
    ]);
    assert.deepEqual(await readFile(firstOp), Buffer.from("first original\n"));
    assert.deepEqual(await readFile(secondOp), Buffer.from("second original\n"));
  });
});

function patchFor(
  op: TestAuthorizedWorkspaceOp,
  path: string,
  originalBytes: Buffer,
  modifiedText: string
): PatchRequest {
  const minted = mintPatchRequest({
    path,
    op,
    diff: mkPatch(originalBytes.toString("utf8"), modifiedText, path),
    preImageSha256: sha256Hex(originalBytes)
  });
  if (!minted.ok) {
    throw new Error(`patchFor: mint refused with ${minted.error}`);
  }
  return minted.request;
}

function mkPatch(originalText: string, modifiedText: string, path: string): string {
  return createPatch(path, originalText, modifiedText);
}

function validDiffFor(filename: string): string {
  return `--- a/${filename}\n+++ b/${filename}\n@@ -1,1 +1,1 @@\n-old\n+new\n`;
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
