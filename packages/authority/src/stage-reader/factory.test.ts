import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

import { buildPolicySnapshot, buildSignatureEnvelope, hashPolicySnapshot } from "../signature/index.js";
import { StageReaderError, type FsAdapter } from "./fs-adapter.js";
import { createAuthorityStageReader } from "./factory.js";

import type { AdmissionDecisionBase } from "../admission-decision/index.js";
import type { CapabilityEnvelope, ConfirmedIntent, SignatureEnvelope } from "@protostar/intent";

const runDir = "/runs/run_09";

const resolvedEnvelope = {
  repoScopes: [{ workspace: "protostar", path: "packages/authority", access: "write" }],
  toolPermissions: [{ tool: "pnpm", reason: "test", risk: "low" }],
  workspace: { allowDirty: false },
  network: { allow: "loopback" },
  budget: {
    maxTokens: 500,
    adapterRetriesPerTask: 4,
    taskWallClockMs: 180_000,
    maxRepairLoops: 3
  }
} as const satisfies CapabilityEnvelope;

const policy = Object.freeze({ autonomy: "governed", repairLoops: 1 });

describe("AuthorityStageReader", () => {
  it("reads all per-gate artifacts, policy snapshot, precedence, index, and signed intent", async () => {
    const { intent, policySnapshot, precedenceDecision } = signedIntentArtifacts();
    const files = new Map<string, string>([
      [`${runDir}/intent-admission-decision.json`, JSON.stringify(decision("intent"))],
      [`${runDir}/planning-admission-decision.json`, JSON.stringify(decision("planning"))],
      [`${runDir}/capability-admission-decision.json`, JSON.stringify(decision("capability"))],
      [`${runDir}/repo-scope-admission-decision.json`, JSON.stringify(decision("repo-scope"))],
      [`${runDir}/workspace-trust-admission-decision.json`, JSON.stringify(decision("workspace-trust"))],
      [`${runDir}/precedence-decision.json`, JSON.stringify(precedenceDecision)],
      [`${runDir}/policy-snapshot.json`, JSON.stringify(policySnapshot)],
      [`${runDir}/intent.json`, JSON.stringify(intent)],
      [`${runDir}/admission-decisions.jsonl`, `${JSON.stringify({ gate: "intent", artifactPath: "intent-admission-decision.json" })}\n`]
    ]);
    const reader = createAuthorityStageReader(runDir, new InMemoryFs(files));

    assert.equal((await reader.intentAdmissionDecision()).gate, "intent");
    assert.equal((await reader.planningAdmissionDecision())?.gate, "planning");
    assert.equal((await reader.capabilityAdmissionDecision())?.gate, "capability");
    assert.equal((await reader.repoScopeAdmissionDecision())?.gate, "repo-scope");
    assert.equal((await reader.workspaceTrustAdmissionDecision())?.gate, "workspace-trust");
    assert.equal((await reader.precedenceDecision())?.status, "resolved");
    assert.equal((await reader.policySnapshot())?.schemaVersion, "1.0.0");
    const index = await reader.admissionDecisionsIndex();
    assert.equal(index.length, 1);
    assert.equal(index[0]?.gate, "intent");
    assert.equal(index[0]?.artifactPath, "intent-admission-decision.json");
    assert.equal((await reader.confirmedIntent()).id, intent.id);
  });

  it("reads admission-decisions.jsonl with canonical artifactPath field", async () => {
    const files = new Map<string, string>([
      [`${runDir}/admission-decisions.jsonl`,
        `${JSON.stringify({ gate: "intent", artifactPath: "runs/run_09/intent-admission-decision.json" })}\n` +
        `${JSON.stringify({ gate: "planning", artifactPath: "runs/run_09/planning-admission-decision.json" })}\n`
      ]
    ]);
    const reader = createAuthorityStageReader(runDir, new InMemoryFs(files));
    const index = await reader.admissionDecisionsIndex();

    assert.equal(index.length, 2);
    assert.equal(index[0]?.gate, "intent");
    assert.equal(index[0]?.artifactPath, "runs/run_09/intent-admission-decision.json");
    assert.equal(index[1]?.gate, "planning");
    assert.equal(index[1]?.artifactPath, "runs/run_09/planning-admission-decision.json");
  });

  it("falls back to legacy path field in admission-decisions.jsonl", async () => {
    const files = new Map<string, string>([
      [`${runDir}/admission-decisions.jsonl`,
        `${JSON.stringify({ gate: "intent", path: "runs/run_09/intent-admission-decision.json" })}\n`
      ]
    ]);
    const reader = createAuthorityStageReader(runDir, new InMemoryFs(files));
    const index = await reader.admissionDecisionsIndex();

    assert.equal(index.length, 1);
    assert.equal(index[0]?.gate, "intent");
    assert.equal(index[0]?.artifactPath, "runs/run_09/intent-admission-decision.json");
  });

  it("rejects admission-decisions.jsonl entries with neither artifactPath nor path", async () => {
    const files = new Map<string, string>([
      [`${runDir}/admission-decisions.jsonl`,
        `${JSON.stringify({ gate: "intent" })}\n`
      ]
    ]);
    const reader = createAuthorityStageReader(runDir, new InMemoryFs(files));

    await assert.rejects(
      () => reader.admissionDecisionsIndex(),
      (error) => error instanceof StageReaderError && error.reason.includes("artifactPath must be a string")
    );
  });

  it("falls back to legacy admission-decision.json and missing admission-decisions.jsonl returns []", async () => {
    const reader = createAuthorityStageReader(runDir, new InMemoryFs(new Map([
      [`${runDir}/admission-decision.json`, JSON.stringify(legacyIntentDecision())]
    ])));

    assert.equal((await reader.intentAdmissionDecision()).gate, "intent");
    assert.deepEqual(await reader.admissionDecisionsIndex(), []);
  });

  it("returns null for absent post-Phase-2 per-gate artifacts", async () => {
    const reader = createAuthorityStageReader(runDir, new InMemoryFs(new Map()));

    assert.equal(await reader.planningAdmissionDecision(), null);
    assert.equal(await reader.capabilityAdmissionDecision(), null);
    assert.equal(await reader.repoScopeAdmissionDecision(), null);
    assert.equal(await reader.workspaceTrustAdmissionDecision(), null);
  });

  it("rejects a gate literal mismatch", async () => {
    const reader = createAuthorityStageReader(runDir, new InMemoryFs(new Map([
      [`${runDir}/intent-admission-decision.json`, JSON.stringify(decision("planning"))]
    ])));

    await assert.rejects(
      () => reader.intentAdmissionDecision(),
      (error) => error instanceof StageReaderError && error.reason.includes("gate")
    );
  });

  it("rejects a forward-incompatible schemaVersion", async () => {
    const reader = createAuthorityStageReader(runDir, new InMemoryFs(new Map([
      [`${runDir}/intent-admission-decision.json`, JSON.stringify({ ...decision("intent"), schemaVersion: "2.0.0" })]
    ])));

    await assert.rejects(
      () => reader.intentAdmissionDecision(),
      (error) => error instanceof StageReaderError && error.reason.includes("schemaVersion")
    );
  });

  it("verifies a signed confirmed intent using policy snapshot and precedence resolved envelope", async () => {
    const { intent, policySnapshot, precedenceDecision } = signedIntentArtifacts();
    const reader = createAuthorityStageReader(runDir, new InMemoryFs(new Map([
      [`${runDir}/intent.json`, JSON.stringify(intent)],
      [`${runDir}/policy-snapshot.json`, JSON.stringify(policySnapshot)],
      [`${runDir}/precedence-decision.json`, JSON.stringify(precedenceDecision)]
    ])));

    const result = await reader.verifyConfirmedIntent();

    assert.equal(result.ok, true);
  });

  it("reports tampering when intent.json bytes change after signing", async () => {
    const { intent, policySnapshot } = signedIntentArtifacts();
    const reader = createAuthorityStageReader(runDir, new InMemoryFs(new Map([
      [`${runDir}/intent.json`, JSON.stringify({ ...intent, title: "tampered" })],
      [`${runDir}/policy-snapshot.json`, JSON.stringify(policySnapshot)]
    ])));

    const result = await reader.verifyConfirmedIntent();

    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.mismatch.field, "intentBody");
  });

  it("readParsedConfirmedIntent reads and parses unsigned legacy 1.0.0 fixtures for diagnostics", async () => {
    const reader = createAuthorityStageReader(runDir, new InMemoryFs(new Map([
      [`${runDir}/intent.json`, JSON.stringify({ ...unsignedIntentBody(), schemaVersion: "1.0.0", signature: null })],
      [`${runDir}/policy-snapshot.json`, JSON.stringify(buildPolicySnapshot({ capturedAt: "2026-04-27T00:00:00.000Z", policy, resolvedEnvelope }))]
    ])));

    const parsed = await reader.readParsedConfirmedIntent();
    assert.equal((parsed as { schemaVersion: string }).schemaVersion, "1.4.0");
  });

  it("confirmedIntent() rejects when policy-snapshot.json is missing", async () => {
    const { intent } = signedIntentArtifacts();
    const reader = createAuthorityStageReader(runDir, new InMemoryFs(new Map([
      [`${runDir}/intent.json`, JSON.stringify(intent)]
      // no policy-snapshot.json
    ])));

    await assert.rejects(
      () => reader.confirmedIntent(),
      (error) => error instanceof StageReaderError && error.reason.includes("confirmed intent signature verification failed")
    );
  });

  it("confirmedIntent() rejects when intent signature is tampered", async () => {
    const { intent, policySnapshot } = signedIntentArtifacts();
    const reader = createAuthorityStageReader(runDir, new InMemoryFs(new Map([
      [`${runDir}/intent.json`, JSON.stringify({ ...intent, title: "tampered" })],
      [`${runDir}/policy-snapshot.json`, JSON.stringify(policySnapshot)]
    ])));

    await assert.rejects(
      () => reader.confirmedIntent(),
      (error) => error instanceof StageReaderError && error.reason.includes("confirmed intent signature verification failed")
    );
  });

  it("legacy 1.0.0 with non-null signature is unsupported", async () => {
    const { signature } = signedIntentArtifacts();
    const reader = createAuthorityStageReader(runDir, new InMemoryFs(new Map([
      [`${runDir}/intent.json`, JSON.stringify({ ...unsignedIntentBody(), schemaVersion: "1.0.0", signature })]
    ])));

    await assert.rejects(
      () => reader.confirmedIntent(),
      (error) => error instanceof StageReaderError && error.reason.includes("legacy 1.0.0 with non-null signature is unsupported")
    );
  });
});

