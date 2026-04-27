import assert from "node:assert/strict";
import { createRequire } from "node:module";

import type { ApplyResult } from "@protostar/repo";

const require = createRequire(import.meta.url);

interface RepoRuntimeSchema {
  readonly properties: {
    readonly evidence: {
      readonly required: readonly string[];
      readonly additionalProperties: false;
      readonly properties: Record<string, unknown>;
    };
  };
}

const schema = require("@protostar/repo/schema/repo-runtime-admission-decision.schema.json") as RepoRuntimeSchema;

export interface RepoRuntimeEvidence {
  readonly workspaceRoot: string;
  readonly auth: { readonly mode: "credentialRef" | "system" | "anonymous"; readonly credentialRef?: string };
  readonly effectiveAllowlist: readonly string[];
  readonly patchResults: readonly ApplyResult[];
  readonly subprocessRecords: readonly unknown[];
  readonly dirtyWorktree?: { readonly isDirty: boolean; readonly dirtyFiles: readonly string[] };
  readonly symlinkRefusal?: { readonly offendingPaths: readonly string[] };
  readonly errors?: readonly string[];
}

export interface RepoRuntimeAdmissionDecision {
  readonly schemaVersion: "1.0.0";
  readonly runId: string;
  readonly gate: "repo-runtime";
  readonly outcome: "allow" | "block" | "escalate";
  readonly timestamp: string;
  readonly precedenceResolution: { readonly status: "no-conflict" | "resolved" | "blocked-by-tier" };
  readonly evidence: RepoRuntimeEvidence;
}

const REQUIRED_EVIDENCE_KEYS = [
  "workspaceRoot",
  "auth",
  "effectiveAllowlist",
  "patchResults",
  "subprocessRecords"
] as const;

const ALLOWED_EVIDENCE_KEYS = new Set([
  ...REQUIRED_EVIDENCE_KEYS,
  "symlinkRefusal",
  "dirtyWorktree",
  "errors"
]);

export function buildRepoRuntimeAdmissionDecision(
  evidence: RepoRuntimeEvidence,
  outcome: RepoRuntimeAdmissionDecision["outcome"] = "block"
): RepoRuntimeAdmissionDecision {
  return {
    schemaVersion: "1.0.0",
    runId: "run_repo_runtime_contract",
    gate: "repo-runtime",
    outcome,
    timestamp: "2026-04-27T00:00:00.000Z",
    precedenceResolution: { status: "no-conflict" },
    evidence
  };
}

export function assertRepoRuntimeDecisionShape(
  decision: RepoRuntimeAdmissionDecision
): void {
  assert.deepEqual(schema.properties.evidence.required, REQUIRED_EVIDENCE_KEYS);
  assert.equal(schema.properties.evidence.additionalProperties, false);
  assert.deepEqual(Object.keys(decision).sort(), [
    "evidence",
    "gate",
    "outcome",
    "precedenceResolution",
    "runId",
    "schemaVersion",
    "timestamp"
  ]);
  assert.equal(decision.schemaVersion, "1.0.0");
  assert.match(decision.runId, /^run[-_][A-Za-z0-9_-]+$/);
  assert.equal(decision.gate, "repo-runtime");
  assert.ok(["allow", "block", "escalate"].includes(decision.outcome));
  assert.match(decision.timestamp, /^\d{4}-\d{2}-\d{2}T/);
  assertRepoRuntimeEvidenceShape(decision.evidence);
}

export function assertRepoRuntimeEvidenceShape(evidence: RepoRuntimeEvidence): void {
  for (const requiredKey of REQUIRED_EVIDENCE_KEYS) {
    assert.ok(requiredKey in evidence, `missing evidence.${requiredKey}`);
  }

  for (const key of Object.keys(evidence)) {
    assert.equal(ALLOWED_EVIDENCE_KEYS.has(key), true, `unexpected evidence.${key}`);
  }

  assert.equal(typeof evidence.workspaceRoot, "string");
  assert.ok(evidence.workspaceRoot.length > 0);
  assert.ok(["credentialRef", "system", "anonymous"].includes(evidence.auth.mode));
  assert.equal(Array.isArray(evidence.effectiveAllowlist), true);
  assert.equal(Array.isArray(evidence.patchResults), true);
  assert.equal(Array.isArray(evidence.subprocessRecords), true);

  if (evidence.dirtyWorktree !== undefined) {
    assert.equal(typeof evidence.dirtyWorktree.isDirty, "boolean");
    assert.equal(Array.isArray(evidence.dirtyWorktree.dirtyFiles), true);
  }

  if (evidence.symlinkRefusal !== undefined) {
    assert.equal(Array.isArray(evidence.symlinkRefusal.offendingPaths), true);
  }

  if (evidence.errors !== undefined) {
    assert.equal(Array.isArray(evidence.errors), true);
  }
}
