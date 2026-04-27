import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";

import { loadFactoryConfig } from "./load-factory-config.js";

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
});
