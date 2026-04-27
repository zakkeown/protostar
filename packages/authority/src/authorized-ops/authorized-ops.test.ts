import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

import {
  authorizeBudgetOp,
  authorizeNetworkOp,
  authorizeSubprocessOp,
  authorizeWorkspaceOp
} from "./index.js";

import {
  hasWorkspaceGrant,
  hasExecuteGrant,
  hasNetworkGrant,
  hasBudgetGrant
} from "./grant-checks.js";

import type { CapabilityEnvelope } from "@protostar/intent";
import type { WorkspaceRef } from "@protostar/repo";

// Populated envelope with matching grants for positive cases
const populatedEnvelope: CapabilityEnvelope = {
  repoScopes: [
    { workspace: "/tmp/protostar-test-workspace", path: "src", access: "write" as const }
  ],
  toolPermissions: [
    { tool: "network", permissionLevel: "use" as const, reason: "http calls", risk: "low" as const }
  ],
  executeGrants: [
    { command: "pnpm", scope: "." }
  ],
  budget: { maxUsd: 10, maxTokens: 1000 }
};

// empty resolved envelope — used in negative tests
const emptyResolvedEnvelope: CapabilityEnvelope = Object.freeze({
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

describe("grant-checks helpers", () => {
  describe("hasWorkspaceGrant", () => {
    it("matches when repoScope workspace equals workspace root and path prefix matches", () => {
      const result = hasWorkspaceGrant(populatedEnvelope, {
        workspace: trustedWorkspace,
        path: "src/example.ts",
        access: "write"
      });
      assert.equal(result, true);
    });

    it("matches when scope.workspace is 'main' (broad grant)", () => {
      const envelope: CapabilityEnvelope = {
        repoScopes: [{ workspace: "main", path: ".", access: "write" }],
        toolPermissions: [],
        budget: {}
      };
      const result = hasWorkspaceGrant(envelope, {
        workspace: trustedWorkspace,
        path: "src/example.ts",
        access: "write"
      });
      assert.equal(result, true);
    });

    it("matches when access level is higher than requested (write covers read)", () => {
      const result = hasWorkspaceGrant(populatedEnvelope, {
        workspace: trustedWorkspace,
        path: "src/example.ts",
        access: "read"
      });
      assert.equal(result, true);
    });

    it("rejects when empty resolved envelope has no repoScopes", () => {
      const result = hasWorkspaceGrant(emptyResolvedEnvelope, {
        workspace: trustedWorkspace,
        path: "src/example.ts",
        access: "write"
      });
      assert.equal(result, false);
    });

    it("rejects when path does not match scope path", () => {
      const result = hasWorkspaceGrant(populatedEnvelope, {
        workspace: trustedWorkspace,
        path: "other/file.ts",
        access: "write"
      });
      assert.equal(result, false);
    });

    it("rejects when workspace root does not match scope workspace", () => {
      const differentWorkspace: WorkspaceRef = {
        root: "/tmp/other-workspace",
        trust: "trusted"
      };
      const result = hasWorkspaceGrant(populatedEnvelope, {
        workspace: differentWorkspace,
        path: "src/example.ts",
        access: "write"
      });
      assert.equal(result, false);
    });

    it("rejects when requested access is higher than granted access (execute > write)", () => {
      const result = hasWorkspaceGrant(populatedEnvelope, {
        workspace: trustedWorkspace,
        path: "src/example.ts",
        access: "execute"
      });
      assert.equal(result, false);
    });
  });

  describe("hasExecuteGrant", () => {
    it("matches when command and cwd exactly match grant", () => {
      const result = hasExecuteGrant(populatedEnvelope, {
        command: "pnpm",
        cwd: "."
      });
      assert.equal(result, true);
    });

    it("matches when cwd starts with scope path", () => {
      const envelope: CapabilityEnvelope = {
        repoScopes: [],
        toolPermissions: [],
        executeGrants: [{ command: "node", scope: "/workspace" }],
        budget: {}
      };
      const result = hasExecuteGrant(envelope, {
        command: "node",
        cwd: "/workspace/packages/auth"
      });
      assert.equal(result, true);
    });

    it("rejects when empty resolved envelope has no executeGrants", () => {
      const result = hasExecuteGrant(emptyResolvedEnvelope, {
        command: "pnpm",
        cwd: "."
      });
      assert.equal(result, false);
    });

    it("rejects when command does not match", () => {
      const result = hasExecuteGrant(populatedEnvelope, {
        command: "npm",
        cwd: "."
      });
      assert.equal(result, false);
    });
  });

  describe("hasNetworkGrant", () => {
    it("matches when toolPermissions contains network tool with use permission", () => {
      const result = hasNetworkGrant(populatedEnvelope);
      assert.equal(result, true);
    });

    it("matches when network permission is execute", () => {
      const envelope: CapabilityEnvelope = {
        repoScopes: [],
        toolPermissions: [{ tool: "network", permissionLevel: "execute", reason: "calls", risk: "medium" }],
        budget: {}
      };
      const result = hasNetworkGrant(envelope);
      assert.equal(result, true);
    });

    it("matches when network permission is admin", () => {
      const envelope: CapabilityEnvelope = {
        repoScopes: [],
        toolPermissions: [{ tool: "network", permissionLevel: "admin", reason: "calls", risk: "high" }],
        budget: {}
      };
      const result = hasNetworkGrant(envelope);
      assert.equal(result, true);
    });

    it("rejects when empty resolved envelope has no toolPermissions", () => {
      const result = hasNetworkGrant(emptyResolvedEnvelope);
      assert.equal(result, false);
    });

    it("rejects when network permission level is read", () => {
      const envelope: CapabilityEnvelope = {
        repoScopes: [],
        toolPermissions: [{ tool: "network", permissionLevel: "read", reason: "calls", risk: "low" }],
        budget: {}
      };
      const result = hasNetworkGrant(envelope);
      assert.equal(result, false);
    });

    it("rejects when network permission level is write", () => {
      const envelope: CapabilityEnvelope = {
        repoScopes: [],
        toolPermissions: [{ tool: "network", permissionLevel: "write", reason: "calls", risk: "low" }],
        budget: {}
      };
      const result = hasNetworkGrant(envelope);
      assert.equal(result, false);
    });

    it("rejects when no network tool in permissions", () => {
      const envelope: CapabilityEnvelope = {
        repoScopes: [],
        toolPermissions: [{ tool: "filesystem", permissionLevel: "use", reason: "files", risk: "low" }],
        budget: {}
      };
      const result = hasNetworkGrant(envelope);
      assert.equal(result, false);
    });
  });

  describe("hasBudgetGrant", () => {
    it("matches when budget key exists and amount is within cap", () => {
      const result = hasBudgetGrant(populatedEnvelope, { budgetKey: "maxUsd", amount: 5 });
      assert.equal(result, true);
    });

    it("matches when amount equals cap exactly", () => {
      const result = hasBudgetGrant(populatedEnvelope, { budgetKey: "maxUsd", amount: 10 });
      assert.equal(result, true);
    });

    it("rejects when empty resolved envelope has no budget keys", () => {
      const result = hasBudgetGrant(emptyResolvedEnvelope, { budgetKey: "maxUsd", amount: 5 });
      assert.equal(result, false);
    });

    it("rejects when amount exceeds cap", () => {
      const result = hasBudgetGrant(populatedEnvelope, { budgetKey: "maxUsd", amount: 11 });
      assert.equal(result, false);
    });

    it("rejects when budgetKey is missing from budget", () => {
      const result = hasBudgetGrant(populatedEnvelope, { budgetKey: "timeoutMs", amount: 5 });
      assert.equal(result, false);
    });
  });
});

describe("authorized operation producers", () => {
  it("authorizes and freezes workspace read/write operations for trusted workspaces", () => {
    const result = authorizeWorkspaceOp({
      workspace: trustedWorkspace,
      path: "src/example.ts",
      access: "write",
      resolvedEnvelope: populatedEnvelope
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
      resolvedEnvelope: populatedEnvelope
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
      resolvedEnvelope: populatedEnvelope
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
      resolvedEnvelope: populatedEnvelope
    });

    assert.equal(result.ok, false);
    assert.equal(result.errors.length > 0, true);
    assert.equal("authorized" in result, false);
  });

  it("authorizes http and https network operations", () => {
    const result = authorizeNetworkOp({
      method: "POST",
      url: "https://example.com/api",
      resolvedEnvelope: populatedEnvelope
    });

    assert.equal(result.ok, true);
    if (!result.ok) throw new Error("expected network op to authorize");
    assert.equal(Object.isFrozen(result.authorized), true);
  });

  it("rejects network operations with non-http protocols", () => {
    const result = authorizeNetworkOp({
      method: "GET",
      url: "file:///etc/passwd",
      resolvedEnvelope: populatedEnvelope
    });

    assert.equal(result.ok, false);
    assert.equal(result.errors.length > 0, true);
    assert.equal("authorized" in result, false);
  });

  it("authorizes finite non-negative budget operations", () => {
    const result = authorizeBudgetOp({
      boundary: "judge-panel",
      budgetKey: "maxUsd",
      amount: 5,
      resolvedEnvelope: populatedEnvelope
    });

    assert.equal(result.ok, true);
    if (!result.ok) throw new Error("expected budget op to authorize");
    assert.equal(Object.isFrozen(result.authorized), true);
  });

  it("rejects negative and non-finite budget operations", () => {
    const negative = authorizeBudgetOp({
      boundary: "network",
      budgetKey: "maxUsd",
      amount: -1,
      resolvedEnvelope: populatedEnvelope
    });
    const infinite = authorizeBudgetOp({
      boundary: "network",
      budgetKey: "maxUsd",
      amount: Number.POSITIVE_INFINITY,
      resolvedEnvelope: populatedEnvelope
    });

    assert.equal(negative.ok, false);
    assert.equal(infinite.ok, false);
    assert.equal(negative.errors.length > 0, true);
    assert.equal(infinite.errors.length > 0, true);
  });

  // Envelope enforcement — negative cases
  it("rejects workspace op when resolvedEnvelope.repoScopes has no matching scope", () => {
    const result = authorizeWorkspaceOp({
      workspace: trustedWorkspace,
      path: "src/example.ts",
      access: "write",
      resolvedEnvelope: emptyResolvedEnvelope
    });

    assert.equal(result.ok, false);
    assert.equal(result.errors.some(e => e.includes("resolvedEnvelope.repoScopes")), true);
  });

  it("rejects workspace op when path does not match any repoScope", () => {
    const mismatchEnvelope: CapabilityEnvelope = {
      repoScopes: [{ workspace: "/tmp/protostar-test-workspace", path: "other", access: "write" }],
      toolPermissions: [{ tool: "network", permissionLevel: "use", reason: "calls", risk: "low" }],
      budget: { maxUsd: 10 }
    };
    const result = authorizeWorkspaceOp({
      workspace: trustedWorkspace,
      path: "src/example.ts",
      access: "write",
      resolvedEnvelope: mismatchEnvelope
    });

    assert.equal(result.ok, false);
    assert.equal(result.errors.some(e => e.includes("resolvedEnvelope.repoScopes")), true);
  });

  it("rejects subprocess op when resolvedEnvelope.executeGrants has no matching grant", () => {
    const result = authorizeSubprocessOp({
      command: "pnpm",
      args: ["run", "verify"],
      cwd: ".",
      resolvedEnvelope: emptyResolvedEnvelope
    });

    assert.equal(result.ok, false);
    assert.equal(result.errors.some(e => e.includes("resolvedEnvelope.executeGrants")), true);
  });

  it("rejects subprocess op when command does not match any executeGrant", () => {
    const mismatchEnvelope: CapabilityEnvelope = {
      repoScopes: [],
      toolPermissions: [],
      executeGrants: [{ command: "npm", scope: "." }],
      budget: {}
    };
    const result = authorizeSubprocessOp({
      command: "pnpm",
      args: ["run", "verify"],
      cwd: ".",
      resolvedEnvelope: mismatchEnvelope
    });

    assert.equal(result.ok, false);
    assert.equal(result.errors.some(e => e.includes("resolvedEnvelope.executeGrants")), true);
  });

  it("rejects network op when toolPermissions has no network permission (toolPermissions network)", () => {
    const result = authorizeNetworkOp({
      method: "POST",
      url: "https://example.com/api",
      resolvedEnvelope: emptyResolvedEnvelope
    });

    assert.equal(result.ok, false);
    assert.equal(result.errors.some(e => e.includes("toolPermissions network")), true);
  });

  it("rejects network op when network tool is missing from toolPermissions", () => {
    const noNetworkEnvelope: CapabilityEnvelope = {
      repoScopes: [],
      toolPermissions: [{ tool: "filesystem", permissionLevel: "use", reason: "files", risk: "low" }],
      budget: {}
    };
    const result = authorizeNetworkOp({
      method: "POST",
      url: "https://example.com/api",
      resolvedEnvelope: noNetworkEnvelope
    });

    assert.equal(result.ok, false);
    assert.equal(result.errors.some(e => e.includes("toolPermissions network")), true);
  });

  it("rejects budget op when resolvedEnvelope.budget has no matching budgetKey", () => {
    const result = authorizeBudgetOp({
      boundary: "judge-panel",
      budgetKey: "maxUsd",
      amount: 5,
      resolvedEnvelope: emptyResolvedEnvelope
    });

    assert.equal(result.ok, false);
    assert.equal(result.errors.some(e => e.includes("resolvedEnvelope.budget")), true);
  });

  it("rejects budget op when amount exceeds cap in resolvedEnvelope.budget", () => {
    const result = authorizeBudgetOp({
      boundary: "judge-panel",
      budgetKey: "maxUsd",
      amount: 100,
      resolvedEnvelope: populatedEnvelope
    });

    assert.equal(result.ok, false);
    assert.equal(result.errors.some(e => e.includes("resolvedEnvelope.budget")), true);
  });
});
