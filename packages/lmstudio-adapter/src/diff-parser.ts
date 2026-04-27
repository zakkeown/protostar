export const DIFF_FENCE_RE = /^```(?:diff|patch)?\s*\n([\s\S]*?)\n```\s*$/m;

const ANY_DIFF_FENCE_RE = /```(?:diff|patch)?\s*\n[\s\S]*?\n```/gm;

export type DiffParseResult =
  | { readonly ok: true; readonly diff: string }
  | { readonly ok: false; readonly reason: "parse-no-block" | "parse-multiple-blocks" };

export function parseDiffBlock(content: string): DiffParseResult {
  const matches = [...content.matchAll(ANY_DIFF_FENCE_RE)];
  if (matches.length === 0) {
    return { ok: false, reason: "parse-no-block" };
  }
  if (matches.length > 1) {
    return { ok: false, reason: "parse-multiple-blocks" };
  }

  const fencedBlock = matches[0]?.[0];
  if (fencedBlock === undefined || content.trim() !== fencedBlock.trim()) {
    return { ok: false, reason: "parse-no-block" };
  }

  const parsed = fencedBlock.match(DIFF_FENCE_RE);
  if (parsed === null) {
    return { ok: false, reason: "parse-no-block" };
  }

  return { ok: true, diff: parsed[1] ?? "" };
}
