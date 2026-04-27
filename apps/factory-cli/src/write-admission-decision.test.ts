import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, it } from "node:test";

import { hashPolicySnapshot, verifySignedAdmissionDecision, type AdmissionDecisionBase, type PrecedenceDecision } from "@protostar/authority";

import { writeAdmissionDecision, writePolicySnapshot, writePrecedenceDecision } from "./write-admission-decision.js";

describe("per-gate admission decision writer", () => {
  it("writes the gate detail file and appends admission-decisions.jsonl", async () => {
    await withTempDir(async (tempDir) => {
      const runDir = resolve(tempDir, "out", "run_writer");
      const decision = buildDecision("intent");

      const result = await writeAdmissionDecision({ runDir, gate: "intent", decision });

      assert.equal(result.artifactPath, resolve(runDir, "intent-admission-decision.json"));
      assert.deepEqual(await readJson(result.artifactPath), decision);

      const lines = (await readFile(resolve(runDir, "admission-decisions.jsonl"), "utf8")).trimEnd().split("\n");
      assert.equal(lines.length, 1);
      assert.deepEqual(JSON.parse(lines[0] ?? "{}"), {
        runId: "run_writer",
        timestamp: "2026-04-27T00:00:00.000Z",
        gate: "intent",
        outcome: "allow",
        artifactPath: result.artifactPath,
        schemaVersion: "1.0.0",
        precedenceStatus: "no-conflict"
      });
    });
  });

  it("persists a signed wrapper when requested", async () => {
    await withTempDir(async (tempDir) => {
      const runDir = resolve(tempDir, "out", "run_signed");
      const decision = buildDecision("planning");

      const result = await writeAdmissionDecision({ runDir, gate: "planning", decision, signed: true });
      const payload = await readJson(result.artifactPath);
      const verified = verifySignedAdmissionDecision(payload);

      assert.equal(verified.ok, true, verified.ok ? undefined : verified.errors.join("; "));
      assert.equal(payload.gate, "planning");
    });
  });

  it("writes precedence-decision.json only for conflicts", async () => {
    await withTempDir(async (tempDir) => {
      const runDir = resolve(tempDir, "out", "run_precedence");

      assert.equal(await writePrecedenceDecision({ runDir, decision: buildPrecedence("no-conflict") }), null);

      const result = await writePrecedenceDecision({ runDir, decision: buildPrecedence("blocked-by-tier") });

      assert.equal(result?.artifactPath, resolve(runDir, "precedence-decision.json"));
      assert.equal((await readJson(result?.artifactPath ?? "")).status, "blocked-by-tier");
    });
  });

  it("writes policy-snapshot.json and returns the canonical hash", async () => {
    await withTempDir(async (tempDir) => {
      const runDir = resolve(tempDir, "out", "run_policy_snapshot");
      const snapshot = {
        schemaVersion: "1.0.0",
        capturedAt: "2026-04-27T00:00:00.000Z",
        policy: { source: "test" },
        resolvedEnvelope: { repoScopes: [], toolPermissions: [], budget: {} }
      } as const;

      const result = await writePolicySnapshot({ runDir, snapshot });

      assert.equal(result.artifactPath, resolve(runDir, "policy-snapshot.json"));
      assert.equal(result.hash, hashPolicySnapshot(snapshot));
      assert.deepEqual(await readJson(result.artifactPath), snapshot);
    });
  });
});

function buildDecision(gate: AdmissionDecisionBase["gate"]): AdmissionDecisionBase<{ readonly fixture: true }> {
  return {
    schemaVersion: "1.0.0",
    runId: "run_writer",
    gate,
    outcome: "allow",
    timestamp: "2026-04-27T00:00:00.000Z",
    precedenceResolution: { status: "no-conflict" },
    evidence: { fixture: true }
  };
}

function buildPrecedence(status: PrecedenceDecision["status"]): PrecedenceDecision {
  return {
    schemaVersion: "1.0.0",
    status,
    resolvedEnvelope: { repoScopes: [], toolPermissions: [], budget: {} },
    tiers: [],
    blockedBy: []
  } as unknown as PrecedenceDecision;
}

async function readJson(path: string): Promise<any> {
  return JSON.parse(await readFile(path, "utf8"));
}

async function withTempDir(callback: (tempDir: string) => Promise<void>): Promise<void> {
  const tempDir = await mkdtemp(resolve(tmpdir(), "protostar-admission-writer-"));
  try {
    await callback(tempDir);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}
