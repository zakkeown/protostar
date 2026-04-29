import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import type { BranchName } from "@protostar/delivery";
import {
  __resetPushBranchDependenciesForTests,
  __setPushBranchDependenciesForTests,
  buildPushOnAuth,
  pushBranch
} from "./push-branch.js";

const branchName = "protostar/cosmetic-tweak/20260428143052-a3k9z2cd" as BranchName;

describe("buildPushOnAuth", () => {
  it("returns the Q-03 x-access-token auth form", async () => {
    const onAuth = buildPushOnAuth("ghp_valid_token", new AbortController().signal);

    assert.deepEqual(await onAuth("https://github.com/o/r.git", {}), {
      username: "x-access-token",
      password: "ghp_valid_token"
    });
  });

  it("cancels when token is empty or the signal aborts during the auth loop", async () => {
    const emptyTokenAuth = buildPushOnAuth("", new AbortController().signal);
    assert.deepEqual(await emptyTokenAuth("https://github.com/o/r.git", {}), { cancel: true });

    const controller = new AbortController();
    const onAuth = buildPushOnAuth("ghp_valid_token", controller.signal);
    assert.equal((await onAuth("https://github.com/o/r.git", {}))?.username, "x-access-token");
    controller.abort("sigint");
    assert.deepEqual(await onAuth("https://github.com/o/r.git", {}), { cancel: true });
  });
});

