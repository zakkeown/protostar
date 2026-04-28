// Marker pattern: `<!-- protostar-evidence:{kind}:{runId} -->`.
// The runId suffix (Pitfall 9) prevents reviewer-typed strings from accidentally matching.
export const EVIDENCE_MARKER_PREFIX = "<!-- protostar-evidence:";

export const EVIDENCE_COMMENT_KINDS = [
  "mechanical-full",
  "judge-transcripts",
  "repair-history",
  "oversized-body-overflow"
] as const;

export type EvidenceCommentKind = (typeof EVIDENCE_COMMENT_KINDS)[number];

const MARKER_REGEX = /^<!-- protostar-evidence:([a-z-]+):([A-Za-z0-9_-]+) -->$/;

export function buildEvidenceMarker(kind: EvidenceCommentKind, runId: string): string {
  return `<!-- protostar-evidence:${kind}:${runId} -->`;
}

export function parseEvidenceMarker(marker: string): { readonly kind: EvidenceCommentKind; readonly runId: string } | null {
  const match = MARKER_REGEX.exec(marker);
  if (match === null) {
    return null;
  }

  const [, kind, runId] = match;
  if (kind === undefined || runId === undefined || !EVIDENCE_COMMENT_KINDS.includes(kind as EvidenceCommentKind)) {
    return null;
  }

  return { kind: kind as EvidenceCommentKind, runId };
}
