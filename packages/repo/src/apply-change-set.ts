import { createHash } from "node:crypto";

import { applyPatch, parsePatch, type StructuredPatch } from "diff";

import { FsAdapterError, readFile, writeFile } from "./fs-adapter.js";
import type { AuthorizedWorkspaceOp } from "./fs-adapter.js";

export interface PatchRequest {
  /** Workspace-relative path of the file to patch. */
  readonly path: string;
  /** Authorized op for FS access. Caller mints this via the authority boundary. */
  readonly op: AuthorizedWorkspaceOp;
  /** Unified-diff text. */
  readonly diff: string;
  /** Hex-encoded SHA-256 of expected pre-image bytes. */
  readonly preImageSha256: string;
}

export type ChangeSetArchetype = "cosmetic-tweak" | "feature-add" | "refactor" | "bugfix";

export interface ApplyChangeSetInput {
  readonly patches: readonly PatchRequest[];
  readonly archetype?: ChangeSetArchetype;
}

export type ApplyStatus = "applied" | "skipped-hash-mismatch" | "skipped-error";

export type ApplyError =
  | "binary-not-supported"
  | "cosmetic-archetype-multifile"
  | "hunk-fit-failure"
  | "io-error"
  | "parse-error";

export interface ApplyResult {
  readonly path: string;
  readonly status: ApplyStatus;
  readonly error?: ApplyError;
  readonly evidence?: {
    readonly touchedFiles?: readonly string[];
  };
}

export async function applyChangeSet(
  changeSet: readonly PatchRequest[] | ApplyChangeSetInput
): Promise<readonly ApplyResult[]> {
  const input = normalizeChangeSet(changeSet);
  const cosmeticRefusal = refuseCosmeticMultifile(input);
  if (cosmeticRefusal !== null) return cosmeticRefusal;

  const results: ApplyResult[] = [];

  for (const patch of input.patches) {
    results.push(await applyOnePatch(patch));
  }

  return results;
}

function normalizeChangeSet(
  changeSet: readonly PatchRequest[] | ApplyChangeSetInput
): ApplyChangeSetInput {
  if (!("patches" in changeSet)) return { patches: changeSet };

  return changeSet;
}

function refuseCosmeticMultifile(input: ApplyChangeSetInput): readonly ApplyResult[] | null {
  if (input.archetype !== "cosmetic-tweak") return null;

  const touchedFiles = Array.from(new Set(input.patches.map(({ path }) => path))).sort();
  if (touchedFiles.length <= 1) return null;

  const firstPatch = input.patches[0];
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
