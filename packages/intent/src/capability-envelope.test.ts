import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { parseConfirmedIntent, type CapabilityEnvelope } from "./index.js";

describe("ConfirmedIntent 1.5.0 capability envelope schema", () => {
  it("pins schemaVersion to exactly 1.5.0", async () => {
    const schema = await readConfirmedIntentSchema();
    const properties = schema["properties"] as Record<string, Record<string, unknown>>;

    assert.equal(properties["schemaVersion"]?.["const"], "1.5.0");
    assert.equal("enum" in (properties["schemaVersion"] ?? {}), false);
    assert.equal("oneOf" in (properties["schemaVersion"] ?? {}), false);
  });

  it("accepts loopback network mode without allowedHosts", () => {
    const result = parseConfirmedIntent(buildConfirmedIntentFixture());

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.deepEqual(result.data.capabilityEnvelope.network, { allow: "loopback" });
    }
  });

  it("rejects allowlist network mode without allowedHosts", () => {
    const result = parseConfirmedIntent(
      buildConfirmedIntentFixture({
        capabilityEnvelope: {
          ...buildCapabilityEnvelopeFixture(),
          network: { allow: "allowlist" }
        }
      })
    );

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(
        result.errors.includes("capabilityEnvelope.network.allowedHosts is required when network.allow is allowlist."),
        true
      );
    }
  });

  it("accepts allowlist network mode with allowedHosts", () => {
    const result = parseConfirmedIntent(
      buildConfirmedIntentFixture({
        capabilityEnvelope: {
          ...buildCapabilityEnvelopeFixture(),
          network: { allow: "allowlist", allowedHosts: ["api.github.com"] }
        }
      })
    );

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.deepEqual(result.data.capabilityEnvelope.network, {
        allow: "allowlist",
        allowedHosts: ["api.github.com"]
      });
    }
  });

  it("rejects missing adapter retry budget", () => {
    const result = parseConfirmedIntent(
      buildConfirmedIntentFixture({
        capabilityEnvelope: {
          ...buildCapabilityEnvelopeFixture(),
          budget: {
            taskWallClockMs: 180_000,
            maxRepairLoops: 3
          }
        }
      })
    );

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(
        result.errors.includes("capabilityEnvelope.budget.adapterRetriesPerTask must be an integer from 1 to 10."),
        true
      );
    }
  });

  it("rejects taskWallClockMs below 1000", () => {
    const result = parseConfirmedIntent(
      buildConfirmedIntentFixture({
        capabilityEnvelope: {
          ...buildCapabilityEnvelopeFixture(),
          budget: {
            adapterRetriesPerTask: 4,
            taskWallClockMs: 0,
            maxRepairLoops: 3
          }
        }
      })
    );

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(
        result.errors.includes("capabilityEnvelope.budget.taskWallClockMs must be an integer from 1000 to 1800000."),
        true
      );
    }
  });

  it("accepts maxRepairLoops at the Phase 5 default", () => {
    const result = parseConfirmedIntent(
      buildConfirmedIntentFixture({
        capabilityEnvelope: {
          ...buildCapabilityEnvelopeFixture(),
          budget: {
            adapterRetriesPerTask: 4,
            taskWallClockMs: 180_000,
            maxRepairLoops: 3
          }
        }
      })
    );

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.data.capabilityEnvelope.budget.maxRepairLoops, 3);
    }
  });

  it("defaults missing maxRepairLoops to 3", () => {
    const { maxRepairLoops: _maxRepairLoops, ...budget } = buildCapabilityEnvelopeFixture()["budget"] as Record<string, unknown>;
    const result = parseConfirmedIntent(
      buildConfirmedIntentFixture({
        capabilityEnvelope: {
          ...buildCapabilityEnvelopeFixture(),
          budget
        }
      })
    );

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.data.capabilityEnvelope.budget.maxRepairLoops, 3);
    }
  });

  it("defaults missing deliveryWallClockMs to 600000", () => {
    const { deliveryWallClockMs: _deliveryWallClockMs, ...budget } =
      buildCapabilityEnvelopeFixture()["budget"] as Record<string, unknown>;
    const result = parseConfirmedIntent(
      buildConfirmedIntentFixture({
        capabilityEnvelope: {
          ...buildCapabilityEnvelopeFixture(),
          budget
        }
      })
    );

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.data.capabilityEnvelope.budget.deliveryWallClockMs, 600_000);
    }
  });

  it("accepts a signed delivery target", () => {
    const result = parseConfirmedIntent(
      buildConfirmedIntentFixture({
        capabilityEnvelope: {
          ...buildCapabilityEnvelopeFixture(),
          delivery: {
            target: {
              owner: "protostar-test",
              repo: "fixture-toy",
              baseBranch: "main"
            }
          }
        }
      })
    );

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.deepEqual(result.data.capabilityEnvelope.delivery?.target, {
        owner: "protostar-test",
        repo: "fixture-toy",
        baseBranch: "main"
      });
    }
  });

  it("rejects maxRepairLoops below 1", () => {
    const result = parseConfirmedIntent(
      buildConfirmedIntentFixture({
        capabilityEnvelope: {
          ...buildCapabilityEnvelopeFixture(),
          budget: {
            adapterRetriesPerTask: 4,
            taskWallClockMs: 180_000,
            maxRepairLoops: 0
          }
        }
      })
    );

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(
        result.errors.includes("capabilityEnvelope.budget.maxRepairLoops must be an integer from 1 to 10."),
        true
      );
    }
  });

  it("rejects maxRepairLoops above 10", () => {
    const result = parseConfirmedIntent(
      buildConfirmedIntentFixture({
        capabilityEnvelope: {
          ...buildCapabilityEnvelopeFixture(),
          budget: {
            adapterRetriesPerTask: 4,
            taskWallClockMs: 180_000,
            maxRepairLoops: 11
          }
        }
      })
    );

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(
        result.errors.includes("capabilityEnvelope.budget.maxRepairLoops must be an integer from 1 to 10."),
        true
      );
    }
  });

  it("fails if confirmed-intent source or fixtures still pin schemaVersion 1.3.0", () => {
    const staleSchemaVersionLiteral = '"schemaVersion": "1.' + '3.0"';

    assert.throws(
      () =>
        execFileSync(
          "git",
          [
            "grep",
            "-n",
            staleSchemaVersionLiteral,
            "--",
            "packages/intent"
          ],
          { cwd: fileURLToPath(new URL("../../..", import.meta.url)) }
        ),
      /Command failed/
    );
  });

  it("CapabilityEnvelope type matches the 1.5.0 shape", () => {
    const envelope = {
      repoScopes: [
        {
          workspace: "protostar",
          path: "packages/intent",
          access: "write"
        }
      ],
      workspace: { allowDirty: false },
      toolPermissions: [
        {
          tool: "node:test",
          permissionLevel: "use",
          reason: "Verify schema behavior.",
          risk: "low"
        }
      ],
      network: { allow: "allowlist", allowedHosts: ["api.github.com"] },
      budget: {
        adapterRetriesPerTask: 4,
        taskWallClockMs: 180_000,
        deliveryWallClockMs: 600_000,
        maxRepairLoops: 3
      },
      delivery: {
        target: {
          owner: "protostar-test",
          repo: "fixture-toy",
          baseBranch: "main"
        }
      }
    } satisfies CapabilityEnvelope;

    assert.equal(envelope.network.allow, "allowlist");
  });
});

