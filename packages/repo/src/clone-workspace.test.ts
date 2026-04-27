import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { AuthCallback, GitAuth } from "isomorphic-git";

import {
  __resetCloneWorkspaceDependenciesForTests,
  __setCloneWorkspaceDependenciesForTests,
  buildOnAuth,
  cloneWorkspace,
  CredentialRefusedError,
  type CloneRequest
} from "./clone-workspace.js";

interface CloneOptions {
  readonly dir: string;
  readonly url: string;
  readonly ref?: string;
  readonly depth?: number;
  readonly singleBranch?: boolean;
  readonly onAuth?: AuthCallback;
}

describe("buildOnAuth", () => {
  it("uses credentialRef env values without exposing the ref value in the API", async (t) => {
    t.after(() => {
      delete process.env["TEST_TOKEN"];
    });
    process.env["TEST_TOKEN"] = "abc123";

    const auth = await buildOnAuth("TEST_TOKEN")("https://example.test/repo.git", {});

    assert.deepEqual(auth, { username: "abc123", password: "x-oauth-basic" });
  });

  it("cancels credentialRef auth when the env var is unset", async () => {
    delete process.env["TEST_TOKEN"];

    const auth = await buildOnAuth("TEST_TOKEN")("https://example.test/repo.git", {});

    assert.deepEqual(auth, { cancel: true });
  });

  it("falls back to anonymous auth when no credentialRef is provided", async () => {
    const auth = await buildOnAuth(undefined)("https://example.test/repo.git", {});

    assert.deepEqual(auth, {});
  });

  it("cancels retry storms after two auth callbacks for the same ref", async (t) => {
    t.after(() => {
      delete process.env["TEST_TOKEN"];
    });
    process.env["TEST_TOKEN"] = "abc123";
    const onAuth = buildOnAuth("TEST_TOKEN");

    await onAuth("https://example.test/repo.git", {});
    await onAuth("https://example.test/repo.git", {});
    const third = await onAuth("https://example.test/repo.git", {});

    assert.deepEqual(third, { cancel: true });
  });
});

describe("cloneWorkspace", () => {
  it("clones through isomorphic-git shape, resolves HEAD, and audits symlinks", async (t) => {
    const calls: CloneOptions[] = [];
    installCloneMocks(t, {
      clone: async (options) => {
        calls.push(options);
      }
    });

    const request = mkRequest();
    const result = await cloneWorkspace(request);

    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.url, request.url);
    assert.equal(calls[0]?.dir, request.dir);
    assert.equal(calls[0]?.depth, 1);
    assert.equal(calls[0]?.singleBranch, true);
    assert.equal(calls[0]?.ref, "main");
    assert.equal(typeof calls[0]?.onAuth, "function");
    assert.deepEqual(result, {
      dir: request.dir,
      headSha: "abc123def456",
      auth: { mode: "anonymous" },
      symlinkAudit: { ok: true, offendingPaths: [] }
    });
  });

  it("records credentialRef auth mode by name only", async (t) => {
    t.after(() => {
      delete process.env["TEST_TOKEN"];
    });
    process.env["TEST_TOKEN"] = "SENTINEL_VALUE_xyz";
    let capturedOnAuth: AuthCallback | undefined;
    installCloneMocks(t, {
      clone: async (options) => {
        capturedOnAuth = options.onAuth;
        assert.deepEqual(await options.onAuth?.("https://example.test/repo.git", {}), {
          username: "SENTINEL_VALUE_xyz",
          password: "x-oauth-basic"
        });
      }
    });

    const result = await cloneWorkspace(mkRequest({ credentialRef: "TEST_TOKEN" }));

    assert.equal(typeof capturedOnAuth, "function");
    assert.deepEqual(result.auth, { mode: "credentialRef", credentialRef: "TEST_TOKEN" });
    assert.equal(JSON.stringify(result).includes("SENTINEL_VALUE_xyz"), false);
  });

  it("embeds symlink audit refusal without throwing", async (t) => {
    installCloneMocks(t, {
      auditSymlinks: async () => ({ ok: false, offendingPaths: ["foo/bar"] })
    });

    const result = await cloneWorkspace(mkRequest());

    assert.deepEqual(result.symlinkAudit, { ok: false, offendingPaths: ["foo/bar"] });
  });

  it("wraps credentialRef auth cancellation as CredentialRefusedError", async (t) => {
    delete process.env["TEST_TOKEN"];
    installCloneMocks(t, {
      clone: async (options) => {
        await options.onAuth?.("https://example.test/repo.git", {});
        throw new Error("HTTP Error: 401 Unauthorized");
      }
    });

    await assert.rejects(
      () => cloneWorkspace(mkRequest({ credentialRef: "TEST_TOKEN" })),
      (error: unknown) =>
        error instanceof CredentialRefusedError &&
        (error as CredentialRefusedError).credentialRef === "TEST_TOKEN" &&
        !(error as Error).message.includes("SENTINEL")
    );
  });
});

function installCloneMocks(
  t: { after(fn: () => void | Promise<void>): void },
  overrides: Partial<{
    readonly clone: (options: CloneOptions) => Promise<void>;
    readonly resolveRef: (options: { readonly dir: string; readonly ref: string }) => Promise<string>;
    readonly auditSymlinks: (dir: string) => Promise<{ readonly ok: boolean; readonly offendingPaths: readonly string[] }>;
  }>
): void {
  __setCloneWorkspaceDependenciesForTests({
    clone: overrides.clone ?? (async () => undefined),
    resolveRef: overrides.resolveRef ?? (async () => "abc123def456"),
    auditSymlinks: overrides.auditSymlinks ?? (async () => ({ ok: true, offendingPaths: [] }))
  });
  t.after(() => __resetCloneWorkspaceDependenciesForTests());
}

function mkRequest(overrides: Partial<CloneRequest> = {}): CloneRequest {
  return {
    url: "https://example.test/repo.git",
    dir: "/tmp/protostar-clone-target",
    ref: "main",
    ...overrides
  };
}
