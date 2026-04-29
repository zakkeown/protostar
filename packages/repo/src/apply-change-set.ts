import { createHash } from "node:crypto";
import { isAbsolute as isAbsoluteOs, relative as relativeOs } from "node:path";

import { canonicalizeRelativePath } from "@protostar/paths";
import { applyPatch, parsePatch, type StructuredPatch } from "diff";

import { FsAdapterError, readFile, writeFile } from "./fs-adapter.js";
import type { AuthorizedWorkspaceOp } from "./fs-adapter.js";

declare const __patchRequestBrand: unique symbol;

/**
 * Branded patch request. Construct only via `mintPatchRequest` so the
 * `path` / `op.path` / parsed-diff filename invariant is enforced (D-09).
 *
 * Equality across the three sources is exact-string `===` after canonicalization
 * through `@protostar/paths::canonicalizeRelativePath` (D-10).
 */
export type PatchRequest = {
  /** Workspace-relative path of the file to patch. */
  readonly path: string;
  /** Authorized op for FS access. Caller mints this via the authority boundary. */
  readonly op: AuthorizedWorkspaceOp;
  /** Unified-diff text. */
  readonly diff: string;
  /** Hex-encoded SHA-256 of expected pre-image bytes. */
  readonly preImageSha256: string;
} & { readonly [__patchRequestBrand]: void };

export type PatchRequestMintError =
  | "path-mismatch"
  | "diff-filename-mismatch"
  | "diff-parse-error";

export interface PatchRequestMintInput {
  readonly path: string;
  readonly op: AuthorizedWorkspaceOp;
  readonly diff: string;
  readonly preImageSha256: string;
}

export type ChangeSetArchetype = "cosmetic-tweak" | "feature-add" | "refactor" | "bugfix";

export interface ApplyChangeSetInput {
  readonly archetype?: ChangeSetArchetype;
}

export type ApplyStatus = "applied" | "skipped-hash-mismatch" | "skipped-error";

export type ApplyError =
  | "binary-not-supported"
  | "cosmetic-archetype-multifile"
  | "hunk-fit-failure"
  | "io-error"
  | "parse-error"
  | "path-op-diff-mismatch";

export interface ApplyResult {
  readonly path: string;
  readonly status: ApplyStatus;
  readonly error?: ApplyError;
  readonly evidence?: {
    readonly touchedFiles?: readonly string[];
  };
}

function stripDiffPrefix(filename: string): string {
  if (filename.startsWith("a/") || filename.startsWith("b/")) {
    return filename.slice(2);
  }
  return filename;
}

function opPathRelative(op: AuthorizedWorkspaceOp): string {
  // fs-adapter requires op.path to be absolute in production (it re-resolves
  // and demands strict equality). Test fixtures may pass a relative op.path.
  // Reconcile both conventions before canonicalization.
  if (isAbsoluteOs(op.path)) {
    return relativeOs(op.workspace.root, op.path);
  }
  return op.path;
}

type CheckOk = { readonly ok: true; readonly canonPath: string };
type CheckErr = { readonly ok: false; readonly error: PatchRequestMintError };

function checkInvariant(input: PatchRequestMintInput): CheckOk | CheckErr {
  let canonPath: string;
  let canonOpPath: string;
  try {
    canonPath = canonicalizeRelativePath(input.path);
    canonOpPath = canonicalizeRelativePath(opPathRelative(input.op));
  } catch {
    return { ok: false, error: "path-mismatch" };
  }
  if (canonPath !== canonOpPath) {
    return { ok: false, error: "path-mismatch" };
  }

  let parsed: readonly StructuredPatch[];
  try {
    parsed = parsePatch(input.diff);
  } catch {
    return { ok: false, error: "diff-parse-error" };
  }
  const first = parsed[0];
  if (first === undefined) return { ok: false, error: "diff-parse-error" };
  const filename = first.newFileName ?? first.oldFileName;
  if (
    filename === undefined ||
    filename === "/dev/null" ||
    filename.length === 0
  ) {
    return { ok: false, error: "diff-parse-error" };
  }
  // diff lib parses unparseable strings as a single patch with no hunks and a
  // bogus filename. Treat zero-hunk parses with no recognizable header as
  // diff-parse-error rather than diff-filename-mismatch.
  if (first.hunks.length === 0 && first.oldFileName === undefined && first.newFileName === undefined) {
    return { ok: false, error: "diff-parse-error" };
  }
  let canonDiffPath: string;
  try {
    canonDiffPath = canonicalizeRelativePath(stripDiffPrefix(filename));
  } catch {
    return { ok: false, error: "diff-filename-mismatch" };
  }
  if (canonPath !== canonDiffPath) {
    return { ok: false, error: "diff-filename-mismatch" };
  }
  return { ok: true, canonPath };
}

