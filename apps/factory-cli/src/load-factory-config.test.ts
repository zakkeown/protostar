import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";

import { computeLineageId, ONTOLOGY_CONVERGENCE_THRESHOLD } from "@protostar/evaluation";
import type { ConfirmedIntent } from "@protostar/intent";

import {
  loadFactoryConfig,
  resolveCodeEvolutionMode,
  resolveConsensusJudgeModel,
  resolveConvergenceThreshold,
  resolveDeliveryMode,
  resolveHeadlessMode,
  resolveLlmBackend,
  resolveNonInteractive,
  resolveGeneration,
  resolveLineageId,
  resolveSemanticJudgeModel
} from "./load-factory-config.js";

const OLD_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...OLD_ENV };
});

describe("loadFactoryConfig", () => {
  it("uses resolver defaults when .protostar/factory-config.json is absent", async () => {
    process.env = {};
    const root = await mkdtemp(join(tmpdir(), "factory-config-"));

    const resolved = await loadFactoryConfig(root);

    assert.equal(resolved.resolvedFromFile, false);
    assert.equal(resolved.config.adapters.coder.baseUrl, "http://localhost:1234/v1");
    assert.equal(resolved.config.adapters.coder.model, "qwen3-coder-next-mlx-4bit");
    assert.equal(resolved.config.factory.headlessMode, "local-daemon");
    assert.equal(resolved.config.factory.llmBackend, "lmstudio");
    assert.equal(resolved.config.factory.nonInteractive, false);
  });

  it("resolves delivery mode with CLI over config over default precedence", () => {
    assert.equal(resolveDeliveryMode({ delivery: { mode: "auto" } }, "gated"), "gated");
    assert.equal(resolveDeliveryMode({ delivery: { mode: "gated" } }, "auto"), "auto");
    assert.equal(resolveDeliveryMode({ delivery: { mode: "gated" } }, undefined), "gated");
    assert.equal(resolveDeliveryMode({}, undefined), "auto");
  });

  it("resolves headless mode with CLI over config over local-daemon default precedence", () => {
    assert.equal(resolveHeadlessMode({ factory: { headlessMode: "self-hosted-runner" } }, "github-hosted"), "github-hosted");
    assert.equal(resolveHeadlessMode({ factory: { headlessMode: "github-hosted" } }, "local-daemon"), "local-daemon");
    assert.equal(resolveHeadlessMode({ factory: { headlessMode: "self-hosted-runner" } }, undefined), "self-hosted-runner");
    assert.equal(resolveHeadlessMode({}, undefined), "local-daemon");
  });

  it("resolves LLM backend with CLI over config over LM Studio default precedence", () => {
    assert.equal(resolveLlmBackend({ factory: { llmBackend: "hosted-openai-compatible" } }, "mock"), "mock");
    assert.equal(resolveLlmBackend({ factory: { llmBackend: "mock" } }, "lmstudio"), "lmstudio");
    assert.equal(
      resolveLlmBackend({ factory: { llmBackend: "hosted-openai-compatible" } }, undefined),
      "hosted-openai-compatible"
    );
    assert.equal(resolveLlmBackend({}, undefined), "lmstudio");
  });

  it("resolves non-interactive with CLI over config over false default precedence", () => {
    assert.equal(resolveNonInteractive({ factory: { nonInteractive: false } }, true), true);
    assert.equal(resolveNonInteractive({ factory: { nonInteractive: true } }, false), false);
    assert.equal(resolveNonInteractive({ factory: { nonInteractive: true } }, undefined), true);
    assert.equal(resolveNonInteractive({}, undefined), false);
  });

  it("surfaces valid file values", async () => {
    process.env = {};
    const root = await mkdtemp(join(tmpdir(), "factory-config-"));
    await mkdir(join(root, ".protostar"));
    await writeFile(join(root, ".protostar", "factory-config.json"), JSON.stringify({
      adapters: { coder: { provider: "lmstudio", baseUrl: "http://127.0.0.1:4321/v1", model: "local-model" } }
    }));

    const resolved = await loadFactoryConfig(root);

    assert.equal(resolved.resolvedFromFile, true);
    assert.equal(resolved.config.adapters.coder.baseUrl, "http://127.0.0.1:4321/v1");
    assert.equal(resolved.config.adapters.coder.model, "local-model");
  });

  it("throws with the factory-config path when JSON is malformed", async () => {
    process.env = {};
    const root = await mkdtemp(join(tmpdir(), "factory-config-"));
    await mkdir(join(root, ".protostar"));
    await writeFile(join(root, ".protostar", "factory-config.json"), "{ nope");

    await assert.rejects(
      () => loadFactoryConfig(root),
      /invalid .*\.protostar\/factory-config\.json: invalid JSON in factory config/
    );
  });

  // Phase 6 Plan 06-07 Task 1 — piles config block.
  it("parses a valid piles block with planning.mode = live", async () => {
    process.env = {};
    const root = await mkdtemp(join(tmpdir(), "factory-config-"));
    await mkdir(join(root, ".protostar"));
    await writeFile(join(root, ".protostar", "factory-config.json"), JSON.stringify({
      adapters: { coder: { provider: "lmstudio", baseUrl: "http://localhost:1234/v1", model: "m" } },
      piles: {
        planning: { mode: "live" },
        review: { mode: "fixture" },
        executionCoordination: { mode: "live", workSlicing: { maxTargetFiles: 4, maxEstimatedTurns: 6 } }
      }
    }));

    const resolved = await loadFactoryConfig(root);

    assert.equal(resolved.config.piles?.planning?.mode, "live");
    assert.equal(resolved.config.piles?.review?.mode, "fixture");
    assert.equal(resolved.config.piles?.executionCoordination?.mode, "live");
    assert.equal(resolved.config.piles?.executionCoordination?.workSlicing?.maxTargetFiles, 4);
  });

  it("rejects an invalid piles.planning.mode value", async () => {
    process.env = {};
    const root = await mkdtemp(join(tmpdir(), "factory-config-"));
    await mkdir(join(root, ".protostar"));
    await writeFile(join(root, ".protostar", "factory-config.json"), JSON.stringify({
      adapters: { coder: { provider: "lmstudio", baseUrl: "http://localhost:1234/v1", model: "m" } },
      piles: { planning: { mode: "auto" } }
    }));

    await assert.rejects(() => loadFactoryConfig(root), /piles/);
  });

  it("returns piles === undefined when the block is absent", async () => {
    process.env = {};
    const root = await mkdtemp(join(tmpdir(), "factory-config-"));
    await mkdir(join(root, ".protostar"));
    await writeFile(join(root, ".protostar", "factory-config.json"), JSON.stringify({
      adapters: { coder: { provider: "lmstudio", baseUrl: "http://localhost:1234/v1", model: "m" } }
    }));

    const resolved = await loadFactoryConfig(root);

    assert.equal(resolved.config.piles, undefined);
  });

  it("applies env overrides at the loader boundary", async () => {
    process.env = {
      LMSTUDIO_BASE_URL: "http://localhost:9999/v1",
      LMSTUDIO_MODEL: "env-model",
      LMSTUDIO_API_KEY: "secret"
    };
    const root = await mkdtemp(join(tmpdir(), "factory-config-"));
    await mkdir(join(root, ".protostar"));
    await writeFile(join(root, ".protostar", "factory-config.json"), JSON.stringify({
      adapters: { coder: { provider: "lmstudio", baseUrl: "http://localhost:1111/v1", model: "file-model" } }
    }));

    const resolved = await loadFactoryConfig(root);

    assert.equal(resolved.config.adapters.coder.baseUrl, "http://localhost:9999/v1");
    assert.equal(resolved.config.adapters.coder.model, "env-model");
    assert.deepEqual(resolved.envOverridesApplied, ["LMSTUDIO_BASE_URL", "LMSTUDIO_MODEL", "LMSTUDIO_API_KEY"]);
  });

  // Phase 8 Plan 08-07 Task 1 — evaluation/evolution config block.
  it("preserves evaluation semantic judge config from factory-config.json", async () => {
    process.env = {};
    const root = await mkdtemp(join(tmpdir(), "factory-config-"));
    await mkdir(join(root, ".protostar"));
    await writeFile(join(root, ".protostar", "factory-config.json"), JSON.stringify({
      evaluation: {
        semanticJudge: { model: "qwen-custom", baseUrl: "http://localhost:7777/v1" }
      }
    }));

    const resolved = await loadFactoryConfig(root);

    assert.equal(resolved.config.evaluation?.semanticJudge?.model, "qwen-custom");
    assert.equal(resolved.config.evaluation?.semanticJudge?.baseUrl, "http://localhost:7777/v1");
  });

  it("preserves evaluation consensus judge config from factory-config.json", async () => {
    process.env = {};
    const root = await mkdtemp(join(tmpdir(), "factory-config-"));
    await mkdir(join(root, ".protostar"));
    await writeFile(join(root, ".protostar", "factory-config.json"), JSON.stringify({
      evaluation: {
        consensusJudge: { model: "deepseek-custom", baseUrl: "http://localhost:8888/v1" }
      }
    }));

    const resolved = await loadFactoryConfig(root);

    assert.equal(resolved.config.evaluation?.consensusJudge?.model, "deepseek-custom");
    assert.equal(resolved.config.evaluation?.consensusJudge?.baseUrl, "http://localhost:8888/v1");
  });

  it("preserves evolution config from factory-config.json", async () => {
    process.env = {};
    const root = await mkdtemp(join(tmpdir(), "factory-config-"));
    await mkdir(join(root, ".protostar"));
    await writeFile(join(root, ".protostar", "factory-config.json"), JSON.stringify({
      evolution: {
        lineage: "cosmetic-tweak",
        codeEvolution: "opt-in",
        convergenceThreshold: 0.91
      }
    }));

    const resolved = await loadFactoryConfig(root);

    assert.equal(resolved.config.evolution?.lineage, "cosmetic-tweak");
    assert.equal(resolved.config.evolution?.codeEvolution, "opt-in");
    assert.equal(resolved.config.evolution?.convergenceThreshold, 0.91);
  });

  it("preserves factory headless mode and stress caps from factory-config.json", async () => {
    process.env = {};
    const root = await mkdtemp(join(tmpdir(), "factory-config-"));
    await mkdir(join(root, ".protostar"));
    await writeFile(join(root, ".protostar", "factory-config.json"), JSON.stringify({
      factory: {
        headlessMode: "self-hosted-runner",
        nonInteractive: true,
        stress: {
          caps: {
            tttDelivery: { maxAttempts: 11, maxWallClockDays: 4 },
            sustainedLoad: { maxRuns: 55, maxWallClockDays: 5 },
            concurrency: { maxSessions: 6, maxWallClockDays: 2 },
            faultInjection: { maxFaults: 7, maxWallClockDays: 1 }
          }
        }
      }
    }));

    const resolved = await loadFactoryConfig(root);

    assert.equal(resolved.config.factory.headlessMode, "self-hosted-runner");
    assert.equal(resolved.config.factory.nonInteractive, true);
    assert.equal(resolved.config.factory.stress.caps.tttDelivery.maxAttempts, 11);
    assert.equal(resolved.config.factory.stress.caps.tttDelivery.maxWallClockDays, 4);
    assert.equal(resolved.config.factory.stress.caps.faultInjection.maxFaults, 7);
  });
});

