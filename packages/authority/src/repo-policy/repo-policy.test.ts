import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { intersectEnvelopes } from "../precedence/index.js";
import { DENY_ALL_REPO_POLICY, parseRepoPolicy } from "./parse.js";

const require = createRequire(fileURLToPath(import.meta.url));

test("valid minimal repo policy parses", () => {
  const result = parseRepoPolicy({ schemaVersion: "1.0.0" });

  assert.equal(result.ok, true);
  assert.deepEqual(result.ok ? result.policy : undefined, { schemaVersion: "1.0.0" });
});

test("repo policy can contribute network authority", () => {
  const result = parseRepoPolicy({
    schemaVersion: "1.0.0",
    network: { allow: "allowlist", allowedHosts: ["api.github.com"] },
    toolPermissions: [{ tool: "network", permissionLevel: "use" }]
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.ok ? result.policy.network : undefined, {
    allow: "allowlist",
    allowedHosts: ["api.github.com"]
  });
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

test("schema parity: budgetCaps properties have type number and minimum 0", () => {
  const schema = require("../../schema/repo-policy.schema.json") as {
    properties?: {
      budgetCaps?: {
        properties?: Record<string, { type?: string; minimum?: number }>
      }
    }
  };

  const budgetCapsProps = schema.properties?.budgetCaps?.properties;
  assert.ok(budgetCapsProps, "budgetCaps.properties must exist in schema");

  const capFields = ["maxUsd", "maxTokens", "timeoutMs", "maxRepairLoops"] as const;
  for (const field of capFields) {
    const prop: { type?: string; minimum?: number } | undefined = budgetCapsProps[field];
    assert.ok(prop, `budgetCaps.${field} must exist in schema`);
    assert.equal(prop.type, "number", `budgetCaps.${field}.type must be "number"`);
    assert.equal(prop.minimum, 0, `budgetCaps.${field}.minimum must be 0`);
  }
});