/**
 * Mint a branded PatchRequest after enforcing the path/op/diff invariant.
 *
 * Returns `{ok:true, request}` on success, or `{ok:false, error}` with a
 * machine-readable refusal reason. Callers SHOULD surface refusals as
 * blocked-execution evidence rather than retrying with the same inputs.
 */
export function mintPatchRequest(
  input: PatchRequestMintInput
):
  | { readonly ok: true; readonly request: PatchRequest }
  | { readonly ok: false; readonly error: PatchRequestMintError } {
  const result = checkInvariant(input);
  if (!result.ok) return { ok: false, error: result.error };
  const branded = {
    path: input.path,
    op: input.op,
    diff: input.diff,
    preImageSha256: input.preImageSha256
  } as PatchRequest;
  return { ok: true, request: branded };
}

export async function applyChangeSet(
  patches: readonly PatchRequest[],
  input: ApplyChangeSetInput = {}
): Promise<readonly ApplyResult[]> {
  // Defense-in-depth: re-assert the path/op/diff invariant at function entry.
  // Catches handcrafted brand instances (test casts) before any I/O.
  // Pitfall 5: this MUST share the canonicalize helper with mintPatchRequest.
  const reassertFailure = reassertInvariants(patches);
  if (reassertFailure !== null) return reassertFailure;

  const cosmeticRefusal = refuseCosmeticMultifile(patches, input);
  if (cosmeticRefusal !== null) return cosmeticRefusal;

  const results: ApplyResult[] = [];

  for (const patch of patches) {
    results.push(await applyOnePatch(patch));
  }

  return results;
}

function reassertInvariants(
  patches: readonly PatchRequest[]
): readonly ApplyResult[] | null {
  for (const patch of patches) {
    const check = checkInvariant(patch);
    if (!check.ok) {
      return [
        {
          path: patch.path,
          status: "skipped-error",
          error: "path-op-diff-mismatch"
        }
      ];
    }
  }
  return null;
}

function refuseCosmeticMultifile(
  patches: readonly PatchRequest[],
  input: ApplyChangeSetInput
): readonly ApplyResult[] | null {
  if (input.archetype !== "cosmetic-tweak") return null;

  const touchedFiles = Array.from(new Set(patches.map(({ path }) => path))).sort();
  if (touchedFiles.length <= 1) return null;

  const firstPatch = patches[0];
  return [
    {
      path: firstPatch?.path ?? touchedFiles[0] ?? "",
      status: "skipped-error",
      error: "cosmetic-archetype-multifile",
      evidence: { touchedFiles }
    }
  ];
}

async function applyOnePatch(patch: PatchRequest): Promise<ApplyResult> {
  let preImageBytes: Buffer;
  try {
    preImageBytes = await readFile(patch.op);
  } catch (error) {
    return ioResult(patch, error);
  }

  const hash = createHash("sha256").update(preImageBytes).digest("hex");
  if (hash !== patch.preImageSha256) {
    return { path: patch.path, status: "skipped-hash-mismatch" };
  }

  let parsed: StructuredPatch[];
  try {
    parsed = parsePatch(patch.diff);
  } catch {
    return { path: patch.path, status: "skipped-error", error: "parse-error" };
  }

  if (containsBinaryMarker(patch.diff, parsed)) {
    return { path: patch.path, status: "skipped-error", error: "binary-not-supported" };
  }

  const structuredPatch = parsed[0];
  if (structuredPatch === undefined || structuredPatch.hunks.length === 0) {
    return { path: patch.path, status: "skipped-error", error: "parse-error" };
  }

  const applied = applyPatch(preImageBytes.toString("utf8"), structuredPatch);
  if (applied === false) {
    return { path: patch.path, status: "skipped-error", error: "hunk-fit-failure" };
  }

  try {
    await writeFile(patch.op, Buffer.from(applied, "utf8"));
  } catch (error) {
    return ioResult(patch, error);
  }

  return { path: patch.path, status: "applied" };
}

function containsBinaryMarker(
  diffText: string,
  parsed: readonly StructuredPatch[]
): boolean {
  // diff.parsePatch may either preserve the binary marker in hunk lines or
  // return no structured patch at all. The raw-text fallback keeps binary
  // patch refusal ahead of generic parse errors.
  if (/^Binary files /m.test(diffText)) return true;

  return parsed.some((structuredPatch) =>
    structuredPatch.hunks.some((hunk) =>
      hunk.lines.some((line) => line.startsWith("Binary files "))
    )
  );
}

function ioResult(patch: PatchRequest, error: unknown): ApplyResult {
  if (error instanceof FsAdapterError) {
    return { path: patch.path, status: "skipped-error", error: "io-error" };
  }

  return { path: patch.path, status: "skipped-error", error: "io-error" };
}
