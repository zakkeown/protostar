/**
 * Phase 2 authority-governance-kernel regression e2e.
 *
 * Proves the eight Phase 2 verification gaps stay closed together as a single
 * cross-package flow. Factory-cli spawn tests (fail-closed precedence, two-key
 * launch, all-five-gates) live in apps/factory-cli/src/main.test.ts; this file
 * owns the reader/AuthorizedOp integration contract.
 */
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import {
  authorizeWorkspaceOp,
  authorizeSubprocessOp,
  authorizeNetworkOp,
  authorizeBudgetOp,
  buildPolicySnapshot,
  buildSignatureEnvelope,
  createAuthorityStageReader,
  DENY_ALL_REPO_POLICY,
  hashPolicySnapshot,
  intersectEnvelopes,
  verifyConfirmedIntentSignature,
  type FsAdapter
} from "@protostar/authority";
import { buildConfirmedIntentForTest } from "@protostar/intent/internal/test-builders";
import { promoteAndSignIntent } from "@protostar/intent";
import type { CapabilityEnvelope } from "@protostar/intent";

// ---------------------------------------------------------------------------
// In-memory filesystem (same pattern as signed-confirmed-intent.e2e.test.ts)
// ---------------------------------------------------------------------------

class InMemoryFs implements FsAdapter {
  constructor(public readonly files: Map<string, string>) {}

  async readFile(path: string): Promise<string> {
    const value = this.files.get(path);
    if (value === undefined) {
      throw Object.assign(new Error(`ENOENT: no such file: ${path}`), { code: "ENOENT" });
    }
    return value;
  }

  async exists(path: string): Promise<boolean> {
    return this.files.has(path);
  }
}

// ---------------------------------------------------------------------------
// Shared fixture helpers
// ---------------------------------------------------------------------------

const PERMISSIVE_ENVELOPE: CapabilityEnvelope = {
  repoScopes: [{ workspace: "self", path: ".", access: "write" }],
  toolPermissions: [
    { tool: "network", permissionLevel: "use", reason: "http calls", risk: "low" }
  ],
  executeGrants: [{ command: "pnpm", scope: "." }],
  workspace: { allowDirty: false },
  network: { allow: "loopback" },
  budget: {
    maxUsd: 10,
    maxTokens: 1000,
    timeoutMs: 60000,
    adapterRetriesPerTask: 4,
    taskWallClockMs: 180_000,
    deliveryWallClockMs: 600_000,
    maxRepairLoops: 3
  }
};

const EMPTY_ENVELOPE: CapabilityEnvelope = Object.freeze({
  repoScopes: [],
  toolPermissions: [],
  workspace: { allowDirty: false },
  budget: {}
});

function buildTestIntent(id: `intent_${string}`, envelope: CapabilityEnvelope) {
  return buildConfirmedIntentForTest({
    id,
    sourceDraftId: `draft_${id}` as `draft_${string}`,
    title: "Authority governance regression e2e",
    problem: "Phase 2 verification gaps must stay closed.",
    requester: "admission-e2e",
    acceptanceCriteria: [
      {
        id: `ac_${id}_1`,
        statement: "All Phase 2 authority contracts hold end-to-end.",
        verification: "test"
      }
    ],
    capabilityEnvelope: envelope,
    constraints: ["no filesystem authority in @protostar/authority"],
    stopConditions: ["any Phase 2 contract breach"],
    confirmedAt: "2026-04-27T00:00:00.000Z"
  });
}

