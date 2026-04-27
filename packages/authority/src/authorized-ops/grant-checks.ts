import type { CapabilityEnvelope, RepoScopeGrant } from "@protostar/intent";
import type { WorkspaceRef } from "@protostar/repo";
import type { BudgetLimitField } from "@protostar/intent";

// Access level ordering: read < write < execute
const ACCESS_RANK: Record<"read" | "write" | "execute", number> = {
  read: 0,
  write: 1,
  execute: 2
};

export interface HasWorkspaceGrantInput {
  readonly workspace: WorkspaceRef;
  readonly path: string;
  readonly access: "read" | "write" | "execute";
}

/**
 * Returns true when the resolved envelope contains a repo scope that:
 * - Matches the workspace (scope.workspace === workspace.root OR scope.workspace === "main")
 * - Matches the path (path === scope.path OR path starts with scope.path + "/")
 * - Grants equal or higher access than requested (read < write < execute)
 */
export function hasWorkspaceGrant(
  envelope: CapabilityEnvelope,
  input: HasWorkspaceGrantInput
): boolean {
  const { workspace, path, access } = input;
  const requestedRank = ACCESS_RANK[access];

  return envelope.repoScopes.some((scope: RepoScopeGrant) => {
    // Check workspace match
    const workspaceMatch =
      scope.workspace === workspace.root || scope.workspace === "main";
    if (!workspaceMatch) return false;

    // Check path match — "." means all paths are covered
    const pathMatch =
      scope.path === "." ||
      path === scope.path ||
      path.startsWith(scope.path + "/");
    if (!pathMatch) return false;

    // Check access level (higher grant covers lower access)
    const grantedRank = ACCESS_RANK[scope.access];
    return grantedRank >= requestedRank;
  });
}

export interface HasExecuteGrantInput {
  readonly command: string;
  readonly cwd: string;
}

/**
 * Returns true when the resolved envelope contains an execute grant that:
 * - Has exact command match (grant.command === command)
 * - Has scope match (grant.scope === cwd OR grant.scope === "." OR cwd starts with grant.scope + "/")
 */
export function hasExecuteGrant(
  envelope: CapabilityEnvelope,
  input: HasExecuteGrantInput
): boolean {
  const { command, cwd } = input;
  const grants = envelope.executeGrants;
  if (!grants || grants.length === 0) return false;

  return grants.some((grant) => {
    if (grant.command !== command) return false;
    return (
      grant.scope === cwd ||
      grant.scope === "." ||
      cwd.startsWith(grant.scope + "/")
    );
  });
}

const NETWORK_ALLOWED_LEVELS = new Set(["use", "execute", "admin"]);

/**
 * Returns true when the resolved envelope contains a tool permission grant with:
 * - tool === "network"
 * - permissionLevel is "use", "execute", or "admin"
 */
export function hasNetworkGrant(envelope: CapabilityEnvelope): boolean {
  return envelope.toolPermissions.some(
    (grant) =>
      grant.tool === "network" &&
      grant.permissionLevel !== undefined &&
      NETWORK_ALLOWED_LEVELS.has(grant.permissionLevel)
  );
}

export interface HasBudgetGrantInput {
  readonly budgetKey: BudgetLimitField;
  readonly amount: number;
}

/**
 * Returns true when the resolved envelope's budget contains the requested key
 * and amount <= the cap.
 */
export function hasBudgetGrant(
  envelope: CapabilityEnvelope,
  input: HasBudgetGrantInput
): boolean {
  const { budgetKey, amount } = input;
  const cap = envelope.budget[budgetKey];
  return typeof cap === "number" && amount <= cap;
}
