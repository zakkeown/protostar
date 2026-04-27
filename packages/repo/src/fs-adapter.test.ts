import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { describe, it } from "node:test";

import { buildSacrificialRepo } from "./internal/test-fixtures/build-sacrificial-repo.js";
import {
  deleteFile,
  readFile,
  writeFile
} from "./fs-adapter.js";

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

describe("fs-adapter", () => {
  it("reads a branded workspace file", async (t) => {
    const repo = await buildSacrificialRepo();
    t.after(() => rm(repo.dir, { recursive: true, force: true }));

    const bytes = await readFile(opFor(repo.dir, "seed-0.txt", "read"));

    assert.deepEqual(bytes, Buffer.from("commit-0\n"));
  });

  it("writes a branded workspace file", async (t) => {
    const repo = await buildSacrificialRepo();
    t.after(() => rm(repo.dir, { recursive: true, force: true }));
    const op = opFor(repo.dir, "output.txt", "write");

    await writeFile(op, Buffer.from("created by adapter\n"));

    assert.deepEqual(await readFile(op), Buffer.from("created by adapter\n"));
  });

  it("deletes a branded workspace file", async (t) => {
    const repo = await buildSacrificialRepo();
    t.after(() => rm(repo.dir, { recursive: true, force: true }));
    const op = opFor(repo.dir, "seed-0.txt", "write");

    await deleteFile(op);

    await assert.rejects(
      readFile(op),
      (error: unknown) =>
        hasFsAdapterReason(error, "io-error") &&
        hasNodeErrorCause(error, "ENOENT")
    );
  });

  it("refuses an escaped workspace path before touching fs contents", async (t) => {
    const repo = await buildSacrificialRepo();
    t.after(() => rm(repo.dir, { recursive: true, force: true }));
    const escapedPath = resolve(dirname(repo.dir), "outside.txt");

    await assert.rejects(
      readFile(opForAbsolute(repo.dir, escapedPath, "read")),
      (error: unknown) => hasFsAdapterReason(error, "escape-attempt")
    );
  });

  it("refuses to read symlinks", async (t) => {
    const repo = await buildSacrificialRepo({
      symlinks: [{ path: "link.txt", target: "seed-0.txt" }]
    });
    t.after(() => rm(repo.dir, { recursive: true, force: true }));

    await assert.rejects(
      readFile(opFor(repo.dir, "link.txt", "read")),
      (error: unknown) => hasFsAdapterReason(error, "symlink-refusal")
    );
  });

  it("refuses to write through symlinks", async (t) => {
    const repo = await buildSacrificialRepo({
      symlinks: [{ path: "link.txt", target: "seed-0.txt" }]
    });
    t.after(() => rm(repo.dir, { recursive: true, force: true }));

    await assert.rejects(
      writeFile(opFor(repo.dir, "link.txt", "write"), Buffer.from("mutated\n")),
      (error: unknown) => hasFsAdapterReason(error, "symlink-refusal")
    );
  });

  it("refuses a brand path that is no longer canonical", async (t) => {
    const repo = await buildSacrificialRepo();
    t.after(() => rm(repo.dir, { recursive: true, force: true }));
    const nonCanonicalPath = `${repo.dir}/./seed-0.txt`;

    await assert.rejects(
      readFile(opForAbsolute(repo.dir, nonCanonicalPath, "read")),
      (error: unknown) => hasFsAdapterReason(error, "canonicalization-mismatch")
    );
  });

  it("refuses writes with a read-only brand", async (t) => {
    const repo = await buildSacrificialRepo();
    t.after(() => rm(repo.dir, { recursive: true, force: true }));

    await assert.rejects(
      writeFile(opFor(repo.dir, "seed-0.txt", "read"), Buffer.from("mutated\n")),
      (error: unknown) => hasFsAdapterReason(error, "access-mismatch")
    );
  });
});

function opFor(
  workspaceRoot: string,
  workspaceRelativePath: string,
  access: TestAuthorizedWorkspaceOp["access"]
): TestAuthorizedWorkspaceOp {
  return opForAbsolute(workspaceRoot, resolve(workspaceRoot, workspaceRelativePath), access);
}

function opForAbsolute(
  workspaceRoot: string,
  path: string,
  access: TestAuthorizedWorkspaceOp["access"]
): TestAuthorizedWorkspaceOp {
  // These tests isolate the adapter's brand-consuming behavior. Calling the
  // Phase 2 producer would couple this package's tests to authority runtime
  // setup, while the adapter only needs the frozen brand shape at its boundary.
  return Object.freeze({
    workspace: Object.freeze({ root: workspaceRoot, trust: "trusted" as const }),
    path,
    access,
    resolvedEnvelope: EMPTY_ENVELOPE
  });
}

function hasFsAdapterReason(error: unknown, reason: string): boolean {
  return (
    error instanceof Error &&
    "reason" in error &&
    error.reason === reason
  );
}

function hasNodeErrorCause(error: unknown, code: string): boolean {
  return (
    error instanceof Error &&
    "cause" in error &&
    error.cause instanceof Error &&
    "code" in error.cause &&
    error.cause.code === code
  );
}
