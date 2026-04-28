import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

import { buildPolicySnapshot, hashPolicySnapshot } from "./policy-snapshot.js";
import { buildSignatureEnvelope, buildSignatureValue } from "./sign.js";
import { verifyConfirmedIntentSignature } from "./verify.js";

import type { CapabilityEnvelope, ConfirmedIntent, SignatureEnvelope } from "@protostar/intent";

const resolvedEnvelope = {
  repoScopes: [{ workspace: "main", path: "src", access: "write" }],
  toolPermissions: [{ tool: "pnpm", reason: "run verification", risk: "low" }],
  workspace: { allowDirty: false },
  budget: { maxTokens: 1000 }
} as const satisfies CapabilityEnvelope;

interface IntentBody {
  readonly id: "intent_signature_test";
  readonly title: string;
  readonly problem: string;
  readonly requester: string;
  readonly confirmedAt: string;
  readonly acceptanceCriteria: readonly [
    { readonly id: "ac_signature"; readonly statement: "signature verifies"; readonly verification: "test" }
  ];
  readonly capabilityEnvelope: CapabilityEnvelope;
  readonly constraints: readonly string[];
  readonly stopConditions: readonly string[];
  readonly schemaVersion: "1.4.0";
}

const intentBody = {
  id: "intent_signature_test",
  title: "Ship signed intent verification",
  problem: "Downstream stages need tamper evidence.",
  requester: "qa",
  confirmedAt: "2026-04-27T00:00:00.000Z",
  acceptanceCriteria: [
    { id: "ac_signature", statement: "signature verifies", verification: "test" }
  ],
  capabilityEnvelope: resolvedEnvelope,
  constraints: ["pure helpers"],
  stopConditions: ["signature mismatch"],
  schemaVersion: "1.4.0" as const
} as const satisfies IntentBody;

const policy = Object.freeze({
  autonomy: "governed",
  repairLoops: 2
});

