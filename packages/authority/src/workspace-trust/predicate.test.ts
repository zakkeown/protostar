import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

import { assertTrustedWorkspaceForGrant } from "./predicate.js";

describe("assertTrustedWorkspaceForGrant", () => {
  it("allows read access for untrusted workspaces", () => {
    assert.deepEqual(assertTrustedWorkspaceForGrant({
      workspace: { root: "/repo", trust: "untrusted" },
      requestedAccess: "read"
    }), { ok: true });
  });

  it("allows read access for trusted workspaces", () => {
    assert.deepEqual(assertTrustedWorkspaceForGrant({
      workspace: { root: "/repo", trust: "trusted" },
      requestedAccess: "read"
    }), { ok: true });
  });

  it("refuses write access for untrusted workspaces with evidence", () => {
    const result = assertTrustedWorkspaceForGrant({
      workspace: { root: "/repo", trust: "untrusted" },
      requestedAccess: "write"
    });

    assert.equal(result.ok, false);
    if (result.ok) throw new Error("expected refusal");
    assert.equal(result.evidence.workspaceRoot, "/repo");
    assert.equal(result.evidence.declaredTrust, "untrusted");
    assert.match(result.evidence.reason, /trust="trusted"/);
  });

  it("allows write access for trusted workspaces", () => {
    assert.deepEqual(assertTrustedWorkspaceForGrant({
      workspace: { root: "/repo", trust: "trusted" },
      requestedAccess: "write"
    }), { ok: true });
  });

  it("refuses execute access for untrusted workspaces", () => {
    const result = assertTrustedWorkspaceForGrant({
      workspace: { root: "/repo", trust: "untrusted" },
      requestedAccess: "execute"
    });

    assert.equal(result.ok, false);
  });

  it("refuses workspace executionScope for untrusted workspaces even with read access", () => {
    const result = assertTrustedWorkspaceForGrant({
      workspace: { root: "/repo", trust: "untrusted" },
      requestedAccess: "read",
      requestedScope: "workspace"
    });

    assert.equal(result.ok, false);
    if (result.ok) throw new Error("expected refusal");
    assert.match(result.evidence.reason, /executionScope "workspace"/);
  });

  it("allows workspace executionScope for trusted workspaces", () => {
    assert.deepEqual(assertTrustedWorkspaceForGrant({
      workspace: { root: "/repo", trust: "trusted" },
      requestedAccess: "read",
      requestedScope: "workspace"
    }), { ok: true });
  });
});
