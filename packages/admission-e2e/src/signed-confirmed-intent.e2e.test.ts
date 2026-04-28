import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import {
  buildPolicySnapshot,
  buildSignatureEnvelope,
  createAuthorityStageReader,
  hashPolicySnapshot,
  verifyConfirmedIntentSignature,
  type FsAdapter
} from "@protostar/authority";
import { buildConfirmedIntentForTest } from "@protostar/intent/internal/test-builders";
import { promoteAndSignIntent } from "@protostar/intent";

class InMemoryFs implements FsAdapter {
  constructor(public readonly files: Map<string, string>) {}

  async readFile(path: string): Promise<string> {
    const value = this.files.get(path);
    if (value === undefined) {
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    }
    return value;
  }

  async exists(path: string): Promise<boolean> {
    return this.files.has(path);
  }
}

describe("Phase 2 - signed-intent end-to-end", () => {
  it("happy path: signed intent verifies ok through the stage reader", async () => {
    const { fs, runDir, signedIntent, snapshot } = setupHappyRun();
    const direct = verifyConfirmedIntentSignature(
      signedIntent,
      snapshot,
      signedIntent.capabilityEnvelope
    );
    assert.equal(direct.ok, true);

    const reader = createAuthorityStageReader(runDir, fs);
    const result = await reader.verifyConfirmedIntent();
    assert.equal(result.ok, true);
  });

  it("tampered intent body: verify fails with a body/envelope/hash mismatch", async () => {
    const { fs, runDir } = setupHappyRun();
    const intentPath = `${runDir}/intent.json`;
    const intent = JSON.parse(fs.files.get(intentPath) ?? "{}") as Record<string, unknown>;
    intent["title"] = "MUTATED - should fail signature";
    fs.files.set(intentPath, JSON.stringify(intent));

    const reader = createAuthorityStageReader(runDir, fs);
    const result = await reader.verifyConfirmedIntent();
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(
        ["intentBody", "resolvedEnvelope", "policySnapshotHash", "canonicalForm", "algorithm"].includes(
          result.mismatch.field
        )
      );
    }
  });

  it("tampered policy snapshot: verify fails with policySnapshotHash mismatch", async () => {
    const { fs, runDir } = setupHappyRun();
    const snapshotPath = `${runDir}/policy-snapshot.json`;
    const snapshot = JSON.parse(fs.files.get(snapshotPath) ?? "{}") as Record<string, unknown>;
    snapshot["capturedAt"] = "1970-01-01T00:00:00.000Z";
    fs.files.set(snapshotPath, JSON.stringify(snapshot));

    const reader = createAuthorityStageReader(runDir, fs);
    const result = await reader.verifyConfirmedIntent();
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.mismatch.field, "policySnapshotHash");
    }
  });

  it("unknown canonicalForm tag fails closed", async () => {
    const { fs, runDir } = setupHappyRun();
    const intentPath = `${runDir}/intent.json`;
    const intent = JSON.parse(fs.files.get(intentPath) ?? "{}") as {
      signature?: { canonicalForm?: string };
    };
    assert.ok(intent.signature);
    intent.signature.canonicalForm = "json-c14n@2.0";
    fs.files.set(intentPath, JSON.stringify(intent));

    const reader = createAuthorityStageReader(runDir, fs);
    try {
      const result = await reader.verifyConfirmedIntent();
      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.equal(result.mismatch.field, "canonicalForm");
      }
    } catch (error) {
      assert.match(error instanceof Error ? error.message : String(error), /canonicalForm/);
    }
  });
});