describe("pushBranch", () => {
  it("pushes a first-time branch and returns the local branch SHA", async (t) => {
    const calls: string[] = [];
    __setPushBranchDependenciesForTests({
      add: async (options) => {
        calls.push(`add-${options.filepath}`);
      },
      branch: async (options) => {
        calls.push(`branch-${options.ref}-checkout-${String(options.checkout)}`);
      },
      commit: async () => {
        calls.push("commit");
        return "local-new-sha";
      },
      fetch: async () => {
        calls.push("fetch");
        const error = new Error("not found");
        Object.assign(error, { code: "NotFoundError" });
        throw error;
      },
      push: async (options) => {
        calls.push(`push-force-${String(options.force)}`);
        return { ok: true, error: null, refs: { [`refs/heads/${branchName}`]: { ok: true, error: "" } } };
      },
      remove: async () => {
        throw new Error("remove should not be called");
      },
      resolveRef: async () => "local-new-sha",
      statusMatrix: async () => [["src/Button.tsx", 1, 2, 1]]
    });
    t.after(() => __resetPushBranchDependenciesForTests());

    const result = await pushBranch({
      workspaceDir: "/workspace",
      branchName,
      remoteUrl: "https://github.com/owner/repo.git",
      token: "ghp_valid_token",
      expectedRemoteSha: null,
      signal: new AbortController().signal,
      fs: {}
    });

    assert.deepEqual(result, { ok: true, newSha: "local-new-sha" });
    assert.deepEqual(calls, [
      "fetch",
      `branch-${branchName}-checkout-true`,
      "add-src/Button.tsx",
      "commit",
      "push-force-false"
    ]);
  });

  it("refuses before fetch or push when the parent signal is already aborted", async (t) => {
    let pushed = false;
    __setPushBranchDependenciesForTests({
      add: async () => {
        throw new Error("add should not be called");
      },
      branch: async () => {
        throw new Error("branch should not be called");
      },
      commit: async () => {
        throw new Error("commit should not be called");
      },
      fetch: async () => {
        throw new Error("fetch should not be called");
      },
      push: async () => {
        pushed = true;
        throw new Error("push should not be called");
      },
      remove: async () => {
        throw new Error("remove should not be called");
      },
      resolveRef: async () => "unused",
      statusMatrix: async () => {
        throw new Error("statusMatrix should not be called");
      }
    });
    t.after(() => __resetPushBranchDependenciesForTests());

    const controller = new AbortController();
    controller.abort("sigint");
    const result = await pushBranch({
      workspaceDir: "/workspace",
      branchName,
      remoteUrl: "https://github.com/owner/repo.git",
      token: "ghp_valid_token",
      expectedRemoteSha: null,
      signal: controller.signal,
      fs: {}
    });

    assert.equal(pushed, false);
    assert.deepEqual(result, { ok: false, refusal: { kind: "cancelled", evidence: { reason: "sigint", phase: "push" } } });
  });

  it("refuses remote-diverged when the remote SHA is not the expected lease", async (t) => {
    __setPushBranchDependenciesForTests({
      add: async () => {
        throw new Error("add should not be called");
      },
      branch: async () => {
        throw new Error("branch should not be called");
      },
      commit: async () => {
        throw new Error("commit should not be called");
      },
      fetch: async () => ({ defaultBranch: null, fetchHead: "remote-sha-x", fetchHeadDescription: null }),
      push: async () => {
        throw new Error("push should not be called");
      },
      remove: async () => {
        throw new Error("remove should not be called");
      },
      resolveRef: async (options) => (options.ref.startsWith("refs/remotes/") ? "remote-sha-x" : "local-new-sha"),
      statusMatrix: async () => {
        throw new Error("statusMatrix should not be called");
      }
    });
    t.after(() => __resetPushBranchDependenciesForTests());

    const result = await pushBranch({
      workspaceDir: "/workspace",
      branchName,
      remoteUrl: "https://github.com/owner/repo.git",
      token: "ghp_valid_token",
      expectedRemoteSha: "expected-sha-y",
      signal: new AbortController().signal,
      fs: {}
    });

    assert.deepEqual(result, {
      ok: false,
      refusal: {
        kind: "remote-diverged",
        evidence: { branch: branchName, expectedSha: "expected-sha-y", remoteSha: "remote-sha-x" }
      }
    });
  });

  it("maps empty-token auth failure to a push-failed refusal", async (t) => {
    __setPushBranchDependenciesForTests({
      add: async () => {
        throw new Error("add should not be called");
      },
      branch: async () => {
        throw new Error("branch should not be called");
      },
      commit: async () => {
        throw new Error("commit should not be called");
      },
      fetch: async (options) => {
        const auth = await options.onAuth?.("https://github.com/owner/repo.git", {});
        assert.deepEqual(auth, { cancel: true });
        throw new Error("Authentication required");
      },
      push: async () => {
        throw new Error("push should not be called");
      },
      remove: async () => {
        throw new Error("remove should not be called");
      },
      resolveRef: async () => "unused",
      statusMatrix: async () => {
        throw new Error("statusMatrix should not be called");
      }
    });
    t.after(() => __resetPushBranchDependenciesForTests());

    const result = await pushBranch({
      workspaceDir: "/workspace",
      branchName,
      remoteUrl: "https://github.com/owner/repo.git",
      token: "",
      expectedRemoteSha: null,
      signal: new AbortController().signal,
      fs: {}
    });

    assert.equal(result.ok, false);
    assert.equal(result.refusal.kind, "push-failed");
    assert.equal(result.refusal.evidence.phase, "fetch");
  });

  it("maps auth-loop abort during push to a cancellation refusal", async (t) => {
    const controller = new AbortController();
    __setPushBranchDependenciesForTests({
      add: async () => undefined,
      branch: async () => undefined,
      commit: async () => "unused",
      fetch: async () => {
        const error = new Error("not found");
        Object.assign(error, { code: "NotFoundError" });
        throw error;
      },
      push: async (options) => {
        assert.equal((await options.onAuth?.("https://github.com/owner/repo.git", {}))?.username, "x-access-token");
        controller.abort("sentinel");
        assert.deepEqual(await options.onAuth?.("https://github.com/owner/repo.git", {}), { cancel: true });
        throw new Error("Authentication cancelled");
      },
      remove: async () => undefined,
      resolveRef: async () => "unused",
      statusMatrix: async () => [["src/Button.tsx", 1, 2, 1]]
    });
    t.after(() => __resetPushBranchDependenciesForTests());

    const result = await pushBranch({
      workspaceDir: "/workspace",
      branchName,
      remoteUrl: "https://github.com/owner/repo.git",
      token: "ghp_valid_token",
      expectedRemoteSha: null,
      signal: controller.signal,
      fs: {}
    });

    assert.deepEqual(result, {
      ok: false,
      refusal: { kind: "cancelled", evidence: { reason: "sentinel", phase: "push" } }
    });
  });

  it("maps non-abort push throws to a push-failed refusal", async (t) => {
    __setPushBranchDependenciesForTests({
      add: async () => undefined,
      branch: async () => undefined,
      commit: async () => "unused",
      fetch: async () => {
        const error = new Error("not found");
        Object.assign(error, { code: "NotFoundError" });
        throw error;
      },
      push: async () => {
        throw new Error("remote rejected ghp_123456789012345678901234567890123456");
      },
      remove: async () => undefined,
      resolveRef: async () => "unused",
      statusMatrix: async () => [["src/Button.tsx", 1, 2, 1]]
    });
    t.after(() => __resetPushBranchDependenciesForTests());

    const result = await pushBranch({
      workspaceDir: "/workspace",
      branchName,
      remoteUrl: "https://github.com/owner/repo.git",
      token: "ghp_valid_token",
      expectedRemoteSha: null,
      signal: new AbortController().signal,
      fs: {}
    });

    assert.equal(result.ok, false);
    assert.equal(result.refusal.kind, "push-failed");
    assert.deepEqual(result.refusal.evidence, { phase: "push", message: "remote rejected ***" });
  });
});