async function readConfirmedIntentSchema(): Promise<Record<string, unknown>> {
  const schemaPath = fileURLToPath(new URL("../schema/confirmed-intent.schema.json", import.meta.url));
  return JSON.parse(await readFile(schemaPath, "utf8")) as Record<string, unknown>;
}

function buildConfirmedIntentFixture(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: "1.5.0",
    id: "intent_capability_envelope",
    sourceDraftId: "draft_capability_envelope",
    mode: "brownfield",
    goalArchetype: "cosmetic-tweak",
    title: "Bump capability envelope",
    problem: "Confirmed intent envelopes need execution budgets and network authority.",
    requester: "phase-04-plan-07",
    confirmedAt: "2026-04-27T00:00:00.000Z",
    acceptanceCriteria: [
      {
        id: "ac_capability_envelope",
        statement: "The capability envelope validates budget and network controls.",
        verification: "test"
      }
    ],
    capabilityEnvelope: buildCapabilityEnvelopeFixture(),
    constraints: ["No compatibility schema union."],
    stopConditions: ["Stop if 1.2.0 is still accepted."],
    signature: null,
    ...overrides
  };
}

function buildCapabilityEnvelopeFixture(): Record<string, unknown> {
  return {
    repoScopes: [
      {
        workspace: "protostar",
        path: "packages/intent",
        access: "write"
      }
    ],
    workspace: { allowDirty: false },
    toolPermissions: [
      {
        tool: "node:test",
        permissionLevel: "use",
        reason: "Verify schema behavior.",
        risk: "low"
      }
    ],
    network: { allow: "loopback" },
    budget: {
      adapterRetriesPerTask: 4,
      taskWallClockMs: 180_000,
      deliveryWallClockMs: 600_000,
      maxRepairLoops: 3
    }
  };
}
