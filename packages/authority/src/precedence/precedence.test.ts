import assert from "node:assert/strict";
import test from "node:test";

import type { CapabilityEnvelope } from "@protostar/intent";

import { intersectEnvelopes, TIER_PRECEDENCE_ORDER, type PrecedenceDecision, type TierConstraint } from "./index.js";

function envelope(overrides: Partial<CapabilityEnvelope> = {}): CapabilityEnvelope {
  return {
    repoScopes: overrides.repoScopes ?? [
      { workspace: "main", path: "src", access: "read" },
      { workspace: "main", path: "src", access: "write" }
    ],
    toolPermissions: overrides.toolPermissions ?? [
      { tool: "shell", permissionLevel: "read", reason: "inspect", risk: "low" },
      { tool: "git", permissionLevel: "write", reason: "commit", risk: "medium" }
    ],
    ...(overrides.executeGrants !== undefined ? { executeGrants: overrides.executeGrants } : {}),
    workspace: overrides.workspace ?? { allowDirty: false },
    budget: overrides.budget ?? {
      maxUsd: 10,
      maxTokens: 10_000,
      timeoutMs: 60_000,
      maxRepairLoops: 3
    }
  };
}

function tier(overrides: Partial<TierConstraint> = {}): TierConstraint {
  return {
    tier: overrides.tier ?? "confirmed-intent",
    envelope: overrides.envelope ?? envelope(),
    source: overrides.source ?? "test"
  };
}

test("empty tiers produce a no-conflict wide-open default", () => {
  const decision = intersectEnvelopes([]);
  const witness: PrecedenceDecision = decision;

  assert.equal(witness.status, "no-conflict");
  assert.deepEqual(witness.resolvedEnvelope.repoScopes, []);
  assert.deepEqual(witness.resolvedEnvelope.toolPermissions, []);
  assert.deepEqual(witness.resolvedEnvelope.workspace, { allowDirty: false });
  assert.deepEqual(witness.resolvedEnvelope.budget, {});
  assert.deepEqual(witness.blockedBy, []);
});

test("single tier with no conflict is preserved", () => {
  const input = tier();
  const decision = intersectEnvelopes([input]);

  assert.equal(decision.status, "no-conflict");
  assert.deepEqual(decision.resolvedEnvelope, input.envelope);
  assert.deepEqual(decision.tiers, [input]);
});

test("compatible stricter tier resolves by strict intersection", () => {
  const decision = intersectEnvelopes([
    tier({ tier: "confirmed-intent" }),
    tier({
      tier: "policy",
      envelope: envelope({
        repoScopes: [{ workspace: "main", path: "src", access: "read" }],
        toolPermissions: [{ tool: "shell", permissionLevel: "read", reason: "inspect", risk: "low" }],
        budget: { maxUsd: 3, maxTokens: 1_000, timeoutMs: 5_000, maxRepairLoops: 1 }
      })
    })
  ]);

  assert.equal(decision.status, "resolved");
  assert.deepEqual(decision.blockedBy, []);
  assert.deepEqual(decision.resolvedEnvelope.repoScopes, [{ workspace: "main", path: "src", access: "read" }]);
  assert.deepEqual(decision.resolvedEnvelope.toolPermissions, [
    { tool: "shell", permissionLevel: "read", reason: "inspect", risk: "low" }
  ]);
  assert.deepEqual(decision.resolvedEnvelope.workspace, { allowDirty: false });
  assert.deepEqual(decision.resolvedEnvelope.budget, {
    maxUsd: 3,
    maxTokens: 1_000,
    timeoutMs: 5_000,
    maxRepairLoops: 1
  });
});

test("repo-policy deniedTools blocks the denied tool with evidence", () => {
  const decision = intersectEnvelopes([
    tier({
      tier: "confirmed-intent",
      envelope: envelope({
        toolPermissions: [{ tool: "shell", permissionLevel: "write", reason: "edit", risk: "medium" }]
      })
    }),
    tier({
      tier: "repo-policy",
      envelope: {
        ...envelope({
          toolPermissions: [{ tool: "shell", permissionLevel: "write", reason: "repo policy mirrors request", risk: "medium" }]
        }),
        deniedTools: ["shell"]
      }
    })
  ]);

  assert.equal(decision.status, "blocked-by-tier");
  assert.equal(decision.blockedBy[0]?.tier, "repo-policy");
  assert.match(decision.blockedBy[0]?.axis ?? "", /deniedTools|toolPermissions/);
});

test("blockedBy.length === 2 when two tiers deny the same axis", () => {
  const decision = intersectEnvelopes([
    tier({
      tier: "confirmed-intent",
      envelope: envelope({
        repoScopes: [{ workspace: "main", path: "src", access: "write" }],
        toolPermissions: [{ tool: "shell", permissionLevel: "write", reason: "edit", risk: "medium" }]
      })
    }),
    tier({
      tier: "policy",
      envelope: envelope({
        repoScopes: [],
        toolPermissions: [{ tool: "shell", permissionLevel: "write", reason: "policy", risk: "medium" }]
      })
    }),
    tier({
      tier: "operator-settings",
      envelope: envelope({
        repoScopes: [],
        toolPermissions: [{ tool: "shell", permissionLevel: "write", reason: "operator", risk: "medium" }]
      })
    })
  ]);

  assert.equal(decision.status, "blocked-by-tier");
  assert.equal(decision.blockedBy.length, 2);
  assert.deepEqual(new Set(decision.blockedBy.map((entry) => entry.tier)), new Set(["policy", "operator-settings"]));
});

test("decision data is frozen", () => {
  const decision = intersectEnvelopes([tier()]);

  assert.throws(() => {
    (decision as unknown as { tiers: TierConstraint[] }).tiers = [];
  }, TypeError);
});

test("precedence order documents GOV-01", () => {
  assert.deepEqual(TIER_PRECEDENCE_ORDER, [
    "confirmed-intent",
    "policy",
    "repo-policy",
    "operator-settings"
  ]);
});