class InMemoryFs implements FsAdapter {
  constructor(private readonly files: Map<string, string>) {}

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

function decision(gate: AdmissionDecisionBase["gate"]): AdmissionDecisionBase {
  return {
    schemaVersion: "1.0.0",
    runId: "run_09",
    gate,
    outcome: "allow",
    timestamp: "2026-04-27T00:00:00.000Z",
    precedenceResolution: { status: "no-conflict" },
    evidence: {}
  };
}

function legacyIntentDecision(): Omit<AdmissionDecisionBase, "gate"> {
  const { gate: _gate, ...legacy } = decision("intent");
  return legacy;
}

function unsignedIntentBody(): Omit<ConfirmedIntent, typeof Symbol.toStringTag> {
  return {
    id: "intent_stage_reader",
    title: "Read staged artifacts",
    problem: "Stages need typed durable reads.",
    requester: "qa",
    confirmedAt: "2026-04-27T00:00:00.000Z",
    acceptanceCriteria: [
      { id: "ac_stage_reader", statement: "reader verifies", verification: "test" }
    ],
    capabilityEnvelope: resolvedEnvelope,
    constraints: [],
    stopConditions: [],
    schemaVersion: "1.4.0",
    signature: null
  } as unknown as Omit<ConfirmedIntent, typeof Symbol.toStringTag>;
}

function signedIntentArtifacts(): {
  readonly intent: ConfirmedIntent;
  readonly signature: SignatureEnvelope;
  readonly policySnapshot: ReturnType<typeof buildPolicySnapshot>;
  readonly precedenceDecision: object;
} {
  const intentBody = unsignedIntentBody();
  const { signature: _unsignedSignature, ...signedBody } = intentBody;
  const policySnapshot = buildPolicySnapshot({
    capturedAt: "2026-04-27T00:00:00.000Z",
    policy,
    resolvedEnvelope
  });
  const signature = buildSignatureEnvelope({
    intent: signedBody,
    resolvedEnvelope,
    policySnapshotHash: hashPolicySnapshot(policySnapshot)
  });
  const intent = Object.freeze({ ...intentBody, signature }) as unknown as ConfirmedIntent;
  return {
    intent,
    signature,
    policySnapshot,
    precedenceDecision: {
      schemaVersion: "1.0.0",
      status: "resolved",
      resolvedEnvelope,
      tiers: [],
      blockedBy: []
    }
  };
}