function setupHappyRun() {
  const runDir = "/runs/run-test-1";
  const unsignedIntent = buildConfirmedIntentForTest({
    id: "intent_signed_e2e_1",
    sourceDraftId: "draft_signed_e2e_1",
    title: "Signed e2e",
    problem: "The persisted intent must be tamper evident.",
    requester: "admission-e2e",
    acceptanceCriteria: [
      {
        id: "ac_signed_e2e_1",
        statement: "The signed intent verifies through the stage reader.",
        verification: "test"
      }
    ],
    capabilityEnvelope: {
      repoScopes: [
        {
          workspace: "self",
          path: ".",
          access: "read"
        }
      ],
      toolPermissions: [
        {
          tool: "pnpm",
          permissionLevel: "use",
          reason: "verification",
          risk: "low"
        }
      ],
      workspace: {
        allowDirty: false
      },
      network: {
        allow: "loopback"
      },
      budget: {
        adapterRetriesPerTask: 4,
        timeoutMs: 1000,
        taskWallClockMs: 180_000,
        deliveryWallClockMs: 600_000,
        maxRepairLoops: 3
      }
    },
    constraints: ["no filesystem authority in @protostar/authority"],
    stopConditions: ["signature mismatch"],
    confirmedAt: "2026-04-27T00:00:00.000Z"
  });
  const snapshot = buildPolicySnapshot({
    capturedAt: "2026-04-27T00:00:00.000Z",
    policy: { archetype: "cosmetic-tweak" },
    resolvedEnvelope: unsignedIntent.capabilityEnvelope
  });
  const signature = buildSignatureEnvelope({
    intent: stripSignature(unsignedIntent),
    resolvedEnvelope: unsignedIntent.capabilityEnvelope,
    policySnapshotHash: hashPolicySnapshot(snapshot)
  });
  const signed = promoteAndSignIntent({
    ...stripSignature(unsignedIntent),
    signature
  });
  if (!signed.ok) {
    throw new Error(signed.errors.join("; "));
  }
  assert.equal(signed.ok, true);

  return {
    runDir,
    signedIntent: signed.intent,
    snapshot,
    fs: new InMemoryFs(new Map([
      [`${runDir}/intent.json`, JSON.stringify(signed.intent, null, 2)],
      [`${runDir}/policy-snapshot.json`, JSON.stringify(snapshot, null, 2)]
    ]))
  };
}

function stripSignature<T extends { readonly signature: unknown }>(intent: T): Omit<T, "signature"> {
  const { signature: _signature, ...body } = intent;
  return body;
}

describe("Phase 2 - admission decisions index writer/reader compatibility", () => {
  it("stage reader admissionDecisionsIndex consumes factory-cli-style artifactPath JSONL", async () => {
    // Simulate factory-cli output: uses canonical `artifactPath` field
    const runDir = "/runs/run-index-compat-1";
    const indexEntry = JSON.stringify({
      runId: "run-index-compat-1",
      timestamp: "2026-04-27T00:00:00.000Z",
      gate: "intent",
      outcome: "allow",
      artifactPath: `${runDir}/intent-admission-decision.json`,
      schemaVersion: "1.0.0",
      precedenceStatus: "no-conflict"
    });
    const fs = new InMemoryFs(new Map([
      [`${runDir}/admission-decisions.jsonl`, `${indexEntry}\n`]
    ]));
    const reader = createAuthorityStageReader(runDir, fs);
    const index = await reader.admissionDecisionsIndex();

    assert.equal(index.length, 1);
    assert.equal(index[0]?.gate, "intent");
    assert.equal(index[0]?.artifactPath, `${runDir}/intent-admission-decision.json`);
  });

  it("stage reader admissionDecisionsIndex rejects entries without artifactPath or path", async () => {
    const runDir = "/runs/run-index-compat-2";
    const badEntry = JSON.stringify({ gate: "intent" }); // missing both artifactPath and path
    const fs = new InMemoryFs(new Map([
      [`${runDir}/admission-decisions.jsonl`, `${badEntry}\n`]
    ]));
    const reader = createAuthorityStageReader(runDir, fs);

    await assert.rejects(
      () => reader.admissionDecisionsIndex()
    );
  });
});
