import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, it } from "node:test";

import type { PrecedenceDecision } from "@protostar/authority";
import type { CapabilityEnvelope } from "@protostar/intent";
import type { ResolvedFactoryConfig } from "@protostar/lmstudio-adapter";

import { coderAdapterReadyAdmission } from "./coder-adapter-admission.js";

describe("coderAdapterReadyAdmission", () => {
  it("allows when LM Studio preflight reports the configured model", async () => {
    const dirs = await runDirs();
    const result = await coderAdapterReadyAdmission(input({
      ...dirs,
      model: "coder-model",
      fetchImpl: modelsFetch(["coder-model"])
    }));

    assert.equal(result.ok, true);
    const decision = await readJson(resolve(dirs.runDir, "coder-adapter-ready-admission-decision.json"));
    assert.equal(decision["gate"], "coder-adapter-ready");
    assert.equal(decision["outcome"], "allow");
    assert.deepEqual((decision["evidence"] as Record<string, unknown>)["availableModels"], ["coder-model"]);
  });

  it("blocks unreachable LM Studio and appends the refusal index", async () => {
    const dirs = await runDirs();
    const result = await coderAdapterReadyAdmission(input({
      ...dirs,
      model: "coder-model",
      fetchImpl: (() => Promise.reject(new TypeError("connect refused"))) as typeof fetch
    }));

    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.exitCode, 1);
    const decision = await readJson(resolve(dirs.runDir, "coder-adapter-ready-admission-decision.json"));
    assert.equal(decision["outcome"], "block");
    assert.equal((decision["evidence"] as Record<string, unknown>)["reason"], "lmstudio-unreachable");
    const refusals = await readFile(resolve(dirs.outDir, "..", "refusals.jsonl"), "utf8");
    assert.match(refusals, /coder-adapter-ready/);
  });

  it("blocks when the configured model is not loaded", async () => {
    const dirs = await runDirs();
    const result = await coderAdapterReadyAdmission(input({
      ...dirs,
      model: "coder-model",
      fetchImpl: modelsFetch(["other"])
    }));

    assert.equal(result.ok, false);
    const decision = await readJson(resolve(dirs.runDir, "coder-adapter-ready-admission-decision.json"));
    assert.deepEqual((decision["evidence"] as Record<string, unknown>)["availableModels"], ["other"]);
  });

  it("blocks empty model lists as model-not-loaded evidence", async () => {
    const dirs = await runDirs();
    const result = await coderAdapterReadyAdmission(input({
      ...dirs,
      model: "coder-model",
      fetchImpl: modelsFetch([])
    }));

    assert.equal(result.ok, false);
    const decision = await readJson(resolve(dirs.runDir, "coder-adapter-ready-admission-decision.json"));
    assert.deepEqual((decision["evidence"] as Record<string, unknown>)["availableModels"], []);
  });

  it("blocks before preflight when network.allow is none", async () => {
    const dirs = await runDirs();
    const result = await coderAdapterReadyAdmission(input({
      ...dirs,
      model: "coder-model",
      envelope: { ...envelope(), network: { allow: "none" } }
    }));

    assert.equal(result.ok, false);
    const decision = await readJson(resolve(dirs.runDir, "coder-adapter-ready-admission-decision.json"));
    assert.equal((decision["evidence"] as Record<string, unknown>)["reason"], "network-mint-refused");
  });

  it("blocks cloud hosts under loopback network authority before preflight", async () => {
    const dirs = await runDirs();
    const result = await coderAdapterReadyAdmission(input({
      ...dirs,
      baseUrl: "https://example.com/v1",
      model: "coder-model"
    }));

    assert.equal(result.ok, false);
    const decision = await readJson(resolve(dirs.runDir, "coder-adapter-ready-admission-decision.json"));
    assert.equal((decision["evidence"] as Record<string, unknown>)["reason"], "network-mint-refused");
  });
});

async function runDirs(): Promise<{ readonly outDir: string; readonly runDir: string }> {
  const root = await mkdtemp(join(tmpdir(), "coder-admission-"));
  const outDir = resolve(root, "runs");
  return { outDir, runDir: resolve(outDir, "run_test") };
}

function input(opts: {
  readonly outDir: string;
  readonly runDir: string;
  readonly baseUrl?: string;
  readonly model: string;
  readonly envelope?: CapabilityEnvelope;
  readonly fetchImpl?: typeof fetch;
}) {
  return {
    runId: "run_test",
    runDir: opts.runDir,
    outDir: opts.outDir,
    resolvedEnvelope: opts.envelope ?? envelope(),
    factoryConfig: factoryConfig(opts.baseUrl ?? "http://localhost:1234/v1", opts.model),
    precedenceDecision: precedenceDecision(opts.envelope ?? envelope()),
    signal: new AbortController().signal,
    ...(opts.fetchImpl !== undefined ? { fetchImpl: opts.fetchImpl } : {})
  };
}

function modelsFetch(models: readonly string[]): typeof fetch {
  return (async () => new Response(JSON.stringify({
    object: "list",
    data: models.map((id) => ({ id, object: "model" }))
  }), {
    status: 200,
    headers: { "content-type": "application/json" }
  })) as typeof fetch;
}

function factoryConfig(baseUrl: string, model: string): ResolvedFactoryConfig {
  return {
    config: {
      adapters: {
        coder: { provider: "lmstudio", baseUrl, model, apiKeyEnv: "LMSTUDIO_API_KEY" }
      },
      factory: {
        headlessMode: "local-daemon",
        nonInteractive: false,
        stress: {
          caps: {
            tttDelivery: { maxAttempts: 50, maxWallClockDays: 14 },
            sustainedLoad: { maxRuns: 500, maxWallClockDays: 7 },
            concurrency: { maxSessions: 20, maxWallClockDays: 3 },
            faultInjection: { maxFaults: 100, maxWallClockDays: 3 }
          }
        }
      }
    },
    configHash: "hash",
    resolvedFromFile: false,
    envOverridesApplied: []
  };
}

function envelope(): CapabilityEnvelope {
  return {
    repoScopes: [],
    workspace: { allowDirty: false },
    network: { allow: "loopback" },
    budget: { adapterRetriesPerTask: 4, taskWallClockMs: 180_000, maxRepairLoops: 0 },
    toolPermissions: [{
      tool: "network",
      permissionLevel: "use",
      reason: "LM Studio loopback preflight",
      risk: "low"
    }]
  };
}

function precedenceDecision(resolvedEnvelope: CapabilityEnvelope): PrecedenceDecision {
  return {
    schemaVersion: "1.0.0",
    status: "no-conflict",
    resolvedEnvelope,
    tiers: [],
    blockedBy: []
  } as unknown as PrecedenceDecision;
}

async function readJson(path: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
}
