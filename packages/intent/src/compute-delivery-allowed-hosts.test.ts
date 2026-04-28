import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { computeDeliveryAllowedHosts, type DeliveryEnvelope } from "./compute-delivery-allowed-hosts.js";

const delivery: DeliveryEnvelope = {
  target: {
    owner: "protostar",
    repo: "factory",
    baseBranch: "main"
  }
};

describe("computeDeliveryAllowedHosts", () => {
  it("returns an empty frozen list when delivery is not configured", () => {
    const hosts = computeDeliveryAllowedHosts(undefined);

    assert.deepEqual(hosts, []);
    assert.equal(Object.isFrozen(hosts), true);
  });

  it("returns GitHub API and git transport hosts for configured delivery", () => {
    const hosts = computeDeliveryAllowedHosts(delivery);

    assert.deepEqual(hosts, ["api.github.com", "github.com"]);
  });

  it("includes uploads.github.com when attachments are enabled", () => {
    const hosts = computeDeliveryAllowedHosts(delivery, { attachmentsEnabled: true });

    assert.deepEqual(hosts, ["api.github.com", "github.com", "uploads.github.com"]);
  });

  it("returns a frozen result that callers cannot mutate", () => {
    const hosts = computeDeliveryAllowedHosts(delivery);

    assert.equal(Object.isFrozen(hosts), true);
    assert.throws(() => {
      (hosts as string[]).push("example.com");
    }, TypeError);
  });
});
