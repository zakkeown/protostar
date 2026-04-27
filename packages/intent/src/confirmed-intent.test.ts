import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { parseConfirmedIntent, type ConfirmedIntentMintInput } from "./confirmed-intent.js";
import { buildConfirmedIntentForTest } from "./internal/test-builders.js";

const VALID_HASH = "0".repeat(64);
const LEGACY_CONFIRMED_INTENT_SCHEMA_VERSION = ["1", "0", "0"].join(".");

describe("parseConfirmedIntent schemaVersion 1.2.0 signature envelope", () => {
  it("accepts unsigned 1.2.0 confirmed intents", () => {
    const result = parseConfirmedIntent(buildConfirmedIntentFixture({ signature: null }));

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.data.schemaVersion, "1.2.0");
      assert.equal(result.data.signature, null);
    }
  });

  it("accepts signed 1.2.0 confirmed intents with json-c14n@1.0 canonical form", () => {
    const result = parseConfirmedIntent(
      buildConfirmedIntentFixture({
        signature: {
          algorithm: "sha256",
          canonicalForm: "json-c14n@1.0",
          value: VALID_HASH,
          intentHash: VALID_HASH,
          envelopeHash: VALID_HASH,
          policySnapshotHash: VALID_HASH
        }
      })
    );

    assert.equal(result.ok, true);
  });

  it("rejects legacy 1.0.0 confirmed intents at the parser boundary", () => {
    const result = parseConfirmedIntent(
      buildConfirmedIntentFixture({
        schemaVersion: LEGACY_CONFIRMED_INTENT_SCHEMA_VERSION,
        signature: null
      })
    );

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.errors.includes('schemaVersion must be "1.2.0" when provided.'), true);
    }
  });

  it("rejects unknown canonicalForm tags", () => {
    const result = parseConfirmedIntent(
      buildConfirmedIntentFixture({
        signature: {
          algorithm: "sha256",
          canonicalForm: "json-c14n@2.0",
          value: VALID_HASH,
          intentHash: VALID_HASH,
          envelopeHash: VALID_HASH,
          policySnapshotHash: VALID_HASH
        }
      })
    );

    assert.equal(result.ok, false);
  });

  it("rejects non-SHA-256 digest values", () => {
    const result = parseConfirmedIntent(
      buildConfirmedIntentFixture({
        signature: {
          algorithm: "sha256",
          canonicalForm: "json-c14n@1.0",
          value: "abc",
          intentHash: VALID_HASH,
          envelopeHash: VALID_HASH,
          policySnapshotHash: VALID_HASH
        }
      })
    );

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(
        result.errors.includes("signature.value must be a 64-character lowercase hex SHA-256 digest."),
        true
      );
    }
  });
});

describe("parseConfirmedIntent capabilityEnvelope.workspace.allowDirty", () => {
  it("round-trips allowDirty true through mint and parse", () => {
    const intent = buildConfirmedIntentForTest({
      ...buildConfirmedIntentMintInput(),
      capabilityEnvelope: {
        ...buildCapabilityEnvelopeForMint(),
        workspace: {
          allowDirty: true
        }
      }
    });

    const result = parseConfirmedIntent(intent);

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.deepEqual(result.data.capabilityEnvelope.workspace, { allowDirty: true });
    }
  });

  it("default-fills allowDirty false when workspace is absent", () => {
    const result = parseConfirmedIntent(buildConfirmedIntentFixture());

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.deepEqual(result.data.capabilityEnvelope.workspace, { allowDirty: false });
    }
  });

  it("rejects non-boolean allowDirty values", () => {
    const result = parseConfirmedIntent(
      buildConfirmedIntentFixture({
        capabilityEnvelope: {
          ...buildCapabilityEnvelopeFixture(),
          workspace: {
            allowDirty: "yes"
          }
        }
      })
    );

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(
        result.errors.includes("capabilityEnvelope.workspace.allowDirty must be a boolean."),
        true
      );
    }
  });

  it("rejects unknown workspace keys", () => {
    const result = parseConfirmedIntent(
      buildConfirmedIntentFixture({
        capabilityEnvelope: {
          ...buildCapabilityEnvelopeFixture(),
          workspace: {
            allowDirty: false,
            extraKey: 1
          }
        }
      })
    );

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.errors.includes("capabilityEnvelope.workspace.extraKey is not allowed."), true);
    }
  });
});

