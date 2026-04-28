import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import {
  buildPolicySnapshot,
  buildSignatureEnvelope,
  hashPolicySnapshot,
  verifyConfirmedIntentSignature
} from "@protostar/authority";
import { promoteAndSignIntent } from "@protostar/intent";
import { buildConfirmedIntentForTest } from "@protostar/intent/internal/test-builders";

describe("signed ConfirmedIntent 1.5.0 envelope", () => {
  it("signs and verifies budget and network envelope fields", () => {
    const unsignedIntent = buildConfirmedIntentForTest({
      id: "intent_signed_1_3_0",
      sourceDraftId: "draft_signed_1_3_0",
      title: "Signed 1.5.0 envelope",
      problem: "The signed intent must carry execution budget and network authority fields.",
      requester: "phase-04-plan-07",
      acceptanceCriteria: [
        {
          id: "ac_signed_1_3_0",
          statement: "The signed 1.5.0 intent verifies after canonicalization.",
          verification: "test"
        }
      ],
      capabilityEnvelope: {
        repoScopes: [
          {
            workspace: "protostar",
            path: "packages/admission-e2e",
            access: "read"
          }
        ],
        workspace: {
          allowDirty: false
        },
        toolPermissions: [
          {
            tool: "node:test",
            permissionLevel: "use",
            reason: "Verify signed 1.5.0 intent behavior.",
            risk: "low"
          }
        ],
        network: {
          allow: "allowlist",
          allowedHosts: ["api.github.com"]
        },
        budget: {
          adapterRetriesPerTask: 4,
          taskWallClockMs: 180_000,
          deliveryWallClockMs: 600_000,
          maxRepairLoops: 3
        },
        delivery: {
          target: {
            owner: "protostar-test",
            repo: "fixture-toy",
            baseBranch: "main"
          }
        }
      },
      constraints: ["No compatibility shim for 1.2.0."],
      stopConditions: ["Stop if envelope hashes do not match."],
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

    assert.equal(signed.ok, true, signed.ok ? "" : signed.errors.join("; "));
    if (!signed.ok) {
      return;
    }

    const verified = verifyConfirmedIntentSignature(
      signed.intent,
      snapshot,
      signed.intent.capabilityEnvelope
    );

    assert.equal(verified.ok, true, verified.ok ? "" : verified.errors.join("; "));
    assert.equal(signed.intent.schemaVersion, "1.5.0");
    assert.equal(signed.intent.capabilityEnvelope.budget.adapterRetriesPerTask, 4);
    assert.equal(signed.intent.capabilityEnvelope.budget.taskWallClockMs, 180_000);
    assert.equal(signed.intent.capabilityEnvelope.budget.deliveryWallClockMs, 600_000);
    assert.equal(signed.intent.capabilityEnvelope.budget.maxRepairLoops, 3);
    assert.equal(signed.intent.capabilityEnvelope.delivery?.target.owner, "protostar-test");
    assert.deepEqual(signed.intent.capabilityEnvelope.network, {
      allow: "allowlist",
      allowedHosts: ["api.github.com"]
    });
  });
});

function stripSignature<T extends { readonly signature: unknown }>(intent: T): Omit<T, "signature"> {
  const { signature: _signature, ...body } = intent;
  return body;
}
