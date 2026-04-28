import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { DeliveryRefusal } from "./refusals.js";

const allRefusals = [
  { kind: "invalid-branch", evidence: { input: "bad branch", regex: "^[a-zA-Z0-9._/-]+$" } },
  { kind: "invalid-title", evidence: { input: "bad\u0000title", position: 3 } },
  { kind: "invalid-body", evidence: { input: "bad\u0000body", position: 3 } },
  { kind: "oversized-body", evidence: { byteLength: 60_001, limit: 60_000 } },
  { kind: "control-character", evidence: { field: "body", position: 5, codepoint: 7 } },
  { kind: "token-missing", evidence: { envVar: "PROTOSTAR_GITHUB_TOKEN" } },
  { kind: "token-invalid", evidence: { reason: "format" } },
  { kind: "repo-inaccessible", evidence: { status: 404, owner: "owner", repo: "repo" } },
  { kind: "base-branch-missing", evidence: { baseBranch: "main" } },
  { kind: "excessive-pat-scope", evidence: { scopes: ["repo", "admin:org"], forbidden: ["admin:org"] } },
  { kind: "pr-already-closed", evidence: { prUrl: "https://github.com/o/r/pull/1", prNumber: 1 } },
  { kind: "pr-ambiguous", evidence: { prs: ["https://github.com/o/r/pull/1"] } },
  { kind: "remote-diverged", evidence: { branch: "feature/a", expectedSha: null, remoteSha: "abc123" } },
  { kind: "cancelled", evidence: { reason: "timeout", phase: "poll" } }
] satisfies readonly DeliveryRefusal[];

function describeRefusal(refusal: DeliveryRefusal): string {
  switch (refusal.kind) {
    case "invalid-branch":
      return refusal.evidence.regex;
    case "invalid-title":
    case "invalid-body":
      return refusal.evidence.input;
    case "oversized-body":
      return String(refusal.evidence.byteLength);
    case "control-character":
      return refusal.evidence.field;
    case "token-missing":
      return refusal.evidence.envVar;
    case "token-invalid":
      return refusal.evidence.reason;
    case "repo-inaccessible":
      return `${refusal.evidence.owner}/${refusal.evidence.repo}`;
    case "base-branch-missing":
      return refusal.evidence.baseBranch;
    case "excessive-pat-scope":
      return refusal.evidence.forbidden.join(",");
    case "pr-already-closed":
      return String(refusal.evidence.prNumber);
    case "pr-ambiguous":
      return String(refusal.evidence.prs.length);
    case "remote-diverged":
      return refusal.evidence.remoteSha;
    case "cancelled":
      return refusal.evidence.phase;
  }
}

describe("DeliveryRefusal", () => {
  it("defines all 14 named discriminator variants with variant evidence", () => {
    assert.deepEqual(
      allRefusals.map((refusal) => refusal.kind),
      [
        "invalid-branch",
        "invalid-title",
        "invalid-body",
        "oversized-body",
        "control-character",
        "token-missing",
        "token-invalid",
        "repo-inaccessible",
        "base-branch-missing",
        "excessive-pat-scope",
        "pr-already-closed",
        "pr-ambiguous",
        "remote-diverged",
        "cancelled"
      ]
    );
  });

  it("narrows evidence by kind", () => {
    assert.equal(describeRefusal(allRefusals[0]), "^[a-zA-Z0-9._/-]+$");
    assert.equal(describeRefusal(allRefusals[13]), "poll");
  });
});
