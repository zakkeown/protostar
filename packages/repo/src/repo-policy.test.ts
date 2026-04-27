import assert from "node:assert/strict";
import { chmod, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, it } from "node:test";

import { DEFAULT_REPO_POLICY, loadRepoPolicy, parseRepoPolicy } from "./repo-policy.js";

describe("repo runtime policy parser", () => {
  it("exposes a frozen default policy that matches the schema-required shape", () => {
    assert.equal(Object.isFrozen(DEFAULT_REPO_POLICY), true);
    assert.equal(Object.isFrozen(DEFAULT_REPO_POLICY.subprocessTailBytes), true);
    assert.deepEqual(DEFAULT_REPO_POLICY, {
      schemaVersion: "1.0.0",
      subprocessTailBytes: { stdout: 8192, stderr: 4096 },
      tombstoneRetentionHours: 24
    });
  });

  it("rejects unknown keys", () => {
    const result = parseRepoPolicy({ schemaVersion: "1.0.0", extra: true });

    assert.equal(result.ok, false);
    assert.match(result.errors.join("\n"), /extra is not allowed/);
  });

  it("accepts the minimal complete policy", () => {
    const input = {
      schemaVersion: "1.0.0",
      subprocessTailBytes: { stdout: 8192, stderr: 4096 },
      tombstoneRetentionHours: 24
    };

    const result = parseRepoPolicy(input);

    assert.equal(result.ok, true);
    assert.deepEqual(result.ok ? result.policy : undefined, input);
  });

  it("default-fills missing optional runtime fields", () => {
    const result = parseRepoPolicy({ schemaVersion: "1.0.0" });

    assert.equal(result.ok, true);
    assert.deepEqual(result.ok ? result.policy : undefined, DEFAULT_REPO_POLICY);
  });

  it("rejects negative tombstone retention", () => {
    const result = parseRepoPolicy({
      schemaVersion: "1.0.0",
      tombstoneRetentionHours: -1
    });

    assert.equal(result.ok, false);
    assert.match(result.errors.join("\n"), /tombstoneRetentionHours must be a non-negative finite number/);
  });

  it("rejects unknown schemaVersion", () => {
    const result = parseRepoPolicy({ schemaVersion: "2.0.0" });

    assert.equal(result.ok, false);
    assert.match(result.errors.join("\n"), /schemaVersion must be 1\.0\.0/);
  });
});

describe("loadRepoPolicy", () => {
  it("returns the default policy when .protostar/repo-policy.json is absent", async (t) => {
    const projectRoot = await mkProjectRoot(t);

    const result = await loadRepoPolicy(projectRoot);

    assert.equal(result.ok, true);
    assert.deepEqual(result.ok ? result.policy : undefined, DEFAULT_REPO_POLICY);
  });

  it("reports malformed JSON", async (t) => {
    const projectRoot = await mkProjectRoot(t);
    await writePolicy(projectRoot, "{ bad json");

    const result = await loadRepoPolicy(projectRoot);

    assert.equal(result.ok, false);
    assert.match(result.errors.join("\n"), /^repo-policy invalid JSON:/);
  });

  it("reports unreadable policy files", async (t) => {
    const projectRoot = await mkProjectRoot(t);
    const policyPath = await writePolicy(projectRoot, "{}");
    await chmod(policyPath, 0o000);
    t.after(() => chmod(policyPath, 0o600).catch(() => undefined));

    const result = await loadRepoPolicy(projectRoot);

    if (process.getuid?.() === 0) {
      assert.equal(result.ok, true);
    } else {
      assert.equal(result.ok, false);
      assert.match(result.errors.join("\n"), /^repo-policy unreadable:/);
    }
  });

  it("loads a valid policy with workspaceRoot omitted", async (t) => {
    const projectRoot = await mkProjectRoot(t);
    await writePolicy(projectRoot, JSON.stringify({ schemaVersion: "1.0.0" }));

    const result = await loadRepoPolicy(projectRoot);

    assert.equal(result.ok, true);
    assert.deepEqual(result.ok ? result.policy : undefined, DEFAULT_REPO_POLICY);
  });

  it("accepts a disjoint absolute workspaceRoot and resolves it absolutely", async (t) => {
    const projectRoot = await mkProjectRoot(t);
    const workspaceRoot = join(tmpdir(), `protostar-workspaces-${process.pid}`);
    await writePolicy(projectRoot, JSON.stringify({ schemaVersion: "1.0.0", workspaceRoot }));

    const result = await loadRepoPolicy(projectRoot);

    assert.equal(result.ok, true);
    assert.equal(result.ok ? result.policy.workspaceRoot : undefined, resolve(projectRoot, workspaceRoot));
  });

  it("refuses workspaceRoot equal to projectRoot as a recursive clone risk", async (t) => {
    const projectRoot = await mkProjectRoot(t);
    await writePolicy(projectRoot, JSON.stringify({ schemaVersion: "1.0.0", workspaceRoot: projectRoot }));

    const result = await loadRepoPolicy(projectRoot);

    assert.equal(result.ok, false);
    assert.match(result.errors.join("\n"), /recursive.*clone/i);
  });

  it("refuses workspaceRoot inside the source repo", async (t) => {
    const projectRoot = await mkProjectRoot(t);
    await writePolicy(projectRoot, JSON.stringify({
      schemaVersion: "1.0.0",
      workspaceRoot: join(projectRoot, ".protostar", "workspaces")
    }));

    const result = await loadRepoPolicy(projectRoot);

    assert.equal(result.ok, false);
    assert.match(result.errors.join("\n"), /workspaceRoot must be outside the source repo/);
  });

  it("accepts os.tmpdir/protostar-workspaces as an outside workspaceRoot", async (t) => {
    const projectRoot = await mkProjectRoot(t);
    const workspaceRoot = join(tmpdir(), "protostar-workspaces");
    await writePolicy(projectRoot, JSON.stringify({ schemaVersion: "1.0.0", workspaceRoot }));

    const result = await loadRepoPolicy(projectRoot);

    assert.equal(result.ok, true);
    assert.equal(result.ok ? result.policy.workspaceRoot : undefined, resolve(projectRoot, workspaceRoot));
  });

  it("resolves relative workspaceRoot before refusing source-repo recursion", async (t) => {
    const projectRoot = await mkProjectRoot(t);
    await writePolicy(projectRoot, JSON.stringify({
      schemaVersion: "1.0.0",
      workspaceRoot: "./.protostar/workspaces"
    }));

    const result = await loadRepoPolicy(projectRoot);

    assert.equal(result.ok, false);
    assert.match(result.errors.join("\n"), /workspaceRoot must be outside the source repo/);
  });
});

async function mkProjectRoot(t: { after(fn: () => void | Promise<void>): void }): Promise<string> {
  const projectRoot = await import("node:fs/promises").then(({ mkdtemp }) =>
    mkdtemp(join(tmpdir(), "protostar-repo-policy-"))
  );
  t.after(() => rm(projectRoot, { recursive: true, force: true }));
  return projectRoot;
}

async function writePolicy(projectRoot: string, content: string): Promise<string> {
  const policyDir = join(projectRoot, ".protostar");
  await mkdir(policyDir, { recursive: true });
  const policyPath = join(policyDir, "repo-policy.json");
  await writeFile(policyPath, content);
  return policyPath;
}
