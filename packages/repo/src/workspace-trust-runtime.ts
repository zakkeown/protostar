// AccessLevel, ExecutionScope, TrustRefusalEvidence re-declared here to avoid
// importing from @protostar/authority — authority references @protostar/repo for
// WorkspaceRef, so a reverse import would create a circular TS project reference.
// The definitions below are kept in sync with packages/authority/src/workspace-trust/predicate.ts.

import type { WorkspaceRef } from "./index.js";

export type AccessLevel = "read" | "write" | "execute";
export type ExecutionScope = "none" | "workspace-readonly" | "workspace";

export interface TrustRefusalEvidence {
  readonly workspaceRoot: string;
  readonly declaredTrust: WorkspaceRef["trust"];
  readonly requestedAccess: AccessLevel;
  readonly requestedScope?: ExecutionScope;
  readonly reason: string;
}

export class WorkspaceTrustError extends Error {
  constructor(
    public readonly workspace: WorkspaceRef,
    public readonly requestedAccess: AccessLevel,
    public readonly evidence: TrustRefusalEvidence
  ) {
    super(
      `workspace-trust runtime refusal: ${workspace.root} cannot ${requestedAccess} (trust=${workspace.trust})`
    );
  }
}

export interface RuntimeWorkspaceOp {
  readonly workspace: WorkspaceRef;
  readonly requestedAccess: AccessLevel;
  readonly requestedScope?: ExecutionScope;
}

export function assertWorkspaceTrust(op: RuntimeWorkspaceOp): void {
  const result = assertTrustedWorkspaceForGrantInline({
    workspace: op.workspace,
    requestedAccess: op.requestedAccess,
    ...(op.requestedScope !== undefined ? { requestedScope: op.requestedScope } : {})
  });

  if (!result.ok) {
    throw new WorkspaceTrustError(op.workspace, op.requestedAccess, result.evidence);
  }
}

function assertTrustedWorkspaceForGrantInline(input: {
  readonly workspace: WorkspaceRef;
  readonly requestedAccess: AccessLevel;
  readonly requestedScope?: ExecutionScope;
}): { readonly ok: true } | { readonly ok: false; readonly evidence: TrustRefusalEvidence } {
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