describe("evaluation/evolution config resolvers", () => {
  const intent = {
    id: "intent_cfg",
    title: "Button color",
    problem: "Make the primary button green",
    requester: "operator",
    confirmedAt: "2026-04-28T00:00:00Z",
    acceptanceCriteria: [
      { id: "AC-1", statement: "Button is green", verification: "Inspect CSS" }
    ],
    constraints: [],
    stopConditions: [],
    schemaVersion: "1.5.0",
    signature: null,
    capabilityEnvelope: {
      filesystem: { readable: [], writable: [] },
      network: { allowedHosts: [] },
      tools: { allowed: [] }
    }
  } as unknown as ConfirmedIntent;

  it("resolves semantic judge model with CLI > config > built-in precedence", () => {
    assert.equal(resolveSemanticJudgeModel("cli", "config"), "cli");
    assert.equal(resolveSemanticJudgeModel(undefined, "config"), "config");
    assert.equal(resolveSemanticJudgeModel(undefined, undefined), "Qwen3-Next-80B-A3B-MLX-4bit");
  });

  it("resolves consensus judge model with CLI > config > built-in precedence", () => {
    assert.equal(resolveConsensusJudgeModel("cli", "config"), "cli");
    assert.equal(resolveConsensusJudgeModel(undefined, "config"), "config");
    assert.equal(resolveConsensusJudgeModel(undefined, undefined), "DeepSeek-Coder-V2-Lite-Instruct");
  });

  it("resolves code evolution mode with CLI flag > config > disabled precedence", () => {
    assert.equal(resolveCodeEvolutionMode(true, "disabled"), "opt-in");
    assert.equal(resolveCodeEvolutionMode(false, "opt-in"), "opt-in");
    assert.equal(resolveCodeEvolutionMode(false, undefined), "disabled");
  });

  it("resolves lineage id with CLI > config > computed intent hash precedence", () => {
    assert.equal(resolveLineageId("cli-lineage", "config-lineage", intent), "cli-lineage");
    assert.equal(resolveLineageId(undefined, "config-lineage", intent), "config-lineage");
    assert.equal(resolveLineageId(undefined, undefined, intent), computeLineageId(intent));
  });

  it("resolves generation with CLI override before chain latest", () => {
    assert.equal(resolveGeneration(5, { generation: 2 }), 5);
    assert.equal(resolveGeneration(undefined, { generation: 2 }), 3);
    assert.equal(resolveGeneration(undefined, undefined), 0);
  });

  it("resolves convergence threshold from config or the built-in default", () => {
    assert.equal(resolveConvergenceThreshold(0.91), 0.91);
    assert.equal(resolveConvergenceThreshold(undefined), ONTOLOGY_CONVERGENCE_THRESHOLD);
  });
});