function buildSignedRunFs(runDir: string) {
  const unsignedIntent = buildTestIntent("intent_gov_e2e_happy", PERMISSIVE_ENVELOPE);
  const snapshot = buildPolicySnapshot({
    capturedAt: "2026-04-27T00:00:00.000Z",
    policy: { archetype: "cosmetic-tweak" },
    resolvedEnvelope: unsignedIntent.capabilityEnvelope
  });
  const { signature: _sig, ...body } = unsignedIntent;
  const signature = buildSignatureEnvelope({
    intent: body,
    resolvedEnvelope: unsignedIntent.capabilityEnvelope,
    policySnapshotHash: hashPolicySnapshot(snapshot)
  });
  const signed = promoteAndSignIntent({ ...body, signature });
  if (!signed.ok) throw new Error(signed.errors.join("; "));

  // Admission decisions index (5 gates)
  const gates = ["intent", "planning", "capability", "repo-scope", "workspace-trust"] as const;
  const indexLines = gates.map((gate) =>
    JSON.stringify({
      runId: "run_gov_e2e_happy",
      timestamp: "2026-04-27T00:00:00.000Z",
      gate,
      outcome: "allow",
      artifactPath: `${runDir}/${gate}-admission-decision.json`,
      schemaVersion: "1.0.0",
      precedenceStatus: "no-conflict"
    })
  );

  const files = new Map<string, string>([
    [`${runDir}/intent.json`, JSON.stringify(signed.intent, null, 2)],
    [`${runDir}/policy-snapshot.json`, JSON.stringify(snapshot, null, 2)],
    [`${runDir}/admission-decisions.jsonl`, indexLines.join("\n") + "\n"]
  ]);
  return { fs: new InMemoryFs(files), signedIntent: signed.intent, snapshot };
}

// ---------------------------------------------------------------------------
// Test: missing repo-policy → blocked-by-tier
// ---------------------------------------------------------------------------

describe("Phase 2 - fail-closed precedence (missing repo-policy)", () => {
  it("DENY_ALL_REPO_POLICY produces blocked-by-tier for a workspace-write request", () => {
    const intentEnvelope: CapabilityEnvelope = {
      repoScopes: [{ workspace: "main", path: "src", access: "write" }],
      toolPermissions: [{ tool: "shell", permissionLevel: "write", reason: "edit", risk: "medium" }],
      workspace: { allowDirty: false },
      budget: { maxUsd: 5 }
    };

    const decision = intersectEnvelopes([
      {
        tier: "confirmed-intent",
        source: "intent",
        envelope: intentEnvelope
      },
      {
        tier: "repo-policy",
        source: "absent .protostar/repo-policy.json",
        envelope: DENY_ALL_REPO_POLICY
      }
    ]);

    assert.equal(decision.status, "blocked-by-tier");
    assert.ok(decision.blockedBy.some((entry) => entry.tier === "repo-policy"), "blocked-by tier must include repo-policy");
  });

  it("stage reader reads a persisted precedence-decision.json with blocked-by-tier status", async () => {
    const runDir = "/runs/gov_e2e_blocked";
    const intentEnvelope: CapabilityEnvelope = {
      repoScopes: [{ workspace: "main", path: "src", access: "write" }],
      toolPermissions: [],
      workspace: { allowDirty: false },
      budget: {}
    };
    const precedenceDecision = {
      schemaVersion: "1.0.0",
      status: "blocked-by-tier",
      resolvedEnvelope: intentEnvelope,
      tiers: [
        { tier: "confirmed-intent", source: "intent", envelope: intentEnvelope }
      ],
      blockedBy: [
        { tier: "repo-policy", reason: "allowedScopes is empty — default deny" }
      ]
    };
    const fs = new InMemoryFs(new Map([
      [`${runDir}/precedence-decision.json`, JSON.stringify(precedenceDecision)]
    ]));

    const reader = createAuthorityStageReader(runDir, fs);
    const result = await reader.precedenceDecision();

    assert.ok(result !== null, "precedence decision must be readable");
    assert.equal(result.status, "blocked-by-tier");
    assert.ok(result.blockedBy.some((entry) => entry.tier === "repo-policy"));
  });
});

// ---------------------------------------------------------------------------
// Test: permissive run emits 5 gate decisions readable through stage reader
// ---------------------------------------------------------------------------

describe("Phase 2 - permissive run: admission decisions index", () => {
  it("admissionDecisionsIndex returns 5 entries each with artifactPath", async () => {
    const runDir = "/runs/gov_e2e_permissive";
    const { fs } = buildSignedRunFs(runDir);

    const reader = createAuthorityStageReader(runDir, fs);
    const index = await reader.admissionDecisionsIndex();

    assert.equal(index.length, 5);
    const expectedGates = ["intent", "planning", "capability", "repo-scope", "workspace-trust"];
    for (const [i, entry] of index.entries()) {
      assert.equal(entry.gate, expectedGates[i], `index[${i}].gate must be ${String(expectedGates[i])}`);
      assert.ok(typeof entry.artifactPath === "string" && entry.artifactPath.length > 0, `index[${i}].artifactPath must be a non-empty string`);
    }
  });
});

