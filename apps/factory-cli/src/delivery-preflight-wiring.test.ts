import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, it, mock } from "node:test";

import {
  runFastDeliveryPreflight,
  runFullDeliveryPreflight
} from "./delivery-preflight-wiring.js";

const validToken = "ghp_123456789012345678901234567890123456";
const leakedToken = "ghp_LEAKMELEAKMELEAKMELEAKMELEAKMELEAKME12";
const target = { owner: "protostar", repo: "factory", baseBranch: "main" } as const;
const baseSha = "0123456789abcdef0123456789abcdef01234567";

const cleanupDirs: string[] = [];

describe("delivery preflight wiring", () => {
  afterEach(async () => {
    mock.restoreAll();
    await Promise.all(cleanupDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  describe("runFastDeliveryPreflight", () => {
    it("writes a fast refusal artifact when the token is missing", async () => {
      const runDir = await makeRunDir("run_fast_missing_");

      const outcome = await runFastDeliveryPreflight({ env: {}, runDir, fs });

      assert.equal(outcome.proceed, false);
      assert.equal(outcome.result.outcome, "token-missing");
      assert.equal(outcome.refusalPath, resolve(runDir, "delivery/preflight-refusal.json"));
      const artifact = await readJsonObject(outcome.refusalPath);
      assert.equal(artifact["phase"], "fast");
      assert.equal(artifact["runId"], runDir.split("/").at(-1));
      assert.equal(typeof artifact["at"], "string");
      assert.deepEqual(artifact["result"], { outcome: "token-missing" });
    });

    it("writes a fast refusal artifact when the token format is invalid", async () => {
      const runDir = await makeRunDir("run_fast_invalid_");

      const outcome = await runFastDeliveryPreflight({
        env: { PROTOSTAR_GITHUB_TOKEN: "not-a-token" },
        runDir,
        fs
      });

      assert.equal(outcome.proceed, false);
      assert.equal(outcome.result.outcome, "token-invalid");
      assert.equal(await pathExists(resolve(runDir, "delivery/preflight-refusal.json")), true);
    });

    it("records fast refusal artifacts with the run id from runDir", async () => {
      const runDir = await makeRunDir("run_fast_runid_");

      const outcome = await runFastDeliveryPreflight({ env: {}, runDir, fs });
      const artifact = await readJsonObject(outcome.refusalPath);

      assert.equal(artifact["runId"], runDir.split("/").at(-1));
      assert.equal(artifact["phase"], "fast");
      assert.equal(typeof artifact["at"], "string");
    });

    it("uses an atomic tmp path and leaves only the final fast refusal file", async () => {
      const runDir = await makeRunDir("run_fast_atomic_");

      await runFastDeliveryPreflight({ env: {}, runDir, fs });

      assert.equal(await pathExists(resolve(runDir, "delivery/preflight-refusal.json")), true);
      assert.equal(await pathExists(resolve(runDir, "delivery/preflight-refusal.json.tmp")), false);
    });

    it("returns proceed=true and does not create a delivery directory for an ok token", async () => {
      const runDir = await makeRunDir("run_fast_ok_");

      const outcome = await runFastDeliveryPreflight({
        env: { PROTOSTAR_GITHUB_TOKEN: validToken },
        runDir,
        fs
      });

      assert.deepEqual(outcome, { proceed: true, result: { outcome: "ok", tokenSource: "env" } });
      assert.equal(await pathExists(resolve(runDir, "delivery")), false);
    });
  });

  describe("runFullDeliveryPreflight", () => {
    it("returns proceed=true with octokit, token login, and base sha for an ok full preflight", async () => {
      mockFetch([
        responseFor("/user", 200, { login: "protostar-bot" }, { "X-OAuth-Scopes": "public_repo" }),
        responseFor("/repos/protostar/factory", 200, { name: "factory" }),
        responseFor("/repos/protostar/factory/branches/main", 200, { commit: { sha: baseSha } })
      ]);
      const runDir = await makeRunDir("run_full_ok_");

      const outcome = await runFullDeliveryPreflight({
        token: validToken,
        target,
        runDir,
        fs,
        signal: new AbortController().signal
      });

      assert.equal(outcome.proceed, true);
      assert.equal(outcome.result.outcome, "ok");
      assert.equal(outcome.tokenLogin, "protostar-bot");
      assert.equal(outcome.baseSha, baseSha);
      assert.ok(outcome.octokit);
      assert.equal(await pathExists(resolve(runDir, "delivery")), false);
    });

    it("writes full refusal for malformed token format without making a request", async () => {
      const fetchMock = mockFetch([]);
      const runDir = await makeRunDir("run_full_format_");

      const outcome = await runFullDeliveryPreflight({
        token: "not-a-token",
        target,
        runDir,
        fs,
        signal: new AbortController().signal
      });

      assert.equal(outcome.proceed, false);
      assert.deepEqual(outcome.result, { outcome: "token-invalid", reason: "format" });
      assert.equal(fetchMock.mock.callCount(), 0);
      assert.equal((await readJsonObject(outcome.refusalPath))["phase"], "full");
    });

    it("writes full refusal for token-invalid from GitHub 401", async () => {
      mockFetch([responseFor("/user", 401, { message: "Bad credentials" })]);
      const runDir = await makeRunDir("run_full_401_");

      const outcome = await runFullDeliveryPreflight({
        token: validToken,
        target,
        runDir,
        fs,
        signal: new AbortController().signal
      });

      assert.equal(outcome.proceed, false);
      assert.deepEqual(outcome.result, { outcome: "token-invalid", reason: "401" });
      assert.equal((await readJsonObject(outcome.refusalPath))["phase"], "full");
    });

    it("writes full refusal for repo-inaccessible", async () => {
      mockFetch([
        responseFor("/user", 200, { login: "protostar-bot" }, { "X-OAuth-Scopes": "public_repo" }),
        responseFor("/repos/protostar/factory", 403, { message: "Forbidden" })
      ]);
      const runDir = await makeRunDir("run_full_repo_");

      const outcome = await runFullDeliveryPreflight({
        token: validToken,
        target,
        runDir,
        fs,
        signal: new AbortController().signal
      });

      assert.equal(outcome.proceed, false);
      assert.deepEqual(outcome.result, { outcome: "repo-inaccessible", status: 403 });
    });

    it("writes full refusal for base-branch-missing", async () => {
      mockFetch([
        responseFor("/user", 200, { login: "protostar-bot" }, { "X-OAuth-Scopes": "public_repo" }),
        responseFor("/repos/protostar/factory", 200, { name: "factory" }),
        responseFor("/repos/protostar/factory/branches/main", 404, { message: "Branch not found" })
      ]);
      const runDir = await makeRunDir("run_full_branch_");

      const outcome = await runFullDeliveryPreflight({
        token: validToken,
        target,
        runDir,
        fs,
        signal: new AbortController().signal
      });

      assert.equal(outcome.proceed, false);
      assert.deepEqual(outcome.result, { outcome: "base-branch-missing", baseBranch: "main" });
    });

    it("writes full refusal for excessive-pat-scope", async () => {
      mockFetch([
        responseFor("/user", 200, { login: "protostar-bot" }, { "X-OAuth-Scopes": "public_repo, admin:org" })
      ]);
      const runDir = await makeRunDir("run_full_scope_");

      const outcome = await runFullDeliveryPreflight({
        token: validToken,
        target,
        runDir,
        fs,
        signal: new AbortController().signal
      });

      assert.equal(outcome.proceed, false);
      assert.deepEqual(outcome.result, {
        outcome: "excessive-pat-scope",
        scopes: ["public_repo", "admin:org"],
        forbidden: ["admin:org"]
      });
    });

    it("never writes the token into a full refusal artifact", async () => {
      mockFetch([responseFor("/user", 401, { message: "Bad credentials" })]);
      const runDir = await makeRunDir("run_full_leak_");

      const outcome = await runFullDeliveryPreflight({
        token: leakedToken,
        target,
        runDir,
        fs,
        signal: new AbortController().signal
      });

      assert.equal(outcome.proceed, false);
      const contents = await fs.readFile(outcome.refusalPath, "utf8");
      assert.equal(contents.includes(leakedToken), false);
    });
  });
});

async function makeRunDir(prefix: string): Promise<string> {
  const runDir = await mkdtemp(resolve(tmpdir(), prefix));
  cleanupDirs.push(runDir);
  return runDir;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}

async function readJson(path: string | undefined): Promise<unknown> {
  assert.ok(path);
  return JSON.parse(await fs.readFile(path, "utf8"));
}

async function readJsonObject(path: string | undefined): Promise<Record<string, unknown>> {
  const value = await readJson(path);
  assert.equal(typeof value, "object");
  assert.notEqual(value, null);
  assert.equal(Array.isArray(value), false);
  return value as Record<string, unknown>;
}

interface MockResponse {
  readonly path: string;
  readonly status: number;
  readonly body: unknown;
  readonly headers?: Record<string, string>;
}

function responseFor(
  path: string,
  status: number,
  body: unknown,
  headers?: Record<string, string>
): MockResponse {
  return { path, status, body, ...(headers === undefined ? {} : { headers }) };
}

function mockFetch(responses: readonly MockResponse[]) {
  const queue = [...responses];
  return mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const next = queue.shift();
    assert.ok(next, `unexpected fetch to ${url.pathname}`);
    assert.equal(url.origin, "https://api.github.com");
    assert.equal(url.pathname, next.path);
    return new Response(JSON.stringify(next.body), {
      status: next.status,
      headers: {
        "Content-Type": "application/json",
        ...(next.headers ?? {})
      }
    });
  });
}
