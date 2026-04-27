import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

import { assertWorkspaceTrust, WorkspaceTrustError } from "./workspace-trust-runtime.js";

describe("assertWorkspaceTrust", () => {
  it("allows trusted write operations", () => {
    assert.doesNotThrow(() => assertWorkspaceTrust({
      workspace: { root: "/repo", trust: "trusted" },
      requestedAccess: "write"
    }));
  });

  it("throws WorkspaceTrustError for untrusted write operations", () => {
    assert.throws(
      () => assertWorkspaceTrust({
        workspace: { root: "/repo", trust: "untrusted" },
        requestedAccess: "write"
      }),
      (error: unknown) => error instanceof WorkspaceTrustError && error.workspace.trust === "untrusted"
    );
  });

  it("allows untrusted read operations", () => {
    assert.doesNotThrow(() => assertWorkspaceTrust({
      workspace: { root: "/repo", trust: "untrusted" },
      requestedAccess: "read"
    }));
  });

  it("allows trusted workspace-scope operations", () => {
    assert.doesNotThrow(() => assertWorkspaceTrust({
      workspace: { root: "/repo", trust: "trusted" },
      requestedAccess: "read",
      requestedScope: "workspace"
    }));
  });

  it("throws for untrusted workspace-scope operations", () => {
    assert.throws(
      () => assertWorkspaceTrust({
        workspace: { root: "/repo", trust: "untrusted" },
        requestedAccess: "read",
        requestedScope: "workspace"
      }),
      WorkspaceTrustError
    );
  });
});
