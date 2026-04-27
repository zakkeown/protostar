import {
  mintAuthorizedBudgetOp,
  type AuthorizedBudgetOp,
  type AuthorizedBudgetOpData
} from "../authorized-ops/budget-op.js";
import {
  mintAuthorizedNetworkOp,
  type AuthorizedNetworkOp,
  type AuthorizedNetworkOpData
} from "../authorized-ops/network-op.js";
import {
  mintAuthorizedSubprocessOp,
  type AuthorizedSubprocessOp,
  type AuthorizedSubprocessOpData
} from "../authorized-ops/subprocess-op.js";
import {
  mintAuthorizedWorkspaceOp,
  type AuthorizedWorkspaceOp,
  type AuthorizedWorkspaceOpData
} from "../authorized-ops/workspace-op.js";

import type { CapabilityEnvelope } from "@protostar/intent";

const defaultResolvedEnvelope: CapabilityEnvelope = Object.freeze({
  repoScopes: [],
  toolPermissions: [],
  budget: {}
});

export function buildAuthorizedWorkspaceOpForTest(
  overrides: Partial<AuthorizedWorkspaceOpData> = {}
): AuthorizedWorkspaceOp {
  const defaults: AuthorizedWorkspaceOpData = {
    workspace: { root: "/tmp/test-workspace", trust: "trusted" },
    path: "src/example.ts",
    access: "read",
    resolvedEnvelope: defaultResolvedEnvelope
  };

  return mintAuthorizedWorkspaceOp({ ...defaults, ...overrides });
}

export function buildAuthorizedSubprocessOpForTest(
  overrides: Partial<AuthorizedSubprocessOpData> = {}
): AuthorizedSubprocessOp {
  const defaults: AuthorizedSubprocessOpData = {
    command: "pnpm",
    args: ["run", "verify"],
    cwd: ".",
    resolvedEnvelope: defaultResolvedEnvelope
  };

  return mintAuthorizedSubprocessOp({ ...defaults, ...overrides });
}

export function buildAuthorizedNetworkOpForTest(
  overrides: Partial<AuthorizedNetworkOpData> = {}
): AuthorizedNetworkOp {
  const defaults: AuthorizedNetworkOpData = {
    method: "GET",
    url: "https://example.com",
    resolvedEnvelope: defaultResolvedEnvelope
  };

  return mintAuthorizedNetworkOp({ ...defaults, ...overrides });
}

export function buildAuthorizedBudgetOpForTest(
  overrides: Partial<AuthorizedBudgetOpData> = {}
): AuthorizedBudgetOp {
  const defaults: AuthorizedBudgetOpData = {
    boundary: "subprocess",
    amount: 0,
    resolvedEnvelope: defaultResolvedEnvelope
  };

  return mintAuthorizedBudgetOp({ ...defaults, ...overrides });
}
