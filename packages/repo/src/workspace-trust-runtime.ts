import {
  assertTrustedWorkspaceForGrant,
  type AccessLevel,
  type ExecutionScope,
  type TrustRefusalEvidence
} from "@protostar/authority";

import type { WorkspaceRef } from "./index.js";

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
  const result = assertTrustedWorkspaceForGrant({
    workspace: op.workspace,
    requestedAccess: op.requestedAccess,
    ...(op.requestedScope !== undefined ? { requestedScope: op.requestedScope } : {})
  });

  if (!result.ok) {
    throw new WorkspaceTrustError(op.workspace, op.requestedAccess, result.evidence);
  }
}
