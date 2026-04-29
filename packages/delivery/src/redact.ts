/**
 * Shared token-shape detection + redaction for evidence/log persistence.
 * Lifted from delivery-runtime/src/map-octokit-error.ts:6 (Phase 12 D-08).
 * Consumers: @protostar/delivery-runtime, @protostar/repo (subprocess-runner),
 * and the AUTH-15 secret-leak attack test must all import from this single module.
 */
export const TOKEN_PATTERNS: readonly RegExp[] = Object.freeze([
  // GitHub PATs — classic and fine-grained
  /\b(gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9]{22}_[A-Za-z0-9]{59,})\b/g,
  // Bearer headers — case-insensitive, base64-ish payload
  /\bBearer\s+[A-Za-z0-9._\-+/=]{16,}\b/gi,
  // JWT — three base64url segments separated by dots
  /\beyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\b/g
]);

export function redactTokens(value: string): string {
  let out = value;
  for (const pattern of TOKEN_PATTERNS) {
    out = out.replace(pattern, "***");
  }
  return out;
}