describe("confirmed-intent.schema.json signature envelope", () => {
  it("hard-bumps confirmed-intent schemaVersion and requires canonical sub-hashes", async () => {
    const schemaPath = fileURLToPath(new URL("../schema/confirmed-intent.schema.json", import.meta.url));
    const schema = JSON.parse(await readFile(schemaPath, "utf8")) as Record<string, unknown>;
    const properties = schema["properties"] as Record<string, Record<string, unknown>>;
    const defs = schema["$defs"] as Record<string, Record<string, unknown>>;
    const signatureEnvelope = defs["SignatureEnvelope"]!;

    assert.equal(properties["schemaVersion"]?.["const"], "1.2.0");
    assert.deepEqual(signatureEnvelope["required"], [
      "algorithm",
      "canonicalForm",
      "value",
      "intentHash",
      "envelopeHash",
      "policySnapshotHash"
    ]);

    const signatureProperties = signatureEnvelope["properties"] as Record<string, Record<string, unknown>>;
    assert.equal(signatureProperties["algorithm"]?.["const"], "sha256");
    assert.deepEqual(signatureProperties["canonicalForm"]?.["enum"], ["json-c14n@1.0"]);
  });
});

function buildConfirmedIntentFixture(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: "1.2.0",
    id: "intent_signature_envelope",
    sourceDraftId: "draft_signature_envelope",
    mode: "brownfield",
    goalArchetype: "cosmetic-tweak",
    title: "Extend signature envelope",
    problem: "Confirmed intent signatures need a canonical form discriminator.",
    requester: "phase-2-plan-03",
    confirmedAt: "2026-04-27T00:00:00.000Z",
    context: "Phase 3 Plan 03 hard-bumps confirmed-intent artifacts to schemaVersion 1.2.0.",
    acceptanceCriteria: [
      {
        id: "ac_signature_envelope",
        statement: "The signature envelope records the canonical form tag used to compute SHA-256 digests.",
        verification: "test"
      }
    ],
    capabilityEnvelope: buildCapabilityEnvelopeFixture(),
    constraints: ["Scope limited to the confirmed-intent signature envelope."],
    stopConditions: ["Stop if the parser accepts legacy schemaVersion 1.0.0."],
    signature: null,
    ...overrides
  };
}

function buildCapabilityEnvelopeFixture(): Record<string, unknown> {
  return {
    repoScopes: [
      {
        workspace: "protostar",
        path: "packages/intent",
        access: "write"
      }
    ],
    toolPermissions: [
      {
        tool: "node:test",
        permissionLevel: "use",
        reason: "Verify confirmed-intent parser behavior.",
        risk: "low"
      }
    ],
    budget: {
      timeoutMs: 300_000,
      maxRepairLoops: 1
    }
  };
}

function buildConfirmedIntentMintInput(): ConfirmedIntentMintInput {
  return {
    id: "intent_signature_envelope",
    sourceDraftId: "draft_signature_envelope",
    mode: "brownfield",
    goalArchetype: "cosmetic-tweak",
    title: "Extend signature envelope",
    problem: "Confirmed intent signatures need a canonical form discriminator.",
    requester: "phase-2-plan-03",
    confirmedAt: "2026-04-27T00:00:00.000Z",
    context: "Phase 3 Plan 03 hard-bumps confirmed-intent artifacts to schemaVersion 1.2.0.",
    acceptanceCriteria: [
      {
        id: "ac_signature_envelope",
        statement: "The signature envelope records the canonical form tag used to compute SHA-256 digests.",
        verification: "test"
      }
    ],
    capabilityEnvelope: buildCapabilityEnvelopeForMint(),
    constraints: ["Scope limited to the confirmed-intent signature envelope."],
    stopConditions: ["Stop if the parser accepts legacy schemaVersion 1.0.0."],
    signature: null
  };
}

function buildCapabilityEnvelopeForMint(): ConfirmedIntentMintInput["capabilityEnvelope"] {
  return {
    repoScopes: [
      {
        workspace: "protostar",
        path: "packages/intent",
        access: "write"
      }
    ],
    toolPermissions: [
      {
        tool: "node:test",
        permissionLevel: "use",
        reason: "Verify confirmed-intent parser behavior.",
        risk: "low"
      }
    ],
    budget: {
      timeoutMs: 300_000,
      maxRepairLoops: 1
    }
  };
}
