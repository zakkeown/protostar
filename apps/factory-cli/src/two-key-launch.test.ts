import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildPolicySnapshot,
  buildSignatureEnvelope,
  hashPolicySnapshot
} from "@protostar/authority";
import { buildConfirmedIntentForTest } from "@protostar/intent/internal/test-builders";
import { promoteAndSignIntent } from "@protostar/intent";
import type { CapabilityEnvelope } from "@protostar/intent";
import type { ConfirmedIntentData } from "@protostar/intent/confirmed-intent";

import { validateTwoKeyLaunch, verifyTrustedLaunchConfirmedIntent } from "./two-key-launch.js";

// ---------------------------------------------------------------------------
// Shared test helpers
// ---------------------------------------------------------------------------

const TEST_CONFIRMED_AT = "2026-01-01T00:00:00.000Z";
const TEST_CAPTURED_AT = "2026-01-01T00:00:00.000Z";

const testEnvelope: CapabilityEnvelope = Object.freeze({
  repoScopes: [
    {
      workspace: "protostar",
      path: "apps/factory-cli",
      access: "write" as const
    }
  ],
  toolPermissions: [
    {
      tool: "node:test",
      permissionLevel: "use" as const,
      reason: "Run tests.",
      risk: "low" as const
    }
  ],
  workspace: { allowDirty: false },
  network: { allow: "loopback" as const },
  budget: {
    maxUsd: 0,
    timeoutMs: 60000,
    adapterRetriesPerTask: 4,
    taskWallClockMs: 180_000,
    maxRepairLoops: 1
  }
});

function buildTestUnsignedIntent() {
  return buildConfirmedIntentForTest({
    id: "intent_two_key_launch_test",
    sourceDraftId: "draft_two_key_launch_test",
    title: "Two-key launch test intent",
    problem: "Test verified two-key launch.",
    requester: "test-operator",
    acceptanceCriteria: [
      {
        id: "ac_two_key_1",
        statement: "The two-key launch verifier rejects invalid second keys.",
        verification: "test" as const
      }
    ],
    capabilityEnvelope: testEnvelope,
    constraints: ["test only"],
    stopConditions: ["test only"],
    confirmedAt: TEST_CONFIRMED_AT
  });
}

function buildTestPolicySnapshot(resolvedEnvelope: CapabilityEnvelope) {
  return buildPolicySnapshot({
    capturedAt: TEST_CAPTURED_AT,
    policy: { allowDarkRun: true, maxAutonomousRisk: "medium", requiredHumanCheckpoints: [] },
    resolvedEnvelope
  });
}

function stripSignature<T extends { readonly signature: unknown }>(intent: T): Omit<T, "signature"> {
  const { signature: _signature, ...body } = intent;
  return body;
}

async function buildValidSignedIntentFile(overrides?: {
  modifyRaw?: (raw: unknown) => unknown;
}): Promise<{ fileContent: string; intent: ConfirmedIntentData; resolvedEnvelope: CapabilityEnvelope; policySnapshot: ReturnType<typeof buildTestPolicySnapshot> }> {
  const unsignedIntent = buildTestUnsignedIntent();
  const resolvedEnvelope = testEnvelope;
  const policySnapshot = buildTestPolicySnapshot(resolvedEnvelope);
  const policySnapshotHash = hashPolicySnapshot(policySnapshot);
  const signature = buildSignatureEnvelope({
    intent: stripSignature(unsignedIntent),
    resolvedEnvelope,
    policySnapshotHash
  });
  const signed = promoteAndSignIntent({
    ...stripSignature(unsignedIntent),
    signature
  });
  if (!signed.ok) {
    throw new Error(`Failed to build test signed intent: ${signed.errors.join("; ")}`);
  }
  const raw = overrides?.modifyRaw ? overrides.modifyRaw(signed.intent) : signed.intent;
  return {
    fileContent: JSON.stringify(raw, null, 2),
    intent: signed.intent,
    resolvedEnvelope,
    policySnapshot
  };
}

// ---------------------------------------------------------------------------
// Existing CLI-preflight tests (preserved)
// ---------------------------------------------------------------------------

describe("two-key launch validator", () => {
  it("allows untrusted launch without a confirmed intent", () => {
    assert.deepEqual(validateTwoKeyLaunch({ trust: "untrusted" }), { ok: true });
  });

  it("allows untrusted launch with a confirmed intent", () => {
    assert.deepEqual(validateTwoKeyLaunch({ trust: "untrusted", confirmedIntent: "intent.json" }), { ok: true });
  });

  it("refuses trusted launch without a confirmed intent", () => {
    const result = validateTwoKeyLaunch({ trust: "trusted" });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.refusal.missingFlag, "--confirmed-intent");
    }
  });

  it("allows trusted launch with a confirmed intent", () => {
    assert.deepEqual(validateTwoKeyLaunch({ trust: "trusted", confirmedIntent: "intent.json" }), { ok: true });
  });

  it("explains two-key launch in the refusal reason", () => {
    const result = validateTwoKeyLaunch({ trust: "trusted" });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(result.refusal.reason, /two-key launch/);
    }
  });
});

// ---------------------------------------------------------------------------
// New: verifyTrustedLaunchConfirmedIntent tests (RED — must fail before Task 1 GREEN)
// ---------------------------------------------------------------------------

