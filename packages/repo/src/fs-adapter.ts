import { lstat, readFile as fsReadFile, unlink, writeFile as fsWriteFile } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

import type { WorkspaceRef } from "./index.js";

export interface AuthorizedWorkspaceOp {
  readonly workspace: WorkspaceRef;
  readonly path: string;
  readonly access: "read" | "write" | "execute";
  readonly resolvedEnvelope: unknown;
}

export type FsAdapterErrorReason =
  | "canonicalization-mismatch"
  | "escape-attempt"
  | "symlink-refusal"
  | "access-mismatch"
  | "io-error";

export class FsAdapterError extends Error {
  constructor(
    public readonly op: AuthorizedWorkspaceOp,
    public readonly reason: FsAdapterErrorReason,
    message: string,
    options?: { readonly cause?: unknown }
  ) {
    super(message, options);
    this.name = "FsAdapterError";
  }
}

export async function readFile(op: AuthorizedWorkspaceOp): Promise<Buffer> {
  assertReadAccess(op);
  const reResolved = assertSafePath(op);
  await assertNoSymlink(op, reResolved);

  try {
    return await fsReadFile(reResolved);
  } catch (error) {
    throw ioError(op, `failed to read ${reResolved}`, error);
  }
}

export async function writeFile(op: AuthorizedWorkspaceOp, bytes: Buffer): Promise<void> {
  assertWriteAccess(op);
  const reResolved = assertSafePath(op);
  await assertWritableTargetIsNotSymlink(op, reResolved);

  try {
    await fsWriteFile(reResolved, bytes);
  } catch (error) {
    throw ioError(op, `failed to write ${reResolved}`, error);
  }

  await assertNoSymlink(op, reResolved);
}

export async function deleteFile(op: AuthorizedWorkspaceOp): Promise<void> {
  assertWriteAccess(op);
  const reResolved = assertSafePath(op);
  await assertNoSymlink(op, reResolved);

  try {
    await unlink(reResolved);
  } catch (error) {
    throw ioError(op, `failed to delete ${reResolved}`, error);
  }
}

function assertReadAccess(op: AuthorizedWorkspaceOp): void {
  if (op.access === "read" || op.access === "write" || op.access === "execute") return;
  throw new FsAdapterError(op, "access-mismatch", `workspace op cannot read with ${op.access} access`);
}

function assertWriteAccess(op: AuthorizedWorkspaceOp): void {
  if (op.access === "write") return;
  throw new FsAdapterError(op, "access-mismatch", `workspace op cannot write with ${op.access} access`);
}

function assertSafePath(op: AuthorizedWorkspaceOp): string {
  const reResolved = isAbsolute(op.path)
    ? resolve(op.path)
    : resolve(op.workspace.root, op.path);

  if (reResolved !== op.path) {
    throw new FsAdapterError(
      op,
      "canonicalization-mismatch",
      `workspace op path changed during re-canonicalization: ${op.path} -> ${reResolved}`
    );
  }

  const workspaceRelativePath = relative(op.workspace.root, reResolved);
  if (
    workspaceRelativePath === ".." ||
    workspaceRelativePath.startsWith(`..${sep}`) ||
    isAbsolute(workspaceRelativePath)
  ) {
    throw new FsAdapterError(
      op,
      "escape-attempt",
      `workspace op path escapes workspace root: ${op.workspace.root} -> ${reResolved}`
    );
  }

  return reResolved;
}

async function assertNoSymlink(op: AuthorizedWorkspaceOp, path: string): Promise<void> {
  let stat;
  try {
    stat = await lstat(path);
  } catch (error) {
    throw ioError(op, `failed to inspect ${path}`, error);
  }

  if (stat.isSymbolicLink()) {
    throw new FsAdapterError(op, "symlink-refusal", `workspace op refuses symlink path: ${path}`);
  }
}

async function assertWritableTargetIsNotSymlink(op: AuthorizedWorkspaceOp, path: string): Promise<void> {
  let stat;
  try {
    stat = await lstat(path);
  } catch (error) {
    if (isNodeErrorCode(error, "ENOENT")) return;
    throw ioError(op, `failed to inspect ${path}`, error);
  }

  if (stat.isSymbolicLink()) {
    throw new FsAdapterError(op, "symlink-refusal", `workspace op refuses symlink path: ${path}`);
  }
}

function ioError(op: AuthorizedWorkspaceOp, message: string, cause: unknown): FsAdapterError {
  return new FsAdapterError(op, "io-error", message, { cause });
}

function isNodeErrorCode(error: unknown, code: string): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    error.code === code
  );
}
