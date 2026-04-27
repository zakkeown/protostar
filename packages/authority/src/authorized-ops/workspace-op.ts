import type { CapabilityEnvelope } from "@protostar/intent";
import type { WorkspaceRef } from "@protostar/repo";

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

  if (input.access !== "read" && input.workspace.trust !== "trusted") {
    errors.push(
      `workspace ${input.workspace.root} has trust="${input.workspace.trust}"; ` +
      `${input.access} requires trust="trusted"`
    );
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, authorized: mintAuthorizedWorkspaceOp(input), errors: [] };
}

export type AuthorizedWorkspaceOpBrandWitness = AuthorizedWorkspaceOp;

export { mintAuthorizedWorkspaceOp };
