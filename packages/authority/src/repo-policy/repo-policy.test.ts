import assert from "node:assert/strict";
import test from "node:test";

import { intersectEnvelopes } from "../precedence/index.js";
import { DENY_ALL_REPO_POLICY, parseRepoPolicy } from "./parse.js";

test("valid minimal repo policy parses", () => {
  const result = parseRepoPolicy({ schemaVersion: "1.0.0" });

  assert.equal(result.ok, true);
  assert.deepEqual(result.ok ? result.policy : undefined, { schemaVersion: "1.0.0" });
});

test("missing schemaVersion fails closed", () => {
  const result = parseRepoPolicy({});

  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /schemaVersion/);
});

test("wrong schemaVersion fails closed", () => {
  const result = parseRepoPolicy({ schemaVersion: "2.0.0" });

  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /schemaVersion/);
});

test("unknown top-level keys are rejected", () => {
  const result = parseRepoPolicy({ schemaVersion: "1.0.0", randomField: "x" });

  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /randomField/);
});

test("DENY_ALL_REPO_POLICY produces blocked-by-tier for the repo-policy tier", () => {
  const decision = intersectEnvelopes([
    {
      tier: "confirmed-intent",
      source: "intent",
      envelope: {
        repoScopes: [{ workspace: "main", path: "src", access: "write" }],
        toolPermissions: [{ tool: "shell", permissionLevel: "write", reason: "edit", risk: "medium" }],
        budget: { maxUsd: 5 }
      }
    },
    {
      tier: "repo-policy",
      source: "absent .protostar/repo-policy.json",
      envelope: DENY_ALL_REPO_POLICY
    }
  ]);

  assert.equal(decision.status, "blocked-by-tier");
  assert.ok(decision.blockedBy.some((entry) => entry.tier === "repo-policy"));
});

test("negative budget caps are rejected", () => {
  const result = parseRepoPolicy({
    schemaVersion: "1.0.0",
    budgetCaps: { maxUsd: -1 }
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /budgetCaps\.maxUsd/);
});

test("unknown trustOverride is rejected", () => {
  const result = parseRepoPolicy({
    schemaVersion: "1.0.0",
    trustOverride: "unknown"
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /trustOverride/);
});