describe("confirmed intent signatures", () => {
  it("round-trips a signed confirmed intent", () => {
    const { intent, policySnapshot } = buildSignedIntent();

    const result = verifyConfirmedIntentSignature(intent, policySnapshot, resolvedEnvelope);

    assert.equal(result.ok, true);
    if (!result.ok) throw new Error("expected signature to verify");
    assert.equal(result.verified.intent, intent);
    assert.match(result.verified.verifiedAt, /^20/);
  });

  it("reports intentBody when the signed intent body changes", () => {
    const { signature, policySnapshot } = buildSignedIntent();
    const mutated = buildIntent({ title: "Mutated title" }, signature);

    const result = verifyConfirmedIntentSignature(mutated, policySnapshot, resolvedEnvelope);

    assert.equal(result.ok, false);
    if (result.ok) throw new Error("expected signature mismatch");
    assert.equal(result.mismatch.field, "intentBody");
  });

  it("reports resolvedEnvelope when the resolved envelope changes", () => {
    const { intent, policySnapshot } = buildSignedIntent();
    const mutatedEnvelope: CapabilityEnvelope = {
      ...resolvedEnvelope,
      budget: { maxTokens: 999 }
    };

    const result = verifyConfirmedIntentSignature(intent, policySnapshot, mutatedEnvelope);

    assert.equal(result.ok, false);
    if (result.ok) throw new Error("expected signature mismatch");
    assert.equal(result.mismatch.field, "resolvedEnvelope");
  });

  it("reports policySnapshotHash when the policy snapshot changes", () => {
    const { intent } = buildSignedIntent();
    const staleSnapshot = buildPolicySnapshot({
      capturedAt: "2026-04-27T00:00:00.000Z",
      policy: { autonomy: "changed" },
      resolvedEnvelope
    });

    const result = verifyConfirmedIntentSignature(intent, staleSnapshot, resolvedEnvelope);

    assert.equal(result.ok, false);
    if (result.ok) throw new Error("expected signature mismatch");
    assert.equal(result.mismatch.field, "policySnapshotHash");
  });

  it("fail-closes on an unknown canonicalForm tag", () => {
    const { intent } = buildSignedIntent();
    const invalid = replaceSignature(intent, {
      ...intent.signature,
      canonicalForm: "json-c14n@2.0"
    } as unknown as SignatureEnvelope);

    const result = verifyConfirmedIntentSignature(invalid, buildPolicySnapshot({ policy, resolvedEnvelope }), resolvedEnvelope);

    assert.equal(result.ok, false);
    if (result.ok) throw new Error("expected canonical form mismatch");
    assert.equal(result.mismatch.field, "canonicalForm");
    assert.match(result.errors[0] ?? "", /unknown canonicalForm tag/);
  });

  it("rejects wrong signature algorithms", () => {
    const { intent } = buildSignedIntent();
    const invalid = replaceSignature(intent, {
      ...intent.signature,
      algorithm: "sha512"
    } as unknown as SignatureEnvelope);

    const result = verifyConfirmedIntentSignature(invalid, buildPolicySnapshot({ policy, resolvedEnvelope }), resolvedEnvelope);

    assert.equal(result.ok, false);
    if (result.ok) throw new Error("expected algorithm mismatch");
    assert.equal(result.mismatch.field, "algorithm");
  });

  it("buildSignatureValue is deterministic", () => {
    const policySnapshot = buildPolicySnapshot({
      capturedAt: "2026-04-27T00:00:00.000Z",
      policy,
      resolvedEnvelope
    });
    const policySnapshotHash = hashPolicySnapshot(policySnapshot);
    const inputs = { intent: intentBody, resolvedEnvelope, policySnapshotHash };

    assert.equal(buildSignatureValue(inputs), buildSignatureValue(inputs));
    assert.match(buildSignatureValue(inputs), /^[0-9a-f]{64}$/);
  });

  it("buildPolicySnapshot includes repoPolicyHash only when repoPolicy is provided", () => {
    const withRepoPolicy = buildPolicySnapshot({
      capturedAt: "2026-04-27T00:00:00.000Z",
      policy,
      resolvedEnvelope,
      repoPolicy: { schemaVersion: "1.0.0", rules: [{ id: "repo", effect: "allow" }] }
    });
    const withoutRepoPolicy = buildPolicySnapshot({
      capturedAt: "2026-04-27T00:00:00.000Z",
      policy,
      resolvedEnvelope
    });

    assert.match(withRepoPolicy.repoPolicyHash ?? "", /^[0-9a-f]{64}$/);
    assert.equal("repoPolicyHash" in withoutRepoPolicy, false);
  });

  it("hashPolicySnapshot is deterministic over canonical JSON", () => {
    assert.equal(
      hashPolicySnapshot({ b: 2, a: 1 }),
      hashPolicySnapshot({ a: 1, b: 2 })
    );
  });
});

function buildSignedIntent(): {
  readonly intent: ConfirmedIntent;
  readonly signature: SignatureEnvelope;
  readonly policySnapshot: ReturnType<typeof buildPolicySnapshot>;
} {
  const policySnapshot = buildPolicySnapshot({
    capturedAt: "2026-04-27T00:00:00.000Z",
    policy,
    resolvedEnvelope
  });
  const signature = buildSignatureEnvelope({
    intent: intentBody,
    resolvedEnvelope,
    policySnapshotHash: hashPolicySnapshot(policySnapshot)
  });

  return {
    intent: buildIntent({}, signature),
    signature,
    policySnapshot
  };
}

function buildIntent(
  overrides: Partial<IntentBody>,
  signature: SignatureEnvelope
): ConfirmedIntent {
  return Object.freeze({
    ...intentBody,
    ...overrides,
    signature
  }) as unknown as ConfirmedIntent;
}

function replaceSignature(intent: ConfirmedIntent, signature: SignatureEnvelope): ConfirmedIntent {
  return Object.freeze({
    ...intent,
    signature
  }) as unknown as ConfirmedIntent;
}
