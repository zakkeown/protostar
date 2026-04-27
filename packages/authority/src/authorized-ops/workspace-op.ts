import type { CapabilityEnvelope } from "@protostar/intent";
import type { WorkspaceRef } from "@protostar/repo";

import { assertTrustedWorkspaceForGrant } from "../workspace-trust/predicate.js";
import { hasWorkspaceGrant } from "./grant-checks.js";

declare const AuthorizedWorkspaceOpBrand: unique symbol;

export interface AuthorizedWorkspaceOpData {
  readonly workspace: WorkspaceRef;
  readonly path: string;
  readonly access: "read" | "write" | "execute";
  readonly resolvedEnvelope: CapabilityEnvelope;
}

export type AuthorizedWorkspaceOp = AuthorizedWorkspaceOpData & {
  readonly [AuthorizedWorkspaceOpBrand]: true;
};

function mintAuthorizedWorkspaceOp(data: AuthorizedWorkspaceOpData): AuthorizedWorkspaceOp {
  return Object.freeze({ ...data }) as AuthorizedWorkspaceOp;
}

export type AuthorizeWorkspaceOpResult =
  | { readonly ok: true; readonly authorized: AuthorizedWorkspaceOp; readonly errors: readonly string[] }
  | { readonly ok: false; readonly errors: readonly string[] };

export function authorizeWorkspaceOp(input: AuthorizedWorkspaceOpData): AuthorizeWorkspaceOpResult {
  const errors: string[] = [];
  const trust = assertTrustedWorkspaceForGrant({
    workspace: input.workspace,
    requestedAccess: input.access
  });
  if (!trust.ok) errors.push(`workspace ${input.workspace.root} has trust="${input.workspace.trust}"; ${trust.evidence.reason}`);

  if (!hasWorkspaceGrant(input.resolvedEnvelope, { workspace: input.workspace, path: input.path, access: input.access })) {
    errors.push(`resolvedEnvelope.repoScopes does not grant ${input.access} access to "${input.path}" in workspace "${input.workspace.root}"; check resolvedEnvelope.repoScopes`);
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, authorized: mintAuthorizedWorkspaceOp(input), errors: [] };
}

export type AuthorizedWorkspaceOpBrandWitness = AuthorizedWorkspaceOp;

export { mintAuthorizedWorkspaceOp };
