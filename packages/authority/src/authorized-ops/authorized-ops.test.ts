import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

import {
  authorizeBudgetOp,
  authorizeNetworkOp,
  authorizeSubprocessOp,
  authorizeWorkspaceOp
} from "./index.js";

import type { CapabilityEnvelope } from "@protostar/intent";
import type { WorkspaceRef } from "@protostar/repo";

const resolvedEnvelope: CapabilityEnvelope = Object.freeze({
  repoScopes: [],
  toolPermissions: [],
  budget: {}
});

const trustedWorkspace: WorkspaceRef = Object.freeze({
  root: "/tmp/protostar-test-workspace",
  trust: "trusted"
});

const untrustedWorkspace: WorkspaceRef = Object.freeze({
  root: "/tmp/protostar-test-workspace",
  trust: "untrusted"
});

describe("authorized operation producers", () => {
  it("authorizes and freezes workspace read/write operations for trusted workspaces", () => {
    const result = authorizeWorkspaceOp({
      workspace: trustedWorkspace,
      path: "src/example.ts",
      access: "write",
      resolvedEnvelope
    });

    assert.equal(result.ok, true);
    assert.deepEqual(result.errors, []);
    if (!result.ok) throw new Error("expected workspace op to authorize");

    assert.equal(Object.isFrozen(result.authorized), true);
    assert.throws(() => {
      (result.authorized as { path: string }).path = "mutated.ts";
    }, TypeError);
  });

  it("rejects untrusted workspace writes and does not expose an authorized value", () => {
    const result = authorizeWorkspaceOp({
      workspace: untrustedWorkspace,
      path: "src/example.ts",
      access: "write",
      resolvedEnvelope
    });

    assert.equal(result.ok, false);
    assert.equal(result.errors.length > 0, true);
    assert.equal("authorized" in result, false);
  });

  it("authorizes subprocess operations with plain executable names", () => {
    const result = authorizeSubprocessOp({
      command: "pnpm",
      args: ["run", "verify"],
      cwd: ".",
      resolvedEnvelope
    });

    assert.equal(result.ok, true);
    if (!result.ok) throw new Error("expected subprocess op to authorize");
    assert.equal(Object.isFrozen(result.authorized), true);
    assert.equal(Object.isFrozen(result.authorized.args), true);
  });

  it("rejects subprocess commands with shell metacharacters", () => {
    const result = authorizeSubprocessOp({
      command: "pnpm;rm",
      args: [],
      cwd: ".",
      resolvedEnvelope
    });

    assert.equal(result.ok, false);
    assert.equal(result.errors.length > 0, true);
    assert.equal("authorized" in result, false);
  });

  it("authorizes http and https network operations", () => {
    const result = authorizeNetworkOp({
      method: "POST",
      url: "https://example.com/api",
      resolvedEnvelope
    });

    assert.equal(result.ok, true);
    if (!result.ok) throw new Error("expected network op to authorize");
    assert.equal(Object.isFrozen(result.authorized), true);
  });

  it("rejects network operations with non-http protocols", () => {
    const result = authorizeNetworkOp({
      method: "GET",
      url: "file:///etc/passwd",
      resolvedEnvelope
    });

    assert.equal(result.ok, false);
    assert.equal(result.errors.length > 0, true);
    assert.equal("authorized" in result, false);
  });

  it("authorizes finite non-negative budget operations", () => {
    const result = authorizeBudgetOp({
      boundary: "judge-panel",
      amount: 12,
      resolvedEnvelope
    });

    assert.equal(result.ok, true);
    if (!result.ok) throw new Error("expected budget op to authorize");
    assert.equal(Object.isFrozen(result.authorized), true);
  });

  it("rejects negative and non-finite budget operations", () => {
    const negative = authorizeBudgetOp({
      boundary: "network",
      amount: -1,
      resolvedEnvelope
    });
    const infinite = authorizeBudgetOp({
      boundary: "network",
      amount: Number.POSITIVE_INFINITY,
      resolvedEnvelope
    });

    assert.equal(negative.ok, false);
    assert.equal(infinite.ok, false);
    assert.equal(negative.errors.length > 0, true);
    assert.equal(infinite.errors.length > 0, true);
  });
});
