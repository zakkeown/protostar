import type { WorkspaceRef } from "@protostar/repo";

export type AccessLevel = "read" | "write" | "execute";
export type ExecutionScope = "none" | "workspace-readonly" | "workspace";

export interface AssertTrustInput {
  readonly workspace: WorkspaceRef;
  readonly requestedAccess: AccessLevel;
  readonly requestedScope?: ExecutionScope;
}

export interface TrustRefusalEvidence {
  readonly workspaceRoot: string;
  readonly declaredTrust: WorkspaceRef["trust"];
  readonly requestedAccess: AccessLevel;
  readonly requestedScope?: ExecutionScope;
  readonly reason: string;
}

export type TrustAssertionResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly evidence: TrustRefusalEvidence };

export function assertTrustedWorkspaceForGrant(input: AssertTrustInput): TrustAssertionResult {
  const { workspace, requestedAccess, requestedScope } = input;

  if (requestedAccess === "read" && requestedScope !== "workspace") {
    return { ok: true };
  }

  if (workspace.trust !== "trusted") {
    return {
      ok: false,
      evidence: {
        workspaceRoot: workspace.root,
        declaredTrust: workspace.trust,
        requestedAccess,
        ...(requestedScope !== undefined ? { requestedScope } : {}),
        reason: requestedScope === "workspace"
          ? `executionScope "workspace" requires trust="trusted"; got "${workspace.trust}"`
          : `${requestedAccess} access requires trust="trusted"; got "${workspace.trust}"`
      }
    };
  }

  return { ok: true };
}
