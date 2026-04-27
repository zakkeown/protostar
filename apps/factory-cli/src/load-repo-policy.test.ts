import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, it } from "node:test";

import { DENY_ALL_REPO_POLICY } from "@protostar/authority";

import { loadRepoPolicy } from "./load-repo-policy.js";

describe("repo-policy loader", () => {
  it("returns parsed repo policy when .protostar/repo-policy.json exists", async () => {
    await withTempDir(async (tempDir) => {
      await writeRepoPolicy(tempDir, {
        schemaVersion: "1.0.0",
        allowedScopes: ["."],
        deniedTools: ["shell"],
        budgetCaps: { maxRepairLoops: 1 },
        trustOverride: "trusted"
      });

      assert.deepEqual(await loadRepoPolicy(tempDir), {
        schemaVersion: "1.0.0",
        allowedScopes: ["."],
        deniedTools: ["shell"],
        budgetCaps: { maxRepairLoops: 1 },
        trustOverride: "trusted"
      });
    });
  });

  it("uses DENY_ALL_REPO_POLICY when repo-policy.json is absent", async () => {
    await withTempDir(async (tempDir) => {
      assert.deepEqual(await loadRepoPolicy(tempDir), DENY_ALL_REPO_POLICY);
    });
  });

  it("throws on malformed JSON", async () => {
    await withTempDir(async (tempDir) => {
      await mkdir(resolve(tempDir, ".protostar"), { recursive: true });
      await writeFile(resolve(tempDir, ".protostar", "repo-policy.json"), "{", "utf8");

      await assert.rejects(loadRepoPolicy(tempDir), SyntaxError);
    });
  });

  it("throws on schema-invalid repo policy", async () => {
    await withTempDir(async (tempDir) => {
      await writeRepoPolicy(tempDir, { schemaVersion: "9.9.9" });

      await assert.rejects(loadRepoPolicy(tempDir), /invalid \.protostar\/repo-policy\.json/);
    });
  });
});

async function writeRepoPolicy(tempDir: string, value: unknown): Promise<void> {
  await mkdir(resolve(tempDir, ".protostar"), { recursive: true });
  await writeFile(resolve(tempDir, ".protostar", "repo-policy.json"), `${JSON.stringify(value)}\n`, "utf8");
}

async function withTempDir(callback: (tempDir: string) => Promise<void>): Promise<void> {
  const tempDir = await mkdtemp(resolve(tmpdir(), "protostar-repo-policy-"));
  try {
    await callback(tempDir);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}