describe("verifyTrustedLaunchConfirmedIntent", () => {
  it("rejects when readFile throws (missing-file)", async () => {
    const unsignedIntent = buildTestUnsignedIntent();
    const resolvedEnvelope = testEnvelope;
    const policySnapshot = buildTestPolicySnapshot(resolvedEnvelope);

    const result = await verifyTrustedLaunchConfirmedIntent({
      confirmedIntentPath: "/nonexistent/intent.json",
      expectedIntent: unsignedIntent,
      policySnapshot,
      resolvedEnvelope,
      readFile: async () => {
        throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      }
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "missing-file");
    }
  });

  it("rejects malformed JSON (malformed-json)", async () => {
    const unsignedIntent = buildTestUnsignedIntent();
    const resolvedEnvelope = testEnvelope;
    const policySnapshot = buildTestPolicySnapshot(resolvedEnvelope);

    const result = await verifyTrustedLaunchConfirmedIntent({
      confirmedIntentPath: "/intent.json",
      expectedIntent: unsignedIntent,
      policySnapshot,
      resolvedEnvelope,
      readFile: async () => "not valid json {"
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "malformed-json");
    }
  });

  it("rejects a file that does not parse as a ConfirmedIntent (invalid-confirmed-intent)", async () => {
    const unsignedIntent = buildTestUnsignedIntent();
    const resolvedEnvelope = testEnvelope;
    const policySnapshot = buildTestPolicySnapshot(resolvedEnvelope);

    const result = await verifyTrustedLaunchConfirmedIntent({
      confirmedIntentPath: "/intent.json",
      expectedIntent: unsignedIntent,
      policySnapshot,
      resolvedEnvelope,
      readFile: async () => JSON.stringify({ fixture: "operator-confirmed-intent" })
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "invalid-confirmed-intent");
    }
  });

  it("rejects a valid ConfirmedIntent that has no signature (unsigned-confirmed-intent)", async () => {
    const unsignedIntent = buildTestUnsignedIntent();
    const resolvedEnvelope = testEnvelope;
    const policySnapshot = buildTestPolicySnapshot(resolvedEnvelope);

    // Build an intent without a signature field or with null signature
    const unsignedData = { ...unsignedIntent, signature: null };
    const result = await verifyTrustedLaunchConfirmedIntent({
      confirmedIntentPath: "/intent.json",
      expectedIntent: unsignedIntent,
      policySnapshot,
      resolvedEnvelope,
      readFile: async () => JSON.stringify(unsignedData)
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "unsigned-confirmed-intent");
    }
  });

  it("rejects a signed intent whose signature does not verify (signature-mismatch)", async () => {
    const unsignedIntent = buildTestUnsignedIntent();
    const resolvedEnvelope = testEnvelope;
    const policySnapshot = buildTestPolicySnapshot(resolvedEnvelope);

    const { fileContent } = await buildValidSignedIntentFile({
      modifyRaw: (raw) => {
        const obj = raw as Record<string, unknown>;
        // Tamper the title to break the signature
        return { ...obj, title: "tampered title" };
      }
    });

    const result = await verifyTrustedLaunchConfirmedIntent({
      confirmedIntentPath: "/intent.json",
      expectedIntent: unsignedIntent,
      policySnapshot,
      resolvedEnvelope,
      readFile: async () => fileContent
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "signature-mismatch");
    }
  });

  it("rejects when intent body does not match expected intent (intent-body-mismatch)", async () => {
    // Build a correctly signed intent but with different body from what the current run expects
    const resolvedEnvelope = testEnvelope;
    const policySnapshot = buildTestPolicySnapshot(resolvedEnvelope);

    const differentIntent = buildConfirmedIntentForTest({
      id: "intent_different_id",
      title: "Different intent title",
      problem: "Different problem",
      requester: "test-operator",
      acceptanceCriteria: [
        {
          id: "ac_different_1",
          statement: "Different criterion.",
          verification: "test" as const
        }
      ],
      capabilityEnvelope: testEnvelope,
      confirmedAt: TEST_CONFIRMED_AT
    });
    const policySnapshotHash = hashPolicySnapshot(policySnapshot);
    const signature = buildSignatureEnvelope({
      intent: stripSignature(differentIntent),
      resolvedEnvelope,
      policySnapshotHash
    });
    const signedDifferent = promoteAndSignIntent({
      ...stripSignature(differentIntent),
      signature
    });
    if (!signedDifferent.ok) {
      throw new Error("Failed to sign different intent");
    }

    // Expected intent is the ORIGINAL, but file contains the DIFFERENT intent
    const expectedIntent = buildTestUnsignedIntent();
    const result = await verifyTrustedLaunchConfirmedIntent({
      confirmedIntentPath: "/intent.json",
      expectedIntent,
      policySnapshot,
      resolvedEnvelope,
      readFile: async () => JSON.stringify(signedDifferent.intent, null, 2)
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "intent-body-mismatch");
    }
  });

  it("accepts a valid matching signed ConfirmedIntent (success case)", async () => {
    const { fileContent, intent: expectedIntentData, resolvedEnvelope, policySnapshot } =
      await buildValidSignedIntentFile();

    const result = await verifyTrustedLaunchConfirmedIntent({
      confirmedIntentPath: "/intent.json",
      expectedIntent: expectedIntentData,
      policySnapshot,
      resolvedEnvelope,
      readFile: async () => fileContent
    });

    assert.equal(result.ok, true, result.ok ? undefined : `Expected ok but got reason=${result.reason}`);
  });
});
