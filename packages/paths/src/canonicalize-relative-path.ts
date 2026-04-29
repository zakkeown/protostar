import { posix } from "node:path";

/**
 * Canonicalize a workspace-relative path for exact-string `===` comparison.
 * Uses node:path/posix to keep behavior identical across platforms.
 *
 * Refuses absolute paths and `..`-escaping inputs. Strips a single leading `./`.
 *
 * Phase 12 D-10: shared helper for the PatchRequest path/op/diff invariant.
 */
export function canonicalizeRelativePath(input: string): string {
  if (posix.isAbsolute(input)) {
    throw new Error(
      `canonicalizeRelativePath: absolute path not allowed: ${input}`
    );
  }
  const normalized = posix.normalize(input).replace(/^\.\//, "");
  if (normalized === ".." || normalized.startsWith("../")) {
    throw new Error(
      `canonicalizeRelativePath: path escapes workspace: ${input}`
    );
  }
  return normalized;
}
