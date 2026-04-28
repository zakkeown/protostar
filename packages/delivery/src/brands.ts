import type { DeliveryRefusal } from "./refusals.js";

// Phase 7 Q-08 brands, Pitfall 2 token formats, and Pitfall 3 UTF-8 byte body limits.
const BranchNameBrand: unique symbol = Symbol("BranchName");
const PrTitleBrand: unique symbol = Symbol("PrTitle");
const PrBodyBrand: unique symbol = Symbol("PrBody");

export type BranchName = string & { readonly [BranchNameBrand]: true };
export type PrTitle = string & { readonly [PrTitleBrand]: true };
export type PrBody = string & { readonly [PrBodyBrand]: true };

const BRANCH_REGEX = /^[a-zA-Z0-9._/-]+$/;
const CLASSIC_PAT = /^gh[pousr]_[A-Za-z0-9]{36}$/;
const FINE_GRAINED_PAT = /^github_pat_[A-Za-z0-9]{22}_[A-Za-z0-9]{59}$/;
const PR_TITLE_LIMIT = 200;
const PR_TITLE_TRUNCATED_PREFIX_LENGTH = 197;
const PR_BODY_LIMIT_BYTES = 60_000;

export const isValidGitHubTokenFormat = (s: string): boolean => CLASSIC_PAT.test(s) || FINE_GRAINED_PAT.test(s);

function findControlChar(s: string): { readonly position: number; readonly codepoint: number } | null {
  for (let index = 0; index < s.length; index += 1) {
    const codepoint = s.charCodeAt(index);
    if (codepoint <= 8 || codepoint === 11 || codepoint === 12 || (codepoint >= 14 && codepoint <= 31)) {
      return { position: index, codepoint };
    }
  }

  return null;
}

export function validateBranchName(
  s: string
): { readonly ok: true; readonly value: BranchName } | { readonly ok: false; readonly refusal: DeliveryRefusal } {
  const control = findControlChar(s);
  if (control !== null) {
    return { ok: false, refusal: { kind: "control-character", evidence: { field: "branch", ...control } } };
  }

  if (s.length === 0 || s.length > 244 || !BRANCH_REGEX.test(s)) {
    return { ok: false, refusal: { kind: "invalid-branch", evidence: { input: s, regex: BRANCH_REGEX.source } } };
  }

  return { ok: true, value: s as BranchName };
}

export function validatePrTitle(
  s: string
): { readonly ok: true; readonly value: PrTitle } | { readonly ok: false; readonly refusal: DeliveryRefusal } {
  const control = findControlChar(s);
  if (control !== null) {
    return { ok: false, refusal: { kind: "control-character", evidence: { field: "title", ...control } } };
  }

  const title = s.length > PR_TITLE_LIMIT ? `${s.slice(0, PR_TITLE_TRUNCATED_PREFIX_LENGTH)}…` : s;
  return { ok: true, value: title as PrTitle };
}

export function validatePrBody(
  s: string
): { readonly ok: true; readonly value: PrBody } | { readonly ok: false; readonly refusal: DeliveryRefusal } {
  const byteLength = Buffer.byteLength(s, "utf8");
  if (byteLength > PR_BODY_LIMIT_BYTES) {
    return { ok: false, refusal: { kind: "oversized-body", evidence: { byteLength, limit: PR_BODY_LIMIT_BYTES } } };
  }

  const control = findControlChar(s);
  if (control !== null) {
    return { ok: false, refusal: { kind: "control-character", evidence: { field: "body", ...control } } };
  }

  return { ok: true, value: s as PrBody };
}
