import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

import type { CapabilityEnvelope } from "@protostar/intent";

import { authorizeNetworkOp } from "./network-op.js";

function envelope(
  network: NonNullable<CapabilityEnvelope["network"]>,
  permissionLevel: "use" | "deny" = "use"
): CapabilityEnvelope {
  return {
    repoScopes: [],
    toolPermissions: permissionLevel === "deny"
      ? []
      : [{ tool: "network", permissionLevel, reason: "call local model", risk: "low" }],
    network,
    budget: {
      adapterRetriesPerTask: 4,
      taskWallClockMs: 180_000,
      maxRepairLoops: 3
    }
  };
}

function authorize(url: string, resolvedEnvelope: CapabilityEnvelope) {
  return authorizeNetworkOp({
    method: "GET",
    url,
    resolvedEnvelope
  });
}

describe("authorizeNetworkOp network.allow", () => {
  it("refuses all URLs when network.allow is none", () => {
    const result = authorize("http://localhost:1234/v1/models", envelope({ allow: "none" }));

    assert.equal(result.ok, false);
    assert.match(result.errors.join("\n"), /refuses all/);
  });

  it("allows loopback URL 127.0.0.1 when network.allow is loopback", () => {
    const result = authorize("http://127.0.0.1:1234/v1/models", envelope({ allow: "loopback" }));

    assert.equal(result.ok, true);
    if (!result.ok) throw new Error("expected loopback network op to authorize");
    assert.equal(Object.isFrozen(result.authorized), true);
  });

  it("allows loopback URL localhost when network.allow is loopback", () => {
    const result = authorize("http://localhost:1234/v1/models", envelope({ allow: "loopback" }));

    assert.equal(result.ok, true);
  });

  it("allows loopback URL ::1 when network.allow is loopback", () => {
    const result = authorize("http://[::1]:1234/v1/models", envelope({ allow: "loopback" }));

    assert.equal(result.ok, true);
  });

  it("refuses cloud URLs when network.allow is loopback", () => {
    const result = authorize("https://api.openai.com/v1/models", envelope({ allow: "loopback" }));

    assert.equal(result.ok, false);
    assert.match(result.errors.join("\n"), /loopback/);
  });

  it("allows allowlisted hosts when network.allow is allowlist", () => {
    const result = authorize(
      "https://api.github.com/repos/protostar/factory",
      envelope({ allow: "allowlist", allowedHosts: ["api.github.com"] })
    );

    assert.equal(result.ok, true);
  });

  it("refuses unlisted hosts when network.allow is allowlist", () => {
    const result = authorize(
      "https://evil.example/repos/protostar/factory",
      envelope({ allow: "allowlist", allowedHosts: ["api.github.com"] })
    );

    assert.equal(result.ok, false);
    assert.match(result.errors.join("\n"), /allowlist/);
  });

  it("still requires toolPermissions network grant after network.allow passes", () => {
    const result = authorize("http://localhost:1234/v1/models", envelope({ allow: "loopback" }, "deny"));

    assert.equal(result.ok, false);
    assert.match(result.errors.join("\n"), /toolPermissions network/);
  });

  it("refuses envelopes missing network.allow", () => {
    const result = authorize("http://localhost:1234/v1/models", {
      repoScopes: [],
      toolPermissions: [{ tool: "network", permissionLevel: "use", reason: "call local model", risk: "low" }],
      budget: {
        adapterRetriesPerTask: 4,
        taskWallClockMs: 180_000,
        maxRepairLoops: 3
      }
    } as CapabilityEnvelope);

    assert.equal(result.ok, false);
    assert.match(result.errors.join("\n"), /network\.allow/);
  });

  it("returns a frozen branded op through the existing mint site on success", () => {
    const result = authorize("http://localhost:1234/v1/models", envelope({ allow: "loopback" }));

    assert.equal(result.ok, true);
    if (!result.ok) throw new Error("expected network op to authorize");
    assert.equal(Object.isFrozen(result.authorized), true);
  });
});