// ---------------------------------------------------------------------------
// Test: confirmedIntent() succeeds on a valid signed run
// ---------------------------------------------------------------------------

describe("Phase 2 - verified two-key launch: confirmedIntent()", () => {
  it("confirmedIntent() returns the verified intent on a valid run", async () => {
    const runDir = "/runs/gov_e2e_confirmed";
    const { fs, signedIntent } = buildSignedRunFs(runDir);

    const reader = createAuthorityStageReader(runDir, fs);
    const intent = await reader.confirmedIntent();

    assert.equal(intent.id, signedIntent.id);
    assert.equal(intent.schemaVersion, "1.5.0");
  });

  it("confirmedIntent() fails when the persisted intent body is mutated", async () => {
    const runDir = "/runs/gov_e2e_tampered";
    const { fs } = buildSignedRunFs(runDir);

    // Mutate the persisted intent
    const intentPath = `${runDir}/intent.json`;
    const intent = JSON.parse(fs.files.get(intentPath) ?? "{}") as Record<string, unknown>;
    intent["title"] = "MUTATED — tamper test";
    fs.files.set(intentPath, JSON.stringify(intent));

    const reader = createAuthorityStageReader(runDir, fs);
    await assert.rejects(
      () => reader.confirmedIntent(),
      /signature verification failed/
    );
  });

  it("verifyConfirmedIntentSignature is consistent with confirmedIntent() on valid run", async () => {
    const runDir = "/runs/gov_e2e_verify_consistent";
    const { fs, signedIntent, snapshot } = buildSignedRunFs(runDir);

    const directResult = verifyConfirmedIntentSignature(
      signedIntent,
      snapshot,
      signedIntent.capabilityEnvelope
    );
    assert.equal(directResult.ok, true);

    const reader = createAuthorityStageReader(runDir, fs);
    const readerResult = await reader.verifyConfirmedIntent();
    assert.equal(readerResult.ok, true);
  });
});

// ---------------------------------------------------------------------------
// Test: empty-envelope authorize* ops return ok: false
// ---------------------------------------------------------------------------

describe("Phase 2 - authorized-op envelope enforcement (empty envelope)", () => {
  const untrustedWorkspace = Object.freeze({ root: "/tmp/test-workspace", trust: "untrusted" as const });
  const trustedWorkspace = Object.freeze({ root: "/tmp/test-workspace", trust: "trusted" as const });

  it("authorizeWorkspaceOp returns ok: false for empty resolvedEnvelope", () => {
    const result = authorizeWorkspaceOp({
      workspace: trustedWorkspace,
      path: "src/main.ts",
      access: "write",
      resolvedEnvelope: EMPTY_ENVELOPE
    });
    assert.equal(result.ok, false);
    assert.ok(result.errors.length > 0, "errors must be non-empty");
  });

  it("authorizeWorkspaceOp returns ok: false for untrusted workspace", () => {
    const result = authorizeWorkspaceOp({
      workspace: untrustedWorkspace,
      path: "src/main.ts",
      access: "write",
      resolvedEnvelope: PERMISSIVE_ENVELOPE
    });
    assert.equal(result.ok, false);
    assert.ok(result.errors.length > 0, "errors must be non-empty");
  });

  it("authorizeSubprocessOp returns ok: false for empty resolvedEnvelope", () => {
    const result = authorizeSubprocessOp({
      command: "pnpm",
      args: ["test"],
      cwd: ".",
      resolvedEnvelope: EMPTY_ENVELOPE
    });
    assert.equal(result.ok, false);
    assert.ok(result.errors.length > 0, "errors must be non-empty");
  });

  it("authorizeNetworkOp returns ok: false for empty resolvedEnvelope", () => {
    const result = authorizeNetworkOp({
      method: "GET",
      url: "https://example.com/api",
      resolvedEnvelope: EMPTY_ENVELOPE
    });
    assert.equal(result.ok, false);
    assert.ok(result.errors.length > 0, "errors must be non-empty");
  });

  it("authorizeBudgetOp returns ok: false for empty resolvedEnvelope", () => {
    const result = authorizeBudgetOp({
      boundary: "judge-panel",
      budgetKey: "maxUsd",
      amount: 1,
      resolvedEnvelope: EMPTY_ENVELOPE
    });
    assert.equal(result.ok, false);
    assert.ok(result.errors.length > 0, "errors must be non-empty");
  });
});
